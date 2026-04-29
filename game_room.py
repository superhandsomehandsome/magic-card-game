"""Server-side game room — V5.0 · 黑市博弈版.

V5.0 mechanics on top of V3.0:
- BLACK MARKET: 3 face-up cards in center. Players may buy 1/turn by discarding
  hand cards whose summed base-value ≥ target value. Refills from deck top
  unless deck ≤ MARKET_DECK_GUARD.
- DARK MARKET NIGHT: every MARKET_DARK_INTERVAL turns, market shown face-down (blind buy).
- LOCKDOWN: at end of turn, player may place 1 card from hand to lockdown.
  Opponent's next-turn spell phase: any combo containing that rank is BLOCKED.
- BLOOD BREAK: opponent may pay LOCKDOWN_BREAK_COST (15) score to bypass lockdown.
  If score < cost, the deficit becomes "magic debt" deducted from next combo score.
- MARKER BREAK: opponent may consume 1 breaker mark to bypass lockdown for free.
- FIRST_PLAYER_BONUS = -5 (P0 starts -5 to compensate race-first advantage).
- P1 first turn = overdraft (only draws 1).
- A WIN bonus increased to +10. Sacrifice window extended to 5 turns.
- WIN_SCORE = 115. SCORE_MULT = 2.0 (tuned to give 50/50 race-vs-collision).
"""
import random
from game_state import (
    CARD_CONFIG, SCOREPAD_CONFIG, HAND_LIMIT, WIN_SCORE,
    SCORE_MULT, INITIAL_HAND_P0, INITIAL_HAND_P1, FIRST_PLAYER_BONUS,
    P1_FIRST_TURN_OVERDRAFT,
    INSTANT_PER_TURN, SEAL_LIMIT, DECK_LOW_THRESHOLD,
    NO_AMBUSH_BEFORE_TURN, AMBUSH_MAX_PER_TURN, AMBUSH_SECOND_COST,
    AMBUSH_STEAL_COUNT, AMBUSH_A_WIN_BONUS, AMBUSH_A_LOSE_BONUS,
    RED_PUNISH_DISCARD, BLUE_REWARD_DRAW, GREEN_REWARD_DRAW,
    SACRIFICE_MAX_X, SACRIFICE_WINDOW,
    RED_KEYS, BLUE_KEYS, GREEN_KEYS,
    BREAKER_CURSE_PENALTY,
    MARKET_SIZE, MARKET_DECK_GUARD, MARKET_DARK_INTERVAL,
    LOCKDOWN_BREAK_COST, LOCKDOWN_DEBT_ENABLE, LOCKDOWN_BAN_INSTANT,
    PROPHET_COST, PROPHET_PEEK_HAND_MIN_DECK,
    BLUFF_TRUE_PENALTY, BLUFF_FALSE_PENALTY,
    RED_BID_MIN, RED_BID_MAX, RED_BID_BONUS_MULT,
)


