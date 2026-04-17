"""AI decision engine for 秘术对决：禁忌魔典.

Evaluates game state and returns (action, data) for every phase.
Designed to be called by the server after each broadcast when it's the AI's turn.
"""
import random
from collections import Counter
from game_state import (
    CARD_CONFIG, SCOREPAD_CONFIG, HAND_LIMIT, WIN_SCORE,
    SCORE_MULT, SCAVENGE_LIMIT, SEAL_LIMIT, INSTANT_PER_TURN,
)

AI_IDX = 1
RANK = {c: cfg['rank'] for c, cfg in CARD_CONFIG.items()}
BV = {c: cfg['base_value'] for c, cfg in CARD_CONFIG.items()}
TIER1_KEYS = frozenset(c['key'] for c in SCOREPAD_CONFIG if c['tier'] == 1)


def _scaled(raw):
    return int(raw * SCORE_MULT)


def _total_score(player):
    s = player['score']
    for combo in player['scorepad'].values():
        s += sum(combo['scores'])
    return s


def _slots_left(pad, key):
    info = pad[key]
    return info['max_slots'] - len(info['scores']) - info['sealed']


def _total_sealed(pad):
    return sum(info['sealed'] for info in pad.values())


# ── Hand evaluation ──────────────────────────────────────


def _near_combos(hand, pad):
    """Find combos the AI is close to completing.
    Returns list of (key, missing_count, potential_score, needed_cards).
    """
    ct = Counter(c for c in hand if c != '瞬')
    results = []

    if _slots_left(pad, 'dragon_breath') > 0:
        for c in ct:
            have = ct[c]
            if have >= 3:
                sc = _scaled(40 + BV[c] * 5)
                results.append(('dragon_breath', 5 - have, sc, [c] * (5 - have)))

    if _slots_left(pad, 'arcane_sequence') > 0:
        needed = [c for c in 'ABCDE' if c not in ct]
        if len(needed) <= 2:
            results.append(('arcane_sequence', len(needed), _scaled(45), needed))

    if _slots_left(pad, 'elemental_surge') > 0:
        needed = [c for c in 'BCDEF' if c not in ct]
        if len(needed) <= 2:
            results.append(('elemental_surge', len(needed), _scaled(30), needed))

    if _slots_left(pad, 'chaos_alchemy') > 0:
        for c3 in ct:
            if ct[c3] >= 2:
                for c2 in ct:
                    if c2 != c3 and ct[c2] >= 1:
                        miss = max(0, 3 - ct[c3]) + max(0, 2 - ct[c2])
                        if miss <= 2:
                            cards = [c3] * 3 + [c2] * 2
                            sc = _scaled(20 + sum(BV[c] for c in cards))
                            results.append(('chaos_alchemy', miss, sc, []))

    if _slots_left(pad, 'triple_resonance') > 0:
        for c in ct:
            if ct[c] >= 2:
                sc = _scaled(10 + BV[c] * 3)
                results.append(('triple_resonance', 3 - ct[c], sc, [c] * (3 - ct[c])))

    return results


def _card_value(card, hand, pad):
    """How valuable is keeping this card? Higher = more important to keep."""
    if card == '瞬':
        return 50

    ct = Counter(c for c in hand if c != '瞬')
    score = BV[card] * 2

    have = ct.get(card, 0)
    if have >= 4 and _slots_left(pad, 'dragon_breath') > 0:
        score += 40
    elif have >= 3:
        if _slots_left(pad, 'triple_resonance') > 0:
            score += 20
        if _slots_left(pad, 'dragon_breath') > 0:
            score += 15

    if card in 'ABCDE' and _slots_left(pad, 'arcane_sequence') > 0:
        needed = sum(1 for c in 'ABCDE' if c not in ct or (c == card and ct[c] == 1))
        if needed <= 2:
            score += 25 - needed * 5
    if card in 'BCDEF' and _slots_left(pad, 'elemental_surge') > 0:
        needed = sum(1 for c in 'BCDEF' if c not in ct or (c == card and ct[c] == 1))
        if needed <= 2:
            score += 18 - needed * 5

    if have >= 2 and _slots_left(pad, 'chaos_alchemy') > 0:
        for other in ct:
            if other != card and ct[other] >= 2:
                score += 12
                break

    if card == 'F':
        f_cnt = ct.get('F', 0)
        if f_cnt >= 2 and _slots_left(pad, 'ant_colony') > 0:
            score += f_cnt * 3

    return score


def _expendability(card, hand, pad):
    """Inverse of card_value — higher means safer to discard/attack with."""
    return 100 - _card_value(card, hand, pad)


def _detect_playable(hand, pad):
    """Wrapper around scoring.detect_playable that works with raw pad dict."""
    from scoring import detect_playable
    slots_fn = lambda key: _slots_left(pad, key)
    return detect_playable(hand, slots_fn)


