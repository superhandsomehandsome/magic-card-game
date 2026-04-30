"""V5.0 Monte Carlo simulation — 黑市博弈版 balance verification.

V5.0 NEW vs V3.0:
- WIN_SCORE 145 → 155
- A win bonus 8 → 15
- 2nd ambush cost 2 → 1
- Sacrifice window 3 → 5
- NEW: Black Market (3 face-up cards, buy with hand value sum)
- NEW: Lockdown (place 1 card → opponent banned from any combo containing that rank)
- NEW: Blood Break — opponent pays 15 score (or 1 marker) to bypass lockdown
- NEW: Dark Market Night every 5 turns (face-down market)
"""
import random
import sys
import os
import game_state as gs
gs.SCORE_MULT = float(os.environ.get('SMULT', gs.SCORE_MULT))
from collections import Counter, defaultdict
from game_logic import create_deck, sort_hand, bv, draw_cards, compare_duel
from scoring import detect_playable, find_combos
from game_state import CARD_CONFIG, SCORE_MULT

# ────────── V5.0 PARAMETERS ──────────
WIN_SCORE = int(os.environ.get('WIN_SCORE', 155))
AMBUSH_A_WIN_BONUS = int(os.environ.get('A_WIN', 15))
AMBUSH_A_LOSE_BONUS = int(os.environ.get('A_LOSE', 3))
AMBUSH_MAX_PER_TURN = 2
AMBUSH_SECOND_COST = int(os.environ.get('COST', 1))
AMBUSH_STEAL_COUNT = 1
BLUE_REWARD_DRAW = int(os.environ.get('BLUE', 1))
GREEN_REWARD_DRAW = int(os.environ.get('GREEN', 1))
RED_PUNISH_DISCARD = 2
SACRIFICE_MAX_X = 3
SACRIFICE_WINDOW = int(os.environ.get('SAC_WIN', 5))
HAND_LIMIT = 8
INITIAL_HAND_P0 = int(os.environ.get('P0_HAND', 5))
INITIAL_HAND_P1 = int(os.environ.get('P1_HAND', 6))
FIRST_PLAYER_BONUS = int(os.environ.get('FP_BONUS', 0))
BREAKER_SEAL_LIMIT = 3
INSTANT_PER_TURN = 1
NO_AMBUSH_BEFORE_TURN = int(os.environ.get('NO_AMB', 3))

MARKET_SIZE = int(os.environ.get('MKT_SIZE', 3))
MARKET_DECK_GUARD = int(os.environ.get('MKT_GUARD', 8))
MARKET_DARK_INTERVAL = int(os.environ.get('DARK_N', 5))

LOCKDOWN_BREAK_COST = int(os.environ.get('LOCK_COST', 15))
LOCKDOWN_DEBT_ENABLE = bool(int(os.environ.get('LOCK_DEBT', 1)))

BLUFF_TRUE_PENALTY = 15
BLUFF_FALSE_PENALTY = 15
BLUFF_STAKE_BONUS = 5

ANT_COLONY_MIN_F = 3

RED_KEYS = {'dragon_breath', 'arcane_sequence'}
BLUE_KEYS = {'elemental_surge', 'chaos_alchemy'}
GREEN_KEYS = {'triple_resonance', 'ant_colony'}

SLOT_MAX = {
    'dragon_breath': 1, 'arcane_sequence': 1,
    'elemental_surge': 2, 'chaos_alchemy': 2,
    'triple_resonance': 2, 'ant_colony': 2,
}


# ────────── HELPERS ──────────
def make_game():
    return {
        'deck': create_deck(),
        'discard_pile': [],
        'discard_turns': [],
        'turn_number': 1,
        'current': 0,
        'players': [make_player(), make_player()],
        'shared_red': {'dragon_breath': 0, 'arcane_sequence': 0},
        'market': [],
        'winner': -1,
    }


def make_player():
    return {
        'hand': [],
        'score': 0,
        'breaker_marks': 0,
        'overdraft': False,
        'scorepad': {k: {'scores': [], 'sealed': 0} for k in SLOT_MAX},
        'curse_active': False,
        'lockdown_card': None,
        'lockdown_debt': 0,
        'market_purchased': False,
    }


def total_score(g, pidx):
    p = g['players'][pidx]
    s = p['score']
    for combo in p['scorepad'].values():
        s += sum(combo['scores'])
    return s


def slots_left(g, pidx, key):
    p = g['players'][pidx]
    info = p['scorepad'][key]
    if key in RED_KEYS:
        if g['shared_red'][key] > 0:
            return 0
    return SLOT_MAX[key] - len(info['scores']) - info['sealed']


