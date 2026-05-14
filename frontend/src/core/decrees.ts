/**
 * 深渊法案 (Decree) — 法案池、聚合工具、暗标战力计算
 *
 * 核心思想：每个法案的 buff/debuff 都映射到 IDecreeEffect 的具体字段。
 * 引擎在各 hook 点调用 aggregateEffectsFor(playerId, state) 拿到合并后的
 * 修饰器，再消费具体字段。
 */
import type {
  IDecree, IDecreeEffect, ICard, IGameState,
  IPlayerState, IDecreeBidCombo,
} from '../types/game';
import { CardRank, GAME_CONSTANTS } from '../types/game';

// ═══════════════════════════════════════════════════════════
//  法案池 (12 张)
// ═══════════════════════════════════════════════════════════

export const DECREE_POOL: IDecree[] = [
  // ── 经济 / 过牌 ─────────────────────────────────
  {
    id: 'GLUTTONY',
    name: '暴食法案',
    emoji: '🍖',
    category: 'ECONOMY',
    buffText: '每次黑市等价购买成功后，自动从牌库顶额外抽 1 张牌。',
    debuffText: '手牌上限阀值降为 6。回合结束时若手牌 > 6，扣 10 分。',
    buff: { marketBuyBonusDraw: 1 },
    debuff: { handOverflowThreshold: 6, handOverflowPenalty: 10 },
  },
  {
    id: 'BANKRUPTCY',
    name: '破产法案',
    emoji: '💸',
    category: 'ECONOMY',
    buffText: '黑市卡牌购买基础分消耗强制改为 0（白嫖）。',
    debuffText: '每白拿 1 张牌，本局最大手牌上限永久 -1。',
    buff: { marketPriceMultiplier: 0 },
    debuff: { marketBuyHandLimitDecay: 1 },
  },
  {
    id: 'VOID',
    name: '虚无法案',
    emoji: '⚫',
    category: 'CHANT',
    buffText: '功能牌「瞬」可作为万能幻影牌，替代 A~F 任意等级凑组合。',
    debuffText: '每消耗 1 张「瞬」(凑组合或突袭)，玩家总分立即不可逆扣 15 分。',
    buff: { flashAsWildcard: true },
    debuff: { flashUsePenalty: 15 },
  },

  // ── 突袭 / 心理战 ───────────────────────────────
  {
    id: 'DEATHMATCH',
    name: '死斗法案',
    emoji: '⚔️',
    category: 'AMBUSH',
    buffText: '突袭"平局"时悬赏池不再保留，改为双方立刻各加 10 分。',
    debuffText: '迎战方输掉突袭时，被攻击方随机偷取的卡牌从 1 张变为 2 张。',
    buff: { ambushTieScoresEach: 10 },
    debuff: { ambushFoldStealCount: 2 },
  },
  {
    id: 'FOOL',
    name: '愚者法案',
    emoji: '🃏',
    category: 'AMBUSH',
    buffText: '突袭宣告"虚实之言"未被拆穿（对手怯战/迎战），宣告方立得 10 分。',
    debuffText: '说谎被成功拆穿，惩罚翻倍为 -30，并随机销毁宣告方手牌 2 张。',
    buff: { ambushBluffUnchallengedBonus: 10 },
    debuff: { ambushBluffCaughtPenaltyMult: 2, ambushBluffCaughtBurnHand: 2 },
  },
  {
    id: 'THORNS',
    name: '荆棘法案',
    emoji: '🌹',
    category: 'AMBUSH',
    buffText: '防守方迎战获胜，除常规奖励，额外从攻击方总分中吸取 12 分。',
    debuffText: '攻击方突袭打平/输掉，暗扣的攻击牌不入弃牌堆，被防守方直接没收。',
    buff: { ambushDefendWinDrain: 12 },
    debuff: { ambushAttackFailGiveCard: true },
  },
  {
    id: 'DEICIDE',
    name: '弑神法案',
    emoji: '🩸',
    category: 'AMBUSH',
    buffText: 'F 牌在突袭中击败 A 牌，对失败方额外造成 30 分暴击伤害。',
    debuffText: '打出 F 牌但撞到的不是 A，F 牌粉碎，且打出者倒扣 15 分。',
    buff: { ambushDeicideCritBonus: 30 },
    debuff: { ambushFFailedSelfPenalty: 15, ambushFFailedDestroyF: true },
  },

  // ── 计分 / 规则控制 ────────────────────────────
  {
    id: 'PRIDE',
    name: '傲慢法案',
    emoji: '👑',
    category: 'CHANT',
    buffText: '所有【蓝/绿区】组合（小顺/三条/葫芦/四条）得分额外 +15。',
    debuffText: '突袭失败或跳过时，秘力熔炉保底比例减半（35%→17.5% / 55%→27.5%）——先吃饱再说，赌局更险。',
    buff: { blueGreenComboBonus: 15 },
    debuff: { requireAmbushWinForChant: true },
  },
  {
    id: 'IMPRISONMENT',
    name: '禁锢法案',
    emoji: '⛓️',
    category: 'CHANT',
    buffText: '暗封锁阶段弃 1 张牌，可同时封锁 2 个相邻等级（如弃 C，封 B+C），对手需防范更大范围。',
    debuffText: '玩家手牌上限强制压缩为 5 张，超限立刻爆牌并扣 5 分。',
    buff: { blockadeExtraRank: true },
    debuff: { handLimitDelta: -3, handOverflowThreshold: 5, handOverflowPenalty: 5 },
  },
  {
    id: 'PARANOIA',
    name: '偏执法案',
    emoji: '👁️‍🗨️',
    category: 'CHANT',
    buffText: '所有【绿区组合】（三条/四条/葫芦）得分直接翻倍。',
    debuffText: '所有【红/蓝区顺子组合】（大顺/小顺）被强行封印，禁止提交。',
    buff: { greenComboMultiplier: 2 },
    debuff: { forbidStraights: true },
  },

  // ── 环境 / 信息战 ──────────────────────────────
  {
    id: 'OVERLOAD',
    name: '过载法案',
    emoji: '⚡',
    category: 'TEMPO',
    buffText: '若在回合开始 10 秒内点击结束回合，获得 +8 分极速奖励。',
    debuffText: '回合倒计时从 30s 改为 15s。超时不结算，跳过回合且重罚 20 分。',
    buff: { fastEndTurnBonusScore: 8, fastEndTurnThresholdMs: 10000 },
    debuff: { turnTimerMs: 15000, turnTimerSkipPenalty: 20 },
  },
  {
    id: 'EXPOSURE',
    name: '裸露法案',
    emoji: '👁️',
    category: 'AMBUSH',
    buffText: '突袭获胜方可额外销毁对手封锁区或黑市中的 1 张明牌。',
    debuffText: '废除视区隔离，双方所有手牌强制面朝上 (完全明牌)。',
    buff: { ambushWinExtraDestroy: true },
    debuff: { exposeHands: true },
  },
  {
    id: 'MIDNIGHT_BAZAAR',
    name: '黑市奇妙夜',
    emoji: '🌙',
    category: 'ECONOMY',
    buffText: '每回合可从黑市背面"盲抽" 1 张牌（免费）。奥术怪盗每回合可盲抽 2 张。',
    debuffText: '回合结束随机弃 1 张手牌（盲弃）。',
    buff: { marketFreeDrawCount: 1 },
    debuff: { handLimitDelta: 0 }, // debuff 仅在引擎里特殊处理（盲弃）
  },
];

