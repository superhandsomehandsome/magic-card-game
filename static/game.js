/* 秘术对决：禁忌魔典 V5.0 黑市博弈版 — Client */

const TIER_CLASS = {A:'tier-A',B:'tier-B',C:'tier-C',D:'tier-D',E:'tier-E',F:'tier-F','瞬':'tier-inst'};
const CARD_SYM  = {A:'♠',B:'♦',C:'♣',D:'◆',E:'○',F:'△','瞬':'⚡'};
const CARD_SUB  = {A:'圣物',B:'元素',C:'中坚',D:'基础',E:'低阶',F:'杂鱼','瞬':'瞬'};
const CARD_BV   = {A:6,B:5,C:4,D:3,E:2,F:1,'瞬':0};

const SCOREPAD_CFG = [
  {key:'dragon_breath',name:'龙之吐息 (五条)',max:1,tier:1,color:'red'},
  {key:'arcane_sequence',name:'奥术序列 (大顺)',max:1,tier:1,color:'red'},
  {key:'elemental_surge',name:'元素激流 (小顺)',max:2,tier:2,color:'blue'},
  {key:'chaos_alchemy',name:'混沌炼金 (葫芦)',max:2,tier:2,color:'blue'},
  {key:'triple_resonance',name:'三重共鸣 (三条)',max:2,tier:3,color:'green'},
  {key:'ant_colony',name:'以量取胜 (蚁群)',max:2,tier:3,color:'green'},
];
const TIER_CLS = {1:'t1',2:'t2',3:'t3'};
const RED_KEYS = new Set(['dragon_breath','arcane_sequence']);

/* State */
let socket = null;
let roomId = null;
let myIdx = -1;
let state = null;
let prevState = null;
let selectedCards = [];
let timerInterval = null;
let prevHandStr = '';
let isAIRoom = false;

/* UI sub-state */
let uiMode = null;  // null | 'instant' | 'ambush_pay_cost' | 'sacrifice' | 'breaker' | 'market' | 'lockdown'
let sacState = null;  // { step: 'slot'|'discard'|'recover', slot_key, score_idx, discard, recover }
let marketState = null;  // { selectedMarketIdx }
let pendingLockedCombo = null;  // { cards, combo_key, score, lock_card }

/* Socket */
function initSocket() {
  socket = io();
  socket.on('connected', () => tryAutoReconnect());
  socket.on('room_created', d => {
    roomId = d.room_id; myIdx = d.player_idx;
    saveSession();
    if (!isAIRoom) showWaiting();
  });
  socket.on('room_joined', d => {
    roomId = d.room_id; myIdx = d.player_idx;
    saveSession();
  });
  socket.on('state', onState);
  socket.on('error', d => showToast(d.msg));
  socket.on('action_error', d => showToast(d.msg));
  socket.on('reconnect_fail', d => {
    clearSession(); showScreen('lobby');
    showToast('上一个房间已失效，请重新创建');
  });
  socket.on('opponent_away', d => showOverlay(`${d.name} 断线了`, `等待重连中... (${d.grace}秒后判定胜利)`));
  socket.on('opponent_back', d => { hideOverlay(); showToast(`${d.name} 已重连`); });
  socket.on('left_room', () => { clearSession(); location.reload(); });
}

function saveSession() {
  if (roomId !== null && myIdx >= 0)
    localStorage.setItem('mg_room', JSON.stringify({roomId, myIdx, ts: Date.now()}));
}
function clearSession() {
  roomId = null; myIdx = -1;
  localStorage.removeItem('mg_room');
}
function tryAutoReconnect() {
  const raw = localStorage.getItem('mg_room');
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    if (Date.now() - s.ts > 600000) { clearSession(); return; }
    socket.emit('reconnect_room', {room_id: s.roomId, player_idx: s.myIdx});
  } catch(e) { clearSession(); }
}

function createRoom() {
  const name = document.getElementById('playerName').value.trim() || '炼金术士';
  socket.emit('create_room', {name});
}
function createAIRoom() {
  const name = document.getElementById('playerName').value.trim() || '炼金术士';
  isAIRoom = true;
  socket.emit('create_ai_room', {name});
}
function joinRoom() {
  const name = document.getElementById('playerName').value.trim() || '占星师';
  const rid = document.getElementById('roomInput').value.trim();
  if (!/^\d{4}$/.test(rid)) { showToast('请输入 4 位房间号'); return; }
  socket.emit('join_room', {room_id: rid, name});
}
function sendAction(action, data={}) {
  socket.emit('action', {room_id: roomId, action, data});
}

/* Screens */
function showScreen(id) {
  ['lobby','waitingScreen','gameBoard','gameOver'].forEach(s =>
    document.getElementById(s).classList.toggle('hidden', s !== id));
}
function showWaiting() {
  document.getElementById('displayRoomCode').textContent = roomId;
  showScreen('waitingScreen');
}

/* State handler */
function onState(s) {
  prevState = state;
  state = s;
  selectedCards = [];
  // reset ui modes on most transitions
  if (!prevState || prevState.phase !== s.phase) {
    uiMode = null;
    sacState = null;
    marketState = null;
    pendingLockedCombo = null;
  }

  hideOverlay();
  if (s.phase === 'GAME_OVER') { renderGameOver(); return; }
  showScreen('gameBoard');
  tryAutoPlayBGM();
  const board = document.getElementById('gameBoard');
  if (s.is_ai_game) board.classList.add('vs-zero'); else board.classList.remove('vs-zero');

  const newHandStr = (s.my_hand || []).join(',');
  const handChanged = newHandStr !== prevHandStr;
  prevHandStr = newHandStr;

  renderOppZone();
  renderMyZone(handChanged && s.phase === 'DRAW' && s.is_my_turn);
  renderArena();
  startTimer();

  // Auto-ack DRAW after brief animation
  if (s.phase === 'DRAW' && s.is_my_turn) {
    setTimeout(() => {
      if (state && state.phase === 'DRAW' && state.is_my_turn) sendAction('DRAW_ACK');
    }, 900);
  }
}

/* Card HTML */
function cardHTML(card, opts={}) {
  if (opts.faceDown) {
    const cls = 'cd cd-back' + (opts.small ? ' cd-sm' : '');
    return `<div class="${cls}"><span class="lt">☽</span></div>`;
  }
  const tier = TIER_CLASS[card] || 'tier-F';
  const sym = CARD_SYM[card] || '△';
  const sub = CARD_SUB[card] || '?';
  const bv = CARD_BV[card] ?? 0;
  let cls = `cd ${tier}` + (opts.small ? ' cd-sm' : '') + (opts.raised ? ' cd-raised' : '') +
    (opts.dim ? ' cd-dim' : '') + (opts.selectable ? ' selectable' : '') +
    (opts.extraClass ? ` ${opts.extraClass}` : '');
  return `<div class="${cls}" ${opts.onclick||''}>` +
    `<span class="sy">${sym}</span><span class="lt">${card}</span>` +
    `<span class="st">${sub}</span><span class="vl">${bv}</span></div>`;
}

/* Scorepad chips */
function padChipsHTML(pad, sharedRed, viewerIsOwner) {
  let h = '<div class="sp-inline">';
  for (const cfg of SCOREPAD_CFG) {
    const info = pad[cfg.key];
    const tc = TIER_CLS[cfg.tier] || 't3';
    let slots = '';
    for (const s of info.scores) slots += `<span class="sp-val">${s}</span> `;
    for (let i = 0; i < info.sealed; i++) slots += '<span class="sp-lk">✦</span> ';
    let rem = info.max_slots - info.scores.length - info.sealed;
    // For shared red: if taken by other player, show locked instead of remaining
    let sharedLocked = false;
    if (RED_KEYS.has(cfg.key) && sharedRed) {
      const owner = sharedRed[cfg.key];
      if (owner !== -1 && info.scores.length === 0) {
        sharedLocked = true;
        rem = 0;
      }
    }
    if (sharedLocked) slots += '<span class="sp-shared-locked" title="已被对手占用">⊗</span> ';
    for (let i = 0; i < rem; i++) slots += '☐ ';
    const short = cfg.name.split('(')[0].trim();
    h += `<span class="sp-chip ${tc}${sharedLocked ? ' sp-locked' : ''}">${short} ${slots}</span>`;
  }
  return h + '</div>';
}

