/* Offline Shim — adapts existing game.js (which uses Socket.IO) to call the
 * local OfflineEngine. Provides the same socket interface so game.js works unmodified.
 * Supports two modes:
 *   - vs AI:    one human (idx 0) vs 零 (idx 1)
 *   - PVP local: two humans share one device, with pass-device overlay
 */
(function(){
'use strict';

const E = window.OfflineEngine;
let engine = null;       // GameRoom instance
let humanIdx = 0;        // current local viewer (the player whose hand is shown)
let aiIdx = 1;           // 零's index, or -1 in PVP mode
let aiPending = null;    // setTimeout id for next AI step
let isPVP = false;       // true → two humans on same device
let pendingPassTarget = -1;  // who needs to pick up the device next

// ── Fake socket ─────────────────────────────────────────
const fakeSocket = {
  _handlers: {},
  on(event, handler){ this._handlers[event] = handler; },
  emit(event, data){
    if (event === 'create_room' || event === 'create_ai_room' ||
        event === 'join_room' || event === 'reconnect_room') {
      return;
    }
    if (event === 'leave_room') { stopGame(); return; }
    if (event === 'action') {
      handleClientAction(data.action, data.data || {});
      return;
    }
  },
};

function fireEvent(event, data){
  const h = fakeSocket._handlers[event];
  if (h) h(data);
}

window.io = function(){ return fakeSocket; };

// ── Lobby controls ───────────────────────────────────────
function startOfflineGame(){
  const name = document.getElementById('playerName').value.trim() || '炼金术士';
  engine = new E.GameRoom('OFFLINE', name, '零', true);
  engine.startGame();
  humanIdx = 0;
  aiIdx = 1;
  isPVP = false;
  pendingPassTarget = -1;
  E.setAIIdx(aiIdx);

  fireEvent('connected', {});
  fireEvent('room_created', {room_id: 'OFFLINE', player_idx: humanIdx});
  pushState();
  scheduleAI();
}
window.startOfflineGame = startOfflineGame;

function startOfflinePVP(){
  const n1 = document.getElementById('playerName').value.trim() || '玩家 1';
  const n2 = (document.getElementById('playerName2').value.trim()) || '玩家 2';
  if (n2 === n1){
    alert('两名玩家需要不同的昵称');
    return;
  }
  engine = new E.GameRoom('OFFLINE_PVP', n1, n2, false);
  engine.startGame();
  humanIdx = 0;
  aiIdx = -1;
  isPVP = true;
  pendingPassTarget = -1;

  fireEvent('connected', {});
  fireEvent('room_created', {room_id: 'OFFLINE_PVP', player_idx: humanIdx});
  pushState();
  // First, ensure perspective matches active player
  syncPerspective();
}
window.startOfflinePVP = startOfflinePVP;

window.createRoom = startOfflineGame;
window.createAIRoom = startOfflineGame;
window.joinRoom = startOfflineGame;
window.tryAutoReconnect = function(){};

function stopGame(){
  if (aiPending){ clearTimeout(aiPending); aiPending = null; }
  engine = null;
  isPVP = false;
  hidePassOverlay();
  fireEvent('left_room', {});
}

function pushState(){
  if (!engine) return;
  const view = engine.getView(humanIdx);
  fireEvent('state', view);
}

// ── Determine who needs to act next ─────────────────────
function activePlayer(){
  if (!engine) return -1;
  const phase = engine.phase;
  if (phase === 'GAME_OVER' || phase === 'LOBBY') return -1;
  if (phase === 'AMBUSH_DEF_CHOICE' || phase === 'AMBUSH_BLUFF_RESPOND')
    return 1 - engine.current_player;
  if (phase === 'RED_BID'){
    for (let i=0;i<2;i++) if (!engine.red_bid_done[i]) return i;
    return -1;
  }
  if (phase === 'COLLISION_PRE_DISCARD'){
    for (let i=0;i<2;i++) if (!engine.col_pre_discard_done[i]) return i;
    return -1;
  }
  if (phase === 'COLLISION_BET'){
    if (engine.col_bet_phase === 'CALLER') return engine.col_bet_caller;
    return 1 - engine.col_bet_caller;
  }
  if (phase === 'COLLISION_FLIP') return engine._colWaitingFor();
  return engine.current_player;
}

// ── PVP only: ensure the screen perspective matches the active player ──
function syncPerspective(){
  if (!isPVP || !engine) { pushState(); return; }
  if (engine.phase === 'GAME_OVER'){ pushState(); return; }
  const target = activePlayer();
  if (target < 0){ pushState(); return; }
  if (target === humanIdx){ pushState(); return; }
  // Need to pass device to 'target'
  pendingPassTarget = target;
  showPassOverlay(engine.players[target].name);
}

function showPassOverlay(name){
  const ov = document.getElementById('passDeviceOverlay');
  const msg = document.getElementById('passDeviceMsg');
  if (msg) msg.textContent = `请将设备交给 ${name}`;
  if (ov) ov.classList.remove('hidden');
}
function hidePassOverlay(){
  const ov = document.getElementById('passDeviceOverlay');
  if (ov) ov.classList.add('hidden');
}
function confirmPassDevice(){
  if (pendingPassTarget < 0){ hidePassOverlay(); return; }
  humanIdx = pendingPassTarget;
  pendingPassTarget = -1;
  hidePassOverlay();
  pushState();
}
window.confirmPassDevice = confirmPassDevice;

// ── Outbound actions from game.js ────────────────────────
function handleClientAction(action, data){
  if (!engine) return;
  const phase = engine.phase;
  // Actor in PVP = current local viewer (humanIdx); we always treat the click
  // as the current viewer's action because syncPerspective() guarantees the
  // correct viewer is on screen.
  let actor = humanIdx;
  // For "non-active" actions (e.g. AI cancellation), still respect phase rules.
  if (!isPVP){
    if (phase === 'AMBUSH_DEF_CHOICE' || phase === 'AMBUSH_BLUFF_RESPOND')
      actor = 1 - engine.current_player;
    if (phase === 'RED_BID') actor = humanIdx;
    if (phase === 'COLLISION_PRE_DISCARD'){
      if (!engine.col_pre_discard_done[humanIdx]) actor = humanIdx;
      else actor = 1 - humanIdx;
    } else if (phase === 'COLLISION_BET'){
      if (engine.col_bet_phase === 'CALLER') actor = engine.col_bet_caller;
      else actor = 1 - engine.col_bet_caller;
    } else if (phase === 'COLLISION_FLIP'){
      actor = engine._colWaitingFor();
    }
  }

  const [ok, err] = engine.handleAction(actor, action, data);
  if (!ok){
    fireEvent('action_error', {msg: err || 'invalid action'});
    pushState();
    return;
  }
  if (isPVP){
    syncPerspective();
  } else {
    pushState();
    scheduleAI();
  }
}

// ── AI driver (only in vs-AI mode) ────────────────────────
function scheduleAI(){
  if (aiPending){ clearTimeout(aiPending); aiPending = null; }
  if (!engine || engine.phase === 'GAME_OVER') return;
  if (isPVP) return;  // never run AI in PVP

  const phase = engine.phase;
  let actor = -1;
  if (phase === 'AMBUSH_DEF_CHOICE' || phase === 'AMBUSH_BLUFF_RESPOND') actor = 1 - engine.current_player;
  else if (phase === 'RED_BID'){
    for (let i=0;i<2;i++) if (!engine.red_bid_done[i]) { actor = i; break; }
  }
  else if (phase === 'COLLISION_PRE_DISCARD') {
    for (let i=0;i<2;i++) if (!engine.col_pre_discard_done[i]) { actor = i; break; }
  } else if (phase === 'COLLISION_BET'){
    if (engine.col_bet_phase === 'CALLER') actor = engine.col_bet_caller;
    else actor = 1 - engine.col_bet_caller;
  } else if (phase === 'COLLISION_FLIP') actor = engine._colWaitingFor();
  else actor = engine.current_player;

  if (actor !== aiIdx) return;
  if (actor < 0) return;

  E.setAIIdx(aiIdx);
  const decision = E.decide(engine);
  if (!decision) return;
  const [action, data] = decision;
  const delay = E.getDelay(action);

  aiPending = setTimeout(() => {
    aiPending = null;
    if (!engine || engine.phase === 'GAME_OVER') return;
    const newDecision = (function(){
      try { E.setAIIdx(aiIdx); return E.decide(engine); } catch(e){ console.error(e); return null; }
    })();
    if (!newDecision) return;
    const [a2, d2] = newDecision;
    const [ok, err] = engine.handleAction(aiIdx, a2, d2);
    if (!ok){
      console.warn('AI action failed:', a2, err);
      const fallbackMap = {
        DRAW: ['DRAW_ACK', {}],
        MARKET: ['MARKET_SKIP', {}],
        AMBUSH_DECIDE: ['AMBUSH_DECIDE', {choice:'skip'}],
        AMBUSH_PAY_COST: ['AMBUSH_CANCEL', {}],
        AMBUSH_ATK_SELECT: ['AMBUSH_CANCEL', {}],
        SPELL: ['SPELL_SKIP', {}],
        END_DISCARD: null,
        LOCKDOWN_PLACE: ['LOCKDOWN_SKIP', {}],
      };
      const fb = fallbackMap[engine.phase];
      if (fb) engine.handleAction(aiIdx, fb[0], fb[1]);
    }
    pushState();
    scheduleAI();
  }, delay);
}

window.tryAutoPlayBGM = function(){};

})();
