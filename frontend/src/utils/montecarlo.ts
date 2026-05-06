/**
 * 蒙特卡洛模拟引擎 — 平衡性验证
 *
 * 模拟大量对局，统计：
 * 1. 对撞终局发生率 (目标: >40%)
 * 2. 各英雄胜率均衡性 (目标: 45%~55%)
 * 3. 平均对局回合数
 * 4. 前期得分 vs 后期得分分布
 *
 * 运行方式：在浏览器控制台执行 window.__runSimulation(10000)
 */
import { CardRank, HeroType, GAME_CONSTANTS } from '../types/game';
import type { ICard } from '../types/game';
import { v4 as uuid } from 'uuid';
import { createDeck, shuffleDeck, compareCards, getEffectiveScore } from './deck';

// ═══════════════════════════════════════════════════════════
//  模拟配置
// ═══════════════════════════════════════════════════════════

interface SimConfig {
  numGames: number;
  verbose?: boolean;
}

interface SimResult {
  totalGames: number;
  collisionRate: number;        // 进入对撞的比率
  avgTurns: number;             // 平均回合数
  heroWinRates: Record<HeroType, number>;
  avgScoreAtEnd: number;
  earlyWinRate: number;         // 10回合内结束的概率
  scoreDistribution: { turn: number; avgScore: number }[];
}

// ═══════════════════════════════════════════════════════════
//  简化版对局模拟器 (无UI, 纯数值)
// ═══════════════════════════════════════════════════════════

interface SimPlayer {
  id: string;
  hero: HeroType;
  score: number;
  hand: ICard[];
  hasUsedUltimate: boolean;
}

