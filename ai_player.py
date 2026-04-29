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
    """Enhanced value estimation of keeping a card.
    Considers combo potential, ambush utility, collision strength, and synergy."""
    if card == '瞬':
        return 55  # Very valuable: ambush absorb + collision tie-forcing
    ct = Counter(c for c in hand if c != '瞬')
    score = BV[card] * 2.5  # Base value slightly higher
    have = ct.get(card, 0)

    def slots(k): return room._slots_left(pidx, k)

    # Dragon breath potential
    if have >= 4 and slots('dragon_breath') > 0:
        score += 50
    elif have >= 3 and slots('dragon_breath') > 0:
        score += 25
    elif have >= 3 and slots('triple_resonance') > 0:
        score += 22

    # Arcane sequence (ABCDE)
    if card in 'ABCDE' and slots('arcane_sequence') > 0:
        present = sum(1 for c in 'ABCDE' if c in ct)
        if present >= 3:
            score += 30 - (5 - present) * 5
        elif present >= 2:
            score += 12

    # Elemental surge (BCDEF)
    if card in 'BCDEF' and slots('elemental_surge') > 0:
        present = sum(1 for c in 'BCDEF' if c in ct)
        if present >= 3:
            score += 22 - (5 - present) * 4
        elif present >= 2:
            score += 8

    # Chaos alchemy (3+2)
    if have >= 2 and slots('chaos_alchemy') > 0:
        for other in ct:
            if other != card and ct[other] >= 2:
                score += 15
                break
        if have >= 3:
            for other in ct:
                if other != card and ct[other] >= 1:
                    score += 12
                    break

    # Ant colony
    if card == 'F':
        f_cnt = ct.get('F', 0)
        if f_cnt >= ANT_COLONY_MIN_F - 1 and slots('ant_colony') > 0:
            score += f_cnt * 4

    # Ambush utility: A is great for attacking, high-rank cards are strong
    if card == 'A':
        score += 10  # Top ambush card
    elif card == 'B':
        score += 5

    # Collision value: high BV cards win collision rounds
    deck_left = len(room.deck) if hasattr(room, 'deck') else 20
    if deck_left <= 12:
        score += BV[card] * 2  # Cards become more valuable near endgame

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
    """Aggressive market strategy. Dark market = always take (it's free).
    Regular market = buy if it completes combos or is high-tempo."""
    market = room.market
    if not market or room.market_buy_done[AI_IDX]:
        return ('MARKET_SKIP', {})

    hand = ai['hand']
    ct = Counter(c for c in hand if c != '瞬')
    is_dark = room._is_dark_market_turn()
    my_score = _total_score(ai)
    opp_score = _total_score(opp)

    def slots(k): return room._slots_left(AI_IDX, k)

    # Build priority map for each card type
    needs_priority = {}
    # Arcane sequence (ABCDE) — highest value combo
    if slots('arcane_sequence') > 0:
        missing = [c for c in 'ABCDE' if c not in ct]
        arc_heat = max(0, 100 - 10 * len(missing))
        for c in 'ABCDE':
            if c not in ct:
                needs_priority[c] = max(needs_priority.get(c, 0), arc_heat)
    # Elemental surge (BCDEF)
    if slots('elemental_surge') > 0:
        missing = [c for c in 'BCDEF' if c not in ct]
        ele_heat = max(0, 85 - 10 * len(missing))
        for c in 'BCDEF':
            if c not in ct:
                needs_priority[c] = max(needs_priority.get(c, 0), ele_heat)
    # Dragon breath (5 of a kind)
    for c, n in ct.items():
        if c == '瞬': continue
        if n >= 3 and slots('dragon_breath') > 0:
            needs_priority[c] = max(needs_priority.get(c, 0), 60 + n * 25)
        if n == 2 and slots('triple_resonance') > 0:
            needs_priority[c] = max(needs_priority.get(c, 0), 65)
    # Chaos alchemy (3+2) — need more of existing pairs/triples
    if slots('chaos_alchemy') > 0:
        for c, n in ct.items():
            if c == '瞬': continue
            if n >= 2:
                needs_priority[c] = max(needs_priority.get(c, 0), 55 + n * 8)
    # Ant colony (need F)
    if slots('ant_colony') > 0:
        f_cnt = ct.get('F', 0)
        if f_cnt >= 1:
            needs_priority['F'] = max(needs_priority.get('F', 0), 40 + f_cnt * 12)
    # General card value: A/B always useful for ambush
    needs_priority['A'] = max(needs_priority.get('A', 0), 55)
    needs_priority['B'] = max(needs_priority.get('B', 0), 30)
    needs_priority['瞬'] = max(needs_priority.get('瞬', 0), 40)

    # Dark market: FREE pick — always take the best expected value
    if is_dark:
        unseen = _brain.unseen_distribution(room, AI_IDX)
        tot = sum(unseen.values())
        best_idx = -1
        best_ev = -1
        for i in range(len(market)):
            if tot > 0:
                ev = sum(
                    unseen[c] / tot * (needs_priority.get(c, 0) + BV.get(c, 1) * 5)
                    for c in unseen if c != '瞬'
                )
            else:
                ev = 25
            ev += random.uniform(0, 10)
            if ev > best_ev:
                best_ev = ev
                best_idx = i
        if best_idx >= 0:
            return ('MARKET_BUY', {'market_idx': best_idx, 'payment': []})
        return ('MARKET_BUY', {'market_idx': 0, 'payment': []})

    # Regular market: evaluate each card
    best_idx = -1
    best_pri = -1
    for i, mc in enumerate(market):
        pri = needs_priority.get(mc, BV.get(mc, 1) * 3)
        # Urgency bonus when behind
        if opp_score - my_score > 20:
            pri += 15
        # Late game bonus — need combos NOW
        if len(room.deck) <= 15:
            pri += 10
        if pri > best_pri:
            best_pri = pri
            best_idx = i

    if best_idx < 0 or best_pri < 15:
        return ('MARKET_SKIP', {})

    target = market[best_idx]
    target_v = _bv(target)

    # Choose payment: sacrifice least valuable cards
    sorted_hand = sorted(hand, key=lambda c: _card_value(c, hand, room, AI_IDX))
    payment = []
    total = 0
    for c in sorted_hand:
        if total >= target_v:
            break
        cv = _card_value(c, hand, room, AI_IDX)
        if cv >= 55 and best_pri < 90:
            continue
        payment.append(c)
        total += _bv(c)
    if total < target_v:
        return ('MARKET_SKIP', {})

    # Don't overpay unless the card is critical
    if total > target_v * 1.6 and best_pri < 60:
        return ('MARKET_SKIP', {})
    # Keep at least 2 cards after buying
    if len(hand) - len(payment) + 1 < 2:
        return ('MARKET_SKIP', {})

    return ('MARKET_BUY', {'market_idx': best_idx, 'payment': payment})


