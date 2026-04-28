"""Combo detection and scoring (V5.0)."""
from collections import Counter
from game_state import (
    CARD_CONFIG, SCORE_MULT, ANT_COLONY_MIN_F,
    FIVE_KIND_BASE, FIVE_KIND_PER_BV,
    ARCANE_SEQUENCE_BASE, ELEMENTAL_SURGE_BASE,
    CHAOS_ALCHEMY_BASE, TRIPLE_RESONANCE_BASE, TRIPLE_RESONANCE_PER_BV,
    ANT_COLONY_PER_F,
)


def _bv(card):
    return CARD_CONFIG[card]['base_value']


def _scaled(raw):
    return int(raw * SCORE_MULT)


def _five_kind(card):
    return _scaled(FIVE_KIND_BASE + _bv(card) * FIVE_KIND_PER_BV)


def _ant(n):
    return _scaled(n * ANT_COLONY_PER_F)


def _triple(card):
    return _scaled(TRIPLE_RESONANCE_BASE + _bv(card) * TRIPLE_RESONANCE_PER_BV)


def _alchemy(cards):
    return _scaled(CHAOS_ALCHEMY_BASE + sum(_bv(c) for c in cards))


def find_combos(selected):
    """Given an exact card selection, return all valid combo matches."""
    if not selected or any(c == '瞬' for c in selected):
        return []
    ct = Counter(selected)
    n = len(selected)
    out = []

    if n == 5 and len(ct) == 1:
        card = next(iter(ct))
        out.append({'key': 'dragon_breath', 'name': '龙之吐息',
                    'cards': list(selected), 'base_score': _five_kind(card)})

    if n == 5 and set(ct) == {'A','B','C','D','E'} and max(ct.values()) == 1:
        out.append({'key': 'arcane_sequence', 'name': '奥术序列',
                    'cards': list(selected), 'base_score': _scaled(ARCANE_SEQUENCE_BASE)})

    if n == 5 and set(ct) == {'B','C','D','E','F'} and max(ct.values()) == 1:
        out.append({'key': 'elemental_surge', 'name': '元素激流',
                    'cards': list(selected), 'base_score': _scaled(ELEMENTAL_SURGE_BASE)})

    if n == 5 and sorted(ct.values(), reverse=True) == [3, 2]:
        out.append({'key': 'chaos_alchemy', 'name': '混沌炼金',
                    'cards': list(selected), 'base_score': _alchemy(selected)})

    if n == 3 and len(ct) == 1:
        card = next(iter(ct))
        out.append({'key': 'triple_resonance', 'name': '三重共鸣',
                    'cards': list(selected), 'base_score': _triple(card)})

    if len(ct) == 1 and 'F' in ct and n >= ANT_COLONY_MIN_F:
        out.append({'key': 'ant_colony', 'name': '以量取胜',
                    'cards': list(selected), 'base_score': _ant(n)})

    return out


def apply_modifiers(base, curse=False):
    s = base
    if curse:
        s -= 10
    return max(0, s)


def detect_playable(hand, scorepad_slots_fn):
    """Return all playable combos from hand."""
    ct = Counter(c for c in hand if c != '瞬')
    results = []

    for card, cnt in ct.items():
        if cnt >= 5 and scorepad_slots_fn('dragon_breath') > 0:
            cards = [card] * 5
            results.append(('dragon_breath', '龙之吐息', cards, _five_kind(card)))

    if all(c in ct for c in 'ABCDE') and scorepad_slots_fn('arcane_sequence') > 0:
        results.append(('arcane_sequence', '奥术序列',
                        ['A','B','C','D','E'], _scaled(ARCANE_SEQUENCE_BASE)))

    if all(c in ct for c in ['B','C','D','E','F']) and scorepad_slots_fn('elemental_surge') > 0:
        results.append(('elemental_surge', '元素激流',
                        ['B','C','D','E','F'], _scaled(ELEMENTAL_SURGE_BASE)))

    if scorepad_slots_fn('chaos_alchemy') > 0:
        for c3, n3 in ct.items():
            if n3 >= 3:
                for c2, n2 in ct.items():
                    if c2 != c3 and n2 >= 2:
                        cards = [c3]*3 + [c2]*2
                        results.append(('chaos_alchemy', '混沌炼金', cards, _alchemy(cards)))

    if scorepad_slots_fn('triple_resonance') > 0:
        for card, cnt in ct.items():
            if cnt >= 3:
                cards = [card] * 3
                results.append(('triple_resonance', '三重共鸣', cards, _triple(card)))

    if scorepad_slots_fn('ant_colony') > 0:
        f_cnt = ct.get('F', 0)
        if f_cnt >= ANT_COLONY_MIN_F:
            for n in range(ANT_COLONY_MIN_F, f_cnt + 1):
                results.append(('ant_colony', '以量取胜', ['F'] * n, _ant(n)))

    results.sort(key=lambda x: x[3], reverse=True)
    return results


def detect_hints(hand):
    """Detect all formable combos from a full hand (for UI hints)."""
    ct = Counter(c for c in hand if c != '瞬')
    out = []

    for card, cnt in ct.items():
        if cnt >= 5:
            out.append(f"龙之吐息 ({card}×5) → {_five_kind(card)}分")

    if all(c in ct for c in 'ABCDE'):
        out.append(f"奥术序列 (A-E) → {_scaled(ARCANE_SEQUENCE_BASE)}分")

    if all(c in ct for c in ['B','C','D','E','F']):
        out.append(f"元素激流 (B-F) → {_scaled(ELEMENTAL_SURGE_BASE)}分")

    for c3, n3 in ct.items():
        if n3 >= 3:
            for c2, n2 in ct.items():
                if c2 != c3 and n2 >= 2:
                    s = _scaled(CHAOS_ALCHEMY_BASE + _bv(c3)*3 + _bv(c2)*2)
                    out.append(f"混沌炼金 ({c3}×3+{c2}×2) → {s}分")

    for card, cnt in ct.items():
        if cnt >= 3:
            out.append(f"三重共鸣 ({card}×3) → {_triple(card)}分")

    f_cnt = ct.get('F', 0)
    if f_cnt >= ANT_COLONY_MIN_F:
        out.append(f"以量取胜 (F×{ANT_COLONY_MIN_F}~{f_cnt}) → {_ant(ANT_COLONY_MIN_F)}~{_ant(f_cnt)}分")

    return out