def _slots_fn_for(g, pidx):
    return lambda key: slots_left(g, pidx, key)


def filter_playable(playable):
    return [e for e in playable if not (e[0] == 'ant_colony' and len(e[2]) < ANT_COLONY_MIN_F)]


def discard_cards(g, cards):
    for c in cards:
        g['discard_pile'].append(c)
        g['discard_turns'].append(g['turn_number'])


def draw_into_hand(g, pidx, n):
    drawn = draw_cards(g['deck'], n)
    g['players'][pidx]['hand'].extend(drawn)
    g['players'][pidx]['hand'] = sort_hand(g['players'][pidx]['hand'])
    return len(drawn)


def random_steal(g, thief, victim, n=1):
    stolen = []
    vp = g['players'][victim]
    for _ in range(n):
        if not vp['hand']:
            break
        c = random.choice(vp['hand'])
        vp['hand'].remove(c)
        g['players'][thief]['hand'].append(c)
        stolen.append(c)
    g['players'][thief]['hand'] = sort_hand(g['players'][thief]['hand'])
    return stolen


def random_discard(g, pidx, n):
    p = g['players'][pidx]
    dumped = []
    for _ in range(n):
        if not p['hand']:
            break
        c = random.choice(p['hand'])
        p['hand'].remove(c)
        dumped.append(c)
    discard_cards(g, dumped)
    return dumped


def enforce_hand_limit(g, pidx):
    p = g['players'][pidx]
    if len(p['hand']) <= HAND_LIMIT:
        return
    overflow = len(p['hand']) - HAND_LIMIT
    sorted_cards = sorted(p['hand'], key=lambda c: -CARD_CONFIG[c]['rank'])
    dumped = sorted_cards[:overflow]
    for c in dumped:
        p['hand'].remove(c)
    discard_cards(g, dumped)


# ────────── BLACK MARKET ──────────
def init_market(g):
    while len(g['market']) < MARKET_SIZE and g['deck']:
        g['market'].append(g['deck'].pop(0))


def refill_market(g):
    if len(g['deck']) <= MARKET_DECK_GUARD:
        return
    while len(g['market']) < MARKET_SIZE and len(g['deck']) > MARKET_DECK_GUARD:
        g['market'].append(g['deck'].pop(0))


def is_dark_market(g):
    return g['turn_number'] > 0 and g['turn_number'] % MARKET_DARK_INTERVAL == 0


def market_buy_decision(g, pidx):
    """Heuristic: buy if market has a card we need to complete a combo, or A/B for tempo."""
    p = g['players'][pidx]
    if p['market_purchased']:
        return None
    if not g['market']:
        return None

    # In dark market night, blind buy (60% chance if we have spare value)
    if is_dark_market(g):
        spare_value = sum(CARD_CONFIG[c]['base_value'] if c != '瞬' else 5 for c in p['hand'])
        if spare_value < 6 or random.random() > 0.4:
            return None
        # Random pick
        target_idx = random.randrange(len(g['market']))
        target_value = 4  # estimate avg
        chosen = build_payment(p['hand'], target_value)
        if chosen:
            return (target_idx, chosen)
        return None

    # Normal: see what cards complete our combos
    ct = Counter(p['hand'])
    needs = set()
    # arcane_sequence: A,B,C,D,E
    if slots_left(g, pidx, 'arcane_sequence') > 0:
        for c in 'ABCDE':
            if c not in ct:
                needs.add(c)
    # elemental_surge: B,C,D,E,F
    if slots_left(g, pidx, 'elemental_surge') > 0:
        for c in 'BCDEF':
            if c not in ct:
                needs.add(c)
    # dragon_breath: any 5-of-kind needs +1 of card we already have 4 of
    for c, n in ct.items():
        if c == '瞬':
            continue
        if n == 4 and slots_left(g, pidx, 'dragon_breath') > 0:
            needs.add(c)
        if n == 2 and slots_left(g, pidx, 'triple_resonance') > 0:
            needs.add(c)

    best_target_idx = -1
    best_value = -1
    for idx, mc in enumerate(g['market']):
        target_v = CARD_CONFIG[mc]['base_value'] if mc != '瞬' else 5
        priority = 0
        if mc in needs:
            priority = 100 + target_v
        elif mc == 'A':
            priority = 50  # A always tempting (combo+ambush)
        elif mc == 'B':
            priority = 25
        elif mc == '瞬':
            priority = 15
        if priority > best_value:
            best_value = priority
            best_target_idx = idx

    if best_target_idx < 0 or best_value < 15:
        return None

    target = g['market'][best_target_idx]
    target_v = CARD_CONFIG[target]['base_value'] if target != '瞬' else 5

    payment = build_payment(p['hand'], target_v, exclude_target=target)
    if not payment:
        return None
    pay_value = sum((CARD_CONFIG[c]['base_value'] if c != '瞬' else 5) for c in payment)
    # Combo-purpose buys can pay a premium; tempo buys must be efficient
    max_premium = 2.0 if best_value >= 100 else 1.4
    if pay_value > target_v * max_premium:
        return None
    return (best_target_idx, payment)