# ── Lockdown Placement (V5) ──────────────────────────────
def _decide_lockdown_place(ai, opp, room):
    """Aggressive predictive lockdown. Uses ZeroBrain to identify the rank
    that will most disrupt opponent's combo potential."""
    hand = ai['hand']
    if len(hand) <= 2:
        return ('LOCKDOWN_SKIP', {})

    my_total = _total_score(ai)
    opp_total = _total_score(opp)
    diff = my_total - opp_total

    # Don't lockdown when very far behind AND hand is tiny (every card matters)
    if diff < -40 and len(hand) <= 3:
        return ('LOCKDOWN_SKIP', {})

    target_rank = _brain.best_lockdown_rank(room, AI_IDX)
    ct = Counter(c for c in hand if c != '瞬')

    # Try to place the target rank card
    if ct.get(target_rank, 0) >= 1:
        if ct.get(target_rank, 0) >= 2:
            return ('LOCKDOWN_PLACE', {'card': target_rank})
        if _card_value(target_rank, hand, room, AI_IDX) < 35:
            return ('LOCKDOWN_PLACE', {'card': target_rank})

    # If we're ahead or even, proactively lock with a cheap card
    if diff >= -10 and len(hand) >= 4:
        eligible = [c for c in hand if c != '瞬']
        if eligible:
            rated = sorted(eligible, key=lambda c: _card_value(c, hand, room, AI_IDX))
            cheapest = rated[0]
            if _card_value(cheapest, hand, room, AI_IDX) < 30:
                return ('LOCKDOWN_PLACE', {'card': cheapest})

    # Behind but opponent is building big combos — disrupt
    opp_dist = _brain.opp_hand_distribution(room, AI_IDX)
    opp_max = _estimate_opp_max_combo(opp_dist, room)
    if opp_max >= 25 and len(hand) >= 4:
        eligible = [c for c in hand if c != '瞬']
        if eligible:
            rated = sorted(eligible, key=lambda c: _card_value(c, hand, room, AI_IDX))
            cheapest = rated[0]
            if _card_value(cheapest, hand, room, AI_IDX) < 35:
                return ('LOCKDOWN_PLACE', {'card': cheapest})

    return ('LOCKDOWN_SKIP', {})


