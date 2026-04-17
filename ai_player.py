"""AI decision engine — V3.0『零』."""
import random
from collections import Counter
from game_state import (
    CARD_CONFIG, SCOREPAD_CONFIG, HAND_LIMIT, WIN_SCORE,
    SCORE_MULT, SEAL_LIMIT, INSTANT_PER_TURN,
    ANT_COLONY_MIN_F, AMBUSH_SECOND_COST, AMBUSH_MAX_PER_TURN,
    RED_KEYS, BLUE_KEYS, GREEN_KEYS,
    SACRIFICE_MAX_X, NO_AMBUSH_BEFORE_TURN,
)

AI_IDX = 1
RANK = {c: cfg['rank'] for c, cfg in CARD_CONFIG.items()}
BV = {c: cfg['base_value'] for c, cfg in CARD_CONFIG.items()}


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

    if phase == 'COLLISION_FLIP':
        wf = room._col_waiting_for()
        if wf != AI_IDX:
            return None
        return ('COLLISION_FLIP', {})

    return None


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

    # Expendability check
    best_exp = max(eligible, key=lambda c: _expendability(c, hand, room, AI_IDX))
    if _expendability(best_exp, hand, room, AI_IDX) < 30:
        return ('AMBUSH_DECIDE', {'choice': 'skip'})

    return ('AMBUSH_DECIDE', {'choice': 'attack'})


def _decide_pay_cost(ai, room):
    hand = ai['hand']
    rated = [(c, _card_value(c, hand, room, AI_IDX)) for c in hand]
    rated.sort(key=lambda x: x[1])
    to_discard = [c for c, _ in rated[:AMBUSH_SECOND_COST]]
    return ('AMBUSH_PAY_COST', {'cards': to_discard})


def _decide_atk_select(ai, opp, room):
    hand = ai['hand']
    eligible = [c for c in hand if c != '瞬']
    if not eligible:
        return ('AMBUSH_CANCEL', {})

    # Don't throw A unless we can back it up. Strategic mid-strength pick.
    non_a = [c for c in eligible if c != 'A']
    pool = non_a if non_a else eligible
    # Prefer cards with medium rank (C/D)
    def score_atk(c):
        r = RANK[c]
        exp = _expendability(c, hand, room, AI_IDX)
        return (exp * 0.6 + (10 if r in (2, 3) else 0))
    pool.sort(key=score_atk, reverse=True)
    return ('AMBUSH_ATK_SELECT', {'card': pool[0]})


def _decide_defend(ai, opp, room):
    """AI defender chooses fold or defend (with card)."""
    hand = ai['hand']
    eligible = [c for c in hand if c != '瞬']
    has_instant = '瞬' in hand
    atk_unknown = room.atk_card  # The defender sees '?' in view; here we CHEAT minimally
    # NOTE: in real game defender doesn't know atk_card. We enforce blind play.

    # Fold when hand is very weak (only F and nothing else useful)
    non_f = [c for c in eligible if c != 'F']
    if len(hand) <= 2 and not has_instant:
        # If we fold, we only lose 1 random card. If we defend, we likely lose anyway.
        # Folding preserves more than playing a card AND losing it AND losing another card.
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

    if ai['breaker_marks'] > 0:
        action = _decide_breaker(room, ai, opp)
        if action:
            return action

    playable = _detect_playable(room, AI_IDX)
    if playable:
        best = _pick_best_combo(playable, hand, room, ai, opp)
        if best:
            key, name, cards, score = best
            return ('SPELL_SCORE', {'cards': cards, 'combo_key': key})

    if '瞬' in hand and room.instant_count < INSTANT_PER_TURN:
        instant_action = _decide_instant(hand, room, ai, opp)
        if instant_action:
            return instant_action

    # Sacrifice only as late-game comeback
    sac = _decide_sacrifice(ai, opp, room)
    if sac:
        return sac

    return ('SPELL_SKIP', {})


