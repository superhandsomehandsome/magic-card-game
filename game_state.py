"""Game state management for 秘术对决：禁忌魔典."""
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
HAND_LIMIT = 8
WIN_SCORE = 155
INITIAL_HAND_P0 = 5
INITIAL_HAND_P1 = 6
FIRST_PLAYER_BONUS = 1
SCORE_MULT = 1.2
SACRIFICE_DRAW = 2
SCAVENGE_LIMIT = 3
SEAL_LIMIT = 3
INSTANT_PER_TURN = 1

SCOREPAD_CONFIG = [
    {'key': 'dragon_breath',    'name': '龙之吐息 (五条)', 'max_slots': 1, 'tier': 1},
    {'key': 'arcane_sequence',  'name': '奥术序列 (大顺)', 'max_slots': 1, 'tier': 1},
    {'key': 'elemental_surge',  'name': '元素激流 (小顺)', 'max_slots': 2, 'tier': 2},
    {'key': 'chaos_alchemy',    'name': '混沌炼金 (葫芦)', 'max_slots': 2, 'tier': 2},
    {'key': 'triple_resonance', 'name': '三重共鸣 (三条)', 'max_slots': 2, 'tier': 3},
    {'key': 'ant_colony',       'name': '以量取胜 (蚁群)', 'max_slots': 2, 'tier': 3},
]

PHASE_NAMES = {
    GamePhase.MAIN_MENU:             '主菜单',
    GamePhase.PLAYER_MASK:           '身份确认',
    GamePhase.DRAW:                  '壹 · 汲取阶段',
    GamePhase.AMBUSH_DECISION:       '贰 · 突袭阶段',
    GamePhase.AMBUSH_ATTACKER_SELECT:'贰 · 突袭 — 暗扣出牌',
    GamePhase.AMBUSH_DEFENDER_SELECT:'贰 · 突袭 — 防守应战',
    GamePhase.AMBUSH_REVEAL:         '贰 · 突袭 — 揭晓',
    GamePhase.AMBUSH_SCAVENGE:       '贰 · 突袭 — 拾荒',
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
        'scavenge_remaining': SCAVENGE_LIMIT,
    }


def init_game(ss):
    """Initialize full game state in session_state."""
    ss.game_started = True
    ss.phase = GamePhase.PLAYER_MASK
    ss.current_player = 0
    ss.turn_number = 1
    ss.mask_target = 0
    ss.after_mask_phase = GamePhase.DRAW
    ss.deck = []
    ss.discard_pile = []
    ss.discard_turns = []
    ss.players = [_make_player('炼金术士'), _make_player('占星师')]
    ss.played_this_turn = []
    ss.deck_empty_flag = False
    # Draw
    ss.drawn_cards = []
    ss.draw_done = False
    ss.draw_was_overdraft = False
    # Ambush
    ss.atk_card = None
    ss.def_card = None
    ss.ambush_result = 0
    ss.ambush_godslayer = False
    ss.reveal_done = False
    ss.scavenge_player = -1
    ss.duel_pending_discard = []
    # Spell
    ss.echo_ready = False
    ss.instant_count = 0
    # Collision
    ss.collision = None
    ss.col_p0_cards = []
    ss.col_p1_cards = []
    ss.col_p0_flipped = set()
    ss.col_p1_flipped = set()
    ss.col_flipper = 0
    ss.col_round_pair = [None, None]
    # Log
    ss.turn_log = []
    ss.winner = -1


def reset_turn(ss):
    """Reset per-turn transient state."""
    ss.drawn_cards = []
    ss.draw_done = False
    ss.draw_was_overdraft = False
    ss.atk_card = None
    ss.def_card = None
    ss.ambush_result = 0
    ss.ambush_godslayer = False
    ss.reveal_done = False
    ss.scavenge_player = -1
    ss.duel_pending_discard = []
    ss.echo_ready = False
    ss.instant_count = 0
    ss.played_this_turn = []
    ss.turn_log = []


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


def has_empty_unseal(scorepad):
    """Any unfilled AND unsealed slot exists (for sacrifice target)."""
    for c in SCOREPAD_CONFIG:
        info = scorepad[c['key']]
        if info['max_slots'] - len(info['scores']) - info['sealed'] > 0:
            return True
    return False


def total_sealed(scorepad):
    """Total number of sealed slots on a scorepad."""
    return sum(info['sealed'] for info in scorepad.values())


def opp(idx):
    return 1 - idx
