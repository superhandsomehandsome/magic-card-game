/* ══════════════════════════════════════════════════════
   秘术对决：禁忌魔典 — Client
   Dark Academia + Theatrical Animations
   ══════════════════════════════════════════════════════ */

/* ── Constants ─────────────────────────────────────── */
const TIER_CLASS = {A:'tier-A',B:'tier-B',C:'tier-C',D:'tier-D',E:'tier-E',F:'tier-F','瞬':'tier-inst'};
const CARD_SYM  = {A:'♠',B:'♦',C:'♣',D:'◆',E:'○',F:'△','瞬':'⚡'};
const CARD_SUB  = {A:'圣物',B:'元素',C:'中坚',D:'基础',E:'低阶',F:'杂鱼','瞬':'瞬'};
const CARD_BV   = {A:6,B:5,C:4,D:3,E:2,F:1,'瞬':0};

const SCOREPAD_CFG = [
  {key:'dragon_breath',name:'龙之吐息 (五条)',max:1,tier:1},
  {key:'arcane_sequence',name:'奥术序列 (大顺)',max:1,tier:1},
  {key:'elemental_surge',name:'元素激流 (小顺)',max:2,tier:2},
  {key:'chaos_alchemy',name:'混沌炼金 (葫芦)',max:2,tier:2},
  {key:'triple_resonance',name:'三重共鸣 (三条)',max:2,tier:3},
  {key:'ant_colony',name:'以量取胜 (蚁群)',max:2,tier:3},
];
const TIER_CLS = {1:'t1',2:'t2',3:'t3'};

/* ── State ─────────────────────────────────────────── */
let socket = null;
let roomId = null;
let myIdx = -1;
let state = null;
let prevState = null;
let selectedCards = [];
let timerInterval = null;
let duelAnimDone = false;
let prevHandStr = '';

/* ── Socket Setup ──────────────────────────────────── */
function initSocket() {
  socket = io();
  socket.on('connected', () => {
    console.log('Connected');
    tryAutoReconnect();
  });
  socket.on('room_created', d => {
    roomId = d.room_id; myIdx = d.player_idx;
    saveSession();
    showWaiting();
  });
  socket.on('room_joined', d => {
    roomId = d.room_id; myIdx = d.player_idx;
    saveSession();
  });
  socket.on('state', onState);
  socket.on('error', d => showToast(d.msg));
  socket.on('action_error', d => showToast(d.msg));
  socket.on('reconnect_fail', d => {
    clearSession();
    showScreen('lobby');
    showToast('上一个房间已失效，请重新创建');
  });
  socket.on('opponent_away', d => {
    showOverlay(`${d.name} 断线了`, `等待重连中... (${d.grace}秒后判定胜利)`);
  });
  socket.on('opponent_back', d => {
    hideOverlay();
    showToast(`${d.name} 已重连`);
  });
  socket.on('left_room', () => { clearSession(); location.reload(); });
}

