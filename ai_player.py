"""AI decision engine — V5.0『零』· 黑市博弈版 · ULTRA-STRENGTHENED.

The ZeroBrain class implements a probabilistic belief tracker that monitors
opponent hand composition by elimination, then makes EV-optimal decisions
for ambush attack/defense, lockdown rank selection, and combo planning.
"""
import random
from collections import Counter
from game_state import (
    CARD_CONFIG, SCOREPAD_CONFIG, HAND_LIMIT, WIN_SCORE,
    SCORE_MULT, SEAL_LIMIT, INSTANT_PER_TURN,
    ANT_COLONY_MIN_F, AMBUSH_SECOND_COST, AMBUSH_MAX_PER_TURN,
    RED_KEYS, BLUE_KEYS, GREEN_KEYS,
    SACRIFICE_MAX_X, NO_AMBUSH_BEFORE_TURN,
    MARKET_DECK_GUARD, LOCKDOWN_BREAK_COST,
    PROPHET_COST, PROPHET_PEEK_HAND_MIN_DECK,
    BLUFF_TRUE_PENALTY, BLUFF_FALSE_PENALTY,
    RED_BID_MIN, RED_BID_MAX,
)


def _bv(card):
    if card == '瞬':
        return 5
    return CARD_CONFIG[card]['base_value']

AI_IDX = 1
RANK = {c: cfg['rank'] for c, cfg in CARD_CONFIG.items()}
BV = {c: cfg['base_value'] for c, cfg in CARD_CONFIG.items()}


