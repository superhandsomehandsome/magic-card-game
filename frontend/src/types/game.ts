/**
 * 秘术对决：禁忌魔典 — 领域模型定义 (Domain Model Types)
 * 整个系统的心脏，所有组件严格依赖以下约束。
 */

// ═══════════════════════════════════════════════════════════
//  1. 卡牌与枚举系统
// ═══════════════════════════════════════════════════════════

/** 胜负与计分底座：A(6)>B>C>D>E>F(1)。绝对特例：F 赢 A。 */
export enum CardRank {
  A = 6,
  B = 5,
  C = 4,
  D = 3,
  E = 2,
  F = 1,
  FLASH = 0, // 瞬 — 功能牌
}

export enum HeroType {
  PHANTOM = 'Phantom',       // 奥术怪盗
  WEAVER = 'Weaver',         // 命运织梦者
  INQUISITOR = 'Inquisitor', // 至高审判官
  SINGER = 'Singer',         // 以太歌者
}

export interface ICard {
  id: string;
  rank: CardRank;
  baseScore: number;
  isPhantom?: boolean; // 命运织梦者专属虚影牌标记
}

// ═══════════════════════════════════════════════════════════
//  2. 状态机阶段枚举 (FSM)
// ═══════════════════════════════════════════════════════════

export enum GamePhase {
  IDLE = 'IDLE',
  HERO_SELECT = 'HERO_SELECT',         // 英雄选择
  DECREE_CONTEST = 'DECREE_CONTEST',   // 阶段-1：深渊法案争夺 (Round 1/4/7 开局)
  BOUNTY_ROLL = 'BOUNTY_ROLL',         // 阶段0：喋血悬赏 (The Blood Bounty)
  DRAW_MARKET = 'DRAW_MARKET',         // 阶段1：汲取与黑市
  AMBUSH_DECLARE = 'AMBUSH_DECLARE',   // 阶段2：突袭-攻击方宣告 (Bluff)
  AMBUSH_DEFEND = 'AMBUSH_DEFEND',     // 阶段2：突袭-防守方抉择 (Call/Fold)
  CHANT_SCORE = 'CHANT_SCORE',         // 阶段3：咏唱计分 (Chant)
  BLOCKADE_END = 'BLOCKADE_END',       // 阶段4：封锁与结束
  COLLISION = 'COLLISION',             // 终局：魔力对撞
  GAME_OVER = 'GAME_OVER',            // 终局对撞或 180分斩杀
}

// ═══════════════════════════════════════════════════════════
//  3. 全局对局状态 (GameState)
// ═══════════════════════════════════════════════════════════

export interface IGameState {
  matchId: string;
  currentTurnPlayerId: string;
  phase: GamePhase;
  turnNumber: number;
  timer: number;               // 当前阶段剩余时间 (ms)，归0强制 NextPhase
  bountyPool: number;          // 喋血悬赏池 (平局可滚雪球累计)
  isInverted: boolean;         // 以太歌者大招：是否反转大小
  invertedTurnsLeft: number;   // 反转剩余回合数
  players: Record<string, IPlayerState>;
  marketCards: ICard[];        // 始终维持 3 张
  deckCount: number;           // 牌库数量 (归0进入魔力对撞)
  discardPile: ICard[];
  ambushState: IAmbushState | null;
  collisionState: ICollisionState | null;
  consecutiveTimeouts: Record<string, number>; // AFK 检测
  log: IGameLog[];

  /** 双方都完成咏唱+封锁后递增。决定第 1/4/7/10 回合的法案触发 */
  roundNumber: number;
  /** 当前法案争夺子状态 (仅 phase==DECREE_CONTEST 时非空) */
  decreeContest: IDecreeContestState | null;
  /** 历来出现过的法案及其归属 (用于第10回合至高法案缝合) */
  offeredDecrees: IOfferedDecree[];
  /** 第10回合生成的至高法案 (强制全局共享) */
  supremeDecree: IDecree | null;
  /** 已经触发过法案争夺的 round 标记 (避免重复触发) */
  decreeRoundsTriggered: number[];
  /** 待结算的偷牌请求 (突袭怯战时由胜方亲手挑选), 为 null 时无待办 */
  pendingSteal: IPendingSteal | null;
}