def _hand_strength_for_collision(hand):
    """Rate hand strength for collision (higher rank cards = stronger)."""
    return sum(BV[c] for c in hand if c != '瞬')


# ── Phase decision functions ─────────────────────────────


def decide(room):
    """Main entry: examine room state, return (action, data) or None if not AI's turn."""
    phase = room.phase
    ai = room.players[AI_IDX]
    opp = room.players[1 - AI_IDX]
    cp = room.current_player

    if phase == 'GAME_OVER':
        return None

    if phase == 'DRAW':
        if cp != AI_IDX:
            return None
        return ('DRAW', {})

    if phase == 'AMBUSH_DECIDE':
        if cp != AI_IDX:
            return None
        return _decide_ambush(ai, opp, room)

    if phase == 'AMBUSH_ATK_SELECT':
        if cp != AI_IDX:
            return None
        return _decide_atk_select(ai, opp, room)

    if phase == 'AMBUSH_DEF_SELECT':
        if cp == AI_IDX:
            return None
        return _decide_def_select(ai, opp, room)

    if phase == 'AMBUSH_SCAVENGE':
        winner_idx = room.duel_winner_idx
        loser_idx = 1 - winner_idx if winner_idx >= 0 else -1
        if loser_idx != AI_IDX:
            return None
        return _decide_scavenge(ai, room)

    if phase == 'SPELL':
        if cp != AI_IDX:
            return None
        return _decide_spell(ai, opp, room)

    if phase == 'END_DISCARD':
        if cp != AI_IDX:
            return None
        return _decide_end_discard(ai)

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
    hand = ai['hand']
    eligible = [c for c in hand if c != '瞬']

    if len(hand) <= 3 or not eligible:
        return ('AMBUSH_DECIDE', {'choice': 'skip'})

    if not opp['hand']:
        return ('AMBUSH_DECIDE', {'choice': 'attack'})

    my_score = _total_score(ai)
    opp_score = _total_score(opp)
    diff = my_score - opp_score

    playable = _detect_playable(hand, ai['scorepad'])
    if playable and playable[0][3] >= 30:
        return ('AMBUSH_DECIDE', {'choice': 'skip'})

    if diff > 40 and len(hand) <= 5:
        return ('AMBUSH_DECIDE', {'choice': 'skip'})

    best_exp = max(eligible, key=lambda c: _expendability(c, hand, ai['scorepad']))
    if _expendability(best_exp, hand, ai['scorepad']) < 30:
        return ('AMBUSH_DECIDE', {'choice': 'skip'})

    return ('AMBUSH_DECIDE', {'choice': 'attack'})


def _decide_atk_select(ai, opp, room):
    hand = ai['hand']
    eligible = [c for c in hand if c != '瞬']
    if not eligible:
        return ('AMBUSH_CANCEL', {})

    pad = ai['scorepad']
    rated = [(c, _expendability(c, hand, pad)) for c in eligible]
    rated.sort(key=lambda x: x[1], reverse=True)

    opp_hand_count = len(opp['hand'])
    if opp_hand_count <= 2:
        card = rated[0][0]
    else:
        top_candidates = [c for c, exp in rated if exp >= rated[0][1] - 10]
        best_rank = min(top_candidates, key=lambda c: RANK[c])
        card = best_rank

    return ('AMBUSH_ATK_SELECT', {'card': card})


def _decide_def_select(ai, opp, room):
    hand = ai['hand']
    if not hand:
        return ('AMBUSH_DEF_SELECT', {'card': None})

    atk_card = room.atk_card
    eligible = [c for c in hand if c != '瞬']
    has_instant = '瞬' in hand

    if not eligible:
        if has_instant:
            return ('AMBUSH_DEF_SELECT', {'card': '瞬'})
        return ('AMBUSH_DEF_SELECT', {'card': None})

    if atk_card == 'A' and 'F' in eligible:
        return ('AMBUSH_DEF_SELECT', {'card': 'F'})

    if has_instant and atk_card in ('A', 'B'):
        pad = ai['scorepad']
        playable = _detect_playable(hand, pad)
        if playable and playable[0][3] >= 36:
            return ('AMBUSH_DEF_SELECT', {'card': '瞬'})

    pad = ai['scorepad']
    rated = [(c, _expendability(c, hand, pad)) for c in eligible]
    rated.sort(key=lambda x: x[1], reverse=True)

    for card, exp in rated:
        from game_logic import compare_duel
        result = compare_duel(card, atk_card)
        if result == -1:
            return ('AMBUSH_DEF_SELECT', {'card': card})

    return ('AMBUSH_DEF_SELECT', {'card': rated[0][0]})


# ── Scavenge ─────────────────────────────────────────────