# ═══════════════════════════════════════════════════════════════
# ZeroBrain — probabilistic belief tracker + EV optimizer
# ═══════════════════════════════════════════════════════════════
class ZeroBrain:
    """Singleton brain that tracks belief over opponent's hand and provides
    optimal-EV decisions for ambush, defense, lockdown."""

    def __init__(self):
        self._cached_room_id = None
        self._cached_turn = -1
        self._cached_phase = None
        self._cache = {}

    def _is_dark_market(self, room):
        try:
            return room._is_dark_market_turn()
        except Exception:
            return False

    def unseen_distribution(self, room, ai_idx):
        """Counter of cards that COULD be in {opp_hand, deck, hidden_market}.
        Subtracts everything we've directly seen."""
        full = Counter({c: cfg['count'] for c, cfg in CARD_CONFIG.items()})
        # My hand
        for c in room.players[ai_idx]['hand']:
            full[c] -= 1
        # Discard pile (visible)
        for c in room.discard_pile:
            full[c] -= 1
        # Visible market (only if not dark)
        if not self._is_dark_market(room):
            for c in room.market:
                full[c] -= 1
        # Lockdown cards (visible)
        for i in (0, 1):
            lc = room.players[i].get('lockdown_card')
            if lc:
                full[lc] -= 1
        # 突袭牌已从攻击方手牌打出，扣在桌上：既不在双方手牌也不在牌堆，必须从全牌池扣除
        atk = getattr(room, 'atk_card', None)
        if atk:
            full[atk] = max(0, full[atk] - 1)
        return full

    def opp_hand_distribution(self, room, ai_idx):
        """Expected count of each card in opp's hand (probabilistic)."""
        unseen = self.unseen_distribution(room, ai_idx)
        opp_size = len(room.players[1 - ai_idx]['hand'])
        total = sum(unseen.values())
        if total <= 0 or opp_size <= 0:
            return {c: 0.0 for c in unseen}
        return {c: unseen[c] * opp_size / total for c in unseen}

    # ── Ambush attack EV ──────────────────────────────
    def _attack_ev(self, atk_card, room, ai_idx):
        """Expected value of attacking with atk_card.
        Score units: roughly a card's BV equivalent.
        """
        from game_logic import compare_duel
        opp_dist = self.opp_hand_distribution(room, ai_idx)
        opp_size = len(room.players[1 - ai_idx]['hand'])
        if opp_size <= 0:
            return 0
        # Probability opp folds (modeled empirically; small hand → more fold chance)
        p_fold = 0.10 + max(0, 4 - opp_size) * 0.05  # 10%-25%
        # P(opp has 瞬)
        p_shun_in_hand = min(1.0, opp_dist.get('瞬', 0))  # expected count ~ probability when << 1
        # If we attack with A or B, opp very likely uses 瞬 to absorb
        p_shun_used = 0.0
        if atk_card == 'A':
            p_shun_used = min(0.85, p_shun_in_hand * 0.9)
        elif atk_card == 'B':
            p_shun_used = min(0.40, p_shun_in_hand * 0.5)

        ev = 0
        # Outcome 1: Fold
        ev += p_fold * 6.0  # +1 stolen card avg ~5 + free progression
        # Outcome 2: 瞬 absorbs (we lose atk to opp)
        atk_loss = BV.get(atk_card, 1) * 1.5
        ev += (1 - p_fold) * p_shun_used * (-atk_loss - 2)
        # Outcome 3: defend with non-shun card (over distribution)
        non_shun_total = sum(prob for c, prob in opp_dist.items() if c != '瞬')
        if non_shun_total <= 0:
            return ev
        p_real_defend = (1 - p_fold) * (1 - p_shun_used)
        for def_c, def_prob in opp_dist.items():
            if def_c == '瞬' or def_prob < 1e-6:
                continue
            cond = def_prob / non_shun_total
            full_p = p_real_defend * cond
            res = compare_duel(atk_card, def_c)
            outcome = 0
            if res == 1:
                # Atk wins: +1 draw + 1 steal
                outcome = 6.0
                if atk_card == 'A' and def_c != 'F':
                    outcome += 10  # +10 score bonus
                if atk_card == 'F' and def_c == 'A':
                    outcome += 9  # godslayer ~ valuable
            elif res == -1:
                outcome = -atk_loss
                if def_c == 'A' and atk_card != 'F':
                    outcome -= 6  # opp got +10
                if atk_card == 'A' and def_c != 'F':
                    outcome += 3  # consolation
                if def_c == 'F' and atk_card == 'A':
                    outcome -= 6  # opp gets godslayer marker
            else:
                # Tie: both discard
                outcome = -BV.get(atk_card, 1) * 0.6
            ev += full_p * outcome
        return ev

    def best_attack_card(self, room, ai_idx):
        """Pick the attack card with the highest EV. Return None to skip."""
        ai = room.players[ai_idx]
        eligible = [c for c in ai['hand'] if c != '瞬']
        if not eligible:
            return None
        # Avoid sacrificing combo-key cards: penalize if losing it would break a near-combo
        scored = []
        for c in set(eligible):
            ev = self._attack_ev(c, room, ai_idx)
            # Penalty: if removing this card breaks a near-combo (already in _card_value)
            keep_value = _card_value(c, ai['hand'], room, ai_idx)
            # Net EV = attack ev - opportunity cost of using card
            net = ev - keep_value * 0.10
            scored.append((c, net, ev))
        scored.sort(key=lambda x: x[1], reverse=True)
        best_card, best_net, best_ev = scored[0]
        # 更激进：微弱负期望值仍发动突袭抢节奏（「零」风格）
        if best_net < -1.2 and best_ev < 0.5:
            return None
        return best_card

    # ── Defense EV (uses real atk_card on server — perfect play) ───
    def best_defense_card(self, room, ai_idx, can_fold=True):
        """Decide fold vs defend (and if defend, with which card)."""
        from game_logic import compare_duel
        ai = room.players[ai_idx]
        opp = room.players[1 - ai_idx]
        opp_dist = self.opp_hand_distribution(room, ai_idx)
        # 服务器端防守阶段 room.atk_card 即真实攻击牌（客户端显示为 ?）
        atk_known = getattr(room, 'atk_card', None)
        if atk_known and atk_known != '瞬':
            atk_dist = {atk_known: 1.0}
            atk_total = 1.0
        else:
            atk_dist = {c: p for c, p in opp_dist.items() if c != '瞬'}
            atk_total = sum(atk_dist.values())
        if atk_total <= 0:
            return ('fold', None) if can_fold else None
        eligible = [c for c in ai['hand'] if c != '瞬']
        has_shun = '瞬' in ai['hand']

        if not eligible and not has_shun:
            return ('fold', None) if can_fold else None

        # EV(fold) = lose 1 random card to opp ~ -avg_card_value
        avg_my_card_val = sum(BV.get(c, 1) for c in ai['hand']) / max(1, len(ai['hand']))
        ev_fold = -avg_my_card_val * 1.2  # hidden card lost

        # Compute EV per defense card
        evs = {}
        # Special: 瞬 absorbs => +atk_card to hand, 瞬 to discard
        if has_shun:
            if atk_known and atk_known != '瞬':
                absorbed_value = BV.get(atk_known, 1)
                high_atk_prob = 1.0 if atk_known in ('A', 'B') else 0.0
            else:
                absorbed_value = sum(prob * BV.get(c, 1) for c, prob in atk_dist.items()) / max(atk_total, 1)
                high_atk_prob = (atk_dist.get('A', 0) + atk_dist.get('B', 0)) / max(atk_total, 1)
            ev_shun = absorbed_value * 1.6 - 4.5
            ev_shun += high_atk_prob * 6.0
            # 吸收 A 时战略价值极高
            if atk_known == 'A':
                ev_shun += 8.0
            evs['瞬'] = ev_shun

        for def_c in set(eligible):
            ev = 0
            for atk_c, atk_p in atk_dist.items():
                if atk_p < 1e-6:
                    continue
                p = atk_p / atk_total
                res = compare_duel(atk_c, def_c)
                if res == -1:
                    # Defender wins
                    out = 6.0
                    if def_c == 'A' and atk_c != 'F':
                        out += 10
                    if def_c == 'F' and atk_c == 'A':
                        out += 9
                    ev += p * out
                elif res == 1:
                    # Defender loses
                    out = -BV.get(def_c, 1) * 1.5
                    if atk_c == 'A' and def_c != 'F':
                        out -= 6
                    if def_c == 'A' and atk_c != 'F':
                        out += 3
                    if def_c == 'F' and atk_c == 'A':
                        out += 9  # we just won godslayer
                    ev += p * out
                else:
                    ev += p * (-BV.get(def_c, 1) * 0.6)
            # Subtract opportunity cost of using this card
            opp_cost = _card_value(def_c, ai['hand'], room, ai_idx) * 0.05
            ev -= opp_cost
            evs[def_c] = ev

        if not evs:
            return ('fold', None) if can_fold else None
        # Compare best defend EV vs fold EV
        best_def_card = max(evs, key=evs.get)
        best_def_ev = evs[best_def_card]
        # 已知攻击牌时更偏迎战（少用 fold）；信念防守时仍可怯战
        margin = 0.5 if atk_known else 1.0
        if can_fold and ev_fold > best_def_ev + margin:
            return ('fold', None)
        return ('defend', best_def_card)

    # ── Lockdown rank selection (predictive) ────────────────
    def best_lockdown_rank(self, room, ai_idx):
        """Identify the rank that maximally hurts opponent's projected combo."""
        opp = room.players[1 - ai_idx]
        opp_dist = self.opp_hand_distribution(room, ai_idx)
        # Predict opp's biggest reachable combo and find its key rank
        # Score for each rank-lock: how much opp's expected score drops
        rank_damage = {c: 0 for c in 'ABCDEF'}
        # Heuristic damage: each rank participates in:
        # A: arcane_sequence, dragon_breath_A, triple_A, alchemy
        # B-E: many combos
        # F: ant_colony, elemental_surge, dragon_F, triple_F
        # Estimate: most damaging = whichever rank has highest opp-expected-count among shared combos
        # Simpler: opp's most-held rank that's in a near-combo
        for rank in 'ABCDEF':
            count = opp_dist.get(rank, 0)
            # Damage if rank locks arcane (need ABCDE all)
            if rank in 'ABCDE':
                rank_damage[rank] += count * 12
            # Damage if rank locks elemental (need BCDEF all)
            if rank in 'BCDEF':
                rank_damage[rank] += count * 8
            # Damage if rank has 3+ same → triple/dragon
            if count >= 3:
                rank_damage[rank] += count * 8
            if count >= 5:
                rank_damage[rank] += 30  # likely dragon completion
            # F is also ant_colony key
            if rank == 'F' and count >= 3:
                rank_damage[rank] += count * 4
        ranked = sorted(rank_damage.items(), key=lambda x: x[1], reverse=True)
        return ranked[0][0]


