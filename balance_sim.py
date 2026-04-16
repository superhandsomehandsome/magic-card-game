"""Monte Carlo simulator for balance testing.

Simulates thousands of games with heuristic AI players to measure:
- Race-win (150pt) vs Mana-Collision ratio
- Average turns, scores, combo completion rates

Usage:
    python balance_sim.py                  # baseline 10k games
    python balance_sim.py --sweep          # parameter sweep
"""
import random, sys
from collections import Counter, defaultdict
from game_logic import create_deck, sort_hand, bv, draw_cards, compare_duel, hand_overflow
from scoring import find_combos, apply_modifiers
from collision import init as col_init, next_round as col_next
from game_state import (CARD_CONFIG, SCOREPAD_CONFIG, HAND_LIMIT, WIN_SCORE,
                        SCORE_MULT, INITIAL_HAND_P0, INITIAL_HAND_P1,
                        SCAVENGE_LIMIT, SEAL_LIMIT, INSTANT_PER_TURN)

# ── Configurable parameters ────────────────────────────
DEFAULT_CFG = {
    'win_score': WIN_SCORE,
    'deck_cards': None,       # None = use CARD_CONFIG as-is
    'score_mult': SCORE_MULT,
    'holy_bonus': 10,
    'initial_hand': (INITIAL_HAND_P0, INITIAL_HAND_P1),
    'scavenge_limit': SCAVENGE_LIMIT,
    'seal_limit': SEAL_LIMIT,
    'instant_per_turn': INSTANT_PER_TURN,
}

# ── Helpers ─────────────────────────────────────────────

def _make_deck(cfg):
    """Build and shuffle deck, optionally with extra cards."""
    extra = cfg.get('deck_cards')
    if extra:
        deck = []
        for card, count in extra.items():
            deck.extend([card] * count)
    else:
        deck = []
        for card, info in CARD_CONFIG.items():
            deck.extend([card] * info['count'])
    random.shuffle(deck)
    return deck


def _make_scorepad():
    pad = {}
    for c in SCOREPAD_CONFIG:
        pad[c['key']] = {'max': c['max_slots'], 'scores': [], 'sealed': 0}
    return pad


def _slots_left(pad, key):
    i = pad[key]
    return i['max'] - len(i['scores']) - i['sealed']


def _total_score(p):
    s = p['score']
    for v in p['pad'].values():
        s += sum(v['scores'])
    return s


def _total_sealed(pad):
    return sum(v['sealed'] for v in pad.values())


def _duel_eligible(hand):
    return [c for c in hand if c != '瞬']

# ── AI decision functions ───────────────────────────────

def _ai_pick_attack_card(hand):
    """Attacker picks a mid-tier card, saving A for combos."""
    eligible = _duel_eligible(hand)
    if not eligible:
        return None
    ranks = sorted(eligible, key=lambda c: CARD_CONFIG[c]['rank'])
    mid = len(ranks) // 2
    return ranks[mid]


def _ai_pick_defend_card(hand, atk_card):
    """Defender picks a card. May play 瞬 to force tie if outmatched."""
    eligible = _duel_eligible(hand)
    has_instant = '瞬' in hand

    if not eligible and not has_instant:
        return None

    if not eligible and has_instant:
        return '瞬'

    best_def = min(eligible, key=lambda c: CARD_CONFIG[c]['rank'])
    would_win = compare_duel(atk_card, best_def) == -1

    if not would_win and has_instant and random.random() < 0.6:
        return '瞬'

    return max(eligible, key=lambda c: CARD_CONFIG[c]['rank'])


