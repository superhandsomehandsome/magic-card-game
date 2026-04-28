"""Game state management for 秘术对决：禁忌魔典 (V5.0 · 黑市博弈版)."""
from enum import Enum, auto


class GamePhase(Enum):
    MAIN_MENU = auto()
    PLAYER_MASK = auto()
    DRAW = auto()
    AMBUSH_DECISION = auto()
    AMBUSH_ATTACKER_SELECT = auto()
    AMBUSH_DEFENDER_SELECT = auto()
    AMBUSH_REVEAL = auto()
    AMBUSH_SCAVENGE = auto()
    SPELL = auto()
    END = auto()
    END_DISCARD = auto()
    COLLISION_SETUP = auto()
    COLLISION_ORDER = auto()
    COLLISION_REVEAL = auto()
    GAME_OVER = auto()


CARD_CONFIG = {
    'A': {'count': 5, 'base_value': 6, 'rank': 0},
    'B': {'count': 6, 'base_value': 5, 'rank': 1},
    'C': {'count': 9, 'base_value': 4, 'rank': 2},
    'D': {'count': 13, 'base_value': 3, 'rank': 3},
    'E': {'count': 15, 'base_value': 2, 'rank': 4},
    'F': {'count': 18, 'base_value': 1, 'rank': 5},
    '瞬': {'count': 5, 'base_value': 0, 'rank': 6},
}

CARD_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', '瞬']

# ══════════════════════════════════════════════════════════════════════
# V5.0 BALANCE PARAMETERS · 黑市博弈版
# Verified with Monte Carlo simulation (see balance_sim_v5.py)
# ══════════════════════════════════════════════════════════════════════

WIN_SCORE = 115
HAND_LIMIT = 8
INITIAL_HAND_P0 = 5
INITIAL_HAND_P1 = 6
FIRST_PLAYER_BONUS = -5
P1_FIRST_TURN_OVERDRAFT = True
NO_AMBUSH_BEFORE_TURN = 3
SCORE_MULT = 2.0

AMBUSH_MAX_PER_TURN = 2
AMBUSH_SECOND_COST = 1
AMBUSH_STEAL_COUNT = 1
AMBUSH_A_WIN_BONUS = 10
AMBUSH_A_LOSE_BONUS = 3

ANT_COLONY_MIN_F = 3
RED_PUNISH_DISCARD = 2
BLUE_REWARD_DRAW = 1
GREEN_REWARD_DRAW = 1

SACRIFICE_MAX_X = 3
SACRIFICE_WINDOW = 5

INSTANT_PER_TURN = 1
SEAL_LIMIT = 3
BREAKER_CURSE_PENALTY = 10

DECK_LOW_THRESHOLD = 10

SCAVENGE_LIMIT = 0
SACRIFICE_DRAW = 0

MARKET_SIZE = 3
MARKET_BUY_PER_TURN = 1
MARKET_DECK_GUARD = 8
MARKET_DARK_INTERVAL = 5

LOCKDOWN_BREAK_COST = 15
LOCKDOWN_DEBT_ENABLE = True
LOCKDOWN_BAN_INSTANT = True

FIVE_KIND_BASE = 40
FIVE_KIND_PER_BV = 5
ARCANE_SEQUENCE_BASE = 45
ELEMENTAL_SURGE_BASE = 30
CHAOS_ALCHEMY_BASE = 20
TRIPLE_RESONANCE_BASE = 10
TRIPLE_RESONANCE_PER_BV = 3
ANT_COLONY_PER_F = 5

SCOREPAD_CONFIG = [
    {'key': 'dragon_breath',    'name': '龙之吐息 (五条)', 'max_slots': 1, 'tier': 1},
    {'key': 'arcane_sequence',  'name': '奥术序列 (大顺)', 'max_slots': 1, 'tier': 1},
    {'key': 'elemental_surge',  'name': '元素激流 (小顺)', 'max_slots': 2, 'tier': 2},
    {'key': 'chaos_alchemy',    'name': '混沌炼金 (葫芦)', 'max_slots': 2, 'tier': 2},
    {'key': 'triple_resonance', 'name': '三重共鸣 (三条)', 'max_slots': 2, 'tier': 3},
    {'key': 'ant_colony',       'name': '以量取胜 (蚁群)', 'max_slots': 2, 'tier': 3},
]

RED_KEYS = frozenset({'dragon_breath', 'arcane_sequence'})
BLUE_KEYS = frozenset({'elemental_surge', 'chaos_alchemy'})
GREEN_KEYS = frozenset({'triple_resonance', 'ant_colony'})

PHASE_NAMES = {
    GamePhase.MAIN_MENU:             '主菜单',
    GamePhase.PLAYER_MASK:           '身份确认',
    GamePhase.DRAW:                  '壹 · 汲取阶段',
    GamePhase.AMBUSH_DECISION:       '贰 · 突袭阶段',
    GamePhase.AMBUSH_ATTACKER_SELECT:'贰 · 突袭 — 暗扣出牌',
    GamePhase.AMBUSH_DEFENDER_SELECT:'贰 · 突袭 — 防守应战',
    GamePhase.AMBUSH_REVEAL:         '贰 · 突袭 — 揭晓',
    GamePhase.SPELL:                 '叁 · 咏唱阶段',
    GamePhase.END:                   '肆 · 整理阶段',
    GamePhase.END_DISCARD:           '肆 · 整理 — 弃牌',
    GamePhase.COLLISION_SETUP:       '终局 · 魔力对撞',
    GamePhase.COLLISION_ORDER:       '终局 · 排列暗阵',
    GamePhase.COLLISION_REVEAL:      '终局 · 对撞揭晓',
    GamePhase.GAME_OVER:             '对决终焉',
}


def _make_scorepad():
    pad = {}
    for cfg in SCOREPAD_CONFIG:
        pad[cfg['key']] = {
            'name': cfg['name'],
            'max_slots': cfg['max_slots'],
            'tier': cfg['tier'],
            'scores': [],
            'sealed': 0,
        }
    return pad


def _make_player(name):
    return {
        'name': name,
        'hand': [],
        'score': 0,
        'breaker_marks': 0,
        'overdraft': False,
        'scorepad': _make_scorepad(),
        'curse_active': False,
        'lockdown_card': None,
        'lockdown_debt': 0,
        'market_purchased': False,
    }


def total_score(player):
    s = player['score']
    for combo in player['scorepad'].values():
        s += sum(combo['scores'])
    return s


def slots_left(scorepad, combo_key):
    info = scorepad[combo_key]
    return info['max_slots'] - len(info['scores']) - info['sealed']


def has_open_slot(scorepad):
    return any(slots_left(scorepad, c['key']) > 0 for c in SCOREPAD_CONFIG)


def has_scored_unsealed_slot(scorepad):
    """Returns True if any slot has a score that can be sacrificed."""
    for c in SCOREPAD_CONFIG:
        info = scorepad[c['key']]
        if len(info['scores']) > 0:
            return True
    return False


def total_sealed(scorepad):
    return sum(info['sealed'] for info in scorepad.values())


def opp(idx):
    return 1 - idx