/* Player bars */
function playerBarHTML(name, score, winScore, handCount, pad, isActive, breaker, deckCount, discardCount, sharedRed, curse) {
  const icon = name.includes('炼金') ? '🧙' : '🔮';
  const actCls = isActive ? ' active' : '';
  let stat = `手牌 ${handCount}`;
  if (breaker > 0) stat += ` · 破法×${breaker}`;
  if (curse) stat += ' · 🕯诅咒';
  if (deckCount !== undefined) stat += ` · 牌库${deckCount} · 弃牌${discardCount}`;
  return `<div class="pbar">` +
    `<div class="avatar${actCls}">${icon}</div>` +
    `<div><div class="pname">${name}${isActive ? ' ◄' : ''}</div>` +
    `<div class="pstat">${stat}</div>${padChipsHTML(pad, sharedRed, false)}</div>` +
    `<div class="pscore">${score} / ${winScore}</div></div>`;
}

/* Zones */
function renderOppZone() {
  const s = state;
  const el = document.getElementById('oppZone');
  if (s.is_ai_game) { el.innerHTML = renderZeroZone(s); return; }
  let h = playerBarHTML(s.opp_name, s.opp_score, s.win_score, s.opp_hand_count,
    s.opp_pad, !s.is_my_turn, 0, undefined, undefined, s.shared_red, s.opp_curse);
  h += '<div class="cards-row">';
  for (let i = 0; i < s.opp_hand_count; i++) h += cardHTML('?', {faceDown:true, small:true});
  h += '</div>';
  el.innerHTML = h;
}

function renderZeroZone(s) {
  const actCls = !s.is_my_turn ? ' active' : '';
  let stat = `${s.opp_hand_count}`;
  let h = `<div class="pbar-zero">`;
  h += `<div class="zero-totem${actCls}"></div>`;
  h += `<div><div class="pname">零</div>`;
  h += `<div class="pstat">手牌 ${stat}${s.opp_curse ? ' · 🕯' : ''}</div>`;
  h += zeroPadHTML(s.opp_pad, s.shared_red);
  h += `</div>`;
  h += `<div class="pscore">${s.opp_score} / ${s.win_score}</div></div>`;
  h += '<div class="cards-row">';
  for (let i = 0; i < s.opp_hand_count; i++) {
    h += `<div class="cd cd-sm cd-zero-back"><span class="lt"></span></div>`;
  }
  h += '</div>';
  return h;
}

function zeroPadHTML(pad, sharedRed) {
  let h = '<div class="sp-inline sp-zero">';
  for (const cfg of SCOREPAD_CFG) {
    const info = pad[cfg.key];
    let slots = '';
    for (const s of info.scores) slots += `<span class="sp-val">${s}</span> `;
    for (let i = 0; i < info.sealed; i++) slots += '<span class="sp-lk">✦</span> ';
    let rem = info.max_slots - info.scores.length - info.sealed;
    let locked = false;
    if (RED_KEYS.has(cfg.key) && sharedRed && sharedRed[cfg.key] !== -1 && info.scores.length === 0) {
      locked = true; rem = 0;
      slots += '<span class="sp-shared-locked">⊗</span> ';
    }
    for (let i = 0; i < rem; i++) slots += '☐ ';
    const short = cfg.name.split('(')[0].trim();
    h += `<span class="sp-chip${locked ? ' sp-locked' : ''}">${short} ${slots}</span>`;
  }
  return h + '</div>';
}

function renderMyZone(animateDraw) {
  const s = state;
  const el = document.getElementById('myZone');
  let h = playerBarHTML(s.my_name, s.my_score, s.win_score, s.my_hand.length,
    s.my_pad, s.is_my_turn, s.my_breaker, s.deck_count, s.discard_count, s.shared_red, s.my_curse);
  h += renderMyHand(animateDraw);
  el.innerHTML = h;
}

function renderMyHand(animateDraw) {
  const s = state;
  const selectable = needsCardSelection();
  let h = '<div class="cards-row">';
  for (let i = 0; i < s.my_hand.length; i++) {
    const c = s.my_hand[i];
    const raised = selectedCards.includes(i);
    const canSelect = selectable && canSelectCard(c, i);
    const anim = animateDraw ? 'anim-draw' : '';
    h += cardHTML(c, {
      raised, selectable: canSelect, extraClass: anim,
      onclick: canSelect ? `onclick="toggleCard(${i})"` : ''
    });
  }
  h += '</div>';
  return h;
}

function needsCardSelection() {
  const p = state.phase;
  // Defender selection on AMBUSH_DEF_CHOICE
  if (p === 'AMBUSH_DEF_CHOICE' && !state.is_my_turn) return true;
  if (p === 'AMBUSH_ATK_SELECT' && state.is_my_turn) return true;
  if (p === 'AMBUSH_PAY_COST' && state.is_my_turn) return true;
  if (p === 'SPELL' && state.is_my_turn) return true;
  if (p === 'END_DISCARD' && state.is_my_turn) return true;
  if (p === 'LOCKDOWN_PLACE' && state.is_my_turn) return true;
  if (p === 'MARKET' && state.is_my_turn && uiMode === 'market') return true;
  if (p === 'COLLISION_PRE_DISCARD') return true;
  if (p === 'RED_BID' && !state.red_bid_done_me) return true;
  return false;
}

function canSelectCard(card, idx) {
  const p = state.phase;
  if (p === 'AMBUSH_ATK_SELECT') return card !== '瞬';
  if (p === 'AMBUSH_DEF_CHOICE') return true;
  if (p === 'AMBUSH_PAY_COST') return true;
  if (p === 'RED_BID') return true;
  if (p === 'SPELL') {
    if (uiMode === 'instant') return card !== '瞬';
    if (uiMode === 'sacrifice' && sacState && sacState.step === 'discard') return true;
    return card !== '瞬';
  }
  if (p === 'MARKET' && uiMode === 'market') return true;
  if (p === 'END_DISCARD') return true;
  if (p === 'LOCKDOWN_PLACE') return card !== '瞬';
  if (p === 'COLLISION_PRE_DISCARD') return true;
  return false;
}

function toggleCard(idx) {
  const p = state.phase;
  const single = (p === 'AMBUSH_ATK_SELECT' || p === 'AMBUSH_DEF_CHOICE');
  if (single) {
    selectedCards = selectedCards.includes(idx) ? [] : [idx];
  } else {
    if (selectedCards.includes(idx)) selectedCards = selectedCards.filter(i => i !== idx);
    else selectedCards.push(idx);
  }
  renderMyZone(false);
  renderArena();
}

/* Timer */
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updateTimerDisplay, 500);
}
function getTimeLeft() {
  if (!state || !state.turn_deadline) return -1;
  return Math.max(0, Math.ceil(state.turn_deadline - Date.now()/1000));
}
function updateTimerDisplay() {
  const el = document.getElementById('timerDisplay');
  if (!el) return;
  const left = getTimeLeft();
  if (left < 0) { el.textContent = ''; return; }
  const cls = left <= 10 ? 'timer-urgent' : '';
  el.innerHTML = `<span class="${cls}">${left}s</span>`;
}

/* Top controls */
function renderTopControls() {
  return `<div class="top-controls">
    <button class="btn btn-sm" onclick="confirmLeave()">退出</button>
    <button class="btn btn-sm btn-danger" onclick="confirmSurrender()">投降</button>
  </div>`;
}
function confirmSurrender() {
  showOverlay('确定投降？', '投降后对手将直接获胜',
    `<div class="action-bar"><button class="btn btn-danger" onclick="doSurrender()">确定投降</button>` +
    `<button class="btn" onclick="hideOverlay()">取消</button></div>`);
}
function doSurrender() { hideOverlay(); const rid = roomId; clearSession(); socket.emit('surrender', {room_id: rid}); }
function confirmLeave() {
  showOverlay('退出房间？', '退出后对手将直接获胜',
    `<div class="action-bar"><button class="btn btn-danger" onclick="doLeave()">确定退出</button>` +
    `<button class="btn" onclick="hideOverlay()">取消</button></div>`);
}
function doLeave() { hideOverlay(); const rid = roomId; clearSession(); socket.emit('leave_game', {room_id: rid}); }