/** 偷牌待办: 胜方需从对手手牌(面朝下)中挑选 N 张 */
export interface IPendingSteal {
  chooserId: string;       // 谁来挑 (突袭赢家)
  fromPlayerId: string;    // 从谁那里偷
  count: number;           // 必须挑几张
  reason: string;          // 日志用
}

export interface IPlayerState {
  id: string;
  name: string;
  hero: HeroType;
  score: number;               // 目标 200 分
  hand: ICard[];               // 上限 8 张
  blockadeZone: ICard | null;  // 封锁区
  /** Imprisonment 法案：可封锁相邻的第 2 个 rank */
  blockadeZone2: ICard | null;
  hasUsedUltimate: boolean;
  ambushesThisTurn: number;    // 本回合突袭次数(上限2)
  marketBuysThisTurn: number;  // 本回合黑市购买次数(怪盗无限制,其他人限1)
  /** 法案争夺中赢得/分配到的私有法案 (第10回合后被至高法案抹除) */
  activeDecrees: IDecree[];
  /** Bankruptcy 累计：每次白嫖一张牌，永久 -1 手牌上限 */
  handLimitDecay: number;
  /** Pride 标记：本回合是否已经赢过一次突袭 (用于解除咏唱锁) */
  ambushWonThisTurn: boolean;
  /** 破法者标记：被诅咒，下次咏唱 -15 分 */
  cursedNextChant: boolean;
  /** 先知低语：本局是否已使用（用一次全局生效） */
  hasUsedOracle: boolean;
  /** 黑暗献祭：本回合是否已使用 */
  hasUsedDarkSacrificeThisTurn: boolean;
}

// ═══════════════════════════════════════════════════════════
//  4. 突袭状态子模型
// ═══════════════════════════════════════════════════════════

export type AmbushDeclaration = CardRank | 'SILENT';

export interface IAmbushState {
  attackerId: string;
  defenderId: string;
  attackCard: ICard;
  declaration: AmbushDeclaration | null; // 宣告 or 沉默
  defenderCard: ICard | null;            // 迎战时防守方打出的牌
  resolved: boolean;
}

// ═══════════════════════════════════════════════════════════
//  5. 魔力对撞状态
// ═══════════════════════════════════════════════════════════

export type CollisionRound = 'FLOP' | 'TURN' | 'RIVER';

export interface ICollisionState {
  round: CollisionRound;
  roundIndex: number;
  playerCards: Record<string, ICard[]>;  // 每玩家暗阵
  revealedCards: Record<string, ICard[]>;
  pot: number;
  foldedPlayer: string | null;
  /** 排兵布阵：玩家是否已确认揭牌顺序 */
  orderConfirmed?: Record<string, boolean>;
}

// ═══════════════════════════════════════════════════════════
//  6. 指令队列 (Command Queue for UI)
// ═══════════════════════════════════════════════════════════

export type ActionType =
  | 'SPAWN_BOUNTY'      // 掉落悬赏金币 (阶段0)
  | 'SCREEN_SHAKE'      // 屏幕震动 (审判官大招)
  | 'CARD_CLASH'        // 卡牌对撞 (突袭拼点结算)
  | 'VFX_BURN'          // 卡牌燃烧/粉碎 (黑市支付 / 封锁破拆)
  | 'VFX_REVERSE'       // 空间反转滤镜 (以太歌者大招)
  | 'CARD_DRAW'         // 抽牌动画
  | 'CARD_STEAL'        // 偷牌动画
  | 'SCORE_BURST'       // 得分爆发
  | 'SLOW_MOTION'       // 时停 (终局)
  | 'VICTORY_SPLASH'    // 胜利演出
  | 'AUDIO_MUTE'        // 全场静音
  | 'COMBO_HIGHLIGHT'   // 组合高亮
  | 'BLOCKADE_CHAIN'    // 封锁锁链特效
  | 'BOUNTY_RETAINED'   // 血池保留提示
  | 'DICE_ROLL'         // 骰子翻滚
  | 'PHANTOM_COIN'      // 怪盗金币特效
  | 'FATE_DICE'         // 命运骰子特效
  | 'COLLISION_CLASH'   // 对撞碰撞
  | 'AMBUSH_BLUFF'      // 拆穿结算 (切牌动画)
  | 'AMBUSH_FOLD'       // 怯战结算 (窃取动画)
  | 'FLASH_SWAP'        // 瞬换牌特效
  | 'VFX_BID_COMBO'     // 暗标组合触发 (祭坛连线发光 + 血字弹幕)
  | 'GLOBAL_MUTATION'   // 第10回合至高法案降临
  | 'DECREE_AWARDED'    // 法案归属时的卷轴飞入特效
  | 'DECREE_VOIDED';    // 法案作废 (灰烬)

