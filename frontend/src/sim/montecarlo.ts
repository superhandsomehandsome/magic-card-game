/**
 * Monte Carlo 模拟器 — AI vs AI 跑 N 局，统计：
 *   - 平均胜负分
 *   - 平均结束 turnNumber
 *   - 第 1/4/7/10 回合触达率
 *   - 终局类型分布（155分斩杀 / 对撞 / AFK）
 *
 * 用法（在浏览器 devtools）:
 *   import('./sim/montecarlo').then(m => m.runMonteCarlo(500))
 */
import { GameEngine } from '../core/GameEngine';
import { AIPlayer } from '../core/AIPlayer';
import { HeroType, GamePhase } from '../types/game';

export interface SimResult {
  matches: number;
  avgEndTurn: number;
  reach: { r1: number; r4: number; r7: number; r10: number };
  endReason: Record<string, number>;
  avgWinScore: number;
  avgLoseScore: number;
  collisionRate: number;
}

/**
 * 跑一局 AI vs AI 仿真。
 * 注意：因为 GameEngine 有 setInterval 计时器和 setTimeout，
 * 我们通过禁用 timer + 同步推进的方式来加速。
 */
async function runOneMatch(): Promise<{
  endTurn: number;
  reachRounds: Set<number>;
  reason: string;
  scores: number[];
  isCollision: boolean;
}> {
  const heroes = [HeroType.PHANTOM, HeroType.WEAVER, HeroType.INQUISITOR, HeroType.SINGER];
  const h1 = heroes[Math.floor(Math.random() * heroes.length)];
  const h2 = heroes[Math.floor(Math.random() * heroes.length)];

  const engine = new GameEngine('p1', 'p2', h1, h2);
  // 禁用真实计时器
  // @ts-expect-error 私有字段调试
  engine.resetTimer = () => { /* noop */ };

  const ai1 = new AIPlayer(engine, 'p1');
  const ai2 = new AIPlayer(engine, 'p2');

  const reachRounds = new Set<number>();
  let endTurn = 0;
  let reason = '';
  let scores: number[] = [];
  let isCollision = false;
  let resolved = false;

  return new Promise(resolve => {
    const finish = () => {
      if (resolved) return;
      resolved = true;
      ai1.destroy();
      ai2.destroy();
      engine.destroy();
      resolve({ endTurn, reachRounds, reason, scores, isCollision });
    };

    engine.on('PHASE_CHANGED', (phase: GamePhase) => {
      const round = Math.ceil(engine.getState().turnNumber / 2);
      reachRounds.add(round);
      endTurn = Math.max(endTurn, engine.getState().turnNumber);
      if (phase === GamePhase.COLLISION) isCollision = true;
    });

    engine.on('GAME_OVER', (data: { reason: string }) => {
      const state = engine.getState();
      endTurn = state.turnNumber;
      reason = data.reason;
      scores = Object.values(state.players).map(p => p.score);
      finish();
    });

    // 安全网：30 秒不结束就强制 timeout
    setTimeout(() => {
      if (!resolved) {
        reason = 'TIMEOUT_SIM';
        scores = Object.values(engine.getState().players).map(p => p.score);
        endTurn = engine.getState().turnNumber;
        finish();
      }
    }, 30000);

    engine.startGame();
  });
}

export async function runMonteCarlo(matches = 500): Promise<SimResult> {
  const results: Awaited<ReturnType<typeof runOneMatch>>[] = [];
  for (let i = 0; i < matches; i++) {
    if (i % 50 === 0) console.log(`[MonteCarlo] ${i}/${matches}`);
    results.push(await runOneMatch());
  }

  const summary: SimResult = {
    matches,
    avgEndTurn: results.reduce((s, r) => s + r.endTurn, 0) / matches,
    reach: {
      r1: results.filter(r => r.reachRounds.has(1)).length / matches,
      r4: results.filter(r => r.reachRounds.has(4)).length / matches,
      r7: results.filter(r => r.reachRounds.has(7)).length / matches,
      r10: results.filter(r => r.reachRounds.has(10)).length / matches,
    },
    endReason: {},
    avgWinScore: 0,
    avgLoseScore: 0,
    collisionRate: results.filter(r => r.isCollision).length / matches,
  };

  for (const r of results) {
    summary.endReason[r.reason] = (summary.endReason[r.reason] || 0) + 1;
  }

  const wins = results.map(r => Math.max(...r.scores));
  const loses = results.map(r => Math.min(...r.scores));
  summary.avgWinScore = wins.reduce((s, x) => s + x, 0) / matches;
  summary.avgLoseScore = loses.reduce((s, x) => s + x, 0) / matches;

  console.table(summary);
  return summary;
}

// 浏览器调试钩子
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__runMonteCarlo = runMonteCarlo;
}