_brain = ZeroBrain()


def get_brain():
    return _brain


def _scaled(raw):
    return int(raw * SCORE_MULT)


def _total_score(player):
    s = player['score']
    for combo in player['scorepad'].values():
        s += sum(combo['scores'])
    return s


def _slots_left(room, pidx, key):
    return room._slots_left(pidx, key)


def _total_sealed(pad):
    return sum(info['sealed'] for info in pad.values())


# ── Hand evaluation ──────────────────────────────────────
def _detect_playable(room, pidx):
    from scoring import detect_playable
    hand = room.players[pidx]['hand']
    slots_fn = lambda key: room._slots_left(pidx, key)
    return detect_playable(hand, slots_fn)


def _near_combos(hand, room, pidx):
    """Find combos close to completion. Returns (key, missing, score, needed_cards)."""
    ct = Counter(c for c in hand if c != '瞬')
    results = []

    def slots(k): return room._slots_left(pidx, k)

    if slots('dragon_breath') > 0:
        for c in ct:
            if ct[c] >= 3:
                sc = _scaled(40 + BV[c] * 5)
                results.append(('dragon_breath', 5 - ct[c], sc, [c] * (5 - ct[c])))
    if slots('arcane_sequence') > 0:
        needed = [c for c in 'ABCDE' if c not in ct]
        if len(needed) <= 2:
            results.append(('arcane_sequence', len(needed), _scaled(45), needed))
    if slots('elemental_surge') > 0:
        needed = [c for c in 'BCDEF' if c not in ct]
        if len(needed) <= 2:
            results.append(('elemental_surge', len(needed), _scaled(30), needed))
    if slots('chaos_alchemy') > 0:
        for c3 in ct:
            if ct[c3] >= 2:
                for c2 in ct:
                    if c2 != c3 and ct[c2] >= 1:
                        miss = max(0, 3 - ct[c3]) + max(0, 2 - ct[c2])
                        if miss <= 2:
                            cards = [c3] * 3 + [c2] * 2
                            sc = _scaled(20 + sum(BV[c] for c in cards))
                            results.append(('chaos_alchemy', miss, sc, []))
    if slots('triple_resonance') > 0:
        for c in ct:
            if ct[c] >= 2:
                sc = _scaled(10 + BV[c] * 3)
                results.append(('triple_resonance', 3 - ct[c], sc, [c] * (3 - ct[c])))
    if slots('ant_colony') > 0:
        f_cnt = ct.get('F', 0)
        miss = max(0, ANT_COLONY_MIN_F - f_cnt)
        if miss <= 2:
            results.append(('ant_colony', miss,
                            _scaled(max(f_cnt, ANT_COLONY_MIN_F) * 5), ['F'] * miss))
    return results


def _card_value(card, hand, room, pidx):
    """Value of keeping a card; higher = more important."""
    if card == '瞬':
        return 50
    ct = Counter(c for c in hand if c != '瞬')
    score = BV[card] * 2
    have = ct.get(card, 0)

    def slots(k): return room._slots_left(pidx, k)

    if have >= 4 and slots('dragon_breath') > 0:
        score += 40
    elif have >= 3:
        if slots('triple_resonance') > 0:
            score += 20
        if slots('dragon_breath') > 0:
            score += 15

    if card in 'ABCDE' and slots('arcane_sequence') > 0:
        needed = sum(1 for c in 'ABCDE' if c not in ct or (c == card and ct[c] == 1))
        if needed <= 2:
            score += 25 - needed * 5
    if card in 'BCDEF' and slots('elemental_surge') > 0:
        needed = sum(1 for c in 'BCDEF' if c not in ct or (c == card and ct[c] == 1))
        if needed <= 2:
            score += 18 - needed * 5

    if have >= 2 and slots('chaos_alchemy') > 0:
        for other in ct:
            if other != card and ct[other] >= 2:
                score += 12
                break

    if card == 'F':
        f_cnt = ct.get('F', 0)
        if f_cnt >= ANT_COLONY_MIN_F - 1 and slots('ant_colony') > 0:
            score += f_cnt * 3

    return score


def _expendability(card, hand, room, pidx):
    return 100 - _card_value(card, hand, room, pidx)


def _hand_strength(hand):
    return sum(BV[c] for c in hand if c != '瞬')


# ── Main decide ──────────────────────────────────────────
def decide(room):
    phase = room.phase
    ai = room.players[AI_IDX]
    opp = room.players[1 - AI_IDX]
    cp = room.current_player

    if phase == 'GAME_OVER':
        return None

    if phase == 'DRAW':
        if cp != AI_IDX:
            return None
        return ('DRAW_ACK', {})

    if phase == 'MARKET':
        if cp != AI_IDX:
            return None
        return _decide_market(ai, opp, room)

    if phase == 'LOCKDOWN_PLACE':
        if cp != AI_IDX:
            return None
        return _decide_lockdown_place(ai, opp, room)

    if phase == 'AMBUSH_DECIDE':
        if cp != AI_IDX:
            return None
        return _decide_ambush(ai, opp, room)

    if phase == 'AMBUSH_PAY_COST':
        if cp != AI_IDX:
            return None
        return _decide_pay_cost(ai, room)

    if phase == 'AMBUSH_ATK_SELECT':
        if cp != AI_IDX:
            return None
        return _decide_atk_select(ai, opp, room)

    if phase == 'AMBUSH_DEF_CHOICE':
        if cp == AI_IDX:
            return None
        return _decide_defend(ai, opp, room)

    if phase == 'SPELL':
        if cp != AI_IDX:
            return None
        return _decide_spell(ai, opp, room)

    if phase == 'AMBUSH_BLUFF_DECLARE':
        if cp != AI_IDX:
            return None
        return _decide_bluff_declare(ai, opp, room)

    if phase == 'AMBUSH_BLUFF_RESPOND':
        if cp == AI_IDX:
            return None
        return _decide_bluff_respond(ai, opp, room)

    if phase == 'PROPHET_DECK':
        if cp != AI_IDX:
            return None
        return ('PROPHET_DECK', {'discard_idx': None})

    if phase == 'RED_BID':
        return _decide_red_bid(ai, opp, room, AI_IDX)

    if phase == 'END_DISCARD':
        if cp != AI_IDX:
            return None
        return _decide_end_discard(ai, room)

    if phase == 'COLLISION_PRE_DISCARD':
        if room.col_pre_discard_done[AI_IDX]:
            return None
        return _decide_col_pre_discard(ai, opp, room)

    if phase == 'COLLISION_BET':
        return _decide_col_bet(ai, opp, room)

    if phase == 'COLLISION_ARRANGE':
        if room.col_arrange_done[AI_IDX]:
            return None
        return _decide_col_arrange(ai)

    if phase == 'COLLISION_FLIP':
        wf = room._col_waiting_for()
        if wf != AI_IDX:
            return None
        return ('COLLISION_FLIP', {})

    return None