export interface IActionCommand {
  type: ActionType;
  payload: Record<string, unknown>;
  durationMs: number; // 阻塞 UI 队列的时间
}

// ═══════════════════════════════════════════════════════════
//  7. 英雄策略接口
// ═══════════════════════════════════════════════════════════

export interface IHeroStrategy {
  heroType: HeroType;
  onInitialize(engine: IGameEngineAPI): void;
  onTurnStart?(engine: IGameEngineAPI, playerId: string): void;
  onTurnEnd?(engine: IGameEngineAPI, playerId: string): void;
}

export interface IGameEngineAPI {
  getState(): Readonly<IGameState>;
  mutateState(mutator: (state: IGameState) => void): void;
  pushAction(action: IActionCommand): void;
  emit(event: string, ...args: unknown[]): void;
}

// ═══════════════════════════════════════════════════════════
//  8. 计分组合
// ═══════════════════════════════════════════════════════════

export enum ComboType {
  GRAND_STRAIGHT = 'GRAND_STRAIGHT',   // 大顺 (A-B-C-D-E-F)
  SMALL_STRAIGHT = 'SMALL_STRAIGHT',   // 小顺 (连续4+张)
  THREE_OF_KIND = 'THREE_OF_KIND',     // 三条
  FOUR_OF_KIND = 'FOUR_OF_KIND',       // 四条
  FULL_HOUSE = 'FULL_HOUSE',           // 葫芦
  PAIR = 'PAIR',                       // 对子
}

export interface IComboResult {
  type: ComboType;
  cards: ICard[];
  /** 组合原始得分（含倍率，未减衰减/罚分） */
  score: number;
  /** 封锁罚分：被对手封锁 rank 的每张牌 baseScore × 3 */
  blockedPenalty?: number;
}

// ═══════════════════════════════════════════════════════════
//  9. 游戏日志
// ═══════════════════════════════════════════════════════════