// ═══════════════════════════════════════════════════════════
//  效果聚合 — 按字段语义合并
// ═══════════════════════════════════════════════════════════

/** 合并多个 IDecreeEffect → 单个 effect。规则：
 *   - 数字字段：累加 (sum)，但 multiplier 类取最严苛 (min for buff like price=0)
 *   - 布尔字段：OR
 *   - 阈值字段 (handOverflowThreshold) 取更严苛 (更小的)
 *   - turnTimerMs 取更严苛 (更小的)
 *   - turnTimerSkipPenalty 取更严苛 (更大的)
 */
export function mergeEffects(effects: IDecreeEffect[]): IDecreeEffect {
  const out: IDecreeEffect = {};
  const SUM_FIELDS: (keyof IDecreeEffect)[] = [
    'marketBuyBonusDraw', 'marketBuyHandLimitDecay',
    'handLimitDelta', 'handOverflowPenalty',
    'blueGreenComboBonus',
    'ambushTieScoresEach', 'ambushFoldStealCount',
    'ambushBluffUnchallengedBonus', 'ambushBluffCaughtBurnHand',
    'ambushDefendWinDrain',
    'ambushDeicideCritBonus', 'ambushFFailedSelfPenalty',
    'flashUsePenalty',
    'turnTimerSkipPenalty',
    'fastEndTurnBonusScore',
    'marketFreeDrawCount',
  ];
  const MULT_FIELDS: (keyof IDecreeEffect)[] = [
    'greenComboMultiplier', 'ambushBluffCaughtPenaltyMult',
  ];
  const MIN_FIELDS: (keyof IDecreeEffect)[] = [
    'marketPriceMultiplier', // 0 是最严苛的白嫖
    'handOverflowThreshold', // 越小越严苛
    'turnTimerMs',           // 越小越快
    'fastEndTurnThresholdMs',
  ];
  const BOOL_FIELDS: (keyof IDecreeEffect)[] = [
    'forbidStraights', 'requireAmbushWinForChant',
    'ambushAttackFailGiveCard', 'ambushFFailedDestroyF',
    'ambushWinExtraDestroy', 'blockadeExtraRank',
    'flashAsWildcard', 'exposeHands',
  ];

  for (const eff of effects) {
    if (!eff) continue;
    for (const k of SUM_FIELDS) {
      const v = eff[k] as number | undefined;
      if (typeof v === 'number') {
        (out as Record<string, unknown>)[k] = ((out[k] as number) || 0) + v;
      }
    }
    for (const k of MULT_FIELDS) {
      const v = eff[k] as number | undefined;
      if (typeof v === 'number') {
        const cur = (out[k] as number);
        (out as Record<string, unknown>)[k] = cur === undefined ? v : Math.max(cur, v);
      }
    }
    for (const k of MIN_FIELDS) {
      const v = eff[k] as number | undefined;
      if (typeof v === 'number') {
        const cur = (out[k] as number);
        (out as Record<string, unknown>)[k] = cur === undefined ? v : Math.min(cur, v);
      }
    }
    for (const k of BOOL_FIELDS) {
      if (eff[k]) (out as Record<string, unknown>)[k] = true;
    }
  }
  return out;
}