# ── Market (V5) ──────────────────────────────────────────
def _decide_market(ai, opp, room):
    """Buy a card from market if it completes a near combo or is high-tempo."""
    market = room.market
    if not market or room.market_buy_done[AI_IDX]:
        return ('MARKET_SKIP', {})

    hand = ai['hand']
    ct = Counter(c for c in hand if c != '瞬')

    # Determine needs
    def slots(k): return room._slots_left(AI_IDX, k)
    needs_priority = {}
    if slots('arcane_sequence') > 0:
        for c in 'ABCDE':
            if c not in ct:
                needs_priority[c] = max(needs_priority.get(c, 0), 100 - 5 * sum(1 for x in 'ABCDE' if x not in ct))
    if slots('elemental_surge') > 0:
        for c in 'BCDEF':
            if c not in ct:
                needs_priority[c] = max(needs_priority.get(c, 0), 80 - 5 * sum(1 for x in 'BCDEF' if x not in ct))
    for c, n in ct.items():
        if c == '瞬':
            continue
        if n == 4 and slots('dragon_breath') > 0:
            needs_priority[c] = max(needs_priority.get(c, 0), 120)
        if n == 2 and slots('triple_resonance') > 0:
            needs_priority[c] = max(needs_priority.get(c, 0), 70)

    # Dark market: blind buy with reduced enthusiasm
    is_dark = room._is_dark_market_turn()

    best_idx = -1
    best_pri = -1
    for i, mc in enumerate(market):
        if is_dark:
            # 黑市：按未见牌池估计「随机一位」的期望完成度，比纯随机更敢买关键节奏
            unseen = _brain.unseen_distribution(room, AI_IDX)
            tot = sum(unseen.values())
            if tot > 0:
                ev_slot = sum(
                    unseen[c] / tot * (needs_priority.get(c, 0) + BV.get(c, 1) * 4)
                    for c in unseen if c != '瞬'
                )
            else:
                ev_slot = 18
            pri = int(ev_slot * 0.55 + random.uniform(6, 28))
        else:
            pri = needs_priority.get(mc, 0)
            if pri == 0:
                # Tempo bonuses: A/B for ambush leverage
                if mc == 'A':
                    pri = 50
                elif mc == 'B':
                    pri = 25
                elif mc == '瞬':
                    pri = 15
        if pri > best_pri:
            best_pri = pri
            best_idx = i

    if best_idx < 0 or best_pri < (14 if is_dark else 20):
        return ('MARKET_SKIP', {})

    if is_dark:
        return ('MARKET_BUY', {'market_idx': best_idx, 'payment': []})

    target = market[best_idx]
    target_v = _bv(target)

    sorted_hand = sorted(hand, key=lambda c: (c == '瞬', _bv(c)))
    payment = []
    total = 0
    for c in sorted_hand:
        if total >= target_v:
            break
        cv = _card_value(c, hand, room, AI_IDX)
        if cv >= 60 and total + _bv(c) > target_v + 4:
            continue
        payment.append(c)
        total += _bv(c)
    if total < target_v:
        return ('MARKET_SKIP', {})

    if total > target_v * 1.5 and best_pri < 70:
        return ('MARKET_SKIP', {})

    if len(hand) - len(payment) + 1 < 3:
        return ('MARKET_SKIP', {})

    return ('MARKET_BUY', {'market_idx': best_idx, 'payment': payment})


# ── Lockdown Placement (V5) ──────────────────────────────
def _decide_lockdown_place(ai, opp, room):
    """Predictive lockdown using ZeroBrain — lock the rank that maximally
    disrupts opponent's projected combo."""
    hand = ai['hand']
    if len(hand) <= 3:
        return ('LOCKDOWN_SKIP', {})

    my_total = _total_score(ai)
    opp_total = _total_score(opp)
    diff = my_total - opp_total

    # Don't lockdown when far behind (waste of card)
    if diff < -30:
        return ('LOCKDOWN_SKIP', {})

    # Use brain to find optimal target rank
    target_rank = _brain.best_lockdown_rank(room, AI_IDX)
    ct = Counter(c for c in hand if c != '瞬')

    # If we have the target rank, sacrifice 1 of it
    if ct.get(target_rank, 0) >= 1:
        # But protect combo-key cards
        # Only lock if we have spare of the rank (have ≥2) OR
        # we have low expendability cost
        if ct.get(target_rank, 0) >= 2:
            return ('LOCKDOWN_PLACE', {'card': target_rank})
        # Have only 1, check value
        if _card_value(target_rank, hand, room, AI_IDX) < 30:
            return ('LOCKDOWN_PLACE', {'card': target_rank})

    # Fall back: pick least valuable non-瞬 card if we have plenty of cards
    if len(hand) >= 6:
        eligible = [c for c in hand if c != '瞬']
        if eligible:
            rated = sorted(eligible, key=lambda c: _card_value(c, hand, room, AI_IDX))
            # Only place if expendability is high (low value loss)
            cheapest = rated[0]
            if _card_value(cheapest, hand, room, AI_IDX) < 25:
                return ('LOCKDOWN_PLACE', {'card': cheapest})

    return ('LOCKDOWN_SKIP', {})