export interface IGameLog {
  turn: number;
  phase: GamePhase;
  message: string;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════
//  10. 常量
// ═══════════════════════════════════════════════════════════

export const GAME_CONSTANTS = {
  WIN_SCORE: 200,
  HAND_LIMIT: 8,
  MARKET_SIZE: 3,
  MAX_AMBUSH_PER_TURN: 2,
  BLUFF_PENALTY: 15,
  BOUNTY_MULTIPLIER: 5,
  A_WIN_BONUS: 20,
  B_WIN_BONUS: 10,
  INVERSION_DURATION: 2,
  TURN_TIMER_MS: 30000,
  TIMER_WARNING_MS: 5000,
  AFK_TIMEOUT_STRIKES: 2,
  DECK_COMPOSITION: {
    [CardRank.A]: 5,
    [CardRank.B]: 6,
    [CardRank.C]: 9,
    [CardRank.D]: 13,
    [CardRank.E]: 15,
    [CardRank.F]: 18,
    [CardRank.FLASH]: 5,
  } as Record<CardRank, number>,
  TOTAL_CARDS: 71,
  COLLISION_SCORE_WEIGHT: 0.4,
  COLLISION_HAND_WEIGHT: 0.6,

  // ═══ 平衡调整：压低前期得分，推动更多对撞 ═══
  CHANT_SCORE_DECAY: 0.7,        // 咏唱得分衰减系数 (前5回合内)
  CHANT_FULL_POWER_TURN: 5,      // 从第N回合起咏唱得分恢复100%
  BOUNTY_CAP: 20,                // 悬赏池单次上限 (避免前期暴利)
  DRAW_PER_TURN: 2,              // 每回合抽牌数 (恢复至2, 加快牌库消耗 → 提高对撞概率)
  MARKET_BUY_LIMIT: 1,           // 每回合黑市购买上限 (怪盗无限制)
  EARLY_COMBO_PENALTY: 0.5,      // 前3回合组合得分额外折扣
  EARLY_COMBO_TURN_THRESHOLD: 3, // "早期"回合阈值

  // ═══ 法案争夺 (Decree Contest) ═══
  DECREE_OPT_IN_TIMER_MS: 20000,    // 抉择期 20s (足够阅读法案 buff/debuff)
  DECREE_BID_TIMER_MS: 20000,       // 暗标期 20s
  DECREE_TRIGGER_ROUNDS: [1, 4, 7] as const,
  DECREE_SUPREME_ROUND: 10,
  DECREE_BID_PAIR_BONUS: 6,
  DECREE_BID_STRAIGHT_BONUS: 10,
  DECREE_BID_TRIPLE_BONUS: 12,      // 用户调整：18 → 12
} as const;

// ═══════════════════════════════════════════════════════════
//  12. 深渊法案 (Decree System)
// ═══════════════════════════════════════════════════════════

/** 法案能修改的引擎钩子点。所有字段均为 optional，由聚合工具按字段类型合并。 */
export interface IDecreeEffect {
  // —— 黑市/抽牌 ——
  marketBuyBonusDraw?: number;          // 暴食 buff: 黑市买后 +N 抽
  marketPriceMultiplier?: number;       // 破产 buff: 价格 ×0=白嫖
  marketBuyHandLimitDecay?: number;     // 破产 debuff: 每买 -N 上限
  // —— 手牌上限/溢出 ——
  handLimitDelta?: number;              // 禁锢/暴食 debuff: 上限 -N
  handOverflowPenalty?: number;         // 暴食 debuff: 超限扣 N
  handOverflowThreshold?: number;       // 暴食 debuff: 超限阈值
  // —— 咏唱/组合 ——
  blueGreenComboBonus?: number;         // 傲慢 buff: 蓝/绿组合 +N
  greenComboMultiplier?: number;        // 偏执 buff: 绿组合 ×N
  forbidStraights?: boolean;            // 偏执 debuff: 禁顺子
  requireAmbushWinForChant?: boolean;   // 傲慢 debuff: 须先赢突袭
  // —— 突袭/心理战 ——
  ambushTieScoresEach?: number;         // 死斗 buff: 平局双方 +N
  ambushFoldStealCount?: number;        // 死斗 debuff: 怯战被偷 N 张 (默认1)
  ambushBluffUnchallengedBonus?: number;// 愚者 buff: 未拆穿 +N
  ambushBluffCaughtPenaltyMult?: number;// 愚者 debuff: 拆穿罚 ×N
  ambushBluffCaughtBurnHand?: number;   // 愚者 debuff: 拆穿额外烧 N 张
  ambushDefendWinDrain?: number;        // 荆棘 buff: 防胜吸 N 分
  ambushAttackFailGiveCard?: boolean;   // 荆棘 debuff: 攻击败=牌归对方手牌
  ambushDeicideCritBonus?: number;      // 弑神 buff: F>A 额外 +N
  ambushFFailedSelfPenalty?: number;    // 弑神 debuff: F 失手扣 N
  ambushFFailedDestroyF?: boolean;      // 弑神 debuff: F 失手粉碎 F
  ambushWinExtraDestroy?: boolean;      // 裸露 buff: 胜方额外销毁 1 张
  // —— 封锁 ——
  blockadeExtraRank?: boolean;          // 禁锢 buff: 多封 1 个相邻 rank
  // —— 瞬 ——
  flashAsWildcard?: boolean;            // 虚无 buff: 瞬作万能
  flashUsePenalty?: number;             // 虚无 debuff: 用瞬扣 N
  // —— 计时器/节奏 ——
  turnTimerMs?: number;                 // 过载 debuff: 倒计时改 N ms
  turnTimerSkipPenalty?: number;        // 过载 debuff: 超时罚 N
  fastEndTurnBonusScore?: number;       // 过载 buff: 极速结束 +N
  fastEndTurnThresholdMs?: number;      // 过载 buff: 阈值 (从启动算起 N ms 内)
  // —— 视区/信息战 ——
  exposeHands?: boolean;                // 裸露 debuff: 双方明牌
}

/** 一个具体的深渊法案 */
export interface IDecree {
  id: string;             // e.g. "GLUTTONY"
  name: string;           // 中文名: "暴食法案"
  emoji: string;          // 卷轴图标 emoji
  category: 'ECONOMY' | 'AMBUSH' | 'CHANT' | 'TEMPO';
  buffText: string;
  debuffText: string;
  buff: IDecreeEffect;
  debuff: IDecreeEffect;
}

/** 法案争夺 4 步状态机的子状态 */
export interface IDecreeContestState {
  step: 'OPT_IN' | 'INTENT_RESOLVE' | 'BIDDING' | 'BID_RESOLVE';
  decree: IDecree;
  triggeringRound: number; // 1, 4, 7
  optIn: Record<string, 'CONTEST' | 'PASS' | null>;
  bids: Record<string, string[] | null>; // cardId 列表 / null = 未提交
  /** BID_RESOLVE 阶段保留的实际卡牌快照 (用于 UI 翻牌展示) */
  bidCards?: Record<string, ICard[]>;
  bidComboType: Record<string, IDecreeBidCombo | null>;
  bidPower: Record<string, number>;
  /** 阶段倒计时截止时间戳 (Date.now()+10000) */
  deadline: number;
  /** 已结算的归属 ('VOID'=作废 / 'TIE'=平局撕裂 / playerId) */
  outcome: 'VOID' | 'TIE' | string | null;
}

export type IDecreeBidCombo = 'SCATTER' | 'PAIR' | 'STRAIGHT' | 'TRIPLE';

/** 历来出现过的法案 (用于第10回合至高法案缝合) */
export interface IOfferedDecree {
  round: number;
  decree: IDecree;
  /** 归属：playerId | 'VOID' (双方放弃 / 平局撕裂) */
  ownerId: string | 'VOID';
}

// ═══════════════════════════════════════════════════════════
//  11. 英雄台词系统 (Voice Line System)
// ═══════════════════════════════════════════════════════════

export interface IHeroVoiceLine {
  onSelect: string;       // 被选择时
  onUltimate: string;     // 释放大招时
  onKill: string;         // 斩杀胜利时
  onAmbushWin: string;    // 突袭获胜时
  onDefeat: string;       // 战败时
  onTurnStart: string;    // 回合开始时
}

export const HERO_VOICE_LINES: Record<HeroType, IHeroVoiceLine> = {
  [HeroType.PHANTOM]: {
    onSelect: '暗影中的交易，从来不需要信任。',
    onUltimate: '一切都有价格……你的也不例外。',
    onKill: '这场赌局，庄家永远是我。',
    onAmbushWin: '你的口袋，现在是我的了。',
    onDefeat: '……下次，我会赌得更大。',
    onTurnStart: '让我看看今天的市场行情。',
  },
  [HeroType.WEAVER]: {
    onSelect: '命运之线，已然交织。',
    onUltimate: '看见了吗？这就是你的命运。',
    onKill: '星辰早已写好结局。',
    onAmbushWin: '织梦者的直觉，从不说谎。',
    onDefeat: '……这条线，我没能看清。',
    onTurnStart: '命运的骰子，再次转动。',
  },
  [HeroType.INQUISITOR]: {
    onSelect: '审判，即将降临。',
    onUltimate: '天平面前，众生平等。',
    onKill: '判决已下，不容上诉。',
    onAmbushWin: '正义，从不缺席。',
    onDefeat: '……律法，也有盲区。',
    onTurnStart: '秩序，需要维护。',
  },
  [HeroType.SINGER]: {
    onSelect: '聆听吧，颠覆一切的旋律。',
    onUltimate: '♪ ——万物倒悬，强弱逆转。',
    onKill: '最后的音符，献给败者。',
    onAmbushWin: '节奏，在我这边。',
    onDefeat: '……乐章，尚未终结。',
    onTurnStart: '新的乐章，开始了。',
  },
};