# ── Ambush ───────────────────────────────────────────────
def _decide_ambush(ai, opp, room):
    """Aggressive ambush strategy. Attack whenever EV is positive,
    and also when we need tempo or to disrupt opponent's combo building."""
    hand = ai['hand']
    eligible = [c for c in hand if c != '瞬']

    if room.turn_number < NO_AMBUSH_BEFORE_TURN:
        return ('AMBUSH_DECIDE', {'choice': 'skip'})

    if not eligible or len(hand) <= 2:
        return ('AMBUSH_DECIDE', {'choice': 'skip'})

    if not opp['hand']:
        return ('AMBUSH_DECIDE', {'choice': 'skip'})

    is_second = room.ambush_count_this_turn >= 1
    if is_second:
        if len(hand) <= AMBUSH_SECOND_COST + 2:
            return ('AMBUSH_DECIDE', {'choice': 'skip'})
        if len(opp['hand']) < 2:
            return ('AMBUSH_DECIDE', {'choice': 'skip'})

    my_score = _total_score(ai)
    opp_score = _total_score(opp)
    diff = my_score - opp_score

    # Check if we have a big combo ready — if so, score it instead
    playable = _detect_playable(room, AI_IDX)
    if playable and playable[0][3] >= 35:
        return ('AMBUSH_DECIDE', {'choice': 'skip'})

    # Very far ahead with small hand — no need to risk
    if diff > 45 and len(hand) <= 4:
        return ('AMBUSH_DECIDE', {'choice': 'skip'})

    # ZeroBrain EV check
    best_atk = _brain.best_attack_card(room, AI_IDX)
    if best_atk is not None:
        return ('AMBUSH_DECIDE', {'choice': 'attack'})

    # Even without positive EV, attack to disrupt if opponent is building something big
    opp_dist = _brain.opp_hand_distribution(room, AI_IDX)
    opp_max = _estimate_opp_max_combo(opp_dist, room)
    if opp_max >= 30 and len(eligible) >= 3 and not is_second:
        return ('AMBUSH_DECIDE', {'choice': 'attack'})

    # Attack when behind to disrupt opponent's tempo
    if diff < -15 and len(eligible) >= 3 and len(opp['hand']) >= 4 and not is_second:
        return ('AMBUSH_DECIDE', {'choice': 'attack'})

    return ('AMBUSH_DECIDE', {'choice': 'skip'})


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
    """Aggressive AI defender — fights back instead of folding.
    Uses ZeroBrain EV calculation and considers combo preservation."""
    hand = ai['hand']
    eligible = [c for c in hand if c != '瞬']
    has_instant = '瞬' in hand

    if not eligible and not has_instant:
        return ('AMBUSH_DEFEND', {'choice': 'fold'})

    # Known attack card (server has it)
    atk_known = getattr(room, 'atk_card', None)

    # If we have 瞬 and the attack is A/B (high value), always absorb
    if has_instant and atk_known in ('A', 'B'):
        return ('AMBUSH_DEFEND', {'choice': 'defend', 'card': '瞬'})

    # Check for combo emergency: near-completed big combo
    near = _near_combos(hand, room, AI_IDX)
    high_value_near = [c for c in near if c[2] >= 70 and c[1] <= 1]

    # If we know the attack card, pick the optimal counter
    if atk_known and eligible:
        from game_logic import compare_duel
        # Find cards that beat the attack
        winners = [c for c in set(eligible) if compare_duel(atk_known, c) == -1]
        if winners:
            # Pick the cheapest winner (preserve valuable cards)
            winners.sort(key=lambda c: _card_value(c, hand, room, AI_IDX))
            return ('AMBUSH_DEFEND', {'choice': 'defend', 'card': winners[0]})

        # No winner available — use 瞬 if attack is valuable
        if has_instant and BV.get(atk_known, 0) >= 4:
            return ('AMBUSH_DEFEND', {'choice': 'defend', 'card': '瞬'})

        # If near-combo and hand is small, fold to preserve
        if high_value_near and len(hand) <= 4:
            if has_instant:
                return ('AMBUSH_DEFEND', {'choice': 'defend', 'card': '瞬'})
            return ('AMBUSH_DEFEND', {'choice': 'fold'})

        # Tie cards (same rank) — use expendable one to force tie
        tie_cards = [c for c in set(eligible) if compare_duel(atk_known, c) == 0]
        if tie_cards:
            tie_cards.sort(key=lambda c: _card_value(c, hand, room, AI_IDX))
            return ('AMBUSH_DEFEND', {'choice': 'defend', 'card': tie_cards[0]})

    # Brain-based optimal decision (when attack card is uncertain)
    decision = _brain.best_defense_card(room, AI_IDX, can_fold=True)
    if decision is None:
        return ('AMBUSH_DEFEND', {'choice': 'fold'})
    choice, card = decision
    if choice == 'fold':
        # Even when brain says fold, fight back if we have 瞬
        if has_instant and len(opp['hand']) >= 3:
            return ('AMBUSH_DEFEND', {'choice': 'defend', 'card': '瞬'})
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
    """Enhanced spell phase: smarter combo selection, more aggressive prophet/instant use."""
    hand = ai['hand']
    pad = ai['scorepad']
    opp_pad = opp['scorepad']
    my_score = _total_score(ai)
    opp_score = _total_score(opp)
    opp_dist0 = _brain.opp_hand_distribution(room, AI_IDX)
    opp_max = _estimate_opp_max_combo(opp_dist0, room)
    opp_pressure = opp_score + opp_max >= WIN_SCORE
    deck_left = len(room.deck)

    # Breaker marks: use them first
    if ai['breaker_marks'] > 0:
        action = _decide_breaker(room, ai, opp)
        if action:
            return action

    # Try to play combos
    playable = _detect_playable(room, AI_IDX)
    if playable:
        best = _pick_best_combo(playable, hand, room, ai, opp)
        if best:
            key, name, cards, score = best
            opp_lock = opp.get('lockdown_card')
            if opp_lock and opp_lock != '瞬' and opp_lock in cards:
                if ai['breaker_marks'] > 0:
                    return ('SPELL_SCORE', {
                        'cards': cards, 'combo_key': key, 'break_lockdown': 'marker'
                    })
                # More aggressive lockdown breaking: pay if combo is worth it
                break_threshold = 15 if (opp_pressure or my_score + score >= WIN_SCORE) else 20
                if score >= break_threshold:
                    return ('SPELL_SCORE', {
                        'cards': cards, 'combo_key': key, 'break_lockdown': 'pay'
                    })
                # Try alternatives
                for entry in playable:
                    k2, n2, c2, s2 = entry
                    if opp_lock not in c2:
                        return ('SPELL_SCORE', {'cards': c2, 'combo_key': k2})
            else:
                return ('SPELL_SCORE', {'cards': cards, 'combo_key': key})

    # Instant usage: more aggressive hand cycling
    if '瞬' in hand and room.instant_count < INSTANT_PER_TURN:
        instant_action = _decide_instant(hand, room, ai, opp)
        if instant_action:
            return instant_action

    # Sacrifice for comeback
    sac = _decide_sacrifice(ai, opp, room)
    if sac:
        return sac

    # Prophet's Whisper: use proactively, not just when behind
    if not ai.get('prophet_used', False) and my_score >= PROPHET_COST:
        should_peek = False
        # Use when behind
        if opp_score - my_score >= 10:
            should_peek = True
        # Use proactively in mid-game to gain info advantage
        if deck_left >= 15 and deck_left <= 35 and my_score >= 15:
            should_peek = True
        # Use when opponent has big hand (they're building something)
        if len(opp['hand']) >= 6:
            should_peek = True
        # Use when we need info for ambush/lockdown decisions
        if deck_left <= 20 and not should_peek and opp_score >= my_score:
            should_peek = True

        if should_peek:
            if len(room.deck) > PROPHET_PEEK_HAND_MIN_DECK:
                return ('PROPHET_WHISPER', {'choice': 'peek_hand'})
            elif len(room.deck) > 0:
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
    """Advanced multi-turn lookahead combo selection with opponent modeling.
    Considers: winning shot, red contention pressure, future combo potential,
    opponent's likely next combo, lockdown risk, and tempo advantage."""
    my_score = _total_score(ai)
    opp_score = _total_score(opp)
    deck_left = len(room.deck)

    # 1) Immediate winning move = always take it (pick cheapest card cost)
    winning = [p for p in playable if my_score + p[3] >= WIN_SCORE]
    if winning:
        return min(winning, key=lambda p: len(p[2]))

    # 2) Opponent threat analysis
    opp_dist = _brain.opp_hand_distribution(room, AI_IDX)
    opp_max_combo_estimate = _estimate_opp_max_combo(opp_dist, room)
    opp_pressure = opp_score + opp_max_combo_estimate >= WIN_SCORE
    opp_close = opp_score >= WIN_SCORE * 0.7

    # 3) Red zone priority — if we have red combos, ALWAYS prioritize them
    reds = [p for p in playable if p[0] in RED_KEYS]
    if reds:
        best_red = max(reds, key=lambda p: p[3])
        if opp_pressure or my_score >= WIN_SCORE * 0.3 or best_red[3] >= 30:
            return best_red

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

        # === Reward multipliers ===
        if key in RED_KEYS:
            effective += 22  # red zone punishes opponent AND gives big score
        elif key in BLUE_KEYS:
            effective += 8
        elif key in GREEN_KEYS:
            effective += 6

        # Tempo bonus for scoring early (score differential advantage)
        if my_score < opp_score:
            effective += min(12, (opp_score - my_score) * 0.3)

        # Late-game urgency: score NOW
        if deck_left <= 12:
            effective += 10
        if deck_left <= 6:
            effective += 15

        # High-value combo bonus (dragon/arcane are game-changers)
        if base >= 40:
            effective += 8

        # Penalty: ant_colony too small early
        if key == 'ant_colony' and len(cards) <= ANT_COLONY_MIN_F and deck_left > 12:
            effective -= 8

        # Penalty: locked combo (opp's lockdown)
        opp_lock = opp.get('lockdown_card')
        if opp_lock and opp_lock != '瞬' and opp_lock in cards:
            if ai['breaker_marks'] > 0:
                effective -= 2
            else:
                effective -= 14

        # Opponent pressure — we MUST score NOW or they win
        if opp_pressure:
            effective += 12
        elif opp_close:
            effective += 6

        # Future value weighting: more weight if we have many cards left
        future_weight = 0.4 if len(remaining) >= 4 else 0.2
        total = effective + future_pot * future_weight
        scored.append((key, name, cards, base, total))

    scored.sort(key=lambda x: x[4], reverse=True)
    best = scored[0]
    # Lower threshold for scoring: even small combos help maintain tempo
    min_score_threshold = 10 if (deck_left <= 15 or opp_pressure or opp_close) else 12
    if best[3] < min_score_threshold and deck_left > 18 and not opp_pressure:
        return None
    return (best[0], best[1], best[2], best[3])


