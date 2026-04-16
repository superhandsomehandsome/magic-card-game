"""Server-side game room: state management + per-player view filtering + all phase logic."""
import random
from game_state import (
    CARD_CONFIG, SCOREPAD_CONFIG, HAND_LIMIT, WIN_SCORE,
    SCORE_MULT, INITIAL_HAND_P0, INITIAL_HAND_P1,
    SCAVENGE_LIMIT, SEAL_LIMIT, INSTANT_PER_TURN, SACRIFICE_DRAW,
)
from game_logic import create_deck, sort_hand, bv, draw_cards, compare_duel, hand_overflow
from scoring import find_combos, apply_modifiers, detect_playable
from collision import init as col_init, next_round as col_next, final_winner, compare as col_compare

SCAVENGE_TURN_WINDOW = 10
TIER1_KEYS = frozenset(c['key'] for c in SCOREPAD_CONFIG if c['tier'] == 1)


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


def _slots_left(pad, key):
    info = pad[key]
    return info['max_slots'] - len(info['scores']) - info['sealed']


def _total_score(player):
    s = player['score']
    for combo in player['scorepad'].values():
        s += sum(combo['scores'])
    return s


def _has_open_slot(pad):
    return any(_slots_left(pad, c['key']) > 0 for c in SCOREPAD_CONFIG)


def _total_sealed(pad):
    return sum(info['sealed'] for info in pad.values())