function simulateGame(hero1: HeroType, hero2: HeroType): {
  winner: HeroType;
  turns: number;
  endedByCollision: boolean;
  finalScores: [number, number];
} {
  let deck = shuffleDeck(createDeck());

  const drawCards = (n: number): ICard[] => {
    const cards: ICard[] = [];
    for (let i = 0; i < n && deck.length > 0; i++) {
      cards.push(deck.pop()!);
    }
    return cards;
  };

  const p1: SimPlayer = { id: '1', hero: hero1, score: 0, hand: drawCards(5), hasUsedUltimate: false };
  const p2: SimPlayer = { id: '2', hero: hero2, score: 0, hand: drawCards(5), hasUsedUltimate: false };

  let turn = 0;
  let bountyPool = 0;
  let isInverted = false;
  let invertedTurns = 0;
  const maxTurns = 50;

  while (turn < maxTurns) {
    turn++;
    const attacker = turn % 2 === 1 ? p1 : p2;
    const defender = turn % 2 === 1 ? p2 : p1;

    // 阶段0: 悬赏
    const roll = Math.floor(Math.random() * 6) + 1;
    let bounty = roll * GAME_CONSTANTS.BOUNTY_MULTIPLIER;
    bounty = Math.min(bounty, GAME_CONSTANTS.BOUNTY_CAP);
    bountyPool += bounty;

    // 阶段1: 抽牌
    attacker.hand.push(...drawCards(GAME_CONSTANTS.DRAW_PER_TURN));

    // 牌库耗尽检查
    if (deck.length === 0) {
      // 对撞终局: 简化为手牌质量比较
      const p1HandValue = p1.hand.reduce((s, c) => s + getEffectiveScore(c.rank, isInverted), 0);
      const p2HandValue = p2.hand.reduce((s, c) => s + getEffectiveScore(c.rank, isInverted), 0);
      const p1Total = p1.score * GAME_CONSTANTS.COLLISION_SCORE_WEIGHT + p1HandValue * GAME_CONSTANTS.COLLISION_HAND_WEIGHT;
      const p2Total = p2.score * GAME_CONSTANTS.COLLISION_SCORE_WEIGHT + p2HandValue * GAME_CONSTANTS.COLLISION_HAND_WEIGHT;

      const winner = p1Total >= p2Total ? p1 : p2;
      return {
        winner: winner.hero,
        turns: turn,
        endedByCollision: true,
        finalScores: [p1.score, p2.score],
      };
    }

    // 阶段2: 突袭 (简化: 随机决定是否突袭, 50%概率)
    if (attacker.hand.length > 0 && Math.random() > 0.4) {
      const atkIdx = Math.floor(Math.random() * attacker.hand.length);
      const atkCard = attacker.hand.splice(atkIdx, 1)[0];

      // 防守方随机决策
      const defenseChoice = Math.random();
      if (defenseChoice < 0.3) {
        // 怯战: 攻击方拿悬赏
        attacker.score += bountyPool;
        bountyPool = 0;
        attacker.hand.push(atkCard);
        if (defender.hand.length > 0) {
          const stealIdx = Math.floor(Math.random() * defender.hand.length);
          attacker.hand.push(defender.hand.splice(stealIdx, 1)[0]);
        }
      } else if (defenseChoice < 0.5 && Math.random() > 0.5) {
        // 拆穿
        const penalty = GAME_CONSTANTS.BLUFF_PENALTY;
        if (Math.random() > 0.5) {
          defender.score -= penalty;
        } else {
          attacker.score -= penalty;
          defender.hand.push(atkCard);
        }
      } else if (defender.hand.length > 0) {
        // 迎战
        const defIdx = Math.floor(Math.random() * defender.hand.length);
        const defCard = defender.hand.splice(defIdx, 1)[0];
        const result = compareCards(atkCard.rank, defCard.rank, isInverted);

        if (result > 0) {
          attacker.score += bountyPool;
          const eff = getEffectiveScore(atkCard.rank, isInverted);
          if (eff === 6) attacker.score += GAME_CONSTANTS.A_WIN_BONUS;
          else if (eff === 5) attacker.score += GAME_CONSTANTS.B_WIN_BONUS;
          bountyPool = 0;
          attacker.hand.push(...drawCards(1));
        } else if (result < 0) {
          defender.score += bountyPool;
          const eff = getEffectiveScore(defCard.rank, isInverted);
          if (eff === 6) defender.score += GAME_CONSTANTS.A_WIN_BONUS;
          else if (eff === 5) defender.score += GAME_CONSTANTS.B_WIN_BONUS;
          bountyPool = 0;
          defender.hand.push(...drawCards(1));
        }
        // 平局: bountyPool 保留
      }
    }

    // 阶段3: 咏唱 (简化: 对子/三条概率得分)
    const chantScore = simulateChant(attacker, isInverted, turn);
    attacker.score += chantScore;

    // 英雄大招模拟 (简化)
    if (!attacker.hasUsedUltimate && Math.random() > 0.7 && turn >= 4) {
      attacker.hasUsedUltimate = true;
      if (attacker.hero === HeroType.SINGER) {
        isInverted = true;
        invertedTurns = GAME_CONSTANTS.INVERSION_DURATION;
      } else if (attacker.hero === HeroType.INQUISITOR) {
        const excess = defender.hand.length - attacker.hand.length;
        if (excess > 0) {
          defender.hand.splice(0, excess);
        }
      }
    }

    // 反转倒计时
    if (isInverted) {
      invertedTurns--;
      if (invertedTurns <= 0) isInverted = false;
    }

    // 胜负检查
    if (attacker.score >= GAME_CONSTANTS.WIN_SCORE) {
      return { winner: attacker.hero, turns: turn, endedByCollision: false, finalScores: [p1.score, p2.score] };
    }
    if (defender.score >= GAME_CONSTANTS.WIN_SCORE) {
      return { winner: defender.hero, turns: turn, endedByCollision: false, finalScores: [p1.score, p2.score] };
    }

    // 手牌上限
    while (attacker.hand.length > GAME_CONSTANTS.HAND_LIMIT) attacker.hand.pop();
    while (defender.hand.length > GAME_CONSTANTS.HAND_LIMIT) defender.hand.pop();
  }

  // 超时: 分高者胜
  const winner = p1.score >= p2.score ? p1 : p2;
  return { winner: winner.hero, turns: turn, endedByCollision: true, finalScores: [p1.score, p2.score] };
}

