/**
 * Roguelike 模式 — 领域模型定义（《坠典》故事模式）
 */
import type { HeroType, ICard, IDecree } from './game';

// ═══════════════════════════════════════════════════════════
//  地图 / 节点
// ═══════════════════════════════════════════════════════════

export type NodeType = 'BATTLE' | 'ELITE' | 'BOSS' | 'SHOP' | 'EVENT' | 'REST';

/** 故事模式扩展节点类型 */
export type StoryNodeType =
  | NodeType
  | 'STORY'       // 纯叙事节点（序章等）
  | 'PACT'        // 契约之门（关键抉择）
  | 'FINAL_BOSS'; // 最终 Boss（受契约抉择影响）

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

/**
 * 故事模式固定地图节点 — 位于 1000 x 3000 的世界坐标系中
 * （y 越大越深，对应"坠入深渊"）
 */
export interface IStoryNode {
  id: string;
  type: StoryNodeType;
  /** 世界坐标 x: 0-1000 */
  x: number;
  /** 世界坐标 y: 0-3000 */
  y: number;
  /** 地图上显示的节点名 */
  label: string;
  /** 所属章节 1/2/3 */
  chapter: 1 | 2 | 3;
  /** 第二章路线归属（A=永夜织巢 B=倒悬圣所） */
  route?: 'A' | 'B';
  /** 可前往的下一节点 id */
  connections: string[];
  completed: boolean;
  /** 战斗节点的敌人预设 id */
  enemyPresetId?: string;
  /** 事件节点的事件 id */
  eventId?: string;
  /** 击败该节点敌人可获得法案残页 */
  pageDrop?: boolean;
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
  /** 回响歌姬：战斗开局即处于反转态 2 回合 */
  startsInverted?: boolean;
  /** 击败奖励金币 */
  goldReward: number;
  /** Boss 的一句风味描述（战前界面显示） */
  flavor?: string;
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
  | { type: 'GAIN_PAGE'; hpCost?: number }
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
  | 'STORY'         // 叙事对话（序章/章节引言/Boss对话/结局）
  | 'PACT'          // 契约之门抉择
  | 'VICTORY'       // 通关
  | 'DEFEAT';       // 死亡

/** 契约之门的抉择 */
export type PactChoice = 'SIGN' | 'REFUSE' | 'REWRITE';

/** 结局标识 */
export type EndingId = 'NEW_MASTER' | 'BURNER' | 'STITCHER';

/** 叙事对话行 */
export interface IStoryLine {
  /** 说话者名（不填为旁白） */
  speaker?: string;
  text: string;
}

/** 待播放的叙事段落 */
export interface IPendingStory {
  title: string;
  lines: IStoryLine[];
  /** 对话结束后进入的阶段 */
  next: RunPhase;
}

export interface IRoguelikeRun {
  seed: number;
  heroType: HeroType;
  /** 故事模式固定地图全部节点 */
  nodes: IStoryNode[];
  currentNodeId: string | null;
  /** 战斗失败存活时回退用 */
  prevNodeId: string | null;
  /** 当前章节 0=序章 1/2/3=章节 */
  chapter: number;
  /** 第二章路线选择 */
  routeChosen: 'A' | 'B' | null;
  /** 契约之门抉择 */
  pactChoice: PactChoice | null;
  /** 已收集的法案残页数 */
  decreePages: number;
  /** 达成的结局 */
  endingId: EndingId | null;
  /** 待播放的叙事段落 */
  pendingStory: IPendingStory | null;
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
  /** 最终 Boss 胜分 */
  FINAL_WIN_SCORE: 150,
  /** 解锁隐藏结局所需法案残页数 */
  PAGES_REQUIRED: 3,
  /** 世界地图坐标系尺寸 */
  MAP_WIDTH: 1000,
  MAP_HEIGHT: 3000,
} as const;