def _estimate_opp_max_combo(opp_dist, room):
    """Comprehensive estimate of biggest combo opponent could form.
    Uses expected card counts to assess multiple combo types."""
    best = 0
    # Dragon breath (5 of a kind)
    for c, cnt in opp_dist.items():
        if c == '瞬': continue
        if cnt >= 4.5:
            best = max(best, _scaled(40 + BV.get(c, 1) * 5))
        elif cnt >= 3.5:
            best = max(best, _scaled(40 + BV.get(c, 1) * 5) * 0.6)
        # Triple resonance
        if cnt >= 2.5:
            best = max(best, _scaled(10 + BV.get(c, 1) * 3))

    # Arcane sequence (ABCDE)
    arc_prob = min(opp_dist.get(c, 0) for c in 'ABCDE')
    if arc_prob >= 0.4:
        best = max(best, _scaled(45) * min(1.0, arc_prob))
    # Elemental surge (BCDEF)
    ele_prob = min(opp_dist.get(c, 0) for c in 'BCDEF')
    if ele_prob >= 0.4:
        best = max(best, _scaled(30) * min(1.0, ele_prob))

    # Chaos alchemy (3+2)
    for c1, n1 in opp_dist.items():
        if c1 == '瞬': continue
        if n1 >= 2.5:
            for c2, n2 in opp_dist.items():
                if c2 == '瞬' or c2 == c1: continue
                if n2 >= 1.5:
                    cards_bv = BV.get(c1, 1) * 3 + BV.get(c2, 1) * 2
                    best = max(best, _scaled(20 + cards_bv) * 0.7)

    # Ant colony
    f_cnt = opp_dist.get('F', 0)
    if f_cnt >= ANT_COLONY_MIN_F - 0.5:
        best = max(best, _scaled(int(f_cnt) * 5))

    return int(best)


