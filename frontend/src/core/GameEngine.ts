/**
 * 秘术对决：禁忌魔典 — 核心引擎 (Pure Logic, No UI Dependencies)
 * 基于 EventEmitter 实现状态机驱动的游戏逻辑。
 * UI 组件不应包含"谁赢了"、"扣多少分"的逻辑。
 */
import EventEmitter from 'eventemitter3';
import { v4 as uuid } from 'uuid';
import type {
  IGameState, IPlayerState, ICard, IActionCommand,
  IHeroStrategy, IAmbushState, IGameEngineAPI,
  IDecree, IDecreeBidCombo,
} from '../types/game';
import {
  GamePhase, CardRank, HeroType,
  GAME_CONSTANTS,
} from '../types/game';
import type { AmbushDeclaration } from '../types/game';
import { createDeck, shuffleDeck, compareCards, getEffectiveScore } from '../utils/deck';
import {
  rollDecree, calcBidPower, stitchSupremeDecree,
  aggregateEffectsFor,
} from './decrees';

// ═══════════════════════════════════════════════════════════
//  事件类型
// ═══════════════════════════════════════════════════════════

export type EngineEvent =
  | 'PHASE_CHANGED'
  | 'STATE_UPDATED'
  | 'AMBUSH_RESOLVED'
  | 'SCORE_CHANGED'
  | 'GAME_OVER'
  | 'DECK_EMPTY'
  | 'TIMER_TICK'
  | 'ACTION_QUEUED'
  | 'TURN_CHANGED'
  | 'HERO_ABILITY_USED'
  | 'DECREE_CONTEST_STARTED'
  | 'DECREE_INTENT_RESOLVED'
  | 'DECREE_BID_RESOLVED'
  | 'DECREE_AWARDED'
  | 'SUPREME_DECREE_APPLIED';

// ═══════════════════════════════════════════════════════════
//  GameEngine 类
// ═══════════════════════════════════════════════════════════

export class GameEngine extends EventEmitter implements IGameEngineAPI {
  private state: IGameState;
  private actionQueue: IActionCommand[] = [];
  private heroStrategies: Map<string, IHeroStrategy> = new Map();
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private deck: ICard[] = [];