def _card_value(card):
    """Black market value: 瞬 = 5, others = base_value."""
    if card == '瞬':
        return 5
    return CARD_CONFIG[card]['base_value']
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
        self.col_arrange_done = [False, False]
        self.col_arrange_orders = [None, None]

        self.winner = -1
        self.turn_log = []
        self.game_log = []
        self.turn_deadline = 0

        # V5: Black market (3 face-up cards center board)
        self.market = []
        self.market_buy_done = [False, False]

        # V5: Lockdown
        # V5.1: Bluff Call (虚实之言)
        self.bluff_declared_rank = None   # rank attacker declared ('A'-'F') or None

        # V5.1: Red Zone Sealed-Bid (红区暗标拍卖)
        self.red_bid_cards = [None, None]  # cards each player bid
        self.red_bid_done = [False, False]
        self.red_bid_trigger_key = None
        self.red_bid_trigger_score = 0
        self.red_bid_trigger_cards = []
        self.red_bid_initiator = -1

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
            'lockdown_card': None,
            'lockdown_debt': 0,
            'prophet_used': False,
            'prophet_peek': None,
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
        # V5: P0 may start with negative score (race-first compensation)
        if FIRST_PLAYER_BONUS != 0:
            self.players[0]['score'] = FIRST_PLAYER_BONUS
        # V5: P1 first turn overdraft (only draws 1)
        if P1_FIRST_TURN_OVERDRAFT:
            self.players[1]['overdraft'] = True
        # V5: init market with 3 face-up cards from deck top
        self._init_market()

        self._log('game_start',
                  f'V5.0 对决开始！先手 {INITIAL_HAND_P0} 张（开局 {FIRST_PLAYER_BONUS} 分），后手 {INITIAL_HAND_P1} 张。')
        if NO_AMBUSH_BEFORE_TURN > 1:
            self._log('rule_notice',
                      f'前 {NO_AMBUSH_BEFORE_TURN - 1} 回合为【蓄力阶段】，不能发起突袭。')
        self._log('rule_notice', f'胜利分 {WIN_SCORE}。黑市初始化完成（{len(self.market)} 张商品）。')
        self.current_player = 0
        self.turn_number = 1
        self._begin_turn()

    def _init_market(self):
        self.market = []
        for _ in range(MARKET_SIZE):
            if not self.deck:
                break
            self.market.append(self.deck.pop(0))

    def _refill_market(self):
        if len(self.deck) <= MARKET_DECK_GUARD:
            return
        while len(self.market) < MARKET_SIZE and len(self.deck) > MARKET_DECK_GUARD:
            self.market.append(self.deck.pop(0))

    def _is_dark_market_turn(self):
        """Every MARKET_DARK_INTERVAL turn → market is dark (face-down blind buy)."""
        return (self.turn_number > 0
                and self.turn_number % MARKET_DARK_INTERVAL == 0)

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
        self.bluff_declared_rank = None
        self.red_bid_cards = [None, None]
        self.red_bid_done = [False, False]
        self.red_bid_trigger_key = None
        self.red_bid_trigger_score = 0
        self.red_bid_trigger_cards = []
        self.red_bid_initiator = -1
        # Clear prophet peek for current player
        for p in self.players:
            p['prophet_peek'] = None

    def _begin_turn(self):
        """Called at start of every turn. Drops opponent's expired lockdown,
        auto-draws, logs, sets phase to DRAW."""
        self._reset_turn()
        # V5: Drop opponent's lockdown card (it expires at start of locked player's next turn)
        opp_idx = 1 - self.current_player
        opp = self.players[opp_idx]
        if opp['lockdown_card'] is not None:
            expired = opp['lockdown_card']
            self._discard([expired])
            opp['lockdown_card'] = None
            self._log('lockdown_expire', f'{opp["name"]} 上回合的明牌封锁 [{expired}] 失效，进入弃牌堆')

        # V5: Reset market purchase flag for current player
        self.market_buy_done = [False, False]

        p = self._cur()
        n = 1 if p['overdraft'] else 2
        self.draw_was_overdraft = p['overdraft']
        p['overdraft'] = False
        drawn = draw_cards(self.deck, n)
        p['hand'].extend(drawn)
        p['hand'] = sort_hand(p['hand'])
        self.drawn_cards = list(drawn)
        if drawn:
            ovstr = '（透支）' if self.draw_was_overdraft else ''
            self._log('draw', f'{p["name"]} 自动汲取 {len(drawn)} 张牌{ovstr}')
        else:
            self._log('draw', f'{p["name"]} 牌库已空，无法汲取')

        deck_left = len(self.deck)
        if 0 < deck_left <= DECK_LOW_THRESHOLD:
            self._log('deck_warning', f'⚠ 牌库仅剩 {deck_left} 张！终局将至！')
        if self._is_dark_market_turn():
            self._log('dark_market', f'⚫ 第 {self.turn_number} 回合 · 暗市夜！黑市商品翻面盲买！')
        self.phase = 'DRAW'

    def _after_draw(self):
        """After DRAW_ACK or timeout, move to MARKET phase (always present)."""
        self.phase = 'MARKET'

    def _after_market(self):
        """After MARKET buy/skip, move to ambush or spell depending on cold-start."""
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
            'MARKET_BUY': self._h_market_buy,
            'MARKET_SKIP': self._h_market_skip,
            'AMBUSH_DECIDE': self._h_ambush_decide,
            'AMBUSH_PAY_COST': self._h_ambush_pay_cost,
            'AMBUSH_ATK_SELECT': self._h_ambush_atk_select,
            'AMBUSH_CANCEL': self._h_ambush_cancel,
            'AMBUSH_DEFEND': self._h_ambush_defend,
            'BLUFF_DECLARE': self._h_bluff_declare,
            'BLUFF_RESPOND': self._h_bluff_respond,
            'SPELL_SCORE': self._h_spell_score,
            'SPELL_INSTANT': self._h_spell_instant,
            'SPELL_BREAKER': self._h_spell_breaker,
            'SPELL_SACRIFICE': self._h_spell_sacrifice,
            'SPELL_SKIP': self._h_spell_skip,
            'PROPHET_WHISPER': self._h_prophet_whisper,
            'PROPHET_DECK': self._h_prophet_deck,
            'RED_BID': self._h_red_bid,
            'END_DISCARD': self._h_end_discard,
            'LOCKDOWN_PLACE': self._h_lockdown_place,
            'LOCKDOWN_SKIP': self._h_lockdown_skip,
            'COLLISION_PRE_DISCARD': self._h_col_pre_discard,
            'COLLISION_BET': self._h_col_bet,
            'COLLISION_ARRANGE': self._h_col_arrange,
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

    # ── MARKET ────────────────────────────────────────
    def _h_market_buy(self, pidx, data):
        if self.phase != 'MARKET' or pidx != self.current_player:
            return False, 'Wrong phase / not your turn'
        if self.market_buy_done[pidx]:
            return False, '本回合已购买'
        if not self.market:
            return False, '黑市无商品'

        market_idx = data.get('market_idx')
        if not isinstance(market_idx, int) or not (0 <= market_idx < len(self.market)):
            return False, '无效的商品索引'

        target_card = self.market[market_idx]
        p = self._cur()

        if self._is_dark_market_turn():
            # Dark market night: free pick, no payment required
            self.market.pop(market_idx)
            p['hand'].append(target_card)
            p['hand'] = sort_hand(p['hand'])
            self.market_buy_done[pidx] = True
            self._refill_market()
            self._log('market_buy',
                      f'{p["name"]} 暗市夜免费拿取 [{target_card}]')
            self._after_market()
            return True, None

        # Normal market: requires payment
        payment = data.get('payment', [])
        target_value = _card_value(target_card)
        if not payment:
            return False, '必须支付至少 1 张牌'

        tmp = list(p['hand'])
        for c in payment:
            if c not in tmp:
                return False, f'手牌中没有 {c}'
            tmp.remove(c)
        pay_value = sum(_card_value(c) for c in payment)
        if pay_value < target_value:
            return False, f'支付不足：需 ≥ {target_value}，实付 {pay_value}'

        for c in payment:
            p['hand'].remove(c)
        self._discard(payment)
        self.market.pop(market_idx)
        p['hand'].append(target_card)
        p['hand'] = sort_hand(p['hand'])
        self.market_buy_done[pidx] = True
        self._refill_market()
        self._log('market_buy',
                  f'{p["name"]} 黑市购入 [{target_card}]（支付 {len(payment)} 张 = {pay_value}/{target_value}）')
        self._after_market()
        return True, None

    def _h_market_skip(self, pidx, data):
        if self.phase != 'MARKET' or pidx != self.current_player:
            return False, 'Wrong phase'
        self._after_market()
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

        self.bluff_declared_rank = None
        self.phase = 'AMBUSH_BLUFF_DECLARE'
        return True, None

    def _h_bluff_declare(self, pidx, data):
        if self.phase != 'AMBUSH_BLUFF_DECLARE' or pidx != self.current_player:
            return False, 'Wrong phase'
        declared = data.get('declared_rank', 'none')
        if declared not in (set('ABCDEF') | {'none'}):
            return False, 'Invalid declaration'
        if declared == 'none':
            self._log('bluff_declare', f'{self._cur()["name"]} 未作声明，直接进入拼点')
            self.bluff_declared_rank = None
            self.phase = 'AMBUSH_DEF_CHOICE'
        else:
            self._log('bluff_declare', f'{self._cur()["name"]} 声明暗扣牌为【{declared}】')
            self.bluff_declared_rank = declared
            self.phase = 'AMBUSH_BLUFF_RESPOND'
        return True, None

    def _h_bluff_respond(self, pidx, data):
        if self.phase != 'AMBUSH_BLUFF_RESPOND' or pidx != (1 - self.current_player):
            return False, 'Wrong phase / not defender'
        choice = data.get('choice')
        if choice not in ('believe', 'call'):
            return False, 'Invalid choice'
        attacker = self._cur()
        defender = self._opp()
        if choice == 'believe':
            self._log('bluff_respond', f'{defender["name"]} 相信声明，正常迎战')
            self.phase = 'AMBUSH_DEF_CHOICE'
            return True, None
        # Call bluff
        true_card = self.atk_card
        declared = self.bluff_declared_rank
        atk_idx = self.current_player
        def_idx = 1 - atk_idx
        self._log('bluff_respond', f'{defender["name"]} 拆穿！揭示攻击牌 [{true_card}]')
        if true_card == declared:
            # Truthful declaration wrongly called — defender punished
            self._discard([true_card])
            defender['score'] -= BLUFF_TRUE_PENALTY
            drawn = self._draw_to_hand(atk_idx, 1)
            self._log('bluff_reveal',
                      f'声明属实！{defender["name"]} -{BLUFF_TRUE_PENALTY} 分，{true_card} 弃置，{attacker["name"]} 抽 {len(drawn)} 张')
            self.ambush_last_outcome = {
                'outcome': 'bluff_true', 'declared': declared,
                'atk': true_card, 'penalty_to': 'defender',
                'drew': len(drawn),
            }
        else:
            # Liar caught — attacker punished, card goes to defender
            defender['hand'].append(true_card)
            defender['hand'] = sort_hand(defender['hand'])
            attacker['score'] -= BLUFF_FALSE_PENALTY
            drawn = self._draw_to_hand(def_idx, 1)
            self._log('bluff_reveal',
                      f'虚张声势！{attacker["name"]} -{BLUFF_FALSE_PENALTY} 分，{true_card} 入{defender["name"]}手，{defender["name"]} 抽 {len(drawn)} 张')
            self.ambush_last_outcome = {
                'outcome': 'bluff_false', 'declared': declared,
                'atk': true_card, 'penalty_to': 'attacker',
                'drew': len(drawn),
            }
        self.atk_card = None
        self.bluff_declared_rank = None
        self._post_ambush_continue()
        return True, None

    def _h_ambush_cancel(self, pidx, data):
        if self.phase not in ('AMBUSH_ATK_SELECT', 'AMBUSH_PAY_COST', 'AMBUSH_BLUFF_DECLARE') or pidx != self.current_player:
            return False, 'Wrong phase'
        self.phase = 'AMBUSH_DECIDE'
        self.ambush_second_pending = False
        self.atk_card = None
        self.bluff_declared_rank = None
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
        break_choice = data.get('break_lockdown')  # None / 'marker' / 'pay'

        combos = find_combos(cards)
        match = None
        for c in combos:
            if c['key'] == combo_key:
                match = c
                break
        if not match:
            return False, '无效组合'

        p = self._cur()
        opp = self._opp()
        if self._slots_left(pidx, combo_key) <= 0:
            return False, '该组合已无可用格位'

        hand_copy = list(p['hand'])
        for c in cards:
            if c not in hand_copy:
                return False, f'手牌中没有 {c}'
            hand_copy.remove(c)

        # V5: Lockdown check - opp's lockdown_card restricts combos containing that rank
        opp_lock = opp.get('lockdown_card')
        is_locked = False
        if opp_lock and opp_lock != '瞬' and opp_lock in cards:
            is_locked = True

        broken_by = None
        if is_locked:
            if break_choice == 'marker':
                if p['breaker_marks'] <= 0:
                    return False, '没有破法者标记可用'
                p['breaker_marks'] -= 1
                broken_by = 'marker'
            elif break_choice == 'pay':
                # Pay LOCKDOWN_BREAK_COST or accumulate debt
                cur_total = _total_score(p)
                if cur_total >= LOCKDOWN_BREAK_COST:
                    p['score'] -= LOCKDOWN_BREAK_COST
                    broken_by = 'pay_full'
                elif LOCKDOWN_DEBT_ENABLE:
                    pay_now = max(0, cur_total)
                    p['score'] -= pay_now
                    debt = LOCKDOWN_BREAK_COST - pay_now
                    p['lockdown_debt'] += debt
                    broken_by = 'pay_debt'
                else:
                    return False, f'分数不足 {LOCKDOWN_BREAK_COST}'
            else:
                return False, f'该组合包含被封锁等级 [{opp_lock}]，需选择破拆方式（marker/pay）'

            # Lockdown is consumed
            self._discard([opp_lock])
            opp['lockdown_card'] = None
            if broken_by == 'marker':
                self._log('lockdown_break',
                          f'{p["name"]} 消耗破法者标记解除封锁 [{opp_lock}]')
            elif broken_by == 'pay_full':
                self._log('lockdown_break',
                          f'{p["name"]} 鲜血破拆！支付 {LOCKDOWN_BREAK_COST} 分击碎封锁 [{opp_lock}]')
            else:
                self._log('lockdown_break',
                          f'{p["name"]} 鲜血破拆！背负 {p["lockdown_debt"]} 分魔力债击碎封锁 [{opp_lock}]')

        # V5.1: Red Zone Sealed-Bid trigger — check if both players have the same red combo
        if combo_key in RED_KEYS and self.shared_red.get(combo_key, -1) == -1:
            opp_slots_fn = lambda key: self._slots_left(1 - pidx, key)
            opp_playable = detect_playable(self.players[1 - pidx]['hand'], opp_slots_fn)
            if any(p2[0] == combo_key for p2 in opp_playable):
                # Both have it — trigger auction; stash combo info and pause
                pre_score = apply_modifiers(match['base_score'], p['curse_active'])
                self.red_bid_trigger_key = combo_key
                self.red_bid_trigger_score = pre_score
                self.red_bid_trigger_cards = list(cards)
                self.red_bid_initiator = pidx
                self.red_bid_done = [False, False]
                self.red_bid_cards = [None, None]
                self._log('red_bid_trigger',
                          f'双方均拥有【{match["name"]}】！触发暗标拍卖！')
                self.phase = 'RED_BID'
                return True, None

        for c in cards:
            p['hand'].remove(c)
        self.played_this_turn.extend(cards)

        final_score = apply_modifiers(match['base_score'], p['curse_active'])
        curse_msg = ''
        if p['curse_active']:
            curse_msg = '（受诅咒 -10）'
            p['curse_active'] = False

        # V5: Pay off magic debt from this score
        debt_msg = ''
        if p['lockdown_debt'] > 0 and final_score > 0:
            pay = min(p['lockdown_debt'], final_score)
            final_score -= pay
            p['lockdown_debt'] -= pay
            debt_msg = f'（偿还魔力债 {pay}，剩余 {p["lockdown_debt"]}）'

        p['scorepad'][combo_key]['scores'].append(final_score)
        self._log('score', f'{p["name"]} 施展 {match["name"]} = {final_score} 分 {curse_msg}{debt_msg}')

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

    # ── 先知低语 (Prophet's Whisper) ────────────────────
    def _h_prophet_whisper(self, pidx, data):
        if self.phase != 'SPELL' or pidx != self.current_player:
            return False, 'Wrong phase'
        p = self.players[pidx]
        if p['prophet_used']:
            return False, '本局先知低语已用尽'
        choice = data.get('choice')
        if choice not in ('peek_hand', 'peek_deck', 'peek_market'):
            return False, 'Invalid choice'
        opp = self.players[1 - pidx]
        if choice == 'peek_hand':
            if len(self.deck) <= PROPHET_PEEK_HAND_MIN_DECK:
                return False, f'终局将至（牌库 ≤ {PROPHET_PEEK_HAND_MIN_DECK}），无法窥探对手手牌'
            p['score'] -= PROPHET_COST
            p['prophet_used'] = True
            sample = random.sample(opp['hand'], min(3, len(opp['hand'])))
            p['prophet_peek'] = list(sample)
            self._log('prophet', f'{p["name"]} 低语先知 — 窥探对手 {len(sample)} 张手牌（-{PROPHET_COST}分）')
        elif choice == 'peek_deck':
            p['score'] -= PROPHET_COST
            p['prophet_used'] = True
            p['prophet_peek'] = list(self.deck[:3])
            self._log('prophet', f'{p["name"]} 低语先知 — 窥视牌库顶 {len(p["prophet_peek"])} 张（-{PROPHET_COST}分）')
            self.phase = 'PROPHET_DECK'
            return True, None
        elif choice == 'peek_market':
            p['score'] -= PROPHET_COST
            p['prophet_used'] = True
            if self._is_dark_market_turn() and self.market:
                card = self.market[0]
                p['prophet_peek'] = [card]
                self._log('prophet', f'{p["name"]} 低语先知 — 暗市夜窥见 [{card}]（-{PROPHET_COST}分）')
            else:
                p['prophet_peek'] = []
                self._log('prophet', f'{p["name"]} 低语先知 — 市场已公开，无额外信息（-{PROPHET_COST}分）')
        return True, None

    def _h_prophet_deck(self, pidx, data):
        if self.phase != 'PROPHET_DECK' or pidx != self.current_player:
            return False, 'Wrong phase'
        discard_idx = data.get('discard_idx')
        peek = self.players[pidx]['prophet_peek'] or []
        if discard_idx is not None:
            if not isinstance(discard_idx, int) or not (0 <= discard_idx < len(peek)):
                return False, 'Invalid index'
            card = self.deck[discard_idx]
            self.deck.pop(discard_idx)
            self.deck.append(card)
            self._log('prophet_deck', f'牌库第 {discard_idx + 1} 张已移至底部')
        self.phase = 'SPELL'
        return True, None

    # ── 红区暗标拍卖 (Sealed-Bid Red Zone) ───────────────
    def _h_red_bid(self, pidx, data):
        if self.phase != 'RED_BID':
            return False, 'Wrong phase'
        if self.red_bid_done[pidx]:
            return False, '已暗标'
        cards = data.get('cards', [])
        if not (RED_BID_MIN <= len(cards) <= RED_BID_MAX):
            return False, f'需出价 {RED_BID_MIN}~{RED_BID_MAX} 张牌'
        p = self.players[pidx]
        tmp = list(p['hand'])
        for c in cards:
            if c not in tmp:
                return False, f'手牌中没有 {c}'
            tmp.remove(c)
        self.red_bid_cards[pidx] = list(cards)
        self.red_bid_done[pidx] = True
        self._log('red_bid', f'{p["name"]} 已提交暗标（{len(cards)} 张）')
        if all(self.red_bid_done):
            self._resolve_red_bid()
        return True, None

    def _resolve_red_bid(self):
        p0_val = sum(_card_value(c) for c in self.red_bid_cards[0])
        p1_val = sum(_card_value(c) for c in self.red_bid_cards[1])
        # Initiator wins ties
        if p0_val > p1_val or (p0_val == p1_val and self.red_bid_initiator == 0):
            winner, loser = 0, 1
        else:
            winner, loser = 1, 0
        key = self.red_bid_trigger_key
        score = self.red_bid_trigger_score
        winner_bid = self.red_bid_cards[winner]
        winner_bid_val = sum(_card_value(c) for c in winner_bid)
        bonus = winner_bid_val * RED_BID_BONUS_MULT
        # Remove combo cards AND bid cards from winner's hand
        for c in self.red_bid_trigger_cards:
            if c in self.players[winner]['hand']:
                self.players[winner]['hand'].remove(c)
        for c in winner_bid:
            if c in self.players[winner]['hand']:
                self.players[winner]['hand'].remove(c)
        # Award score
        self.players[winner]['scorepad'][key]['scores'].append(score)
        self.shared_red[key] = winner
        self.players[winner]['score'] += bonus
        # Loser's bid cards stay in hand (already there)
        self._log('red_bid_reveal',
                  f'暗标揭晓！{self.players[0]["name"]} 出价 {p0_val}，{self.players[1]["name"]} 出价 {p1_val}')
        self._log('red_bid_result',
                  f'{self.players[winner]["name"]} 夺得【{key}】得 {score} 分 + 奉献奖励 {bonus} 分！')
        from game_logic import sort_hand
        self.players[winner]['hand'] = sort_hand(self.players[winner]['hand'])
        if self._check_race_win():
            return
        self.phase = 'SPELL'
        self.current_player = self.red_bid_initiator

    def _finish_spell(self, force_end=False):
        self._discard(self.played_this_turn)
        self.played_this_turn = []
        if self._check_race_win():
            return
        p = self._cur()
        overflow = hand_overflow(p['hand'])
        if overflow > 0 and not force_end:
            self.phase = 'END_DISCARD'
            return
        if overflow > 0 and force_end:
            # Auto-trim on forced end (sacrifice)
            dumped = self._enforce_hand_limit(self.current_player)
            if dumped:
                self._log('end_discard', f'（强制结束）整理自动弃 {len(dumped)} 张')
        # V5: Sacrifice skips lockdown placement (cost is already paid)
        if force_end:
            self._finish_turn()
            return
        # Otherwise → LOCKDOWN_PLACE
        self._enter_lockdown_place()

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
        # V5: After end-discard, transition to LOCKDOWN_PLACE
        self._enter_lockdown_place()
        return True, None

    # ── LOCKDOWN PLACE (V5) ───────────────────────────
    def _enter_lockdown_place(self):
        """Transition to LOCKDOWN_PLACE phase if player has hand cards. Else finish turn."""
        if self._check_race_win():
            return
        p = self._cur()
        # If hand empty or has only 瞬 (which can't be locked when LOCKDOWN_BAN_INSTANT), skip
        eligible = [c for c in p['hand'] if not (LOCKDOWN_BAN_INSTANT and c == '瞬')]
        if not eligible:
            self._finish_turn()
            return
        self.phase = 'LOCKDOWN_PLACE'

    def _h_lockdown_place(self, pidx, data):
        if self.phase != 'LOCKDOWN_PLACE' or pidx != self.current_player:
            return False, 'Wrong phase'
        card = data.get('card')
        p = self._cur()
        if card not in p['hand']:
            return False, '手牌中没有该牌'
        if LOCKDOWN_BAN_INSTANT and card == '瞬':
            return False, '不能用「瞬」做封锁牌'
        # Place
        p['hand'].remove(card)
        p['lockdown_card'] = card
        self._log('lockdown_place',
                  f'{p["name"]} 明牌封锁 [{card}] — 对手下回合任何含 {card} 的组合被禁止')
        self._finish_turn()
        return True, None

    def _h_lockdown_skip(self, pidx, data):
        if self.phase != 'LOCKDOWN_PLACE' or pidx != self.current_player:
            return False, 'Wrong phase'
        self._log('lockdown_skip', f'{self._cur()["name"]} 跳过封锁')
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
        self.col_arrange_done = [False, False]
        self.col_arrange_orders = [None, None]
        p0_has = bool(self.players[0]['hand'])
        p1_has = bool(self.players[1]['hand'])
        if not p0_has and not p1_has:
            self.col_p0_cards = []
            self.col_p1_cards = []
            self.col_p0_flipped = set()
            self.col_p1_flipped = set()
            self.col_round_pair = [None, None]
            self.col_state = col_init([], [])
            self.col_state['pot'] += self.col_bonus_pot
            self.col_state['done'] = True
            self.phase = 'COLLISION_FLIP'
            self._log('collision_start', '双方均无手牌，对撞跳过')
            self._finish_collision()
            return
        self.phase = 'COLLISION_ARRANGE'
        self._log('collision_arrange', '请双方排列对撞暗阵顺序！')

    def _h_col_arrange(self, pidx, data):
        if self.phase != 'COLLISION_ARRANGE':
            return False, 'Wrong phase'
        if self.col_arrange_done[pidx]:
            return False, '已提交排列'
        order = data.get('order', [])
        hand = self.players[pidx]['hand']
        if sorted(order) != sorted(hand):
            return False, '排列必须包含所有手牌'
        self.col_arrange_orders[pidx] = list(order)
        self.col_arrange_done[pidx] = True
        self._log('col_arrange', f'{self.players[pidx]["name"]} 已排列暗阵')
        if all(self.col_arrange_done):
            self._finalize_collision_start()
        return True, None

    def _finalize_collision_start(self):
        p0_cards = self.col_arrange_orders[0] or []
        p1_cards = self.col_arrange_orders[1] or []
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
            # V5: Market & Lockdown
            'market': list(self.market),
            'market_size': MARKET_SIZE,
            'market_buy_done_me': self.market_buy_done[pidx] if 0 <= pidx < 2 else False,
            'market_dark': self._is_dark_market_turn(),
            'my_lockdown': p['lockdown_card'],
            'opp_lockdown': opp['lockdown_card'],
            'my_lockdown_debt': p['lockdown_debt'],
            'opp_lockdown_debt': opp['lockdown_debt'],
            'lockdown_break_cost': LOCKDOWN_BREAK_COST,
        }

        if self.phase == 'DRAW' and pidx == self.current_player:
            view['drawn_cards'] = self.drawn_cards
            view['draw_was_overdraft'] = self.draw_was_overdraft

        # Ambush phase info
        if self.phase in ('AMBUSH_ATK_SELECT', 'AMBUSH_DEF_CHOICE', 'AMBUSH_PAY_COST',
                          'AMBUSH_BLUFF_DECLARE', 'AMBUSH_BLUFF_RESPOND'):
            if pidx == self.current_player:
                view['atk_card'] = self.atk_card
            else:
                view['atk_card'] = '?' if self.atk_card else None

        if self.phase == 'AMBUSH_DEF_CHOICE':
            view['defender_idx'] = 1 - self.current_player
            view['can_fold'] = True
            view['my_hand_for_defend'] = p['hand'] if pidx == (1 - self.current_player) else None

        if self.phase in ('AMBUSH_BLUFF_DECLARE', 'AMBUSH_BLUFF_RESPOND'):
            view['bluff_declared_rank'] = self.bluff_declared_rank

        # Prophet's Whisper
        view['prophet_used_me'] = p.get('prophet_used', False)
        view['prophet_cost'] = PROPHET_COST
        view['prophet_peek_hand_blocked'] = len(self.deck) <= PROPHET_PEEK_HAND_MIN_DECK
        if p.get('prophet_peek') is not None and self.phase in ('SPELL', 'PROPHET_DECK'):
            view['prophet_peek'] = p['prophet_peek']
        if self.phase == 'PROPHET_DECK' and pidx == self.current_player:
            view['prophet_deck_cards'] = p.get('prophet_peek', [])

        # Red Zone Bid
        if self.phase == 'RED_BID':
            view['red_bid_done_me'] = self.red_bid_done[pidx]
            view['red_bid_trigger_key'] = self.red_bid_trigger_key
            view['red_bid_trigger_score'] = self.red_bid_trigger_score
            view['red_bid_min'] = RED_BID_MIN
            view['red_bid_max'] = RED_BID_MAX
            if all(self.red_bid_done):
                view['red_bid_reveal'] = {
                    'p0_cards': self.red_bid_cards[0],
                    'p1_cards': self.red_bid_cards[1],
                    'winner': (0 if sum(_card_value(c) for c in self.red_bid_cards[0]) >=
                               sum(_card_value(c) for c in self.red_bid_cards[1]) else 1),
                }

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

        if self.phase == 'COLLISION_ARRANGE':
            view['col_arrange_done'] = self.col_arrange_done[pidx]
            view['col_arrange_hand'] = list(p['hand'])

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
