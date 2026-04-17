"""Server-side game room — V3.0.

V3.0 mechanics:
- Auto-draw at turn start (phase DRAW is a display-only phase; client sends DRAW_ACK)
- No ambush before turn NO_AMBUSH_BEFORE_TURN (default 3)
- Ambush: up to 2/turn. 2nd costs AMBUSH_SECOND_COST open-discards.
- Defender picks FOLD or DEFEND. Fold → attacker steals 1 random, attack card discards.
  Defend → winner draws 1 + steals 1. 瞬 absorbs attack card, forces tie (瞬 to discard).
- A-win +8, A-loss +3 (only applies when beaten by non-F / beat non-F).
- F > A: winner still gets breaker mark, A side gets NO +3 consolation.
- A vs A tie: no bonus.
- Red zone (dragon_breath / arcane_sequence) is SHARED — first to fill locks it globally.
  Completing red → opponent random-discards RED_PUNISH_DISCARD cards.
- Blue complete → draw BLUE_REWARD_DRAW.
- Green complete → draw GREEN_REWARD_DRAW.
- Ant colony now requires ANT_COLONY_MIN_F F cards minimum.
- Scavenge and instant-echo removed.
- New sacrifice: pick a scored slot (deletes score, seals), discard X, pick X from
  last SACRIFICE_WINDOW turns' discard. Ends turn forcibly.
"""
import random
from game_state import (
    CARD_CONFIG, SCOREPAD_CONFIG, HAND_LIMIT, WIN_SCORE,
    SCORE_MULT, INITIAL_HAND_P0, INITIAL_HAND_P1, FIRST_PLAYER_BONUS,
    INSTANT_PER_TURN, SEAL_LIMIT, DECK_LOW_THRESHOLD,
    NO_AMBUSH_BEFORE_TURN, AMBUSH_MAX_PER_TURN, AMBUSH_SECOND_COST,
    AMBUSH_STEAL_COUNT, AMBUSH_A_WIN_BONUS, AMBUSH_A_LOSE_BONUS,
    RED_PUNISH_DISCARD, BLUE_REWARD_DRAW, GREEN_REWARD_DRAW,
    SACRIFICE_MAX_X, SACRIFICE_WINDOW,
    RED_KEYS, BLUE_KEYS, GREEN_KEYS,
    BREAKER_CURSE_PENALTY,
)
from game_logic import create_deck, sort_hand, bv, draw_cards, compare_duel, hand_overflow
from scoring import find_combos, apply_modifiers, detect_playable
from collision import init as col_init, next_round as col_next, final_winner, compare as col_compare


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


def _total_score(player):
    s = player['score']
    for combo in player['scorepad'].values():
        s += sum(combo['scores'])
    return s


def _total_sealed(pad):
    return sum(info['sealed'] for info in pad.values())