/* Overlay */
function showOverlay(title, msg, buttonsHTML) {
  let el = document.getElementById('overlay');
  if (!el) { el = document.createElement('div'); el.id = 'overlay'; document.body.appendChild(el); }
  el.className = 'overlay';
  el.innerHTML = `<div class="overlay-box"><h2>${title}</h2><p>${msg}</p>${buttonsHTML||''}</div>`;
}
function hideOverlay() {
  const el = document.getElementById('overlay');
  if (el) el.remove();
}

/* Arena */
function renderArena() {
  const s = state;
  const el = document.getElementById('arenaZone');
  let h = renderTopControls();
  h += `<div class="phase-bar">${phaseLabel(s.phase)} — 回合 ${s.turn_number}` +
       ` <span class="timer-bar" id="timerDisplay"></span></div>`;
  if (s.turn_number < (s.no_ambush_before || 0) && s.phase !== 'GAME_OVER') {
    h += `<div class="phase-bar" style="border-color:#5D4A8C;background:rgba(93,74,140,.1)">【蓄力期】前 ${s.no_ambush_before - 1} 回合不能发起突袭</div>`;
  }
  if (s.deck_low) {
    h += `<div class="deck-warning">⚠ 牌库仅剩 ${s.deck_count} 张 — 终局将至！</div>`;
  }
  h += renderLog();
  h += renderAmbushOutcome();

  // V5: Always render market panel above phase content
  h += renderMarketPanel();
  // V5: Show opponent's lockdown banner
  h += renderLockdownBanner();

  switch (s.phase) {
    case 'DRAW': h += renderDraw(); break;
    case 'MARKET': h += renderMarketPhase(); break;
    case 'AMBUSH_DECIDE': h += renderAmbushDecide(); break;
    case 'AMBUSH_PAY_COST': h += renderAmbushPayCost(); break;
    case 'AMBUSH_ATK_SELECT': h += renderAmbushAtkSelect(); break;
    case 'AMBUSH_BLUFF_DECLARE': h += renderBluffDeclare(); break;
    case 'AMBUSH_BLUFF_RESPOND': h += renderBluffRespond(); break;
    case 'AMBUSH_DEF_CHOICE': h += renderAmbushDefChoice(); break;
    case 'SPELL': h += renderSpell(); break;
    case 'PROPHET_DECK': h += renderProphetDeck(); break;
    case 'RED_BID': h += renderRedBid(); break;
    case 'END_DISCARD': h += renderEndDiscard(); break;
    case 'LOCKDOWN_PLACE': h += renderLockdownPlace(); break;
    case 'COLLISION_PRE_DISCARD': h += renderColPreDiscard(); break;
    case 'COLLISION_BET': h += renderColBet(); break;
    case 'COLLISION_FLIP': h += renderColFlip(); break;
    default: h += `<div class="text-center text-muted">等待中...</div>`;
  }
  el.innerHTML = h;
}

function phaseLabel(p) {
  const m = {
    DRAW:'壹 · 汲取',
    MARKET:'壹 · 黑市',
    AMBUSH_DECIDE:'贰 · 突袭',
    AMBUSH_PAY_COST:'贰 · 明弃代价',
    AMBUSH_ATK_SELECT:'贰 · 暗扣出牌',
    AMBUSH_BLUFF_DECLARE:'贰 · 虚实之言',
    AMBUSH_BLUFF_RESPOND:'贰 · 拆穿 or 相信',
    AMBUSH_DEF_CHOICE:'贰 · 迎战 / 怯战',
    SPELL:'叁 · 咏唱',
    PROPHET_DECK:'叁 · 先知选择',
    RED_BID:'叁 · 红区暗标',
    END_DISCARD:'肆 · 弃牌',
    LOCKDOWN_PLACE:'肆 · 明牌封锁',
    COLLISION_PRE_DISCARD:'终局 · 对撞前弃牌',
    COLLISION_BET:'终局 · 对撞赌注',
    COLLISION_FLIP:'终局 · 对撞翻牌',
  };
  return m[p] || p;
}

function renderLog() {
  if (!state.log || !state.log.length) return '';
  let h = '<div class="game-log">';
  for (const e of state.log) h += `<div class="log-entry">${e.msg}</div>`;
  return h + '</div>';
}

function renderAmbushOutcome() {
  // Show last ambush outcome briefly at top of arena (during AMBUSH_DECIDE or SPELL)
  const o = state.ambush_last_outcome;
  if (!o) return '';
  const p = state.phase;
  if (!(p === 'AMBUSH_DECIDE' || p === 'SPELL')) return '';
  let label = '';
  if (o.outcome === 'fold') label = `【上次突袭】${o.atk} × 对手怯战 — 窃取 ${o.stole} 张`;
  else if (o.outcome === 'shun_absorb') label = `【上次突袭】${o.atk} 被「瞬」吸收 — 强制平局`;
  else if (o.outcome === 'win') label = `【上次突袭】${o.atk} > ${o.def} — 攻击方胜 · 抽${o.drew}偷${o.stole}`;
  else if (o.outcome === 'lose') label = `【上次突袭】${o.atk} < ${o.def} — 防守方胜 · 抽${o.drew}偷${o.stole}`;
  else if (o.outcome === 'tie') label = `【上次突袭】${o.atk} = ${o.def} — 平局`;
  else if (o.outcome === 'auto_win') label = `【上次突袭】${o.atk} 自动胜利（对手无牌）`;
  else if (o.outcome === 'bluff_true') label = `【虚实之言】声明 [${o.declared}] 属实！[${o.atk}] 弃置 · 防守方 -15 · 攻击方抽${o.drew||0}`;
  else if (o.outcome === 'bluff_false') label = `【虚实之言】声明 [${o.declared}] 虚假！[${o.atk}] 入防守方手 · 攻击方 -15 · 防守方抽${o.drew||0}`;
  return `<div class="ambush-outcome">${label}</div>`;
}

/* ── V5: Market panel (always visible above phase content) ── */
function renderMarketPanel() {
  const s = state;
  const market = s.market || [];
  if (!market.length) {
    return `<div class="market-panel market-empty"><span class="market-title">⚖ 黑市</span><span class="text-muted">（空）</span></div>`;
  }
  const dark = s.market_dark;
  let h = `<div class="market-panel${dark ? ' market-dark' : ''}">`;
  h += `<div class="market-title">⚖ 黑市${dark ? ' · 暗市夜' : ''}</div>`;
  h += `<div class="market-cards">`;
  for (let i = 0; i < market.length; i++) {
    const c = market[i];
    if (dark) {
      h += `<div class="cd cd-sm cd-back market-card"><span class="lt">？</span></div>`;
    } else {
      h += cardHTML(c, {small:true, extraClass:'market-card'});
    }
  }
  h += `</div></div>`;
  return h;
}

function renderLockdownBanner() {
  const s = state;
  let h = '';
  if (s.opp_lockdown) {
    h += `<div class="lockdown-banner lockdown-against">🔒 对手封锁了 [${s.opp_lockdown}] — 含此等级的组合本回合被禁`;
    if (s.opp_lockdown_debt > 0) h += `（对手魔力债 ${s.opp_lockdown_debt}）`;
    h += `</div>`;
  }
  if (s.my_lockdown) {
    h += `<div class="lockdown-banner lockdown-mine">🔒 我已布置封锁牌 [${s.my_lockdown}]（对手下回合受限）</div>`;
  }
  if (s.my_lockdown_debt > 0) {
    h += `<div class="lockdown-banner lockdown-debt">⚠ 我背负魔力债 ${s.my_lockdown_debt} — 下次计分优先扣除</div>`;
  }
  return h;
}

