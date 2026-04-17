"""V3.0 Monte Carlo simulation — verify balance with new mechanics.

V3.0 changes simulated:
- Auto draw (no manual button)
- Ambush max 2/turn, 2nd costs 2 open-discard
- Fold option: attacker steals 1 random card, attack card returns
- Defend: winner draws 1 + steals 1; 瞬 absorbs attack card, forces tie
- Red zone SHARED globally (1 dragon_breath slot, 1 arcane_sequence slot)
- Red complete → opponent random-discard 2
- Blue complete → draw 1; Green complete → draw 2
- A win +8 / A lose +3 / F>A gives breaker
- No scavenge / No instant-echo / Keep breaker / Keep overdraft
- Sacrifice rebuilt: discard X, pick X from last 3 turns, -scored points, end turn

Both players use same heuristic AI → measures mechanical balance only.
"""
import random
import sys
from collections import Counter, defaultdict
from game_logic import create_deck, sort_hand, bv, draw_cards, compare_duel
from scoring import detect_playable, find_combos
from game_state import CARD_CONFIG, SCORE_MULT

# ────────── V3.0 PARAMETERS ──────────
import os
WIN_SCORE = int(os.environ.get('WIN_SCORE', 140))
AMBUSH_A_WIN_BONUS = int(os.environ.get('A_WIN', 8))
AMBUSH_A_LOSE_BONUS = int(os.environ.get('A_LOSE', 3))
AMBUSH_MAX_PER_TURN = 2
AMBUSH_SECOND_COST = int(os.environ.get('COST', 2))
AMBUSH_STEAL_COUNT = 1
BLUE_REWARD_DRAW = int(os.environ.get('BLUE', 1))
GREEN_REWARD_DRAW = int(os.environ.get('GREEN', 1))
RED_PUNISH_DISCARD = 2
SACRIFICE_MAX_X = 3
SACRIFICE_WINDOW = 3
HAND_LIMIT = 8
INITIAL_HAND_P0 = int(os.environ.get('P0_HAND', 5))
INITIAL_HAND_P1 = int(os.environ.get('P1_HAND', 6))
FIRST_PLAYER_BONUS = int(os.environ.get('FP_BONUS', 1))
BREAKER_SEAL_LIMIT = 3
INSTANT_PER_TURN = 1

RED_KEYS = {'dragon_breath', 'arcane_sequence'}
BLUE_KEYS = {'elemental_surge', 'chaos_alchemy'}
GREEN_KEYS = {'triple_resonance', 'ant_colony'}

SLOT_MAX = {
    'dragon_breath': 1, 'arcane_sequence': 1,
    'elemental_surge': 2, 'chaos_alchemy': 2,
    'triple_resonance': 2, 'ant_colony': 2,
}
TIER = {
    'dragon_breath': 1, 'arcane_sequence': 1,
    'elemental_surge': 2, 'chaos_alchemy': 2,
    'triple_resonance': 3, 'ant_colony': 3,
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
        'winner': -1,
    }


