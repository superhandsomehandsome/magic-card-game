"""Mana Collision (魔力对撞) endgame logic — pure functions."""
from game_state import CARD_CONFIG


def compare(c1, c2):
    """Collision card compare. 瞬 forces tie. Returns 1/0/-1."""
    if c1 == '瞬' or c2 == '瞬':
        return 0
    if c1 == c2:
        return 0
    if c1 == 'F' and c2 == 'A':
        return 1
    if c1 == 'A' and c2 == 'F':
        return -1
    return 1 if CARD_CONFIG[c1]['rank'] < CARD_CONFIG[c2]['rank'] else -1


def init(p0_cards, p1_cards):
    return {
        'p0': list(p0_cards),
        'p1': list(p1_cards),
        'pot': 10,
        'round': 0,
        'score': [0, 0],
        'log': [],
        'done': False,
    }


def next_round(st):
    """Resolve one round. Returns result dict or None."""
    if st['done']:
        return None
    r = st['round']
    n0, n1 = len(st['p0']), len(st['p1'])
    mx = max(n0, n1)
    if r >= mx:
        st['done'] = True
        return None

    has0 = r < n0
    has1 = r < n1
    is_last = (r == mx - 1)

    if has0 and has1:
        c0, c1 = st['p0'][r], st['p1'][r]
        cmp = compare(c0, c1)
        if cmp == 0:
            if is_last:
                res = {'type': 'overload', 'c0': c0, 'c1': c1, 'lost': st['pot']}
                st['pot'] = 0
            else:
                st['pot'] += 10
                res = {'type': 'tie', 'c0': c0, 'c1': c1, 'pot': st['pot']}
        elif cmp == 1:
            w = st['pot']; st['score'][0] += w; st['pot'] = 10
            res = {'type': 'win', 'winner': 0, 'c0': c0, 'c1': c1, 'pts': w}
        else:
            w = st['pot']; st['score'][1] += w; st['pot'] = 10
            res = {'type': 'win', 'winner': 1, 'c0': c0, 'c1': c1, 'pts': w}
    elif has0:
        w = st['pot']; st['score'][0] += w; st['pot'] = 10
        res = {'type': 'crush', 'winner': 0, 'card': st['p0'][r], 'pts': w}
    else:
        w = st['pot']; st['score'][1] += w; st['pot'] = 10
        res = {'type': 'crush', 'winner': 1, 'card': st['p1'][r], 'pts': w}

    st['round'] += 1
    st['log'].append(res)
    if st['round'] >= mx:
        st['done'] = True
    return res


def final_winner(total0, total1, hand0, hand1):
    """0 = P0 wins, 1 = P1 wins, -1 = absolute tie."""
    if total0 != total1:
        return 0 if total0 > total1 else 1
    b0 = sum(CARD_CONFIG[c]['base_value'] for c in hand0)
    b1 = sum(CARD_CONFIG[c]['base_value'] for c in hand1)
    if b0 != b1:
        return 0 if b0 > b1 else 1
    return -1
