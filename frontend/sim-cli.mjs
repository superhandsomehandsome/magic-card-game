/**
 * Node CLI 跑 Monte Carlo — 同步加速版
 * 用法: cd frontend && npx tsx sim-cli.mjs [matches=200]
 *
 * 加速策略 (不改动主代码):
 *   1. 全局 setTimeout 替换为一个微队列, 每次主线程 drain
 *   2. setInterval 立即触发一次后丢弃 (避免持续 ticking)
 *   3. AI.scheduleAction 替换为直接同步调用
 *   4. 引擎/法案 timer 内部 setInterval 也走加速队列
 */
import { performance } from 'node:perf_hooks';

// ════════════════════════════════════════════════════════════
//  全局 timer 加速 (在 import 业务模块之前生效)
// ════════════════════════════════════════════════════════════

const PENDING = [];
const _origSetTimeout = global.setTimeout;
const _origSetInterval = global.setInterval;
const _origClearTimeout = global.clearTimeout;
const _origClearInterval = global.clearInterval;

let _id = 1;
const ACTIVE = new Map(); // id -> {type, cb, fired}

global.setTimeout = (cb /* , ms */) => {
  const id = _id++;
  const entry = { type: 'TO', cb, fired: false };
  ACTIVE.set(id, entry);
  PENDING.push(id);
  return id;
};
global.setInterval = (cb /* , ms */) => {
  // 仅触发一次, 避免无限循环 (Decree timer 仅需触达 deadline 即可)
  const id = _id++;
  const entry = { type: 'IV', cb, fired: false };
  ACTIVE.set(id, entry);
  PENDING.push(id);
  return id;
};
global.clearTimeout = (id) => {
  const e = ACTIVE.get(id);
  if (e) { e.cb = null; ACTIVE.delete(id); }
};
global.clearInterval = global.clearTimeout;

function drain(maxIter = 50000) {
  let n = 0;
  while (PENDING.length > 0 && n < maxIter) {
    const id = PENDING.shift();
    const e = ACTIVE.get(id);
    if (!e || !e.cb) continue;
    e.fired = true;
    const cb = e.cb;
    ACTIVE.delete(id);
    try { cb(); } catch (err) {
      if (process.env.SIM_VERBOSE) console.error('[drain]', err);
    }
    n++;
  }
  return n;
}

// ════════════════════════════════════════════════════════════
//  Date.now() 推进 — 让 decree deadline 永远是过去时
// ════════════════════════════════════════════════════════════
const _origDateNow = Date.now;
let _fakeTime = 0;
Date.now = () => {
  _fakeTime += 100; // 每次调用推进 100ms, 保证 deadline 早早过期
  return _fakeTime;
};

// ════════════════════════════════════════════════════════════
//  导入业务模块
// ════════════════════════════════════════════════════════════
const { GameEngine } = await import('./src/core/GameEngine.ts');
const { AIPlayer } = await import('./src/core/AIPlayer.ts');
const { HeroType, GamePhase } = await import('./src/types/game.ts');

// ════════════════════════════════════════════════════════════
//  AI 异步入队 + 法案 timer noop
// ════════════════════════════════════════════════════════════
// 走 PENDING 队列 (避免同步递归栈溢出)
// 保留原有 clearTimeout 行为以防 callback 堆积
AIPlayer.prototype.scheduleAction = function (fn /* , delay */) {
  if (this.actionTimer) global.clearTimeout(this.actionTimer);
  this.actionTimer = global.setTimeout(fn, 0);
};
// 关闭法案争夺的 200ms 轮询 timer (sim 不需要超时, AI 会先 submit)
GameEngine.prototype.startDecreeTimer = function () {};
GameEngine.prototype.stopDecreeTimer = function () {};