def _decide_instant(hand, room, ai, opp):
    """More aggressive instant usage — cycle weak cards for better draws.
    Use when we have trash cards OR when hand is large and unfocused."""
    non_instant = [c for c in hand if c != '瞬']
    if not non_instant:
        return None

    my_score = _total_score(ai)
    opp_score = _total_score(opp)
    deck_left = len(room.deck)

    # Don't use instant if we already have a great combo
    playable = _detect_playable(room, AI_IDX)
    if playable and playable[0][3] >= 30:
        return None

    rated = [(c, _expendability(c, hand, room, AI_IDX)) for c in non_instant]
    rated.sort(key=lambda x: x[1], reverse=True)
    trash = [c for c, exp in rated if exp >= 60]

    # More aggressive: also count "mediocre" cards as discardable
    mediocre = [c for c, exp in rated if exp >= 50]

    if trash:
        discard_count = min(len(trash), 3)
        to_discard = trash[:discard_count]
        return ('SPELL_INSTANT', {'discard_cards': to_discard})

    # Use instant for hand cycling when hand is large and unfocused
    if len(hand) >= 6 and len(mediocre) >= 2 and deck_left > 5:
        to_discard = mediocre[:2]
        return ('SPELL_INSTANT', {'discard_cards': to_discard})

    # When behind, aggressively cycle even with fewer trash cards
    if opp_score - my_score > 15 and len(mediocre) >= 1 and deck_left > 3:
        to_discard = mediocre[:min(2, len(mediocre))]
        return ('SPELL_INSTANT', {'discard_cards': to_discard})

    return None