def _decide_scavenge(ai, room):
    if ai['scavenge_remaining'] <= 0:
        return ('SCAVENGE', {'choice': 'skip'})

    recent = room._scavengeable_recent()
    scav = [(i, c) for i, c in recent if c in ('D', 'E', 'F')]
    if not scav:
        return ('SCAVENGE', {'choice': 'skip'})

    pad = ai['scorepad']
    hand = ai['hand']

    best_idx, best_card, best_val = -1, None, -1
    for idx, card in scav:
        test_hand = hand + [card]
        val = _card_value(card, test_hand, pad)
        if val > best_val:
            best_idx, best_card, best_val = idx, card, val

    nears = _near_combos(hand, pad)
    useful_near = any(miss <= 2 for _, miss, sc, _ in nears if sc >= 20)

    if best_val < 10 and not useful_near:
        deck_left = len(room.deck)
        if deck_left > 15 and ai['scavenge_remaining'] > 1:
            return ('SCAVENGE', {'choice': 'skip'})

    if best_idx >= 0:
        return ('SCAVENGE', {'choice': 'pick', 'card_idx': best_idx})

    return ('SCAVENGE', {'choice': 'skip'})


# ── Spell ────────────────────────────────────────────────


def _decide_spell(ai, opp, room):
    hand = ai['hand']
    pad = ai['scorepad']
    opp_pad = opp['scorepad']

    if ai['breaker_marks'] > 0:
        action = _decide_breaker(pad, opp_pad, ai, opp)
        if action:
            return action

    playable = _detect_playable(hand, pad)

    tier1_done = room.tier1_bonus
    if playable:
        best = _pick_best_combo(playable, hand, pad, tier1_done, ai, opp, room)
        if best:
            key, name, cards, score = best
            return ('SPELL_SCORE', {'cards': cards, 'combo_key': key})

    if '瞬' in hand and room.instant_count < INSTANT_PER_TURN:
        instant_action = _decide_instant(hand, pad, ai, opp, room)
        if instant_action:
            return instant_action

    if len(hand) >= 6 and not playable:
        sac_action = _decide_sacrifice(hand, pad, room)
        if sac_action:
            return sac_action

    return ('SPELL_SKIP', {})


def _decide_breaker(my_pad, opp_pad, ai, opp):
    my_score = _total_score(ai)
    opp_score = _total_score(opp)

    if _total_sealed(opp_pad) >= SEAL_LIMIT:
        if opp_score > my_score:
            return ('SPELL_BREAKER', {'type': 'curse'})
        return None

    for cfg in SCOREPAD_CONFIG:
        if cfg['tier'] == 1 and _slots_left(opp_pad, cfg['key']) > 0:
            return ('SPELL_BREAKER', {'type': 'seal', 'slot_key': cfg['key']})

    for cfg in SCOREPAD_CONFIG:
        if cfg['tier'] == 2 and _slots_left(opp_pad, cfg['key']) > 0:
            return ('SPELL_BREAKER', {'type': 'seal', 'slot_key': cfg['key']})

    for cfg in SCOREPAD_CONFIG:
        if cfg['tier'] == 3 and _slots_left(opp_pad, cfg['key']) > 0:
            return ('SPELL_BREAKER', {'type': 'seal', 'slot_key': cfg['key']})

    return ('SPELL_BREAKER', {'type': 'curse'})


def _pick_best_combo(playable, hand, pad, tier1_done, ai, opp, room):
    """Pick the best combo, considering tier1 bonus, score gap, and hand preservation."""
    my_score = _total_score(ai)
    opp_score = _total_score(opp)

    tier1_available = [p for p in playable if p[0] in TIER1_KEYS and not tier1_done]
    if tier1_available:
        return tier1_available[0]

    winning_combos = [p for p in playable if my_score + p[3] >= WIN_SCORE]
    if winning_combos:
        return min(winning_combos, key=lambda p: len(p[2]))

    if not playable:
        return None

    scored = []
    for key, name, cards, base_score in playable:
        remaining_hand = list(hand)
        for c in cards:
            if c in remaining_hand:
                remaining_hand.remove(c)

        future_combos = _detect_playable(remaining_hand, pad)
        future_potential = future_combos[0][3] if future_combos else 0

        effective = base_score
        if room.echo_ready:
            effective += 10
        if ai['curse_active']:
            effective -= 10

        if key == 'ant_colony' and len(cards) <= 2 and len(room.deck) > 15:
            effective -= 15

        score = effective + future_potential * 0.3
        scored.append((key, name, cards, base_score, score))

    scored.sort(key=lambda x: x[4], reverse=True)
    best = scored[0]

    if best[3] < 12 and len(room.deck) > 20:
        return None

    return (best[0], best[1], best[2], best[3])