/* ── V5: Market Phase ──────────────────────────────── */
function renderMarketPhase() {
  const s = state;
  if (!s.is_my_turn) return '<div class="text-center text-muted">对手正在交易黑市...</div>';
  if (s.market_buy_done_me) {
    // already bought, just show skip
    return `<div class="text-center"><p class="text-muted">本回合已购买 · 进入下一阶段</p>
      <div class="action-bar"><button class="btn btn-success" onclick="sendAction('MARKET_SKIP')">继续</button></div></div>`;
  }
  if (uiMode === 'market') return renderMarketBuy();

  let h = '<div class="text-center">';
  h += `<p style="color:#D4AF37">壹 · 黑市${s.market_dark ? '（暗市夜 · 盲买）' : ''}</p>`;
  h += `<p class="text-muted" style="font-size:.85rem">点击商品开始购买，或跳过进入下一阶段。</p>`;
  if ((s.market || []).length === 0) {
    h += `<p class="text-muted">黑市无商品 · </p>`;
    h += `<div class="action-bar"><button class="btn btn-success" onclick="sendAction('MARKET_SKIP')">跳过</button></div>`;
    return h + '</div>';
  }
  h += '<div class="market-buy-grid">';
  for (let i = 0; i < s.market.length; i++) {
    const c = s.market[i];
    const v = (c === '瞬' ? 5 : CARD_BV[c]);
    if (s.market_dark) {
      h += `<div class="market-buy-slot" onclick="enterMarketBuy(${i})"><div class="cd cd-back"><span class="lt">？</span></div><div class="market-price">价 ?</div></div>`;
    } else {
      h += `<div class="market-buy-slot" onclick="enterMarketBuy(${i})">${cardHTML(c)}<div class="market-price">价 ${v}</div></div>`;
    }
  }
  h += '</div>';
  h += '<div class="action-bar"><button class="btn" onclick="sendAction(\'MARKET_SKIP\')">跳过黑市</button></div>';
  return h + '</div>';
}

function enterMarketBuy(idx) {
  uiMode = 'market';
  marketState = {selectedMarketIdx: idx};
  selectedCards = [];
  renderArena();
  renderMyZone(false);
}

function renderMarketBuy() {
  const s = state;
  const idx = marketState.selectedMarketIdx;
  const target = s.market[idx];
  const targetV = (target === '瞬' ? 5 : CARD_BV[target]);
  const sumVal = selectedCards.reduce((acc, i) => {
    const c = s.my_hand[i];
    return acc + (c === '瞬' ? 5 : CARD_BV[c]);
  }, 0);
  let h = `<div class="market-buy-confirm">`;
  if (s.market_dark) {
    h += `<p style="color:#D4AF37">暗市夜盲买 · 选择支付牌（按估值挑选）</p>`;
    h += `<p class="text-muted">已付 ${sumVal} 总值（暗市无显价）</p>`;
  } else {
    h += `<p style="color:#D4AF37">购买 ${target} · 需 ≥ ${targetV} 总基础值</p>`;
    h += `<p class="text-muted">已选 ${selectedCards.length} 张 · 总值 ${sumVal}/${targetV}</p>`;
  }
  h += '<div class="action-bar">';
  if (s.market_dark ? selectedCards.length > 0 : sumVal >= targetV) {
    const payment = selectedCards.map(i => s.my_hand[i]);
    h += `<button class="btn btn-success" onclick="confirmMarketBuy(${JSON.stringify(payment).replace(/"/g,'&quot;')})">确认购买</button>`;
  }
  h += `<button class="btn" onclick="exitUIMode()">取消</button>`;
  return h + '</div></div>';
}

function confirmMarketBuy(payment) {
  const idx = marketState.selectedMarketIdx;
  uiMode = null; marketState = null; selectedCards = [];
  sendAction('MARKET_BUY', {market_idx: idx, payment: payment});
}

/* ── V5: Lockdown Place ────────────────────────────── */
function renderLockdownPlace() {
  const s = state;
  if (!s.is_my_turn) return '<div class="text-center text-muted">对手正在布置封锁...</div>';
  let h = '<div class="text-center">';
  h += `<p style="color:#9B0000;font-size:1.05rem">肆 · 明牌封锁（可选）</p>`;
  h += `<p class="text-muted" style="font-size:.85rem">选 1 张牌摆在自己场上 → 对手下回合任何含该等级的组合都被禁。<br>对手可花 ${s.lockdown_break_cost} 分（鲜血破拆）或 1 枚破法者标记解除。下回合开始时该牌入弃牌堆。</p>`;
  h += '<div class="action-bar">';
  if (selectedCards.length === 1) {
    const card = state.my_hand[selectedCards[0]];
    h += `<button class="btn btn-danger" onclick="sendAction('LOCKDOWN_PLACE',{card:'${card}'})">封锁 [${card}]</button>`;
  }
  h += `<button class="btn" onclick="sendAction('LOCKDOWN_SKIP')">跳过封锁</button>`;
  return h + '</div></div>';
}

/* ── Phase: Draw (auto-animation) ──────────────────── */
function renderDraw() {
  const s = state;
  if (!s.is_my_turn) return '<div class="text-center text-muted">对手正在汲取魔力...</div>';
  const n = (s.drawn_cards || []).length;
  const mark = s.draw_was_overdraft ? '（透支仅抽 1）' : '';
  let h = `<div class="text-center"><p style="color:#D4AF37">汲取魔力 — 获得 ${n} 张新牌 ${mark}</p>`;
  h += '<div class="cards-row">';
  for (const c of (s.drawn_cards || [])) h += cardHTML(c, {extraClass:'anim-draw'});
  h += '</div></div>';
  return h;
}

/* ── Phase: Ambush Decide ──────────────────────────── */
function renderAmbushDecide() {
  const s = state;
  if (!s.is_my_turn) return '<div class="text-center text-muted">对手正在抉择突袭...</div>';
  const isSecond = s.ambush_count >= 1;
  let h = '<div class="text-center">';
  if (isSecond) {
    h += `<p style="color:#FF6B6B">第 2 次突袭需明弃 ${s.ambush_second_cost} 张手牌</p>`;
  } else {
    h += `<p class="text-muted">可选择发起突袭或跳过（最多 ${s.ambush_max} 次/回合）</p>`;
  }
  h += '<div class="action-bar">';
  h += `<button class="btn btn-danger" onclick="sendAction('AMBUSH_DECIDE',{choice:'attack'})">${isSecond ? '发起第二次突袭' : '发起突袭'}</button>`;
  h += `<button class="btn" onclick="sendAction('AMBUSH_DECIDE',{choice:'skip'})">${isSecond ? '满足当前战果' : '跳过突袭'}</button>`;
  return h + '</div></div>';
}

/* ── Phase: Ambush Pay Cost (2nd ambush) ───────────── */
function renderAmbushPayCost() {
  const s = state;
  if (!s.is_my_turn) return '<div class="text-center text-muted">对手正在支付代价...</div>';
  const need = s.ambush_second_cost;
  let h = `<div class="text-center"><p style="color:#FF6B6B">明弃 ${need} 张手牌以发起第二次突袭</p>`;
  h += `<p class="text-muted">已选 ${selectedCards.length}/${need}</p>`;
  h += '<div class="action-bar">';
  if (selectedCards.length === need) {
    h += `<button class="btn btn-danger" onclick="doAmbushPayCost()">确认明弃</button>`;
  }
  h += `<button class="btn" onclick="sendAction('AMBUSH_CANCEL')">取消</button>`;
  return h + '</div></div>';
}