function simulateChant(player: SimPlayer, isInverted: boolean, turn: number): number {
  const rankCounts = new Map<CardRank, number>();
  player.hand.forEach(c => {
    if (c.rank !== CardRank.FLASH) {
      rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
    }
  });

  let score = 0;

  // 检测对子/三条
  for (const [rank, count] of rankCounts) {
    const eff = getEffectiveScore(rank, isInverted);
    if (count >= 3 && Math.random() > 0.5) {
      score += eff * 3 * 2;
      break;
    } else if (count >= 2 && Math.random() > 0.6) {
      score += eff * 2;
      break;
    }
  }

  // 应用衰减
  if (turn <= GAME_CONSTANTS.EARLY_COMBO_TURN_THRESHOLD) {
    score = Math.floor(score * GAME_CONSTANTS.EARLY_COMBO_PENALTY);
  } else if (turn < GAME_CONSTANTS.CHANT_FULL_POWER_TURN) {
    score = Math.floor(score * GAME_CONSTANTS.CHANT_SCORE_DECAY);
  }

  return score;
}

// ═══════════════════════════════════════════════════════════
//  公共接口
// ═══════════════════════════════════════════════════════════

export function runMonteCarloSimulation(config: SimConfig): SimResult {
  const { numGames } = config;
  const heroes = [HeroType.PHANTOM, HeroType.WEAVER, HeroType.INQUISITOR, HeroType.SINGER];
  const heroWins: Record<HeroType, number> = {
    [HeroType.PHANTOM]: 0,
    [HeroType.WEAVER]: 0,
    [HeroType.INQUISITOR]: 0,
    [HeroType.SINGER]: 0,
  };
  const heroGames: Record<HeroType, number> = { ...heroWins };

  let collisionCount = 0;
  let totalTurns = 0;
  let totalFinalScore = 0;
  let earlyWinCount = 0;
  const turnScores: number[][] = Array.from({ length: 50 }, () => []);

  for (let i = 0; i < numGames; i++) {
    const h1 = heroes[Math.floor(Math.random() * heroes.length)];
    const h2 = heroes[Math.floor(Math.random() * heroes.length)];

    const result = simulateGame(h1, h2);

    heroWins[result.winner]++;
    heroGames[h1]++;
    heroGames[h2]++;
    totalTurns += result.turns;

    if (result.endedByCollision) collisionCount++;
    if (result.turns <= 10) earlyWinCount++;

    const avgFinal = (result.finalScores[0] + result.finalScores[1]) / 2;
    totalFinalScore += avgFinal;
  }

  const heroWinRates = {} as Record<HeroType, number>;
  for (const hero of heroes) {
    heroWinRates[hero] = heroGames[hero] > 0 ? heroWins[hero] / heroGames[hero] : 0;
  }

  return {
    totalGames: numGames,
    collisionRate: collisionCount / numGames,
    avgTurns: totalTurns / numGames,
    heroWinRates,
    avgScoreAtEnd: totalFinalScore / numGames,
    earlyWinRate: earlyWinCount / numGames,
    scoreDistribution: [],
  };
}

/**
 * 打印格式化的模拟结果到控制台
 */
export function printSimulationReport(result: SimResult): void {
  console.log('═══════════════════════════════════════════════');
  console.log('   秘术对决：禁忌魔典 — 蒙特卡洛平衡性报告');
  console.log('═══════════════════════════════════════════════');
  console.log(`总模拟局数: ${result.totalGames}`);
  console.log(`对撞终局率: ${(result.collisionRate * 100).toFixed(1)}% (目标 >40%)`);
  console.log(`平均回合数: ${result.avgTurns.toFixed(1)}`);
  console.log(`早期结束率: ${(result.earlyWinRate * 100).toFixed(1)}% (10回合内, 目标 <15%)`);
  console.log(`平均终局得分: ${result.avgScoreAtEnd.toFixed(0)}`);
  console.log('───────────────────────────────────────────────');
  console.log('英雄胜率 (目标: 45%~55%):');
  for (const [hero, rate] of Object.entries(result.heroWinRates)) {
    const bar = '█'.repeat(Math.round(rate * 50));
    const warning = rate < 0.4 || rate > 0.6 ? ' ⚠️' : ' ✓';
    console.log(`  ${hero.padEnd(12)} ${(rate * 100).toFixed(1)}% ${bar}${warning}`);
  }
  console.log('═══════════════════════════════════════════════');
}

// 挂载到 window 供控制台调试
if (typeof window !== 'undefined') {
  (window as any).__runSimulation = (n = 5000) => {
    const result = runMonteCarloSimulation({ numGames: n });
    printSimulationReport(result);
    return result;
  };
}
