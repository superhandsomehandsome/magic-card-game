/**
 * v2.1 原型 — 类型定义（完全独立，不依赖主项目）
 */

// ── 卡牌 ──

export enum Rank { A = 6, B = 5, C = 4, D = 3, E = 2, F = 1, FLASH = 0 }

export interface Card {
  id: string;
  rank: Rank;
  baseScore: number;
  /** 织命者虚影牌标记 */
  isPhantom?: boolean;
}

// ── 游戏阶段 ──

export enum Phase {
  /** 抽 3 选 2 + 黑市购买 */
  GATHER = 'GATHER',
  /** 突袭 / 蓄力(+可选封印) 二选一 */
  CONFRONT = 'CONFRONT',
  /** 突袭 — 防守方回应 */
  CONFRONT_DEFEND = 'CONFRONT_DEFEND',
  /** 咏唱选牌积分 */
  CHANT = 'CHANT',
  /** 法案争夺 */
  DECREE = 'DECREE',
  /** 法案揭晓 */
  DECREE_REVEAL = 'DECREE_REVEAL',
  /** 炼狱咏唱（牌库耗尽后的终局） */
  FINAL_CHANT = 'FINAL_CHANT',
  GAME_OVER = 'GAME_OVER',
}

// ── 对峙行动 ──

export type ConfrontAction =
  | { type: 'AMBUSH'; cardId: string }
  | { type: 'CHARGE'; sealRank?: Rank; sealCardId?: string };

export type DefendAction =
  | { type: 'FIGHT'; cardId: string }
  | { type: 'FOLD' };

// ── 咏唱组合 ──

export type ComboType =
  | 'GRAND_STRAIGHT'  // 大顺 A-F 各一 x3
  | 'FOUR_KIND'       // 四条 x4
  | 'FULL_HOUSE'      // 葫芦 x3
  | 'SMALL_STRAIGHT'  // 小顺(4+连续) x2
  | 'THREE_KIND'      // 三条 x2
  | 'PAIR';           // 对子 x1

export interface ComboResult {
  type: ComboType;
  cards: Card[];
  rawScore: number;
  multiplier: number;
  totalScore: number;
}

// ── 悬赏池提取档位 ──

export const BOUNTY_TIERS = [
  { minScore: 50, extractRate: 1.0 },
  { minScore: 30, extractRate: 0.6 },
  { minScore: 15, extractRate: 0.3 },
] as const;

// ── 法案 ──

export interface Decree {
  id: string;
  name: string;
  emoji: string;
  buffText: string;
  debuffText: string;
  /** 简化效果：直接用函数在引擎里 apply */
  effectTag: string;
}

// ── 玩家状态 ──

export interface PlayerState {
  id: string;
  name: string;
  score: number;
  hand: Card[];
  /** 当前生效的封印 rank（对手施加，本回合咏唱中该 rank 计 0 分且不参与组合） */
  sealedRank: Rank | null;
  /** 拥有的法案（赢家同吃 buff+debuff） */
  decrees: Decree[];
  /** 本回合是否已行动 */
  hasActedThisTurn: boolean;
}

// ── 突袭子状态 ──

export interface AmbushState {
  attackerId: string;
  attackCard: Card;
  defenderResponse: DefendAction | null;
  defendCard?: Card;
}

// ── 游戏全局状态 ──

export interface GameState {
  phase: Phase;
  turnNumber: number;
  roundNumber: number;
  currentPlayerId: string;
  players: Record<string, PlayerState>;
  playerOrder: [string, string];
  deck: Card[];
  marketCards: Card[];
  bountyPool: number;
  discardPile: Card[];
  /** 抽 3 选 2 临时区 */
  gatherOffers: Card[];
  /** 突袭子状态 */
  ambush: AmbushState | null;
  /** 法案竞标子状态 */
  decreeContest: {
    decree: Decree;
    bids: Record<string, string[]>;   // cardId[]
    revealed: boolean;
    outcome: string | null;           // winnerId | 'VOID'
  } | null;
  /** 炼狱咏唱剩余回合 */
  finalChantRoundsLeft: number;
  /** 已触发法案的回合 */
  decreeRoundsTriggered: number[];
  /** 日志 */
  log: string[];
  /** 胜者 ID */
  winnerId: string | null;
  /** 模式 */
  mode: 'AI' | 'HOTSEAT';
}

// ── 常量 ──

export const PROTO_CONSTANTS = {
  WIN_SCORE: 180,
  HAND_LIMIT: 8,
  MARKET_SIZE: 3,
  TOTAL_CARDS: 78,
  DRAW_OFFER_COUNT: 3,
  DRAW_KEEP_COUNT: 2,
  /** 黑市降价售价 */
  MARKET_PRICE: {
    [Rank.A]: 5,
    [Rank.B]: 4,
    [Rank.C]: 3,
    [Rank.D]: 2,
    [Rank.E]: 1,
    [Rank.F]: 1,
    [Rank.FLASH]: 0,
  } as Record<Rank, number>,
  /** 蓄力悬赏池入池 */
  CHARGE_BOUNTY: 3,
  /** 空咏唱悬赏池入池 */
  EMPTY_CHANT_BOUNTY: 5,
  /** 突袭 A 胜奖励 */
  A_WIN_BONUS: 15,
  /** 突袭 B 胜奖励 */
  B_WIN_BONUS: 8,
  /** F 弑神奖励 */
  F_SLAY_BONUS: 25,
  /** 怯战悬赏池入池倍率 */
  FOLD_BOUNTY_MULT: 2,
  /** 法案触发回合 */
  DECREE_ROUNDS: [3, 6] as readonly number[],
  /** 法案竞标时间(ms) */
  DECREE_BID_MS: 15000,
  /** 炼狱咏唱总回合 */
  FINAL_CHANT_ROUNDS: 3,
  /** 牌库组成 */
  DECK_COMPOSITION: {
    [Rank.A]: 5,
    [Rank.B]: 7,
    [Rank.C]: 10,
    [Rank.D]: 14,
    [Rank.E]: 17,
    [Rank.F]: 19,
    [Rank.FLASH]: 6,
  } as Record<Rank, number>,
} as const;