def _ai_best_combo(hand, pad, echo, curse, score_mult):
    """Find the highest-scoring playable combo from hand."""
    playable = [c for c in hand if c != '瞬']
    ct = Counter(playable)
    candidates = []

    # Dragon breath
    for card, cnt in ct.items():
        if cnt >= 5 and _slots_left(pad, 'dragon_breath') > 0:
            cards = [card] * 5
            base = int((40 + bv(card) * 5) * score_mult)
            final = apply_modifiers(base, echo, curse)
            candidates.append(('dragon_breath', cards, final))

    # Arcane sequence
    if all(c in ct for c in 'ABCDE') and _slots_left(pad, 'arcane_sequence') > 0:
        base = int(45 * score_mult)
        final = apply_modifiers(base, echo, curse)
        candidates.append(('arcane_sequence', ['A','B','C','D','E'], final))

    # Elemental surge
    if all(c in ct for c in ['B','C','D','E','F']) and _slots_left(pad, 'elemental_surge') > 0:
        base = int(30 * score_mult)
        final = apply_modifiers(base, echo, curse)
        candidates.append(('elemental_surge', ['B','C','D','E','F'], final))

    # Chaos alchemy
    if _slots_left(pad, 'chaos_alchemy') > 0:
        for c3, n3 in ct.items():
            if n3 >= 3:
                for c2, n2 in ct.items():
                    if c2 != c3 and n2 >= 2:
                        cards = [c3]*3 + [c2]*2
                        base = int((20 + sum(bv(c) for c in cards)) * score_mult)
                        final = apply_modifiers(base, echo, curse)
                        candidates.append(('chaos_alchemy', cards, final))

    # Triple resonance
    if _slots_left(pad, 'triple_resonance') > 0:
        for card, cnt in ct.items():
            if cnt >= 3:
                cards = [card] * 3
                base = int((10 + bv(card) * 3) * score_mult)
                final = apply_modifiers(base, echo, curse)
                candidates.append(('triple_resonance', cards, final))

    # Ant colony
    if _slots_left(pad, 'ant_colony') > 0:
        f_cnt = ct.get('F', 0)
        if f_cnt >= 1:
            cards = ['F'] * f_cnt
            base = int(f_cnt * 5 * score_mult)
            final = apply_modifiers(base, echo, curse)
            candidates.append(('ant_colony', cards, final))

    if not candidates:
        return None
    candidates.sort(key=lambda x: x[2], reverse=True)
    return candidates[0]


def _ai_collision_order(hand):
    """Order cards for collision: strong cards first, 瞬 in middle."""
    strong = sorted([c for c in hand if c not in ('瞬', 'F')],
                    key=lambda c: CARD_CONFIG[c]['rank'])
    instants = [c for c in hand if c == '瞬']
    fs = [c for c in hand if c == 'F']
    mid = len(strong) // 2
    return strong[:mid] + fs + instants + strong[mid:]

# ── Main simulation loop ───────────────────────────────