/* ── Phase: Ambush Atk Select ──────────────────────── */
function renderAmbushAtkSelect() {
  if (!state.is_my_turn) return '<div class="text-center text-muted">对手正在暗扣...</div>';
  let h = '<div class="text-center"><p class="text-muted">选择一张牌（非瞬）暗扣发起拼点</p><div class="action-bar">';
  if (selectedCards.length === 1) {
    const card = state.my_hand[selectedCards[0]];
    h += `<button class="btn btn-danger" onclick="sendAction('AMBUSH_ATK_SELECT',{card:'${card}'})">确认暗扣</button>`;
  }
  h += `<button class="btn" onclick="sendAction('AMBUSH_CANCEL')">取消</button>`;
  return h + '</div></div>';
}

/* ── Phase: Bluff Declare (attacker declares rank) ─── */
function renderBluffDeclare() {
  const s = state;
  if (!s.is_my_turn) return '<div class="text-center text-muted">对手正在决定是否声明...</div>';
  let h = '<div class="text-center">';
  h += '<p style="color:#D4AF37;font-size:1.05rem">虚实之言 — 可选声明暗扣牌等级</p>';
  h += '<p class="text-muted" style="font-size:.82rem">声明后对手可选择「拆穿」或「相信」。属实被拆穿：对手 -15 分，牌弃置，你抽 1；虚假被识破：你 -15 分，牌归对手，对手抽 1。</p>';
  h += '<div class="action-bar" style="flex-wrap:wrap">';
  for (const r of ['A','B','C','D','E','F']) {
    h += `<button class="btn btn-sm" onclick="sendAction('BLUFF_DECLARE',{declared_rank:'${r}'})">声明 [${r}]</button>`;
  }
  h += `<button class="btn btn-sm" onclick="sendAction('BLUFF_DECLARE',{declared_rank:'none'})">不声明（直接拼点）</button>`;
  h += `<button class="btn btn-sm" onclick="sendAction('AMBUSH_CANCEL')">取消突袭</button>`;
  return h + '</div></div>';
}

/* ── Phase: Bluff Respond (defender calls or believes) */
function renderBluffRespond() {
  const s = state;
  const isDefender = !s.is_my_turn;
  const declared = s.bluff_declared_rank || '？';
  if (!isDefender) return `<div class="text-center text-muted">等待对手决定是否拆穿声明 [${declared}]...</div>`;
  let h = `<div class="defend-alert">对手声明暗扣牌为 [${declared}]</div>`;
  h += '<div class="text-center">';
  h += `<p class="text-muted" style="font-size:.82rem">「拆穿」：若声明虚假 → 对手 -15 分，攻击牌归你，你抽 1 张；若声明属实 → 你 -15 分，攻击牌弃置，对手抽 1 张。</p>`;
  h += '<div class="action-bar">';
  h += `<button class="btn btn-danger" onclick="sendAction('BLUFF_RESPOND',{choice:'call'})">拆穿！Call Bluff</button>`;
  h += `<button class="btn btn-success" onclick="sendAction('BLUFF_RESPOND',{choice:'believe'})">相信，正常迎战</button>`;
  return h + '</div></div>';
}

/* ── Phase: Ambush Defend Choice (Fold or Defend) ──── */
function renderAmbushDefChoice() {
  const isDefender = !state.is_my_turn;
  if (!isDefender) return '<div class="text-center text-muted">对手正在抉择迎战或怯战...</div>';
  let h = '<div class="defend-alert">对手暗扣了一张牌！选择迎战或怯战</div>';
  h += '<div class="text-center">';
  h += '<p class="text-muted" style="font-size:.85rem">怯战：对手偷你 1 张随机牌，但暗扣牌进弃牌堆</p>';
  h += '<p class="text-muted" style="font-size:.85rem">迎战：比点数。胜者抽 1 + 偷对方 1。「瞬」强制吸收为平局。</p>';
  h += '<div class="action-bar">';
  if (selectedCards.length === 1) {
    const card = state.my_hand[selectedCards[0]];
    h += `<button class="btn btn-success" onclick="sendAction('AMBUSH_DEFEND',{choice:'defend',card:'${card}'})">迎战 [${card}]</button>`;
  }
  h += `<button class="btn btn-danger" onclick="sendAction('AMBUSH_DEFEND',{choice:'fold'})">怯战 (Fold)</button>`;
  return h + '</div></div>';
}

/* ── Phase: Spell ──────────────────────────────────── */
function renderSpell() {
  const s = state;
  if (!s.is_my_turn) return '<div class="text-center text-muted">对手正在咏唱...</div>';

  let h = '<div>';
  if (s.my_curse) h += '<div class="text-center" style="color:#C0392B;font-size:.85rem">诅咒生效：下一次计分 −10</div>';

  // Mode overlays
  if (uiMode === 'instant') return h + renderInstantMode() + '</div>';
  if (uiMode === 'sacrifice') return h + renderSacrificeMode() + '</div>';
  if (uiMode === 'breaker') return h + renderBreakerMode() + '</div>';

  // Show prophet peek results
  if (s.prophet_peek) {
    const names = s.prophet_peek.length ? s.prophet_peek.join(', ') : '（无牌可窥）';
    h += `<div style="background:rgba(155,89,182,.2);border:1px solid #9B59B6;border-radius:6px;padding:8px;text-align:center;margin-bottom:8px">`;
    h += `<span style="color:#C792EA;font-size:.85rem">先知低语揭示：${names}</span></div>`;
  }

  h += '<div class="action-bar">';
  if (s.my_breaker > 0) h += `<button class="btn btn-sm" onclick="enterBreakerMode()">破法者 (${s.my_breaker})</button>`;
  if (s.instant_count < s.instant_limit && s.my_hand.includes('瞬'))
    h += `<button class="btn btn-sm" onclick="enterInstantMode()">使用瞬</button>`;
  if ((s.sacrifice_slots || []).length > 0)
    h += `<button class="btn btn-sm btn-danger" onclick="enterSacrificeMode()">黑暗献祭</button>`;
  if (!s.prophet_used_me)
    h += `<button class="btn btn-sm" style="color:#C792EA;border-color:#9B59B6" onclick="showProphetModal()">先知低语 (-${s.prophet_cost||5}分)</button>`;
  h += '</div>';

  h += renderScorepadGrid();

  h += '<div class="action-bar mt-2">';
  if (selectedCards.length > 0) {
    const cards = selectedCards.map(i => s.my_hand[i]);
    h += `<button class="btn btn-success" onclick="tryScore()">提交计分 [${cards.join(',')}]</button>`;
  }
  h += `<button class="btn" onclick="sendAction('SPELL_SKIP')">结束咏唱</button>`;
  h += '</div></div>';
  return h;
}

function renderScorepadGrid() {
  const s = state;
  const combos = s.playable_combos || [];
  const comboMap = {};
  for (const c of combos) {
    // Support multiple same-key entries (ant_colony with different Fs)
    if (!comboMap[c.key] || c.score > comboMap[c.key].score) comboMap[c.key] = c;
  }

  let h = '<table class="sp-grid"><tr><th>咒语</th><th>状态</th><th>奖励</th><th>可得分</th></tr>';
  for (const cfg of SCOREPAD_CFG) {
    const info = s.my_pad[cfg.key];
    let slotsLeft = info.max_slots - info.scores.length - info.sealed;
    let sharedLocked = false;
    if (RED_KEYS.has(cfg.key) && s.shared_red && s.shared_red[cfg.key] !== -1 && info.scores.length === 0) {
      sharedLocked = true;
      slotsLeft = 0;
    }
    const combo = comboMap[cfg.key];
    const rowCls = combo && slotsLeft > 0 ? ' class="sp-avail"' : '';
    h += `<tr${rowCls}>`;
    h += `<td>${cfg.name}</td>`;

    let statusParts = [];
    for (const sc of info.scores) statusParts.push(`<span class="sp-filled">${sc}</span>`);
    for (let i = 0; i < info.sealed; i++) statusParts.push('<span class="sp-sealed-cell">✦</span>');
    if (sharedLocked) statusParts.push('<span class="sp-shared-locked">⊗</span>');
    for (let i = 0; i < slotsLeft; i++) statusParts.push('☐');
    h += `<td>${statusParts.join(' ')}</td>`;

    let reward = '';
    if (cfg.color === 'red') reward = '🔥 对手弃 2';
    else if (cfg.color === 'blue') reward = '💧 抽 1';
    else if (cfg.color === 'green') reward = '🌿 抽 1';
    h += `<td>${reward}</td>`;

    if (combo && slotsLeft > 0) {
      h += `<td class="sp-score-preview">${combo.score} [${combo.cards.join(',')}]</td>`;
    } else if (sharedLocked) {
      h += '<td class="text-muted">已被对手锁定</td>';
    } else {
      h += '<td>—</td>';
    }
    h += '</tr>';
  }
  return h + '</table>';
}