/**
 * 拿到指定玩家当前生效的 effect 集合。
 * 第10回合后只读 supremeDecree，否则读 player.activeDecrees 中的 buff+debuff。
 */
export function aggregateEffectsFor(state: IGameState, playerId: string): IDecreeEffect {
  const player = state.players[playerId];
  if (!player) return {};

  if (state.supremeDecree) {
    return mergeEffects([state.supremeDecree.buff, state.supremeDecree.debuff]);
  }

  const effects: IDecreeEffect[] = [];
  for (const d of player.activeDecrees || []) {
    effects.push(d.buff, d.debuff);
  }
  return mergeEffects(effects);
}

// ═══════════════════════════════════════════════════════════
//  暗标战力计算
// ═══════════════════════════════════════════════════════════

/** 检测竞标牌组的微型组合类型 */
export function detectBidCombo(cards: ICard[]): IDecreeBidCombo {
  if (cards.length === 0) return 'SCATTER';

  // 排除瞬 (用户规则：瞬不能竞标，但保险起见过滤)
  const valid = cards.filter(c => c.rank !== CardRank.FLASH);
  if (valid.length === 0) return 'SCATTER';

  if (valid.length === 3) {
    const ranks = valid.map(c => c.rank).sort((a, b) => a - b);
    // 三同
    if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) return 'TRIPLE';
    // 三阶序列：连续 3 个 rank
    if (ranks[1] === ranks[0] + 1 && ranks[2] === ranks[1] + 1) return 'STRAIGHT';
  }

  // 任意张数中有同 rank 配对 → PAIR
  const rankCount = new Map<number, number>();
  for (const c of valid) {
    rankCount.set(c.rank, (rankCount.get(c.rank) || 0) + 1);
  }
  for (const cnt of rankCount.values()) {
    if (cnt >= 2) return 'PAIR';
  }

  return 'SCATTER';
}