// sim: 允许 AI 提交空 bid 表示"放弃" (代替 onDecreeBidTimeout 兜底)
// — 否则 hand 为空时 AI 无法 submit, 没 timer 就会卡死
const _origSubmitDecreeBid = GameEngine.prototype.submitDecreeBid;
GameEngine.prototype.submitDecreeBid = function (playerId, cardIds) {
  if (Array.isArray(cardIds) && cardIds.length === 0) {
    const ctx = this.state.decreeContest;
    if (ctx && ctx.step === 'BIDDING' && ctx.bids[playerId] === null) {
      ctx.bids[playerId] = [];
      ctx.bidPower[playerId] = 0;
      this.emit('STATE_UPDATED', this.getStateSnapshot());
      const allBid = Object.values(ctx.bids).every(b => b !== null);
      if (allBid) this.resolveDecreeBids();
      return true;
    }
  }
  return _origSubmitDecreeBid.call(this, playerId, cardIds);
};

// 修复: 队列里堆积的 stale PHASE_CHANGED 事件可能在状态已迁移后才执行
// (例如对手在自己回合期间排入的 DRAW_MARKET handler, 等到自己回合时才被 drain)
const _origOnPhaseChanged = AIPlayer.prototype.onPhaseChanged;
AIPlayer.prototype.onPhaseChanged = function (phase) {
  // 跳过过时事件
  if (this.engine.getState().phase !== phase) return;
  return _origOnPhaseChanged.call(this, phase);
};

// ════════════════════════════════════════════════════════════
//  跑一局
// ════════════════════════════════════════════════════════════

function runOneMatch() {
  const heroes = [HeroType.PHANTOM, HeroType.WEAVER, HeroType.INQUISITOR, HeroType.SINGER];
  const h1 = heroes[Math.floor(Math.random() * heroes.length)];
  const h2 = heroes[Math.floor(Math.random() * heroes.length)];

  const engine = new GameEngine('p1', 'p2', h1, h2);
  // 禁用回合常规 timer
  engine.resetTimer = () => {};

  const _ai1 = new AIPlayer(engine, 'p1');
  const _ai2 = new AIPlayer(engine, 'p2');

  const reachRounds = new Set();
  let endTurn = 0;
  let reason = '';
  let scores = [];
  let isCollision = false;
  let decreeContestsTriggered = 0;
  let supremeApplied = false;
  let resolved = null;

  engine.on('PHASE_CHANGED', (phase) => {
    const tn = engine.getState().turnNumber;
    const round = Math.ceil(tn / 2);
    reachRounds.add(round);
    endTurn = Math.max(endTurn, tn);
    if (phase === GamePhase.COLLISION) isCollision = true;
    if (phase === GamePhase.DECREE_CONTEST) decreeContestsTriggered++;
  });
  engine.on('TURN_CHANGED', () => {
    const tn = engine.getState().turnNumber;
    endTurn = Math.max(endTurn, tn);
    reachRounds.add(Math.ceil(tn / 2));
  });
  engine.on('SUPREME_DECREE_APPLIED', () => { supremeApplied = true; });
  engine.on('GAME_OVER', (data) => {
    if (resolved) return;
    resolved = {
      endTurn: engine.getState().turnNumber,
      reachRounds,
      reason: data.reason,
      scores: Object.values(engine.getState().players).map(p => p.score),
      isCollision,
      decreeContestsTriggered,
      supremeApplied,
    };
  });

  engine.startGame();

  // 反复 drain 直到队列空 / 到上限 (硬上限避免死循环)
  const HARD_CB_LIMIT = 30000;
  let totalIter = 0;
  while (!resolved && totalIter < HARD_CB_LIMIT) {
    if (PENDING.length === 0) break;
    const drained = drain(2000);
    totalIter += drained;
    if (drained === 0) break;
  }
  if (totalIter >= HARD_CB_LIMIT && !resolved) {
    // 强制结算: 选当前积分高者获胜
    const players = Object.values(engine.getState().players);
    resolved = {
      endTurn: engine.getState().turnNumber,
      reachRounds,
      reason: 'SIM_CB_LIMIT',
      scores: players.map(p => p.score),
      isCollision,
      decreeContestsTriggered,
      supremeApplied,
    };
  }

  if (!resolved) {
    const s = engine.getState();
    resolved = {
      endTurn: s.turnNumber,
      reachRounds,
      reason: 'SIM_NO_END',
      scores: Object.values(s.players).map(p => p.score),
      isCollision,
      decreeContestsTriggered,
      supremeApplied,
      stuckPhase: s.phase,
      stuckHasDecree: !!s.decreeContest,
      stuckDecreeStep: s.decreeContest?.step,
      stuckHasAmbush: !!s.ambushState,
      stuckAmbushStage: s.ambushState?.stage,
    };
  }

  // 清理
  try { _ai1.destroy(); } catch (e) { void e; }
  try { _ai2.destroy(); } catch (e) { void e; }
  try { engine.destroy(); } catch (e) { void e; }
  ACTIVE.clear();
  PENDING.length = 0;

  return resolved;
}