/* ── Instant mode ─────────────────────────────────── */
function enterInstantMode() {
  uiMode = 'instant';
  selectedCards = [];
  renderMyZone(false); renderArena();
}
function exitUIMode() {
  uiMode = null; sacState = null; selectedCards = [];
  renderMyZone(false); renderArena();
}
function renderInstantMode() {
  let h = '<div class="text-center"><p style="color:#9B59B6">使用「瞬」— 选择弃牌 (1~3 张非瞬)，下回合透支抽 1</p>';
  h += `<p class="text-muted">已选 ${selectedCards.length}</p>`;
  h += '<div class="action-bar">';
  const cards = selectedCards.map(i => state.my_hand[i]).filter(c => c !== '瞬');
  if (cards.length > 0 && cards.length <= 3)
    h += `<button class="btn btn-success" onclick="confirmInstant()">确认 (弃${cards.length}张)</button>`;
  h += `<button class="btn" onclick="exitUIMode()">取消</button>`;
  return h + '</div></div>';
}
function confirmInstant() {
  const cards = selectedCards.map(i => state.my_hand[i]).filter(c => c !== '瞬');
  uiMode = null; selectedCards = [];
  sendAction('SPELL_INSTANT', {discard_cards: cards});
}

/* ── Breaker mode ─────────────────────────────────── */
function enterBreakerMode() { uiMode = 'breaker'; renderArena(); }
function renderBreakerMode() {
  const s = state;
  let h = '<div class="text-center"><p style="color:#D4AF37">破法者 — 选择效果</p><div class="action-bar">';
  for (const cfg of SCOREPAD_CFG) {
    const info = s.opp_pad[cfg.key];
    let slotsLeft = info.max_slots - info.scores.length - info.sealed;
    if (RED_KEYS.has(cfg.key) && s.shared_red[cfg.key] !== -1) slotsLeft = 0;
    if (slotsLeft > 0)
      h += `<button class="btn btn-sm btn-danger" onclick="doBreaker('seal','${cfg.key}')">封印 ${cfg.name.split('(')[0]}</button>`;
  }
  h += `<button class="btn btn-sm" onclick="doBreaker('curse')">施加诅咒</button>`;
  h += `<button class="btn btn-sm" onclick="exitUIMode()">取消</button>`;
  return h + '</div></div>';
}
function doBreaker(type, slotKey) {
  uiMode = null;
  if (type === 'seal') sendAction('SPELL_BREAKER', {type:'seal', slot_key: slotKey});
  else sendAction('SPELL_BREAKER', {type:'curse'});
}

/* ── Sacrifice mode (multi-step) ──────────────────── */
function enterSacrificeMode() {
  uiMode = 'sacrifice';
  sacState = {step:'slot', slot_key:null, score_idx:-1, discard:[], recover:[]};
  selectedCards = [];
  renderArena();
}
function renderSacrificeMode() {
  const s = state;
  let h = '<div class="sacrifice-panel"><p style="color:#8B0000;font-size:1.05rem">黑暗献祭</p>';
  h += '<p class="text-muted" style="font-size:.85rem">选择已计分的格子 → 扣除其分数并永久封印 → 弃 X 张换取近期弃牌堆中的 X 张。发动后本回合结束。</p>';

  if (sacState.step === 'slot') {
    h += '<p>选择一个要献祭的计分：</p><div class="action-bar">';
    for (const slot of (s.sacrifice_slots || [])) {
      for (let i = 0; i < slot.scores.length; i++) {
        h += `<button class="btn btn-sm btn-danger" onclick="sacPickSlot('${slot.key}',${i},${slot.scores[i]})">`
          + `${slot.name.split('(')[0]}(-${slot.scores[i]})</button>`;
      }
    }
    h += `<button class="btn btn-sm" onclick="exitUIMode()">取消</button></div>`;
  } else if (sacState.step === 'discard') {
    h += `<p>步骤 2/3 — 选择 1~${s.sacrifice_max_x} 张要弃掉的手牌 <span style="color:#8B0000">(将丢入弃牌堆)</span></p>`;
    h += `<p class="text-muted">已选 ${selectedCards.length} · 待献祭：${sacState.slot_key}</p>`;
    h += '<div class="action-bar">';
    const n = selectedCards.length;
    if (n >= 1 && n <= s.sacrifice_max_x) {
      h += `<button class="btn btn-success" onclick="sacConfirmDiscard()">继续 (弃${n}张)</button>`;
    }
    h += `<button class="btn" onclick="exitUIMode()">取消</button></div>`;
  } else if (sacState.step === 'recover') {
    h += `<p>步骤 3/3 — 从近期弃牌堆中精准挑选 ${sacState.discard.length} 张加入手牌</p>`;
    h += `<p class="text-muted">已选 ${sacState.recover.length}/${sacState.discard.length}</p>`;
    h += '<div class="sac-window">';
    for (const [idx, card] of (s.sacrifice_window || [])) {
      const chosen = sacState.recover.includes(idx);
      h += `<div onclick="sacToggleRecover(${idx})" class="sac-pick ${chosen ? 'chosen' : ''}">`
        + cardHTML(card, {small:true, extraClass: chosen ? 'cd-raised' : ''}) + '</div>';
    }
    h += '</div><div class="action-bar">';
    if (sacState.recover.length === sacState.discard.length && sacState.recover.length >= 1) {
      h += `<button class="btn btn-success" onclick="sacExecute()">发动黑暗献祭</button>`;
    }
    h += `<button class="btn" onclick="exitUIMode()">取消</button></div>`;
  }
  return h + '</div>';
}

function sacPickSlot(key, idx, _score) {
  sacState.slot_key = key; sacState.score_idx = idx;
  sacState.step = 'discard';
  selectedCards = [];
  renderMyZone(false); renderArena();
}
function sacConfirmDiscard() {
  const cards = selectedCards.map(i => state.my_hand[i]);
  if (!cards.length) return;
  sacState.discard = cards;
  sacState.step = 'recover';
  sacState.recover = [];
  selectedCards = [];
  renderMyZone(false); renderArena();
}
function sacToggleRecover(idx) {
  const i = sacState.recover.indexOf(idx);
  if (i >= 0) sacState.recover.splice(i, 1);
  else {
    if (sacState.recover.length >= sacState.discard.length) return;
    sacState.recover.push(idx);
  }
  renderArena();
}
function sacExecute() {
  const payload = {
    slot_key: sacState.slot_key,
    score_idx: sacState.score_idx,
    discard_cards: sacState.discard,
    recover_indices: sacState.recover,
  };
  uiMode = null; sacState = null; selectedCards = [];
  sendAction('SPELL_SACRIFICE', payload);
}

/* ── Scoring submit ───────────────────────────────── */
function tryScore() {
  const cards = selectedCards.map(i => state.my_hand[i]);
  const combos = state.playable_combos || [];
  let match = null;
  for (const c of combos) { if (arraysMatchUnordered(c.cards, cards)) { match = c; break; } }
  if (!match) {
    const detected = clientFindCombo(cards);
    if (detected) match = detected;
  }
  if (!match) { showToast('所选牌无法构成有效组合'); return; }

  // V5: Check lockdown
  const lock = state.opp_lockdown;
  if (lock && lock !== '瞬' && cards.includes(lock)) {
    pendingLockedCombo = {cards, combo_key: match.key, score: match.score || 0, lock_card: lock};
    showLockdownBreakDialog();
    return;
  }
  sendAction('SPELL_SCORE', {cards, combo_key: match.key});
}