def simulate_game(cfg=None):
    """Simulate one full game. Returns result dict."""
    if cfg is None:
        cfg = DEFAULT_CFG
    win_score = cfg['win_score']
    score_mult = cfg.get('score_mult', 1.0)
    holy_bonus = cfg.get('holy_bonus', 10)
    scav_limit = cfg.get('scavenge_limit', 5)
    seal_limit = cfg.get('seal_limit', 3)
    inst_limit = cfg.get('instant_per_turn', 1)
    init_hands = cfg.get('initial_hand', (5, 6))

    deck = _make_deck(cfg)
    discard = []
    players = []
    for i in range(2):
        h = sort_hand(draw_cards(deck, init_hands[i]))
        players.append({
            'hand': h, 'score': 0, 'pad': _make_scorepad(),
            'breaker': 0, 'overdraft': False, 'curse': False,
            'scav_left': scav_limit,
        })

    combo_log = defaultdict(int)
    turn = 0
    current = 0
    deck_empty = False
    ended_by = None

    while True:
        turn += 1
        if turn > 200:
            ended_by = 'stalemate'
            break

        p = players[current]
        opp = players[1 - current]

        # ── 1. Draw ─────────────────────────────────
        cnt = 1 if p['overdraft'] else 2
        p['overdraft'] = False
        drawn = draw_cards(deck, cnt)
        p['hand'].extend(drawn)
        p['hand'] = sort_hand(p['hand'])
        if not deck:
            deck_empty = True

        # ── 2. Ambush ───────────────────────────────
        do_ambush = random.random() < 0.70
        duel_eligible_atk = _duel_eligible(p['hand'])
        duel_eligible_def = _duel_eligible(opp['hand'])

        if do_ambush and duel_eligible_atk:
            atk_card = _ai_pick_attack_card(p['hand'])
            p['hand'].remove(atk_card)

            def_card = _ai_pick_defend_card(opp['hand'], atk_card)

            if def_card is None:
                # Defender has no cards at all -> attacker auto-wins
                # Rule 1: winner picks from discard (not draw)
                if discard:
                    pick = max(discard, key=lambda c: CARD_CONFIG[c]['base_value'])
                    discard.remove(pick)
                    p['hand'].append(pick)
                discard.append(atk_card)
                if not deck:
                    deck_empty = True
            elif def_card == '瞬':
                # Rule 2: defender plays 瞬 -> forced tie, no rewards, no scavenge
                opp['hand'].remove('瞬')
                discard.extend([atk_card, '瞬'])
                if not deck:
                    deck_empty = True
            else:
                opp['hand'].remove(def_card)
                result = compare_duel(atk_card, def_card)
                godslayer = (def_card == 'F' and atk_card == 'A')

                if result == 1:  # attacker wins
                    # Rule 1: winner picks best card from discard
                    discard.extend([atk_card, def_card])
                    if discard:
                        pick = max(discard, key=lambda c: CARD_CONFIG[c]['base_value'])
                        discard.remove(pick)
                        p['hand'].append(pick)
                    if atk_card == 'A':
                        p['score'] += holy_bonus
                elif result == -1:  # defender wins
                    # Rule 1: winner picks best card from discard
                    discard.extend([atk_card, def_card])
                    if discard:
                        pick = max(discard, key=lambda c: CARD_CONFIG[c]['base_value'])
                        discard.remove(pick)
                        opp['hand'].append(pick)
                    if def_card == 'A':
                        opp['score'] += holy_bonus
                    if godslayer:
                        opp['breaker'] += 1
                else:
                    # Tie
                    discard.extend([atk_card, def_card])

                if not deck:
                    deck_empty = True

                # Loser scavenges (unchanged)
                loser = opp if result == 1 else (p if result == -1 else None)
                if loser and loser['scav_left'] > 0 and result != 0:
                    scav = [c for c in discard if c in ('D','E','F')]
                    if scav:
                        pick = random.choice(scav)
                        discard.remove(pick)
                        loser['hand'].append(pick)
                        loser['scav_left'] -= 1

        p['hand'] = sort_hand(p['hand'])
        opp['hand'] = sort_hand(opp['hand'])

        # Check 150 win after ambush
        if _total_score(p) >= win_score:
            ended_by = 'race'
            break
        if _total_score(opp) >= win_score:
            ended_by = 'race'
            break

        # ── 3. Spell ────────────────────────────────
        echo = False

        # Free action: use breaker mark
        if p['breaker'] > 0:
            if _total_sealed(opp['pad']) < seal_limit:
                # Seal opponent's best available slot
                targets = []
                for cfg_item in SCOREPAD_CONFIG:
                    if _slots_left(opp['pad'], cfg_item['key']) > 0:
                        targets.append(cfg_item['key'])
                if targets:
                    opp['pad'][targets[0]]['sealed'] += 1
                    p['breaker'] -= 1
            else:
                # Use curse instead
                opp['curse'] = True
                p['breaker'] -= 1

        # Free action: use instant (limit 1/turn)
        instants_in_hand = [c for c in p['hand'] if c == '瞬']
        used_instant = False
        if instants_in_hand and not used_instant:
            # Use instant if no combo available
            combo = _ai_best_combo(p['hand'], p['pad'], False, p['curse'], score_mult)
            if combo is None:
                non_inst = [c for c in p['hand'] if c != '瞬']
                if non_inst:
                    inst_card = '瞬'
                    p['hand'].remove(inst_card)
                    discard.append(inst_card)
                    n_discard = max(1, len(non_inst) // 2)
                    to_discard = non_inst[:n_discard]
                    for c in to_discard:
                        p['hand'].remove(c)
                        discard.append(c)
                    drawn3 = draw_cards(deck, len(to_discard))
                    p['hand'].extend(drawn3)
                    p['hand'] = sort_hand(p['hand'])
                    p['overdraft'] = True
                    echo = True
                    used_instant = True
                    if not deck:
                        deck_empty = True

        # Terminal action: try combo scoring
        combo = _ai_best_combo(p['hand'], p['pad'], echo, p['curse'], score_mult)
        played_cards = []
        if combo:
            key, cards, final_score = combo
            for c in cards:
                p['hand'].remove(c)
                played_cards.append(c)
            p['pad'][key]['scores'].append(final_score)
            if p['curse']:
                p['curse'] = False
            combo_log[key] += 1

            # Rule 5: Tier 1 combo grants a bonus scoring action
            tier1_keys = {c['key'] for c in SCOREPAD_CONFIG if c['tier'] == 1}
            if key in tier1_keys:
                combo2 = _ai_best_combo(p['hand'], p['pad'], False, False, score_mult)
                if combo2:
                    k2, cards2, fs2 = combo2
                    for c in cards2:
                        p['hand'].remove(c)
                        played_cards.append(c)
                    p['pad'][k2]['scores'].append(fs2)
                    combo_log[k2] += 1
        else:
            # Consider sacrifice if hand is clogged
            if len(p['hand']) >= 7:
                for cfg_item in reversed(SCOREPAD_CONFIG):
                    if _slots_left(p['pad'], cfg_item['key']) > 0:
                        p['pad'][cfg_item['key']]['scores'].append(0)
                        # Discard some cards
                        n_dump = min(3, len(p['hand']))
                        worst = sorted(p['hand'], key=lambda c: CARD_CONFIG[c]['rank'], reverse=True)
                        for c in worst[:n_dump]:
                            p['hand'].remove(c)
                            discard.append(c)
                        # Rule 3: sacrifice grants 2 bonus draws
                        bonus = draw_cards(deck, 2)
                        p['hand'].extend(bonus)
                        if not deck:
                            deck_empty = True
                        break

        # ── 4. End ──────────────────────────────────
        discard.extend(played_cards)

        # Hand limit
        while len(p['hand']) > HAND_LIMIT:
            worst = max(p['hand'], key=lambda c: CARD_CONFIG[c]['rank'])
            p['hand'].remove(worst)
            discard.append(worst)

        # Check 150 win
        if _total_score(p) >= win_score:
            ended_by = 'race'
            break

        # Check deck empty
        if deck_empty:
            # Current player finishes turn, then collision
            ended_by = 'collision'
            break

        current = 1 - current

    # ── Collision if needed ─────────────────────────
    collision_scores = [0, 0]
    if ended_by == 'collision':
        # Rule 4: pre-collision discard 0~2 cards each
        for pi in range(2):
            hand = players[pi]['hand']
            if len(hand) > 2:
                weakest = sorted(hand, key=lambda c: CARD_CONFIG[c]['rank'], reverse=True)
                n_drop = min(2, sum(1 for c in weakest if c == 'F'))
                for c in weakest[:n_drop]:
                    hand.remove(c)
                    discard.append(c)

        order0 = _ai_collision_order(players[0]['hand'])
        order1 = _ai_collision_order(players[1]['hand'])
        col = col_init(order0, order1)
        while not col['done']:
            col_next(col)
        collision_scores = col['score']
        players[0]['score'] += collision_scores[0]
        players[1]['score'] += collision_scores[1]

    t0 = _total_score(players[0])
    t1 = _total_score(players[1])

    return {
        'ended_by': ended_by,
        'turns': turn,
        'scores': (t0, t1),
        'collision_scores': tuple(collision_scores),
        'winner': 0 if t0 > t1 else (1 if t1 > t0 else -1),
        'combo_log': dict(combo_log),
    }

# ── Batch runner ────────────────────────────────────────

def run_batch(n, cfg=None, label=""):
    if cfg is None:
        cfg = DEFAULT_CFG
    results = [simulate_game(cfg) for _ in range(n)]

    race = sum(1 for r in results if r['ended_by'] == 'race')
    coll = sum(1 for r in results if r['ended_by'] == 'collision')
    stale = sum(1 for r in results if r['ended_by'] == 'stalemate')
    avg_turns = sum(r['turns'] for r in results) / n
    avg_score = sum(max(r['scores']) for r in results) / n
    avg_low = sum(min(r['scores']) for r in results) / n

    combo_totals = defaultdict(int)
    for r in results:
        for k, v in r['combo_log'].items():
            combo_totals[k] += v

    combo_names = {c['key']: c['name'] for c in SCOREPAD_CONFIG}

    ws = cfg.get('win_score', 150)
    deck_size = sum(v for v in (cfg.get('deck_cards') or {k: CARD_CONFIG[k]['count'] for k in CARD_CONFIG}).values())
    sm = cfg.get('score_mult', 1.0)

    print(f"\n{'='*60}")
    if label:
        print(f"  {label}")
    print(f"  WIN={ws} | 牌库={deck_size} | 倍率={sm:.1f} | {n} 局")
    print(f"{'='*60}")
    print(f"  竞速胜利: {race:>5} ({race/n*100:5.1f}%)")
    print(f"  魔力对撞: {coll:>5} ({coll/n*100:5.1f}%)")
    if stale:
        print(f"  僵局超时: {stale:>5} ({stale/n*100:5.1f}%)")
    print(f"  平均回合: {avg_turns:>5.1f}")
    print(f"  胜者均分: {avg_score:>5.1f} | 败者均分: {avg_low:>5.1f}")
    print(f"  ── 组合达成次数 (两位玩家合计 / {n} 局) ──")
    for cfg_item in SCOREPAD_CONFIG:
        k = cfg_item['key']
        cnt = combo_totals.get(k, 0)
        per_game = cnt / n
        print(f"    {combo_names[k]:<20s} {cnt:>6}  ({per_game:.2f}/局)")
    print()

    return {
        'race_pct': race / n * 100,
        'coll_pct': coll / n * 100,
        'avg_turns': avg_turns,
        'avg_win_score': avg_score,
        'avg_lose_score': avg_low,
    }

# ── Parameter sweep ─────────────────────────────────────

def sweep():
    print("\n" + "▓" * 60)
    print("  参数扫描: 寻找 50/50 竞速/对撞甜点")
    print("▓" * 60)

    N = 5000
    best_diff = 999
    best_cfg = None
    best_label = ""

    for ws in range(100, 155, 10):
        for deck_extra in [0, 10, 15]:
            deck_cards = None
            deck_label = "61"
            if deck_extra > 0:
                deck_cards = {k: CARD_CONFIG[k]['count'] for k in CARD_CONFIG}
                distribute = ['D', 'E', 'F', 'C', 'B']
                remaining = deck_extra
                for card in distribute:
                    add = min(remaining, 3)
                    deck_cards[card] += add
                    remaining -= add
                    if remaining <= 0:
                        break
                deck_label = str(sum(deck_cards.values()))

            for sm in [1.0, 1.15, 1.3]:
                cfg = {**DEFAULT_CFG, 'win_score': ws, 'score_mult': sm}
                if deck_cards:
                    cfg['deck_cards'] = deck_cards

                label = f"WIN={ws} 牌库={deck_label} 倍率={sm:.2f}"
                res = run_batch(N, cfg, label)
                diff = abs(res['race_pct'] - 50)
                if diff < best_diff:
                    best_diff = diff
                    best_cfg = cfg.copy()
                    best_label = label

    print("\n" + "★" * 60)
    print(f"  最佳配置: {best_label}")
    print(f"  偏差: {best_diff:.1f}% (距50/50)")
    print("★" * 60)

    # Re-run best with more games for accuracy
    print("\n  用 10000 局验证最佳配置:")
    run_batch(10000, best_cfg, f"验证: {best_label}")

    return best_cfg

# ── Main ────────────────────────────────────────────────

if __name__ == '__main__':
    if '--sweep' in sys.argv:
        best = sweep()
        print(f"\n推荐参数: {best}")
    else:
        print("基线测试 (当前参数):")
        run_batch(10000, DEFAULT_CFG, "基线")
