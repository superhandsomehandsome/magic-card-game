/**
 * Roguelike 模式 — 领域模型定义
 */
import type { HeroType, ICard, IDecree } from './game';

// ═══════════════════════════════════════════════════════════
//  地图 / 节点
// ═══════════════════════════════════════════════════════════

export type NodeType = 'BATTLE' | 'ELITE' | 'BOSS' | 'SHOP' | 'EVENT' | 'REST';

export interface IMapNode {
  id: string;
  type: NodeType;
  row: number;
  col: number;
  /** 可前往的下一行节点 id */
  connections: string[];
  completed: boolean;
  /** 精英/Boss 节点的敌人预设 id */
  enemyPresetId?: string;
  /** 事件节点的事件 id */
  eventId?: string;
}

export interface IFloorMap {
  floor: number;
  rows: IMapNode[][];
  bossNodeId: string;
}

// ═══════════════════════════════════════════════════════════
//  敌人预设
// ═══════════════════════════════════════════════════════════

export type EnemyTier = 'WEAK' | 'NORMAL' | 'ELITE' | 'BOSS';

export interface IEnemyPreset {
  id: string;
  name: string;
  tier: EnemyTier;
  hero: HeroType;
  /** AI 侵略性 0-1 (影响突袭概率等) */
  aggression: number;
  /** AI 决策质量 0-1 (影响选牌/组合质量) */
  skill: number;
  /** 对战胜分阈值 (越低越容易打) */
  winScore: number;
  /** 初始 buff 法案 (可选) */
  startingDecree?: IDecree;
  /** 击败奖励金币 */
  goldReward: number;
}

// ═══════════════════════════════════════════════════════════
//  事件
// ═══════════════════════════════════════════════════════════

export interface IEventChoice {
  label: string;
  effect: EventEffect;
}

export type EventEffect =
  | { type: 'GAIN_GOLD'; amount: number }
  | { type: 'LOSE_GOLD'; amount: number }
  | { type: 'GAIN_HP'; amount: number }
  | { type: 'LOSE_HP'; amount: number }
  | { type: 'GAIN_CARD'; card: ICard }
  | { type: 'REMOVE_CARD' }
  | { type: 'GAIN_DECREE'; decree: IDecree }
  | { type: 'NOTHING' };

export interface IRandomEvent {
  id: string;
  title: string;
  description: string;
  choices: IEventChoice[];
}

// ═══════════════════════════════════════════════════════════
//  Roguelike Run 核心状态
// ═══════════════════════════════════════════════════════════

export type RunPhase =
  | 'MAP'           // 查看地图选择路线
  | 'BATTLE'        // 战斗进行中
  | 'REWARD'        // 战斗奖励选择
  | 'SHOP'          // 商店
  | 'EVENT'         // 随机事件
  | 'REST'          // 休息站
  | 'VICTORY'       // 通关
  | 'DEFEAT';       // 死亡

export interface IRoguelikeRun {
  seed: number;
  heroType: HeroType;
  currentFloor: number;
  currentNodeId: string | null;
  maps: IFloorMap[];
  deck: ICard[];
  gold: number;
  hp: number;
  maxHp: number;
  /** 跨战斗持续生效的法案（楼层诅咒/祝福） */
  activeDecrees: IDecree[];
  phase: RunPhase;
  /** 当前待选的战后奖励牌（3选1） */
  rewardCards: ICard[] | null;
  /** 当前事件 */
  currentEvent: IRandomEvent | null;
  /** 已完成的战斗计数 */
  battlesWon: number;
  /** 当前战斗的敌人预设 */
  currentEnemy: IEnemyPreset | null;
}

// ═══════════════════════════════════════════════════════════
//  常量
// ═══════════════════════════════════════════════════════════

export const ROGUELIKE_CONSTANTS = {
  TOTAL_FLOORS: 3,
  ROWS_PER_FLOOR: 4,
  MAX_COLS: 4,
  STARTING_HP: 100,
  STARTING_GOLD: 50,
  /** 初始牌组：比标准对战少，鼓励构筑 */
  STARTING_DECK_SIZE: 15,
  /** 休息站恢复量 */
  REST_HEAL: 25,
  /** 商店移除卡牌费用 */
  SHOP_REMOVE_COST: 30,
  /** 普通战胜分 (快节奏) */
  BATTLE_WIN_SCORE: 80,
  /** 精英战胜分 */
  ELITE_WIN_SCORE: 100,
  /** Boss 战胜分 */
  BOSS_WIN_SCORE: 120,
  /** 战斗失败时损失的 HP 基于分差 */
  DEFEAT_HP_LOSS_PER_POINT: 0.5,
  /** 战斗胜利时分差 → HP 回复比 */
  VICTORY_HEAL_RATIO: 0.15,
} as const;