class GameRoom:
    def __init__(self, room_id):
        self.room_id = room_id
        self.sids = {}
        self.player_names = ['', '']
        self.phase = 'LOBBY'
        self.current_player = 0
        self.turn_number = 1
        self.deck = []
        self.discard_pile = []
        self.discard_turns = []
        self.players = [self._make_player('炼金术士'), self._make_player('占星师')]
        self.drawn_cards = []
        self.draw_done = False
        self.draw_was_overdraft = False
        self.atk_card = None
        self.def_card = None
        self.ambush_result = 0
        self.ambush_godslayer = False
        self.reveal_done = False
        self.duel_pending_discard = []
        self.duel_winner_idx = -1
        self.duel_winner_drew = None
        self.echo_ready = False
        self.instant_count = 0
        self.tier1_bonus = False
        self.played_this_turn = []
        self.col_state = None
        self.col_p0_cards = []
        self.col_p1_cards = []
        self.col_p0_flipped = set()
        self.col_p1_flipped = set()
        self.col_flipper = 0
        self.col_round_pair = [None, None]
        self.col_pre_discard_done = [False, False]
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
            'scavenge_remaining': SCAVENGE_LIMIT,
        }

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
        self.current_player = 0
        self.turn_number = 1
        self.phase = 'DRAW'
        self._reset_turn()
        self._log('game_start', '对决开始！')

    def _reset_turn(self):
        self.drawn_cards = []
        self.draw_done = False
        self.draw_was_overdraft = False
        self.atk_card = None
        self.def_card = None
        self.ambush_result = 0
        self.ambush_godslayer = False
        self.reveal_done = False
        self.duel_pending_discard = []
        self.duel_winner_idx = -1
        self.duel_winner_drew = None
        self.echo_ready = False
        self.instant_count = 0
        self.tier1_bonus = False
        self.played_this_turn = []
        self.turn_log = []

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
            self.discard_pile.append(c)
            self.discard_turns.append(self.turn_number)

    def _flush_duel_pending(self):
        self._discard(self.duel_pending_discard)
        self.duel_pending_discard = []

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
        self._reset_turn()
        self.phase = 'DRAW'

    def _scavengeable_recent(self):
        result = []
        for i, card in enumerate(self.discard_pile):
            if self.discard_turns[i] >= self.turn_number - SCAVENGE_TURN_WINDOW:
                result.append((i, card))
        return result

    # ── Action handlers ────────────────────────────────

    def handle_action(self, sid, action, data=None):
        """Main entry point. Returns (ok, error_msg)."""
        if data is None:
            data = {}
        pidx = self.player_idx(sid)
        if pidx == -1:
            return False, 'Not in this room'

        handler = {
            'DRAW': self._h_draw,
            'AMBUSH_DECIDE': self._h_ambush_decide,
            'AMBUSH_ATK_SELECT': self._h_ambush_atk_select,
            'AMBUSH_DEF_SELECT': self._h_ambush_def_select,
            'AMBUSH_CANCEL': self._h_ambush_cancel,
            'SCAVENGE': self._h_scavenge,
            'SPELL_SCORE': self._h_spell_score,
            'SPELL_INSTANT': self._h_spell_instant,
            'SPELL_SACRIFICE': self._h_spell_sacrifice,
            'SPELL_BREAKER': self._h_spell_breaker,
            'SPELL_SKIP': self._h_spell_skip,
            'END_DISCARD': self._h_end_discard,
            'COLLISION_PRE_DISCARD': self._h_col_pre_discard,
            'COLLISION_FLIP': self._h_col_flip,
        }.get(action)

        if not handler:
            return False, f'Unknown action: {action}'
        return handler(pidx, data)

    def _h_draw(self, pidx, data):
        if self.phase != 'DRAW' or pidx != self.current_player:
            return False, 'Not your turn / wrong phase'
        p = self._cur()
        cnt = 1 if p['overdraft'] else 2
        p['overdraft'] = False
        drawn = draw_cards(self.deck, cnt)
        p['hand'].extend(drawn)
        p['hand'] = sort_hand(p['hand'])
        self.drawn_cards = drawn
        self.draw_done = True
        self._log('draw', f'抽取 {len(drawn)} 张牌')
        self.phase = 'AMBUSH_DECIDE'
        return True, None

    def _h_ambush_decide(self, pidx, data):
        if self.phase != 'AMBUSH_DECIDE' or pidx != self.current_player:
            return False, 'Not your turn / wrong phase'
        choice = data.get('choice')
        if choice == 'skip':
            self.phase = 'SPELL'
            self._log('ambush', '跳过突袭')
            return True, None
        elif choice == 'attack':
            eligible = [c for c in self._cur()['hand'] if c != '瞬']
            if not eligible:
                return False, 'No eligible attack cards'
            self.phase = 'AMBUSH_ATK_SELECT'
            return True, None
        return False, 'Invalid choice'

    def _h_ambush_atk_select(self, pidx, data):
        if self.phase != 'AMBUSH_ATK_SELECT' or pidx != self.current_player:
            return False, 'Not your turn / wrong phase'
        card = data.get('card')
        if card not in self._cur()['hand'] or card == '瞬':
            return False, 'Invalid card'
        self._cur()['hand'].remove(card)
        self.atk_card = card
        self._log('ambush_atk', f'暗扣 {card}')
        self.phase = 'AMBUSH_DEF_SELECT'
        return True, None

    def _h_ambush_cancel(self, pidx, data):
        if self.phase != 'AMBUSH_ATK_SELECT' or pidx != self.current_player:
            return False, 'Wrong phase'
        self.phase = 'AMBUSH_DECIDE'
        return True, None

    def _h_ambush_def_select(self, pidx, data):
        if self.phase != 'AMBUSH_DEF_SELECT' or pidx != (1 - self.current_player):
            return False, 'Not defender / wrong phase'
        card = data.get('card')
        opp = self._opp()

        if card == '瞬' and '瞬' in opp['hand']:
            opp['hand'].remove('瞬')
            self.def_card = '瞬'
            self.duel_pending_discard = [self.atk_card, '瞬']
            self.ambush_result = 0
            self._log('ambush_reveal',
                       f'防守方使用瞬！强制平局 — {self.atk_card} vs 瞬')
            self._flush_duel_pending()
            self.phase = 'SPELL'
            return True, None

        eligible = [c for c in opp['hand'] if c != '瞬']
        if not eligible:
            self.def_card = None
            self.ambush_result = 1
            self.duel_winner_idx = self.current_player
            self.duel_pending_discard = [self.atk_card]
            self._log('ambush_reveal', f'防守方无牌可出，攻击方自动胜利')
            self._duel_winner_auto_draw()
            return True, None

        if card not in opp['hand']:
            return False, 'Card not in hand'

        opp['hand'].remove(card)
        self.def_card = card
        result = compare_duel(self.atk_card, card)
        self.ambush_result = result
        self.ambush_godslayer = (card == 'F' and self.atk_card == 'A')

        self.duel_pending_discard = [self.atk_card, card]

        if result == 1:
            self.duel_winner_idx = self.current_player
            if self.atk_card == 'A':
                self._cur()['score'] += 10
                self._log('holy', '圣物威压 +10 分')
            self._log('ambush_reveal',
                       f'{self.atk_card} vs {card} — 攻击方胜！')
        elif result == -1:
            self.duel_winner_idx = 1 - self.current_player
            if card == 'A':
                opp['score'] += 10
                self._log('holy', '圣物威压 +10 分')
            if self.ambush_godslayer:
                opp['breaker_marks'] += 1
                self._log('godslayer', '弑神成功！获得破法者标记')
            self._log('ambush_reveal',
                       f'{self.atk_card} vs {card} — 防守方胜！')
        else:
            self.duel_winner_idx = -1
            self._log('ambush_reveal', f'{self.atk_card} vs {card} — 平局！')

        if result != 0:
            self._duel_winner_auto_draw()
        else:
            self._flush_duel_pending()
            self._after_duel_to_scavenge_or_spell()
        return True, None

    def _duel_winner_auto_draw(self):
        """Winner automatically draws 1 card from deck."""
        self._flush_duel_pending()
        winner = self.players[self.duel_winner_idx]
        drawn = draw_cards(self.deck, 1)
        self.duel_winner_drew = drawn[0] if drawn else None
        if self.duel_winner_drew:
            winner['hand'].append(self.duel_winner_drew)
            winner['hand'] = sort_hand(winner['hand'])
            self._log('duel_reward', f'胜者从牌库抽取 {self.duel_winner_drew}')
        else:
            self._log('duel_reward', '牌库已空，无法抽牌')
        if self._check_race_win():
            return
        self._after_duel_to_scavenge_or_spell()

    def _after_duel_to_scavenge_or_spell(self):
        """After duel reward, check if loser can scavenge, otherwise go to SPELL."""
        if self.duel_winner_idx >= 0:
            loser_idx = 1 - self.duel_winner_idx
            loser = self.players[loser_idx]
            if loser['scavenge_remaining'] > 0:
                recent = self._scavengeable_recent()
                scav = [(i, c) for i, c in recent if c in ('D', 'E', 'F')]
                if scav:
                    self.phase = 'AMBUSH_SCAVENGE'
                    return
        self.phase = 'SPELL'

    def _h_scavenge(self, pidx, data):
        if self.phase != 'AMBUSH_SCAVENGE':
            return False, 'Wrong phase'

        loser_idx = 1 - self.duel_winner_idx if self.duel_winner_idx >= 0 else (1 - self.current_player if self.ambush_result == 1 else self.current_player)
        if pidx != loser_idx:
            return False, 'Not the scavenge player'

        choice = data.get('choice')
        if choice == 'skip':
            self._log('scavenge', '放弃拾荒')
            self.phase = 'SPELL'
            return True, None

        card_idx = data.get('card_idx')
        if not isinstance(card_idx, int) or card_idx < 0 or card_idx >= len(self.discard_pile):
            return False, 'Invalid index'

        card = self.discard_pile[card_idx]
        if card not in ('D', 'E', 'F'):
            return False, 'Can only scavenge D/E/F'

        turn_of_card = self.discard_turns[card_idx]
        if turn_of_card < self.turn_number - SCAVENGE_TURN_WINDOW:
            return False, 'Card too old (>10 turns)'

        loser = self.players[loser_idx]
        if loser['scavenge_remaining'] <= 0:
            return False, 'No scavenge attempts remaining'

        self.discard_pile.pop(card_idx)
        self.discard_turns.pop(card_idx)
        loser['hand'].append(card)
        loser['hand'] = sort_hand(loser['hand'])
        loser['scavenge_remaining'] -= 1
        self._log('scavenge', f'拾荒获得 {card}')

        self.phase = 'SPELL'
        return True, None

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
            return False, 'Invalid combo'

        p = self._cur()
        if _slots_left(p['scorepad'], combo_key) <= 0:
            return False, 'No slot available for this combo'

        for c in cards:
            if c not in p['hand']:
                return False, f'Card {c} not in hand'

        for c in cards:
            p['hand'].remove(c)
        self.played_this_turn.extend(cards)

        final_score = apply_modifiers(match['base_score'], self.echo_ready, p['curse_active'])
        p['scorepad'][combo_key]['scores'].append(final_score)
        if p['curse_active']:
            p['curse_active'] = False
        self.echo_ready = False

        self._log('score', f'{match["name"]} = {final_score} 分')

        if combo_key in TIER1_KEYS and not self.tier1_bonus:
            self.tier1_bonus = True
            self._log('tier1_bonus', '禁忌连击！可再计分一次')
            return True, None

        self._finish_spell()
        return True, None

    def _h_spell_instant(self, pidx, data):
        if self.phase != 'SPELL' or pidx != self.current_player:
            return False, 'Not your turn / wrong phase'
        if self.instant_count >= INSTANT_PER_TURN:
            return False, 'Instant already used this turn'

        p = self._cur()
        if '瞬' not in p['hand']:
            return False, 'No 瞬 in hand'

        discard_cards = data.get('discard_cards', [])
        if not discard_cards:
            return False, 'Must discard at least 1 card with 瞬'

        non_instant = [c for c in p['hand'] if c != '瞬']
        for c in discard_cards:
            if c not in non_instant:
                return False, f'Cannot discard {c}'
            non_instant.remove(c)

        p['hand'].remove('瞬')
        self._discard(['瞬'])
        for c in discard_cards:
            p['hand'].remove(c)
        self._discard(discard_cards)

        drawn = draw_cards(self.deck, len(discard_cards))
        p['hand'].extend(drawn)
        p['hand'] = sort_hand(p['hand'])
        p['overdraft'] = True
        self.echo_ready = True
        self.instant_count += 1

        self._log('instant', f'使用瞬！弃 {len(discard_cards)} 张，抽 {len(drawn)} 张')
        return True, None

    def _h_spell_sacrifice(self, pidx, data):
        if self.phase != 'SPELL' or pidx != self.current_player:
            return False, 'Not your turn / wrong phase'

        slot_key = data.get('slot_key')
        p = self._cur()

        if not slot_key or _slots_left(p['scorepad'], slot_key) <= 0:
            return False, 'Invalid slot for sacrifice'

        discard_cards = data.get('discard_cards', [])
        for c in discard_cards:
            if c not in p['hand']:
                return False, f'Card {c} not in hand'

        p['scorepad'][slot_key]['scores'].append(0)

        for c in discard_cards:
            p['hand'].remove(c)
        self._discard(discard_cards)

        bonus = draw_cards(self.deck, SACRIFICE_DRAW)
        p['hand'].extend(bonus)
        p['hand'] = sort_hand(p['hand'])

        self._log('sacrifice', f'黑暗献祭 [{p["scorepad"][slot_key]["name"]}]，弃 {len(discard_cards)} 张，抽 {SACRIFICE_DRAW} 张')

        self._finish_spell()
        return True, None

    def _h_spell_breaker(self, pidx, data):
        if self.phase != 'SPELL' or pidx != self.current_player:
            return False, 'Not your turn / wrong phase'

        p = self._cur()
        if p['breaker_marks'] <= 0:
            return False, 'No breaker marks'

        action_type = data.get('type')
        opp = self._opp()

        if action_type == 'seal':
            slot_key = data.get('slot_key')
            if not slot_key or _slots_left(opp['scorepad'], slot_key) <= 0:
                return False, 'Invalid slot to seal'
            if _total_sealed(opp['scorepad']) >= SEAL_LIMIT:
                return False, 'Opponent seal limit reached'
            opp['scorepad'][slot_key]['sealed'] += 1
            p['breaker_marks'] -= 1
            self._log('breaker', f'封印对手 [{opp["scorepad"][slot_key]["name"]}]')
        elif action_type == 'curse':
            opp['curse_active'] = True
            p['breaker_marks'] -= 1
            self._log('breaker', '对对手施加诅咒')
        else:
            return False, 'Invalid breaker action'

        return True, None

    def _h_spell_skip(self, pidx, data):
        if self.phase != 'SPELL' or pidx != self.current_player:
            return False, 'Not your turn / wrong phase'
        self._log('spell_skip', '跳过咏唱阶段')
        self._finish_spell()
        return True, None

    def _finish_spell(self):
        self._discard(self.played_this_turn)
        self.played_this_turn = []

        if self._check_race_win():
            return

        p = self._cur()
        overflow = hand_overflow(p['hand'])
        if overflow > 0:
            self.phase = 'END_DISCARD'
        else:
            self._finish_turn()

    def _h_end_discard(self, pidx, data):
        if self.phase != 'END_DISCARD' or pidx != self.current_player:
            return False, 'Not your turn / wrong phase'

        cards = data.get('cards', [])
        p = self._cur()
        needed = hand_overflow(p['hand'])
        if len(cards) != needed:
            return False, f'Must discard exactly {needed} cards'

        for c in cards:
            if c not in p['hand']:
                return False, f'Card {c} not in hand'

        for c in cards:
            p['hand'].remove(c)
        self._discard(cards)
        self._log('end_discard', f'弃牌 {len(cards)} 张')
        self._finish_turn()
        return True, None

    def _finish_turn(self):
        if self._check_race_win():
            return
        self._advance_to_next_turn()

    # ── Collision phase ────────────────────────────────

    def _h_col_pre_discard(self, pidx, data):
        if self.phase != 'COLLISION_PRE_DISCARD':
            return False, 'Wrong phase'
        if self.col_pre_discard_done[pidx]:
            return False, 'Already submitted'

        cards = data.get('cards', [])
        if len(cards) > 2:
            return False, 'Can discard at most 2 cards'

        p = self.players[pidx]
        for c in cards:
            if c not in p['hand']:
                return False, f'Card {c} not in hand'

        for c in cards:
            p['hand'].remove(c)
        self._discard(cards)
        self.col_pre_discard_done[pidx] = True

        self._log('col_pre_discard', f'玩家 {pidx} 弃掉 {len(cards)} 张牌进入对撞')

        if all(self.col_pre_discard_done):
            self._start_collision()
        return True, None

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
        self.phase = 'COLLISION_FLIP'
        self._log('collision_start', '暗阵已部署，对撞开始！')

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
            elif self.col_round_pair[1] is None:
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
        self.winner = final_winner(t0, t1,
                                   self.col_p0_cards, self.col_p1_cards)
        self.phase = 'GAME_OVER'
        w_name = self.players[self.winner]['name'] if self.winner >= 0 else '无人'
        self._log('game_over',
                   f'对撞结束！{self.players[0]["name"]} {t0} vs {self.players[1]["name"]} {t1} — {w_name}获胜')

    # ── View generation ────────────────────────────────

    def get_view(self, pidx):
        """Return filtered game state for one player."""
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
            'my_hand': p['hand'],
            'opp_hand_count': len(opp['hand']),
            'my_score': _total_score(p),
            'opp_score': _total_score(opp),
            'my_raw_score': p['score'],
            'opp_raw_score': opp['score'],
            'my_pad': p['scorepad'],
            'opp_pad': opp['scorepad'],
            'my_breaker': p['breaker_marks'],
            'my_scavenge_left': p['scavenge_remaining'],
            'opp_scavenge_left': opp['scavenge_remaining'],
            'my_curse': p['curse_active'],
            'deck_count': len(self.deck),
            'discard_count': len(self.discard_pile),
            'is_my_turn': self.current_player == pidx,
            'current_player': self.current_player,
            'turn_number': self.turn_number,
            'win_score': WIN_SCORE,
            'hand_limit': HAND_LIMIT,
            'log': self.turn_log[-10:],
            'winner': self.winner,
        }

        if self.phase == 'DRAW' and pidx == self.current_player:
            view['drawn_cards'] = self.drawn_cards if self.draw_done else []

        if self.phase in ('AMBUSH_ATK_SELECT', 'AMBUSH_DEF_SELECT', 'AMBUSH_SCAVENGE'):
            view['atk_card'] = self.atk_card if self.reveal_done or self.phase == 'AMBUSH_SCAVENGE' else ('?' if pidx != self.current_player else self.atk_card)
            view['def_card'] = self.def_card
            view['ambush_result'] = self.ambush_result
            view['duel_winner_idx'] = self.duel_winner_idx
            if self.duel_winner_drew:
                view['duel_winner_drew'] = self.duel_winner_drew if pidx == self.duel_winner_idx else True

        if self.phase == 'AMBUSH_SCAVENGE':
            loser_idx = 1 - self.duel_winner_idx if self.duel_winner_idx >= 0 else -1
            if pidx == loser_idx:
                recent = self._scavengeable_recent()
                view['scavenge_options'] = [(i, c) for i, c in recent if c in ('D', 'E', 'F')]

        if self.phase == 'SPELL' and pidx == self.current_player:
            view['echo_ready'] = self.echo_ready
            view['instant_count'] = self.instant_count
            view['instant_limit'] = INSTANT_PER_TURN
            view['tier1_bonus'] = self.tier1_bonus
            slots_fn = lambda key: _slots_left(p['scorepad'], key)
            view['playable_combos'] = [
                {'key': k, 'name': n, 'cards': c, 'score': s}
                for k, n, c, s in detect_playable(p['hand'], slots_fn)
            ]

        if self.phase == 'END_DISCARD' and pidx == self.current_player:
            view['overflow'] = hand_overflow(p['hand'])

        if self.phase == 'COLLISION_PRE_DISCARD':
            view['col_pre_done'] = self.col_pre_discard_done[pidx]

        if self.phase == 'COLLISION_FLIP':
            view['col_my_cards'] = self.col_p0_cards if pidx == 0 else self.col_p1_cards
            view['col_opp_card_count'] = len(self.col_p1_cards) if pidx == 0 else len(self.col_p0_cards)
            view['col_my_flipped'] = list(self.col_p0_flipped if pidx == 0 else self.col_p1_flipped)
            view['col_opp_flipped'] = list(self.col_p1_flipped if pidx == 0 else self.col_p0_flipped)
            opp_cards_list = self.col_p1_cards if pidx == 0 else self.col_p0_cards
            opp_flipped_set = self.col_p1_flipped if pidx == 0 else self.col_p0_flipped
            view['col_opp_revealed'] = {i: opp_cards_list[i] for i in opp_flipped_set}
            view['col_round'] = self.col_state['round'] if self.col_state else 0
            view['col_scores'] = list(self.col_state['score']) if self.col_state else [0, 0]
            view['col_pot'] = self.col_state['pot'] if self.col_state else 0
            view['col_round_pair'] = list(self.col_round_pair)
            view['col_waiting_for'] = self._col_waiting_for()

        if self.phase == 'GAME_OVER':
            view['final_scores'] = [_total_score(self.players[i]) for i in range(2)]
            view['col_scores'] = list(self.col_state['score']) if self.col_state else [0, 0]

        return view

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