/** 暗标战力 = 基础分总和 + 组合羁绊 (反转期影响基础分) */
export function calcBidPower(
  cards: ICard[],
  isInverted: boolean,
): { combo: IDecreeBidCombo; baseSum: number; bonus: number; total: number } {
  // 基础分：反转期 F=6/A=1, 否则 F=1/A=6 (用 baseScore 直接，已是 rank 对应分；反转时翻转)
  const baseSum = cards.reduce((s, c) => {
    if (c.rank === CardRank.FLASH) return s; // 瞬不该被竞标，但保护
    if (isInverted) {
      // 反转：A(6)→1, B(5)→2, C(4)→3, D(3)→4, E(2)→5, F(1)→6
      return s + (7 - c.baseScore);
    }
    return s + c.baseScore;
  }, 0);

  const combo = detectBidCombo(cards);
  let bonus = 0;
  if (combo === 'PAIR') bonus = GAME_CONSTANTS.DECREE_BID_PAIR_BONUS;
  else if (combo === 'STRAIGHT') bonus = GAME_CONSTANTS.DECREE_BID_STRAIGHT_BONUS;
  else if (combo === 'TRIPLE') bonus = GAME_CONSTANTS.DECREE_BID_TRIPLE_BONUS;

  return { combo, baseSum, bonus, total: baseSum + bonus };
}

// ═══════════════════════════════════════════════════════════
//  至高法案缝合 (第10回合)
// ═══════════════════════════════════════════════════════════

/** 把所有 offeredDecrees (含作废的) 缝合为 1 个全局至高法案 */
export function stitchSupremeDecree(offered: IDecree[]): IDecree {
  const buffs = offered.map(d => d.buff);
  const debuffs = offered.map(d => d.debuff);
  return {
    id: 'SUPREME',
    name: '至高法案',
    emoji: '👁️‍🗨️',
    category: 'TEMPO',
    buffText: offered.map(d => `[${d.name}] ${d.buffText}`).join('\n'),
    debuffText: offered.map(d => `[${d.name}] ${d.debuffText}`).join('\n'),
    buff: mergeEffects(buffs),
    debuff: mergeEffects(debuffs),
  };
}

// ═══════════════════════════════════════════════════════════
//  辅助：从池中随机抽取一个未触发过的法案
// ═══════════════════════════════════════════════════════════

/** offered 表示已经在本局出现过的法案 id，避免重复 */
export function rollDecree(offeredIds: string[]): IDecree {
  const remaining = DECREE_POOL.filter(d => !offeredIds.includes(d.id));
  const pool = remaining.length > 0 ? remaining : DECREE_POOL;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ═══════════════════════════════════════════════════════════
//  辅助：玩家是否被某个 effect 字段影响 (供 UI 反查)
// ═══════════════════════════════════════════════════════════

export function getOwnedDecreeNames(player: IPlayerState | undefined): string[] {
  if (!player) return [];
  return (player.activeDecrees || []).map(d => d.name);
}