def _decide_sacrifice(ai, opp, room):
    """Enhanced sacrifice strategy: use it as a powerful comeback tool.
    Sacrifice low-value scored combos to recover high-value cards from discard."""
    pad = ai['scorepad']
    my_score = _total_score(ai)
    opp_score = _total_score(opp)
    # Use sacrifice more aggressively — even when slightly behind
    if opp_score - my_score < 12:
        return None

    candidates = []
    for cfg in SCOREPAD_CONFIG:
        info = pad[cfg['key']]
        for i, sc in enumerate(info['scores']):
            candidates.append((cfg['key'], i, sc))
    if not candidates:
        return None
    candidates.sort(key=lambda x: x[2])
    slot_key, score_idx, lost = candidates[0]

    window = room._sacrifice_window()
    if len(window) < 2:
        return None

    hand = ai['hand']
    rated_recovery = sorted(
        [(idx, c, _card_value(c, hand + [c], room, AI_IDX)) for idx, c in window],
        key=lambda x: x[2], reverse=True
    )
    # Lower threshold for recovery value
    if rated_recovery[0][2] < 15:
        return None

    x = min(SACRIFICE_MAX_X, len(rated_recovery),
            len([c for c in hand if _card_value(c, hand, room, AI_IDX) < 20]))
    if x < 1:
        return None

    recover_indices = [r[0] for r in rated_recovery[:x]]
    rated_discard = sorted(hand, key=lambda c: _card_value(c, hand, room, AI_IDX))
    discard_cards = rated_discard[:x]

    recovery_value = sum(r[2] for r in rated_recovery[:x])
    if recovery_value < lost + 12:
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
    """Strategic pre-collision discard: keep strong cards, discard weak orphans."""
    hand = ai['hand']
    must = room._col_must_discard(AI_IDX)
    if must > 0:
        rated = sorted(hand, key=lambda c: _card_value(c, hand, room, AI_IDX))
        return ('COLLISION_PRE_DISCARD', {'cards': rated[:must]})

    ct = Counter(c for c in hand if c != '瞬')
    # Discard orphan weak cards that won't help in collision
    weak = [c for c in hand if c in ('E', 'F') and c != '瞬']
    orphan = [c for c in weak if ct[c] == 1 and BV[c] <= 2]

    # Also consider discarding D orphans if hand is large
    if len(hand) >= 6:
        d_orphans = [c for c in hand if c == 'D' and ct.get('D', 0) == 1]
        orphan.extend(d_orphans)

    if len(orphan) >= 2:
        return ('COLLISION_PRE_DISCARD', {'cards': orphan[:2]})
    if len(orphan) == 1:
        return ('COLLISION_PRE_DISCARD', {'cards': orphan[:1]})
    return ('COLLISION_PRE_DISCARD', {'cards': []})