function showLockdownBreakDialog() {
  const c = pendingLockedCombo;
  const cost = state.lockdown_break_cost;
  const myMarks = state.my_breaker || 0;
  let h = `<div id="lockdownDialog" class="modal-backdrop" onclick="closeLockdownDialog()">
    <div class="modal-box" onclick="event.stopPropagation()">
      <h3 style="color:#9B0000">⚠ 组合被封锁</h3>
      <p>所选 [${c.cards.join(',')}] 含被封锁等级 [${c.lock_card}]<br>
      请选择破拆方式：</p>
      <div class="action-bar" style="flex-direction:column;gap:.4rem">`;
  if (myMarks > 0) {
    h += `<button class="btn btn-success" onclick="doBreakLockdown('marker')">使用 1 枚破法者标记（免费解除）</button>`;
  }
  h += `<button class="btn btn-danger" onclick="doBreakLockdown('pay')">鲜血破拆 — 支付 ${cost} 分${myBreakDebtPreview()}</button>`;
  h += `<button class="btn" onclick="closeLockdownDialog()">取消（不计分）</button>`;
  h += `</div></div></div>`;
  document.body.insertAdjacentHTML('beforeend', h);
}
function myBreakDebtPreview() {
  const cur = state.my_score;
  const cost = state.lockdown_break_cost;
  if (cur >= cost) return '';
  const debt = cost - Math.max(0, cur);
  return `<br><small style="color:#FFB58A">分数不足 → 背负 ${debt} 魔力债</small>`;
}
function closeLockdownDialog() {
  pendingLockedCombo = null;
  const el = document.getElementById('lockdownDialog');
  if (el) el.remove();
}
function doBreakLockdown(method) {
  const c = pendingLockedCombo;
  closeLockdownDialog();
  sendAction('SPELL_SCORE', {cards: c.cards, combo_key: c.combo_key, break_lockdown: method});
}

function clientFindCombo(cards) {
  if (!cards.length || cards.includes('瞬')) return null;
  const ct = {};
  for (const c of cards) ct[c] = (ct[c]||0) + 1;
  const keys = Object.keys(ct);
  const n = cards.length;
  const pad = state.my_pad;
  const sl = (k) => {
    const i = pad[k];
    let left = i.max_slots - i.scores.length - i.sealed;
    if (RED_KEYS.has(k) && state.shared_red && state.shared_red[k] !== -1 && i.scores.length === 0) left = 0;
    return left;
  };
  if (n===5 && keys.length===1 && sl('dragon_breath')>0) return {key:'dragon_breath', cards};
  const s1 = new Set(keys);
  if (n===5 && s1.size===5 && ['A','B','C','D','E'].every(c=>s1.has(c)) && sl('arcane_sequence')>0) return {key:'arcane_sequence', cards};
  if (n===5 && s1.size===5 && ['B','C','D','E','F'].every(c=>s1.has(c)) && sl('elemental_surge')>0) return {key:'elemental_surge', cards};
  const vals = Object.values(ct).sort((a,b)=>b-a);
  if (n===5 && vals[0]===3 && vals[1]===2 && sl('chaos_alchemy')>0) return {key:'chaos_alchemy', cards};
  if (n===3 && keys.length===1 && sl('triple_resonance')>0) return {key:'triple_resonance', cards};
  if (keys.length===1 && keys[0]==='F' && n>=3 && sl('ant_colony')>0) return {key:'ant_colony', cards};
  return null;
}

function arraysMatchUnordered(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort(), sb = [...b].sort();
  return sa.every((v,i) => v === sb[i]);
}

/* ── Phase: End Discard ───────────────────────────── */
/* ── Phase: Prophet Deck (choose which card to move to bottom) */
function renderProphetDeck() {
  const s = state;
  const cards = s.prophet_deck_cards || [];
  let h = '<div class="text-center">';
  h += '<p style="color:#9B59B6;font-size:1rem">先知低语 — 牌库顶</p>';
  h += `<p class="text-muted">看到以下 ${cards.length} 张，可选一张移至底部（或直接跳过）</p>`;
  if (cards.length) {
    h += '<div class="cards-row" style="justify-content:center">';
    cards.forEach((c, i) => {
      h += `<div onclick="sendAction('PROPHET_DECK',{discard_idx:${i}})" style="cursor:pointer">`;
      h += cardHTML(c);
      h += `<div style="font-size:.7rem;text-align:center;color:#C792EA;margin-top:2px">移至底部</div></div>`;
    });
    h += '</div>';
  } else {
    h += '<p class="text-muted">（牌库为空）</p>';
  }
  h += `<div class="action-bar"><button class="btn" onclick="sendAction('PROPHET_DECK',{discard_idx:null})">保持原样，继续</button></div>`;
  return h + '</div>';
}

/* ── Phase: Red Zone Sealed Bid ─────────────────────── */
function renderRedBid() {
  const s = state;
  const triggerName = {dragon_breath:'龙之吐息',arcane_sequence:'奥术序列'}[s.red_bid_trigger_key] || s.red_bid_trigger_key;
  const max = s.red_bid_max || 3, min = s.red_bid_min || 1;

  if (s.red_bid_reveal) {
    // Both bids submitted — show reveal
    const r = s.red_bid_reveal;
    const p0v = (r.p0_cards||[]).reduce((a,c)=>a+(CARD_BV[c]||1),0);
    const p1v = (r.p1_cards||[]).reduce((a,c)=>a+(CARD_BV[c]||1),0);
    let h = `<div class="text-center"><p style="color:#E74C3C;font-size:1.1rem">🔴 暗标揭晓！</p>`;
    h += `<p>玩家0 出价：${(r.p0_cards||[]).join(',')} (${p0v})</p>`;
    h += `<p>玩家1 出价：${(r.p1_cards||[]).join(',')} (${p1v})</p>`;
    h += `<p style="color:#D4AF37">胜者夺得【${triggerName}】</p></div>`;
    return h;
  }

  if (s.red_bid_done_me) {
    return `<div class="text-center"><p style="color:#D4AF37">已暗标 — 等待对手提交...</p></div>`;
  }

  let h = `<div class="text-center">`;
  h += `<p style="color:#E74C3C;font-size:1.05rem">🔴 暗标拍卖 — 双方争夺【${triggerName}】(${s.red_bid_trigger_score}分)</p>`;
  h += `<p class="text-muted" style="font-size:.82rem">选 ${min}~${max} 张牌作为奉献。出价高者得组合 + 2×奉献价值奖励；落败方牌归还手中。</p>`;
  h += `<p class="text-muted">已选 ${selectedCards.length}/${max}</p>`;
  if (selectedCards.length >= min && selectedCards.length <= max) {
    h += `<div class="action-bar"><button class="btn btn-danger" onclick="doRedBid()">暗标确认（出价 ${selectedCards.length} 张）</button></div>`;
  }
  return h + '</div>';
}
function doRedBid() {
  const cards = selectedCards.map(i => state.my_hand[i]);
  sendAction('RED_BID', {cards});
}

function renderEndDiscard() {
  if (!state.is_my_turn) return '<div class="text-center text-muted">对手正在弃牌...</div>';
  const overflow = state.overflow || 0;
  let h = `<div class="text-center"><p>手牌超限 — 弃掉 ${overflow} 张</p>`;
  h += '<div class="action-bar">';
  if (selectedCards.length === overflow)
    h += `<button class="btn btn-danger" onclick="doEndDiscard()">确认弃牌</button>`;
  return h + '</div></div>';
}
function doAmbushPayCost() {
  const cards = selectedCards.map(i => state.my_hand[i]);
  sendAction('AMBUSH_PAY_COST', {cards});
}