def build_payment(hand, target_value, exclude_target=None):
    """Find minimal-value subset of hand summing >= target_value.
    Prefers low-ranking cards (F, E first). Avoids 瞬 unless necessary.
    """
    # Sort by base value ascending (use F/E first), 瞬 last (價值高)
    sorted_hand = sorted(hand, key=lambda c: (
        c == '瞬', CARD_CONFIG[c]['base_value']))
    payment = []
    total = 0
    for c in sorted_hand:
        if total >= target_value:
            break
        v = CARD_CONFIG[c]['base_value'] if c != '瞬' else 5
        payment.append(c)
        total += v
    if total < target_value:
        return None
    return payment


def phase_market(g, pidx, stats):
    p = g['players'][pidx]
    if p['market_purchased']:
        return
    decision = market_buy_decision(g, pidx)
    if not decision:
        return
    idx, payment = decision
    if idx >= len(g['market']):
        return
    target = g['market'].pop(idx)
    # Pay
    for c in payment:
        if c in p['hand']:
            p['hand'].remove(c)
    discard_cards(g, payment)
    # Receive
    p['hand'].append(target)
    p['hand'] = sort_hand(p['hand'])
    p['market_purchased'] = True
    stats['market_buys'] += 1
    if is_dark_market(g):
        stats['dark_buys'] += 1
    refill_market(g)


# ────────── DRAW ──────────
def phase_draw(g, pidx):
    p = g['players'][pidx]
    n = 1 if p['overdraft'] else 2
    p['overdraft'] = False
    draw_into_hand(g, pidx, n)
    p['market_purchased'] = False


# ────────── BLUFF HELPERS ──────────
def _sim_bluff_declare(atk_card):
    """Decide whether to declare and what rank. Returns declared rank or None."""
    if atk_card in ('A', 'B'):
        return atk_card if random.random() < 0.75 else None
    if atk_card in ('C', 'D'):
        r = random.random()
        if r < 0.35:
            return random.choice(['A', 'A', 'B'])
        if r < 0.60:
            return atk_card
        return None
    if atk_card in ('E', 'F'):
        if random.random() < 0.45:
            return random.choice(['A', 'B', 'B', 'C'])
        return None
    return None


def _sim_bluff_respond(declared, atk_card, opp_hand):
    """Defender decides: 'call', 'fold', or 'fight'. Simple heuristic."""
    if not declared:
        return 'fight'
    ct = Counter(opp_hand)
    # Estimate if the declaration is plausible
    total_non_shun = sum(v for k, v in ct.items() if k != '瞬')
    # If defender holds the declared card → less likely opponent has it → call
    own_count = ct.get(declared, 0)
    if declared in ('A', 'B') and own_count >= 2:
        return 'call' if random.random() < 0.6 else 'fight'
    if declared in ('A', 'B'):
        return 'call' if random.random() < 0.25 else 'fight'
    return 'fight' if random.random() < 0.7 else 'call'


