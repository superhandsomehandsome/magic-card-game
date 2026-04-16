"""Combo detection and scoring — pure functions, zero Streamlit dependency."""
from collections import Counter
from game_state import CARD_CONFIG, SCORE_MULT


def _bv(card):
    return CARD_CONFIG[card]['base_value']


def _scaled(raw):
    """Apply global score multiplier and round."""
    return int(raw * SCORE_MULT)


def find_combos(selected):
    """Given an exact card selection, return all valid combo matches.
    Each result: {key, name, cards, base_score}
    """
    if not selected or any(c == '瞬' for c in selected):
        return []
    ct = Counter(selected)
    n = len(selected)
    out = []

    # 龙之吐息 (五条) — 5 identical
    if n == 5 and len(ct) == 1:
        card = next(iter(ct))
        out.append({'key': 'dragon_breath', 'name': '龙之吐息',
                    'cards': list(selected), 'base_score': _scaled(40 + _bv(card) * 5)})

    # 奥术序列 (大顺) — A B C D E
    if n == 5 and set(ct) == {'A','B','C','D','E'} and max(ct.values()) == 1:
        out.append({'key': 'arcane_sequence', 'name': '奥术序列',
                    'cards': list(selected), 'base_score': _scaled(45)})

    # 元素激流 (小顺) — B C D E F
    if n == 5 and set(ct) == {'B','C','D','E','F'} and max(ct.values()) == 1:
        out.append({'key': 'elemental_surge', 'name': '元素激流',
                    'cards': list(selected), 'base_score': _scaled(30)})

    # 混沌炼金 (葫芦) — 3+2
    if n == 5 and sorted(ct.values(), reverse=True) == [3, 2]:
        out.append({'key': 'chaos_alchemy', 'name': '混沌炼金',
                    'cards': list(selected),
                    'base_score': _scaled(20 + sum(_bv(c) for c in selected))})

    # 三重共鸣 (三条) — 3 identical
    if n == 3 and len(ct) == 1:
        card = next(iter(ct))
        out.append({'key': 'triple_resonance', 'name': '三重共鸣',
                    'cards': list(selected), 'base_score': _scaled(10 + _bv(card) * 3)})

    # 以量取胜 (蚁群) — any count of F only
    if len(ct) == 1 and 'F' in ct:
        out.append({'key': 'ant_colony', 'name': '以量取胜',
                    'cards': list(selected), 'base_score': _scaled(n * 5)})

    return out


def apply_modifiers(base, echo=False, curse=False):
    s = base
    if echo:
        s += 10
    if curse:
        s -= 10
    return max(0, s)


def detect_playable(hand, scorepad_slots_fn):
    """Return all playable combos from hand.
    scorepad_slots_fn(key) → remaining slots for that combo.
    Each result: (key, name, cards, base_score)
    Sorted by score descending.
    """
    ct = Counter(c for c in hand if c != '瞬')
    results = []

    for card, cnt in ct.items():
        if cnt >= 5 and scorepad_slots_fn('dragon_breath') > 0:
            cards = [card] * 5
            results.append(('dragon_breath', '龙之吐息', cards,
                            _scaled(40 + _bv(card) * 5)))

    if all(c in ct for c in 'ABCDE') and scorepad_slots_fn('arcane_sequence') > 0:
        results.append(('arcane_sequence', '奥术序列',
                        ['A','B','C','D','E'], _scaled(45)))

    if all(c in ct for c in ['B','C','D','E','F']) and scorepad_slots_fn('elemental_surge') > 0:
        results.append(('elemental_surge', '元素激流',
                        ['B','C','D','E','F'], _scaled(30)))

    if scorepad_slots_fn('chaos_alchemy') > 0:
        best = None
        for c3, n3 in ct.items():
            if n3 >= 3:
                for c2, n2 in ct.items():
                    if c2 != c3 and n2 >= 2:
                        cards = [c3]*3 + [c2]*2
                        sc = _scaled(20 + sum(_bv(c) for c in cards))
                        if best is None or sc > best[3]:
                            best = ('chaos_alchemy', '混沌炼金', cards, sc)
        if best:
            results.append(best)

    if scorepad_slots_fn('triple_resonance') > 0:
        best = None
        for card, cnt in ct.items():
            if cnt >= 3:
                cards = [card] * 3
                sc = _scaled(10 + _bv(card) * 3)
                if best is None or sc > best[3]:
                    best = ('triple_resonance', '三重共鸣', cards, sc)
        if best:
            results.append(best)

    if scorepad_slots_fn('ant_colony') > 0:
        f_cnt = ct.get('F', 0)
        if f_cnt >= 1:
            cards = ['F'] * f_cnt
            results.append(('ant_colony', '以量取胜', cards, _scaled(f_cnt * 5)))

    results.sort(key=lambda x: x[3], reverse=True)
    return results


def detect_hints(hand):
    """Detect all formable combos from a full hand (for UI hints)."""
    ct = Counter(c for c in hand if c != '瞬')
    out = []

    for card, cnt in ct.items():
        if cnt >= 5:
            out.append(f"龙之吐息 ({card}×5) → {_scaled(40 + _bv(card)*5)}分")

    if all(c in ct for c in 'ABCDE'):
        out.append(f"奥术序列 (A-E) → {_scaled(45)}分")

    if all(c in ct for c in ['B','C','D','E','F']):
        out.append(f"元素激流 (B-F) → {_scaled(30)}分")

    for c3, n3 in ct.items():
        if n3 >= 3:
            for c2, n2 in ct.items():
                if c2 != c3 and n2 >= 2:
                    s = _scaled(20 + _bv(c3)*3 + _bv(c2)*2)
                    out.append(f"混沌炼金 ({c3}×3+{c2}×2) → {s}分")

    for card, cnt in ct.items():
        if cnt >= 3:
            out.append(f"三重共鸣 ({card}×3) → {_scaled(10 + _bv(card)*3)}分")

    f_cnt = ct.get('F', 0)
    if f_cnt >= 1:
        out.append(f"以量取胜 (F×1~{f_cnt}) → {_scaled(5)}~{_scaled(f_cnt*5)}分")

    return out