class GameRoom:
    def __init__(self, room_id):
        self.room_id = room_id
        self.sids = {}
        self.player_names = ['', '']
        self.phase = 'LOBBY'
        self.is_ai_game = False
        self.ai_sid = None
        self.current_player = 0
        self.turn_number = 1
        self.deck = []
        self.discard_pile = []
        self.discard_turns = []
        self.players = [self._make_player('炼金术士'), self._make_player('占星师')]

        # Shared red zone: key -> owner_idx (-1 if free)
        self.shared_red = {'dragon_breath': -1, 'arcane_sequence': -1}

        # Draw
        self.drawn_cards = []
        self.draw_was_overdraft = False

        # Ambush
        self.ambush_count_this_turn = 0
        self.ambush_second_pending = False  # between PAY_COST and ATK_SELECT for 2nd ambush
        self.atk_card = None
        self.def_card = None
        self.ambush_result = 0  # 1 atk wins, -1 def wins, 0 tie
        self.ambush_godslayer = False
        self.ambush_fold = False
        self.duel_winner_idx = -1
        self.ambush_last_outcome = None  # dict summary for UI briefing
        self.stolen_preview = None  # for UI

        # Spell
        self.instant_count = 0
        self.played_this_turn = []

        # Collision
        self.col_state = None
        self.col_p0_cards = []
        self.col_p1_cards = []
        self.col_p0_flipped = set()
        self.col_p1_flipped = set()
        self.col_flipper = 0
        self.col_round_pair = [None, None]
        self.col_pre_discard_done = [False, False]
        self.col_bet_caller = 0
        self.col_bet_amount = 0
        self.col_bet_phase = 'CALLER'
        self.col_bet_response = None
        self.col_bonus_pot = 0

        self.winner = -1
        self.turn_log = []
        self.game_log = []
        self.turn_deadline = 0

    @staticmethod
    def _make_player(name):
        return {
            'name': name,
            'hand': [],
            'score': 0,
            'breaker_marks': 0,
            'overdraft': False,
            'scorepad': _make_scorepad(),
            'curse_active': False,
        }

    # ── Session management ─────────────────────────────
    def join(self, sid, name):
        if len(self.sids) >= 2:
            return False, 'Room is full'
        idx = len(self.sids)
        self.sids[sid] = idx
        self.player_names[idx] = name or self.players[idx]['name']
        self.players[idx]['name'] = self.player_names[idx]
        if len(self.sids) == 2:
            self._start_game()
        return True, idx

    def leave(self, sid):
        if sid in self.sids:
            del self.sids[sid]

    def player_idx(self, sid):
        return self.sids.get(sid, -1)

    def _start_game(self):
        self.deck = create_deck()
        self.discard_pile = []
        self.discard_turns = []
        p0_hand = draw_cards(self.deck, INITIAL_HAND_P0)
        p1_hand = draw_cards(self.deck, INITIAL_HAND_P1)
        self.players[0]['hand'] = sort_hand(p0_hand)
        self.players[1]['hand'] = sort_hand(p1_hand)
        if FIRST_PLAYER_BONUS > 0:
            self.players[0]['score'] = FIRST_PLAYER_BONUS
            self._log('game_start', f'对决开始！先手获得 {FIRST_PLAYER_BONUS} 点先攻补偿。')
        else:
            self._log('game_start', f'对决开始！先手 {INITIAL_HAND_P0} 张，后手 {INITIAL_HAND_P1} 张。')
        if NO_AMBUSH_BEFORE_TURN > 1:
            self._log('rule_notice',
                      f'前 {NO_AMBUSH_BEFORE_TURN - 1} 回合为【蓄力阶段】，不能发起突袭。')
        self.current_player = 0
        self.turn_number = 1
        self._begin_turn()

    # ── Turn management ────────────────────────────────
    def _reset_turn(self):
        self.drawn_cards = []
        self.draw_was_overdraft = False
        self.ambush_count_this_turn = 0
        self.ambush_second_pending = False
        self.atk_card = None
        self.def_card = None
        self.ambush_result = 0
        self.ambush_godslayer = False
        self.ambush_fold = False
        self.duel_winner_idx = -1
        self.ambush_last_outcome = None
        self.stolen_preview = None
        self.instant_count = 0
        self.played_this_turn = []
        self.turn_log = []

    def _begin_turn(self):
        """Called at start of every turn. Auto-draws, logs, sets phase to DRAW."""
        self._reset_turn()
        p = self._cur()
        n = 1 if p['overdraft'] else 2
        self.draw_was_overdraft = p['overdraft']
        p['overdraft'] = False
        drawn = draw_cards(self.deck, n)
        p['hand'].extend(drawn)
        p['hand'] = sort_hand(p['hand'])
        self.drawn_cards = list(drawn)
        if drawn:
            self._log('draw', f'{p["name"]} 自动汲取 {len(drawn)} 张牌')
        else:
            self._log('draw', f'{p["name"]} 牌库已空，无法汲取')

        deck_left = len(self.deck)
        if 0 < deck_left <= DECK_LOW_THRESHOLD:
            self._log('deck_warning', f'⚠ 牌库仅剩 {deck_left} 张！终局将至！')
        self.phase = 'DRAW'

    def _after_draw(self):
        """After DRAW_ACK or timeout, move to ambush or spell."""
        if self.turn_number < NO_AMBUSH_BEFORE_TURN:
            self._log('phase_skip', f'【蓄力期】本回合无法突袭')
            self.phase = 'SPELL'
        else:
            self.phase = 'AMBUSH_DECIDE'

    def _log(self, type_, msg, **kwargs):
        entry = {'type': type_, 'msg': msg, 'turn': self.turn_number, **kwargs}
        self.turn_log.append(entry)
        self.game_log.append(entry)

    def _cur(self):
        return self.players[self.current_player]

    def _opp(self):
        return self.players[1 - self.current_player]

    def _discard(self, cards):
        for c in cards:
            if c is None:
                continue
            self.discard_pile.append(c)
            self.discard_turns.append(self.turn_number)

    # ── Red zone shared slots ──────────────────────────
    def _red_available(self, key):
        return self.shared_red.get(key, -1) == -1

    def _slots_left(self, pidx, key):
        """Remaining slots for given key on pidx's pad, considering red sharing."""
        p = self.players[pidx]
        info = p['scorepad'][key]
        if key in RED_KEYS:
            if not self._red_available(key):
                return 0
            return info['max_slots'] - len(info['scores']) - info['sealed']
        return info['max_slots'] - len(info['scores']) - info['sealed']

    def _has_open_slot(self, pidx):
        for cfg in SCOREPAD_CONFIG:
            if self._slots_left(pidx, cfg['key']) > 0:
                return True
        return False

    # ── Race / end checks ──────────────────────────────
    def _check_race_win(self):
        for i in range(2):
            if _total_score(self.players[i]) >= WIN_SCORE:
                self.winner = i
                self.phase = 'GAME_OVER'
                self._log('game_over', f'{self.players[i]["name"]} 达成 {WIN_SCORE} 分竞速胜利！')
                return True
        return False

    def _check_deck_empty(self):
        return len(self.deck) == 0

    def _advance_to_next_turn(self):
        if self._check_deck_empty():
            self.phase = 'COLLISION_PRE_DISCARD'
            self.col_pre_discard_done = [False, False]
            self._log('collision', '牌库耗尽，即将进入魔力对撞！')
            return
        self.current_player = 1 - self.current_player
        self.turn_number += 1
        self._begin_turn()

    # ── Utility: draw/discard/steal ────────────────────
    def _draw_to_hand(self, pidx, n):
        drawn = draw_cards(self.deck, n)
        if drawn:
            self.players[pidx]['hand'].extend(drawn)
            self.players[pidx]['hand'] = sort_hand(self.players[pidx]['hand'])
        return drawn

    def _random_steal(self, thief_idx, victim_idx, n):
        """Steal n random cards from victim's hand into thief's hand."""
        victim = self.players[victim_idx]
        thief = self.players[thief_idx]
        stolen = []
        for _ in range(n):
            if not victim['hand']:
                break
            c = random.choice(victim['hand'])
            victim['hand'].remove(c)
            thief['hand'].append(c)
            stolen.append(c)
        thief['hand'] = sort_hand(thief['hand'])
        return stolen

    def _random_discard_from_hand(self, pidx, n):
        p = self.players[pidx]
        dumped = []
        for _ in range(n):
            if not p['hand']:
                break
            c = random.choice(p['hand'])
            p['hand'].remove(c)
            dumped.append(c)
        self._discard(dumped)
        return dumped

    def _enforce_hand_limit(self, pidx):
        """If pidx's hand > HAND_LIMIT, trim lowest-rank (ties: keep A/B)."""
        p = self.players[pidx]
        over = len(p['hand']) - HAND_LIMIT
        if over <= 0:
            return []
        # Discard lowest base-value cards (F/E first), keeping 瞬 if possible
        sorted_cards = sorted(p['hand'], key=lambda c: -CARD_CONFIG[c]['rank'])
        dumped = sorted_cards[:over]
        for c in dumped:
            p['hand'].remove(c)
        self._discard(dumped)
        return dumped

    # ── Action dispatcher ──────────────────────────────
    def handle_action(self, sid, action, data=None):
        if data is None:
            data = {}
        pidx = self.player_idx(sid)
        if pidx == -1:
            return False, 'Not in this room'

        handler = {
            'DRAW_ACK': self._h_draw_ack,
            'AMBUSH_DECIDE': self._h_ambush_decide,
            'AMBUSH_PAY_COST': self._h_ambush_pay_cost,
            'AMBUSH_ATK_SELECT': self._h_ambush_atk_select,
            'AMBUSH_CANCEL': self._h_ambush_cancel,
            'AMBUSH_DEFEND': self._h_ambush_defend,
            'SPELL_SCORE': self._h_spell_score,
            'SPELL_INSTANT': self._h_spell_instant,
            'SPELL_BREAKER': self._h_spell_breaker,
            'SPELL_SACRIFICE': self._h_spell_sacrifice,
            'SPELL_SKIP': self._h_spell_skip,
            'END_DISCARD': self._h_end_discard,
            'COLLISION_PRE_DISCARD': self._h_col_pre_discard,
            'COLLISION_BET': self._h_col_bet,
            'COLLISION_FLIP': self._h_col_flip,
        }.get(action)

        if not handler:
            return False, f'Unknown action: {action}'
        return handler(pidx, data)

    # ── DRAW ──────────────────────────────────────────
    def _h_draw_ack(self, pidx, data):
        if self.phase != 'DRAW' or pidx != self.current_player:
            return False, 'Wrong phase / not your turn'
        self._after_draw()
        return True, None

    # ── AMBUSH ────────────────────────────────────────
    def _h_ambush_decide(self, pidx, data):
        if self.phase != 'AMBUSH_DECIDE' or pidx != self.current_player:
            return False, 'Not your turn / wrong phase'
        choice = data.get('choice')
        if choice == 'skip':
            self.phase = 'SPELL'
            self._log('ambush', f'{self._cur()["name"]} 跳过突袭')
            return True, None
        if choice == 'attack':
            p = self._cur()
            eligible = [c for c in p['hand'] if c != '瞬']
            if not eligible:
                return False, '没有可出的非瞬手牌'
            if self.ambush_count_this_turn >= AMBUSH_MAX_PER_TURN:
                return False, '本回合突袭次数已达上限'
            # 2nd attempt needs cost
            if self.ambush_count_this_turn >= 1:
                if len(p['hand']) <= AMBUSH_SECOND_COST:
                    return False, f'手牌不足，第 2 次突袭需要明弃 {AMBUSH_SECOND_COST} 张'
                self.ambush_second_pending = True
                self.phase = 'AMBUSH_PAY_COST'
                return True, None
            self.phase = 'AMBUSH_ATK_SELECT'
            return True, None
        return False, '无效选择'

    def _h_ambush_pay_cost(self, pidx, data):
        if self.phase != 'AMBUSH_PAY_COST' or pidx != self.current_player:
            return False, 'Wrong phase'
        cards = data.get('cards', [])
        if len(cards) != AMBUSH_SECOND_COST:
            return False, f'必须明弃恰好 {AMBUSH_SECOND_COST} 张'
        p = self._cur()
        hand_copy = list(p['hand'])
        for c in cards:
            if c not in hand_copy:
                return False, f'手牌中没有 {c}'
            hand_copy.remove(c)
        for c in cards:
            p['hand'].remove(c)
        self._discard(cards)
        self._log('ambush_cost', f'{p["name"]} 为第 2 次突袭明弃 {len(cards)} 张')
        self.ambush_second_pending = False
        self.phase = 'AMBUSH_ATK_SELECT'
        return True, None

    def _h_ambush_atk_select(self, pidx, data):
        if self.phase != 'AMBUSH_ATK_SELECT' or pidx != self.current_player:
            return False, 'Wrong phase'
        card = data.get('card')
        p = self._cur()
        if card not in p['hand'] or card == '瞬':
            return False, 'Invalid attack card'
        p['hand'].remove(card)
        self.atk_card = card
        self.ambush_count_this_turn += 1
        self.ambush_fold = False
        self.def_card = None
        self.ambush_result = 0
        self.duel_winner_idx = -1
        self.ambush_godslayer = False
        self._log('ambush_atk', f'{p["name"]} 暗扣了一张牌')

        opp = self._opp()
        if not opp['hand']:
            # Fix: defender has no cards at all — auto win, draw 2, no steal
            self._discard([self.atk_card])
            drawn = self._draw_to_hand(self.current_player, 2)
            self.duel_winner_idx = self.current_player
            self.ambush_result = 1
            self.ambush_last_outcome = {
                'outcome': 'auto_win',
                'atk': self.atk_card, 'def': None,
                'drew': len(drawn), 'stole': 0,
            }
            self._log('ambush_reveal', f'防守方无牌，攻击方 {self.atk_card} 自动胜利 — 抽 {len(drawn)} 张')
            self._post_ambush_continue()
            return True, None

        self.phase = 'AMBUSH_DEF_CHOICE'
        return True, None

    def _h_ambush_cancel(self, pidx, data):
        if self.phase not in ('AMBUSH_ATK_SELECT', 'AMBUSH_PAY_COST') or pidx != self.current_player:
            return False, 'Wrong phase'
        self.phase = 'AMBUSH_DECIDE'
        self.ambush_second_pending = False
        return True, None

    def _h_ambush_defend(self, pidx, data):
        if self.phase != 'AMBUSH_DEF_CHOICE' or pidx != (1 - self.current_player):
            return False, 'Not defender / wrong phase'
        choice = data.get('choice')
        opp = self._opp()
        atk_idx = self.current_player
        def_idx = 1 - atk_idx

        if choice == 'fold':
            # Attacker steals 1 random from defender, attack card → discard
            stolen = self._random_steal(atk_idx, def_idx, AMBUSH_STEAL_COUNT)
            self._discard([self.atk_card])
            self.ambush_fold = True
            self.def_card = None
            self.ambush_result = 1
            self.duel_winner_idx = atk_idx
            self.stolen_preview = {'to': atk_idx, 'count': len(stolen)}
            self.ambush_last_outcome = {
                'outcome': 'fold', 'atk': self.atk_card, 'def': None,
                'stole': len(stolen),
            }
            self._log('ambush_reveal',
                      f'{opp["name"]} 选择怯战！{self._cur()["name"]} 窃取了 {len(stolen)} 张牌')
            self._post_ambush_continue()
            return True, None

        if choice != 'defend':
            return False, '无效选择'

        card = data.get('card')
        if card not in opp['hand']:
            return False, 'Card not in defender hand'

        # Defender plays 瞬 → absorb attack card, 瞬 discarded, forced tie
        if card == '瞬':
            opp['hand'].remove('瞬')
            self._discard(['瞬'])
            opp['hand'].append(self.atk_card)
            opp['hand'] = sort_hand(opp['hand'])
            # Enforce hand limit immediately if exceeded
            dumped = self._enforce_hand_limit(def_idx)
            extra = f'（溢出弃 {len(dumped)} 张）' if dumped else ''
            self.def_card = '瞬'
            self.ambush_result = 0
            self.duel_winner_idx = -1
            self.ambush_last_outcome = {
                'outcome': 'shun_absorb',
                'atk': self.atk_card, 'def': '瞬',
                'absorbed': self.atk_card,
            }
            self._log('ambush_reveal',
                      f'{opp["name"]} 打出「瞬」吸收了 {self.atk_card}！强制平局 {extra}')
            self.atk_card = None
            self._post_ambush_continue()
            return True, None

        opp['hand'].remove(card)
        self.def_card = card
        result = compare_duel(self.atk_card, card)
        self.ambush_result = result
        self.ambush_godslayer = (card == 'F' and self.atk_card == 'A') or \
                                (self.atk_card == 'F' and card == 'A')

        stole = 0
        drew = 0
        a_bonus_msg = ''
        if result == 1:
            # Attacker wins
            self.duel_winner_idx = atk_idx
            drew_cards = self._draw_to_hand(atk_idx, 1)
            drew = len(drew_cards)
            stolen = self._random_steal(atk_idx, def_idx, AMBUSH_STEAL_COUNT)
            stole = len(stolen)
            # A bonuses
            if self.atk_card == 'A' and card != 'F':
                self._cur()['score'] += AMBUSH_A_WIN_BONUS
                a_bonus_msg += f' 圣物威压+{AMBUSH_A_WIN_BONUS}'
            if card == 'A' and self.atk_card != 'F':
                opp['score'] += AMBUSH_A_LOSE_BONUS
                a_bonus_msg += f' 圣物陨落+{AMBUSH_A_LOSE_BONUS}'
            # F > A godslayer
            if self.atk_card == 'F' and card == 'A':
                self._cur()['breaker_marks'] += 1
                a_bonus_msg += ' 弑神·破法者+1'
            self._discard([self.atk_card, card])
            self._log('ambush_reveal',
                      f'{self.atk_card} vs {card} — 攻击方胜！抽{drew}偷{stole}{a_bonus_msg}')
        elif result == -1:
            # Defender wins
            self.duel_winner_idx = def_idx
            drew_cards = self._draw_to_hand(def_idx, 1)
            drew = len(drew_cards)
            stolen = self._random_steal(def_idx, atk_idx, AMBUSH_STEAL_COUNT)
            stole = len(stolen)
            if card == 'A' and self.atk_card != 'F':
                opp['score'] += AMBUSH_A_WIN_BONUS
                a_bonus_msg += f' 圣物威压+{AMBUSH_A_WIN_BONUS}'
            if self.atk_card == 'A' and card != 'F':
                self._cur()['score'] += AMBUSH_A_LOSE_BONUS
                a_bonus_msg += f' 圣物陨落+{AMBUSH_A_LOSE_BONUS}'
            if card == 'F' and self.atk_card == 'A':
                opp['breaker_marks'] += 1
                a_bonus_msg += ' 弑神·破法者+1'
            self._discard([self.atk_card, card])
            self._log('ambush_reveal',
                      f'{self.atk_card} vs {card} — 防守方胜！抽{drew}偷{stole}{a_bonus_msg}')
        else:
            # Tie — no bonus even if A vs A
            self._discard([self.atk_card, card])
            self._log('ambush_reveal', f'{self.atk_card} vs {card} — 平局！')

        self.ambush_last_outcome = {
            'outcome': 'win' if result == 1 else ('lose' if result == -1 else 'tie'),
            'atk': self.atk_card, 'def': card,
            'stole': stole, 'drew': drew,
        }
        self._post_ambush_continue()
        return True, None

    def _post_ambush_continue(self):
        """After any ambush resolution, check win then go back to AMBUSH_DECIDE (for possible 2nd) or SPELL."""
        if self._check_race_win():
            return
        # Can still do another ambush? (If under limit and eligible)
        p = self._cur()
        eligible = [c for c in p['hand'] if c != '瞬']
        can_continue = (self.ambush_count_this_turn < AMBUSH_MAX_PER_TURN
                        and len(self._opp()['hand']) > 0
                        and eligible
                        and len(p['hand']) > AMBUSH_SECOND_COST)
        if can_continue:
            self.phase = 'AMBUSH_DECIDE'
            self.atk_card = None
            self.def_card = None
        else:
            self.phase = 'SPELL'
            self.atk_card = None
            self.def_card = None

    # ── SPELL ─────────────────────────────────────────
    def _h_spell_score(self, pidx, data):
        if self.phase != 'SPELL' or pidx != self.current_player:
            return False, 'Not your turn / wrong phase'
        cards = data.get('cards', [])
        combo_key = data.get('combo_key')

        combos = find_combos(cards)
        match = None
        for c in combos:
            if c['key'] == combo_key:
                match = c
                break
        if not match:
            return False, '无效组合'

        p = self._cur()
        if self._slots_left(pidx, combo_key) <= 0:
            return False, '该组合已无可用格位'

        hand_copy = list(p['hand'])
        for c in cards:
            if c not in hand_copy:
                return False, f'手牌中没有 {c}'
            hand_copy.remove(c)

        for c in cards:
            p['hand'].remove(c)
        self.played_this_turn.extend(cards)

        final_score = apply_modifiers(match['base_score'], p['curse_active'])
        curse_msg = ''
        if p['curse_active']:
            curse_msg = '（受诅咒 -10）'
            p['curse_active'] = False
        p['scorepad'][combo_key]['scores'].append(final_score)

        self._log('score', f'{p["name"]} 施展 {match["name"]} = {final_score} 分 {curse_msg}')

        # V3: Red zone shared + punish / Blue+Green reward draw
        if combo_key in RED_KEYS:
            self.shared_red[combo_key] = pidx
            dumped = self._random_discard_from_hand(1 - pidx, RED_PUNISH_DISCARD)
            self._log('red_punish',
                      f'【禁忌连击】{self._opp()["name"]} 随机弃 {len(dumped)} 张手牌')
        elif combo_key in BLUE_KEYS and BLUE_REWARD_DRAW > 0:
            drawn = self._draw_to_hand(pidx, BLUE_REWARD_DRAW)
            if drawn:
                self._log('blue_reward', f'【元素回流】抽取 {len(drawn)} 张奖励牌')
        elif combo_key in GREEN_KEYS and GREEN_REWARD_DRAW > 0:
            drawn = self._draw_to_hand(pidx, GREEN_REWARD_DRAW)
            if drawn:
                self._log('green_reward', f'【共鸣余响】抽取 {len(drawn)} 张奖励牌')

        if self._check_race_win():
            return True, None
        return True, None

    def _h_spell_instant(self, pidx, data):
        if self.phase != 'SPELL' or pidx != self.current_player:
            return False, 'Wrong phase'
        if self.instant_count >= INSTANT_PER_TURN:
            return False, '本回合已使用瞬'

        p = self._cur()
        if '瞬' not in p['hand']:
            return False, '手牌中没有瞬'
        discard_cards = data.get('discard_cards', [])
        if not discard_cards:
            return False, '必须弃至少 1 张牌'
        non_instant = [c for c in p['hand'] if c != '瞬']
        tmp = list(non_instant)
        for c in discard_cards:
            if c not in tmp:
                return False, f'不能弃 {c}'
            tmp.remove(c)

        p['hand'].remove('瞬')
        self._discard(['瞬'])
        for c in discard_cards:
            p['hand'].remove(c)
        self._discard(discard_cards)

        drawn = self._draw_to_hand(pidx, len(discard_cards))
        p['overdraft'] = True
        self.instant_count += 1

        self._log('instant', f'{p["name"]} 使用瞬换牌：弃 {len(discard_cards)} / 抽 {len(drawn)}（下回合透支抽 1）')
        return True, None

    def _h_spell_breaker(self, pidx, data):
        if self.phase != 'SPELL' or pidx != self.current_player:
            return False, 'Wrong phase'
        p = self._cur()
        if p['breaker_marks'] <= 0:
            return False, '没有破法者标记'

        action_type = data.get('type')
        opp = self._opp()

        if action_type == 'seal':
            slot_key = data.get('slot_key')
            if not slot_key:
                return False, 'No slot specified'
            opp_idx = 1 - pidx
            if self._slots_left(opp_idx, slot_key) <= 0:
                return False, '该格位已占用或不可封印'
            if _total_sealed(opp['scorepad']) >= SEAL_LIMIT:
                return False, '对手封印已满'
            opp['scorepad'][slot_key]['sealed'] += 1
            p['breaker_marks'] -= 1
            self._log('breaker_seal',
                      f'{p["name"]} 封印了对手的 [{opp["scorepad"][slot_key]["name"]}]')
            return True, None
        elif action_type == 'curse':
            if opp['curse_active']:
                return False, '对手已被诅咒'
            opp['curse_active'] = True
            p['breaker_marks'] -= 1
            self._log('breaker_curse', f'{p["name"]} 对 {opp["name"]} 施加诅咒（下次计分 -10）')
            return True, None
        return False, '无效破法者类型'

    def _h_spell_sacrifice(self, pidx, data):
        """V3.0 sacrifice: pick scored slot, discard X, pick X from last N turns' discard, end turn.

        Payload:
        {
            'slot_key': str,
            'score_idx': int (index into scores list),
            'discard_cards': [str, ...] (length X, X <= SACRIFICE_MAX_X),
            'recover_indices': [int, ...] (same length X, indices into discard_pile for window)
        }
        """
        if self.phase != 'SPELL' or pidx != self.current_player:
            return False, 'Wrong phase'
        p = self._cur()

        slot_key = data.get('slot_key')
        score_idx = data.get('score_idx')
        discard_cards = data.get('discard_cards', [])
        recover_idx_list = data.get('recover_indices', [])

        if not slot_key or slot_key not in p['scorepad']:
            return False, '无效格位'
        info = p['scorepad'][slot_key]
        if not isinstance(score_idx, int) or not (0 <= score_idx < len(info['scores'])):
            return False, '无效得分索引'

        x = len(discard_cards)
        if x != len(recover_idx_list):
            return False, '弃牌与回收数量不一致'
        if x < 1 or x > SACRIFICE_MAX_X:
            return False, f'必须交换 1~{SACRIFICE_MAX_X} 张牌'

        # Validate discard cards in hand
        tmp = list(p['hand'])
        for c in discard_cards:
            if c not in tmp:
                return False, f'手牌中没有 {c}'
            tmp.remove(c)

        # Validate recover indices in window
        window = self._sacrifice_window()
        window_idx_set = set(i for i, _ in window)
        for ri in recover_idx_list:
            if not isinstance(ri, int) or ri not in window_idx_set:
                return False, '选中的弃牌不在窗口内'
        if len(set(recover_idx_list)) != len(recover_idx_list):
            return False, '回收索引重复'

        # Execute: remove score, seal slot, discard hand cards, recover from discard pile
        lost_score = info['scores'].pop(score_idx)
        info['sealed'] += 1
        self._log('sacrifice_slot',
                  f'{p["name"]} 献祭 [{info["name"]}] — 扣除 {lost_score} 分并永久封印')

        for c in discard_cards:
            p['hand'].remove(c)
        self._discard(discard_cards)

        # Remove recovered cards from discard_pile in reverse-sorted order to keep indices stable
        recovered = []
        for ri in sorted(recover_idx_list, reverse=True):
            card = self.discard_pile.pop(ri)
            self.discard_turns.pop(ri)
            recovered.append(card)
        p['hand'].extend(recovered)
        p['hand'] = sort_hand(p['hand'])
        self._log('sacrifice_swap',
                  f'{p["name"]} 黑暗交换：弃 {x} 张 / 从弃牌堆精准选取 {x} 张')

        # Forced end of turn
        if self._check_race_win():
            return True, None
        self._finish_spell(force_end=True)
        return True, None

    def _h_spell_skip(self, pidx, data):
        if self.phase != 'SPELL' or pidx != self.current_player:
            return False, 'Wrong phase'
        self._log('spell_skip', f'{self._cur()["name"]} 跳过咏唱阶段')
        self._finish_spell()
        return True, None

    def _finish_spell(self, force_end=False):
        self._discard(self.played_this_turn)
        self.played_this_turn = []
        if self._check_race_win():
            return
        p = self._cur()
        overflow = hand_overflow(p['hand'])
        if overflow > 0 and not force_end:
            self.phase = 'END_DISCARD'
        else:
            if overflow > 0 and force_end:
                # Auto-trim on forced end (sacrifice)
                dumped = self._enforce_hand_limit(self.current_player)
                if dumped:
                    self._log('end_discard', f'（强制结束）整理自动弃 {len(dumped)} 张')
            self._finish_turn()

    def _h_end_discard(self, pidx, data):
        if self.phase != 'END_DISCARD' or pidx != self.current_player:
            return False, 'Wrong phase'
        cards = data.get('cards', [])
        p = self._cur()
        needed = hand_overflow(p['hand'])
        if len(cards) != needed:
            return False, f'Must discard exactly {needed}'
        tmp = list(p['hand'])
        for c in cards:
            if c not in tmp:
                return False, f'手牌中没有 {c}'
            tmp.remove(c)
        for c in cards:
            p['hand'].remove(c)
        self._discard(cards)
        self._log('end_discard', f'{p["name"]} 弃 {len(cards)} 张')
        self._finish_turn()
        return True, None

    def _finish_turn(self):
        if self._check_race_win():
            return
        self._advance_to_next_turn()

    # ── Sacrifice helpers ──────────────────────────────
    def _sacrifice_window(self):
        """Return list of (index, card) from discard pile within last SACRIFICE_WINDOW turns.
        Excludes current turn's discards.
        """
        out = []
        for i, card in enumerate(self.discard_pile):
            t = self.discard_turns[i]
            if t < self.turn_number and t >= self.turn_number - SACRIFICE_WINDOW:
                out.append((i, card))
        return out

    # ── Collision phase ────────────────────────────────
    def _col_must_discard(self, pidx):
        h0 = len(self.players[0]['hand'])
        h1 = len(self.players[1]['hand'])
        if h0 == h1:
            return 0
        if pidx == 0 and h0 > h1:
            return h0 - h1
        if pidx == 1 and h1 > h0:
            return h1 - h0
        return 0

    def _h_col_pre_discard(self, pidx, data):
        if self.phase != 'COLLISION_PRE_DISCARD':
            return False, 'Wrong phase'
        if self.col_pre_discard_done[pidx]:
            return False, 'Already submitted'

        cards = data.get('cards', [])
        must = self._col_must_discard(pidx)
        if must > 0:
            if len(cards) != must:
                return False, f'必须弃恰好 {must} 张以平衡手牌'
        else:
            if len(cards) > 2:
                return False, '至多弃 2 张'

        p = self.players[pidx]
        tmp = list(p['hand'])
        for c in cards:
            if c not in tmp:
                return False, f'手牌中没有 {c}'
            tmp.remove(c)
        for c in cards:
            p['hand'].remove(c)
        self._discard(cards)
        self.col_pre_discard_done[pidx] = True
        self._log('col_pre_discard', f'{p["name"]} 对撞前弃 {len(cards)} 张')

        if all(self.col_pre_discard_done):
            h0 = len(self.players[0]['hand'])
            h1 = len(self.players[1]['hand'])
            if h0 != h1:
                extra = min(h0, h1)
                if h0 > extra:
                    diff = h0 - extra
                    worst = sorted(self.players[0]['hand'], key=lambda c: CARD_CONFIG[c]['rank'], reverse=True)[:diff]
                    for c in worst:
                        self.players[0]['hand'].remove(c)
                    self._discard(worst)
                elif h1 > extra:
                    diff = h1 - extra
                    worst = sorted(self.players[1]['hand'], key=lambda c: CARD_CONFIG[c]['rank'], reverse=True)[:diff]
                    for c in worst:
                        self.players[1]['hand'].remove(c)
                    self._discard(worst)
            self.col_bet_caller = self.current_player
            self.col_bet_amount = 0
            self.col_bet_phase = 'CALLER'
            self.col_bet_response = None
            self.col_bonus_pot = 0
            self.phase = 'COLLISION_BET'
            self._log('col_bet', '进入对撞赌注阶段 — 先手方选择押注额')
        return True, None

    def _h_col_bet(self, pidx, data):
        if self.phase != 'COLLISION_BET':
            return False, 'Wrong phase'

        if self.col_bet_phase == 'CALLER':
            if pidx != self.col_bet_caller:
                return False, 'Not the caller'
            amount = data.get('amount', 0)
            if amount not in (0, 10, 20):
                return False, 'Bet must be 0, 10, or 20'
            self.col_bet_amount = amount
            if amount == 0:
                self._log('col_bet', f'{self.players[pidx]["name"]} 不押注')
                self._start_collision()
                return True, None
            self.col_bet_phase = 'RESPONDER'
            self._log('col_bet', f'{self.players[pidx]["name"]} 押注 {amount} 分！')
            return True, None

        if self.col_bet_phase == 'RESPONDER':
            responder = 1 - self.col_bet_caller
            if pidx != responder:
                return False, 'Not the responder'
            choice = data.get('choice')
            if choice == 'follow':
                self.col_bet_response = 'follow'
                bet = self.col_bet_amount
                self.players[0]['score'] -= bet
                self.players[1]['score'] -= bet
                self.col_bonus_pot = bet * 2
                self._log('col_bet', f'{self.players[pidx]["name"]} 跟注！底池 +{bet * 2}')
                self._start_collision()
                return True, None
            if choice == 'fold':
                self.col_bet_response = 'fold'
                self.players[self.col_bet_caller]['score'] += 5
                self.col_bonus_pot = 0
                self._log('col_bet',
                          f'{self.players[pidx]["name"]} 退缩，{self.players[self.col_bet_caller]["name"]} 白得 5 分')
                self._start_collision()
                return True, None
            return False, 'Invalid choice'
        return False, 'Unexpected bet phase'

    def _start_collision(self):
        p0_cards = list(self.players[0]['hand'])
        p1_cards = list(self.players[1]['hand'])
        random.shuffle(p0_cards)
        random.shuffle(p1_cards)
        self.col_p0_cards = p0_cards
        self.col_p1_cards = p1_cards
        self.col_p0_flipped = set()
        self.col_p1_flipped = set()
        self.col_flipper = 0
        self.col_round_pair = [None, None]
        self.col_state = col_init(p0_cards, p1_cards)
        self.col_state['pot'] += self.col_bonus_pot
        self.phase = 'COLLISION_FLIP'
        base = 10 + self.col_bonus_pot
        self._log('collision_start', f'对撞开始！初始底池 {base} 分')
        if not p0_cards and not p1_cards:
            self.col_state['done'] = True
            self._finish_collision()

    def _h_col_flip(self, pidx, data):
        if self.phase != 'COLLISION_FLIP':
            return False, 'Wrong phase'

        r = self.col_state['round']
        n0, n1 = len(self.col_p0_cards), len(self.col_p1_cards)
        mx = max(n0, n1)
        if r >= mx:
            self._finish_collision()
            return True, None

        has0 = r < n0
        has1 = r < n1

        if has0 and has1:
            if self.col_round_pair[0] is None:
                if pidx != 0:
                    return False, 'Player 0 flips first'
                self.col_p0_flipped.add(r)
                self.col_round_pair[0] = self.col_p0_cards[r]
                self._log('col_flip', f'玩家 0 翻开第 {r+1} 张')
                return True, None
            if self.col_round_pair[1] is None:
                if pidx != 1:
                    return False, 'Player 1 flips next'
                self.col_p1_flipped.add(r)
                self.col_round_pair[1] = self.col_p1_cards[r]
                self._log('col_flip', f'玩家 1 翻开第 {r+1} 张')
                res = col_next(self.col_state)
                if res:
                    self._log('col_result', self._format_col_result(res))
                self.col_round_pair = [None, None]
                if self.col_state['done']:
                    self._finish_collision()
                return True, None
        elif has0:
            if pidx != 0:
                return False, 'Player 0 flips (crush)'
            self.col_p0_flipped.add(r)
            res = col_next(self.col_state)
            if res:
                self._log('col_result', self._format_col_result(res))
            self.col_round_pair = [None, None]
            if self.col_state['done']:
                self._finish_collision()
            return True, None
        elif has1:
            if pidx != 1:
                return False, 'Player 1 flips (crush)'
            self.col_p1_flipped.add(r)
            res = col_next(self.col_state)
            if res:
                self._log('col_result', self._format_col_result(res))
            self.col_round_pair = [None, None]
            if self.col_state['done']:
                self._finish_collision()
            return True, None

        return False, 'Unexpected state'

    def _format_col_result(self, res):
        t = res['type']
        if t == 'win':
            return f'玩家 {res["winner"]} 获胜！{res.get("c0","?")} vs {res.get("c1","?")} → +{res["pts"]} 分'
        elif t == 'tie':
            return f'平局 {res.get("c0","?")} vs {res.get("c1","?")} — 底池 {res["pot"]}'
        elif t == 'crush':
            return f'空位碾压！玩家 {res["winner"]} → +{res["pts"]} 分'
        elif t == 'overload':
            return f'魔力过载！{res.get("c0","?")} vs {res.get("c1","?")} — {res["lost"]} 分消散'
        return str(res)

    def _finish_collision(self):
        cs = self.col_state['score']
        self.players[0]['score'] += cs[0]
        self.players[1]['score'] += cs[1]
        t0 = _total_score(self.players[0])
        t1 = _total_score(self.players[1])
        self.winner = final_winner(t0, t1, self.col_p0_cards, self.col_p1_cards)
        self.phase = 'GAME_OVER'
        w_name = self.players[self.winner]['name'] if self.winner >= 0 else '无人'
        self._log('game_over',
                  f'对撞结束！{self.players[0]["name"]} {t0} vs {self.players[1]["name"]} {t1} — {w_name}获胜')

    def _col_waiting_for(self):
        if not self.col_state or self.col_state['done']:
            return -1
        r = self.col_state['round']
        n0, n1 = len(self.col_p0_cards), len(self.col_p1_cards)
        has0 = r < n0
        has1 = r < n1
        if has0 and has1:
            if self.col_round_pair[0] is None:
                return 0
            return 1
        if has0:
            return 0
        if has1:
            return 1
        return -1

    # ── View log filtering ─────────────────────────────
    def _filtered_log(self, pidx):
        filtered = []
        for entry in self.turn_log[-12:]:
            if entry['type'] == 'ambush_atk' and pidx != self.current_player:
                filtered.append({**entry, 'msg': '对手暗扣了一张牌'})
            else:
                filtered.append(entry)
        return filtered

    # ── View generation ────────────────────────────────
    def get_view(self, pidx):
        if pidx < 0 or pidx > 1:
            return {'phase': 'LOBBY'}

        opp_idx = 1 - pidx
        p = self.players[pidx]
        opp = self.players[opp_idx]

        view = {
            'phase': self.phase,
            'my_idx': pidx,
            'my_name': p['name'],
            'opp_name': opp['name'],
            'is_ai_game': self.is_ai_game,
            'my_hand': p['hand'],
            'opp_hand_count': len(opp['hand']),
            'my_score': _total_score(p),
            'opp_score': _total_score(opp),
            'my_pad': p['scorepad'],
            'opp_pad': opp['scorepad'],
            'shared_red': self.shared_red,
            'my_breaker': p['breaker_marks'],
            'my_curse': p['curse_active'],
            'opp_curse': opp['curse_active'],
            'deck_count': len(self.deck),
            'deck_low': 0 < len(self.deck) <= DECK_LOW_THRESHOLD,
            'discard_count': len(self.discard_pile),
            'is_my_turn': self.current_player == pidx,
            'current_player': self.current_player,
            'turn_number': self.turn_number,
            'win_score': WIN_SCORE,
            'hand_limit': HAND_LIMIT,
            'log': self._filtered_log(pidx),
            'winner': self.winner,
            'no_ambush_before': NO_AMBUSH_BEFORE_TURN,
            'ambush_count': self.ambush_count_this_turn,
            'ambush_max': AMBUSH_MAX_PER_TURN,
            'ambush_second_cost': AMBUSH_SECOND_COST,
        }

        if self.phase == 'DRAW' and pidx == self.current_player:
            view['drawn_cards'] = self.drawn_cards
            view['draw_was_overdraft'] = self.draw_was_overdraft

        # Ambush phase info
        if self.phase in ('AMBUSH_ATK_SELECT', 'AMBUSH_DEF_CHOICE', 'AMBUSH_PAY_COST'):
            # Reveal atk only to attacker (it's their card)
            if pidx == self.current_player:
                view['atk_card'] = self.atk_card
            else:
                view['atk_card'] = '?' if self.atk_card else None

        if self.phase == 'AMBUSH_DEF_CHOICE':
            view['defender_idx'] = 1 - self.current_player
            view['can_fold'] = True
            view['my_hand_for_defend'] = p['hand'] if pidx == (1 - self.current_player) else None

        if self.ambush_last_outcome:
            view['ambush_last_outcome'] = self.ambush_last_outcome

        if self.phase == 'SPELL' and pidx == self.current_player:
            view['instant_count'] = self.instant_count
            view['instant_limit'] = INSTANT_PER_TURN
            slots_fn = lambda key: self._slots_left(pidx, key)
            view['playable_combos'] = [
                {'key': k, 'name': n, 'cards': c, 'score': s}
                for k, n, c, s in detect_playable(p['hand'], slots_fn)
            ]
            # Sacrifice options
            sac_slots = []
            for cfg in SCOREPAD_CONFIG:
                info = p['scorepad'][cfg['key']]
                if info['scores']:
                    sac_slots.append({
                        'key': cfg['key'],
                        'name': info['name'],
                        'scores': list(info['scores']),
                    })
            view['sacrifice_slots'] = sac_slots
            view['sacrifice_window'] = self._sacrifice_window()
            view['sacrifice_max_x'] = SACRIFICE_MAX_X

        if self.phase == 'END_DISCARD' and pidx == self.current_player:
            view['overflow'] = hand_overflow(p['hand'])

        if self.phase == 'COLLISION_PRE_DISCARD':
            view['col_pre_done'] = self.col_pre_discard_done[pidx]
            view['col_must_discard'] = self._col_must_discard(pidx)

        if self.phase == 'COLLISION_BET':
            view['col_bet_caller'] = self.col_bet_caller
            view['col_bet_phase'] = self.col_bet_phase
            view['col_bet_amount'] = self.col_bet_amount

        if self.phase == 'COLLISION_FLIP':
            my_cards_list = self.col_p0_cards if pidx == 0 else self.col_p1_cards
            my_flipped_set = self.col_p0_flipped if pidx == 0 else self.col_p1_flipped
            view['col_my_card_count'] = len(my_cards_list)
            view['col_my_cards'] = my_cards_list
            view['col_opp_card_count'] = len(self.col_p1_cards) if pidx == 0 else len(self.col_p0_cards)
            view['col_my_flipped'] = list(my_flipped_set)
            view['col_opp_flipped'] = list(self.col_p1_flipped if pidx == 0 else self.col_p0_flipped)
            opp_cards_list = self.col_p1_cards if pidx == 0 else self.col_p0_cards
            opp_flipped_set = self.col_p1_flipped if pidx == 0 else self.col_p0_flipped
            view['col_opp_revealed'] = {i: opp_cards_list[i] for i in opp_flipped_set}
            view['col_my_revealed'] = {i: my_cards_list[i] for i in my_flipped_set}
            view['col_round'] = self.col_state['round'] if self.col_state else 0
            view['col_scores'] = list(self.col_state['score']) if self.col_state else [0, 0]
            view['col_pot'] = self.col_state['pot'] if self.col_state else 0
            view['col_round_pair'] = list(self.col_round_pair)
            view['col_waiting_for'] = self._col_waiting_for()

        if self.phase == 'GAME_OVER':
            view['final_scores'] = [_total_score(self.players[i]) for i in range(2)]
            view['col_scores'] = list(self.col_state['score']) if self.col_state else [0, 0]

        return view
