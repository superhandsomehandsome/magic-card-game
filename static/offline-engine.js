/* 秘术对决：禁忌魔典 V5.0 — Offline Engine
 * Pure-JS port of game_state, game_logic, scoring, collision, game_room, ai_player.
 * No network, no server. Runs entirely in browser.
 */

(function(global){
'use strict';

// ════════════════════════════════════════════════════════════════
// CONSTANTS (mirrors game_state.py)
// ════════════════════════════════════════════════════════════════
const CARD_CONFIG = {
  'A': {count: 5,  base_value: 6, rank: 0},
  'B': {count: 6,  base_value: 5, rank: 1},
  'C': {count: 9,  base_value: 4, rank: 2},
  'D': {count: 13, base_value: 3, rank: 3},
  'E': {count: 15, base_value: 2, rank: 4},
  'F': {count: 18, base_value: 1, rank: 5},
  '瞬': {count: 5, base_value: 0, rank: 6},
};
const CARD_ORDER = ['A','B','C','D','E','F','瞬'];

// V5.0 balance parameters
const C = {
  WIN_SCORE: 115,
  HAND_LIMIT: 8,
  INITIAL_HAND_P0: 5,
  INITIAL_HAND_P1: 6,
  FIRST_PLAYER_BONUS: -5,
  P1_FIRST_TURN_OVERDRAFT: true,
  NO_AMBUSH_BEFORE_TURN: 3,
  SCORE_MULT: 1.0,
  AMBUSH_MAX_PER_TURN: 2,
  AMBUSH_SECOND_COST: 1,
  AMBUSH_STEAL_COUNT: 1,
  AMBUSH_A_WIN_BONUS: 10,
  AMBUSH_A_LOSE_BONUS: 3,
  ANT_COLONY_MIN_F: 3,
  RED_PUNISH_DISCARD: 1,
  BLUE_REWARD_DRAW: 1,
  GREEN_REWARD_DRAW: 1,
  SACRIFICE_MAX_X: 3,
  SACRIFICE_WINDOW: 5,
  INSTANT_PER_TURN: 1,
  SEAL_LIMIT: 3,
  BREAKER_CURSE_PENALTY: 10,
  DECK_LOW_THRESHOLD: 10,
  MARKET_SIZE: 3,
  MARKET_DECK_GUARD: 8,
  MARKET_DARK_INTERVAL: 5,
  PROPHET_COST: 5,
  PROPHET_PEEK_HAND_MIN_DECK: 4,
  BLUFF_TRUE_PENALTY: 15,
  BLUFF_FALSE_PENALTY: 15,
  BLUFF_STAKE_BONUS: 5,
  RED_BID_MIN: 1,
  RED_BID_MAX: 3,
  RED_BID_BONUS_MULT: 2,
  LOCKDOWN_BREAK_COST: 15,
  LOCKDOWN_DEBT_ENABLE: true,
  LOCKDOWN_BAN_INSTANT: true,
  SCORE_FLOOR_LOSS: -100,
  // Scoring formula
  FIVE_KIND_BASE: 40, FIVE_KIND_PER_BV: 5,
  ARCANE_SEQUENCE_BASE: 45,
  ELEMENTAL_SURGE_BASE: 30,
  CHAOS_ALCHEMY_BASE: 20,
  TRIPLE_RESONANCE_BASE: 10, TRIPLE_RESONANCE_PER_BV: 3,
  ANT_COLONY_PER_F: 5,
};

const SCOREPAD_CONFIG = [
  {key:'dragon_breath',    name:'龙之吐息 (五条)', max_slots:1, tier:1},
  {key:'arcane_sequence',  name:'奥术序列 (大顺)', max_slots:1, tier:1},
  {key:'elemental_surge',  name:'元素激流 (小顺)', max_slots:2, tier:2},
  {key:'chaos_alchemy',    name:'混沌炼金 (葫芦)', max_slots:2, tier:2},
  {key:'triple_resonance', name:'三重共鸣 (三条)', max_slots:2, tier:3},
  {key:'ant_colony',       name:'以量取胜 (蚁群)', max_slots:2, tier:3},
];
const RED_KEYS  = new Set(['dragon_breath','arcane_sequence']);
const BLUE_KEYS = new Set(['elemental_surge','chaos_alchemy']);
const GREEN_KEYS= new Set(['triple_resonance','ant_colony']);
const RANK = {}, BV = {};
for (const c of CARD_ORDER) { RANK[c] = CARD_CONFIG[c].rank; BV[c] = CARD_CONFIG[c].base_value; }

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════
function _bvMarket(c) { return c === '瞬' ? 5 : CARD_CONFIG[c].base_value; }
function _scaled(raw) { return Math.floor(raw * C.SCORE_MULT); }

function shuffle(a){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function createDeck(){ const d=[]; for (const c of CARD_ORDER) for (let i=0;i<CARD_CONFIG[c].count;i++) d.push(c); return shuffle(d); }
function sortHand(hand){ return [...hand].sort((a,b)=> RANK[a]-RANK[b]); }
function drawCards(deck, count){ const out=[]; for (let i=0;i<count && deck.length;i++) out.push(deck.pop()); return out; }
function compareDuel(atk, dfn){
  if (dfn === '瞬') return 0;
  if (atk === dfn) return 0;
  if (atk === 'F' && dfn === 'A') return 1;
  if (atk === 'A' && dfn === 'F') return -1;
  return RANK[atk] < RANK[dfn] ? 1 : -1;
}
function handOverflow(hand){ return Math.max(0, hand.length - C.HAND_LIMIT); }

function counter(arr){ const ct={}; for (const x of arr) ct[x]=(ct[x]||0)+1; return ct; }

// ════════════════════════════════════════════════════════════════
// SCORING (find_combos, detect_playable)
// ════════════════════════════════════════════════════════════════
function fiveKind(card){ return _scaled(C.FIVE_KIND_BASE + BV[card] * C.FIVE_KIND_PER_BV); }
function antScore(n){ return _scaled(n * C.ANT_COLONY_PER_F); }
function tripleScore(card){ return _scaled(C.TRIPLE_RESONANCE_BASE + BV[card] * C.TRIPLE_RESONANCE_PER_BV); }
function alchemyScore(cards){ let s=C.CHAOS_ALCHEMY_BASE; for (const c of cards) s += BV[c]; return _scaled(s); }

function findCombos(selected){
  if (!selected || !selected.length || selected.includes('瞬')) return [];
  const ct = counter(selected);
  const n = selected.length;
  const out = [];
  if (n === 5 && Object.keys(ct).length === 1){
    const card = Object.keys(ct)[0];
    out.push({key:'dragon_breath', name:'龙之吐息', cards:[...selected], base_score: fiveKind(card)});
  }
  if (n === 5){
    const keys = Object.keys(ct).sort();
    if (keys.join('') === 'ABCDE' && Object.values(ct).every(v=>v===1))
      out.push({key:'arcane_sequence', name:'奥术序列', cards:[...selected], base_score:_scaled(C.ARCANE_SEQUENCE_BASE)});
    if (keys.join('') === 'BCDEF' && Object.values(ct).every(v=>v===1))
      out.push({key:'elemental_surge', name:'元素激流', cards:[...selected], base_score:_scaled(C.ELEMENTAL_SURGE_BASE)});
    const vals = Object.values(ct).sort((a,b)=>b-a);
    if (vals.length === 2 && vals[0] === 3 && vals[1] === 2)
      out.push({key:'chaos_alchemy', name:'混沌炼金', cards:[...selected], base_score: alchemyScore(selected)});
  }
  if (n === 3 && Object.keys(ct).length === 1){
    const card = Object.keys(ct)[0];
    out.push({key:'triple_resonance', name:'三重共鸣', cards:[...selected], base_score: tripleScore(card)});
  }
  if (Object.keys(ct).length === 1 && ct['F'] && n >= C.ANT_COLONY_MIN_F){
    out.push({key:'ant_colony', name:'以量取胜', cards:[...selected], base_score: antScore(n)});
  }
  return out;
}

function detectPlayable(hand, slotsFn){
  const ct = counter(hand.filter(c => c !== '瞬'));
  const out = [];
  for (const card in ct){
    if (ct[card] >= 5 && slotsFn('dragon_breath') > 0)
      out.push(['dragon_breath', '龙之吐息', [card,card,card,card,card], fiveKind(card)]);
  }
  if ('ABCDE'.split('').every(c => ct[c]) && slotsFn('arcane_sequence') > 0)
    out.push(['arcane_sequence', '奥术序列', ['A','B','C','D','E'], _scaled(C.ARCANE_SEQUENCE_BASE)]);
  if ('BCDEF'.split('').every(c => ct[c]) && slotsFn('elemental_surge') > 0)
    out.push(['elemental_surge', '元素激流', ['B','C','D','E','F'], _scaled(C.ELEMENTAL_SURGE_BASE)]);
  if (slotsFn('chaos_alchemy') > 0){
    for (const c3 in ct){
      if (ct[c3] < 3) continue;
      for (const c2 in ct){
        if (c2 === c3 || ct[c2] < 2) continue;
        const cards = [c3,c3,c3,c2,c2];
        out.push(['chaos_alchemy', '混沌炼金', cards, alchemyScore(cards)]);
      }
    }
  }
  if (slotsFn('triple_resonance') > 0){
    for (const c in ct){
      if (ct[c] >= 3)
        out.push(['triple_resonance', '三重共鸣', [c,c,c], tripleScore(c)]);
    }
  }
  if (slotsFn('ant_colony') > 0){
    const fcnt = ct['F'] || 0;
    if (fcnt >= C.ANT_COLONY_MIN_F){
      for (let n = C.ANT_COLONY_MIN_F; n <= fcnt; n++){
        const cards = []; for (let i=0;i<n;i++) cards.push('F');
        out.push(['ant_colony', '以量取胜', cards, antScore(n)]);
      }
    }
  }
  out.sort((a,b)=> b[3] - a[3]);
  return out;
}

function applyModifiers(base, curse){
  let s = base;
  if (curse) s -= 10;
  return Math.max(0, s);
}

// ════════════════════════════════════════════════════════════════
// COLLISION LOGIC
// ════════════════════════════════════════════════════════════════
function colCompare(c1, c2){
  if (c1 === '瞬' || c2 === '瞬') return 0;
  if (c1 === c2) return 0;
  if (c1 === 'F' && c2 === 'A') return 1;
  if (c1 === 'A' && c2 === 'F') return -1;
  return RANK[c1] < RANK[c2] ? 1 : -1;
}
function colInit(p0, p1){
  return { p0:[...p0], p1:[...p1], pot:10, round:0, score:[0,0], log:[], done:false };
}
function colNext(st){
  if (st.done) return null;
  const r = st.round;
  const n0 = st.p0.length, n1 = st.p1.length;
  const mx = Math.max(n0, n1);
  if (r >= mx){ st.done = true; return null; }
  const has0 = r < n0, has1 = r < n1;
  const isLast = (r === mx - 1);
  let res;
  if (has0 && has1){
    const c0 = st.p0[r], c1 = st.p1[r];
    const cmp = colCompare(c0, c1);
    if (cmp === 0){
      if (isLast){ res = {type:'overload', c0, c1, lost: st.pot}; st.pot = 0; }
      else { st.pot += 10; res = {type:'tie', c0, c1, pot: st.pot}; }
    } else if (cmp === 1){
      const w = st.pot; st.score[0] += w; st.pot = 10;
      res = {type:'win', winner:0, c0, c1, pts:w};
    } else {
      const w = st.pot; st.score[1] += w; st.pot = 10;
      res = {type:'win', winner:1, c0, c1, pts:w};
    }
  } else if (has0){
    const w = st.pot; st.score[0] += w; st.pot = 10;
    res = {type:'crush', winner:0, card: st.p0[r], pts:w};
  } else {
    const w = st.pot; st.score[1] += w; st.pot = 10;
    res = {type:'crush', winner:1, card: st.p1[r], pts:w};
  }
  st.round++;
  st.log.push(res);
  if (st.round >= mx) st.done = true;
  return res;
}
function colFinalWinner(t0, t1, h0, h1){
  if (t0 !== t1) return t0 > t1 ? 0 : 1;
  let b0=0, b1=0;
  for (const c of h0) b0 += BV[c];
  for (const c of h1) b1 += BV[c];
  if (b0 !== b1) return b0 > b1 ? 0 : 1;
  return -1;
}

// ════════════════════════════════════════════════════════════════
// GAME ROOM (port of game_room.py)
// ════════════════════════════════════════════════════════════════
function makePlayer(name){
  return {
    name,
    hand: [],
    score: 0,
    breaker_marks: 0,
    overdraft: false,
    scorepad: makeScorepad(),
    curse_active: false,
    lockdown_card: null,
    lockdown_debt: 0,
    prophet_used: false,
    prophet_peek: null,
  };
}
function makeScorepad(){
  const pad = {};
  for (const cfg of SCOREPAD_CONFIG){
    pad[cfg.key] = { name: cfg.name, max_slots: cfg.max_slots, tier: cfg.tier, scores: [], sealed: 0 };
  }
  return pad;
}
function totalScore(p){
  let s = p.score;
  for (const k in p.scorepad) s += p.scorepad[k].scores.reduce((a,b)=>a+b, 0);
  return s;
}

class GameRoom {
  constructor(roomId, p0Name='炼金术士', p1Name='零', isAI=true){
    this.room_id = roomId;
    this.is_ai_game = isAI;
    this.phase = 'LOBBY';
    this.current_player = 0;
    this.turn_number = 1;
    this.deck = [];
    this.discard_pile = [];
    this.discard_turns = [];
    this.players = [makePlayer(p0Name), makePlayer(p1Name)];
    this.shared_red = {dragon_breath: -1, arcane_sequence: -1};
    this.market = [];
    this.market_buy_done = [false, false];
    // Draw
    this.drawn_cards = [];
    this.draw_was_overdraft = false;
    // Ambush
    this.ambush_count_this_turn = 0;
    this.ambush_second_pending = false;
    this.atk_card = null;
    this.def_card = null;
    this.ambush_result = 0;
    this.ambush_godslayer = false;
    this.ambush_fold = false;
    this.duel_winner_idx = -1;
    this.ambush_last_outcome = null;
    this.stolen_preview = null;
    // Spell
    this.instant_count = 0;
    this.played_this_turn = [];
    // Collision
    this.col_state = null;
    this.col_p0_cards = [];
    this.col_p1_cards = [];
    this.col_p0_flipped = new Set();
    this.col_p1_flipped = new Set();
    this.col_round_pair = [null, null];
    this.col_pre_discard_done = [false, false];
    this.col_bet_caller = 0;
    this.col_bet_amount = 0;
    this.col_bet_phase = 'CALLER';
    this.col_bet_response = null;
    this.col_bonus_pot = 0;
    this.col_arrange_done = [false, false];
    this.col_arrange_orders = [null, null];
    this.winner = -1;
    this.turn_log = [];
    this.game_log = [];
    // V5.1: Bluff Call
    this.bluff_declared_rank = null;
    // V5.1: Red Zone Bid
    this.red_bid_cards = [null, null];
    this.red_bid_done = [false, false];
    this.red_bid_trigger_key = null;
    this.red_bid_trigger_score = 0;
    this.red_bid_trigger_cards = [];
    this.red_bid_initiator = -1;
  }

  startGame(){
    this.deck = createDeck();
    this.discard_pile = [];
    this.discard_turns = [];
    const p0 = drawCards(this.deck, C.INITIAL_HAND_P0);
    const p1 = drawCards(this.deck, C.INITIAL_HAND_P1);
    this.players[0].hand = sortHand(p0);
    this.players[1].hand = sortHand(p1);
    if (C.FIRST_PLAYER_BONUS !== 0) this.players[0].score = C.FIRST_PLAYER_BONUS;
    if (C.P1_FIRST_TURN_OVERDRAFT) this.players[1].overdraft = true;
    this._initMarket();
    this._log('game_start', `V5.0 对决开始！先手 ${C.INITIAL_HAND_P0} 张（${C.FIRST_PLAYER_BONUS} 起始分），后手 ${C.INITIAL_HAND_P1} 张。`);
    this._log('rule_notice', `胜利分 ${C.WIN_SCORE}。前 ${C.NO_AMBUSH_BEFORE_TURN - 1} 回合禁突袭。`);
    this.current_player = 0;
    this.turn_number = 1;
    this._beginTurn();
  }

  _initMarket(){
    this.market = [];
    while (this.market.length < C.MARKET_SIZE && this.deck.length){
      this.market.push(this.deck.pop());
    }
  }
  _refillMarket(){
    if (this.deck.length <= C.MARKET_DECK_GUARD) return;
    while (this.market.length < C.MARKET_SIZE && this.deck.length > C.MARKET_DECK_GUARD)
      this.market.push(this.deck.pop());
  }
  _isDarkMarketTurn(){
    return this.turn_number > 0 && this.turn_number % C.MARKET_DARK_INTERVAL === 0;
  }

  _resetTurn(){
    this.drawn_cards = [];
    this.draw_was_overdraft = false;
    this.ambush_count_this_turn = 0;
    this.ambush_second_pending = false;
    this.atk_card = null;
    this.def_card = null;
    this.ambush_result = 0;
    this.ambush_godslayer = false;
    this.ambush_fold = false;
    this.duel_winner_idx = -1;
    this.ambush_last_outcome = null;
    this.stolen_preview = null;
    this.instant_count = 0;
    this.played_this_turn = [];
    this.turn_log = [];
    this.bluff_declared_rank = null;
    this.red_bid_cards = [null, null];
    this.red_bid_done = [false, false];
    this.red_bid_trigger_key = null;
    this.red_bid_trigger_score = 0;
    this.red_bid_trigger_cards = [];
    this.red_bid_initiator = -1;
    for (const p of this.players) p.prophet_peek = null;
  }

  _beginTurn(){
    this._resetTurn();
    const oppIdx = 1 - this.current_player;
    const opp = this.players[oppIdx];
    if (opp.lockdown_card !== null){
      const expired = opp.lockdown_card;
      this._discard([expired]);
      opp.lockdown_card = null;
      this._log('lockdown_expire', `${opp.name} 上回合的明牌封锁 [${expired}] 失效，进入弃牌堆`);
    }
    this.market_buy_done = [false, false];
    const p = this._cur();
    const n = p.overdraft ? 1 : 2;
    this.draw_was_overdraft = p.overdraft;
    p.overdraft = false;
    const drawn = drawCards(this.deck, n);
    p.hand = sortHand(p.hand.concat(drawn));
    this.drawn_cards = [...drawn];
    if (drawn.length){
      this._log('draw', `${p.name} 自动汲取 ${drawn.length} 张${this.draw_was_overdraft?'（透支）':''}`);
    } else {
      this._log('draw', `${p.name} 牌库已空，无法汲取`);
    }
    const dl = this.deck.length;
    if (dl > 0 && dl <= C.DECK_LOW_THRESHOLD)
      this._log('deck_warning', `⚠ 牌库仅剩 ${dl} 张！`);
    if (this._isDarkMarketTurn())
      this._log('dark_market', `⚫ 第 ${this.turn_number} 回合 · 暗市夜！黑市商品翻面盲买！`);
    this.phase = 'DRAW';
  }

  _afterDraw(){ this.phase = 'MARKET'; }
  _afterMarket(){
    if (this.turn_number < C.NO_AMBUSH_BEFORE_TURN){
      this._log('phase_skip', `【蓄力期】本回合无法突袭`);
      this.phase = 'SPELL';
    } else {
      this.phase = 'AMBUSH_DECIDE';
    }
  }

  _log(type, msg){
    const e = {type, msg, turn: this.turn_number};
    this.turn_log.push(e); this.game_log.push(e);
  }
  _cur(){ return this.players[this.current_player]; }
  _opp(){ return this.players[1 - this.current_player]; }
  _discard(cards){
    for (const c of cards) if (c){ this.discard_pile.push(c); this.discard_turns.push(this.turn_number); }
  }
  _redAvailable(key){ return this.shared_red[key] === -1; }
  _slotsLeft(pidx, key){
    const info = this.players[pidx].scorepad[key];
    if (RED_KEYS.has(key)) {
      if (!this._redAvailable(key)) return 0;
    }
    return info.max_slots - info.scores.length - info.sealed;
  }
  _hasOpenSlot(pidx){
    for (const cfg of SCOREPAD_CONFIG) if (this._slotsLeft(pidx, cfg.key) > 0) return true;
    return false;
  }
  _checkRaceWin(){
    for (let i=0;i<2;i++){
      if (totalScore(this.players[i]) >= C.WIN_SCORE){
        this.winner = i; this.phase = 'GAME_OVER';
        this._log('game_over', `${this.players[i].name} 达成 ${C.WIN_SCORE} 分竞速胜利！`);
        return true;
      }
    }
    for (let i=0;i<2;i++){
      if (totalScore(this.players[i]) <= C.SCORE_FLOOR_LOSS){
        this.winner = 1 - i; this.phase = 'GAME_OVER';
        this._log('game_over', `${this.players[i].name} 分数跌破 ${C.SCORE_FLOOR_LOSS}，判定落败！`);
        return true;
      }
    }
    return false;
  }
  _advanceToNextTurn(){
    if (this.deck.length === 0){
      this.phase = 'COLLISION_PRE_DISCARD';
      this.col_pre_discard_done = [false, false];
      this._log('collision', '牌库耗尽，即将进入魔力对撞！');
      return;
    }
    this.current_player = 1 - this.current_player;
    this.turn_number++;
    this._beginTurn();
  }
  _drawToHand(pidx, n){
    const drawn = drawCards(this.deck, n);
    if (drawn.length){
      this.players[pidx].hand = sortHand(this.players[pidx].hand.concat(drawn));
    }
    return drawn;
  }
  _randomSteal(thief, victim, n){
    const vp = this.players[victim], tp = this.players[thief];
    const stolen = [];
    for (let i=0;i<n;i++){
      if (!vp.hand.length) break;
      const idx = Math.floor(Math.random() * vp.hand.length);
      const c = vp.hand[idx];
      vp.hand.splice(idx, 1);
      tp.hand.push(c);
      stolen.push(c);
    }
    tp.hand = sortHand(tp.hand);
    return stolen;
  }
  _randomDiscardFromHand(pidx, n){
    const p = this.players[pidx];
    const dumped = [];
    for (let i=0;i<n;i++){
      if (!p.hand.length) break;
      const idx = Math.floor(Math.random() * p.hand.length);
      const c = p.hand[idx];
      p.hand.splice(idx, 1);
      dumped.push(c);
    }
    this._discard(dumped);
    return dumped;
  }
  _enforceHandLimit(pidx){
    const p = this.players[pidx];
    const over = p.hand.length - C.HAND_LIMIT;
    if (over <= 0) return [];
    // Discard lowest base-value cards first
    const sorted = [...p.hand].sort((a,b)=> RANK[b] - RANK[a]);
    const dumped = sorted.slice(0, over);
    for (const c of dumped) {
      const i = p.hand.indexOf(c);
      if (i >= 0) p.hand.splice(i, 1);
    }
    this._discard(dumped);
    return dumped;
  }

  // ── ACTION DISPATCH ──────────────────────────────────────
  handleAction(pidx, action, data){
    data = data || {};
    const handlers = {
      'DRAW_ACK': this._h_draw_ack,
      'MARKET_BUY': this._h_market_buy,
      'MARKET_SKIP': this._h_market_skip,
      'AMBUSH_DECIDE': this._h_ambush_decide,
      'AMBUSH_PAY_COST': this._h_ambush_pay_cost,
      'AMBUSH_ATK_SELECT': this._h_ambush_atk_select,
      'AMBUSH_CANCEL': this._h_ambush_cancel,
      'AMBUSH_DEFEND': this._h_ambush_defend,
      'BLUFF_DECLARE': this._h_bluff_declare,
      'SPELL_SCORE': this._h_spell_score,
      'SPELL_INSTANT': this._h_spell_instant,
      'SPELL_BREAKER': this._h_spell_breaker,
      'SPELL_SACRIFICE': this._h_spell_sacrifice,
      'SPELL_SKIP': this._h_spell_skip,
      'PROPHET_WHISPER': this._h_prophet_whisper,
      'PROPHET_DECK': this._h_prophet_deck,
      'RED_BID': this._h_red_bid,
      'END_DISCARD': this._h_end_discard,
      'LOCKDOWN_PLACE': this._h_lockdown_place,
      'LOCKDOWN_SKIP': this._h_lockdown_skip,
      'COLLISION_PRE_DISCARD': this._h_col_pre_discard,
      'COLLISION_BET': this._h_col_bet,
      'COLLISION_ARRANGE': this._h_col_arrange,
      'COLLISION_FLIP': this._h_col_flip,
    };
    const h = handlers[action];
    if (!h) return [false, `Unknown action: ${action}`];
    return h.call(this, pidx, data);
  }

  _h_draw_ack(pidx, data){
    if (this.phase !== 'DRAW' || pidx !== this.current_player) return [false, 'Wrong phase'];
    this._afterDraw();
    return [true, null];
  }

  _h_market_buy(pidx, data){
    if (this.phase !== 'MARKET' || pidx !== this.current_player) return [false, 'Wrong phase'];
    if (this.market_buy_done[pidx]) return [false, '本回合已购买'];
    if (!this.market.length) return [false, '黑市无商品'];
    const idx = data.market_idx;
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.market.length) return [false, '无效索引'];
    const target = this.market[idx];
    const p = this._cur();

    if (this._isDarkMarketTurn()) {
      this.market.splice(idx, 1);
      p.hand.push(target);
      p.hand = sortHand(p.hand);
      this.market_buy_done[pidx] = true;
      this._refillMarket();
      this._log('market_buy', `${p.name} 暗市夜免费拿取 [${target}]`);
      this._afterMarket();
      return [true, null];
    }

    const payment = data.payment || [];
    if (!payment.length) return [false, '需支付至少 1 张'];
    const targetV = _bvMarket(target);
    const tmp = [...p.hand];
    for (const c of payment){
      const i = tmp.indexOf(c);
      if (i < 0) return [false, `手牌中没有 ${c}`];
      tmp.splice(i, 1);
    }
    let payV = 0;
    for (const c of payment) payV += _bvMarket(c);
    if (payV < targetV) return [false, `支付不足：需 ≥ ${targetV}，实付 ${payV}`];
    for (const c of payment){
      const i = p.hand.indexOf(c);
      if (i >= 0) p.hand.splice(i, 1);
    }
    this._discard(payment);
    this.market.splice(idx, 1);
    p.hand.push(target);
    p.hand = sortHand(p.hand);
    this.market_buy_done[pidx] = true;
    this._refillMarket();
    this._log('market_buy', `${p.name} 黑市购入 [${target}]（支付 ${payment.length} 张 = ${payV}/${targetV}）`);
    this._afterMarket();
    return [true, null];
  }

  _h_market_skip(pidx, data){
    if (this.phase !== 'MARKET' || pidx !== this.current_player) return [false, 'Wrong phase'];
    this._afterMarket();
    return [true, null];
  }

  _h_ambush_decide(pidx, data){
    if (this.phase !== 'AMBUSH_DECIDE' || pidx !== this.current_player) return [false, 'Wrong phase'];
    const choice = data.choice;
    if (choice === 'skip'){
      this.phase = 'SPELL';
      this._log('ambush', `${this._cur().name} 跳过突袭`);
      return [true, null];
    }
    if (choice === 'attack'){
      const p = this._cur();
      const eligible = p.hand.filter(c => c !== '瞬');
      if (!eligible.length) return [false, '没有可出的非瞬手牌'];
      if (this.ambush_count_this_turn >= C.AMBUSH_MAX_PER_TURN) return [false, '本回合突袭次数已达上限'];
      if (this.ambush_count_this_turn >= 1){
        if (p.hand.length <= C.AMBUSH_SECOND_COST) return [false, `手牌不足，第 2 次突袭需弃 ${C.AMBUSH_SECOND_COST} 张`];
        this.ambush_second_pending = true;
        this.phase = 'AMBUSH_PAY_COST';
        return [true, null];
      }
      this.phase = 'AMBUSH_ATK_SELECT';
      return [true, null];
    }
    return [false, '无效选择'];
  }

  _h_ambush_pay_cost(pidx, data){
    if (this.phase !== 'AMBUSH_PAY_COST' || pidx !== this.current_player) return [false, 'Wrong phase'];
    const cards = data.cards || [];
    if (cards.length !== C.AMBUSH_SECOND_COST) return [false, `需弃 ${C.AMBUSH_SECOND_COST} 张`];
    const p = this._cur();
    const tmp = [...p.hand];
    for (const c of cards){ const i=tmp.indexOf(c); if (i<0) return [false, `手牌中没有 ${c}`]; tmp.splice(i,1); }
    for (const c of cards){ const i=p.hand.indexOf(c); if (i>=0) p.hand.splice(i,1); }
    this._discard(cards);
    this._log('ambush_cost', `${p.name} 为第 2 次突袭明弃 ${cards.length} 张`);
    this.ambush_second_pending = false;
    this.phase = 'AMBUSH_ATK_SELECT';
    return [true, null];
  }

  _h_ambush_atk_select(pidx, data){
    if (this.phase !== 'AMBUSH_ATK_SELECT' || pidx !== this.current_player) return [false, 'Wrong phase'];
    const card = data.card;
    const p = this._cur();
    if (!p.hand.includes(card) || card === '瞬') return [false, 'Invalid attack card'];
    p.hand.splice(p.hand.indexOf(card), 1);
    this.atk_card = card;
    this.ambush_count_this_turn++;
    this.ambush_fold = false;
    this.def_card = null;
    this.ambush_result = 0;
    this.duel_winner_idx = -1;
    this.ambush_godslayer = false;
    this._log('ambush_atk', `${p.name} 暗扣了一张牌`);
    const opp = this._opp();
    if (!opp.hand.length){
      this._discard([this.atk_card]);
      const drawn = this._drawToHand(this.current_player, 2);
      this.duel_winner_idx = this.current_player;
      this.ambush_result = 1;
      this.ambush_last_outcome = {outcome:'auto_win', atk:this.atk_card, def:null, drew:drawn.length, stole:0};
      this._log('ambush_reveal', `防守方无牌，攻击方 ${this.atk_card} 自动胜利 — 抽 ${drawn.length} 张`);
      this._postAmbushContinue();
      return [true, null];
    }
    this.bluff_declared_rank = null;
    this.phase = 'AMBUSH_BLUFF_DECLARE';
    return [true, null];
  }

  _h_bluff_declare(pidx, data){
    if (this.phase !== 'AMBUSH_BLUFF_DECLARE' || pidx !== this.current_player) return [false, 'Wrong phase'];
    const declared = data.declared_rank || 'none';
    if (!([...'ABCDEF', 'none'].includes(declared))) return [false, 'Invalid declaration'];
    if (declared === 'none'){
      this._log('bluff_declare', `${this._cur().name} 未作声明，直接进入拼点`);
      this.bluff_declared_rank = null;
    } else {
      this._log('bluff_declare', `${this._cur().name} 声明暗扣牌为【${declared}】（加注！拼点赢家 +${C.BLUFF_STAKE_BONUS}）`);
      this.bluff_declared_rank = declared;
    }
    this.phase = 'AMBUSH_DEF_CHOICE';
    return [true, null];
  }

  _h_ambush_cancel(pidx, data){
    if (!['AMBUSH_ATK_SELECT','AMBUSH_PAY_COST','AMBUSH_BLUFF_DECLARE'].includes(this.phase) || pidx !== this.current_player)
      return [false, 'Wrong phase'];
    this.phase = 'AMBUSH_DECIDE';
    this.ambush_second_pending = false;
    this.atk_card = null;
    this.bluff_declared_rank = null;
    return [true, null];
  }

  _h_ambush_defend(pidx, data){
    if (this.phase !== 'AMBUSH_DEF_CHOICE' || pidx !== (1 - this.current_player))
      return [false, 'Not defender / wrong phase'];
    const choice = data.choice;
    const opp = this._opp();
    const atk_idx = this.current_player;
    const def_idx = 1 - atk_idx;
    // ── Call bluff (拆穿) ──
    if (choice === 'call'){
      if (!this.bluff_declared_rank) return [false, '未声明时不可拆穿'];
      const attacker = this._cur();
      const defender = opp;
      const trueCard = this.atk_card;
      const declared = this.bluff_declared_rank;
      this._log('bluff_respond', `${defender.name} 拆穿！揭示攻击牌 [${trueCard}]`);
      if (trueCard === declared){
        this._discard([trueCard]);
        defender.score -= C.BLUFF_TRUE_PENALTY;
        const drawn = this._drawToHand(atk_idx, 1);
        this._log('bluff_reveal', `声明属实！${defender.name} -${C.BLUFF_TRUE_PENALTY} 分，${trueCard} 弃置，${attacker.name} 抽 ${drawn.length} 张`);
        this.ambush_last_outcome = {outcome:'bluff_true', declared, atk:trueCard, penalty_to:'defender', drew:drawn.length};
      } else {
        defender.hand.push(trueCard);
        defender.hand = sortHand(defender.hand);
        attacker.score -= C.BLUFF_FALSE_PENALTY;
        const drawn = this._drawToHand(def_idx, 1);
        this._log('bluff_reveal', `虚张声势！${attacker.name} -${C.BLUFF_FALSE_PENALTY} 分，${trueCard} 入${defender.name}手，${defender.name} 抽 ${drawn.length} 张`);
        this.ambush_last_outcome = {outcome:'bluff_false', declared, atk:trueCard, penalty_to:'attacker', drew:drawn.length};
      }
      this.atk_card = null;
      this.bluff_declared_rank = null;
      this._postAmbushContinue();
      return [true, null];
    }
    if (choice === 'fold'){
      const stolen = this._randomSteal(atk_idx, def_idx, C.AMBUSH_STEAL_COUNT);
      this._discard([this.atk_card]);
      this.ambush_fold = true;
      this.def_card = null;
      this.ambush_result = 1;
      this.duel_winner_idx = atk_idx;
      this.stolen_preview = {to: atk_idx, count: stolen.length};
      this.ambush_last_outcome = {outcome:'fold', atk:this.atk_card, def:null, stole:stolen.length};
      this._log('ambush_reveal', `${opp.name} 选择怯战！${this._cur().name} 窃取了 ${stolen.length} 张`);
      this._postAmbushContinue();
      return [true, null];
    }
    if (choice !== 'defend') return [false, '无效选择'];
    const card = data.card;
    if (!opp.hand.includes(card)) return [false, 'Card not in defender hand'];
    if (card === '瞬'){
      const i = opp.hand.indexOf('瞬'); opp.hand.splice(i, 1);
      this._discard(['瞬']);
      opp.hand.push(this.atk_card);
      opp.hand = sortHand(opp.hand);
      const dumped = this._enforceHandLimit(def_idx);
      const extra = dumped.length ? `（溢出弃 ${dumped.length} 张）` : '';
      this.def_card = '瞬';
      this.ambush_result = 0;
      this.duel_winner_idx = -1;
      this.ambush_last_outcome = {outcome:'shun_absorb', atk:this.atk_card, def:'瞬', absorbed:this.atk_card};
      this._log('ambush_reveal', `${opp.name} 打出「瞬」吸收了 ${this.atk_card}！强制平局 ${extra}`);
      this.atk_card = null;
      this._postAmbushContinue();
      return [true, null];
    }
    opp.hand.splice(opp.hand.indexOf(card), 1);
    this.def_card = card;
    const result = compareDuel(this.atk_card, card);
    this.ambush_result = result;
    this.ambush_godslayer = (card === 'F' && this.atk_card === 'A') ||
                           (this.atk_card === 'F' && card === 'A');
    let stole = 0, drew = 0;
    let bonusMsg = '';
    const stakeBonus = this.bluff_declared_rank ? C.BLUFF_STAKE_BONUS : 0;
    if (result === 1){
      this.duel_winner_idx = atk_idx;
      const drewC = this._drawToHand(atk_idx, 1); drew = drewC.length;
      const stolen = this._randomSteal(atk_idx, def_idx, C.AMBUSH_STEAL_COUNT); stole = stolen.length;
      if (stakeBonus){ this._cur().score += stakeBonus; bonusMsg += ` 加注+${stakeBonus}`; }
      if (this.atk_card === 'A' && card !== 'F'){
        this._cur().score += C.AMBUSH_A_WIN_BONUS; bonusMsg += ` 圣物威压+${C.AMBUSH_A_WIN_BONUS}`;
      }
      if (card === 'A' && this.atk_card !== 'F'){
        opp.score += C.AMBUSH_A_LOSE_BONUS; bonusMsg += ` 圣物陨落+${C.AMBUSH_A_LOSE_BONUS}`;
      }
      if (this.atk_card === 'F' && card === 'A'){
        this._cur().breaker_marks++; bonusMsg += ' 弑神·破法者+1';
      }
      this._discard([this.atk_card, card]);
      this._log('ambush_reveal', `${this.atk_card} vs ${card} — 攻击方胜！抽${drew}偷${stole}${bonusMsg}`);
    } else if (result === -1){
      this.duel_winner_idx = def_idx;
      const drewC = this._drawToHand(def_idx, 1); drew = drewC.length;
      const stolen = this._randomSteal(def_idx, atk_idx, C.AMBUSH_STEAL_COUNT); stole = stolen.length;
      if (stakeBonus){ opp.score += stakeBonus; bonusMsg += ` 加注+${stakeBonus}`; }
      if (card === 'A' && this.atk_card !== 'F'){
        opp.score += C.AMBUSH_A_WIN_BONUS; bonusMsg += ` 圣物威压+${C.AMBUSH_A_WIN_BONUS}`;
      }
      if (this.atk_card === 'A' && card !== 'F'){
        this._cur().score += C.AMBUSH_A_LOSE_BONUS; bonusMsg += ` 圣物陨落+${C.AMBUSH_A_LOSE_BONUS}`;
      }
      if (card === 'F' && this.atk_card === 'A'){
        opp.breaker_marks++; bonusMsg += ' 弑神·破法者+1';
      }
      this._discard([this.atk_card, card]);
      this._log('ambush_reveal', `${this.atk_card} vs ${card} — 防守方胜！抽${drew}偷${stole}${bonusMsg}`);
    } else {
      this._discard([this.atk_card, card]);
      this._log('ambush_reveal', `${this.atk_card} vs ${card} — 平局！`);
    }
    this.ambush_last_outcome = {
      outcome: result === 1 ? 'win' : (result === -1 ? 'lose' : 'tie'),
      atk: this.atk_card, def: card, stole, drew, stake_bonus: stakeBonus,
    };
    this._postAmbushContinue();
    return [true, null];
  }

  _postAmbushContinue(){
    if (this._checkRaceWin()) return;
    const p = this._cur();
    const eligible = p.hand.filter(c => c !== '瞬');
    const canContinue = (this.ambush_count_this_turn < C.AMBUSH_MAX_PER_TURN
                        && this._opp().hand.length > 0
                        && eligible.length > 0
                        && p.hand.length > C.AMBUSH_SECOND_COST);
    if (canContinue){
      this.phase = 'AMBUSH_DECIDE';
      this.atk_card = null; this.def_card = null;
    } else {
      this.phase = 'SPELL';
      this.atk_card = null; this.def_card = null;
    }
  }

  _h_spell_score(pidx, data){
    if (this.phase !== 'SPELL' || pidx !== this.current_player) return [false, 'Wrong phase'];
    const cards = data.cards || [];
    const combo_key = data.combo_key;
    const breakChoice = data.break_lockdown;
    const combos = findCombos(cards);
    let match = combos.find(c => c.key === combo_key);
    if (!match) return [false, '无效组合'];
    const p = this._cur();
    const opp = this._opp();
    if (this._slotsLeft(pidx, combo_key) <= 0) return [false, '该组合已无可用格位'];
    const tmp = [...p.hand];
    for (const c of cards){ const i = tmp.indexOf(c); if (i<0) return [false, `手牌中没有 ${c}`]; tmp.splice(i,1); }
    // Lockdown check
    const oppLock = opp.lockdown_card;
    let isLocked = false;
    if (oppLock && oppLock !== '瞬' && cards.includes(oppLock)) isLocked = true;
    let brokenBy = null;
    if (isLocked){
      if (breakChoice === 'marker'){
        if (p.breaker_marks <= 0) return [false, '没有破法者标记'];
        p.breaker_marks--;
        brokenBy = 'marker';
      } else if (breakChoice === 'pay'){
        const curTotal = totalScore(p);
        if (curTotal >= C.LOCKDOWN_BREAK_COST){
          p.score -= C.LOCKDOWN_BREAK_COST;
          brokenBy = 'pay_full';
        } else if (C.LOCKDOWN_DEBT_ENABLE){
          const payNow = Math.max(0, curTotal);
          p.score -= payNow;
          p.lockdown_debt += C.LOCKDOWN_BREAK_COST - payNow;
          brokenBy = 'pay_debt';
        } else return [false, `分数不足 ${C.LOCKDOWN_BREAK_COST}`];
      } else {
        return [false, `该组合包含被封锁等级 [${oppLock}]`];
      }
      this._discard([oppLock]);
      opp.lockdown_card = null;
      if (brokenBy === 'marker') this._log('lockdown_break', `${p.name} 消耗破法者标记解除封锁 [${oppLock}]`);
      else if (brokenBy === 'pay_full') this._log('lockdown_break', `${p.name} 鲜血破拆！支付 ${C.LOCKDOWN_BREAK_COST} 分击碎封锁 [${oppLock}]`);
      else this._log('lockdown_break', `${p.name} 鲜血破拆！背负 ${p.lockdown_debt} 分魔力债击碎封锁 [${oppLock}]`);
    }
    // V5.1: Red Zone Sealed-Bid trigger
    if (RED_KEYS.has(combo_key) && this.shared_red[combo_key] === -1){
      const oppSlots = k => this._slotsLeft(1 - pidx, k);
      const oppPlayable = detectPlayable(opp.hand, oppSlots);
      if (oppPlayable.some(x => x[0] === combo_key)){
        const preScore = applyModifiers(match.base_score, p.curse_active);
        this.red_bid_trigger_key = combo_key;
        this.red_bid_trigger_score = preScore;
        this.red_bid_trigger_cards = [...cards];
        this.red_bid_initiator = pidx;
        this.red_bid_done = [false, false];
        this.red_bid_cards = [null, null];
        this._log('red_bid_trigger', `双方均拥有【${match.name}】！触发暗标拍卖！`);
        this.phase = 'RED_BID';
        return [true, null];
      }
    }

    for (const c of cards){ const i = p.hand.indexOf(c); if (i>=0) p.hand.splice(i,1); }
    this.played_this_turn.push(...cards);
    let finalScore = applyModifiers(match.base_score, p.curse_active);
    let curseMsg = '';
    if (p.curse_active){ curseMsg = '（受诅咒 -10）'; p.curse_active = false; }
    let debtMsg = '';
    if (p.lockdown_debt > 0 && finalScore > 0){
      const pay = Math.min(p.lockdown_debt, finalScore);
      finalScore -= pay; p.lockdown_debt -= pay;
      debtMsg = `（偿还魔力债 ${pay}，剩余 ${p.lockdown_debt}）`;
    }
    p.scorepad[combo_key].scores.push(finalScore);
    this._log('score', `${p.name} 施展 ${match.name} = ${finalScore} 分 ${curseMsg}${debtMsg}`);
    if (RED_KEYS.has(combo_key)){
      this.shared_red[combo_key] = pidx;
      const dumped = this._randomDiscardFromHand(1 - pidx, C.RED_PUNISH_DISCARD);
      this._log('red_punish', `【禁忌连击】${this._opp().name} 随机弃 ${dumped.length} 张手牌`);
    } else if (BLUE_KEYS.has(combo_key) && C.BLUE_REWARD_DRAW > 0){
      const drawn = this._drawToHand(pidx, C.BLUE_REWARD_DRAW);
      if (drawn.length) this._log('blue_reward', `【元素回流】抽取 ${drawn.length} 张奖励牌`);
    } else if (GREEN_KEYS.has(combo_key) && C.GREEN_REWARD_DRAW > 0){
      const drawn = this._drawToHand(pidx, C.GREEN_REWARD_DRAW);
      if (drawn.length) this._log('green_reward', `【共鸣余响】抽取 ${drawn.length} 张奖励牌`);
    }
    this._checkRaceWin();
    return [true, null];
  }

  _h_spell_instant(pidx, data){
    if (this.phase !== 'SPELL' || pidx !== this.current_player) return [false, 'Wrong phase'];
    if (this.instant_count >= C.INSTANT_PER_TURN) return [false, '本回合已使用瞬'];
    const p = this._cur();
    if (!p.hand.includes('瞬')) return [false, '手牌中没有瞬'];
    const dc = data.discard_cards || [];
    if (!dc.length) return [false, '必须弃至少 1 张牌'];
    const nonShun = p.hand.filter(c => c !== '瞬');
    const tmp = [...nonShun];
    for (const c of dc){ const i = tmp.indexOf(c); if (i<0) return [false, `不能弃 ${c}`]; tmp.splice(i,1); }
    p.hand.splice(p.hand.indexOf('瞬'), 1);
    this._discard(['瞬']);
    for (const c of dc){ const i = p.hand.indexOf(c); if (i>=0) p.hand.splice(i,1); }
    this._discard(dc);
    const drawn = this._drawToHand(pidx, dc.length);
    p.overdraft = true;
    this.instant_count++;
    this._log('instant', `${p.name} 使用瞬换牌：弃 ${dc.length} / 抽 ${drawn.length}（下回合透支）`);
    return [true, null];
  }

  _h_spell_breaker(pidx, data){
    if (this.phase !== 'SPELL' || pidx !== this.current_player) return [false, 'Wrong phase'];
    const p = this._cur();
    if (p.breaker_marks <= 0) return [false, '没有破法者标记'];
    const at = data.type;
    const opp = this._opp();
    if (at === 'seal'){
      const sk = data.slot_key;
      if (!sk) return [false, 'No slot'];
      const oppIdx = 1 - pidx;
      if (this._slotsLeft(oppIdx, sk) <= 0) return [false, '该格位不可封印'];
      let totalSealed = 0;
      for (const k in opp.scorepad) totalSealed += opp.scorepad[k].sealed;
      if (totalSealed >= C.SEAL_LIMIT) return [false, '对手封印已满'];
      opp.scorepad[sk].sealed++;
      p.breaker_marks--;
      this._log('breaker_seal', `${p.name} 封印了对手的 [${opp.scorepad[sk].name}]`);
      return [true, null];
    }
    if (at === 'curse'){
      if (opp.curse_active) return [false, '对手已被诅咒'];
      opp.curse_active = true;
      p.breaker_marks--;
      this._log('breaker_curse', `${p.name} 对 ${opp.name} 施加诅咒`);
      return [true, null];
    }
    return [false, '无效类型'];
  }

  _h_spell_sacrifice(pidx, data){
    if (this.phase !== 'SPELL' || pidx !== this.current_player) return [false, 'Wrong phase'];
    const p = this._cur();
    const sk = data.slot_key, si = data.score_idx;
    const dc = data.discard_cards || [];
    const ri = data.recover_indices || [];
    if (!sk || !p.scorepad[sk]) return [false, '无效格位'];
    const info = p.scorepad[sk];
    if (!Number.isInteger(si) || si < 0 || si >= info.scores.length) return [false, '无效得分索引'];
    const x = dc.length;
    if (x !== ri.length) return [false, '弃牌与回收数量不一致'];
    if (x < 1 || x > C.SACRIFICE_MAX_X) return [false, `必须交换 1~${C.SACRIFICE_MAX_X} 张牌`];
    const tmp = [...p.hand];
    for (const c of dc){ const i = tmp.indexOf(c); if (i<0) return [false, `手牌中没有 ${c}`]; tmp.splice(i,1); }
    const window = this._sacrificeWindow();
    const wset = new Set(window.map(([i,c]) => i));
    for (const r of ri){ if (!Number.isInteger(r) || !wset.has(r)) return [false, '选中的弃牌不在窗口内']; }
    if (new Set(ri).size !== ri.length) return [false, '回收索引重复'];
    const lostScore = info.scores.splice(si, 1)[0];
    info.sealed++;
    this._log('sacrifice_slot', `${p.name} 献祭 [${info.name}] — 扣 ${lostScore} 分并永久封印`);
    for (const c of dc){ const i = p.hand.indexOf(c); if (i>=0) p.hand.splice(i,1); }
    this._discard(dc);
    const recovered = [];
    const sortedRi = [...ri].sort((a,b)=> b-a);
    for (const r of sortedRi){
      const card = this.discard_pile.splice(r, 1)[0];
      this.discard_turns.splice(r, 1);
      recovered.push(card);
    }
    p.hand = sortHand(p.hand.concat(recovered));
    this._log('sacrifice_swap', `${p.name} 黑暗交换：弃 ${x} / 取回 ${x}`);
    if (this._checkRaceWin()) return [true, null];
    this._finishSpell(true);
    return [true, null];
  }

  _h_spell_skip(pidx, data){
    if (this.phase !== 'SPELL' || pidx !== this.current_player) return [false, 'Wrong phase'];
    this._log('spell_skip', `${this._cur().name} 跳过咏唱阶段`);
    this._finishSpell(false);
    return [true, null];
  }

  // ── 先知低语 (Prophet's Whisper) ─────────────────────
  _h_prophet_whisper(pidx, data){
    if (this.phase !== 'SPELL' || pidx !== this.current_player) return [false, 'Wrong phase'];
    const p = this.players[pidx];
    if (p.prophet_used) return [false, '本局先知低语已用尽'];
    const choice = data.choice;
    if (!['peek_hand','peek_deck','peek_market'].includes(choice)) return [false, 'Invalid choice'];
    const opp = this.players[1 - pidx];
    if (choice === 'peek_hand'){
      if (this.deck.length <= C.PROPHET_PEEK_HAND_MIN_DECK)
        return [false, `终局将至（牌库 ≤ ${C.PROPHET_PEEK_HAND_MIN_DECK}），无法窥探对手手牌`];
      p.score -= C.PROPHET_COST;
      p.prophet_used = true;
      const sample = [];
      const tmp = [...opp.hand];
      for (let i=0; i<Math.min(3,tmp.length); i++){
        const idx = Math.floor(Math.random()*tmp.length);
        sample.push(tmp.splice(idx,1)[0]);
      }
      p.prophet_peek = sample;
      this._log('prophet', `${p.name} 低语先知 — 窥探对手 ${sample.length} 张手牌（-${C.PROPHET_COST}分）`);
    } else if (choice === 'peek_deck'){
      p.score -= C.PROPHET_COST;
      p.prophet_used = true;
      p.prophet_peek = this.deck.slice(-3);
      this._log('prophet', `${p.name} 低语先知 — 窥视牌库顶 ${p.prophet_peek.length} 张（-${C.PROPHET_COST}分）`);
      this.phase = 'PROPHET_DECK';
      return [true, null];
    } else {
      p.score -= C.PROPHET_COST;
      p.prophet_used = true;
      if (this._isDarkMarketTurn() && this.market.length){
        p.prophet_peek = [this.market[this.market.length-1]];
        this._log('prophet', `${p.name} 低语先知 — 暗市夜窥见 [${p.prophet_peek[0]}]（-${C.PROPHET_COST}分）`);
      } else {
        p.prophet_peek = [];
        this._log('prophet', `${p.name} 低语先知 — 市场已公开（-${C.PROPHET_COST}分）`);
      }
    }
    return [true, null];
  }

  _h_prophet_deck(pidx, data){
    if (this.phase !== 'PROPHET_DECK' || pidx !== this.current_player) return [false, 'Wrong phase'];
    const discardIdx = data.discard_idx;
    const peek = this.players[pidx].prophet_peek || [];
    if (discardIdx != null){
      const deckLen = this.deck.length;
      const deckIdx = deckLen - 1 - discardIdx;  // deck stored reversed; top = last element
      if (deckIdx < 0 || deckIdx >= deckLen) return [false, 'Invalid index'];
      const card = this.deck.splice(deckIdx, 1)[0];
      this.deck.unshift(card);  // move to bottom
      this._log('prophet_deck', `牌库第 ${discardIdx+1} 张已移至底部`);
    }
    this.phase = 'SPELL';
    return [true, null];
  }

  // ── 红区暗标拍卖 (Sealed-Bid Red Zone) ───────────────
  _h_red_bid(pidx, data){
    if (this.phase !== 'RED_BID') return [false, 'Wrong phase'];
    if (this.red_bid_done[pidx]) return [false, '已暗标'];
    const cards = data.cards || [];
    if (cards.length < C.RED_BID_MIN || cards.length > C.RED_BID_MAX)
      return [false, `需出价 ${C.RED_BID_MIN}~${C.RED_BID_MAX} 张牌`];
    const p = this.players[pidx];
    const tmp = [...p.hand];
    for (const c of cards){
      const i = tmp.indexOf(c);
      if (i < 0) return [false, `手牌中没有 ${c}`];
      tmp.splice(i, 1);
    }
    this.red_bid_cards[pidx] = [...cards];
    this.red_bid_done[pidx] = true;
    this._log('red_bid', `${p.name} 已提交暗标（${cards.length} 张）`);
    if (this.red_bid_done[0] && this.red_bid_done[1]) this._resolveRedBid();
    return [true, null];
  }

  _resolveRedBid(){
    const cardVal = c => (CARD_CONFIG[c]||{base_value:0}).base_value;
    const p0v = this.red_bid_cards[0].reduce((a,c)=>a+cardVal(c), 0);
    const p1v = this.red_bid_cards[1].reduce((a,c)=>a+cardVal(c), 0);
    let winner, loser;
    if (p0v > p1v || (p0v === p1v && this.red_bid_initiator === 0)){
      winner=0; loser=1;
    } else {
      winner=1; loser=0;
    }
    const key = this.red_bid_trigger_key;
    const score = this.red_bid_trigger_score;
    const winnerBid = this.red_bid_cards[winner];
    const bonus = winnerBid.reduce((a,c)=>a+cardVal(c),0) * C.RED_BID_BONUS_MULT;
    // Remove combo cards from winner's hand
    for (const c of this.red_bid_trigger_cards){
      const i = this.players[winner].hand.indexOf(c);
      if (i >= 0) this.players[winner].hand.splice(i, 1);
    }
    // Remove bid cards from winner's hand
    for (const c of winnerBid){
      const i = this.players[winner].hand.indexOf(c);
      if (i >= 0) this.players[winner].hand.splice(i, 1);
    }
    // Award
    this.players[winner].scorepad[key].scores.push(score);
    this.shared_red[key] = winner;
    this.players[winner].score += bonus;
    this._log('red_bid_reveal', `暗标揭晓！p0出价 ${p0v}，p1出价 ${p1v}`);
    this._log('red_bid_result', `${this.players[winner].name} 夺得【${key}】得 ${score}分 + 奉献奖励 ${bonus}分！`);
    this.players[winner].hand = sortHand(this.players[winner].hand);
    if (this._checkRaceWin()) return;
    this.phase = 'SPELL';
    this.current_player = this.red_bid_initiator;
  }

  _finishSpell(forceEnd){
    this._discard(this.played_this_turn);
    this.played_this_turn = [];
    if (this._checkRaceWin()) return;
    const p = this._cur();
    const overflow = handOverflow(p.hand);
    if (overflow > 0 && !forceEnd){ this.phase = 'END_DISCARD'; return; }
    if (overflow > 0 && forceEnd){
      const dumped = this._enforceHandLimit(this.current_player);
      if (dumped.length) this._log('end_discard', `（强制结束）整理自动弃 ${dumped.length} 张`);
    }
    if (forceEnd){ this._finishTurn(); return; }
    this._enterLockdownPlace();
  }

  _h_end_discard(pidx, data){
    if (this.phase !== 'END_DISCARD' || pidx !== this.current_player) return [false, 'Wrong phase'];
    const cards = data.cards || [];
    const p = this._cur();
    const needed = handOverflow(p.hand);
    if (cards.length !== needed) return [false, `Must discard exactly ${needed}`];
    const tmp = [...p.hand];
    for (const c of cards){ const i = tmp.indexOf(c); if (i<0) return [false, `手牌中没有 ${c}`]; tmp.splice(i,1); }
    for (const c of cards){ const i = p.hand.indexOf(c); if (i>=0) p.hand.splice(i,1); }
    this._discard(cards);
    this._log('end_discard', `${p.name} 弃 ${cards.length} 张`);
    this._enterLockdownPlace();
    return [true, null];
  }

  _enterLockdownPlace(){
    if (this._checkRaceWin()) return;
    const p = this._cur();
    const eligible = p.hand.filter(c => !(C.LOCKDOWN_BAN_INSTANT && c === '瞬'));
    if (!eligible.length){ this._finishTurn(); return; }
    this.phase = 'LOCKDOWN_PLACE';
  }

  _h_lockdown_place(pidx, data){
    if (this.phase !== 'LOCKDOWN_PLACE' || pidx !== this.current_player) return [false, 'Wrong phase'];
    const card = data.card;
    const p = this._cur();
    if (!p.hand.includes(card)) return [false, '手牌中没有该牌'];
    if (C.LOCKDOWN_BAN_INSTANT && card === '瞬') return [false, '不能用「瞬」做封锁牌'];
    p.hand.splice(p.hand.indexOf(card), 1);
    p.lockdown_card = card;
    this._log('lockdown_place', `${p.name} 明牌封锁 [${card}]`);
    this._finishTurn();
    return [true, null];
  }

  _h_lockdown_skip(pidx, data){
    if (this.phase !== 'LOCKDOWN_PLACE' || pidx !== this.current_player) return [false, 'Wrong phase'];
    this._log('lockdown_skip', `${this._cur().name} 跳过封锁`);
    this._finishTurn();
    return [true, null];
  }

  _finishTurn(){
    if (this._checkRaceWin()) return;
    this._advanceToNextTurn();
  }

  _sacrificeWindow(){
    const out = [];
    for (let i=0;i<this.discard_pile.length;i++){
      const t = this.discard_turns[i];
      if (t < this.turn_number && t >= this.turn_number - C.SACRIFICE_WINDOW){
        out.push([i, this.discard_pile[i]]);
      }
    }
    return out;
  }

  // ── COLLISION ──────────────────────────────────────────
  _colMustDiscard(pidx){
    const h0 = this.players[0].hand.length, h1 = this.players[1].hand.length;
    if (h0 === h1) return 0;
    if (pidx === 0 && h0 > h1) return h0 - h1;
    if (pidx === 1 && h1 > h0) return h1 - h0;
    return 0;
  }
  _h_col_pre_discard(pidx, data){
    if (this.phase !== 'COLLISION_PRE_DISCARD') return [false, 'Wrong phase'];
    if (this.col_pre_discard_done[pidx]) return [false, 'Already submitted'];
    const cards = data.cards || [];
    const must = this._colMustDiscard(pidx);
    if (must > 0){ if (cards.length !== must) return [false, `必须弃 ${must} 张`]; }
    else { if (cards.length > 2) return [false, '至多弃 2 张']; }
    const p = this.players[pidx];
    const tmp = [...p.hand];
    for (const c of cards){ const i = tmp.indexOf(c); if (i<0) return [false, `手牌中没有 ${c}`]; tmp.splice(i,1); }
    for (const c of cards){ const i = p.hand.indexOf(c); if (i>=0) p.hand.splice(i,1); }
    this._discard(cards);
    this.col_pre_discard_done[pidx] = true;
    this._log('col_pre_discard', `${p.name} 对撞前弃 ${cards.length} 张`);
    if (this.col_pre_discard_done[0] && this.col_pre_discard_done[1]){
      this.col_bet_caller = this.current_player;
      this.col_bet_amount = 0;
      this.col_bet_phase = 'CALLER';
      this.col_bet_response = null;
      this.col_bonus_pot = 0;
      this.phase = 'COLLISION_BET';
      this._log('col_bet', '进入对撞赌注阶段');
    }
    return [true, null];
  }
  _h_col_bet(pidx, data){
    if (this.phase !== 'COLLISION_BET') return [false, 'Wrong phase'];
    if (this.col_bet_phase === 'CALLER'){
      if (pidx !== this.col_bet_caller) return [false, 'Not caller'];
      const amount = data.amount || 0;
      if (![0,10,20].includes(amount)) return [false, 'Invalid bet'];
      this.col_bet_amount = amount;
      if (amount === 0){ this._log('col_bet', `${this.players[pidx].name} 不押注`); this._startCollision(); return [true, null]; }
      this.col_bet_phase = 'RESPONDER';
      this._log('col_bet', `${this.players[pidx].name} 押注 ${amount} 分！`);
      return [true, null];
    }
    if (this.col_bet_phase === 'RESPONDER'){
      const responder = 1 - this.col_bet_caller;
      if (pidx !== responder) return [false, 'Not responder'];
      const choice = data.choice;
      if (choice === 'follow'){
        const bet = this.col_bet_amount;
        this.players[0].score -= bet;
        this.players[1].score -= bet;
        this.col_bonus_pot = bet * 2;
        this._log('col_bet', `${this.players[pidx].name} 跟注！底池 +${bet*2}`);
        this._startCollision();
        return [true, null];
      }
      if (choice === 'fold'){
        this.players[this.col_bet_caller].score += 5;
        this.col_bonus_pot = 0;
        this._log('col_bet', `${this.players[pidx].name} 退缩`);
        this._startCollision();
        return [true, null];
      }
      return [false, 'Invalid choice'];
    }
    return [false, 'Unexpected'];
  }
  _startCollision(){
    this.col_arrange_done = [false, false];
    this.col_arrange_orders = [null, null];
    if (!this.players[0].hand.length && !this.players[1].hand.length){
      this.col_p0_cards = []; this.col_p1_cards = [];
      this.col_p0_flipped = new Set(); this.col_p1_flipped = new Set();
      this.col_round_pair = [null, null];
      this.col_state = colInit([], []);
      this.col_state.pot += this.col_bonus_pot;
      this.col_state.done = true;
      this.phase = 'COLLISION_FLIP';
      this._log('collision_start', '双方均无手牌，对撞跳过');
      this._finishCollision();
      return;
    }
    this.phase = 'COLLISION_ARRANGE';
    this._log('collision_arrange', '请双方排列对撞暗阵顺序！');
  }

  _h_col_arrange(pidx, data){
    if (this.phase !== 'COLLISION_ARRANGE') return [false, 'Wrong phase'];
    if (this.col_arrange_done[pidx]) return [false, '已提交排列'];
    const order = data.order || [];
    const hand = this.players[pidx].hand;
    const sortedOrder = [...order].sort();
    const sortedHand = [...hand].sort();
    if (sortedOrder.length !== sortedHand.length || !sortedOrder.every((v,i) => v === sortedHand[i]))
      return [false, '排列必须包含所有手牌'];
    this.col_arrange_orders[pidx] = [...order];
    this.col_arrange_done[pidx] = true;
    this._log('col_arrange', `${this.players[pidx].name} 已排列暗阵`);
    if (this.col_arrange_done[0] && this.col_arrange_done[1])
      this._finalizeCollisionStart();
    return [true, null];
  }

  _finalizeCollisionStart(){
    const p0 = this.col_arrange_orders[0] || [];
    const p1 = this.col_arrange_orders[1] || [];
    this.col_p0_cards = p0; this.col_p1_cards = p1;
    this.col_p0_flipped = new Set(); this.col_p1_flipped = new Set();
    this.col_round_pair = [null, null];
    this.col_state = colInit(p0, p1);
    this.col_state.pot += this.col_bonus_pot;
    this.phase = 'COLLISION_FLIP';
    const base = 10 + this.col_bonus_pot;
    this._log('collision_start', `对撞开始！初始底池 ${base} 分`);
  }
  _h_col_flip(pidx, data){
    if (this.phase !== 'COLLISION_FLIP') return [false, 'Wrong phase'];
    const r = this.col_state.round;
    const n0 = this.col_p0_cards.length, n1 = this.col_p1_cards.length;
    const mx = Math.max(n0, n1);
    if (r >= mx){ this._finishCollision(); return [true, null]; }
    const has0 = r < n0, has1 = r < n1;
    if (has0 && has1){
      if (this.col_round_pair[0] === null){
        if (pidx !== 0) return [false, 'Player 0 first'];
        this.col_p0_flipped.add(r);
        this.col_round_pair[0] = this.col_p0_cards[r];
        return [true, null];
      }
      if (this.col_round_pair[1] === null){
        if (pidx !== 1) return [false, 'Player 1 next'];
        this.col_p1_flipped.add(r);
        this.col_round_pair[1] = this.col_p1_cards[r];
        const res = colNext(this.col_state);
        if (res) this._log('col_result', this._formatCol(res));
        this.col_round_pair = [null, null];
        if (this.col_state.done) this._finishCollision();
        return [true, null];
      }
    } else if (has0){
      if (pidx !== 0) return [false, 'P0 crush'];
      this.col_p0_flipped.add(r);
      const res = colNext(this.col_state);
      if (res) this._log('col_result', this._formatCol(res));
      this.col_round_pair = [null, null];
      if (this.col_state.done) this._finishCollision();
      return [true, null];
    } else if (has1){
      if (pidx !== 1) return [false, 'P1 crush'];
      this.col_p1_flipped.add(r);
      const res = colNext(this.col_state);
      if (res) this._log('col_result', this._formatCol(res));
      this.col_round_pair = [null, null];
      if (this.col_state.done) this._finishCollision();
      return [true, null];
    }
    return [false, 'Unexpected'];
  }
  _formatCol(res){
    if (res.type === 'win') return `玩家 ${res.winner} 获胜！${res.c0||'?'} vs ${res.c1||'?'} → +${res.pts}`;
    if (res.type === 'tie') return `平局 ${res.c0} vs ${res.c1} — 底池 ${res.pot}`;
    if (res.type === 'crush') return `空位碾压！玩家 ${res.winner} +${res.pts}`;
    if (res.type === 'overload') return `魔力过载！${res.c0} vs ${res.c1} — ${res.lost} 分消散`;
    return JSON.stringify(res);
  }
  _finishCollision(){
    const cs = this.col_state.score;
    this.players[0].score += cs[0];
    this.players[1].score += cs[1];
    const t0 = totalScore(this.players[0]), t1 = totalScore(this.players[1]);
    this.winner = colFinalWinner(t0, t1, this.col_p0_cards, this.col_p1_cards);
    this.phase = 'GAME_OVER';
    const wname = this.winner >= 0 ? this.players[this.winner].name : '无人';
    this._log('game_over', `对撞结束！${this.players[0].name} ${t0} vs ${this.players[1].name} ${t1} — ${wname}获胜`);
  }
  _colWaitingFor(){
    if (!this.col_state || this.col_state.done) return -1;
    const r = this.col_state.round;
    const n0 = this.col_p0_cards.length, n1 = this.col_p1_cards.length;
    const has0 = r < n0, has1 = r < n1;
    if (has0 && has1) return this.col_round_pair[0] === null ? 0 : 1;
    if (has0) return 0;
    if (has1) return 1;
    return -1;
  }

  // ── VIEW ───────────────────────────────────────────────
  getView(pidx){
    if (pidx < 0 || pidx > 1) return {phase: 'LOBBY'};
    const oppIdx = 1 - pidx;
    const p = this.players[pidx], opp = this.players[oppIdx];
    const view = {
      phase: this.phase,
      my_idx: pidx,
      my_name: p.name,
      opp_name: opp.name,
      is_ai_game: this.is_ai_game,
      my_hand: [...p.hand],
      opp_hand_count: opp.hand.length,
      my_score: totalScore(p),
      opp_score: totalScore(opp),
      my_pad: JSON.parse(JSON.stringify(p.scorepad)),
      opp_pad: JSON.parse(JSON.stringify(opp.scorepad)),
      shared_red: {...this.shared_red},
      my_breaker: p.breaker_marks,
      my_curse: p.curse_active,
      opp_curse: opp.curse_active,
      deck_count: this.deck.length,
      deck_low: this.deck.length > 0 && this.deck.length <= C.DECK_LOW_THRESHOLD,
      discard_count: this.discard_pile.length,
      is_my_turn: this.current_player === pidx,
      current_player: this.current_player,
      turn_number: this.turn_number,
      win_score: C.WIN_SCORE,
      hand_limit: C.HAND_LIMIT,
      log: this._filteredLog(pidx),
      winner: this.winner,
      no_ambush_before: C.NO_AMBUSH_BEFORE_TURN,
      ambush_count: this.ambush_count_this_turn,
      ambush_max: C.AMBUSH_MAX_PER_TURN,
      ambush_second_cost: C.AMBUSH_SECOND_COST,
      market: [...this.market],
      market_size: C.MARKET_SIZE,
      market_buy_done_me: this.market_buy_done[pidx],
      market_dark: this._isDarkMarketTurn(),
      my_lockdown: p.lockdown_card,
      opp_lockdown: opp.lockdown_card,
      my_lockdown_debt: p.lockdown_debt,
      opp_lockdown_debt: opp.lockdown_debt,
      lockdown_break_cost: C.LOCKDOWN_BREAK_COST,
    };
    if (this.phase === 'DRAW' && pidx === this.current_player){
      view.drawn_cards = [...this.drawn_cards];
      view.draw_was_overdraft = this.draw_was_overdraft;
    }
    if (['AMBUSH_ATK_SELECT','AMBUSH_DEF_CHOICE','AMBUSH_PAY_COST',
         'AMBUSH_BLUFF_DECLARE'].includes(this.phase)){
      if (pidx === this.current_player) view.atk_card = this.atk_card;
      else view.atk_card = this.atk_card ? '?' : null;
    }
    if (this.phase === 'AMBUSH_DEF_CHOICE'){
      view.defender_idx = 1 - this.current_player;
      view.can_fold = true;
      view.my_hand_for_defend = pidx === (1 - this.current_player) ? p.hand : null;
    }
    if (this.phase === 'AMBUSH_BLUFF_DECLARE'){
      view.bluff_declared_rank = this.bluff_declared_rank;
      view.bluff_stake_bonus = C.BLUFF_STAKE_BONUS;
    }
    if (this.phase === 'AMBUSH_DEF_CHOICE'){
      view.can_call_bluff = !!this.bluff_declared_rank;
      view.bluff_declared_rank = this.bluff_declared_rank;
      view.bluff_stake_bonus = this.bluff_declared_rank ? C.BLUFF_STAKE_BONUS : 0;
    }
    if (this.ambush_last_outcome) view.ambush_last_outcome = this.ambush_last_outcome;
    // Prophet
    view.prophet_used_me = p.prophet_used || false;
    view.prophet_cost = C.PROPHET_COST;
    view.prophet_peek_hand_blocked = this.deck.length <= C.PROPHET_PEEK_HAND_MIN_DECK;
    if (p.prophet_peek != null && ['SPELL','PROPHET_DECK'].includes(this.phase))
      view.prophet_peek = [...p.prophet_peek];
    if (this.phase === 'PROPHET_DECK' && pidx === this.current_player)
      view.prophet_deck_cards = [...(p.prophet_peek || [])];
    // Red Zone Bid
    if (this.phase === 'RED_BID'){
      view.red_bid_done_me = this.red_bid_done[pidx];
      view.red_bid_trigger_key = this.red_bid_trigger_key;
      view.red_bid_trigger_score = this.red_bid_trigger_score;
      view.red_bid_min = C.RED_BID_MIN;
      view.red_bid_max = C.RED_BID_MAX;
      if (this.red_bid_done[0] && this.red_bid_done[1]){
        const cv = c => (CARD_CONFIG[c]||{base_value:0}).base_value;
        const p0v = this.red_bid_cards[0].reduce((a,c)=>a+cv(c),0);
        const p1v = this.red_bid_cards[1].reduce((a,c)=>a+cv(c),0);
        view.red_bid_reveal = {
          p0_cards: [...this.red_bid_cards[0]],
          p1_cards: [...this.red_bid_cards[1]],
          winner: p0v >= p1v ? 0 : 1,
        };
      }
    }
    if (this.phase === 'SPELL' && pidx === this.current_player){
      view.instant_count = this.instant_count;
      view.instant_limit = C.INSTANT_PER_TURN;
      const slotsFn = (k) => this._slotsLeft(pidx, k);
      view.playable_combos = detectPlayable(p.hand, slotsFn).map(([k,n,c,s])=>({key:k, name:n, cards:c, score:s}));
      const sacSlots = [];
      for (const cfg of SCOREPAD_CONFIG){
        const info = p.scorepad[cfg.key];
        if (info.scores.length) sacSlots.push({key:cfg.key, name:info.name, scores:[...info.scores]});
      }
      view.sacrifice_slots = sacSlots;
      view.sacrifice_window = this._sacrificeWindow();
      view.sacrifice_max_x = C.SACRIFICE_MAX_X;
    }
    if (this.phase === 'END_DISCARD' && pidx === this.current_player) view.overflow = handOverflow(p.hand);
    if (this.phase === 'COLLISION_PRE_DISCARD'){
      view.col_pre_done = this.col_pre_discard_done[pidx];
      view.col_must_discard = this._colMustDiscard(pidx);
    }
    if (this.phase === 'COLLISION_BET'){
      view.col_bet_caller = this.col_bet_caller;
      view.col_bet_phase = this.col_bet_phase;
      view.col_bet_amount = this.col_bet_amount;
    }
    if (this.phase === 'COLLISION_ARRANGE'){
      view.col_arrange_done = this.col_arrange_done[pidx];
      view.col_arrange_hand = [...p.hand];
    }
    if (this.phase === 'COLLISION_FLIP'){
      const myCards = pidx === 0 ? this.col_p0_cards : this.col_p1_cards;
      const myFlipped = pidx === 0 ? this.col_p0_flipped : this.col_p1_flipped;
      const oppCards = pidx === 0 ? this.col_p1_cards : this.col_p0_cards;
      const oppFlipped = pidx === 0 ? this.col_p1_flipped : this.col_p0_flipped;
      view.col_my_card_count = myCards.length;
      view.col_my_cards = myCards;
      view.col_opp_card_count = oppCards.length;
      view.col_my_flipped = [...myFlipped];
      view.col_opp_flipped = [...oppFlipped];
      const oppRev = {}; for (const i of oppFlipped) oppRev[i] = oppCards[i];
      const myRev = {};  for (const i of myFlipped)  myRev[i] = myCards[i];
      view.col_opp_revealed = oppRev;
      view.col_my_revealed = myRev;
      view.col_round = this.col_state ? this.col_state.round : 0;
      view.col_scores = this.col_state ? [...this.col_state.score] : [0,0];
      view.col_pot = this.col_state ? this.col_state.pot : 0;
      view.col_round_pair = [...this.col_round_pair];
      view.col_waiting_for = this._colWaitingFor();
    }
    if (this.phase === 'GAME_OVER'){
      view.final_scores = [totalScore(this.players[0]), totalScore(this.players[1])];
      view.col_scores = this.col_state ? [...this.col_state.score] : [0,0];
    }
    return view;
  }
  _filteredLog(pidx){
    const out = [];
    const recent = this.turn_log.slice(-12);
    for (const e of recent){
      if (e.type === 'ambush_atk' && pidx !== this.current_player)
        out.push({...e, msg: '对手暗扣了一张牌'});
      else out.push(e);
    }
    return out;
  }
}

// ════════════════════════════════════════════════════════════════
// AI BRAIN (port of ai_player.py with ZeroBrain)
// ════════════════════════════════════════════════════════════════
let AI_IDX = 1;

function setAIIdx(i){ AI_IDX = i; }

class ZeroBrain {
  unseenDistribution(room, ai_idx){
    const full = {};
    for (const c of CARD_ORDER) full[c] = CARD_CONFIG[c].count;
    for (const c of room.players[ai_idx].hand) full[c]--;
    for (const c of room.discard_pile) full[c]--;
    if (!room._isDarkMarketTurn()) for (const c of room.market) full[c]--;
    for (let i=0;i<2;i++){
      const lc = room.players[i].lockdown_card;
      if (lc) full[lc]--;
    }
    // 突袭牌已从攻击方手牌打出扣在桌上，须从全牌池扣除（无论 AI 是攻方还是守方）
    if (room.atk_card) full[room.atk_card] = Math.max(0, (full[room.atk_card]||0) - 1);
    return full;
  }

  oppHandDistribution(room, ai_idx){
    const unseen = this.unseenDistribution(room, ai_idx);
    const oppSize = room.players[1-ai_idx].hand.length;
    let total = 0;
    for (const c in unseen) total += unseen[c];
    const out = {};
    if (total <= 0 || oppSize <= 0){ for (const c in unseen) out[c] = 0; return out; }
    for (const c in unseen) out[c] = unseen[c] * oppSize / total;
    return out;
  }

  _attackEV(atkCard, room, ai_idx){
    const oppDist = this.oppHandDistribution(room, ai_idx);
    const oppSize = room.players[1-ai_idx].hand.length;
    if (oppSize <= 0) return 0;
    const pFold = 0.10 + Math.max(0, 4 - oppSize) * 0.05;
    const pShunInHand = Math.min(1.0, oppDist['瞬'] || 0);
    let pShunUsed = 0;
    if (atkCard === 'A') pShunUsed = Math.min(0.85, pShunInHand * 0.9);
    else if (atkCard === 'B') pShunUsed = Math.min(0.40, pShunInHand * 0.5);
    let ev = 0;
    ev += pFold * 6.0;
    const atkLoss = (BV[atkCard] || 1) * 1.5;
    ev += (1 - pFold) * pShunUsed * (-atkLoss - 2);
    let nonShunTotal = 0;
    for (const c in oppDist) if (c !== '瞬') nonShunTotal += oppDist[c];
    if (nonShunTotal <= 0) return ev;
    const pRealDefend = (1 - pFold) * (1 - pShunUsed);
    for (const defC in oppDist){
      if (defC === '瞬' || oppDist[defC] < 1e-6) continue;
      const cond = oppDist[defC] / nonShunTotal;
      const fullP = pRealDefend * cond;
      const res = compareDuel(atkCard, defC);
      let outcome = 0;
      if (res === 1){
        outcome = 6.0;
        if (atkCard === 'A' && defC !== 'F') outcome += 10;
        if (atkCard === 'F' && defC === 'A') outcome += 9;
      } else if (res === -1){
        outcome = -atkLoss;
        if (defC === 'A' && atkCard !== 'F') outcome -= 6;
        if (atkCard === 'A' && defC !== 'F') outcome += 3;
        if (defC === 'F' && atkCard === 'A') outcome -= 6;
      } else {
        outcome = -(BV[atkCard] || 1) * 0.6;
      }
      ev += fullP * outcome;
    }
    return ev;
  }

  bestAttackCard(room, ai_idx){
    const ai = room.players[ai_idx];
    const eligible = ai.hand.filter(c => c !== '瞬');
    if (!eligible.length) return null;
    const seen = new Set();
    const scored = [];
    for (const c of eligible){
      if (seen.has(c)) continue;
      seen.add(c);
      const ev = this._attackEV(c, room, ai_idx);
      const keepValue = cardValue(c, ai.hand, room, ai_idx);
      const net = ev - keepValue * 0.10;
      scored.push([c, net, ev]);
    }
    scored.sort((a,b)=> b[1] - a[1]);
    if (scored[0][1] < -1.2 && scored[0][2] < 0.5) return null;
    return scored[0][0];
  }

  bestDefenseCard(room, ai_idx, canFold){
    const ai = room.players[ai_idx];
    const oppDist = this.oppHandDistribution(room, ai_idx);
    // 离线模式下 room.atk_card 就是真实攻击牌（AI 守方可以完美应对）
    const atkKnown = room.atk_card && room.atk_card !== '瞬' ? room.atk_card : null;
    let atkDist, atkTotal;
    if (atkKnown){
      atkDist = {[atkKnown]: 1.0};
      atkTotal = 1.0;
    } else {
      atkDist = {}; atkTotal = 0;
      for (const c in oppDist){ if (c !== '瞬'){ atkDist[c] = oppDist[c]; atkTotal += oppDist[c]; }}
    }
    if (atkTotal <= 0) return canFold ? ['fold', null] : null;
    const eligible = ai.hand.filter(c => c !== '瞬');
    const hasShun = ai.hand.includes('瞬');
    if (!eligible.length && !hasShun) return canFold ? ['fold', null] : null;
    const avgMyVal = ai.hand.reduce((a,c)=> a + (BV[c] || 1), 0) / Math.max(1, ai.hand.length);
    const evFold = -avgMyVal * 1.2;
    const evs = {};
    if (hasShun){
      let absorbedValue;
      let highAtk;
      if (atkKnown){
        absorbedValue = BV[atkKnown] || 1;
        highAtk = (atkKnown === 'A' || atkKnown === 'B') ? 1.0 : 0.0;
      } else {
        absorbedValue = 0;
        for (const c in atkDist) absorbedValue += atkDist[c] * (BV[c] || 1);
        absorbedValue /= Math.max(atkTotal, 1);
        highAtk = ((atkDist['A']||0) + (atkDist['B']||0)) / Math.max(atkTotal, 1);
      }
      let evShun = absorbedValue * 1.6 - 4.5 + highAtk * 6.0;
      if (atkKnown === 'A') evShun += 8.0;
      evs['瞬'] = evShun;
    }
    const defSet = new Set(eligible);
    for (const defC of defSet){
      let ev = 0;
      for (const atkC in atkDist){
        if (atkDist[atkC] < 1e-6) continue;
        const p = atkDist[atkC] / atkTotal;
        const res = compareDuel(atkC, defC);
        if (res === -1){
          let out = 6.0;
          if (defC === 'A' && atkC !== 'F') out += 10;
          if (defC === 'F' && atkC === 'A') out += 9;
          ev += p * out;
        } else if (res === 1){
          let out = -(BV[defC] || 1) * 1.5;
          if (atkC === 'A' && defC !== 'F') out -= 6;
          if (defC === 'A' && atkC !== 'F') out += 3;
          if (defC === 'F' && atkC === 'A') out += 9;
          ev += p * out;
        } else ev += p * (-(BV[defC] || 1) * 0.6);
      }
      ev -= cardValue(defC, ai.hand, room, ai_idx) * 0.05;
      evs[defC] = ev;
    }
    if (!Object.keys(evs).length) return canFold ? ['fold', null] : null;
    let bestCard = null, bestEV = -Infinity;
    for (const c in evs){ if (evs[c] > bestEV){ bestEV = evs[c]; bestCard = c; }}
    const margin = atkKnown ? 0.5 : 1.0;
    if (canFold && evFold > bestEV + margin) return ['fold', null];
    return ['defend', bestCard];
  }

  bestLockdownRank(room, ai_idx){
    const oppDist = this.oppHandDistribution(room, ai_idx);
    const damage = {A:0,B:0,C:0,D:0,E:0,F:0};
    for (const r of 'ABCDEF'){
      const cnt = oppDist[r] || 0;
      if ('ABCDE'.includes(r)) damage[r] += cnt * 12;
      if ('BCDEF'.includes(r)) damage[r] += cnt * 8;
      if (cnt >= 3) damage[r] += cnt * 8;
      if (cnt >= 5) damage[r] += 30;
      if (r === 'F' && cnt >= 3) damage[r] += cnt * 4;
    }
    let bestR = 'C', bestD = -1;
    for (const r in damage){ if (damage[r] > bestD){ bestD = damage[r]; bestR = r; }}
    return bestR;
  }
}

const _brain = new ZeroBrain();

function cardValue(card, hand, room, pidx){
  if (card === '瞬') return 55;
  const ct = counter(hand.filter(c => c !== '瞬'));
  let score = BV[card] * 2.5;
  const have = ct[card] || 0;
  const slots = (k) => room._slotsLeft(pidx, k);
  if (have >= 4 && slots('dragon_breath') > 0) score += 50;
  else if (have >= 3 && slots('dragon_breath') > 0) score += 25;
  else if (have >= 3 && slots('triple_resonance') > 0) score += 22;
  if ('ABCDE'.includes(card) && slots('arcane_sequence') > 0){
    let present = 0; for (const c of 'ABCDE') if (ct[c]) present++;
    if (present >= 3) score += 30 - (5 - present) * 5;
    else if (present >= 2) score += 12;
  }
  if ('BCDEF'.includes(card) && slots('elemental_surge') > 0){
    let present = 0; for (const c of 'BCDEF') if (ct[c]) present++;
    if (present >= 3) score += 22 - (5 - present) * 4;
    else if (present >= 2) score += 8;
  }
  if (have >= 2 && slots('chaos_alchemy') > 0){
    for (const o in ct){ if (o !== card && ct[o] >= 2){ score += 15; break; } }
    if (have >= 3){
      for (const o in ct){ if (o !== card && ct[o] >= 1){ score += 12; break; } }
    }
  }
  if (card === 'F'){
    const f = ct['F'] || 0;
    if (f >= C.ANT_COLONY_MIN_F - 1 && slots('ant_colony') > 0) score += f * 4;
  }
  if (card === 'A') score += 10;
  else if (card === 'B') score += 5;
  const deckLeft = room.deck ? room.deck.length : 20;
  if (deckLeft <= 12) score += BV[card] * 2;
  return score;
}

function expendability(card, hand, room, pidx){ return 100 - cardValue(card, hand, room, pidx); }

function totalSealed(pad){
  let s = 0;
  for (const k in pad) s += pad[k].sealed;
  return s;
}

function nearCombos(hand, room, pidx){
  const ct = counter(hand.filter(c => c !== '瞬'));
  const out = [];
  const slots = (k) => room._slotsLeft(pidx, k);
  if (slots('dragon_breath') > 0){
    for (const c in ct){
      if (ct[c] >= 3){
        const sc = _scaled(40 + BV[c] * 5);
        const need = []; for (let i=0;i<5-ct[c];i++) need.push(c);
        out.push(['dragon_breath', 5-ct[c], sc, need]);
      }
    }
  }
  if (slots('arcane_sequence') > 0){
    const need = []; for (const c of 'ABCDE') if (!ct[c]) need.push(c);
    if (need.length <= 2) out.push(['arcane_sequence', need.length, _scaled(45), need]);
  }
  if (slots('elemental_surge') > 0){
    const need = []; for (const c of 'BCDEF') if (!ct[c]) need.push(c);
    if (need.length <= 2) out.push(['elemental_surge', need.length, _scaled(30), need]);
  }
  if (slots('triple_resonance') > 0){
    for (const c in ct) if (ct[c] >= 2){
      const sc = _scaled(10 + BV[c] * 3);
      out.push(['triple_resonance', 3-ct[c], sc, [c]]);
    }
  }
  if (slots('ant_colony') > 0){
    const f = ct['F'] || 0;
    const miss = Math.max(0, C.ANT_COLONY_MIN_F - f);
    if (miss <= 2) out.push(['ant_colony', miss, _scaled(Math.max(f, C.ANT_COLONY_MIN_F) * 5), Array(miss).fill('F')]);
  }
  return out;
}

function detectPlayableForRoom(room, pidx){
  const slotsFn = (k) => room._slotsLeft(pidx, k);
  return detectPlayable(room.players[pidx].hand, slotsFn);
}

function estimateOppMaxCombo(oppDist, room){
  let best = 0;
  for (const c in oppDist){
    if (c === '瞬') continue;
    const cnt = oppDist[c];
    if (cnt >= 4.5) best = Math.max(best, _scaled(40 + (BV[c]||1) * 5));
    else if (cnt >= 3.5) best = Math.max(best, Math.floor(_scaled(40 + (BV[c]||1) * 5) * 0.6));
    if (cnt >= 2.5) best = Math.max(best, _scaled(10 + (BV[c]||1) * 3));
  }
  const arcProb = Math.min(...'ABCDE'.split('').map(c => oppDist[c] || 0));
  if (arcProb >= 0.4) best = Math.max(best, Math.floor(_scaled(45) * Math.min(1.0, arcProb)));
  const eleProb = Math.min(...'BCDEF'.split('').map(c => oppDist[c] || 0));
  if (eleProb >= 0.4) best = Math.max(best, Math.floor(_scaled(30) * Math.min(1.0, eleProb)));
  for (const c1 in oppDist){
    if (c1 === '瞬') continue;
    if (oppDist[c1] >= 2.5){
      for (const c2 in oppDist){
        if (c2 === '瞬' || c2 === c1) continue;
        if (oppDist[c2] >= 1.5){
          const cardsBV = (BV[c1]||1) * 3 + (BV[c2]||1) * 2;
          best = Math.max(best, Math.floor(_scaled(20 + cardsBV) * 0.7));
        }
      }
    }
  }
  const fCnt = oppDist['F'] || 0;
  if (fCnt >= C.ANT_COLONY_MIN_F - 0.5) best = Math.max(best, _scaled(Math.floor(fCnt) * 5));
  return best;
}

// ── Main decide() function ───────────────────────────────
function decide(room){
  const phase = room.phase;
  const ai = room.players[AI_IDX];
  const opp = room.players[1 - AI_IDX];
  const cp = room.current_player;
  if (phase === 'GAME_OVER') return null;
  if (phase === 'DRAW'){ if (cp !== AI_IDX) return null; return ['DRAW_ACK', {}]; }
  if (phase === 'MARKET'){ if (cp !== AI_IDX) return null; return decideMarket(ai, opp, room); }
  if (phase === 'LOCKDOWN_PLACE'){ if (cp !== AI_IDX) return null; return decideLockdownPlace(ai, opp, room); }
  if (phase === 'AMBUSH_DECIDE'){ if (cp !== AI_IDX) return null; return decideAmbush(ai, opp, room); }
  if (phase === 'AMBUSH_PAY_COST'){ if (cp !== AI_IDX) return null; return decidePayCost(ai, room); }
  if (phase === 'AMBUSH_ATK_SELECT'){ if (cp !== AI_IDX) return null; return decideAtkSelect(ai, opp, room); }
  if (phase === 'AMBUSH_BLUFF_DECLARE'){ if (cp !== AI_IDX) return null; return decideBluffDeclare(ai, opp, room); }
  if (phase === 'AMBUSH_DEF_CHOICE'){ if (cp === AI_IDX) return null; return decideDefend(ai, opp, room); }
  if (phase === 'SPELL'){ if (cp !== AI_IDX) return null; return decideSpell(ai, opp, room); }
  if (phase === 'PROPHET_DECK'){ if (cp !== AI_IDX) return null; return ['PROPHET_DECK', {discard_idx: null}]; }
  if (phase === 'RED_BID') return decideRedBid(ai, opp, room, AI_IDX);
  if (phase === 'END_DISCARD'){ if (cp !== AI_IDX) return null; return decideEndDiscard(ai, room); }
  if (phase === 'COLLISION_PRE_DISCARD'){ if (room.col_pre_discard_done[AI_IDX]) return null; return decideColPreDiscard(ai, opp, room); }
  if (phase === 'COLLISION_BET') return decideColBet(ai, opp, room);
  if (phase === 'COLLISION_ARRANGE'){ if (room.col_arrange_done[AI_IDX]) return null; return decideColArrange(ai); }
  if (phase === 'COLLISION_FLIP'){ const wf = room._colWaitingFor(); if (wf !== AI_IDX) return null; return ['COLLISION_FLIP', {}]; }
  return null;
}

function decideBluffDeclare(ai, opp, room){
  const trueCard = room.atk_card;
  if (!trueCard) return ['BLUFF_DECLARE', {declared_rank:'none'}];
  const myScore = totalScore(ai), oppScore = totalScore(opp);
  if (trueCard === 'A' || trueCard === 'B'){
    if (Math.random() < 0.75) return ['BLUFF_DECLARE', {declared_rank: trueCard}];
    return ['BLUFF_DECLARE', {declared_rank:'none'}];
  }
  if (trueCard === 'C' || trueCard === 'D'){
    const r = Math.random();
    if (r < 0.35){
      const declared = ['A','A','B'][Math.floor(Math.random()*3)];
      return ['BLUFF_DECLARE', {declared_rank: declared}];
    }
    if (r < 0.60) return ['BLUFF_DECLARE', {declared_rank: trueCard}];
    return ['BLUFF_DECLARE', {declared_rank:'none'}];
  }
  if (trueCard === 'E' || trueCard === 'F'){
    const bluffRate = (myScore - oppScore < -15) ? 0.65 : 0.45;
    if (Math.random() < bluffRate){
      const pool = ['A','B','B','C'];
      const declared = pool[Math.floor(Math.random()*pool.length)];
      return ['BLUFF_DECLARE', {declared_rank: declared}];
    }
    return ['BLUFF_DECLARE', {declared_rank:'none'}];
  }
  return ['BLUFF_DECLARE', {declared_rank:'none'}];
}

function _shouldCallBluff(ai, opp, room){
  const declared = room.bluff_declared_rank;
  if (!declared) return false;
  // Estimate p(declaration is true) WITHOUT peeking at actual card.
  // Use unseen distribution and add 1 back to compensate for atk_card subtraction.
  const unseen = _brain.unseenDistribution(room, AI_IDX);
  let totalUnseen = 0;
  for (const k in unseen) totalUnseen += unseen[k];
  const declaredInPool = (unseen[declared] || 0) + 1;
  const totalPool = totalUnseen + 1;
  const pTrue = declaredInPool / Math.max(1, totalPool);
  const myScore = totalScore(ai);
  const oppScore = totalScore(opp);
  const evCall = pTrue * (-C.BLUFF_TRUE_PENALTY) + (1 - pTrue) * C.BLUFF_FALSE_PENALTY;
  if (evCall > 5 && pTrue < 0.20) return true;
  if (myScore - oppScore > 25 && evCall > 2 && pTrue < 0.30) return true;
  if (pTrue < 0.12 && myScore >= C.BLUFF_TRUE_PENALTY) return true;
  return false;
}

function decideRedBid(ai, opp, room, aiIdx){
  if (room.red_bid_done[aiIdx]) return null;
  const hand = ai.hand;
  const myScore = totalScore(ai);
  const oppScore = totalScore(opp);
  const diff = myScore - oppScore;
  const trigScore = room.red_bid_trigger_score;
  let nBid;
  if (myScore + trigScore >= C.WIN_SCORE) nBid = C.RED_BID_MAX;
  else if (oppScore + trigScore >= C.WIN_SCORE * 0.85) nBid = C.RED_BID_MAX;
  else if (diff < -15 || trigScore >= 40) nBid = C.RED_BID_MAX;
  else if (diff < 0 || trigScore >= 25) nBid = Math.min(C.RED_BID_MAX, 2);
  else nBid = C.RED_BID_MIN;
  nBid = Math.min(nBid, hand.length, C.RED_BID_MAX);
  nBid = Math.max(nBid, C.RED_BID_MIN);
  const eligible = [...hand].sort((a,b) => cardValue(a, hand, room, aiIdx) - cardValue(b, hand, room, aiIdx));
  const bidCards = eligible.slice(0, nBid);
  return ['RED_BID', {cards: bidCards}];
}

function decideMarket(ai, opp, room){
  const market = room.market;
  if (!market.length || room.market_buy_done[AI_IDX]) return ['MARKET_SKIP', {}];
  const hand = ai.hand;
  const ct = counter(hand.filter(c => c !== '瞬'));
  const isDark = room._isDarkMarketTurn();
  const myScore = totalScore(ai);
  const oppScore = totalScore(opp);
  const slots = (k) => room._slotsLeft(AI_IDX, k);
  const needs = {};
  if (slots('arcane_sequence') > 0){
    const missing = 'ABCDE'.split('').filter(c => !ct[c]);
    const arcHeat = Math.max(0, 100 - 10 * missing.length);
    for (const c of 'ABCDE') if (!ct[c]) needs[c] = Math.max(needs[c]||0, arcHeat);
  }
  if (slots('elemental_surge') > 0){
    const missing = 'BCDEF'.split('').filter(c => !ct[c]);
    const eleHeat = Math.max(0, 85 - 10 * missing.length);
    for (const c of 'BCDEF') if (!ct[c]) needs[c] = Math.max(needs[c]||0, eleHeat);
  }
  for (const c in ct){
    if (c === '瞬') continue;
    if (ct[c] >= 3 && slots('dragon_breath') > 0) needs[c] = Math.max(needs[c]||0, 60 + ct[c] * 25);
    if (ct[c] === 2 && slots('triple_resonance') > 0) needs[c] = Math.max(needs[c]||0, 65);
  }
  if (slots('chaos_alchemy') > 0){
    for (const c in ct){
      if (c === '瞬') continue;
      if (ct[c] >= 2) needs[c] = Math.max(needs[c]||0, 55 + ct[c] * 8);
    }
  }
  if (slots('ant_colony') > 0){
    const fCnt = ct['F'] || 0;
    if (fCnt >= 1) needs['F'] = Math.max(needs['F']||0, 40 + fCnt * 12);
  }
  needs['A'] = Math.max(needs['A']||0, 55);
  needs['B'] = Math.max(needs['B']||0, 30);
  needs['瞬'] = Math.max(needs['瞬']||0, 40);

  if (isDark){
    const unseen = _brain.unseenDistribution(room, AI_IDX);
    let tot = 0; for (const c in unseen) tot += unseen[c];
    let bestDarkIdx = -1, bestEV = -1;
    for (let i = 0; i < market.length; i++){
      let ev;
      if (tot > 0){
        ev = 0;
        for (const c in unseen){
          if (c === '瞬') continue;
          ev += unseen[c] / tot * ((needs[c]||0) + (BV[c]||1) * 5);
        }
      } else { ev = 25; }
      ev += Math.random() * 10;
      if (ev > bestEV){ bestEV = ev; bestDarkIdx = i; }
    }
    if (bestDarkIdx >= 0) return ['MARKET_BUY', {market_idx: bestDarkIdx, payment: []}];
    return ['MARKET_BUY', {market_idx: 0, payment: []}];
  }

  let bestIdx = -1, bestPri = -1;
  for (let i = 0; i < market.length; i++){
    const mc = market[i];
    let pri = needs[mc] || (BV[mc]||1) * 3;
    if (oppScore - myScore > 20) pri += 15;
    if (room.deck.length <= 15) pri += 10;
    if (pri > bestPri){ bestPri = pri; bestIdx = i; }
  }
  if (bestIdx < 0 || bestPri < 15) return ['MARKET_SKIP', {}];

  const target = market[bestIdx];
  const targetV = _bvMarket(target);
  const sortedHand = [...hand].sort((a,b) => cardValue(a, hand, room, AI_IDX) - cardValue(b, hand, room, AI_IDX));
  const payment = []; let total = 0;
  for (const c of sortedHand){
    if (total >= targetV) break;
    const cv = cardValue(c, hand, room, AI_IDX);
    if (cv >= 55 && bestPri < 90) continue;
    payment.push(c); total += _bvMarket(c);
  }
  if (total < targetV) return ['MARKET_SKIP', {}];
  if (total > targetV * 1.6 && bestPri < 60) return ['MARKET_SKIP', {}];
  if (hand.length - payment.length + 1 < 2) return ['MARKET_SKIP', {}];
  return ['MARKET_BUY', {market_idx: bestIdx, payment}];
}

function decideLockdownPlace(ai, opp, room){
  const hand = ai.hand;
  if (hand.length <= 2) return ['LOCKDOWN_SKIP', {}];
  const myTotal = totalScore(ai), oppTotal = totalScore(opp);
  const diff = myTotal - oppTotal;
  if (diff < -40 && hand.length <= 3) return ['LOCKDOWN_SKIP', {}];
  const targetRank = _brain.bestLockdownRank(room, AI_IDX);
  const ct = counter(hand.filter(c => c !== '瞬'));
  if ((ct[targetRank] || 0) >= 1){
    if ((ct[targetRank] || 0) >= 2) return ['LOCKDOWN_PLACE', {card: targetRank}];
    if (cardValue(targetRank, hand, room, AI_IDX) < 35) return ['LOCKDOWN_PLACE', {card: targetRank}];
  }
  if (diff >= -10 && hand.length >= 4){
    const eligible = hand.filter(c => c !== '瞬');
    if (eligible.length){
      const sorted = [...eligible].sort((a,b) => cardValue(a, hand, room, AI_IDX) - cardValue(b, hand, room, AI_IDX));
      const cheapest = sorted[0];
      if (cardValue(cheapest, hand, room, AI_IDX) < 30) return ['LOCKDOWN_PLACE', {card: cheapest}];
    }
  }
  const oppDist = _brain.oppHandDistribution(room, AI_IDX);
  const oppMax = estimateOppMaxCombo(oppDist, room);
  if (oppMax >= 25 && hand.length >= 4){
    const eligible = hand.filter(c => c !== '瞬');
    if (eligible.length){
      const sorted = [...eligible].sort((a,b) => cardValue(a, hand, room, AI_IDX) - cardValue(b, hand, room, AI_IDX));
      const cheapest = sorted[0];
      if (cardValue(cheapest, hand, room, AI_IDX) < 35) return ['LOCKDOWN_PLACE', {card: cheapest}];
    }
  }
  return ['LOCKDOWN_SKIP', {}];
}

function decideAmbush(ai, opp, room){
  const hand = ai.hand;
  const eligible = hand.filter(c => c !== '瞬');
  if (room.turn_number < C.NO_AMBUSH_BEFORE_TURN) return ['AMBUSH_DECIDE', {choice:'skip'}];
  if (!eligible.length || hand.length <= 2) return ['AMBUSH_DECIDE', {choice:'skip'}];
  if (!opp.hand.length) return ['AMBUSH_DECIDE', {choice:'skip'}];
  const isSecond = room.ambush_count_this_turn >= 1;
  if (isSecond){
    if (hand.length <= C.AMBUSH_SECOND_COST + 2) return ['AMBUSH_DECIDE', {choice:'skip'}];
    if (opp.hand.length < 2) return ['AMBUSH_DECIDE', {choice:'skip'}];
  }
  const myScore = totalScore(ai), oppScore = totalScore(opp);
  const diff = myScore - oppScore;
  const playable = detectPlayableForRoom(room, AI_IDX);
  if (playable.length && playable[0][3] >= 35) return ['AMBUSH_DECIDE', {choice:'skip'}];
  if (diff > 45 && hand.length <= 4) return ['AMBUSH_DECIDE', {choice:'skip'}];
  const bestAtk = _brain.bestAttackCard(room, AI_IDX);
  if (bestAtk !== null) return ['AMBUSH_DECIDE', {choice:'attack'}];
  const oppDist = _brain.oppHandDistribution(room, AI_IDX);
  const oppMax = estimateOppMaxCombo(oppDist, room);
  if (oppMax >= 30 && eligible.length >= 3 && !isSecond) return ['AMBUSH_DECIDE', {choice:'attack'}];
  if (diff < -15 && eligible.length >= 3 && opp.hand.length >= 4 && !isSecond) return ['AMBUSH_DECIDE', {choice:'attack'}];
  return ['AMBUSH_DECIDE', {choice:'skip'}];
}

function decidePayCost(ai, room){
  const hand = ai.hand;
  const rated = hand.map(c => [c, cardValue(c, hand, room, AI_IDX)]);
  rated.sort((a,b) => a[1] - b[1]);
  const toDiscard = rated.slice(0, C.AMBUSH_SECOND_COST).map(x => x[0]);
  return ['AMBUSH_PAY_COST', {cards: toDiscard}];
}

function decideAtkSelect(ai, opp, room){
  const eligible = ai.hand.filter(c => c !== '瞬');
  if (!eligible.length) return ['AMBUSH_CANCEL', {}];
  let best = _brain.bestAttackCard(room, AI_IDX);
  if (best === null){
    // Fallback: most expendable non-A
    const nonA = eligible.filter(c => c !== 'A');
    const pool = nonA.length ? nonA : eligible;
    pool.sort((a,b) => expendability(b, ai.hand, room, AI_IDX) - expendability(a, ai.hand, room, AI_IDX));
    best = pool[0];
  }
  return ['AMBUSH_ATK_SELECT', {card: best}];
}

function decideDefend(ai, opp, room){
  const hand = ai.hand;
  const eligible = hand.filter(c => c !== '瞬');
  const hasInstant = hand.includes('瞬');
  if (!eligible.length && !hasInstant) return ['AMBUSH_DEFEND', {choice:'fold'}];
  // Check bluff call first
  if (_shouldCallBluff(ai, opp, room))
    return ['AMBUSH_DEFEND', {choice:'call'}];
  const atkKnown = room.atk_card || null;
  if (hasInstant && (atkKnown === 'A' || atkKnown === 'B'))
    return ['AMBUSH_DEFEND', {choice:'defend', card:'瞬'}];
  const near = nearCombos(hand, room, AI_IDX);
  const highValueNear = near.filter(c => c[2] >= 70 && c[1] <= 1);
  if (atkKnown && eligible.length){
    const winners = [...new Set(eligible)].filter(c => compareDuel(atkKnown, c) === -1);
    if (winners.length){
      winners.sort((a,b) => cardValue(a, hand, room, AI_IDX) - cardValue(b, hand, room, AI_IDX));
      return ['AMBUSH_DEFEND', {choice:'defend', card: winners[0]}];
    }
    if (hasInstant && (BV[atkKnown]||0) >= 4)
      return ['AMBUSH_DEFEND', {choice:'defend', card:'瞬'}];
    if (highValueNear.length && hand.length <= 4){
      if (hasInstant) return ['AMBUSH_DEFEND', {choice:'defend', card:'瞬'}];
      return ['AMBUSH_DEFEND', {choice:'fold'}];
    }
    const tieCards = [...new Set(eligible)].filter(c => compareDuel(atkKnown, c) === 0);
    if (tieCards.length){
      tieCards.sort((a,b) => cardValue(a, hand, room, AI_IDX) - cardValue(b, hand, room, AI_IDX));
      return ['AMBUSH_DEFEND', {choice:'defend', card: tieCards[0]}];
    }
  }
  const decision = _brain.bestDefenseCard(room, AI_IDX, true);
  if (!decision) return ['AMBUSH_DEFEND', {choice:'fold'}];
  const [choice, card] = decision;
  if (choice === 'fold'){
    if (hasInstant && opp.hand.length >= 3)
      return ['AMBUSH_DEFEND', {choice:'defend', card:'瞬'}];
    return ['AMBUSH_DEFEND', {choice:'fold'}];
  }
  return ['AMBUSH_DEFEND', {choice:'defend', card}];
}

function decideSpell(ai, opp, room){
  const hand = ai.hand;
  const myScore = totalScore(ai), oppScore = totalScore(opp);
  const oppDist0 = _brain.oppHandDistribution(room, AI_IDX);
  const oppMax = estimateOppMaxCombo(oppDist0, room);
  const oppPressure = oppScore + oppMax >= C.WIN_SCORE;
  const deckLeft = room.deck.length;
  if (ai.breaker_marks > 0){
    const a = decideBreaker(room, ai, opp);
    if (a) return a;
  }
  const playable = detectPlayableForRoom(room, AI_IDX);
  if (playable.length){
    const best = pickBestCombo(playable, hand, room, ai, opp);
    if (best){
      const [key, name, cards, score] = best;
      const oppLock = opp.lockdown_card;
      if (oppLock && oppLock !== '瞬' && cards.includes(oppLock)){
        if (ai.breaker_marks > 0)
          return ['SPELL_SCORE', {cards, combo_key:key, break_lockdown:'marker'}];
        const breakThreshold = (oppPressure || myScore + score >= C.WIN_SCORE) ? 15 : 20;
        if (score >= breakThreshold)
          return ['SPELL_SCORE', {cards, combo_key:key, break_lockdown:'pay'}];
        for (const e of playable){
          const [k2,n2,c2,s2] = e;
          if (!c2.includes(oppLock)) return ['SPELL_SCORE', {cards:c2, combo_key:k2}];
        }
      } else return ['SPELL_SCORE', {cards, combo_key:key}];
    }
  }
  if (hand.includes('瞬') && room.instant_count < C.INSTANT_PER_TURN){
    const ia = decideInstant(hand, room, ai, opp);
    if (ia) return ia;
  }
  const sac = decideSacrifice(ai, opp, room);
  if (sac) return sac;
  if (!ai.prophet_used && myScore >= C.PROPHET_COST){
    let shouldPeek = false;
    if (oppScore - myScore >= 10) shouldPeek = true;
    if (deckLeft >= 15 && deckLeft <= 35 && myScore >= 15) shouldPeek = true;
    if (opp.hand.length >= 6) shouldPeek = true;
    if (deckLeft <= 20 && !shouldPeek && oppScore >= myScore) shouldPeek = true;
    if (shouldPeek){
      if (room.deck.length > C.PROPHET_PEEK_HAND_MIN_DECK)
        return ['PROPHET_WHISPER', {choice:'peek_hand'}];
      else if (room.deck.length > 0)
        return ['PROPHET_WHISPER', {choice:'peek_deck'}];
    }
  }
  return ['SPELL_SKIP', {}];
}

function decideBreaker(room, ai, opp){
  let sealedTotal = 0;
  for (const k in opp.scorepad) sealedTotal += opp.scorepad[k].sealed;
  const canSeal = sealedTotal < C.SEAL_LIMIT;
  if (canSeal){
    for (const tier of [1,2,3]){
      for (const cfg of SCOREPAD_CONFIG){
        if (cfg.tier === tier && room._slotsLeft(1 - AI_IDX, cfg.key) > 0)
          return ['SPELL_BREAKER', {type:'seal', slot_key: cfg.key}];
      }
    }
  }
  if (!opp.curse_active) return ['SPELL_BREAKER', {type:'curse'}];
  return null;
}

function pickBestCombo(playable, hand, room, ai, opp){
  const myScore = totalScore(ai), oppScore = totalScore(opp);
  const deckLeft = room.deck.length;
  const winning = playable.filter(p => myScore + p[3] >= C.WIN_SCORE);
  if (winning.length){
    let best = winning[0];
    for (const w of winning) if (w[2].length < best[2].length) best = w;
    return best;
  }
  const oppDist = _brain.oppHandDistribution(room, AI_IDX);
  const oppMaxCombo = estimateOppMaxCombo(oppDist, room);
  const oppPressure = oppScore + oppMaxCombo >= C.WIN_SCORE;
  const oppClose = oppScore >= C.WIN_SCORE * 0.7;
  const reds = playable.filter(p => RED_KEYS.has(p[0]));
  if (reds.length){
    let bestRed = reds[0]; for (const r of reds) if (r[3] > bestRed[3]) bestRed = r;
    if (oppPressure || myScore >= C.WIN_SCORE * 0.3 || bestRed[3] >= 30) return bestRed;
  }
  const scored = [];
  for (const [key, name, cards, base] of playable){
    const remaining = [...hand];
    for (const c of cards){ const i = remaining.indexOf(c); if (i>=0) remaining.splice(i,1); }
    const slotsFn = (k) => room._slotsLeft(AI_IDX, k);
    const future = detectPlayable(remaining, slotsFn);
    const futurePot = future.length ? future[0][3] : 0;
    let effective = base;
    if (ai.curse_active) effective -= 10;
    if (RED_KEYS.has(key)) effective += 22;
    else if (BLUE_KEYS.has(key)) effective += 8;
    else if (GREEN_KEYS.has(key)) effective += 6;
    if (myScore < oppScore) effective += Math.min(12, (oppScore - myScore) * 0.3);
    if (deckLeft <= 12) effective += 10;
    if (deckLeft <= 6) effective += 15;
    if (base >= 40) effective += 8;
    if (key === 'ant_colony' && cards.length <= C.ANT_COLONY_MIN_F && deckLeft > 12) effective -= 8;
    const oppLock = opp.lockdown_card;
    if (oppLock && oppLock !== '瞬' && cards.includes(oppLock)){
      if (ai.breaker_marks > 0) effective -= 2;
      else effective -= 14;
    }
    if (oppPressure) effective += 12;
    else if (oppClose) effective += 6;
    const futureWeight = remaining.length >= 4 ? 0.4 : 0.2;
    const total = effective + futurePot * futureWeight;
    scored.push([key, name, cards, base, total]);
  }
  scored.sort((a,b) => b[4] - a[4]);
  const best = scored[0];
  const minThreshold = (deckLeft <= 15 || oppPressure || oppClose) ? 10 : 12;
  if (best[3] < minThreshold && deckLeft > 18 && !oppPressure) return null;
  return [best[0], best[1], best[2], best[3]];
}

function decideInstant(hand, room, ai, opp){
  const nonInstant = hand.filter(c => c !== '瞬');
  if (!nonInstant.length) return null;
  const myScore = totalScore(ai);
  const oppScore = totalScore(opp);
  const deckLeft = room.deck.length;
  const playable = detectPlayableForRoom(room, AI_IDX);
  if (playable.length && playable[0][3] >= 30) return null;
  const rated = nonInstant.map(c => [c, expendability(c, hand, room, AI_IDX)]);
  rated.sort((a,b) => b[1] - a[1]);
  const trash = rated.filter(x => x[1] >= 60).map(x => x[0]);
  const mediocre = rated.filter(x => x[1] >= 50).map(x => x[0]);
  if (trash.length){
    const dCount = Math.min(trash.length, 3);
    return ['SPELL_INSTANT', {discard_cards: trash.slice(0, dCount)}];
  }
  if (hand.length >= 6 && mediocre.length >= 2 && deckLeft > 5)
    return ['SPELL_INSTANT', {discard_cards: mediocre.slice(0, 2)}];
  if (oppScore - myScore > 15 && mediocre.length >= 1 && deckLeft > 3)
    return ['SPELL_INSTANT', {discard_cards: mediocre.slice(0, Math.min(2, mediocre.length))}];
  return null;
}

function decideSacrifice(ai, opp, room){
  const pad = ai.scorepad;
  const myS = totalScore(ai), oppS = totalScore(opp);
  if (oppS - myS < 12) return null;
  const candidates = [];
  for (const cfg of SCOREPAD_CONFIG){
    const info = pad[cfg.key];
    for (let i=0;i<info.scores.length;i++) candidates.push([cfg.key, i, info.scores[i]]);
  }
  if (!candidates.length) return null;
  candidates.sort((a,b) => a[2] - b[2]);
  const [slotKey, scoreIdx, lost] = candidates[0];
  const window = room._sacrificeWindow();
  if (window.length < 2) return null;
  const hand = ai.hand;
  const ratedRecovery = window.map(([idx,c]) => [idx, c, cardValue(c, hand.concat([c]), room, AI_IDX)]);
  ratedRecovery.sort((a,b) => b[2] - a[2]);
  if (ratedRecovery[0][2] < 15) return null;
  const lowValHand = hand.filter(c => cardValue(c, hand, room, AI_IDX) < 20).length;
  const x = Math.min(C.SACRIFICE_MAX_X, ratedRecovery.length, lowValHand);
  if (x < 1) return null;
  const recoverIndices = ratedRecovery.slice(0, x).map(r => r[0]);
  const ratedDiscard = [...hand].sort((a,b) => cardValue(a, hand, room, AI_IDX) - cardValue(b, hand, room, AI_IDX));
  const discardCards = ratedDiscard.slice(0, x);
  const recoveryValue = ratedRecovery.slice(0, x).reduce((a,b) => a + b[2], 0);
  if (recoveryValue < lost + 12) return null;
  return ['SPELL_SACRIFICE', {slot_key: slotKey, score_idx: scoreIdx, discard_cards: discardCards, recover_indices: recoverIndices}];
}

function decideEndDiscard(ai, room){
  const hand = ai.hand;
  const overflow = handOverflow(hand);
  if (overflow <= 0) return null;
  const rated = [...hand].sort((a,b) => cardValue(a, hand, room, AI_IDX) - cardValue(b, hand, room, AI_IDX));
  return ['END_DISCARD', {cards: rated.slice(0, overflow)}];
}

function decideColPreDiscard(ai, opp, room){
  const hand = ai.hand;
  const must = room._colMustDiscard(AI_IDX);
  if (must > 0){
    const rated = [...hand].sort((a,b) => cardValue(a, hand, room, AI_IDX) - cardValue(b, hand, room, AI_IDX));
    return ['COLLISION_PRE_DISCARD', {cards: rated.slice(0, must)}];
  }
  const ct = counter(hand.filter(c => c !== '瞬'));
  const weak = hand.filter(c => (c === 'E' || c === 'F') && c !== '瞬');
  const orphan = weak.filter(c => ct[c] === 1 && BV[c] <= 2);
  if (hand.length >= 6){
    const dOrphans = hand.filter(c => c === 'D' && (ct['D']||0) === 1);
    for (const d of dOrphans) orphan.push(d);
  }
  if (orphan.length >= 2) return ['COLLISION_PRE_DISCARD', {cards: orphan.slice(0, 2)}];
  if (orphan.length === 1) return ['COLLISION_PRE_DISCARD', {cards: orphan.slice(0, 1)}];
  return ['COLLISION_PRE_DISCARD', {cards: []}];
}

function decideColArrange(ai){
  const hand = [...ai.hand];
  if (hand.length <= 1) return ['COLLISION_ARRANGE', {order: hand}];
  const shunCards = hand.filter(c => c === '瞬');
  const nonShun = hand.filter(c => c !== '瞬');
  nonShun.sort((a,b) => RANK[a] - RANK[b]);
  const n = hand.length;
  if (n <= 2){
    nonShun.sort((a,b) => RANK[b] - RANK[a]);
    const order = shunCards.concat(nonShun);
    if (order.sort().join('') !== [...hand].sort().join('')) return ['COLLISION_ARRANGE', {order: hand}];
    return ['COLLISION_ARRANGE', {order: shunCards.concat(nonShun)}];
  }
  const strong = [], weak = [];
  for (const c of nonShun){
    if (BV[c] >= 4) strong.push(c);
    else weak.push(c);
  }
  strong.sort((a,b) => RANK[a] - RANK[b]);
  weak.sort((a,b) => RANK[b] - RANK[a]);
  let order;
  if (shunCards.length >= 2){
    order = [...shunCards, ...strong, ...weak];
  } else if (shunCards.length === 1){
    order = [...shunCards, ...strong, ...weak];
  } else {
    order = [];
    let si = 0, wi = 0;
    for (let pos = 0; pos < n; pos++){
      if (pos % 2 === 0 && wi < weak.length) order.push(weak[wi++]);
      else if (si < strong.length) order.push(strong[si++]);
      else if (wi < weak.length) order.push(weak[wi++]);
      else if (si < strong.length) order.push(strong[si++]);
    }
    const remainS = strong.slice(si);
    const remainW = weak.slice(wi);
    order = order.concat(remainS, remainW);
  }
  const sortedOrder = [...order].sort().join('');
  const sortedHand = [...hand].sort().join('');
  if (sortedOrder !== sortedHand) order = [...hand];
  return ['COLLISION_ARRANGE', {order}];
}

function decideColBet(ai, opp, room){
  if (room.col_bet_phase === 'CALLER' && room.col_bet_caller !== AI_IDX) return null;
  if (room.col_bet_phase === 'RESPONDER' && room.col_bet_caller === AI_IDX) return null;
  const myScore = totalScore(ai), oppScore = totalScore(opp);
  const diff = myScore - oppScore;
  let myStrength = 0;
  for (const c of ai.hand) if (c !== '瞬') myStrength += BV[c];
  const myHandCount = Math.max(1, ai.hand.length);
  const oppHandCount = Math.max(1, opp.hand.length);
  const shunCount = ai.hand.filter(c => c === '瞬').length;
  const highCards = ai.hand.filter(c => c === 'A' || c === 'B' || c === 'C').length;
  const avgMyBV = myStrength / myHandCount;
  const oppDist = _brain.oppHandDistribution(room, AI_IDX);
  let oppExpectedStrength = 0;
  for (const c in oppDist) oppExpectedStrength += oppDist[c] * (BV[c]||0);
  const oppAvgBV = oppHandCount > 0 ? oppExpectedStrength / oppHandCount : 2.5;
  const strengthAdv = avgMyBV - oppAvgBV;
  const cardAdv = myHandCount - oppHandCount;
  if (room.col_bet_phase === 'CALLER'){
    if (strengthAdv > 1.0 && highCards >= 2) return ['COLLISION_BET', {amount: 20}];
    if (diff < -20 && (strengthAdv > 0.5 || shunCount >= 2)) return ['COLLISION_BET', {amount: 20}];
    if (strengthAdv > 0.3 || cardAdv >= 2) return ['COLLISION_BET', {amount: 10}];
    if (diff < -10) return ['COLLISION_BET', {amount: 10}];
    if (shunCount >= 1 && highCards >= 1) return ['COLLISION_BET', {amount: 10}];
    return ['COLLISION_BET', {amount: 0}];
  }
  const bet = room.col_bet_amount;
  if (strengthAdv > 0.5 || highCards >= 2) return ['COLLISION_BET', {choice: 'follow'}];
  if (diff < -15) return ['COLLISION_BET', {choice: 'follow'}];
  if (bet <= 10 && (strengthAdv > -0.5 || shunCount >= 1)) return ['COLLISION_BET', {choice: 'follow'}];
  if (strengthAdv < -1.0 && diff > 10) return ['COLLISION_BET', {choice: 'fold'}];
  return ['COLLISION_BET', {choice: 'follow'}];
}

const DELAY = {
  BLUFF_DECLARE:[400,800],
  PROPHET_WHISPER:[500,900], PROPHET_DECK:[300,500], RED_BID:[600,1000],
  DRAW_ACK:[150,300], MARKET_BUY:[400,700], MARKET_SKIP:[150,300],
  AMBUSH_DECIDE:[300,500], AMBUSH_PAY_COST:[250,400], AMBUSH_ATK_SELECT:[300,500],
  AMBUSH_DEFEND:[300,550], AMBUSH_CANCEL:[150,250],
  SPELL_SCORE:[350,650], SPELL_INSTANT:[300,500], SPELL_SACRIFICE:[400,700],
  SPELL_BREAKER:[300,500], SPELL_SKIP:[150,300],
  END_DISCARD:[200,350], LOCKDOWN_PLACE:[350,600], LOCKDOWN_SKIP:[150,300],
  COLLISION_PRE_DISCARD:[300,500], COLLISION_BET:[400,700], COLLISION_ARRANGE:[400,700], COLLISION_FLIP:[150,300],
};
function getDelay(action){
  const r = DELAY[action] || [300, 600];
  return r[0] + Math.random() * (r[1] - r[0]);
}

// ════════════════════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════════════════════
global.OfflineEngine = {
  GameRoom,
  decide,
  setAIIdx,
  getDelay,
  CARD_CONFIG,
  CARD_ORDER,
  C,
  totalScore,
};

})(typeof window !== 'undefined' ? window : globalThis);