def _decide_breaker(room, ai, opp):
    my_score = _total_score(ai)
    opp_score = _total_score(opp)
    opp_pad = opp['scorepad']

    # Seal highest-value still-open slot
    for cfg in SCOREPAD_CONFIG:
        if cfg['tier'] == 1 and room._slots_left(1 - AI_IDX, cfg['key']) > 0:
            return ('SPELL_BREAKER', {'type': 'seal', 'slot_key': cfg['key']})
    for cfg in SCOREPAD_CONFIG:
        if cfg['tier'] == 2 and room._slots_left(1 - AI_IDX, cfg['key']) > 0:
            return ('SPELL_BREAKER', {'type': 'seal', 'slot_key': cfg['key']})
    for cfg in SCOREPAD_CONFIG:
        if cfg['tier'] == 3 and room._slots_left(1 - AI_IDX, cfg['key']) > 0:
            return ('SPELL_BREAKER', {'type': 'seal', 'slot_key': cfg['key']})

    if not opp['curse_active']:
        return ('SPELL_BREAKER', {'type': 'curse'})
    return None


def _pick_best_combo(playable, hand, room, ai, opp):
    my_score = _total_score(ai)

    # Winning combo: go for it
    winning = [p for p in playable if my_score + p[3] >= WIN_SCORE]
    if winning:
        return min(winning, key=lambda p: len(p[2]))

    # Prefer red (shared + punish) if close to winning
    reds = [p for p in playable if p[0] in RED_KEYS]
    if reds and my_score >= WIN_SCORE * 0.4:
        return max(reds, key=lambda p: p[3])

    scored = []
    for key, name, cards, base in playable:
        remaining = list(hand)
        for c in cards:
            if c in remaining:
                remaining.remove(c)
        # Simulate future potential
        from scoring import detect_playable
        slots_fn = lambda k: room._slots_left(AI_IDX, k)
        future = detect_playable(remaining, slots_fn)
        future_pot = future[0][3] if future else 0

        effective = base
        if ai['curse_active']:
            effective -= 10
        # Bonus: red = discard opp 2, blue/green = +1 draw
        if key in RED_KEYS:
            effective += 15
        elif key in BLUE_KEYS or key in GREEN_KEYS:
            effective += 5

        # Penalty: playing too-small ant_colony early
        if key == 'ant_colony' and len(cards) <= ANT_COLONY_MIN_F and len(room.deck) > 15:
            effective -= 10

        total = effective + future_pot * 0.3
        scored.append((key, name, cards, base, total))

    scored.sort(key=lambda x: x[4], reverse=True)
    best = scored[0]
    if best[3] < 12 and len(room.deck) > 20:
        return None
    return (best[0], best[1], best[2], best[3])


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
    opp_hand_count = len(opp['hand'])

    if room.col_bet_phase == 'CALLER':
        if diff < -20 and my_strength >= opp_hand_count * 2.5:
            return ('COLLISION_BET', {'amount': 20})
        if diff < -10:
            return ('COLLISION_BET', {'amount': 10})
        if diff < 0 and my_strength >= opp_hand_count * 3:
            return ('COLLISION_BET', {'amount': 10})
        return ('COLLISION_BET', {'amount': 0})
    bet = room.col_bet_amount
    if diff > bet + 10:
        return ('COLLISION_BET', {'choice': 'fold'})
    if my_strength >= opp_hand_count * 2.5:
        return ('COLLISION_BET', {'choice': 'follow'})
    if diff < -15:
        return ('COLLISION_BET', {'choice': 'follow'})
    if bet == 10:
        return ('COLLISION_BET', {'choice': 'follow'})
    return ('COLLISION_BET', {'choice': 'fold'})


# ── Delay ────────────────────────────────────────────────
DELAY = {
    'DRAW_ACK': (0.15, 0.3),
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
    'COLLISION_PRE_DISCARD': (0.3, 0.5),
    'COLLISION_BET': (0.4, 0.7),
    'COLLISION_FLIP': (0.15, 0.3),
}


def get_delay(action):
    lo, hi = DELAY.get(action, (0.3, 0.6))
    return random.uniform(lo, hi)