/* ── Prophet's Whisper modal ─────────────────────── */
function showProphetModal() {
  let h = '<div class="modal-overlay" id="prophetModal" onclick="if(event.target===this)closeProphetModal()">';
  h += '<div class="modal-box" style="max-width:340px">';
  h += '<h3 style="color:#C792EA;text-align:center;margin-bottom:12px">先知低语</h3>';
  h += `<p style="font-size:.85rem;color:#aaa;text-align:center;margin-bottom:12px">消耗 ${state.prophet_cost||5} 分，获得以下任意一项信息</p>`;
  h += `<button class="btn" style="width:100%;margin-bottom:8px" onclick="useProphet('peek_hand')">👁 窥视手牌 — 随机看对手3张手牌</button>`;
  h += `<button class="btn" style="width:100%;margin-bottom:8px" onclick="useProphet('peek_deck')">📚 窥视牌库 — 看库顶3张（可弃1到底部）</button>`;
  h += `<button class="btn" style="width:100%;margin-bottom:8px" onclick="useProphet('peek_market')">🏪 窥视黑市 — 暗市夜提前看1张商品</button>`;
  h += `<button class="btn" style="width:100%;color:#aaa" onclick="closeProphetModal()">取消</button>`;
  h += '</div></div>';
  document.body.insertAdjacentHTML('beforeend', h);
}
function closeProphetModal() {
  const el = document.getElementById('prophetModal');
  if (el) el.remove();
}
function useProphet(choice) {
  closeProphetModal();
  sendAction('PROPHET_WHISPER', {choice});
}
function doEndDiscard() {
  const cards = selectedCards.map(i => state.my_hand[i]);
  sendAction('END_DISCARD', {cards});
}

/* ── Collision ────────────────────────────────────── */
function renderColPreDiscard() {
  const s = state;
  if (s.col_pre_done) return '<div class="text-center text-muted">等待对手弃牌...</div>';
  const mustDiscard = s.col_must_discard || 0;
  let msg = mustDiscard > 0
    ? `对撞前 — 你需要弃掉 ${mustDiscard} 张牌以与对手手牌数一致`
    : '对撞前 — 可弃 0~2 张 (不参与对撞)';
  let h = `<div class="text-center"><p>${msg}</p>`;
  h += '<div class="action-bar">';
  const canConfirm = mustDiscard > 0 ? selectedCards.length === mustDiscard : selectedCards.length <= 2;
  if (canConfirm)
    h += `<button class="btn btn-success" onclick="doColPreDiscard()">确认 (弃${selectedCards.length}张)</button>`;
  return h + '</div></div>';
}
function doColPreDiscard() {
  const cards = selectedCards.map(i => state.my_hand[i]);
  sendAction('COLLISION_PRE_DISCARD', {cards});
}

function renderColBet() {
  const s = state;
  const isCaller = (s.my_idx === s.col_bet_caller);
  const phase = s.col_bet_phase;
  if (phase === 'CALLER') {
    if (!isCaller) return '<div class="text-center text-muted">对手正在决定赌注...</div>';
    let h = '<div class="text-center">';
    h += '<p style="color:#D4AF37;font-size:1.1rem">对撞赌注</p>';
    h += '<p class="text-muted">跟注：双方各扣押注加入底池 · 退缩：你白得 5 分</p>';
    h += '<div class="action-bar">';
    h += '<button class="btn" onclick="sendAction(\'COLLISION_BET\',{amount:0})">不押注</button>';
    h += '<button class="btn btn-success" onclick="sendAction(\'COLLISION_BET\',{amount:10})">押 10 分</button>';
    h += '<button class="btn btn-danger" onclick="sendAction(\'COLLISION_BET\',{amount:20})">押 20 分</button>';
    h += '</div></div>';
    return h;
  }
  if (phase === 'RESPONDER') {
    if (isCaller) return `<div class="text-center text-muted">你押了 ${s.col_bet_amount} 分，等待对手回应...</div>`;
    let h = '<div class="text-center">';
    h += `<p style="color:#FF6B6B;font-size:1.1rem">对手押注 ${s.col_bet_amount} 分！</p>`;
    h += '<div class="action-bar">';
    h += `<button class="btn btn-success" onclick="sendAction('COLLISION_BET',{choice:'follow'})">跟注 (−${s.col_bet_amount} 分)</button>`;
    h += `<button class="btn" onclick="sendAction('COLLISION_BET',{choice:'fold'})">退缩 (对手 +5 分)</button>`;
    h += '</div></div>';
    return h;
  }
  return '<div class="text-center text-muted">处理中...</div>';
}

function renderColFlip() {
  const s = state;
  let h = '';
  h += `<div class="col-scores">底池 ${s.col_pot} · 我方 ${s.col_scores[s.my_idx]} · 对手 ${s.col_scores[1-s.my_idx]}</div>`;

  const oppCount = s.col_opp_card_count;
  const oppRevealed = s.col_opp_revealed || {};
  const oppFlipped = new Set(s.col_opp_flipped || []);
  h += '<div class="text-center text-muted mb-2">对手暗阵</div><div class="col-row">';
  for (let i = 0; i < oppCount; i++) {
    if (oppFlipped.has(i)) h += cardHTML(oppRevealed[i] || '?', {small:true});
    else h += cardHTML('?', {faceDown:true, small:true});
  }
  h += '</div>';

  const myCount = s.col_my_card_count || (s.col_my_cards || []).length;
  const myRevealed = s.col_my_revealed || {};
  const myFlipped = new Set(s.col_my_flipped || []);
  const waitFor = s.col_waiting_for;
  const isMyFlip = (waitFor === s.my_idx);
  h += '<div class="text-center text-muted mb-2 mt-2">我方暗阵</div><div class="col-row">';
  for (let i = 0; i < myCount; i++) {
    if (myFlipped.has(i)) h += cardHTML(myRevealed[i] || '?', {small:true});
    else if (isMyFlip) h += `<div onclick="sendAction('COLLISION_FLIP',{})" class="col-card">` + cardHTML('?', {faceDown:true, small:true}) + '</div>';
    else h += cardHTML('?', {faceDown:true, small:true});
  }
  h += '</div>';
  h += isMyFlip
    ? '<div class="text-center mt-2" style="color:#D4AF37">轮到你翻牌</div>'
    : '<div class="text-center mt-2 text-muted">等待对手翻牌...</div>';
  return h;
}

/* ── Game Over ─────────────────────────────────────── */
function renderGameOver() {
  clearSession();
  showScreen('gameOver');
  const s = state;
  const el = document.getElementById('gameOver');
  const isWinner = s.winner === s.my_idx;
  let h = `<h1>${isWinner ? '胜利' : (s.winner < 0 ? '平局' : '败北')}</h1>`;
  h += `<div class="final-scores">${s.my_name} ${s.final_scores[s.my_idx]} — ${s.opp_name} ${s.final_scores[1-s.my_idx]}</div>`;
  if (s.col_scores && (s.col_scores[0] || s.col_scores[1])) {
    h += `<div class="text-muted mt-2">对撞 ${s.col_scores[0]} vs ${s.col_scores[1]}</div>`;
  }
  h += `<div class="mt-4"><button class="btn" onclick="location.reload()">返回大厅</button></div>`;
  el.innerHTML = h;
}

/* ── Toast ─────────────────────────────────────────── */
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 3000);
}

/* Ping */
setInterval(() => { fetch('/ping').catch(() => {}); }, 4 * 60 * 1000);

/* BGM */
let bgmPlaying = false;
function tryAutoPlayBGM() {
  if (bgmPlaying) return;
  const audio = document.getElementById('bgm');
  if (!audio) return;
  audio.volume = 0.3;
  audio.play().then(() => {
    bgmPlaying = true;
    const btn = document.getElementById('bgmControl');
    if (btn) btn.textContent = '🔊';
  }).catch(() => {});
}
function toggleBGM() {
  const audio = document.getElementById('bgm');
  const btn = document.getElementById('bgmControl');
  if (!audio) return;
  if (bgmPlaying) { audio.pause(); btn.textContent = '🔇'; }
  else { audio.volume = 0.3; audio.play().catch(() => {}); btn.textContent = '🔊'; }
  bgmPlaying = !bgmPlaying;
}

/* Init */
document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  document.addEventListener('click', tryAutoPlayBGM, {once: true});
});
