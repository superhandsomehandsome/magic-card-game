/* Offline Shim — adapts existing game.js (which uses Socket.IO) to call the
 * local OfflineEngine. Provides the same socket interface so game.js works unmodified.
 */
(function(){
'use strict';

const E = window.OfflineEngine;
let engine = null;       // GameRoom instance
let humanIdx = 0;        // human player index
let aiIdx = 1;           // 零's index
let aiPending = null;    // setTimeout id for next AI step

// ── Fake socket ─────────────────────────────────────────
const fakeSocket = {
  _handlers: {},
  on(event, handler){ this._handlers[event] = handler; },
  emit(event, data){
    // Outbound from client. We handle each by translating to engine action.
    if (event === 'create_room' || event === 'create_ai_room' ||
        event === 'join_room' || event === 'reconnect_room') {
      // Ignored; offline.html starts game directly via startOfflineGame()
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

// Override io() before game.js runs
window.io = function(){ return fakeSocket; };

// ── Lobby controls (replace network creation with local engine init) ──
function startOfflineGame(){
  const name = document.getElementById('playerName').value.trim() || '炼金术士';
  engine = new E.GameRoom('OFFLINE', name, '零', true);
  engine.startGame();
  humanIdx = 0;
  aiIdx = 1;
  E.setAIIdx(aiIdx);

  // Inform game.js as if a "room created" event happened
  fireEvent('connected', {});
  fireEvent('room_created', {room_id: 'OFFLINE', player_idx: humanIdx});
  pushState();
  scheduleAI();
}
window.startOfflineGame = startOfflineGame;

// Override game.js's lobby helpers because there's no server
window.createRoom = startOfflineGame;
window.createAIRoom = startOfflineGame;
window.joinRoom = startOfflineGame;
window.tryAutoReconnect = function(){};  // no reconnect offline

function stopGame(){
  if (aiPending){ clearTimeout(aiPending); aiPending = null; }
  engine = null;
  fireEvent('left_room', {});
}

function pushState(){
  if (!engine) return;
  const view = engine.getView(humanIdx);
  fireEvent('state', view);
}

// ── Handle outbound action from game.js ──────────────────
function handleClientAction(action, data){
  if (!engine) return;
  // Determine which player this action belongs to.
  const phase = engine.phase;
  let actor = humanIdx;
  // Defender phase: actor is the defender (which is human if AI is current_player)
  if (phase === 'AMBUSH_DEF_CHOICE') actor = 1 - engine.current_player;
  // Collision phases: actor depends on phase state
  if (phase === 'COLLISION_PRE_DISCARD'){
    // Whichever side hasn't submitted yet & matches human
    if (!engine.col_pre_discard_done[humanIdx]) actor = humanIdx;
    else actor = 1 - humanIdx;
  } else if (phase === 'COLLISION_BET'){
    if (engine.col_bet_phase === 'CALLER') actor = engine.col_bet_caller;
    else actor = 1 - engine.col_bet_caller;
  } else if (phase === 'COLLISION_FLIP'){
    actor = engine._colWaitingFor();
  }
  // Only allow human's actions; AI uses scheduleAI() directly
  // (this shim assumes the click came from the human)
  const [ok, err] = engine.handleAction(actor, action, data);
  if (!ok){
    fireEvent('action_error', {msg: err || 'invalid action'});
    pushState();
    return;
  }
  pushState();
  scheduleAI();
}

// ── Drive 零 (AI) automatically when it's their turn ─────
function scheduleAI(){
  if (aiPending){ clearTimeout(aiPending); aiPending = null; }
  if (!engine || engine.phase === 'GAME_OVER') return;

  // Determine if AI needs to act
  const phase = engine.phase;
  let actor = -1;
  if (phase === 'AMBUSH_DEF_CHOICE') actor = 1 - engine.current_player;
  else if (phase === 'COLLISION_PRE_DISCARD') {
    for (let i=0;i<2;i++) if (!engine.col_pre_discard_done[i]) { actor = i; break; }
  } else if (phase === 'COLLISION_BET'){
    if (engine.col_bet_phase === 'CALLER') actor = engine.col_bet_caller;
    else actor = 1 - engine.col_bet_caller;
  } else if (phase === 'COLLISION_FLIP') actor = engine._colWaitingFor();
  else actor = engine.current_player;

  if (actor !== aiIdx) return;
  if (actor < 0) return;

  // Get AI decision
  E.setAIIdx(aiIdx);
  const decision = E.decide(engine);
  if (!decision) return;
  const [action, data] = decision;
  const delay = E.getDelay(action);

  aiPending = setTimeout(() => {
    aiPending = null;
    if (!engine || engine.phase === 'GAME_OVER') return;
    // Re-validate that AI is still the actor (state could have changed)
    const newDecision = (function(){
      try { E.setAIIdx(aiIdx); return E.decide(engine); } catch(e){ console.error(e); return null; }
    })();
    if (!newDecision) return;
    const [a2, d2] = newDecision;
    const [ok, err] = engine.handleAction(aiIdx, a2, d2);
    if (!ok){
      console.warn('AI action failed:', a2, err);
      // Try fallback skip
      const fallbackMap = {
        DRAW: ['DRAW_ACK', {}],
        MARKET: ['MARKET_SKIP', {}],
        AMBUSH_DECIDE: ['AMBUSH_DECIDE', {choice:'skip'}],
        AMBUSH_PAY_COST: ['AMBUSH_CANCEL', {}],
        AMBUSH_ATK_SELECT: ['AMBUSH_CANCEL', {}],
        SPELL: ['SPELL_SKIP', {}],
        END_DISCARD: null,  // can't skip
        LOCKDOWN_PLACE: ['LOCKDOWN_SKIP', {}],
      };
      const fb = fallbackMap[engine.phase];
      if (fb) engine.handleAction(aiIdx, fb[0], fb[1]);
    }
    pushState();
    scheduleAI();
  }, delay);
}

// ── Disable BGM control if BGM file unavailable (works offline anyway) ──
window.tryAutoPlayBGM = function(){
  // Suppress autoplay attempts when the file:// protocol is used
  // (browsers block audio on file://)
};

})();