// ════════════════════════════════════════════════════════════
//  Main
// ════════════════════════════════════════════════════════════

const matches = parseInt(process.argv[2] || '200', 10);
const DEBUG = process.argv.includes('--debug');
console.log(`[MonteCarlo] running ${matches} matches…`);

if (DEBUG) {
  console.log('\n=== DEBUG run (1 match) ===');
  const eng = new GameEngine('p1', 'p2', HeroType.PHANTOM, HeroType.WEAVER);
  eng.resetTimer = () => {};
  new AIPlayer(eng, 'p1');
  new AIPlayer(eng, 'p2');
  let phaseCount = 0, turnChanges = 0;
  eng.on('PHASE_CHANGED', (p) => {
    phaseCount++;
    const s = eng.getState();
    if (p === GamePhase.DRAW_MARKET && (s.turnNumber < 12 || s.turnNumber % 20 === 0)) {
      console.log(`  [DRAW] turn=${s.turnNumber} deck=${s.deckCount} curPlayer=${s.currentTurnPlayerId} hand1=${s.players.p1.hand.length} hand2=${s.players.p2.hand.length}`);
    }
    if (p === GamePhase.CHANT_SCORE && s.turnNumber < 12) {
      console.log(`  [CHANT] turn=${s.turnNumber} curPlayer=${s.currentTurnPlayerId} score1=${s.players.p1.score} score2=${s.players.p2.score}`);
    }
  });
  eng.on('TURN_CHANGED', () => {
    turnChanges++;
    if (turnChanges < 8 || turnChanges % 30 === 0) {
      const s = eng.getState();
      console.log(`  [TURN] tn=${s.turnNumber} deck=${s.deckCount} h1=${s.players.p1.hand.length} h2=${s.players.p2.hand.length} sc=[${s.players.p1.score},${s.players.p2.score}]`);
    }
  });
  eng.on('GAME_OVER', d => console.log(`  [GAME_OVER] ${d.reason}`));

  eng.startGame();
  let total = 0, stuck = 0;
  while (total < 500000) {
    if (PENDING.length === 0) break;
    const d = drain(5000);
    total += d;
    if (d === 0) { stuck++; if (stuck > 3) break; } else stuck = 0;
  }
  console.log(`  final turnNumber=${eng.getState().turnNumber} phase=${eng.getState().phase} totalCallbacks=${total}`);
  console.log(`  decreesTriggered=${phaseCount}, p1.score=${eng.getState().players.p1.score}, p2.score=${eng.getState().players.p2.score}`);
  console.log(`  p1.hand.length=${eng.getState().players.p1.hand.length}, p2.hand.length=${eng.getState().players.p2.hand.length}`);
  console.log(`  deckCount=${eng.getState().deckCount}`);
  process.exit(0);
}

const t0 = performance.now();
const results = [];
for (let i = 0; i < matches; i++) {
  if (i % 10 === 0) {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(`  [${i}/${matches}] elapsed=${elapsed}s`);
  }
  const t = performance.now();
  results.push(runOneMatch());
  const dt = performance.now() - t;
  if (dt > 1000) console.log(`    ! match ${i} took ${dt.toFixed(0)}ms`);
}
const t1 = performance.now();
process.stdout.write(`\r  ${matches}/${matches}  done in ${((t1 - t0) / 1000).toFixed(1)}s\n\n`);