# ────────── AMBUSH (with bluff mechanics) ──────────
def phase_ambush(g, pidx, stats):
    if g['turn_number'] < NO_AMBUSH_BEFORE_TURN:
        return
    attempts = 0
    while attempts < AMBUSH_MAX_PER_TURN:
        p = g['players'][pidx]
        opp = g['players'][1 - pidx]
        eligible = [c for c in p['hand'] if c != '瞬']
        if not eligible or len(p['hand']) <= 3:
            break
        if not opp['hand']:
            break

        if attempts == 1:
            if len(p['hand']) < AMBUSH_SECOND_COST + 2:
                break
            my_t = total_score(g, pidx)
            opp_t = total_score(g, 1 - pidx)
            if my_t > opp_t + 20:
                break
            cost_choices = sorted(p['hand'], key=lambda c: CARD_CONFIG[c]['rank'], reverse=True)
            cost_used = []
            for c in cost_choices:
                if len(cost_used) >= AMBUSH_SECOND_COST:
                    break
                if c != '瞬':
                    cost_used.append(c)
            if len(cost_used) < AMBUSH_SECOND_COST:
                break
            for c in cost_used:
                p['hand'].remove(c)
            discard_cards(g, cost_used)
            stats['second_ambush'] += 1

        eligible = [c for c in p['hand'] if c != '瞬']
        if not eligible:
            break
        cnt = Counter(eligible)
        atk_card = None
        for pref in ['C', 'B', 'D', 'E', 'F', 'A']:
            if pref in cnt:
                if pref in 'ABCDE' and all(c in cnt for c in 'ABCDE') and cnt[pref] == 1:
                    continue
                atk_card = pref
                break
        if atk_card is None:
            atk_card = eligible[0]
        p['hand'].remove(atk_card)

        # Bluff declaration
        declared = _sim_bluff_declare(atk_card)
        if declared:
            stats['bluff_declares'] += 1
            if declared == atk_card:
                stats['bluff_truthful'] += 1
            else:
                stats['bluff_false'] += 1

        opp_eligible = [c for c in opp['hand'] if c != '瞬']
        has_shun = '瞬' in opp['hand']
        ct_opp = Counter(opp['hand'])

        # Defender response (considers bluff)
        if declared:
            response = _sim_bluff_respond(declared, atk_card, opp['hand'])
        else:
            valuable_ratio = sum(ct_opp.get(c, 0) for c in 'AB') / max(1, len(opp['hand']))
            should_fold = (len(opp['hand']) <= 3 and valuable_ratio >= 0.5 and not has_shun)
            response = 'fold' if should_fold else 'fight'

        # Handle call (challenge)
        if response == 'call' and declared:
            stats['bluff_calls'] += 1
            if atk_card == declared:
                # Truthful — defender punished
                opp['score'] -= BLUFF_TRUE_PENALTY
                discard_cards(g, [atk_card])
                draw_into_hand(g, pidx, 1)
                stats['bluff_call_wrong'] += 1
            else:
                # Liar caught
                p['score'] -= BLUFF_FALSE_PENALTY
                opp['hand'].append(atk_card)
                opp['hand'] = sort_hand(opp['hand'])
                draw_into_hand(g, 1 - pidx, 1)
                stats['bluff_call_right'] += 1
            stats['ambush_attempts'] += 1
            attempts += 1
            continue

        # Handle fold
        if response == 'fold':
            random_steal(g, pidx, 1 - pidx, AMBUSH_STEAL_COUNT)
            discard_cards(g, [atk_card])
            stats['fold'] += 1
        elif has_shun and atk_card in ('A', 'B'):
            opp['hand'].remove('瞬')
            discard_cards(g, ['瞬'])
            opp['hand'].append(atk_card)
            opp['hand'] = sort_hand(opp['hand'])
            enforce_hand_limit(g, 1 - pidx)
            stats['shun_absorb'] += 1
        elif opp_eligible:
            opp_sorted = sorted(opp_eligible, key=lambda c: CARD_CONFIG[c]['rank'])
            non_a = [c for c in opp_sorted if c != 'A']
            best_def = non_a[max(0, len(non_a) // 2 - 1)] if non_a else opp_sorted[0]
            opp['hand'].remove(best_def)
            res = compare_duel(atk_card, best_def)
            stake = BLUFF_STAKE_BONUS if declared else 0
            if res == 0:
                discard_cards(g, [atk_card, best_def])
            elif res == 1:
                stats['ambush_win_atk'] += 1
                draw_into_hand(g, pidx, 1)
                random_steal(g, pidx, 1 - pidx, AMBUSH_STEAL_COUNT)
                if stake:
                    p['score'] += stake
                    stats['bluff_stake_total'] += stake
                if atk_card == 'A' and best_def != 'F':
                    p['score'] += AMBUSH_A_WIN_BONUS
                    stats['a_win_bonus_total'] += AMBUSH_A_WIN_BONUS
                if atk_card == 'F' and best_def == 'A':
                    p['breaker_marks'] += 1
                if best_def == 'A' and atk_card != 'F':
                    opp['score'] += AMBUSH_A_LOSE_BONUS
                discard_cards(g, [atk_card, best_def])
            else:
                stats['ambush_win_def'] += 1
                draw_into_hand(g, 1 - pidx, 1)
                random_steal(g, 1 - pidx, pidx, AMBUSH_STEAL_COUNT)
                if stake:
                    opp['score'] += stake
                    stats['bluff_stake_total'] += stake
                if best_def == 'A' and atk_card != 'F':
                    opp['score'] += AMBUSH_A_WIN_BONUS
                    stats['a_win_bonus_total'] += AMBUSH_A_WIN_BONUS
                if atk_card == 'A' and best_def != 'F':
                    p['score'] += AMBUSH_A_LOSE_BONUS
                if best_def == 'F' and atk_card == 'A':
                    opp['breaker_marks'] += 1
                discard_cards(g, [atk_card, best_def])
        else:
            if has_shun:
                opp['hand'].remove('瞬')
                discard_cards(g, ['瞬'])
                opp['hand'].append(atk_card)
                opp['hand'] = sort_hand(opp['hand'])
                stats['shun_absorb'] += 1
            else:
                draw_into_hand(g, pidx, 1)
                random_steal(g, pidx, 1 - pidx, 1)
                discard_cards(g, [atk_card])

        stats['ambush_attempts'] += 1
        attempts += 1
        if attempts == 1 and total_score(g, pidx) >= total_score(g, 1 - pidx):
            break


# ────────── SPELL ──────────
def is_combo_locked(combo_cards, opp_lockdown):
    """Check if combo would be banned by opponent's lockdown."""
    if not opp_lockdown or opp_lockdown == '瞬':
        return False
    return opp_lockdown in combo_cards


def phase_spell(g, pidx, stats):
    p = g['players'][pidx]
    opp = g['players'][1 - pidx]

    while p['breaker_marks'] > 0:
        opp_sealed = sum(info['sealed'] for info in opp['scorepad'].values())
        used = False
        if opp_sealed < BREAKER_SEAL_LIMIT:
            for key in ['arcane_sequence', 'dragon_breath', 'elemental_surge',
                        'chaos_alchemy', 'triple_resonance', 'ant_colony']:
                if key in RED_KEYS and g['shared_red'][key] > 0:
                    continue
                info = opp['scorepad'][key]
                if len(info['scores']) + info['sealed'] < SLOT_MAX[key]:
                    info['sealed'] += 1
                    p['breaker_marks'] -= 1
                    stats['breaker_seal'] += 1
                    used = True
                    break
        if not used:
            opp['curse_active'] = True
            p['breaker_marks'] -= 1
            stats['breaker_curse'] += 1
        break

    playable = filter_playable(detect_playable(p['hand'], _slots_fn_for(g, pidx)))
    if not playable:
        return

    # Pick first non-locked combo, OR pay to break if combo big enough
    chosen = None
    break_used = False
    for entry in playable:
        key, _, cards, base_score = entry
        locked = is_combo_locked(cards, opp['lockdown_card'])
        if not locked:
            chosen = entry
            break
        # Try to break
        if p['breaker_marks'] > 0:
            # Use marker (free)
            p['breaker_marks'] -= 1
            stats['lockdown_break_marker'] += 1
            opp['lockdown_card'] = None  # broken
            chosen = entry
            break_used = True
            break
        my_total = total_score(g, pidx)
        # Pay 15 if combo - 15 still positive value AND we can afford (or debt)
        if base_score >= 25 and (my_total >= LOCKDOWN_BREAK_COST or LOCKDOWN_DEBT_ENABLE):
            if my_total >= LOCKDOWN_BREAK_COST:
                p['score'] -= LOCKDOWN_BREAK_COST
            else:
                debt = LOCKDOWN_BREAK_COST - my_total
                p['score'] = -p['lockdown_debt'] if total_score(g, pidx) - LOCKDOWN_BREAK_COST < 0 else p['score']
                # Simplified: deduct what we can, store rest as debt
                deduct_now = my_total
                p['score'] = max(p['score'] - deduct_now, p['score'] - LOCKDOWN_BREAK_COST)
                p['lockdown_debt'] += (LOCKDOWN_BREAK_COST - deduct_now)
            stats['lockdown_break_score'] += 1
            opp['lockdown_card'] = None
            chosen = entry
            break_used = True
            break
    if not chosen:
        return

    key, _, cards, base_score = chosen
    if p['curse_active']:
        base_score = max(0, base_score - 10)
        p['curse_active'] = False
    # Pay debt first
    if p['lockdown_debt'] > 0 and base_score > 0:
        pay = min(p['lockdown_debt'], base_score)
        base_score -= pay
        p['lockdown_debt'] -= pay
    if slots_left(g, pidx, key) <= 0:
        return
    p['scorepad'][key]['scores'].append(base_score)
    for c in cards:
        if c in p['hand']:
            p['hand'].remove(c)
    discard_cards(g, cards)
    stats['combos'][key] += 1
    if break_used:
        # Lockdown was broken, also discard the lockdown card
        pass
    if key in RED_KEYS:
        g['shared_red'][key] = 1
        random_discard(g, 1 - pidx, RED_PUNISH_DISCARD)
        stats['red_punish'] += 1
    elif key in BLUE_KEYS:
        draw_into_hand(g, pidx, BLUE_REWARD_DRAW)
    elif key in GREEN_KEYS:
        draw_into_hand(g, pidx, GREEN_REWARD_DRAW)


# ────────── END_DISCARD + LOCKDOWN_PLACE ──────────
def phase_end_discard(g, pidx):
    p = g['players'][pidx]
    # Drop opponent's lockdown card (it expires when their next turn STARTS,
    # i.e. now since we're about to flip turns and trigger their draw)
    # Actually rule says: "下回合开始时该牌进入弃牌堆" - opponent's next turn
    # = when they start their turn. So we drop it at start of next turn (handled in run loop)
    if len(p['hand']) > HAND_LIMIT:
        overflow = len(p['hand']) - HAND_LIMIT
        sorted_cards = sorted(p['hand'], key=lambda c: -CARD_CONFIG[c]['rank'])
        dumped = sorted_cards[:overflow]
        for c in dumped:
            p['hand'].remove(c)
        discard_cards(g, dumped)


def phase_lockdown_place(g, pidx, stats):
    """Decide whether to place a lockdown card."""
    p = g['players'][pidx]
    if p['lockdown_card'] is not None:
        # Already had one, but should expire BEFORE this (handled at turn start)
        p['lockdown_card'] = None
    if len(p['hand']) <= 4:
        return
    my_total = total_score(g, pidx)
    opp_total = total_score(g, 1 - pidx)
    # Lockdown when leading or close to opp's combo (heuristic)
    if my_total < opp_total - 30:
        # too far behind, don't waste
        return
    # Pick a low-rank card we have multiples of (sacrifice cost low)
    ct = Counter(p['hand'])
    # Banning C/D maximally cripples mid combos. Banning F kills ant_colony.
    candidates = ['F', 'D', 'C', 'E', 'B', 'A']
    chosen = None
    for c in candidates:
        if ct.get(c, 0) >= 2:  # have spare
            chosen = c
            break
    if chosen is None:
        return
    # Don't lockdown too often (cost = 1 hand card)
    if random.random() > 0.45:
        return
    p['hand'].remove(chosen)
    p['lockdown_card'] = chosen
    stats['lockdown_placed'] += 1


# ────────── MAIN LOOP ──────────
def run_one_game():
    g = make_game()
    g['players'][0]['hand'] = sort_hand(draw_cards(g['deck'], INITIAL_HAND_P0))
    g['players'][1]['hand'] = sort_hand(draw_cards(g['deck'], INITIAL_HAND_P1))
    g['players'][0]['score'] = FIRST_PLAYER_BONUS
    if int(os.environ.get('P1_OD_T1', 0)):
        g['players'][1]['overdraft'] = True
    init_market(g)

    stats = {
        'ambush_attempts': 0, 'second_ambush': 0,
        'fold': 0, 'shun_absorb': 0,
        'ambush_win_atk': 0, 'ambush_win_def': 0,
        'breaker_seal': 0, 'breaker_curse': 0,
        'red_punish': 0,
        'market_buys': 0, 'dark_buys': 0,
        'lockdown_placed': 0,
        'lockdown_break_marker': 0, 'lockdown_break_score': 0,
        'a_win_bonus_total': 0,
        'bluff_declares': 0, 'bluff_truthful': 0, 'bluff_false': 0,
        'bluff_calls': 0, 'bluff_call_right': 0, 'bluff_call_wrong': 0,
        'bluff_stake_total': 0,
        'combos': Counter(),
        'turns': 0,
    }

    max_turns = 80
    while g['winner'] == -1 and g['turn_number'] <= max_turns:
        cp = g['current']
        # Drop opponent's lockdown card (expires at start of locked player's turn)
        # The card was placed by opp (1-cp) at end of THEIR last turn.
        # Now cp's turn starts → opp's lockdown card should remain and apply during cp's spell.
        # It expires AT START of opp's NEXT turn = end of cp's turn loop.
        # So we don't drop it here.

        if not g['deck'] and all(len(pp['hand']) == 0 for pp in g['players']):
            break

        phase_draw(g, cp)
        phase_market(g, cp, stats)
        phase_ambush(g, cp, stats)
        phase_spell(g, cp, stats)
        phase_end_discard(g, cp)
        phase_lockdown_place(g, cp, stats)

        # Now opponent's lockdown card (if any) expires
        opp_idx = 1 - cp
        if g['players'][opp_idx]['lockdown_card'] is not None:
            discard_cards(g, [g['players'][opp_idx]['lockdown_card']])
            g['players'][opp_idx]['lockdown_card'] = None

        for i in (0, 1):
            if total_score(g, i) >= WIN_SCORE:
                g['winner'] = i
                break
        if g['winner'] != -1:
            break

        if not g['deck']:
            s0, s1 = total_score(g, 0), total_score(g, 1)
            if s0 > s1:
                g['winner'] = 0
            elif s1 > s0:
                g['winner'] = 1
            else:
                g['winner'] = 0
            break

        g['current'] = 1 - g['current']
        g['turn_number'] += 1

    stats['turns'] = g['turn_number']
    stats['score_p0'] = total_score(g, 0)
    stats['score_p1'] = total_score(g, 1)
    stats['winner'] = g['winner'] if g['winner'] >= 0 else -1
    stats['win_by_race'] = (stats['winner'] >= 0 and
                            max(stats['score_p0'], stats['score_p1']) >= WIN_SCORE)
    return stats


def run_batch(n=5000):
    agg = {
        'p0_wins': 0, 'p1_wins': 0,
        'total_turns': 0,
        'total_score_winner': 0, 'total_score_loser': 0,
        'ambush_attempts': 0, 'second_ambush': 0,
        'fold': 0, 'shun_absorb': 0,
        'ambush_win_atk': 0, 'ambush_win_def': 0,
        'breaker_seal': 0, 'breaker_curse': 0,
        'red_punish': 0,
        'market_buys': 0, 'dark_buys': 0,
        'lockdown_placed': 0,
        'lockdown_break_marker': 0, 'lockdown_break_score': 0,
        'a_win_bonus_total': 0,
        'bluff_declares': 0, 'bluff_truthful': 0, 'bluff_false': 0,
        'bluff_calls': 0, 'bluff_call_right': 0, 'bluff_call_wrong': 0,
        'bluff_stake_total': 0,
        'combos': Counter(),
        'race_wins': 0, 'collision_wins': 0,
    }

    for _ in range(n):
        s = run_one_game()
        if s['winner'] == 0:
            agg['p0_wins'] += 1
        elif s['winner'] == 1:
            agg['p1_wins'] += 1
        agg['total_turns'] += s['turns']
        ws = s['score_p0'] if s['winner'] == 0 else s['score_p1']
        ls = s['score_p1'] if s['winner'] == 0 else s['score_p0']
        agg['total_score_winner'] += ws
        agg['total_score_loser'] += ls
        for k in ['ambush_attempts','second_ambush','fold','shun_absorb',
                  'ambush_win_atk','ambush_win_def','breaker_seal','breaker_curse',
                  'red_punish','market_buys','dark_buys','lockdown_placed',
                  'lockdown_break_marker','lockdown_break_score','a_win_bonus_total',
                  'bluff_declares','bluff_truthful','bluff_false',
                  'bluff_calls','bluff_call_right','bluff_call_wrong','bluff_stake_total']:
            agg[k] += s[k]
        for k, v in s['combos'].items():
            agg['combos'][k] += v
        if s['win_by_race']:
            agg['race_wins'] += 1
        else:
            agg['collision_wins'] += 1
    return agg


def print_report(agg, n):
    print("=" * 70)
    print(f"V5.0 MONTE CARLO — {n} games")
    print("=" * 70)
    print(f"\n[WIN RATE]")
    print(f"  P0 (first):  {agg['p0_wins']}/{n}  = {agg['p0_wins']/n*100:.2f}%")
    print(f"  P1 (second): {agg['p1_wins']}/{n}  = {agg['p1_wins']/n*100:.2f}%")
    diff = abs(agg['p0_wins'] - agg['p1_wins']) / n * 100
    print(f"  Diff:        {diff:.2f}%")
    print(f"\n[GAME LENGTH]")
    print(f"  Avg turns:   {agg['total_turns']/n:.2f}")
    print(f"\n[VICTORY TYPE]")
    print(f"  Race (>={WIN_SCORE}):   {agg['race_wins']}/{n} = {agg['race_wins']/n*100:.1f}%")
    print(f"  Collision (deck out): {agg['collision_wins']}/{n} = {agg['collision_wins']/n*100:.1f}%")
    print(f"\n[AVG SCORES]")
    print(f"  Winner avg: {agg['total_score_winner']/n:.2f}")
    print(f"  Loser avg:  {agg['total_score_loser']/n:.2f}")
    print(f"  Margin:     {(agg['total_score_winner']-agg['total_score_loser'])/n:.2f}")
    print(f"\n[AMBUSH]")
    print(f"  Attempts/game:        {agg['ambush_attempts']/n:.2f}")
    print(f"  2nd ambush/game:      {agg['second_ambush']/n:.2f}")
    print(f"  Fold/game:            {agg['fold']/n:.2f}")
    print(f"  瞬 absorb/game:       {agg['shun_absorb']/n:.2f}")
    print(f"  Atk wins/game:        {agg['ambush_win_atk']/n:.2f}")
    print(f"  Def wins/game:        {agg['ambush_win_def']/n:.2f}")
    if agg['ambush_win_atk'] + agg['ambush_win_def'] > 0:
        atk = agg['ambush_win_atk'] / (agg['ambush_win_atk'] + agg['ambush_win_def']) * 100
        print(f"  Atk winrate:          {atk:.1f}%")
    print(f"  A-win-bonus total/game: {agg['a_win_bonus_total']/n:.2f}")
    print(f"\n[BLUFF / 虚实之言]")
    print(f"  Declarations/game:    {agg['bluff_declares']/n:.2f}")
    if agg['bluff_declares'] > 0:
        print(f"    Truthful:           {agg['bluff_truthful']/n:.2f} ({agg['bluff_truthful']/agg['bluff_declares']*100:.1f}%)")
        print(f"    False:              {agg['bluff_false']/n:.2f} ({agg['bluff_false']/agg['bluff_declares']*100:.1f}%)")
    print(f"  Calls (拆穿)/game:    {agg['bluff_calls']/n:.2f}")
    if agg['bluff_calls'] > 0:
        print(f"    Caught liar:        {agg['bluff_call_right']/n:.2f} ({agg['bluff_call_right']/agg['bluff_calls']*100:.1f}%)")
        print(f"    Wrong call:         {agg['bluff_call_wrong']/n:.2f} ({agg['bluff_call_wrong']/agg['bluff_calls']*100:.1f}%)")
    print(f"  Stake bonus total/game: {agg['bluff_stake_total']/n:.2f}")
    print(f"\n[BLACK MARKET]")
    print(f"  Buys/game:            {agg['market_buys']/n:.2f}")
    print(f"  Dark-night buys/game: {agg['dark_buys']/n:.2f}")
    print(f"\n[LOCKDOWN]")
    print(f"  Placed/game:          {agg['lockdown_placed']/n:.2f}")
    print(f"  Marker breaks/game:   {agg['lockdown_break_marker']/n:.2f}")
    print(f"  15-pt breaks/game:    {agg['lockdown_break_score']/n:.2f}")
    print(f"\n[BREAKER MARKS]")
    print(f"  Seals/game:  {agg['breaker_seal']/n:.2f}")
    print(f"  Curses/game: {agg['breaker_curse']/n:.2f}")
    print(f"  Red punish/game: {agg['red_punish']/n:.2f}")
    print(f"\n[COMBOS per game]")
    names = {'dragon_breath':'龙吐(红)','arcane_sequence':'大顺(红)',
             'elemental_surge':'激流(蓝)','chaos_alchemy':'炼金(蓝)',
             'triple_resonance':'三条(绿)','ant_colony':'蚁群(绿)'}
    for k in ['dragon_breath','arcane_sequence','elemental_surge',
              'chaos_alchemy','triple_resonance','ant_colony']:
        print(f"  {names[k]:12s}: {agg['combos'][k]/n:.2f}")
    print("=" * 70)


if __name__ == '__main__':
    n = 5000 if len(sys.argv) < 2 else int(sys.argv[1])
    random.seed(42)
    print(f"Running {n} V5.0 simulations...")
    print(f"WIN_SCORE={WIN_SCORE}, A+win={AMBUSH_A_WIN_BONUS}, "
          f"2nd-cost={AMBUSH_SECOND_COST}, sac-window={SACRIFICE_WINDOW}")
    print(f"Market: size={MARKET_SIZE} deck-guard={MARKET_DECK_GUARD} "
          f"dark-every={MARKET_DARK_INTERVAL}, Lock-cost={LOCKDOWN_BREAK_COST}")
    print()
    agg = run_batch(n)
    print_report(agg, n)