# ── Ambush ───────────────────────────────────────────────
def _decide_ambush(ai, opp, room):
    """Decide to skip or attack (1st or 2nd ambush)."""
    hand = ai['hand']
    eligible = [c for c in hand if c != '瞬']

    if room.turn_number < NO_AMBUSH_BEFORE_TURN:
        return ('AMBUSH_DECIDE', {'choice': 'skip'})

    if not eligible or len(hand) <= 2:
        return ('AMBUSH_DECIDE', {'choice': 'skip'})

    if not opp['hand']:
        return ('AMBUSH_DECIDE', {'choice': 'skip'})

    # 2nd ambush cost gate
    is_second = room.ambush_count_this_turn >= 1
    if is_second:
        if len(hand) <= AMBUSH_SECOND_COST + 2:
            return ('AMBUSH_DECIDE', {'choice': 'skip'})
        # Only do 2nd if opp still has cards to steal
        if len(opp['hand']) < 3:
            return ('AMBUSH_DECIDE', {'choice': 'skip'})

    my_score = _total_score(ai)
    opp_score = _total_score(opp)
    diff = my_score - opp_score

    playable = _detect_playable(room, AI_IDX)
    if playable and playable[0][3] >= 25:
        # Would rather score
        return ('AMBUSH_DECIDE', {'choice': 'skip'})

    if diff > 35 and len(hand) <= 5:
        return ('AMBUSH_DECIDE', {'choice': 'skip'})

    # ZeroBrain EV check: only attack if we have positive-EV card
    best_atk = _brain.best_attack_card(room, AI_IDX)
    if best_atk is None:
        # No positive-EV attack available — skip
        return ('AMBUSH_DECIDE', {'choice': 'skip'})

    return ('AMBUSH_DECIDE', {'choice': 'attack'})


def _decide_pay_cost(ai, room):
    hand = ai['hand']
    rated = [(c, _card_value(c, hand, room, AI_IDX)) for c in hand]
    rated.sort(key=lambda x: x[1])
    to_discard = [c for c, _ in rated[:AMBUSH_SECOND_COST]]
    return ('AMBUSH_PAY_COST', {'cards': to_discard})


def _decide_atk_select(ai, opp, room):
    """Pick best attack card. Falls back to least-valuable non-瞬 if EV check
    returns negative (avoid infinite cancel loop)."""
    hand = ai['hand']
    eligible = [c for c in hand if c != '瞬']
    if not eligible:
        return ('AMBUSH_CANCEL', {})

    # ZeroBrain EV-based attack selection (probabilistic over opp hand)
    best = _brain.best_attack_card(room, AI_IDX)
    if best is None:
        # Fallback: pick most expendable non-A non-瞬 (avoid infinite loop)
        non_a = [c for c in eligible if c != 'A']
        pool = non_a if non_a else eligible
        pool.sort(key=lambda c: _expendability(c, hand, room, AI_IDX), reverse=True)
        best = pool[0]
    return ('AMBUSH_ATK_SELECT', {'card': best})


def _decide_defend(ai, opp, room):
    """AI defender — uses ZeroBrain EV calculation over attack distribution."""
    hand = ai['hand']
    eligible = [c for c in hand if c != '瞬']
    has_instant = '瞬' in hand

    # Fold when hand is very weak
    if not eligible and not has_instant:
        return ('AMBUSH_DEFEND', {'choice': 'fold'})

    # Check for combo emergency: if our hand has a near-completed big combo,
    # don't risk our cards
    near = _near_combos(hand, room, AI_IDX)
    high_value_near = [c for c in near if c[2] >= 80 and c[1] <= 1]
    if high_value_near and len(hand) <= 5:
        # Use 瞬 if available; else just fold to preserve combo
        if has_instant:
            return ('AMBUSH_DEFEND', {'choice': 'defend', 'card': '瞬'})
        return ('AMBUSH_DEFEND', {'choice': 'fold'})

    # Brain-based optimal decision
    decision = _brain.best_defense_card(room, AI_IDX, can_fold=True)
    if decision is None:
        return ('AMBUSH_DEFEND', {'choice': 'fold'})
    choice, card = decision
    if choice == 'fold':
        return ('AMBUSH_DEFEND', {'choice': 'fold'})
    return ('AMBUSH_DEFEND', {'choice': 'defend', 'card': card})