  constructor(player1Id: string, player2Id: string, hero1: HeroType, hero2: HeroType) {
    super();
    this.deck = shuffleDeck(createDeck());

    const p1Hand = this.drawFromDeck(5);
    const p2Hand = this.drawFromDeck(5);
    const marketCards = this.drawFromDeck(GAME_CONSTANTS.MARKET_SIZE);

    this.state = {
      matchId: uuid(),
      currentTurnPlayerId: player1Id,
      phase: GamePhase.IDLE,
      turnNumber: 1,
      timer: GAME_CONSTANTS.TURN_TIMER_MS,
      bountyPool: 0,
      isInverted: false,
      invertedTurnsLeft: 0,
      players: {
        [player1Id]: this.createPlayer(player1Id, 'Player 1', hero1, p1Hand),
        [player2Id]: this.createPlayer(player2Id, 'Player 2', hero2, p2Hand),
      },
      marketCards,
      deckCount: this.deck.length,
      discardPile: [],
      ambushState: null,
      collisionState: null,
      consecutiveTimeouts: { [player1Id]: 0, [player2Id]: 0 },
      log: [],
      roundNumber: 1,
      decreeContest: null,
      offeredDecrees: [],
      supremeDecree: null,
      decreeRoundsTriggered: [],
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  IGameEngineAPI 接口实现
  // ═══════════════════════════════════════════════════════════

  public getState(): Readonly<IGameState> {
    return Object.freeze({ ...this.state });
  }

  public mutateState(mutator: (state: IGameState) => void): void {
    mutator(this.state);
    this.emit('STATE_UPDATED', this.getStateSnapshot());
  }

  /** 加/减分并广播 SCORE_CHANGED 事件，统一供 UI 显示 toast */
  private addScore(playerId: string, delta: number, source: string): void {
    const player = this.getPlayer(playerId);
    if (!player) return;
    player.score += delta;
    this.emit('SCORE_CHANGED', {
      playerId,
      delta,
      source,
      newScore: player.score,
    });
  }

  public pushAction(action: IActionCommand): void {
    this.actionQueue.push(action);
    this.emit('ACTION_QUEUED', action);
  }

  // ═══════════════════════════════════════════════════════════
  //  公共状态 API
  // ═══════════════════════════════════════════════════════════

  public getStateSnapshot(): Readonly<IGameState> {
    return Object.freeze(JSON.parse(JSON.stringify(this.state)));
  }

  public getActionQueue(): IActionCommand[] {
    return [...this.actionQueue];
  }

  public consumeActionQueue(): IActionCommand[] {
    const queue = [...this.actionQueue];
    this.actionQueue = [];
    return queue;
  }

  public registerHeroStrategy(playerId: string, strategy: IHeroStrategy): void {
    this.heroStrategies.set(playerId, strategy);
    strategy.onInitialize(this);
  }

  // ═══════════════════════════════════════════════════════════
  //  状态流转控制 (FSM)
  // ═══════════════════════════════════════════════════════════

  public startGame(): void {
    this.nextPhase(GamePhase.BOUNTY_ROLL);
  }

  public nextPhase(targetPhase?: GamePhase): void {
    const phaseOrder: GamePhase[] = [
      GamePhase.BOUNTY_ROLL,
      GamePhase.DRAW_MARKET,
      GamePhase.AMBUSH_DECLARE,
      GamePhase.CHANT_SCORE,
      GamePhase.BLOCKADE_END,
    ];

    let next: GamePhase;
    if (targetPhase) {
      next = targetPhase;
    } else {
      const currentIdx = phaseOrder.indexOf(this.state.phase);
      if (currentIdx === phaseOrder.length - 1) {
        this.endTurn();
        return;
      }
      next = phaseOrder[currentIdx + 1] || GamePhase.BOUNTY_ROLL;
    }

    // ═══ 法案争夺触发检测 ═══
    // 仅在准备进入 BOUNTY_ROLL 时检查；round 1/4/7 触发争夺，round 10 触发至高法案
    if (next === GamePhase.BOUNTY_ROLL) {
      const round = Math.ceil(this.state.turnNumber / 2);
      if (this.shouldTriggerDecree(round)) {
        this.state.decreeRoundsTriggered.push(round);
        if (round === GAME_CONSTANTS.DECREE_SUPREME_ROUND) {
          this.applySupremeDecree();
          // fall through 继续进入 BOUNTY_ROLL
        } else {
          this.startDecreeContest(round);
          return; // 暂停常规流程，等待法案争夺结算
        }
      }
    }

    this.state.phase = next;
    this.resetTimer();
    this.emit('PHASE_CHANGED', next);

    if (next === GamePhase.BOUNTY_ROLL) {
      this.executeBountyRoll();
    }
  }

  private shouldTriggerDecree(round: number): boolean {
    const triggers: number[] = [
      ...GAME_CONSTANTS.DECREE_TRIGGER_ROUNDS,
      GAME_CONSTANTS.DECREE_SUPREME_ROUND,
    ];
    return triggers.includes(round)
      && !this.state.decreeRoundsTriggered.includes(round);
  }

  // ═══════════════════════════════════════════════════════════
  //  深渊法案争夺 (DECREE_CONTEST)
  // ═══════════════════════════════════════════════════════════

  /** 启动一次法案争夺 (round 1/4/7) */
  private startDecreeContest(round: number): void {
    const offered = this.state.offeredDecrees.map(o => o.decree.id);
    const decree = rollDecree(offered);
    const playerIds = Object.keys(this.state.players);

    this.state.decreeContest = {
      step: 'OPT_IN',
      decree,
      triggeringRound: round,
      optIn: { [playerIds[0]]: null, [playerIds[1]]: null },
      bids: { [playerIds[0]]: null, [playerIds[1]]: null },
      bidComboType: { [playerIds[0]]: null, [playerIds[1]]: null },
      bidPower: { [playerIds[0]]: 0, [playerIds[1]]: 0 },
      deadline: Date.now() + GAME_CONSTANTS.DECREE_OPT_IN_TIMER_MS,
      outcome: null,
    };
    this.state.phase = GamePhase.DECREE_CONTEST;
    this.state.timer = GAME_CONSTANTS.DECREE_OPT_IN_TIMER_MS;
    this.stopTimer(); // 暂停常规回合倒计时
    this.startDecreeTimer();

    this.addLog(`第 ${round} 回合开局：深渊法案 [${decree.name}] 浮现`);
    this.emit('DECREE_CONTEST_STARTED', { round, decree });
    this.emit('PHASE_CHANGED', GamePhase.DECREE_CONTEST);
    this.emit('STATE_UPDATED', this.getStateSnapshot());
  }

  /** 玩家在抉择期提交 CONTEST/PASS */
  public submitDecreeOptIn(playerId: string, choice: 'CONTEST' | 'PASS'): void {
    const ctx = this.state.decreeContest;
    if (!ctx || ctx.step !== 'OPT_IN') return;
    if (ctx.optIn[playerId] !== null) return;
    ctx.optIn[playerId] = choice;
    this.emit('STATE_UPDATED', this.getStateSnapshot());

    const allChosen = Object.values(ctx.optIn).every(c => c !== null);
    if (allChosen) this.resolveDecreeIntent();
  }

  /** 抉择期超时：未选 → 默认 PASS */
  private onDecreeOptInTimeout(): void {
    const ctx = this.state.decreeContest;
    if (!ctx || ctx.step !== 'OPT_IN') return;
    for (const pid of Object.keys(ctx.optIn)) {
      if (ctx.optIn[pid] === null) ctx.optIn[pid] = 'PASS';
    }
    this.resolveDecreeIntent();
  }

  /** Step 2: 同时揭晓双方意向 → 三分支 */
  private resolveDecreeIntent(): void {
    const ctx = this.state.decreeContest;
    if (!ctx) return;
    ctx.step = 'INTENT_RESOLVE';
    this.stopDecreeTimer();

    const playerIds = Object.keys(this.state.players);
    const choices = playerIds.map(pid => ctx.optIn[pid] || 'PASS');
    const contesters = playerIds.filter((pid, i) => choices[i] === 'CONTEST');

    this.emit('DECREE_INTENT_RESOLVED', { choices: { ...ctx.optIn } });

    if (contesters.length === 0) {
      // 双双放弃 → 作废 (延迟 1s 让玩家看到揭晓动画)
      this.emit('STATE_UPDATED', this.getStateSnapshot());
      setTimeout(() => this.finalizeDecree('VOID', '双双放弃'), 1200);
      return;
    }
    if (contesters.length === 1) {
      // 单方碾压 → 免费归属
      this.emit('STATE_UPDATED', this.getStateSnapshot());
      setTimeout(() => this.finalizeDecree(contesters[0], '对方放弃'), 1200);
      return;
    }

    // 双方争夺 → 进入暗标死斗
    ctx.step = 'BIDDING';
    ctx.deadline = Date.now() + GAME_CONSTANTS.DECREE_BID_TIMER_MS;
    this.state.timer = GAME_CONSTANTS.DECREE_BID_TIMER_MS;
    this.startDecreeTimer();

    this.addLog('双方均争夺！进入暗标死斗 (10s 内提交 1-3 张牌)');
    // 重新发 PHASE_CHANGED 以便 AI 重新评估 (子步骤切换)
    this.emit('PHASE_CHANGED', GamePhase.DECREE_CONTEST);
    this.emit('STATE_UPDATED', this.getStateSnapshot());
  }

  /** 玩家暗扣 1-3 张牌。瞬不能竞标。 */
  public submitDecreeBid(playerId: string, cardIds: string[]): boolean {
    const ctx = this.state.decreeContest;
    if (!ctx || ctx.step !== 'BIDDING') return false;
    if (ctx.bids[playerId] !== null) return false;

    const player = this.getPlayer(playerId);
    const cards = cardIds
      .map(id => player.hand.find(c => c.id === id))
      .filter((c): c is ICard => c !== undefined);

    if (cards.length < 1 || cards.length > 3) return false;
    if (cards.some(c => c.rank === CardRank.FLASH)) return false;
    if (cards.some(c => c.isPhantom)) return false; // 虚影卡不可竞标

    ctx.bids[playerId] = cards.map(c => c.id);
    const bidResult = calcBidPower(cards, this.state.isInverted);
    ctx.bidPower[playerId] = bidResult.total;
    ctx.bidComboType[playerId] = bidResult.combo;
    this.emit('STATE_UPDATED', this.getStateSnapshot());

    const allBid = Object.values(ctx.bids).every(b => b !== null);
    if (allBid) this.resolveDecreeBids();
    return true;
  }

  /** 暗标超时：未提交 = 自动放弃，未打出的牌退回手牌 */
  private onDecreeBidTimeout(): void {
    const ctx = this.state.decreeContest;
    if (!ctx || ctx.step !== 'BIDDING') return;
    // 未提交即没投牌，自然留在手牌；按 'PASS' 处理
    for (const pid of Object.keys(ctx.bids)) {
      if (ctx.bids[pid] === null) ctx.bids[pid] = []; // 空数组表示放弃
    }
    this.resolveDecreeBids();
  }

  /** Step 4: 比较战力 → 裁定 + 销毁所有提交的竞标牌 */
  private resolveDecreeBids(): void {
    const ctx = this.state.decreeContest;
    if (!ctx) return;
    ctx.step = 'BID_RESOLVE';
    this.stopDecreeTimer();

    const playerIds = Object.keys(this.state.players);
    const [p1, p2] = playerIds;
    const b1 = ctx.bids[p1] || [];
    const b2 = ctx.bids[p2] || [];
    const pow1 = b1.length > 0 ? ctx.bidPower[p1] : -1; // 空标记为 -1
    const pow2 = b2.length > 0 ? ctx.bidPower[p2] : -1;

    // 销毁双方提交的竞标卡 (沉没成本)
    const burnCards = (pid: string, cardIds: string[]) => {
      if (cardIds.length === 0) return;
      const player = this.getPlayer(pid);
      const cards = cardIds.map(id => player.hand.find(c => c.id === id)).filter((c): c is ICard => !!c);
      player.hand = player.hand.filter(c => !cardIds.includes(c.id));
      this.state.discardPile.push(...cards);
      cards.forEach(c => {
        this.pushAction({
          type: 'VFX_BURN',
          payload: { card: c, playerId: pid, reason: '暗标沉没' },
          durationMs: 400,
        });
      });
    };
    burnCards(p1, b1);
    burnCards(p2, b2);

    // 翻牌 VFX：祭坛上展示双方组合
    const combo1 = ctx.bidComboType[p1];
    const combo2 = ctx.bidComboType[p2];
    if (combo1 && combo1 !== 'SCATTER') {
      this.pushAction({
        type: 'VFX_BID_COMBO',
        payload: { playerId: p1, combo: combo1, power: pow1 },
        durationMs: 1500,
      });
    }
    if (combo2 && combo2 !== 'SCATTER') {
      this.pushAction({
        type: 'VFX_BID_COMBO',
        payload: { playerId: p2, combo: combo2, power: pow2 },
        durationMs: 1500,
      });
    }

    let outcome: 'VOID' | 'TIE' | string;
    let reason: string;

    if (pow1 < 0 && pow2 < 0) {
      outcome = 'VOID';
      reason = '双方未出价';
    } else if (pow1 > pow2) {
      outcome = p1;
      reason = `战力 ${pow1} > ${pow2}`;
    } else if (pow2 > pow1) {
      outcome = p2;
      reason = `战力 ${pow2} > ${pow1}`;
    } else {
      outcome = 'TIE'; // 战力平局 → 撕裂
      reason = `战力同为 ${pow1}，能量冲突撕裂`;
    }

    this.emit('DECREE_BID_RESOLVED', {
      power: { [p1]: pow1, [p2]: pow2 },
      combo: { [p1]: combo1, [p2]: combo2 },
      outcome,
    });
    this.finalizeDecree(outcome, reason);
  }

  /** 结算法案归属：作废 / 平局撕裂 / 归属某玩家 */
  private finalizeDecree(outcome: 'VOID' | 'TIE' | string, reason: string): void {
    const ctx = this.state.decreeContest;
    if (!ctx) return;

    const decree = ctx.decree;
    let ownerId: string | 'VOID' = 'VOID';

    if (outcome !== 'VOID' && outcome !== 'TIE') {
      // 归属某玩家
      const player = this.getPlayer(outcome);
      player.activeDecrees.push(decree);
      ownerId = outcome;
      this.pushAction({
        type: 'DECREE_AWARDED',
        payload: { playerId: outcome, decree },
        durationMs: 1800,
      });
      this.addLog(`[${decree.name}] 归属 ${player.name}：${reason}`);
      this.emit('DECREE_AWARDED', { playerId: outcome, decree });
    } else {
      this.pushAction({
        type: 'DECREE_VOIDED',
        payload: { decree, reason },
        durationMs: 1500,
      });
      this.addLog(`[${decree.name}] 作废：${reason}`);
    }

    this.state.offeredDecrees.push({
      round: ctx.triggeringRound,
      decree,
      ownerId,
    });

    ctx.outcome = outcome;
    ctx.step = 'BID_RESOLVE'; // 锁定步骤，让 UI 展示结算
    this.emit('STATE_UPDATED', this.getStateSnapshot());

    // 给玩家 2.5s 看结算，然后清空 decreeContest 推进到 BOUNTY_ROLL
    setTimeout(() => {
      this.state.decreeContest = null;
      this.state.phase = GamePhase.BOUNTY_ROLL;
      this.resetTimer();
      this.emit('PHASE_CHANGED', GamePhase.BOUNTY_ROLL);
      this.executeBountyRoll();
    }, 2500);
  }

  /** 第10回合：缝合并强制覆盖 */
  private applySupremeDecree(): void {
    const allDecrees = this.state.offeredDecrees.map(o => o.decree);
    if (allDecrees.length === 0) {
      this.addLog('第 10 回合：未曾出现过法案，至高法案空降跳过。');
      return;
    }
    const supreme = stitchSupremeDecree(allDecrees);
    this.state.supremeDecree = supreme;
    // 抹除所有玩家的私有法案
    for (const player of Object.values(this.state.players)) {
      player.activeDecrees = [];
    }
    this.pushAction({
      type: 'GLOBAL_MUTATION',
      payload: { decree: supreme },
      durationMs: 3000,
    });
    this.addLog(`第 10 回合：私欲的尽头是同归于尽。至高法案 [${supreme.name}] 已覆盖全场！`);
    this.emit('SUPREME_DECREE_APPLIED', { decree: supreme });
    this.emit('STATE_UPDATED', this.getStateSnapshot());
  }

  // ─── 法案专用倒计时 ──────────────────────────
  private decreeTimer: ReturnType<typeof setInterval> | null = null;
  private startDecreeTimer(): void {
    this.stopDecreeTimer();
    this.decreeTimer = setInterval(() => {
      const ctx = this.state.decreeContest;
      if (!ctx) { this.stopDecreeTimer(); return; }
      const remaining = Math.max(0, ctx.deadline - Date.now());
      this.state.timer = remaining;
      this.emit('TIMER_TICK', remaining);
      if (remaining <= 0) {
        this.stopDecreeTimer();
        if (ctx.step === 'OPT_IN') this.onDecreeOptInTimeout();
        else if (ctx.step === 'BIDDING') this.onDecreeBidTimeout();
      }
    }, 200);
  }
  private stopDecreeTimer(): void {
    if (this.decreeTimer) {
      clearInterval(this.decreeTimer);
      this.decreeTimer = null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  阶段 0：BOUNTY_ROLL (喋血悬赏)
  // ═══════════════════════════════════════════════════════════

  private executeBountyRoll(): void {
    const roll = Math.floor(Math.random() * 6) + 1;
    let bountyAmount = roll * GAME_CONSTANTS.BOUNTY_MULTIPLIER;
    // 悬赏池单次上限
    bountyAmount = Math.min(bountyAmount, GAME_CONSTANTS.BOUNTY_CAP);
    this.state.bountyPool += bountyAmount;

    this.pushAction({
      type: 'DICE_ROLL',
      payload: { roll, amount: bountyAmount },
      durationMs: 1500,
    });
    this.pushAction({
      type: 'SPAWN_BOUNTY',
      payload: { amount: this.state.bountyPool, added: bountyAmount },
      durationMs: 1000,
    });

    this.addLog(`喋血悬赏：掷出 ${roll}，悬赏池 +${bountyAmount}，总计 ${this.state.bountyPool}`);
    this.emit('STATE_UPDATED', this.getStateSnapshot());
  }

  // ═══════════════════════════════════════════════════════════
  //  阶段 1：DRAW_MARKET (汲取与黑市)
  // ═══════════════════════════════════════════════════════════

  public drawPhaseCards(playerId: string): void {
    this.validatePhase(GamePhase.DRAW_MARKET);
    const player = this.getPlayer(playerId);
    let drawCount = GAME_CONSTANTS.DRAW_PER_TURN;

    // 奥术怪盗被动 SleightOfHand: 额外 +1 抽牌
    if (player.hero === HeroType.PHANTOM) {
      drawCount += 1;
    }

    const drawn = this.drawFromDeck(drawCount);
    player.hand.push(...drawn);

    drawn.forEach(card => {
      this.pushAction({
        type: 'CARD_DRAW',
        payload: { playerId, card },
        durationMs: 400,
      });
    });

    if (player.hero === HeroType.PHANTOM && drawn.length > GAME_CONSTANTS.DRAW_PER_TURN) {
      this.pushAction({
        type: 'PHANTOM_COIN',
        payload: { playerId },
        durationMs: 600,
      });
    }

    this.checkDeckEmpty();
    this.emit('STATE_UPDATED', this.getStateSnapshot());
  }

  public buyMarketCard(playerId: string, marketCardId: string, paymentCardIds: string[]): boolean {
    this.validatePhase(GamePhase.DRAW_MARKET);
    const player = this.getPlayer(playerId);

    // 非怪盗玩家有购买次数限制
    if (player.hero !== HeroType.PHANTOM &&
        player.marketBuysThisTurn >= GAME_CONSTANTS.MARKET_BUY_LIMIT) {
      return false;
    }

    const marketCard = this.state.marketCards.find(c => c.id === marketCardId);
    if (!marketCard) return false;

    const effects = aggregateEffectsFor(this.state, playerId);
    const priceMult = effects.marketPriceMultiplier ?? 1;
    const requiredScore = marketCard.baseScore * priceMult;

    const paymentCards = paymentCardIds
      .map(id => player.hand.find(c => c.id === id))
      .filter((c): c is ICard => c !== undefined);

    const paymentTotal = paymentCards.reduce((sum, c) => sum + c.baseScore, 0);
    if (paymentTotal < requiredScore) return false;

    // 移除支付牌 (破产法案：白嫖时不消耗任何支付牌)
    if (priceMult > 0) {
      paymentCards.forEach(card => {
        player.hand = player.hand.filter(c => c.id !== card.id);
        this.state.discardPile.push(card);
        this.pushAction({
          type: 'VFX_BURN',
          payload: { card, playerId },
          durationMs: 500,
        });
      });
    }

    // 获得黑市牌
    player.hand.push(marketCard);
    player.marketBuysThisTurn++;
    this.state.marketCards = this.state.marketCards.filter(c => c.id !== marketCardId);

    // 补充黑市
    const refill = this.drawFromDeck(1);
    this.state.marketCards.push(...refill);

    // 暴食 buff: 黑市买后额外抽牌
    if (effects.marketBuyBonusDraw && effects.marketBuyBonusDraw > 0) {
      const bonus = this.drawFromDeck(effects.marketBuyBonusDraw);
      player.hand.push(...bonus);
      bonus.forEach(c => {
        this.pushAction({
          type: 'CARD_DRAW',
          payload: { playerId, card: c },
          durationMs: 300,
        });
      });
      this.addLog(`${player.name} 暴食法案触发：黑市后追加抽 ${bonus.length} 张`);
    }

    // 破产 debuff: 每白拿 1 张永久 -1 手牌上限
    if (priceMult === 0 && effects.marketBuyHandLimitDecay && effects.marketBuyHandLimitDecay > 0) {
      player.handLimitDecay += effects.marketBuyHandLimitDecay;
    }

    this.addLog(`${player.name} 从黑市购得 ${CardRank[marketCard.rank]} 级牌${priceMult === 0 ? ' (白嫖)' : ''}`);
    this.emit('STATE_UPDATED', this.getStateSnapshot());
    return true;
  }

  /** 当前有效手牌上限 (基础 - 法案 delta - 破产累计) */
  public getEffectiveHandLimit(playerId: string): number {
    const player = this.state.players[playerId];
    if (!player) return GAME_CONSTANTS.HAND_LIMIT;
    const effects = aggregateEffectsFor(this.state, playerId);
    const base = GAME_CONSTANTS.HAND_LIMIT;
    const delta = effects.handLimitDelta || 0;
    const decay = player.handLimitDecay || 0;
    return Math.max(1, base + delta - decay);
  }

  // ═══════════════════════════════════════════════════════════
  //  阶段 2：AMBUSH (突袭与虚实之言)
  // ═══════════════════════════════════════════════════════════

  public declareAmbush(
    attackerId: string,
    cardId: string,
    declaration: AmbushDeclaration | null,
    discardCardId?: string
  ): boolean {
    this.validatePhase(GamePhase.AMBUSH_DECLARE);
    const attacker = this.getPlayer(attackerId);

    if (attacker.ambushesThisTurn >= GAME_CONSTANTS.MAX_AMBUSH_PER_TURN) return false;

    // 第2次突袭须先明弃1张
    if (attacker.ambushesThisTurn === 1) {
      if (!discardCardId || attacker.hand.length <= 1) return false;
      const discardCard = attacker.hand.find(c => c.id === discardCardId);
      if (!discardCard) return false;
      attacker.hand = attacker.hand.filter(c => c.id !== discardCardId);
      this.state.discardPile.push(discardCard);
      this.pushAction({
        type: 'VFX_BURN',
        payload: { card: discardCard, playerId: attackerId, reason: '突袭明弃' },
        durationMs: 500,
      });
      this.addLog(`${attacker.name} 明弃 ${CardRank[discardCard.rank]} 级牌，发起第2次突袭`);
    }

    const card = attacker.hand.find(c => c.id === cardId);
    if (!card) return false;

    attacker.hand = attacker.hand.filter(c => c.id !== cardId);
    attacker.ambushesThisTurn++;

    const defenderId = this.getOpponentId(attackerId);

    this.state.ambushState = {
      attackerId,
      defenderId,
      attackCard: card,
      declaration,
      defenderCard: null,
      resolved: false,
    };

    this.state.phase = GamePhase.AMBUSH_DEFEND;
    this.emit('PHASE_CHANGED', GamePhase.AMBUSH_DEFEND);
    this.emit('STATE_UPDATED', this.getStateSnapshot());
    return true;
  }

  public resolveAmbushDefend(
    defenderId: string,
    choice: 'FOLD' | 'CALL_BLUFF' | 'DEFEND',
    defenderCardId?: string
  ): void {
    this.validatePhase(GamePhase.AMBUSH_DEFEND);
    const ambush = this.state.ambushState;
    if (!ambush || ambush.defenderId !== defenderId) return;

    const attacker = this.getPlayer(ambush.attackerId);
    const defender = this.getPlayer(defenderId);

    let winnerId: string | null = null;

    switch (choice) {
      case 'FOLD':
        this.resolveAmbushFold(attacker, defender, ambush);
        winnerId = attacker.id;
        break;
      case 'CALL_BLUFF': {
        const declaredRank = ambush.declaration;
        const isTruthful = declaredRank !== null && declaredRank !== 'SILENT'
          && declaredRank === ambush.attackCard.rank;
        // 拆穿失败 = 攻击方赢；拆穿成功 = 防守方赢
        winnerId = isTruthful ? attacker.id : defender.id;
        this.resolveAmbushCallBluff(attacker, defender, ambush);
        break;
      }
      case 'DEFEND': {
        if (!defenderCardId) return;
        const defCard = defender.hand.find(c => c.id === defenderCardId);
        if (defCard) {
          const result = compareCards(ambush.attackCard.rank, defCard.rank, this.state.isInverted);
          if (result > 0) winnerId = attacker.id;
          else if (result < 0) winnerId = defender.id;
          else winnerId = null;
        }
        this.resolveAmbushDefendClash(attacker, defender, ambush, defenderCardId);
        break;
      }
    }

    ambush.resolved = true;
    const resolvedResult = {
      choice,
      attackCard: ambush.attackCard,
      defenderCard: ambush.defenderCard,
      declaration: ambush.declaration,
      winnerId,
      attackerId: attacker.id,
      defenderId: defender.id,
    };
    this.state.ambushState = null;
    this.state.phase = GamePhase.AMBUSH_DECLARE;
    this.checkWinCondition();
    this.emit('AMBUSH_RESOLVED', resolvedResult);
    // 通知 AI/UI 重新评估是否进入第 2 次突袭
    this.emit('PHASE_CHANGED', GamePhase.AMBUSH_DECLARE);
    this.emit('STATE_UPDATED', this.getStateSnapshot());
  }

  private resolveAmbushFold(
    attacker: IPlayerState,
    defender: IPlayerState,
    ambush: IAmbushState
  ): void {
    const attackerEff = aggregateEffectsFor(this.state, attacker.id);
    const defenderEff = aggregateEffectsFor(this.state, defender.id);

    // 攻击方独吞 bountyPool
    const foldBounty = this.state.bountyPool;
    if (foldBounty > 0) {
      this.addScore(attacker.id, foldBounty, '独吞悬赏 (对方怯战)');
    }
    this.pushAction({
      type: 'SCORE_BURST',
      payload: { playerId: attacker.id, amount: foldBounty, reason: '独吞悬赏' },
      durationMs: 800,
    });
    this.state.bountyPool = 0;

    // 攻击方收回暗扣牌
    attacker.hand.push(ambush.attackCard);

    // 死斗 debuff: 怯战方被偷数提升
    const stealCount = Math.max(
      attackerEff.ambushFoldStealCount || 0,
      defenderEff.ambushFoldStealCount || 0,
      1,
    );
    for (let i = 0; i < stealCount; i++) {
      if (defender.hand.length === 0) break;
      const stealIdx = Math.floor(Math.random() * defender.hand.length);
      const stolen = defender.hand.splice(stealIdx, 1)[0];
      attacker.hand.push(stolen);
      this.pushAction({
        type: 'CARD_STEAL',
        payload: { fromId: defender.id, toId: attacker.id, card: stolen },
        durationMs: 500,
      });
    }

    // 愚者 buff: 未被拆穿宣告 (攻击方有声明且对手怯战)
    if (ambush.declaration && ambush.declaration !== 'SILENT'
        && attackerEff.ambushBluffUnchallengedBonus) {
      this.addScore(attacker.id, attackerEff.ambushBluffUnchallengedBonus, '愚者法案：未拆穿奖励');
    }

    // 攻击方计为本回合赢一次 (用于傲慢 debuff 解锁)
    attacker.ambushWonThisTurn = true;

    this.pushAction({
      type: 'AMBUSH_FOLD',
      payload: {
        attackerName: attacker.name,
        defenderName: defender.name,
        bountyAmount: attacker.score, // already added above
      },
      durationMs: 1500,
    });
    this.addLog(`${defender.name} 怯战！${attacker.name} 独吞悬赏并偷取${stealCount}牌`);
  }

  private resolveAmbushCallBluff(
    attacker: IPlayerState,
    defender: IPlayerState,
    ambush: IAmbushState
  ): void {
    if (ambush.declaration === null || ambush.declaration === 'SILENT') return;

    const declaredRank = ambush.declaration as CardRank;
    const actualRank = ambush.attackCard.rank;
    const isTruthful = declaredRank === actualRank;
    const attackerEff = aggregateEffectsFor(this.state, attacker.id);

    if (isTruthful) {
      // 说真话被拆穿：防守方被重罚
      this.addScore(defender.id, -GAME_CONSTANTS.BLUFF_PENALTY, '拆穿失败惩罚');
      this.state.discardPile.push(ambush.attackCard);
      this.addLog(`拆穿失败！${attacker.name} 说真话，${defender.name} -${GAME_CONSTANTS.BLUFF_PENALTY}分`);
      attacker.ambushWonThisTurn = true;
    } else {
      // 说谎被拆穿：攻击方被重罚
      // 愚者 debuff: 罚分倍率
      const penaltyMult = attackerEff.ambushBluffCaughtPenaltyMult ?? 1;
      const penalty = GAME_CONSTANTS.BLUFF_PENALTY * penaltyMult;
      this.addScore(attacker.id, -penalty, '说谎被拆穿');
      // 愚者 debuff: 额外烧毁 N 张攻击方手牌
      const burnN = attackerEff.ambushBluffCaughtBurnHand ?? 0;
      if (burnN > 0 && attacker.hand.length > 0) {
        const burned: ICard[] = [];
        for (let i = 0; i < burnN && attacker.hand.length > 0; i++) {
          const idx = Math.floor(Math.random() * attacker.hand.length);
          const card = attacker.hand.splice(idx, 1)[0];
          burned.push(card);
          this.state.discardPile.push(card);
          this.pushAction({
            type: 'VFX_BURN',
            payload: { card, playerId: attacker.id, reason: '愚者法案' },
            durationMs: 400,
          });
        }
        this.addLog(`愚者法案：${attacker.name} 额外烧毁 ${burned.length} 张牌`);
      }
      defender.hand.push(ambush.attackCard);
      this.addLog(`拆穿成功！${attacker.name} 说谎，-${penalty}分，牌归防守方`);
      defender.ambushWonThisTurn = true;
    }

    this.pushAction({
      type: 'AMBUSH_BLUFF',
      payload: {
        attackCard: ambush.attackCard,
        declared: declaredRank,
        isTruthful,
        penalizedId: isTruthful ? defender.id : attacker.id,
        attackerName: attacker.name,
        defenderName: defender.name,
      },
      durationMs: 1800,
    });
  }

  private resolveAmbushDefendClash(
    attacker: IPlayerState,
    defender: IPlayerState,
    ambush: IAmbushState,
    defenderCardId: string
  ): void {
    const defCard = defender.hand.find(c => c.id === defenderCardId);
    if (!defCard) return;

    defender.hand = defender.hand.filter(c => c.id !== defenderCardId);
    ambush.defenderCard = defCard;

    const atkCard = ambush.attackCard;
    const attackerEff = aggregateEffectsFor(this.state, attacker.id);
    const defenderEff = aggregateEffectsFor(this.state, defender.id);

    // 防守方出[瞬]：强行吸走攻击牌
    if (defCard.rank === CardRank.FLASH) {
      defender.hand.push(atkCard);
      this.state.discardPile.push(defCard);
      this.applyFlashUsePenalty(defender);
      this.addLog(`${defender.name} 打出[瞬]，吸走攻击牌！血池保留`);
      this.pushAction({
        type: 'BOUNTY_RETAINED',
        payload: { amount: this.state.bountyPool },
        durationMs: 800,
      });
      return;
    }

    // 攻击方出[瞬]：平局
    if (atkCard.rank === CardRank.FLASH) {
      this.state.discardPile.push(atkCard, defCard);
      this.applyFlashUsePenalty(attacker);
      this.addLog(`攻击方出[瞬]，平局！血池保留`);
      this.pushAction({
        type: 'BOUNTY_RETAINED',
        payload: { amount: this.state.bountyPool },
        durationMs: 800,
      });
      return;
    }

    // 拼点
    const result = compareCards(atkCard.rank, defCard.rank, this.state.isInverted);

    this.pushAction({
      type: 'CARD_CLASH',
      payload: { attackCard: atkCard, defendCard: defCard, result },
      durationMs: 1500,
    });

    if (result === 0) {
      // 平局：悬赏金保留 (默认) 或 死斗法案：双方各 +N
      const tieScore = Math.max(
        attackerEff.ambushTieScoresEach || 0,
        defenderEff.ambushTieScoresEach || 0,
      );
      if (tieScore > 0) {
        this.addScore(attacker.id, tieScore, '死斗法案：平局加分');
        this.addScore(defender.id, tieScore, '死斗法案：平局加分');
        this.state.bountyPool = 0; // 死斗法案下池子也归零 (规则：不再保留)
        this.addLog(`死斗法案：平局！双方各 +${tieScore}`);
      } else {
        this.pushAction({
          type: 'BOUNTY_RETAINED',
          payload: { amount: this.state.bountyPool },
          durationMs: 800,
        });
        this.addLog(`拼点平局！血池保留至下回合`);
      }
      this.state.discardPile.push(atkCard, defCard);
    } else {
      const winner = result > 0 ? attacker : defender;
      const loser = result > 0 ? defender : attacker;
      const winCard = result > 0 ? atkCard : defCard;
      const loseCard = result > 0 ? defCard : atkCard;
      const winnerEff = winner.id === attacker.id ? attackerEff : defenderEff;
      const loserEff = loser.id === attacker.id ? attackerEff : defenderEff;

      // 赢家抽1偷1 + 独吞 bountyPool
      const winBounty = this.state.bountyPool;
      if (winBounty > 0) {
        this.addScore(winner.id, winBounty, '拼点胜利 (悬赏)');
      }

      // A赢额外+20，B赢额外+10
      const effectiveScore = getEffectiveScore(winCard.rank, this.state.isInverted);
      if (effectiveScore === 6) this.addScore(winner.id, GAME_CONSTANTS.A_WIN_BONUS, 'A 牌威压');
      else if (effectiveScore === 5) this.addScore(winner.id, GAME_CONSTANTS.B_WIN_BONUS, 'B 牌强袭');

      // 弑神法案 buff: F 击败 A → 额外暴击
      const fBeatsA = winCard.rank === CardRank.F && loseCard.rank === CardRank.A;
      if (fBeatsA && winnerEff.ambushDeicideCritBonus) {
        this.addScore(winner.id, winnerEff.ambushDeicideCritBonus, '弑神法案：F 弑 A 暴击');
      }
      // 弑神法案 debuff: 出 F 但没撞到 A
      const winnerPlayedFNoA = winCard.rank === CardRank.F && loseCard.rank !== CardRank.A;
      const loserPlayedFNoA = loseCard.rank === CardRank.F && winCard.rank !== CardRank.A;
      if (winnerPlayedFNoA && winnerEff.ambushFFailedSelfPenalty) {
        this.addScore(winner.id, -winnerEff.ambushFFailedSelfPenalty, '弑神法案：F 失手');
      }
      if (loserPlayedFNoA && loserEff.ambushFFailedSelfPenalty) {
        this.addScore(loser.id, -loserEff.ambushFFailedSelfPenalty, '弑神法案：F 失手');
      }

      // 荆棘法案 buff: 防守方迎战获胜，吸取攻击方
      if (winner.id === defender.id && winnerEff.ambushDefendWinDrain) {
        const drain = winnerEff.ambushDefendWinDrain;
        this.addScore(attacker.id, -drain, '荆棘法案：防胜吸血');
        this.addScore(defender.id, drain, '荆棘法案：防胜吸血');
      }

      this.pushAction({
        type: 'SCORE_BURST',
        payload: { playerId: winner.id, amount: this.state.bountyPool, reason: '拼点胜利' },
        durationMs: 800,
      });

      this.state.bountyPool = 0;

      // 赢家抽1
      const drawn = this.drawFromDeck(1);
      winner.hand.push(...drawn);

      // 赢家偷 N (死斗 debuff 时, 怯战才生效；这里普通拼点用默认1)
      if (loser.hand.length > 0) {
        const stealIdx = Math.floor(Math.random() * loser.hand.length);
        const stolen = loser.hand.splice(stealIdx, 1)[0];
        winner.hand.push(stolen);
        this.pushAction({
          type: 'CARD_STEAL',
          payload: { fromId: loser.id, toId: winner.id, card: stolen },
          durationMs: 600,
        });
      }

      // 弃牌处置：默认进弃牌堆
      // 荆棘法案 debuff (攻击方持有)：攻击方败北时，攻击牌不入弃牌堆 → 给防守方
      // 弑神法案 debuff: 失手 F 牌粉碎(本来就是入弃牌堆，不变)
      const attackerLost = winner.id === defender.id;
      let attackCardHandled = false;
      if (attackerLost && attackerEff.ambushAttackFailGiveCard) {
        defender.hand.push(atkCard);
        attackCardHandled = true;
        this.addLog(`荆棘法案：攻击牌被防守方没收`);
      }
      if (!attackCardHandled) this.state.discardPile.push(atkCard);
      this.state.discardPile.push(defCard);

      // 裸露法案 buff: 胜方额外销毁对手封锁区或黑市的 1 张明牌
      if (winnerEff.ambushWinExtraDestroy) {
        if (loser.blockadeZone) {
          const destroyed = loser.blockadeZone;
          loser.blockadeZone = null;
          this.state.discardPile.push(destroyed);
          this.pushAction({
            type: 'VFX_BURN',
            payload: { card: destroyed, playerId: loser.id, reason: '裸露法案' },
            durationMs: 500,
          });
          this.addLog(`裸露法案：销毁 ${loser.name} 的封锁牌`);
        } else if (this.state.marketCards.length > 0) {
          const destroyed = this.state.marketCards.shift()!;
          this.state.discardPile.push(destroyed);
          const refill = this.drawFromDeck(1);
          this.state.marketCards.push(...refill);
          this.pushAction({
            type: 'VFX_BURN',
            payload: { card: destroyed, reason: '裸露法案：销毁黑市牌' },
            durationMs: 500,
          });
        }
      }

      winner.ambushWonThisTurn = true;
      this.addLog(`${winner.name} 拼点获胜！独吞悬赏`);
    }
  }

  /** 虚无法案 debuff: 每用 1 张瞬扣 N 分 */
  private applyFlashUsePenalty(player: IPlayerState): void {
    const eff = aggregateEffectsFor(this.state, player.id);
    if (eff.flashUsePenalty && eff.flashUsePenalty > 0) {
      this.addScore(player.id, -eff.flashUsePenalty, '虚无法案：消耗瞬');
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  阶段 3：CHANT_SCORE (咏唱计分)
  // ═══════════════════════════════════════════════════════════

  public submitComboScore(playerId: string, cardIds: string[], score: number): void {
    this.validatePhase(GamePhase.CHANT_SCORE);
    const player = this.getPlayer(playerId);
    const effects = aggregateEffectsFor(this.state, playerId);

    // 傲慢法案 debuff: 必须先在突袭中获胜
    if (effects.requireAmbushWinForChant && !player.ambushWonThisTurn) {
      this.addLog(`${player.name} 受傲慢法案锁定：本回合突袭未胜，禁止咏唱`);
      return;
    }

    // 移除使用的牌
    const usedCards: ICard[] = [];
    cardIds.forEach(id => {
      const card = player.hand.find(c => c.id === id);
      if (card) {
        usedCards.push(card);
        player.hand = player.hand.filter(c => c.id !== id);
      }
    });

    // 虚无法案 debuff: 凑组合用了瞬 → 每张扣 15
    const flashUsed = usedCards.filter(c => c.rank === CardRank.FLASH).length;
    if (flashUsed > 0 && effects.flashUsePenalty) {
      this.addScore(playerId, -effects.flashUsePenalty * flashUsed, '虚无法案：组合中使用瞬');
    }

    // 应用早期得分衰减 (推动更多对撞终局)
    const decayed = this.applyChantScoreDecay(score);
    // 计算封锁罚分（若使用了被对手封锁的 rank — 含 blockadeZone2）
    const opponent = Object.values(this.state.players).find(p => p.id !== playerId);
    const blockedRanks = new Set<number>();
    if (opponent?.blockadeZone) blockedRanks.add(opponent.blockadeZone.rank);
    if (opponent?.blockadeZone2) blockedRanks.add(opponent.blockadeZone2.rank);
    const blockedPenalty = blockedRanks.size > 0
      ? usedCards
          .filter(c => blockedRanks.has(c.rank))
          .reduce((s, c) => s + c.baseScore * 3, 0)
      : 0;
    const actualScore = decayed - blockedPenalty;

    if (actualScore !== 0) {
      this.addScore(playerId, actualScore,
        blockedPenalty > 0
          ? `咏唱得分 (含封锁罚 -${blockedPenalty})`
          : '咏唱得分');
    }
    this.state.discardPile.push(...usedCards);

    this.pushAction({
      type: 'COMBO_HIGHLIGHT',
      payload: { cards: usedCards, score: actualScore, originalScore: score, blockedPenalty },
      durationMs: 600,
    });
    this.pushAction({
      type: 'SCORE_BURST',
      payload: { playerId, amount: actualScore, reason: blockedPenalty > 0 ? '咏唱-封锁罚' : '咏唱得分' },
      durationMs: 800,
    });

    // 过牌奖励
    const reward = this.drawFromDeck(1);
    player.hand.push(...reward);

    this.addLog(`${player.name} 咏唱得分 +${actualScore}${actualScore < score ? ` (衰减前: ${score})` : ''}`);
    this.checkWinCondition();
    this.emit('STATE_UPDATED', this.getStateSnapshot());
  }

  // ═══════════════════════════════════════════════════════════
  //  阶段 4：BLOCKADE_END (明牌封锁)
  // ═══════════════════════════════════════════════════════════

  public placeBlockade(playerId: string, cardId: string): void {
    this.validatePhase(GamePhase.BLOCKADE_END);
    const player = this.getPlayer(playerId);
    const card = player.hand.find(c => c.id === cardId);
    if (!card) return;

    player.hand = player.hand.filter(c => c.id !== cardId);
    player.blockadeZone = card;

    this.pushAction({
      type: 'BLOCKADE_CHAIN',
      payload: { card, playerId },
      durationMs: 1000,
    });

    // 禁锢法案 buff: 同时封锁相邻 rank — 在 blockadeZone2 上记录虚拟卡
    const effects = aggregateEffectsFor(this.state, playerId);
    if (effects.blockadeExtraRank) {
      // 优先封锁 rank-1 (更高)，否则 rank+1
      const adjacentRank = card.rank > CardRank.F
        ? (card.rank - 1) as CardRank
        : (card.rank + 1) as CardRank;
      // 创建虚拟封锁标记 (不消耗实物牌)
      player.blockadeZone2 = {
        id: `${card.id}-adj`,
        rank: adjacentRank,
        baseScore: 0,
      };
      this.addLog(`${player.name} 禁锢法案：附加封锁 ${CardRank[adjacentRank]} 级`);
    }

    this.addLog(`${player.name} 封锁了 ${CardRank[card.rank]} 级牌`);
    this.emit('STATE_UPDATED', this.getStateSnapshot());
  }

  public discardExcess(playerId: string, cardIds: string[]): void {
    const player = this.getPlayer(playerId);
    cardIds.forEach(id => {
      const card = player.hand.find(c => c.id === id);
      if (card) {
        player.hand = player.hand.filter(c => c.id !== id);
        this.state.discardPile.push(card);
      }
    });
    this.emit('STATE_UPDATED', this.getStateSnapshot());
  }

  /**
   * 瞬换牌 — 任意阶段（除 AMBUSH_DEFEND 防守方未抉择）可用
   * 弃掉「瞬」+ 1~3 张选定牌，从牌库随机抽相同总数(swapCardIds.length)的新牌补回手牌
   */
  public flashSwap(playerId: string, flashCardId: string, swapCardIds: string[]): void {
    const player = this.getPlayer(playerId);
    if (!player) return;
    this.applyFlashUsePenalty(player); // 虚无法案 debuff: 用瞬扣分

    // 只允许己方回合，且阶段不是攻击方刚刚发起突袭等待防守
    if (this.state.currentTurnPlayerId !== playerId &&
        !(this.state.phase === GamePhase.AMBUSH_DEFEND &&
          this.state.ambushState?.defenderId === playerId)) {
      return;
    }

    const flashCard = player.hand.find(c => c.id === flashCardId);
    if (!flashCard || flashCard.rank !== CardRank.FLASH) return;
    if (swapCardIds.length < 1 || swapCardIds.length > 3) return;

    const swapCards: ICard[] = [];
    swapCardIds.forEach(id => {
      const c = player.hand.find(card => card.id === id);
      if (c && c.id !== flashCardId) swapCards.push(c);
    });
    if (swapCards.length === 0) return;

    // 弃掉瞬 + 选中的牌
    const allDiscardIds = new Set([flashCardId, ...swapCards.map(c => c.id)]);
    player.hand = player.hand.filter(c => !allDiscardIds.has(c.id));
    this.state.discardPile.push(flashCard, ...swapCards);

    // 从牌库抽相同数量（仅按选中数，不补瞬本身）
    const newCards = this.drawFromDeck(swapCards.length);
    player.hand.push(...newCards);

    this.pushAction({
      type: 'FLASH_SWAP',
      payload: {
        playerId, oldCount: swapCards.length,
        newCards: newCards.map(c => c.id),
      },
      durationMs: 800,
    });

    this.addLog(`${player.name} 使用「瞬」换牌 ${swapCards.length} 张`);
    this.emit('STATE_UPDATED', this.getStateSnapshot());
  }

  /**
   * 终局对撞：玩家确认揭牌顺序（排兵布阵）
   * 只能在 revealedCards 全空时调用
   */
  public setCollisionOrder(playerId: string, cardIds: string[]): void {
    const collision = this.state.collisionState;
    if (!collision) return;
    // 仅允许在尚未开始翻牌时调整
    const totalRevealed = Object.values(collision.revealedCards)
      .reduce((s, arr) => s + arr.length, 0);
    if (totalRevealed > 0) return;

    const playerCards = collision.playerCards[playerId];
    if (!playerCards) return;

    // 按 cardIds 顺序重排
    const idMap = new Map(playerCards.map(c => [c.id, c]));
    const reordered: ICard[] = [];
    for (const id of cardIds) {
      const c = idMap.get(id);
      if (c) reordered.push(c);
    }
    // 如果有遗漏的牌（未被列入 cardIds），追加到末尾
    for (const c of playerCards) {
      if (!cardIds.includes(c.id)) reordered.push(c);
    }
    collision.playerCards[playerId] = reordered;

    if (!collision.orderConfirmed) collision.orderConfirmed = {};
    collision.orderConfirmed[playerId] = true;

    this.emit('STATE_UPDATED', this.getStateSnapshot());
  }

  // ═══════════════════════════════════════════════════════════
  //  回合控制
  // ═══════════════════════════════════════════════════════════

  private endTurn(): void {
    const currentId = this.state.currentTurnPlayerId;
    const current = this.getPlayer(currentId);

    // 法案：手牌溢出罚分 (暴食/禁锢)
    const effects = aggregateEffectsFor(this.state, currentId);
    const overflowThreshold = effects.handOverflowThreshold;
    if (overflowThreshold !== undefined && effects.handOverflowPenalty &&
        current.hand.length > overflowThreshold) {
      this.addScore(currentId, -effects.handOverflowPenalty,
        `法案手牌溢出 (>${overflowThreshold})`);
    }

    // 法案：过载 buff (极速结束)
    // 仅当本回合从 BOUNTY_ROLL 进入起算时间小于阈值时生效。简化：通过 phaseEnteredAt 估算。
    if (effects.fastEndTurnBonusScore && effects.fastEndTurnThresholdMs &&
        this.turnStartedAt !== null) {
      const elapsed = Date.now() - this.turnStartedAt;
      if (elapsed <= effects.fastEndTurnThresholdMs) {
        this.addScore(currentId, effects.fastEndTurnBonusScore, '过载法案：极速奖励');
      }
    }

    // 手牌上限检查 (法案动态计算)
    const effLimit = this.getEffectiveHandLimit(currentId);
    if (current.hand.length > effLimit) {
      return; // UI 层应提示弃牌
    }

    // 重置回合计数器
    current.ambushesThisTurn = 0;
    current.marketBuysThisTurn = 0;
    current.ambushWonThisTurn = false;

    // 处理以太歌者反转倒计时
    if (this.state.isInverted) {
      this.state.invertedTurnsLeft--;
      if (this.state.invertedTurnsLeft <= 0) {
        this.state.isInverted = false;
        this.addLog('以太歌者的反转效果消散');
      }
    }

    // 清除虚影牌（织梦者当回合限定）
    current.hand = current.hand.filter(c => !c.isPhantom);

    // 切换玩家
    const playerIds = Object.keys(this.state.players);
    const nextId = playerIds.find(id => id !== currentId)!;
    this.state.currentTurnPlayerId = nextId;
    this.state.turnNumber++;

    // 清除即将行动玩家之前放置的封锁（它的封锁已对对手生效了一个回合）
    // 例如：A 放封锁 → B 受封锁（本回合） → B 回合结束 → 清除 B 的封锁
    // 规则：封锁持续对手一个回合，之后自动解除
    const nextPlayer = this.getPlayer(nextId);
    nextPlayer.blockadeZone = null;
    nextPlayer.blockadeZone2 = null;

    // 触发英雄回合开始事件
    const strategy = this.heroStrategies.get(nextId);
    if (strategy?.onTurnStart) {
      strategy.onTurnStart(this, nextId);
    }

    this.emit('TURN_CHANGED', nextId);
    this.nextPhase(GamePhase.BOUNTY_ROLL);
  }

  public forceEndTurn(): void {
    const currentId = this.state.currentTurnPlayerId;
    this.state.consecutiveTimeouts[currentId]++;

    // 过载法案 debuff: 超时罚 N 分
    const effects = aggregateEffectsFor(this.state, currentId);
    if (effects.turnTimerSkipPenalty) {
      this.addScore(currentId, -effects.turnTimerSkipPenalty, '过载法案：超时罚');
    }

    if (this.state.consecutiveTimeouts[currentId] >= GAME_CONSTANTS.AFK_TIMEOUT_STRIKES) {
      this.declareWinner(this.getOpponentId(currentId), 'AFK判负');
      return;
    }

    this.endTurn();
  }

  // ═══════════════════════════════════════════════════════════
  //  英雄大招 API
  // ═══════════════════════════════════════════════════════════

  public useUltimate(playerId: string): boolean {
    const player = this.getPlayer(playerId);
    if (player.hasUsedUltimate) return false;
    player.hasUsedUltimate = true;
    this.emit('HERO_ABILITY_USED', { playerId, hero: player.hero });
    return true;
  }

  // ═══════════════════════════════════════════════════════════
  //  终局检测
  // ═══════════════════════════════════════════════════════════

  private checkWinCondition(): void {
    for (const player of Object.values(this.state.players)) {
      if (player.score >= GAME_CONSTANTS.WIN_SCORE) {
        this.declareWinner(player.id, '155分斩杀');
        return;
      }
    }
  }

  private checkDeckEmpty(): void {
    if (this.deck.length === 0) {
      this.emit('DECK_EMPTY');
      this.initiateCollision();
    }
  }

  private initiateCollision(): void {
    this.state.phase = GamePhase.COLLISION;
    const playerIds = Object.keys(this.state.players);

    this.state.collisionState = {
      round: 'FLOP',
      roundIndex: 0,
      playerCards: {
        [playerIds[0]]: [...this.state.players[playerIds[0]].hand],
        [playerIds[1]]: [...this.state.players[playerIds[1]].hand],
      },
      revealedCards: { [playerIds[0]]: [], [playerIds[1]]: [] },
      pot: 0,
      foldedPlayer: null,
    };

    // 基础分计算: 当前总分(40%) + 手牌质量(60%)
    const p1 = this.state.players[playerIds[0]];
    const p2 = this.state.players[playerIds[1]];
    const p1Base = p1.score * GAME_CONSTANTS.COLLISION_SCORE_WEIGHT +
      p1.hand.reduce((s, c) => s + c.baseScore, 0) * GAME_CONSTANTS.COLLISION_HAND_WEIGHT;
    const p2Base = p2.score * GAME_CONSTANTS.COLLISION_SCORE_WEIGHT +
      p2.hand.reduce((s, c) => s + c.baseScore, 0) * GAME_CONSTANTS.COLLISION_HAND_WEIGHT;

    this.state.collisionState.pot = Math.round(p1Base + p2Base);

    this.pushAction({
      type: 'SLOW_MOTION',
      payload: { reason: '魔力对撞' },
      durationMs: 2000,
    });

    this.emit('PHASE_CHANGED', GamePhase.COLLISION);
    this.emit('STATE_UPDATED', this.getStateSnapshot());
  }

  public collisionAction(playerId: string, action: 'RAISE' | 'FOLD'): void {
    if (!this.state.collisionState) return;
    const collision = this.state.collisionState;

    if (action === 'FOLD') {
      collision.foldedPlayer = playerId;
      const winnerId = this.getOpponentId(playerId);
      this.declareWinner(winnerId, '对撞退缩');
      return;
    }

    // RAISE: 揭示下一张牌
    const cards = collision.playerCards[playerId];
    if (cards.length > 0) {
      const revealed = cards.shift()!;
      collision.revealedCards[playerId].push(revealed);

      this.pushAction({
        type: 'COLLISION_CLASH',
        payload: { playerId, card: revealed, round: collision.round },
        durationMs: 1500,
      });
    }

    // 检查是否所有玩家都行动了，推进 round
    const allRevealed = Object.values(collision.revealedCards)
      .every(arr => arr.length > collision.roundIndex);

    if (allRevealed) {
      collision.roundIndex++;
      if (collision.roundIndex >= 3) {
        this.resolveCollision();
      } else {
        const rounds: Array<'FLOP' | 'TURN' | 'RIVER'> = ['FLOP', 'TURN', 'RIVER'];
        collision.round = rounds[collision.roundIndex];
      }
    }

    this.emit('STATE_UPDATED', this.getStateSnapshot());
  }

  private resolveCollision(): void {
    if (!this.state.collisionState) return;
    const collision = this.state.collisionState;
    const playerIds = Object.keys(this.state.players);

    // 对撞分 = 翻牌有效分之和 + 底池权重加成
    const revealScores = playerIds.map(id => {
      const revealed = collision.revealedCards[id];
      return revealed.reduce((sum, c) => sum + getEffectiveScore(c.rank, this.state.isInverted), 0);
    });

    // 将 pot 按权重分配给双方基础分
    const p1 = this.state.players[playerIds[0]];
    const p2 = this.state.players[playerIds[1]];
    const p1Weighted = p1.score * GAME_CONSTANTS.COLLISION_SCORE_WEIGHT +
      revealScores[0] * GAME_CONSTANTS.COLLISION_HAND_WEIGHT;
    const p2Weighted = p2.score * GAME_CONSTANTS.COLLISION_SCORE_WEIGHT +
      revealScores[1] * GAME_CONSTANTS.COLLISION_HAND_WEIGHT;

    if (Math.abs(p1Weighted - p2Weighted) < 0.001) {
      // 真正平局：比较剩余手牌总有效分
      const p1Remaining = collision.playerCards[playerIds[0]]
        .reduce((s, c) => s + getEffectiveScore(c.rank, this.state.isInverted), 0);
      const p2Remaining = collision.playerCards[playerIds[1]]
        .reduce((s, c) => s + getEffectiveScore(c.rank, this.state.isInverted), 0);

      if (p1Remaining === p2Remaining) {
        // 绝对平局：后手玩家胜（避免偏袒）
        this.declareWinner(playerIds[1], '魔力对撞 (平局后手胜)');
      } else {
        this.declareWinner(
          p1Remaining > p2Remaining ? playerIds[0] : playerIds[1],
          '魔力对撞 (平局加赛)'
        );
      }
    } else {
      this.declareWinner(
        p1Weighted > p2Weighted ? playerIds[0] : playerIds[1],
        '魔力对撞'
      );
    }
  }

  private declareWinner(winnerId: string, reason: string): void {
    this.state.phase = GamePhase.GAME_OVER;
    this.stopTimer();

    this.pushAction({
      type: 'SLOW_MOTION',
      payload: { reason },
      durationMs: 1500,
    });
    this.pushAction({
      type: 'VICTORY_SPLASH',
      payload: { winnerId, reason, state: this.getStateSnapshot() },
      durationMs: 3000,
    });

    this.addLog(`游戏结束！${this.state.players[winnerId].name} 获胜 (${reason})`);
    this.emit('GAME_OVER', { winnerId, reason });
  }

  // ═══════════════════════════════════════════════════════════
  //  计时器
  // ═══════════════════════════════════════════════════════════

  private turnStartedAt: number | null = null;

  private resetTimer(): void {
    // 过载法案 debuff: 改 15s
    const currentId = this.state.currentTurnPlayerId;
    const effects = aggregateEffectsFor(this.state, currentId);
    const timerMs = effects.turnTimerMs ?? GAME_CONSTANTS.TURN_TIMER_MS;
    this.state.timer = timerMs;
    if (this.state.phase === GamePhase.BOUNTY_ROLL) {
      this.turnStartedAt = Date.now();
    }
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      this.state.timer -= 1000;
      this.emit('TIMER_TICK', this.state.timer);
      if (this.state.timer <= 0) {
        this.forceEndTurn();
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  public destroy(): void {
    this.stopTimer();
    this.stopDecreeTimer();
    this.removeAllListeners();
  }

  // ═══════════════════════════════════════════════════════════
  //  内部工具方法
  // ═══════════════════════════════════════════════════════════

  /**
   * 咏唱得分衰减 — 前期回合施加系数压缩，推动对局进入对撞终局
   */
  private applyChantScoreDecay(rawScore: number): number {
    const turn = this.state.turnNumber;

    // 前3回合额外折扣
    if (turn <= GAME_CONSTANTS.EARLY_COMBO_TURN_THRESHOLD) {
      return Math.floor(rawScore * GAME_CONSTANTS.EARLY_COMBO_PENALTY);
    }

    // 前5回合衰减
    if (turn < GAME_CONSTANTS.CHANT_FULL_POWER_TURN) {
      return Math.floor(rawScore * GAME_CONSTANTS.CHANT_SCORE_DECAY);
    }

    return rawScore;
  }

  private createPlayer(id: string, name: string, hero: HeroType, hand: ICard[]): IPlayerState {
    return {
      id,
      name,
      hero,
      score: 0,
      hand,
      blockadeZone: null,
      blockadeZone2: null,
      hasUsedUltimate: false,
      ambushesThisTurn: 0,
      marketBuysThisTurn: 0,
      activeDecrees: [],
      handLimitDecay: 0,
      ambushWonThisTurn: false,
    };
  }

  private drawFromDeck(count: number): ICard[] {
    const cards: ICard[] = [];
    for (let i = 0; i < count && this.deck.length > 0; i++) {
      cards.push(this.deck.pop()!);
    }
    if (this.state) {
      this.state.deckCount = this.deck.length;
    }
    return cards;
  }

  private getPlayer(id: string): IPlayerState {
    const player = this.state.players[id];
    if (!player) throw new Error(`Player ${id} not found`);
    return player;
  }

  private getOpponentId(playerId: string): string {
    return Object.keys(this.state.players).find(id => id !== playerId)!;
  }

  private validatePhase(expected: GamePhase): void {
    if (this.state.phase !== expected) {
      throw new Error(`Invalid phase: expected ${expected}, got ${this.state.phase}`);
    }
  }

  private addLog(message: string): void {
    this.state.log.push({
      turn: this.state.turnNumber,
      phase: this.state.phase,
      message,
      timestamp: Date.now(),
    });
  }
}