// ════════════════════════════════════════════════════════════
//  统计
// ════════════════════════════════════════════════════════════
const reach = (k) => results.filter(r => r.reachRounds.has(k)).length / matches;
const avg = (sel) => results.reduce((s, r) => s + sel(r), 0) / matches;
const reasonHist = {};
for (const r of results) reasonHist[r.reason] = (reasonHist[r.reason] || 0) + 1;
const wins = results.map(r => Math.max(...r.scores));
const loses = results.map(r => Math.min(...r.scores));

const turnHist = new Map();
for (const r of results) turnHist.set(r.endTurn, (turnHist.get(r.endTurn) || 0) + 1);
const turnDist = [...turnHist.entries()].sort((a, b) => a[0] - b[0]);

console.log('═══════════════════════════════════════');
console.log(`  Matches: ${matches}`);
console.log(`  Avg end turnNumber: ${avg(r => r.endTurn).toFixed(2)}`);
console.log(`  Avg win score:  ${avg(r => Math.max(...r.scores)).toFixed(1)}`);
console.log(`  Avg lose score: ${avg(r => Math.min(...r.scores)).toFixed(1)}`);
console.log(`  Collision rate:    ${(results.filter(r => r.isCollision).length / matches * 100).toFixed(1)}%`);
console.log('───────────────────────────────────────');
console.log(`  回合触达率 (round = ceil(turn/2)):`);
console.log(`    R1  (turn≥1):  ${(reach(1) * 100).toFixed(1)}%`);
console.log(`    R4  (turn≥7):  ${(reach(4) * 100).toFixed(1)}%`);
console.log(`    R7  (turn≥13): ${(reach(7) * 100).toFixed(1)}%`);
console.log(`    R10 (turn≥19): ${(reach(10) * 100).toFixed(1)}%   ← 至高法案触发率`);
console.log('───────────────────────────────────────');
console.log(`  法案争夺触发数 (per match):`);
const dcMin = Math.min(...results.map(r => r.decreeContestsTriggered));
const dcMax = Math.max(...results.map(r => r.decreeContestsTriggered));
console.log(`    avg: ${avg(r => r.decreeContestsTriggered).toFixed(2)}, range: ${dcMin}-${dcMax}`);
console.log(`  Supreme decree applied: ${results.filter(r => r.supremeApplied).length} matches (${(results.filter(r => r.supremeApplied).length / matches * 100).toFixed(1)}%)`);
console.log('───────────────────────────────────────');
console.log(`  结束原因分布:`);
for (const [k, v] of Object.entries(reasonHist).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${k.padEnd(20)} ${v.toString().padStart(4)} (${(v / matches * 100).toFixed(1)}%)`);
}
const stuck = results.filter(r => r.reason === 'SIM_NO_END' || r.reason === 'SIM_CB_LIMIT');
if (stuck.length) {
  const stuckPhaseHist = {};
  for (const r of stuck) {
    const k = `${r.stuckPhase}${r.stuckHasDecree ? `:decree-${r.stuckDecreeStep}` : ''}${r.stuckHasAmbush ? `:ambush-${r.stuckAmbushStage}` : ''}`;
    stuckPhaseHist[k] = (stuckPhaseHist[k] || 0) + 1;
  }
  console.log(`  卡死时 phase 分布:`);
  for (const [k, v] of Object.entries(stuckPhaseHist).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(40)} ${v}`);
  }
}
console.log('───────────────────────────────────────');
console.log(`  endTurn 分布 (前 15 桶):`);
for (const [t, c] of turnDist.slice(0, 15)) {
  const bar = '█'.repeat(Math.round(c / matches * 60));
  console.log(`    turn ${t.toString().padStart(3)}: ${c.toString().padStart(4)} ${bar}`);
}
console.log('═══════════════════════════════════════');

// 恢复
Date.now = _origDateNow;
global.setTimeout = _origSetTimeout;
global.setInterval = _origSetInterval;
global.clearTimeout = _origClearTimeout;
global.clearInterval = _origClearInterval;
process.exit(0);