def make_player():
    return {
        'hand': [],
        'score': 0,
        'breaker_marks': 0,
        'overdraft': False,
        'scorepad': {
            'dragon_breath':   {'scores': [], 'sealed': 0},
            'arcane_sequence': {'scores': [], 'sealed': 0},
            'elemental_surge': {'scores': [], 'sealed': 0},
            'chaos_alchemy':   {'scores': [], 'sealed': 0},
            'triple_resonance':{'scores': [], 'sealed': 0},
            'ant_colony':      {'scores': [], 'sealed': 0},
        },
        'curse_active': False,
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
        taken = g['shared_red'][key]
        return (SLOT_MAX[key] - taken) if taken == 0 and len(info['scores']) == 0 else 0
    return SLOT_MAX[key] - len(info['scores']) - info['sealed']


def _slots_fn_for(g, pidx):
    return lambda key: slots_left(g, pidx, key)


ANT_COLONY_MIN_F = 3


def filter_playable_v3(playable):
    """Apply V3.0 ant_colony min-3 rule."""
    out = []
    for entry in playable:
        key, name, cards, score = entry
        if key == 'ant_colony' and len(cards) < ANT_COLONY_MIN_F:
            continue
        out.append(entry)
    return out


def enforce_hand_limit(g, pidx):
    """If player's hand > limit, discard lowest-rank cards to fit."""
    p = g['players'][pidx]
    if len(p['hand']) <= HAND_LIMIT:
        return
    overflow = len(p['hand']) - HAND_LIMIT
    sorted_cards = sorted(p['hand'], key=lambda c: -CARD_CONFIG[c]['rank'])
    dumped = sorted_cards[:overflow]
    for c in dumped:
        p['hand'].remove(c)
    discard_cards(g, dumped)


def discard_cards(g, cards):
    for c in cards:
        g['discard_pile'].append(c)
        g['discard_turns'].append(g['turn_number'])


def draw_into_hand(g, pidx, n):
    drawn = draw_cards(g['deck'], n)
    g['players'][pidx]['hand'].extend(drawn)
    g['players'][pidx]['hand'] = sort_hand(g['players'][pidx]['hand'])
    return len(drawn)


def random_steal(g, thief_idx, victim_idx, n=1):
    """Steal n random cards from victim to thief."""
    stolen = []
    victim = g['players'][victim_idx]
    for _ in range(n):
        if not victim['hand']:
            break
        card = random.choice(victim['hand'])
        victim['hand'].remove(card)
        g['players'][thief_idx]['hand'].append(card)
        stolen.append(card)
    g['players'][thief_idx]['hand'] = sort_hand(g['players'][thief_idx]['hand'])
    return stolen


def random_discard(g, pidx, n):
    p = g['players'][pidx]
    dumped = []
    for _ in range(n):
        if not p['hand']:
            break
        card = random.choice(p['hand'])
        p['hand'].remove(card)
        dumped.append(card)
    discard_cards(g, dumped)
    return dumped


# ────────── PHASES ──────────
def phase_draw(g, pidx):
    p = g['players'][pidx]
    n = 1 if p['overdraft'] else 2
    p['overdraft'] = False
    draw_into_hand(g, pidx, n)


NO_AMBUSH_BEFORE_TURN = int(os.environ.get('NO_AMB', 0))


def phase_ambush(g, pidx, stats):
    """Two attempts max, smart decision."""
    # Balance mechanic: no ambush before this turn number
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

        # 2nd attempt needs to pay cost_cards
        if attempts == 1:
            if len(p['hand']) < AMBUSH_SECOND_COST + 2:
                break
            # Heuristic: only do 2nd if score behind or hand strong
            my_total = total_score(g, pidx)
            opp_total = total_score(g, 1 - pidx)
            if my_total > opp_total + 20 and len(p['hand']) < HAND_LIMIT:
                break
            cost_choices = sorted(p['hand'], key=lambda c: CARD_CONFIG[c]['rank'], reverse=True)
            cost_used = []
            for c in cost_choices:
                if len(cost_used) >= AMBUSH_SECOND_COST:
                    break
                if c != '瞬':  # don't waste 瞬
                    cost_used.append(c)
            if len(cost_used) < AMBUSH_SECOND_COST:
                break
            for c in cost_used:
                p['hand'].remove(c)
            discard_cards(g, cost_used)
            stats['second_ambush'] += 1

        # Attacker picks balanced card (C/D), avoid A/B (combos) and F (loses to A)
        eligible = [c for c in p['hand'] if c != '瞬']
        if not eligible:
            break
        cnt = Counter(eligible)
        # Prefer C, then B, then D (medium strength)
        atk_card = None
        for pref in ['C', 'B', 'D', 'E', 'F', 'A']:
            if pref in cnt:
                # Don't attack with card needed for arcane_sequence (A,B,C,D,E each once)
                # If it's the only one of its kind and we have all 5, skip
                if pref in 'ABCDE' and all(c in cnt for c in 'ABCDE') and cnt[pref] == 1:
                    continue
                atk_card = pref
                break
        if atk_card is None:
            atk_card = eligible[0]
        p['hand'].remove(atk_card)

        # Defender decides: fold vs defend
        opp_eligible = [c for c in opp['hand'] if c != '瞬']
        has_shun = '瞬' in opp['hand']

        # Defender fold heuristic: fold when losing is certain and steal cost < defend cost
        # (attacker steals 1 random but doesn't get our defender card; we save combo pieces)
        fold_ok = len(opp['hand']) >= 1
        if fold_ok and not has_shun and not opp_eligible:
            # Only 瞬 in hand - can only fold or use 瞬
            pass

        # Handle: empty defender (no cards at all)
        if not opp['hand']:
            # Rule fix #2: auto-win, no steal possible, draw 2 as compensation
            draw_into_hand(g, pidx, 2)
            discard_cards(g, [atk_card])
            stats['ambush_win_atk'] += 1
            stats['ambush_attempts'] += 1
            attempts += 1
            break

        # Fold policy: defender folds if holding ONLY valuable combo cards (A/B)
        # and attacker likely weaker (but defender doesn't see atk).
        # Simple heuristic: fold if hand size is small AND hand has high-value cards
        ct_opp = Counter(opp['hand'])
        valuable_ratio = sum(ct_opp.get(c, 0) for c in 'AB') / max(1, len(opp['hand']))
        should_fold = (len(opp['hand']) <= 3 and valuable_ratio >= 0.5 and not has_shun)

        if should_fold:
            # Rule fix #1: attack card goes to DISCARD (not back to attacker)
            random_steal(g, pidx, 1 - pidx, 1)
            discard_cards(g, [atk_card])
            stats['fold'] += 1
        elif has_shun and atk_card in ('A', 'B'):
            # Defender uses 瞬 to absorb high-value attack
            opp['hand'].remove('瞬')
            discard_cards(g, ['瞬'])
            opp['hand'].append(atk_card)
            opp['hand'] = sort_hand(opp['hand'])
            # Rule fix #3: if defender now over limit, immediate discard
            enforce_hand_limit(g, 1 - pidx)
            stats['shun_absorb'] += 1
        elif opp_eligible:
            # Defend — BLIND selection (defender cannot see atk_card!)
            # Strategy: expected-value play based on attack distribution.
            # Play median-strength card: NOT the strongest (save for combos) and NOT weakest.
            # Expected atk distribution in hand is skewed low (D/E/F common).
            # Heuristic: pick "middle" card by rank.
            opp_sorted = sorted(opp_eligible, key=lambda c: CARD_CONFIG[c]['rank'])
            # Prefer C/D as defender (balanced), avoid using A (too valuable)
            # Remove A from consideration unless only A left
            non_a = [c for c in opp_sorted if c != 'A']
            if non_a:
                # Pick middle-to-slightly-strong
                mid_idx = max(0, len(non_a) // 2 - 1)
                best_def = non_a[mid_idx]
            else:
                best_def = opp_sorted[0]
            opp['hand'].remove(best_def)
            res = compare_duel(atk_card, best_def)

            if res == 0:
                # Rule fix #6: A vs A tie gives NO bonus
                discard_cards(g, [atk_card, best_def])
            elif res == 1:
                # Attacker wins
                stats['ambush_win_atk'] += 1
                draw_into_hand(g, pidx, 1)
                random_steal(g, pidx, 1 - pidx, AMBUSH_STEAL_COUNT)
                # A-win bonus (only when A beat non-F)
                if atk_card == 'A' and best_def != 'F':
                    p['score'] += AMBUSH_A_WIN_BONUS
                # F>A godslayer: F gets breaker, A gets NO +3 (rule fix #7)
                if atk_card == 'F' and best_def == 'A':
                    p['breaker_marks'] += 1
                # A-lose consolation (only when A beaten by non-F)
                if best_def == 'A' and atk_card != 'F':
                    opp['score'] += AMBUSH_A_LOSE_BONUS
                discard_cards(g, [atk_card, best_def])
            else:
                # Defender wins
                stats['ambush_win_def'] += 1
                draw_into_hand(g, 1 - pidx, 1)
                random_steal(g, 1 - pidx, pidx, AMBUSH_STEAL_COUNT)
                if best_def == 'A' and atk_card != 'F':
                    opp['score'] += AMBUSH_A_WIN_BONUS
                if atk_card == 'A' and best_def != 'F':
                    p['score'] += AMBUSH_A_LOSE_BONUS
                if best_def == 'F' and atk_card == 'A':
                    opp['breaker_marks'] += 1
                discard_cards(g, [atk_card, best_def])
        else:
            # Defender only has 瞬 → must use 瞬
            if has_shun:
                opp['hand'].remove('瞬')
                discard_cards(g, ['瞬'])
                opp['hand'].append(atk_card)
                opp['hand'] = sort_hand(opp['hand'])
                stats['shun_absorb'] += 1
            else:
                # Empty — no defender card
                draw_into_hand(g, pidx, 1)
                random_steal(g, pidx, 1 - pidx, 1)
                discard_cards(g, [atk_card])

        stats['ambush_attempts'] += 1
        attempts += 1
        # Stop if strong card now; only try 2nd if in need
        if attempts == 1 and total_score(g, pidx) >= total_score(g, 1 - pidx):
            break


def phase_spell(g, pidx, stats):
    """Simple greedy: use breakers first, then highest-scoring combo."""
    p = g['players'][pidx]

    # Use breaker if have marks
    while p['breaker_marks'] > 0:
        opp = g['players'][1 - pidx]
        opp_sealed = sum(info['sealed'] for info in opp['scorepad'].values())
        used = False
        if opp_sealed < BREAKER_SEAL_LIMIT:
            # Seal highest-value open slot
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
            # Use curse
            opp['curse_active'] = True
            p['breaker_marks'] -= 1
            stats['breaker_curse'] += 1
        break  # only 1 breaker per turn (heuristic)

    # Try best combo (apply V3 ant_colony min-3 rule)
    playable = filter_playable_v3(detect_playable(p['hand'], _slots_fn_for(g, pidx)))
    played = []
    if playable:
        key, _, cards, base_score = playable[0]
        if p['curse_active']:
            base_score = max(0, base_score - 10)
            p['curse_active'] = False
        # Check slot again (shared red)
        if slots_left(g, pidx, key) > 0:
            p['scorepad'][key]['scores'].append(base_score)
            for c in cards:
                if c in p['hand']:
                    p['hand'].remove(c)
            played = cards
            stats['combos'][key] += 1

            if key in RED_KEYS:
                # Mark shared as taken
                g['shared_red'][key] = 1
                # Punish opponent: random discard 2
                random_discard(g, 1 - pidx, RED_PUNISH_DISCARD)
                stats['red_punish'] += 1
            elif key in BLUE_KEYS:
                draw_into_hand(g, pidx, BLUE_REWARD_DRAW)
            elif key in GREEN_KEYS:
                draw_into_hand(g, pidx, GREEN_REWARD_DRAW)

    if played:
        discard_cards(g, played)


def phase_end(g, pidx):
    # Discard overflow
    p = g['players'][pidx]
    if len(p['hand']) > HAND_LIMIT:
        # Discard lowest-value cards
        overflow = len(p['hand']) - HAND_LIMIT
        sorted_cards = sorted(p['hand'], key=lambda c: -CARD_CONFIG[c]['rank'])
        discard_set = sorted_cards[:overflow]
        for c in discard_set:
            p['hand'].remove(c)
        discard_cards(g, discard_set)


# ────────── MAIN LOOP ──────────
def run_one_game():
    g = make_game()
    # Deal initial hands
    p0 = draw_cards(g['deck'], INITIAL_HAND_P0)
    p1 = draw_cards(g['deck'], INITIAL_HAND_P1)
    g['players'][0]['hand'] = sort_hand(p0)
    g['players'][1]['hand'] = sort_hand(p1)
    g['players'][0]['score'] = FIRST_PLAYER_BONUS

    stats = {
        'ambush_attempts': 0, 'second_ambush': 0,
        'fold': 0, 'shun_absorb': 0,
        'ambush_win_atk': 0, 'ambush_win_def': 0,
        'breaker_seal': 0, 'breaker_curse': 0,
        'red_punish': 0,
        'combos': Counter(),
        'turns': 0,
    }

    max_turns = 80
    while g['winner'] == -1 and g['turn_number'] <= max_turns:
        cp = g['current']
        if not g['deck'] and all(len(pp['hand']) == 0 for pp in g['players']):
            break

        phase_draw(g, cp)
        phase_ambush(g, cp, stats)
        phase_spell(g, cp, stats)
        phase_end(g, cp)

        # Check race win
        for i in (0, 1):
            if total_score(g, i) >= WIN_SCORE:
                g['winner'] = i
                break
        if g['winner'] != -1:
            break

        # Deck empty → enter collision simplified: higher score wins
        if not g['deck']:
            s0, s1 = total_score(g, 0), total_score(g, 1)
            if s0 > s1:
                g['winner'] = 0
            elif s1 > s0:
                g['winner'] = 1
            else:
                g['winner'] = 0  # tie-break P0
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
        winner_score = s['score_p0'] if s['winner'] == 0 else s['score_p1']
        loser_score = s['score_p1'] if s['winner'] == 0 else s['score_p0']
        agg['total_score_winner'] += winner_score
        agg['total_score_loser'] += loser_score
        agg['ambush_attempts'] += s['ambush_attempts']
        agg['second_ambush'] += s['second_ambush']
        agg['fold'] += s['fold']
        agg['shun_absorb'] += s['shun_absorb']
        agg['ambush_win_atk'] += s['ambush_win_atk']
        agg['ambush_win_def'] += s['ambush_win_def']
        agg['breaker_seal'] += s['breaker_seal']
        agg['breaker_curse'] += s['breaker_curse']
        agg['red_punish'] += s['red_punish']
        for k, v in s['combos'].items():
            agg['combos'][k] += v
        if s['win_by_race']:
            agg['race_wins'] += 1
        else:
            agg['collision_wins'] += 1

    return agg


def print_report(agg, n):
    print("=" * 70)
    print(f"V3.0 MONTE CARLO — {n} games")
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

    print(f"\n[AMBUSH STATS] per game avg")
    print(f"  Attempts/game:        {agg['ambush_attempts']/n:.2f}")
    print(f"  2nd ambush/game:      {agg['second_ambush']/n:.2f}")
    print(f"  Fold/game:            {agg['fold']/n:.2f}")
    print(f"  瞬 absorb/game:       {agg['shun_absorb']/n:.2f}")
    print(f"  Atk wins/game:        {agg['ambush_win_atk']/n:.2f}")
    print(f"  Def wins/game:        {agg['ambush_win_def']/n:.2f}")
    if agg['ambush_win_atk'] + agg['ambush_win_def'] > 0:
        atk_rate = agg['ambush_win_atk'] / (agg['ambush_win_atk'] + agg['ambush_win_def']) * 100
        print(f"  Atk winrate:          {atk_rate:.1f}%")

    print(f"\n[BREAKER]")
    print(f"  Seals/game:  {agg['breaker_seal']/n:.2f}")
    print(f"  Curses/game: {agg['breaker_curse']/n:.2f}")

    print(f"\n[RED ZONE]")
    print(f"  Red punishes/game: {agg['red_punish']/n:.2f} (0-2 max)")

    print(f"\n[COMBOS completed per game]")
    combo_names = {
        'dragon_breath': '龙吐 (红)',
        'arcane_sequence': '大顺 (红)',
        'elemental_surge': '激流 (蓝)',
        'chaos_alchemy': '炼金 (蓝)',
        'triple_resonance': '三条 (绿)',
        'ant_colony': '蚁群 (绿)',
    }
    for k in ['dragon_breath', 'arcane_sequence', 'elemental_surge',
              'chaos_alchemy', 'triple_resonance', 'ant_colony']:
        v = agg['combos'][k]
        print(f"  {combo_names[k]:12s}: {v/n:.2f}")

    print("=" * 70)


if __name__ == '__main__':
    n = 5000 if len(sys.argv) < 2 else int(sys.argv[1])
    random.seed(42)
    print(f"Running {n} simulations with V3.0 rules...")
    print(f"WIN_SCORE={WIN_SCORE}, A+win={AMBUSH_A_WIN_BONUS}/A-loss={AMBUSH_A_LOSE_BONUS}")
    print(f"2nd-cost={AMBUSH_SECOND_COST}, blue-draw={BLUE_REWARD_DRAW}, "
          f"green-draw={GREEN_REWARD_DRAW}, red-punish={RED_PUNISH_DISCARD}")
    print()
    agg = run_batch(n)
    print_report(agg, n)