def _decide_col_bet(ai, opp, room):
    """Smart collision betting based on hand quality comparison."""
    if room.col_bet_phase == 'CALLER' and room.col_bet_caller != AI_IDX:
        return None
    if room.col_bet_phase == 'RESPONDER' and room.col_bet_caller == AI_IDX:
        return None

    my_score = _total_score(ai)
    opp_score = _total_score(opp)
    diff = my_score - opp_score
    my_strength = _hand_strength(ai['hand'])
    opp_hand_count = max(1, len(opp['hand']))
    my_hand_count = max(1, len(ai['hand']))
    shun_count = ai['hand'].count('瞬')
    # Count high-value cards (A, B, C)
    high_cards = sum(1 for c in ai['hand'] if c in ('A', 'B', 'C'))

    # Estimate hand quality relative to opponent
    avg_my_bv = my_strength / my_hand_count
    # Opponent's average expected BV
    opp_dist = _brain.opp_hand_distribution(room, AI_IDX)
    opp_expected_strength = sum(prob * BV.get(c, 0) for c, prob in opp_dist.items())
    opp_avg_bv = opp_expected_strength / opp_hand_count if opp_hand_count > 0 else 2.5

    strength_advantage = avg_my_bv - opp_avg_bv
    card_advantage = my_hand_count - opp_hand_count

    if room.col_bet_phase == 'CALLER':
        # Bet big when we have clear advantage
        if strength_advantage > 1.0 and high_cards >= 2:
            return ('COLLISION_BET', {'amount': 20})
        if diff < -20 and (strength_advantage > 0.5 or shun_count >= 2):
            return ('COLLISION_BET', {'amount': 20})
        if strength_advantage > 0.3 or card_advantage >= 2:
            return ('COLLISION_BET', {'amount': 10})
        if diff < -10:
            return ('COLLISION_BET', {'amount': 10})
        # Even when even, bet 10 if we have shuns (tie-forcing is strong)
        if shun_count >= 1 and high_cards >= 1:
            return ('COLLISION_BET', {'amount': 10})
        return ('COLLISION_BET', {'amount': 0})

    # Responder phase
    bet = room.col_bet_amount
    # Always follow if we have strong hand
    if strength_advantage > 0.5 or high_cards >= 2:
        return ('COLLISION_BET', {'choice': 'follow'})
    # Follow when behind (need the risk)
    if diff < -15:
        return ('COLLISION_BET', {'choice': 'follow'})
    # Follow small bets more readily
    if bet <= 10 and (strength_advantage > -0.5 or shun_count >= 1):
        return ('COLLISION_BET', {'choice': 'follow'})
    # Fold if clearly outmatched
    if strength_advantage < -1.0 and diff > 10:
        return ('COLLISION_BET', {'choice': 'fold'})
    return ('COLLISION_BET', {'choice': 'follow'})


def _decide_col_arrange(ai):
    """Strategic collision arrangement using game-theoretic optimal ordering.
    Key insight: ties accumulate pot (+10 each), so we want to WIN rounds
    where the pot is largest. Place 瞬 early to force ties and build pot,
    then place strongest cards to win the accumulated pot."""
    hand = list(ai['hand'])
    if len(hand) <= 1:
        return ('COLLISION_ARRANGE', {'order': hand})

    shun_cards = [c for c in hand if c == '瞬']
    non_shun = [c for c in hand if c != '瞬']
    non_shun.sort(key=lambda c: RANK[c])  # A, B, C, D, E, F (strongest first)

    n = len(hand)
    if n <= 2:
        # With 2 cards: put stronger card last (higher pot round)
        non_shun.sort(key=lambda c: RANK[c], reverse=True)  # weakest first
        order = shun_cards + non_shun
        return ('COLLISION_ARRANGE', {'order': order})

    # Strategy: front-load 瞬 cards to force ties and build pot,
    # then place strongest cards at positions where pot will be largest.
    # Also sprinkle some weak cards as "bait" rounds we're okay to lose.
    #
    # Optimal pattern for N cards with S shuns:
    #   Positions 0..S-1: 瞬 (forces tie, pot grows)
    #   Position S: strongest card (wins the big accumulated pot)
    #   Position S+1: 2nd strongest (wins base pot)
    #   ...remaining: weakest cards (expendable)
    #
    # But also consider: if we have many strong cards, alternate
    # weak-strong to maximize wins across rounds.

    strong = []  # cards we want to win with
    weak = []    # cards we're okay losing

    for c in non_shun:
        if BV[c] >= 4:  # A, B, C
            strong.append(c)
        else:
            weak.append(c)

    # Sort strong by power (highest first), weak by power (lowest first)
    strong.sort(key=lambda c: RANK[c])      # A first
    weak.sort(key=lambda c: RANK[c], reverse=True)  # F first

    if len(shun_cards) >= 2:
        # Many 瞬: front-load them, then deploy strongest at the pot peak
        order = list(shun_cards)
        order += strong + weak
    elif len(shun_cards) == 1:
        # One 瞬: put it first to build pot, then strongest wins it
        order = shun_cards + strong + weak
    else:
        # No 瞬: alternate weak-strong pattern
        # Put a weak card round 0 (only 10 pot), strongest at round 1+
        # Interleave: W S W S W ... or if we have more strong than weak,
        # lead with weakest then all strong
        order = []
        si, wi = 0, 0
        for pos in range(n):
            if pos % 2 == 0 and wi < len(weak):
                order.append(weak[wi]); wi += 1
            elif si < len(strong):
                order.append(strong[si]); si += 1
            elif wi < len(weak):
                order.append(weak[wi]); wi += 1
            elif si < len(strong):
                order.append(strong[si]); si += 1

        # Ensure we don't accidentally leave cards out
        placed = set()
        for i, c in enumerate(order):
            placed.add(id(c))
        remaining_s = strong[si:]
        remaining_w = weak[wi:]
        order += remaining_s + remaining_w

    # Final validation: must have exactly the same cards
    if sorted(order) != sorted(hand):
        order = hand[:]  # fallback
    return ('COLLISION_ARRANGE', {'order': order})


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
    """Strategic bluffing: AI bluffs when it benefits from intimidation,
    and tells truth when the true card is already scary."""
    hand = ai['hand']
    true_card = room.atk_card
    if not true_card:
        return ('BLUFF_DECLARE', {'declared_rank': 'none'})

    true_rank = RANK.get(true_card, 6)

    # Strong cards (A, B): usually tell truth to trigger fold
    if true_card in ('A', 'B'):
        # 70% truth (intimidation), 30% declare nothing (hide info)
        if random.random() < 0.70:
            return ('BLUFF_DECLARE', {'declared_rank': true_card})
        return ('BLUFF_DECLARE', {'declared_rank': 'none'})

    # Mid cards (C, D): bluff as A/B to intimidate ~40%
    if true_card in ('C', 'D'):
        if random.random() < 0.40:
            declared = random.choice(['A', 'A', 'B'])
            return ('BLUFF_DECLARE', {'declared_rank': declared})
        if random.random() < 0.30:
            return ('BLUFF_DECLARE', {'declared_rank': 'none'})
        return ('BLUFF_DECLARE', {'declared_rank': true_card})

    # Weak cards (E, F): bluff aggressively 60%
    if true_card in ('E', 'F'):
        if random.random() < 0.60:
            declared = random.choice(['A', 'B', 'B', 'C'])
            return ('BLUFF_DECLARE', {'declared_rank': declared})
        return ('BLUFF_DECLARE', {'declared_rank': 'none'})

    return ('BLUFF_DECLARE', {'declared_rank': 'none'})