def _decide_instant(hand, pad, ai, opp, room):
    """Should AI use 瞬 to swap cards?"""
    non_instant = [c for c in hand if c != '瞬']
    if not non_instant:
        return None

    playable_now = _detect_playable(hand, pad)
    if playable_now and playable_now[0][3] >= 30:
        return None

    rated = [(c, _expendability(c, hand, pad)) for c in non_instant]
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


def _decide_sacrifice(hand, pad, room):
    """Should AI sacrifice a scorepad slot to clear hand?"""
    playable = _detect_playable(hand, pad)
    if playable:
        return None

    nears = _near_combos(hand, pad)
    close = [n for n in nears if n[1] <= 1 and n[2] >= 25]
    if close:
        return None

    worst_slot = None
    for cfg in reversed(SCOREPAD_CONFIG):
        if _slots_left(pad, cfg['key']) > 0:
            worst_slot = cfg['key']
            break

    if not worst_slot:
        return None

    rated = sorted(hand, key=lambda c: _card_value(c, hand, pad))
    discard_count = min(max(len(hand) - 5, 2), len(rated))
    to_discard = rated[:discard_count]

    return ('SPELL_SACRIFICE', {'slot_key': worst_slot, 'discard_cards': to_discard})


# ── End Discard ──────────────────────────────────────────


def _decide_end_discard(ai):
    hand = ai['hand']
    from game_logic import hand_overflow
    overflow = hand_overflow(hand)
    if overflow <= 0:
        return None

    pad = ai['scorepad']
    rated = sorted(hand, key=lambda c: _card_value(c, hand, pad))
    to_discard = rated[:overflow]
    return ('END_DISCARD', {'cards': to_discard})


# ── Collision Pre-Discard ────────────────────────────────


def _decide_col_pre_discard(ai, opp, room):
    hand = ai['hand']
    pad = ai['scorepad']

    must = room._col_must_discard(AI_IDX)
    if must > 0:
        rated = sorted(hand, key=lambda c: _card_value(c, hand, pad))
        to_discard = rated[:must]
        return ('COLLISION_PRE_DISCARD', {'cards': to_discard})

    weak = [c for c in hand if c in ('E', 'F') and c != '瞬']
    ct = Counter(c for c in hand if c != '瞬')
    orphan_weak = [c for c in weak if ct[c] == 1 and BV[c] <= 2]

    if len(orphan_weak) >= 2:
        return ('COLLISION_PRE_DISCARD', {'cards': orphan_weak[:2]})
    elif len(orphan_weak) == 1:
        return ('COLLISION_PRE_DISCARD', {'cards': orphan_weak[:1]})

    return ('COLLISION_PRE_DISCARD', {'cards': []})


# ── Collision Bet ────────────────────────────────────────


def _decide_col_bet(ai, opp, room):
    if room.col_bet_phase == 'CALLER' and room.col_bet_caller != AI_IDX:
        return None
    if room.col_bet_phase == 'RESPONDER' and room.col_bet_caller == AI_IDX:
        return None

    my_score = _total_score(ai)
    opp_score = _total_score(opp)
    diff = my_score - opp_score
    my_strength = _hand_strength_for_collision(ai['hand'])
    opp_hand_count = len(opp['hand'])

    if room.col_bet_phase == 'CALLER':
        if diff < -20 and my_strength >= opp_hand_count * 2.5:
            return ('COLLISION_BET', {'amount': 20})
        if diff < -10:
            return ('COLLISION_BET', {'amount': 10})
        if diff < 0 and my_strength >= opp_hand_count * 3:
            return ('COLLISION_BET', {'amount': 10})
        return ('COLLISION_BET', {'amount': 0})

    else:
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


# ── Delay config (seconds) ──────────────────────────────

DELAY = {
    'DRAW': (0.15, 0.3),
    'AMBUSH_DECIDE': (0.3, 0.5),
    'AMBUSH_ATK_SELECT': (0.3, 0.5),
    'AMBUSH_DEF_SELECT': (0.3, 0.5),
    'AMBUSH_CANCEL': (0.15, 0.25),
    'SCAVENGE': (0.3, 0.5),
    'SPELL_SCORE': (0.4, 0.7),
    'SPELL_INSTANT': (0.3, 0.5),
    'SPELL_SACRIFICE': (0.3, 0.5),
    'SPELL_BREAKER': (0.3, 0.5),
    'SPELL_SKIP': (0.15, 0.3),
    'END_DISCARD': (0.2, 0.35),
    'COLLISION_PRE_DISCARD': (0.3, 0.5),
    'COLLISION_BET': (0.4, 0.7),
    'COLLISION_FLIP': (0.15, 0.3),
}


def get_delay(action):
    lo, hi = DELAY.get(action, (0.8, 1.5))
    return random.uniform(lo, hi)