def _decide_defend_legacy(ai, opp, room):
    """Legacy defender (unused, kept for fallback)."""
    hand = ai['hand']
    eligible = [c for c in hand if c != '瞬']
    has_instant = '瞬' in hand
    atk_unknown = room.atk_card
    non_f = [c for c in eligible if c != 'F']
    if len(hand) <= 2 and not has_instant:
        return ('AMBUSH_DEFEND', {'choice': 'fold'})

    if not eligible and not has_instant:
        return ('AMBUSH_DEFEND', {'choice': 'fold'})

    # Use 瞬 if we have high-value hand to protect and likely target was high
    if has_instant:
        playable = _detect_playable(room, AI_IDX)
        if playable and playable[0][3] >= 30:
            return ('AMBUSH_DEFEND', {'choice': 'defend', 'card': '瞬'})

    if not eligible:
        return ('AMBUSH_DEFEND', {'choice': 'defend', 'card': '瞬'})

    # Blind defense heuristic: pick middle-rank card. Avoid A/B (combo pieces).
    non_high = [c for c in eligible if c not in ('A', 'B')]
    pool = non_high if non_high else eligible
    pool.sort(key=lambda c: RANK[c])  # low rank first (= higher strength)
    # Pick a mid-rank card
    mid_idx = max(0, len(pool) // 2 - 1)
    card = pool[mid_idx]
    return ('AMBUSH_DEFEND', {'choice': 'defend', 'card': card})


# ── Spell ────────────────────────────────────────────────
def _decide_spell(ai, opp, room):
    hand = ai['hand']
    pad = ai['scorepad']
    opp_pad = opp['scorepad']
    my_score = _total_score(ai)
    opp_score = _total_score(opp)
    opp_dist0 = _brain.opp_hand_distribution(room, AI_IDX)
    opp_pressure = opp_score + _estimate_opp_max_combo(opp_dist0, room) >= WIN_SCORE

    if ai['breaker_marks'] > 0:
        action = _decide_breaker(room, ai, opp)
        if action:
            return action

    playable = _detect_playable(room, AI_IDX)
    if playable:
        best = _pick_best_combo(playable, hand, room, ai, opp)
        if best:
            key, name, cards, score = best
            # V5: Check if this combo is lockdown'd by opponent
            opp_lock = opp.get('lockdown_card')
            if opp_lock and opp_lock != '瞬' and opp_lock in cards:
                # Decide break method
                if ai['breaker_marks'] > 0:
                    return ('SPELL_SCORE', {
                        'cards': cards, 'combo_key': key, 'break_lockdown': 'marker'
                    })
                # 强势 AI：更值得为中等分连招付 15 破锁
                if score >= (18 if (my_score + 30 >= WIN_SCORE or opp_pressure) else 22):
                    return ('SPELL_SCORE', {
                        'cards': cards, 'combo_key': key, 'break_lockdown': 'pay'
                    })
                # Else skip this combo, try next
                # Re-iterate to find one not blocked
                for entry in playable:
                    k2, n2, c2, s2 = entry
                    if not opp_lock in c2:
                        return ('SPELL_SCORE', {'cards': c2, 'combo_key': k2})
                # No alternative — fall through to other actions
            else:
                return ('SPELL_SCORE', {'cards': cards, 'combo_key': key})

    if '瞬' in hand and room.instant_count < INSTANT_PER_TURN:
        instant_action = _decide_instant(hand, room, ai, opp)
        if instant_action:
            return instant_action

    # Sacrifice only as late-game comeback
    sac = _decide_sacrifice(ai, opp, room)
    if sac:
        return sac

    # 先知低语: use late-game if not used, behind, and can afford
    if not ai.get('prophet_used', False):
        if my_score >= PROPHET_COST and opp_score - my_score >= 15:
            if len(room.deck) > PROPHET_PEEK_HAND_MIN_DECK:
                return ('PROPHET_WHISPER', {'choice': 'peek_hand'})
            else:
                return ('PROPHET_WHISPER', {'choice': 'peek_deck'})

    return ('SPELL_SKIP', {})


def _decide_breaker(room, ai, opp):
    """Use 1 breaker mark per call (will re-enter SPELL until marks exhausted)."""
    opp_pad = opp['scorepad']
    sealed_total = sum(info['sealed'] for info in opp_pad.values())
    can_seal = sealed_total < SEAL_LIMIT
    # Seal highest-value still-open slot (if can seal)
    if can_seal:
        for tier in (1, 2, 3):
            for cfg in SCOREPAD_CONFIG:
                if cfg['tier'] == tier and room._slots_left(1 - AI_IDX, cfg['key']) > 0:
                    return ('SPELL_BREAKER', {'type': 'seal', 'slot_key': cfg['key']})
    if not opp['curse_active']:
        return ('SPELL_BREAKER', {'type': 'curse'})
    return None


def _pick_best_combo(playable, hand, room, ai, opp):
    """Multi-turn lookahead combo selection.
    Considers: winning shot, red contention pressure, future combo potential,
    opponent's likely next combo, and lockdown risk."""
    my_score = _total_score(ai)
    opp_score = _total_score(opp)

    # 1) Immediate winning move = always take it
    winning = [p for p in playable if my_score + p[3] >= WIN_SCORE]
    if winning:
        return min(winning, key=lambda p: len(p[2]))

    # 2) Check opponent's potential winning combo from belief — if they could
    # win next turn, we MUST score now (even at cost) to gain ground first
    opp_dist = _brain.opp_hand_distribution(room, AI_IDX)
    opp_max_combo_estimate = _estimate_opp_max_combo(opp_dist, room)
    opp_pressure = opp_score + opp_max_combo_estimate >= WIN_SCORE

    # 3) Red contention — if opp could fill red and we have it, prioritize
    reds = [p for p in playable if p[0] in RED_KEYS]
    if reds and (opp_pressure or my_score >= WIN_SCORE * 0.4):
        return max(reds, key=lambda p: p[3])

    scored = []
    from scoring import detect_playable
    for key, name, cards, base in playable:
        remaining = list(hand)
        for c in cards:
            if c in remaining:
                remaining.remove(c)

        # Future combo potential (1 hand-state lookahead)
        slots_fn = lambda k: room._slots_left(AI_IDX, k)
        future = detect_playable(remaining, slots_fn)
        future_pot = future[0][3] if future else 0

        effective = base
        if ai['curse_active']:
            effective -= 10

        # Reward bonuses
        if key in RED_KEYS:
            effective += 18  # red punish opp = ~2 stolen cards from opp = ~10 BV value
        elif key in BLUE_KEYS or key in GREEN_KEYS:
            effective += 6  # +1 draw value

        # Penalty: playing tiny ant_colony when better is brewing
        if key == 'ant_colony' and len(cards) <= ANT_COLONY_MIN_F and len(room.deck) > 12:
            effective -= 12

        # Penalty: locked combo (opp's lockdown will charge us 15 to break)
        opp_lock = opp.get('lockdown_card')
        if opp_lock and opp_lock != '瞬' and opp_lock in cards:
            if ai['breaker_marks'] > 0:
                effective -= 2  # marker is cheap
            else:
                effective -= 16  # 15 score break + tempo loss

        # Bonus: opponent pressure — we need score NOW
        if opp_pressure:
            effective += 8

        total = effective + future_pot * 0.35
        scored.append((key, name, cards, base, total))

    scored.sort(key=lambda x: x[4], reverse=True)
    best = scored[0]
    # Don't waste tiny combo unless deck running out
    if best[3] < 14 and len(room.deck) > 18 and not opp_pressure:
        return None
    return (best[0], best[1], best[2], best[3])


def _estimate_opp_max_combo(opp_dist, room):
    """Quick estimate of biggest combo opp could form with their hand."""
    # Heuristic: take expected count and check biggest probable combo
    score = 0
    # Triple resonance: max(opp_dist[c] * 3) per c with count >= 3
    for c, cnt in opp_dist.items():
        if c == '瞬':
            continue
        if cnt >= 3:
            score = max(score, _scaled(10 + BV.get(c, 1) * 3))
        if cnt >= 5:
            score = max(score, _scaled(40 + BV.get(c, 1) * 5))
    # Arcane sequence
    if all(opp_dist.get(c, 0) >= 0.5 for c in 'ABCDE'):
        score = max(score, _scaled(45))
    # Elemental surge
    if all(opp_dist.get(c, 0) >= 0.5 for c in 'BCDEF'):
        score = max(score, _scaled(30))
    return score


def _decide_instant(hand, room, ai, opp):
    non_instant = [c for c in hand if c != '瞬']
    if not non_instant:
        return None
    playable = _detect_playable(room, AI_IDX)
    if playable and playable[0][3] >= 25:
        return None

    rated = [(c, _expendability(c, hand, room, AI_IDX)) for c in non_instant]
    rated.sort(key=lambda x: x[1], reverse=True)
    trash = [c for c, exp in rated if exp >= 65]

    if len(trash) < 2 and len(room.deck) > 10:
        return None
    discard_count = min(len(trash), 3) if trash else 0
    if discard_count == 0:
        if len(hand) >= 7:
            discard_count = 2
            trash = [c for c, _ in rated[:2]]
        else:
            return None
    to_discard = trash[:discard_count]
    return ('SPELL_INSTANT', {'discard_cards': to_discard})


def _decide_sacrifice(ai, opp, room):
    """V3.0 sacrifice: only use if we're losing AND have a low-score slot to sac + good recovery targets."""
    pad = ai['scorepad']
    my_score = _total_score(ai)
    opp_score = _total_score(opp)
    if opp_score - my_score < 20:
        return None  # Not desperate enough

    # Find a sacrificed slot: the *lowest* scoring one
    candidates = []
    for cfg in SCOREPAD_CONFIG:
        info = pad[cfg['key']]
        for i, sc in enumerate(info['scores']):
            candidates.append((cfg['key'], i, sc))
    if not candidates:
        return None
    # Sacrifice the lowest scoring slot (least loss)
    candidates.sort(key=lambda x: x[2])
    slot_key, score_idx, lost = candidates[0]

    # Find window discards worth picking
    window = room._sacrifice_window()
    if len(window) < 2:
        return None
    # Rate each card by value if added to our hand
    hand = ai['hand']
    rated_recovery = sorted(
        [(idx, c, _card_value(c, hand + [c], room, AI_IDX)) for idx, c in window],
        key=lambda x: x[2], reverse=True
    )
    # Only worth it if top recovery value >= 20
    if rated_recovery[0][2] < 20:
        return None

    x = min(SACRIFICE_MAX_X, len(rated_recovery),
            len([c for c in hand if _card_value(c, hand, room, AI_IDX) < 15]))
    if x < 1:
        return None

    recover_indices = [r[0] for r in rated_recovery[:x]]

    # Pick x cards from hand to discard (lowest value)
    rated_discard = sorted(hand, key=lambda c: _card_value(c, hand, room, AI_IDX))
    discard_cards = rated_discard[:x]

    # Only worth it if net value gain > lost score
    recovery_value = sum(r[2] for r in rated_recovery[:x])
    if recovery_value < lost + 20:
        return None

    return ('SPELL_SACRIFICE', {
        'slot_key': slot_key,
        'score_idx': score_idx,
        'discard_cards': discard_cards,
        'recover_indices': recover_indices,
    })


# ── End Discard ──────────────────────────────────────────
def _decide_end_discard(ai, room):
    from game_logic import hand_overflow
    hand = ai['hand']
    overflow = hand_overflow(hand)
    if overflow <= 0:
        return None
    rated = sorted(hand, key=lambda c: _card_value(c, hand, room, AI_IDX))
    return ('END_DISCARD', {'cards': rated[:overflow]})


# ── Collision ─────────────────────────────────────────────
def _decide_col_pre_discard(ai, opp, room):
    hand = ai['hand']
    must = room._col_must_discard(AI_IDX)
    if must > 0:
        rated = sorted(hand, key=lambda c: _card_value(c, hand, room, AI_IDX))
        return ('COLLISION_PRE_DISCARD', {'cards': rated[:must]})

    weak = [c for c in hand if c in ('E', 'F') and c != '瞬']
    ct = Counter(c for c in hand if c != '瞬')
    orphan = [c for c in weak if ct[c] == 1 and BV[c] <= 2]
    if len(orphan) >= 2:
        return ('COLLISION_PRE_DISCARD', {'cards': orphan[:2]})
    if len(orphan) == 1:
        return ('COLLISION_PRE_DISCARD', {'cards': orphan[:1]})
    return ('COLLISION_PRE_DISCARD', {'cards': []})


def _decide_col_bet(ai, opp, room):
    if room.col_bet_phase == 'CALLER' and room.col_bet_caller != AI_IDX:
        return None
    if room.col_bet_phase == 'RESPONDER' and room.col_bet_caller == AI_IDX:
        return None

    my_score = _total_score(ai)
    opp_score = _total_score(opp)
    diff = my_score - opp_score
    my_strength = _hand_strength(ai['hand'])
    opp_hand_count = max(1, len(opp['hand']))
    shun_bonus = ai['hand'].count('瞬') * 5
    momentum = my_strength + shun_bonus

    if room.col_bet_phase == 'CALLER':
        if diff < -25 and momentum >= opp_hand_count * 2.2:
            return ('COLLISION_BET', {'amount': 20})
        if diff < -12:
            return ('COLLISION_BET', {'amount': 10})
        if diff < 5 and momentum >= opp_hand_count * 2.7:
            return ('COLLISION_BET', {'amount': 10})
        return ('COLLISION_BET', {'amount': 0})
    bet = room.col_bet_amount
    if diff > bet + 8:
        return ('COLLISION_BET', {'choice': 'fold'})
    if momentum >= opp_hand_count * 2.2:
        return ('COLLISION_BET', {'choice': 'follow'})
    if diff < -12:
        return ('COLLISION_BET', {'choice': 'follow'})
    if bet == 10 and diff >= -8:
        return ('COLLISION_BET', {'choice': 'follow'})
    return ('COLLISION_BET', {'choice': 'fold'})


def _decide_col_arrange(ai):
    """AI arranges cards for collision — shuffle randomly."""
    hand = list(ai['hand'])
    random.shuffle(hand)
    return ('COLLISION_ARRANGE', {'order': hand})


# ── Delay ────────────────────────────────────────────────
DELAY = {
    'BLUFF_DECLARE': (0.4, 0.8),
    'BLUFF_RESPOND': (0.4, 0.8),
    'PROPHET_WHISPER': (0.5, 0.9),
    'PROPHET_DECK': (0.3, 0.5),
    'RED_BID': (0.6, 1.0),
    'DRAW_ACK': (0.15, 0.3),
    'MARKET_BUY': (0.4, 0.7),
    'MARKET_SKIP': (0.15, 0.3),
    'AMBUSH_DECIDE': (0.3, 0.5),
    'AMBUSH_PAY_COST': (0.25, 0.4),
    'AMBUSH_ATK_SELECT': (0.3, 0.5),
    'AMBUSH_DEFEND': (0.3, 0.55),
    'AMBUSH_CANCEL': (0.15, 0.25),
    'SPELL_SCORE': (0.35, 0.65),
    'SPELL_INSTANT': (0.3, 0.5),
    'SPELL_SACRIFICE': (0.4, 0.7),
    'SPELL_BREAKER': (0.3, 0.5),
    'SPELL_SKIP': (0.15, 0.3),
    'END_DISCARD': (0.2, 0.35),
    'LOCKDOWN_PLACE': (0.35, 0.6),
    'LOCKDOWN_SKIP': (0.15, 0.3),
    'COLLISION_PRE_DISCARD': (0.3, 0.5),
    'COLLISION_BET': (0.4, 0.7),
    'COLLISION_ARRANGE': (0.4, 0.7),
    'COLLISION_FLIP': (0.15, 0.3),
}


def get_delay(action):
    lo, hi = DELAY.get(action, (0.3, 0.6))
    return random.uniform(lo, hi)


# ── Bluff Call (虚实之言) ─────────────────────────────
def _decide_bluff_declare(ai, opp, room):
    """AI rarely bluffs; when it does, picks a high-impact fake rank."""
    hand = ai['hand']
    true_card = room.atk_card
    if not true_card:
        return ('BLUFF_DECLARE', {'declared_rank': 'none'})
    # Bluff ~30% of the time — declare a high-rank card to intimidate
    if random.random() < 0.30:
        # Pick a rank other than true (most threatening = A)
        fakes = [c for c in 'ABCDEF' if c != true_card]
        # Bias toward A/B for intimidation
        weighted = ['A', 'A', 'B'] + fakes
        declared = random.choice(weighted)
        return ('BLUFF_DECLARE', {'declared_rank': declared})
    # Sometimes tell truth (to build credibility or if true card is strong)
    if true_card in ('A', 'B') and random.random() < 0.50:
        return ('BLUFF_DECLARE', {'declared_rank': true_card})
    return ('BLUFF_DECLARE', {'declared_rank': 'none'})


def _decide_bluff_respond(ai, opp, room):
    """AI decides whether to call bluff based on declared rank vs expected distribution."""
    declared = room.bluff_declared_rank
    if declared is None:
        return ('BLUFF_RESPOND', {'choice': 'believe'})
    # Use belief distribution to estimate P(declaration is true)
    unseen = _brain.unseen_distribution(room, AI_IDX)
    total = max(1, sum(unseen.values()))
    atk_dist = _brain.opp_hand_distribution(room, AI_IDX)
    # Probability that the declared rank was the real attack card
    p_true = (atk_dist.get(declared, 0) / max(1, sum(v for k, v in atk_dist.items() if k != '瞬')))
    # Call when we're fairly confident it's a bluff (p_true < 0.35)
    # and the penalty for being wrong (BLUFF_CALL_PENALTY = 10) is acceptable
    my_score = _total_score(ai)
    call_threshold = 0.35 if my_score >= 20 else 0.25  # more cautious when losing
    if p_true < call_threshold:
        return ('BLUFF_RESPOND', {'choice': 'call'})
    return ('BLUFF_RESPOND', {'choice': 'believe'})


# ── Red Zone Bid (红区暗标拍卖) ────────────────────────
def _decide_red_bid(ai, opp, room, ai_idx):
    if room.red_bid_done[ai_idx]:
        return None
    hand = ai['hand']
    my_score = _total_score(ai)
    opp_score = _total_score(opp)
    # Bid more when behind or the red zone score is critical
    trigger_score = room.red_bid_trigger_score
    diff = my_score - opp_score
    # Estimate how many cards to bid (1-3)
    # Bid aggressively if behind or if red zone is worth a lot
    if diff < -20 or trigger_score >= 50:
        n_bid = RED_BID_MAX
    elif diff < 0 or trigger_score >= 30:
        n_bid = 2
    else:
        n_bid = RED_BID_MIN
    n_bid = min(n_bid, len(hand), RED_BID_MAX)
    n_bid = max(n_bid, RED_BID_MIN)
    # Bid lowest-value cards first (preserve combo pieces)
    eligible = sorted(hand, key=lambda c: BV.get(c, 1))
    bid_cards = eligible[:n_bid]
    return ('RED_BID', {'cards': bid_cards})