def _decide_bluff_respond(ai, opp, room):
    """Smarter bluff calling using Bayesian reasoning and game context."""
    declared = room.bluff_declared_rank
    if declared is None:
        return ('BLUFF_RESPOND', {'choice': 'believe'})

    unseen = _brain.unseen_distribution(room, AI_IDX)
    atk_dist = _brain.opp_hand_distribution(room, AI_IDX)
    non_shun_total = sum(v for k, v in atk_dist.items() if k != '瞬')

    # P(declared was the actual attack card)
    p_true = (atk_dist.get(declared, 0) / max(1, non_shun_total))

    my_score = _total_score(ai)
    opp_score = _total_score(opp)

    # If declared is A/B but opp has few of them in expected distribution → likely bluff
    if declared in ('A', 'B') and p_true < 0.25:
        # High confidence it's a bluff — call it
        if my_score >= BLUFF_TRUE_PENALTY:
            return ('BLUFF_RESPOND', {'choice': 'call'})

    # If we're ahead, we can afford to call more aggressively
    if my_score - opp_score > 20 and p_true < 0.40:
        return ('BLUFF_RESPOND', {'choice': 'call'})

    # General threshold
    call_threshold = 0.30 if my_score >= 25 else 0.22
    if p_true < call_threshold:
        return ('BLUFF_RESPOND', {'choice': 'call'})

    return ('BLUFF_RESPOND', {'choice': 'believe'})


# ── Red Zone Bid (红区暗标拍卖) ────────────────────────
def _decide_red_bid(ai, opp, room, ai_idx):
    """Strategic red zone bidding. Bid higher when the combo score is significant
    or when we need to deny it from opponent."""
    if room.red_bid_done[ai_idx]:
        return None
    hand = ai['hand']
    my_score = _total_score(ai)
    opp_score = _total_score(opp)
    trigger_score = room.red_bid_trigger_score
    diff = my_score - opp_score

    # Calculate how much winning this bid matters
    # If this could win us the game, bid max
    if my_score + trigger_score >= WIN_SCORE:
        n_bid = RED_BID_MAX
    # If opponent winning this would put them close to victory, bid max to deny
    elif opp_score + trigger_score >= WIN_SCORE * 0.85:
        n_bid = RED_BID_MAX
    # Big combo or behind: bid aggressively
    elif diff < -15 or trigger_score >= 40:
        n_bid = RED_BID_MAX
    elif diff < 0 or trigger_score >= 25:
        n_bid = min(RED_BID_MAX, 2)
    else:
        n_bid = RED_BID_MIN

    n_bid = min(n_bid, len(hand), RED_BID_MAX)
    n_bid = max(n_bid, RED_BID_MIN)
    # Bid lowest-BV cards first, but consider card value for combo potential
    eligible = sorted(hand, key=lambda c: _card_value(c, hand, room, ai_idx))
    bid_cards = eligible[:n_bid]
    return ('RED_BID', {'cards': bid_cards})