function saveSession() {
  if (roomId !== null && myIdx >= 0) {
    localStorage.setItem('mg_room', JSON.stringify({roomId, myIdx, ts: Date.now()}));
  }
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
function joinRoom() {
  const name = document.getElementById('playerName').value.trim() || '占星师';
  const rid = document.getElementById('roomInput').value.trim().toUpperCase();
  if (rid.length !== 6) { showToast('请输入 6 位房间号'); return; }
  socket.emit('join_room', {room_id: rid, name});
}
function sendAction(action, data={}) {
  socket.emit('action', {room_id: roomId, action, data});
}

/* ── Screens ───────────────────────────────────────── */
function showScreen(id) {
  ['lobby','waitingScreen','gameBoard','gameOver'].forEach(s =>
    document.getElementById(s).classList.toggle('hidden', s !== id));
}
function showWaiting() {
  document.getElementById('displayRoomCode').textContent = roomId;
  showScreen('waitingScreen');
}

/* ── State Handler ─────────────────────────────────── */
function onState(s) {
  prevState = state;
  state = s;
  selectedCards = [];

  const isDuelRevealPhase = s.phase === 'AMBUSH_SCAVENGE' && s.atk_card && s.def_card;
  const prevWasDuel = prevState && prevState.phase === 'AMBUSH_SCAVENGE';
  duelAnimDone = prevWasDuel && isDuelRevealPhase;

  hideOverlay();
  if (s.phase === 'GAME_OVER') { renderGameOver(); return; }
  showScreen('gameBoard');

  const newHandStr = (s.my_hand || []).join(',');
  const handChanged = newHandStr !== prevHandStr;
  prevHandStr = newHandStr;

  renderOppZone();
  renderMyZone(handChanged && (!prevState || prevState.phase === 'DRAW'));
  renderArena();
  startTimer();
}

/* ── Card HTML ─────────────────────────────────────── */
function cardHTML(card, opts={}) {
  if (opts.faceDown) {
    const cls = 'cd cd-back' + (opts.small ? ' cd-sm' : '');
    return `<div class="${cls}"><span class="lt">☽</span></div>`;
  }
  const tier = TIER_CLASS[card] || 'tier-F';
  const sym  = CARD_SYM[card] || '△';
  const sub  = CARD_SUB[card] || '?';
  const bv   = CARD_BV[card] ?? 0;
  let cls = `cd ${tier}` + (opts.small ? ' cd-sm' : '') + (opts.raised ? ' cd-raised' : '') +
    (opts.dim ? ' cd-dim' : '') + (opts.selectable ? ' selectable' : '') +
    (opts.extraClass ? ` ${opts.extraClass}` : '');
  return `<div class="${cls}" ${opts.onclick||''}>` +
    `<span class="sy">${sym}</span><span class="lt">${card}</span>` +
    `<span class="st">${sub}</span><span class="vl">${bv}</span></div>`;
}

/* ── Scorepad Chips ────────────────────────────────── */
function padChipsHTML(pad) {
  let h = '<div class="sp-inline">';
  for (const cfg of SCOREPAD_CFG) {
    const info = pad[cfg.key];
    const tc = TIER_CLS[cfg.tier] || 't3';
    let slots = '';
    for (const s of info.scores) slots += `<span class="sp-val">${s}</span> `;
    for (let i=0; i<info.sealed; i++) slots += '<span class="sp-lk">✦</span> ';
    const rem = info.max_slots - info.scores.length - info.sealed;
    for (let i=0; i<rem; i++) slots += '☐ ';
    const short = cfg.name.split('(')[0].trim();
    h += `<span class="sp-chip ${tc}">${short} ${slots}</span>`;
  }
  return h + '</div>';
}

/* ── Player Bar ────────────────────────────────────── */
function playerBarHTML(name, score, winScore, handCount, pad, isActive, breaker, scavLeft, deckCount, discardCount) {
  const icon = name.includes('炼金') ? '🧙' : '🔮';
  const actCls = isActive ? ' active' : '';
  let stat = `手牌 ${handCount}`;
  if (breaker) stat += ` · 破法×${breaker}`;
  stat += ` · 拾荒${scavLeft}`;
  if (deckCount !== undefined) stat += ` · 牌库${deckCount} · 弃牌${discardCount}`;
  return `<div class="pbar">` +
    `<div class="avatar${actCls}">${icon}</div>` +
    `<div><div class="pname">${name}${isActive ? ' ◄' : ''}</div>` +
    `<div class="pstat">${stat}</div>${padChipsHTML(pad)}</div>` +
    `<div class="pscore">${score} / ${winScore}</div></div>`;
}

/* ── Zone Renders ──────────────────────────────────── */
function renderOppZone() {
  const s = state;
  const el = document.getElementById('oppZone');
  let h = playerBarHTML(s.opp_name, s.opp_score, s.win_score, s.opp_hand_count,
    s.opp_pad, !s.is_my_turn, 0, s.opp_scavenge_left);
  h += '<div class="cards-row">';
  for (let i=0; i<s.opp_hand_count; i++) h += cardHTML('?', {faceDown:true, small:true});
  h += '</div>';
  el.innerHTML = h;
}

function renderMyZone(animateDraw) {
  const s = state;
  const el = document.getElementById('myZone');
  let h = playerBarHTML(s.my_name, s.my_score, s.win_score, s.my_hand.length,
    s.my_pad, s.is_my_turn, s.my_breaker, s.my_scavenge_left, s.deck_count, s.discard_count);
  h += renderMyHand(animateDraw);
  el.innerHTML = h;
}

function renderMyHand(animateDraw) {
  const s = state;
  const selectable = needsCardSelection();
  let h = '<div class="cards-row">';
  for (let i=0; i<s.my_hand.length; i++) {
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
  if (!state.is_my_turn && p !== 'AMBUSH_DEF_SELECT' && p !== 'COLLISION_PRE_DISCARD' &&
      p !== 'COLLISION_FLIP' && p !== 'AMBUSH_SCAVENGE') return false;
  return ['AMBUSH_ATK_SELECT','AMBUSH_DEF_SELECT','SPELL','END_DISCARD','COLLISION_PRE_DISCARD'].includes(p);
}

function canSelectCard(card, idx) {
  const p = state.phase;
  if (p === 'AMBUSH_ATK_SELECT') return card !== '瞬';
  if (p === 'AMBUSH_DEF_SELECT') return true;
  if (p === 'SPELL') return card !== '瞬' || state._instantMode;
  if (p === 'END_DISCARD') return true;
  if (p === 'COLLISION_PRE_DISCARD') return true;
  return false;
}

function toggleCard(idx) {
  const p = state.phase;
  const single = (p === 'AMBUSH_ATK_SELECT' || p === 'AMBUSH_DEF_SELECT');
  if (single) {
    selectedCards = selectedCards.includes(idx) ? [] : [idx];
  } else {
    if (selectedCards.includes(idx)) selectedCards = selectedCards.filter(i => i !== idx);
    else selectedCards.push(idx);
  }
  renderMyZone(false);
  renderArena();
}

/* ── Timer ─────────────────────────────────────────── */
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

/* ── Top Controls ──────────────────────────────────── */
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
function doSurrender() { hideOverlay(); clearSession(); socket.emit('surrender', {room_id: roomId}); }
function confirmLeave() {
  showOverlay('退出房间？', '退出后对手将直接获胜',
    `<div class="action-bar"><button class="btn btn-danger" onclick="doLeave()">确定退出</button>` +
    `<button class="btn" onclick="hideOverlay()">取消</button></div>`);
}
function doLeave() { hideOverlay(); clearSession(); socket.emit('leave_game', {room_id: roomId}); }

/* ── Overlay ───────────────────────────────────────── */
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

/* ═══════════════════════════════════════════════════
   ARENA RENDER — Phase-dependent
   ═══════════════════════════════════════════════════ */
function renderArena() {
  const s = state;
  const el = document.getElementById('arenaZone');
  let h = renderTopControls();

  h += `<div class="phase-bar">${phaseLabel(s.phase)} — 回合 ${s.turn_number}` +
       ` <span class="timer-bar" id="timerDisplay"></span></div>`;
  h += renderLog();

  switch (s.phase) {
    case 'DRAW': h += renderDraw(); break;
    case 'AMBUSH_DECIDE': h += renderAmbushDecide(); break;
    case 'AMBUSH_ATK_SELECT': h += renderAmbushAtkSelect(); break;
    case 'AMBUSH_DEF_SELECT': h += renderAmbushDefSelect(); break;
    case 'AMBUSH_SCAVENGE': h += renderDuelStage() + renderScavenge(); break;
    case 'SPELL': h += renderSpell(); break;
    case 'END_DISCARD': h += renderEndDiscard(); break;
    case 'COLLISION_PRE_DISCARD': h += renderColPreDiscard(); break;
    case 'COLLISION_FLIP': h += renderColFlip(); break;
    default: h += `<div class="text-center text-muted">等待中...</div>`;
  }
  el.innerHTML = h;
}

function phaseLabel(p) {
  const m = {
    DRAW:'壹 · 汲取', AMBUSH_DECIDE:'贰 · 突袭', AMBUSH_ATK_SELECT:'贰 · 暗扣出牌',
    AMBUSH_DEF_SELECT:'贰 · 防守应战',
    AMBUSH_SCAVENGE:'贰 · 败者拾荒', SPELL:'叁 · 咏唱', END_DISCARD:'肆 · 弃牌',
    COLLISION_PRE_DISCARD:'终局 · 对撞前弃牌', COLLISION_FLIP:'终局 · 对撞翻牌',
  };
  return m[p] || p;
}

function renderLog() {
  if (!state.log || !state.log.length) return '';
  let h = '<div class="game-log">';
  for (const e of state.log) h += `<div class="log-entry">${e.msg}</div>`;
  return h + '</div>';
}

/* ═══════════════════════════════════════════════════
   DUEL STAGE — Theatrical card reveal animation
   ═══════════════════════════════════════════════════ */
function renderDuelStage() {
  const s = state;
  if (!s.atk_card || s.atk_card === '?') return '';

  const atkCard = s.atk_card;
  const defCard = s.def_card;
  const result  = s.ambush_result;

  const atkWin = result === 1;
  const defWin = result === -1;

  const atkGlow = atkWin ? 'duel-winner-glow' : defWin ? 'duel-loser-dim' : 'duel-tie-glow';
  const defGlow = defWin ? 'duel-winner-glow' : atkWin ? 'duel-loser-dim' : 'duel-tie-glow';

  const playAnim = !duelAnimDone;
  const atkAnim = playAnim ? 'duel-atk' : '';
  const defAnim = playAnim && defCard ? 'duel-def' : '';
  const vsAnim  = playAnim ? 'anim' : '';
  const txtAnim = playAnim ? 'anim' : '';

  let sym, txt;
  if (atkWin)      { sym = '>'; txt = `${atkCard} 胜 ${defCard||'无牌'} — 攻击方胜`; }
  else if (defWin) { sym = '<'; txt = `${atkCard} 负 ${defCard} — 防守方胜`; }
  else             { sym = '='; txt = `${atkCard} 平 ${defCard||'?'} — 平局`; }

  let h = '<div class="duel-stage">';
  h += `<div class="duel-card-slot">${cardHTML(atkCard, {extraClass: `${atkAnim} ${atkGlow}`.trim()})}</div>`;
  h += `<div class="duel-vs ${vsAnim}">${sym}</div>`;
  if (defCard) {
    h += `<div class="duel-card-slot">${cardHTML(defCard, {extraClass: `${defAnim} ${defGlow}`.trim()})}</div>`;
  } else {
    h += `<div class="duel-card-slot"><div class="cd cd-back"><span class="lt">✕</span></div></div>`;
  }
  h += '</div>';
  h += `<div class="duel-result-text ${txtAnim}">${txt}</div>`;

  if (s.duel_winner_drew) {
    const drewCard = (typeof s.duel_winner_drew === 'string') ? s.duel_winner_drew : '?';
    const isMe = s.duel_winner_idx === s.my_idx;
    if (isMe && drewCard !== '?') {
      h += `<div class="text-center mt-2" style="color:#D4AF37">胜者抽牌 → ${cardHTML(drewCard, {small:true, extraClass:'anim-draw'})}</div>`;
    } else if (isMe) {
      h += `<div class="text-center mt-2" style="color:#D4AF37">你从牌库抽取了一张牌</div>`;
    } else {
      h += `<div class="text-center mt-2 text-muted">对手从牌库抽取了一张牌</div>`;
    }
  }

  return h;
}

/* ── Phase: Draw ───────────────────────────────────── */
function renderDraw() {
  if (!state.is_my_turn) return '<div class="text-center text-muted">对手正在汲取魔力...</div>';
  return `<div class="text-center">
    <div class="action-bar"><button class="btn" onclick="sendAction('DRAW')">汲取魔力</button></div></div>`;
}

/* ── Phase: Ambush Decide ──────────────────────────── */
function renderAmbushDecide() {
  if (!state.is_my_turn) return '<div class="text-center text-muted">对手正在抉择...</div>';
  return `<div class="text-center">
    <div class="action-bar">
      <button class="btn btn-danger" onclick="sendAction('AMBUSH_DECIDE',{choice:'attack'})">发起突袭</button>
      <button class="btn" onclick="sendAction('AMBUSH_DECIDE',{choice:'skip'})">跳过</button>
    </div></div>`;
}

/* ── Phase: Ambush Atk Select ──────────────────────── */
function renderAmbushAtkSelect() {
  if (!state.is_my_turn) return '<div class="text-center text-muted">对手正在暗扣...</div>';
  let h = '<div class="text-center"><p class="text-muted">选择一张牌发起拼点</p><div class="action-bar">';
  if (selectedCards.length === 1) {
    const card = state.my_hand[selectedCards[0]];
    h += `<button class="btn btn-danger" onclick="sendAction('AMBUSH_ATK_SELECT',{card:'${card}'})">确认出牌</button>`;
  }
  h += `<button class="btn" onclick="sendAction('AMBUSH_CANCEL')">放弃突袭</button>`;
  return h + '</div></div>';
}

/* ── Phase: Ambush Def Select ──────────────────────── */
function renderAmbushDefSelect() {
  const isDefender = !state.is_my_turn;
  if (!isDefender) return '<div class="text-center text-muted">等待对手防守...</div>';
  let h = '<div class="defend-alert">对手发起突袭！请选择一张牌防守<div class="defend-timer-bar"></div></div>';
  h += '<div class="text-center"><p class="text-muted">点击下方手牌选择防守 · 可出「瞬」强制平局</p><div class="action-bar">';
  if (selectedCards.length === 1) {
    const card = state.my_hand[selectedCards[0]];
    h += `<button class="btn btn-success" onclick="sendAction('AMBUSH_DEF_SELECT',{card:'${card}'})">应战 [${card}]</button>`;
  }
  return h + '</div></div>';
}

/* ── Phase: Scavenge ───────────────────────────────── */
function renderScavenge() {
  const s = state;
  if (!s.scavenge_options) return '<div class="text-center text-muted">对手（败者）正在拾荒...</div>';

  let h = '<div class="text-center"><p>拼点落败 — 可从弃牌堆拾取一张 D/E/F 牌 (剩余拾荒次数: ' + s.my_scavenge_left + ')</p>';
  if (s.scavenge_options.length) {
    h += '<div class="cards-row">';
    for (const [idx, card] of s.scavenge_options) {
      h += `<div onclick="sendAction('SCAVENGE',{choice:'pick',card_idx:${idx}})" style="cursor:pointer">` +
        cardHTML(card, {selectable:true, small:true}) + '</div>';
    }
    h += '</div>';
  }
  h += `<div class="action-bar"><button class="btn" onclick="sendAction('SCAVENGE',{choice:'skip'})">跳过拾荒</button></div>`;
  return h + '</div>';
}

/* ── Phase: Spell ──────────────────────────────────── */
function renderSpell() {
  const s = state;
  if (!s.is_my_turn) return '<div class="text-center text-muted">对手正在咏唱...</div>';

  let h = '<div>';

  if (s.tier1_bonus) {
    h += '<div class="phase-bar" style="border-color:#8B0000;background:rgba(139,0,0,.08)">禁忌连击 — 可再计分一次</div>';
  }

  h += '<div class="action-bar">';
  if (s.my_breaker > 0) h += `<button class="btn btn-sm" onclick="showBreakerMenu()">破法者 (${s.my_breaker})</button>`;
  if (s.instant_count < s.instant_limit && s.my_hand.includes('瞬'))
    h += `<button class="btn btn-sm" onclick="enterInstantMode()">使用瞬</button>`;
  h += '</div>';

  if (s.echo_ready) h += '<div class="text-center" style="color:#9B59B6;font-size:.85rem">回响激活 +10</div>';
  if (s.my_curse) h += '<div class="text-center" style="color:#C0392B;font-size:.85rem">诅咒生效 −10</div>';

  if (state._instantMode) {
    h += `<div class="text-center mt-2"><p class="text-muted">选择弃牌 (至少 1 张非瞬)，瞬将自动使用</p>
      <div class="action-bar">`;
    const cards = selectedCards.map(i => state.my_hand[i]).filter(c => c !== '瞬');
    if (cards.length > 0)
      h += `<button class="btn btn-success" onclick="confirmInstant()">确认刷新 (弃${cards.length}张)</button>`;
    h += `<button class="btn" onclick="cancelInstantMode()">取消</button></div></div>`;
    return h + '</div>';
  }

  h += renderScorepadGrid();

  h += '<div class="action-bar mt-2">';
  if (selectedCards.length > 0) {
    const cards = selectedCards.map(i => s.my_hand[i]);
    h += `<button class="btn btn-success" onclick="tryScore()">提交计分 [${cards.join(',')}]</button>`;
  }
  h += `<button class="btn btn-danger" onclick="showSacrificeMenu()">黑暗献祭</button>`;
  h += `<button class="btn" onclick="sendAction('SPELL_SKIP')">跳过咏唱</button>`;
  h += '</div></div>';
  return h;
}

function renderScorepadGrid() {
  const s = state;
  const combos = s.playable_combos || [];
  const comboMap = {};
  for (const c of combos) comboMap[c.key] = c;

  let h = '<table class="sp-grid"><tr><th>咒语</th><th>状态</th><th>可得分</th></tr>';
  for (const cfg of SCOREPAD_CFG) {
    const info = s.my_pad[cfg.key];
    const slotsLeft = info.max_slots - info.scores.length - info.sealed;
    const combo = comboMap[cfg.key];
    const rowCls = combo && slotsLeft > 0 ? ' class="sp-avail"' : '';

    h += `<tr${rowCls}>`;
    h += `<td>${cfg.name}</td>`;

    let statusParts = [];
    for (const sc of info.scores) statusParts.push(`<span class="sp-filled">${sc}</span>`);
    for (let i=0; i<info.sealed; i++) statusParts.push('<span class="sp-sealed-cell">✦</span>');
    for (let i=0; i<slotsLeft; i++) statusParts.push('☐');
    h += `<td>${statusParts.join(' ')}</td>`;

    if (combo && slotsLeft > 0) {
      h += `<td class="sp-score-preview">${combo.score} [${combo.cards.join(',')}]</td>`;
    } else {
      h += '<td>—</td>';
    }
    h += '</tr>';
  }
  return h + '</table>';
}

function enterInstantMode() {
  state._instantMode = true; selectedCards = [];
  renderMyZone(false); renderArena();
}
function cancelInstantMode() {
  state._instantMode = false; selectedCards = [];
  renderMyZone(false); renderArena();
}
function confirmInstant() {
  const cards = selectedCards.map(i => state.my_hand[i]).filter(c => c !== '瞬');
  state._instantMode = false;
  sendAction('SPELL_INSTANT', {discard_cards: cards});
}

function tryScore() {
  const cards = selectedCards.map(i => state.my_hand[i]);
  const combos = state.playable_combos || [];
  let match = null;
  for (const c of combos) { if (arraysMatchUnordered(c.cards, cards)) { match = c; break; } }
  if (!match) {
    const detected = clientFindCombo(cards);
    if (detected) { match = detected; }
  }
  if (!match) { showToast('所选牌无法构成有效组合'); return; }
  sendAction('SPELL_SCORE', {cards, combo_key: match.key});
}

function clientFindCombo(cards) {
  if (!cards.length || cards.includes('瞬')) return null;
  const ct = {};
  for (const c of cards) ct[c] = (ct[c]||0) + 1;
  const keys = Object.keys(ct);
  const n = cards.length;
  const pad = state.my_pad;
  const sl = (k) => { const i=pad[k]; return i.max_slots - i.scores.length - i.sealed; };

  if (n===5 && keys.length===1 && sl('dragon_breath')>0)
    return {key:'dragon_breath', cards};
  const s1 = new Set(keys);
  if (n===5 && s1.size===5 && ['A','B','C','D','E'].every(c=>s1.has(c)) && sl('arcane_sequence')>0)
    return {key:'arcane_sequence', cards};
  if (n===5 && s1.size===5 && ['B','C','D','E','F'].every(c=>s1.has(c)) && sl('elemental_surge')>0)
    return {key:'elemental_surge', cards};
  const vals = Object.values(ct).sort((a,b)=>b-a);
  if (n===5 && vals[0]===3 && vals[1]===2 && sl('chaos_alchemy')>0)
    return {key:'chaos_alchemy', cards};
  if (n===3 && keys.length===1 && sl('triple_resonance')>0)
    return {key:'triple_resonance', cards};
  if (keys.length===1 && keys[0]==='F' && sl('ant_colony')>0)
    return {key:'ant_colony', cards};
  return null;
}

function arraysMatchUnordered(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort(), sb = [...b].sort();
  return sa.every((v,i) => v === sb[i]);
}

function showBreakerMenu() {
  const s = state;
  let opts = '<div class="text-center"><p class="text-muted">选择破法者效果</p><div class="action-bar">';
  for (const cfg of SCOREPAD_CFG) {
    const info = s.opp_pad[cfg.key];
    const slotsLeft = info.max_slots - info.scores.length - info.sealed;
    if (slotsLeft > 0)
      opts += `<button class="btn btn-sm btn-danger" onclick="sendAction('SPELL_BREAKER',{type:'seal',slot_key:'${cfg.key}'})">封印 ${cfg.name.split('(')[0]}</button>`;
  }
  opts += `<button class="btn btn-sm" onclick="sendAction('SPELL_BREAKER',{type:'curse'})">施加诅咒</button>`;
  opts += `<button class="btn btn-sm" onclick="renderArena()">取消</button></div></div>`;
  document.getElementById('arenaZone').innerHTML += opts;
}

function showSacrificeMenu() {
  const s = state;
  let opts = '<div class="text-center mt-2"><p class="text-muted">选择献祭的计分格 (永久归零)</p><div class="action-bar">';
  for (const cfg of SCOREPAD_CFG) {
    const info = s.my_pad[cfg.key];
    const slotsLeft = info.max_slots - info.scores.length - info.sealed;
    if (slotsLeft > 0)
      opts += `<button class="btn btn-sm btn-danger" onclick="confirmSacrifice('${cfg.key}')">献祭 ${cfg.name.split('(')[0]}</button>`;
  }
  opts += `<button class="btn btn-sm" onclick="renderArena()">取消</button></div></div>`;
  document.getElementById('arenaZone').innerHTML += opts;
}

function confirmSacrifice(slotKey) {
  const cards = selectedCards.map(i => state.my_hand[i]);
  sendAction('SPELL_SACRIFICE', {slot_key: slotKey, discard_cards: cards});
}

/* ── Phase: End Discard ────────────────────────────── */
function renderEndDiscard() {
  if (!state.is_my_turn) return '<div class="text-center text-muted">对手正在弃牌...</div>';
  const overflow = state.overflow || 0;
  let h = `<div class="text-center"><p>手牌超限 — 弃掉 ${overflow} 张</p>`;
  h += '<div class="action-bar">';
  if (selectedCards.length === overflow) {
    const cards = selectedCards.map(i => state.my_hand[i]);
    h += `<button class="btn btn-danger" onclick="sendAction('END_DISCARD',{cards:${JSON.stringify(cards)}})">确认弃牌</button>`;
  }
  return h + '</div></div>';
}

/* ── Phase: Collision Pre-Discard ──────────────────── */
function renderColPreDiscard() {
  const s = state;
  if (s.col_pre_done) return '<div class="text-center text-muted">等待对手弃牌...</div>';
  let h = `<div class="text-center"><p>对撞前 — 可弃 0~2 张 (不参与对撞)</p>`;
  h += '<div class="action-bar">';
  const cards = selectedCards.map(i => s.my_hand[i]);
  if (selectedCards.length <= 2) {
    h += `<button class="btn btn-success" onclick="sendAction('COLLISION_PRE_DISCARD',{cards:${JSON.stringify(cards)}})">` +
      `确认 (弃${cards.length}张)</button>`;
  }
  return h + '</div></div>';
}

/* ── Phase: Collision Flip ─────────────────────────── */
function renderColFlip() {
  const s = state;
  let h = '';

  h += `<div class="col-scores">底池 ${s.col_pot} · 我方 ${s.col_scores[s.my_idx]} · 对手 ${s.col_scores[1-s.my_idx]}</div>`;

  const oppCount = s.col_opp_card_count;
  const oppRevealed = s.col_opp_revealed || {};
  const oppFlipped = new Set(s.col_opp_flipped || []);
  h += '<div class="text-center text-muted mb-2">对手暗阵</div><div class="col-row">';
  for (let i=0; i<oppCount; i++) {
    if (oppFlipped.has(i)) {
      h += cardHTML(oppRevealed[i] || '?', {small:true});
    } else {
      h += cardHTML('?', {faceDown:true, small:true});
    }
  }
  h += '</div>';

  const myCards = s.col_my_cards || [];
  const myFlipped = new Set(s.col_my_flipped || []);
  const waitFor = s.col_waiting_for;
  const isMyFlip = (waitFor === s.my_idx);
  h += '<div class="text-center text-muted mb-2 mt-2">我方暗阵</div><div class="col-row">';
  for (let i=0; i<myCards.length; i++) {
    if (myFlipped.has(i)) {
      h += cardHTML(myCards[i], {small:true});
    } else if (isMyFlip) {
      h += `<div onclick="sendAction('COLLISION_FLIP',{})" class="col-card">` +
        cardHTML('?', {faceDown:true, small:true}) + '</div>';
    } else {
      h += cardHTML('?', {faceDown:true, small:true});
    }
  }
  h += '</div>';

  if (isMyFlip) {
    h += '<div class="text-center mt-2" style="color:#D4AF37">轮到你翻牌</div>';
  } else {
    h += '<div class="text-center mt-2 text-muted">等待对手翻牌...</div>';
  }
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

/* ── Keep-alive ping ───────────────────────────────── */
setInterval(() => {
  fetch('/ping').catch(() => {});
}, 4 * 60 * 1000);

/* ── Init ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', initSocket);
