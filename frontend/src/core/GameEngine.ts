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
} from '../types/game';
import {
  GamePhase, CardRank, HeroType,
  GAME_CONSTANTS,
} from '../types/game';
import type { AmbushDeclaration } from '../types/game';
import { createDeck, shuffleDeck, compareCards, getEffectiveScore } from '../utils/deck';

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
  | 'HERO_ABILITY_USED';

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

    this.state.phase = next;
    this.resetTimer();
    this.emit('PHASE_CHANGED', next);

    if (next === GamePhase.BOUNTY_ROLL) {
      this.executeBountyRoll();
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

    const paymentCards = paymentCardIds
      .map(id => player.hand.find(c => c.id === id))
      .filter((c): c is ICard => c !== undefined);

    const paymentTotal = paymentCards.reduce((sum, c) => sum + c.baseScore, 0);
    if (paymentTotal < marketCard.baseScore) return false;

    // 移除支付牌
    paymentCards.forEach(card => {
      player.hand = player.hand.filter(c => c.id !== card.id);
      this.state.discardPile.push(card);
      this.pushAction({
        type: 'VFX_BURN',
        payload: { card, playerId },
        durationMs: 500,
      });
    });

    // 获得黑市牌
    player.hand.push(marketCard);
    player.marketBuysThisTurn++;
    this.state.marketCards = this.state.marketCards.filter(c => c.id !== marketCardId);

    // 补充黑市
    const refill = this.drawFromDeck(1);
    this.state.marketCards.push(...refill);

    this.addLog(`${player.name} 从黑市购得 ${CardRank[marketCard.rank]} 级牌`);
    this.emit('STATE_UPDATED', this.getStateSnapshot());
    return true;
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

    switch (choice) {
      case 'FOLD':
        this.resolveAmbushFold(attacker, defender, ambush);
        break;
      case 'CALL_BLUFF':
        this.resolveAmbushCallBluff(attacker, defender, ambush);
        break;
      case 'DEFEND':
        if (!defenderCardId) return;
        this.resolveAmbushDefendClash(attacker, defender, ambush, defenderCardId);
        break;
    }

    ambush.resolved = true;
    const resolvedResult = {
      choice,
      attackCard: ambush.attackCard,
      defenderCard: ambush.defenderCard,
      declaration: ambush.declaration,
    };
    this.state.ambushState = null;
    this.state.phase = GamePhase.AMBUSH_DECLARE;
    this.checkWinCondition();
    this.emit('AMBUSH_RESOLVED', resolvedResult);
    this.emit('STATE_UPDATED', this.getStateSnapshot());
  }

  private resolveAmbushFold(
    attacker: IPlayerState,
    defender: IPlayerState,
    ambush: IAmbushState
  ): void {
    // 攻击方独吞 bountyPool
    attacker.score += this.state.bountyPool;
    this.pushAction({
      type: 'SCORE_BURST',
      payload: { playerId: attacker.id, amount: this.state.bountyPool, reason: '独吞悬赏' },
      durationMs: 800,
    });
    this.state.bountyPool = 0;

    // 攻击方收回暗扣牌
    attacker.hand.push(ambush.attackCard);

    // 随机偷窃对手1张牌
    if (defender.hand.length > 0) {
      const stealIdx = Math.floor(Math.random() * defender.hand.length);
      const stolen = defender.hand.splice(stealIdx, 1)[0];
      attacker.hand.push(stolen);
      this.pushAction({
        type: 'CARD_STEAL',
        payload: { fromId: defender.id, toId: attacker.id, card: stolen },
        durationMs: 600,
      });
    }

    this.addLog(`${defender.name} 怯战！${attacker.name} 独吞悬赏并偷取1牌`);
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

    if (isTruthful) {
      // 说真话被拆穿：防守方被重罚
      defender.score -= GAME_CONSTANTS.BLUFF_PENALTY;
      this.state.discardPile.push(ambush.attackCard);
      this.addLog(`拆穿失败！${attacker.name} 说真话，${defender.name} -${GAME_CONSTANTS.BLUFF_PENALTY}分`);
    } else {
      // 说谎被拆穿：攻击方被重罚
      attacker.score -= GAME_CONSTANTS.BLUFF_PENALTY;
      defender.hand.push(ambush.attackCard);
      this.addLog(`拆穿成功！${attacker.name} 说谎，-${GAME_CONSTANTS.BLUFF_PENALTY}分，牌归防守方`);
    }

    this.pushAction({
      type: 'CARD_CLASH',
      payload: {
        attackCard: ambush.attackCard,
        isTruthful,
        penalizedId: isTruthful ? defender.id : attacker.id,
      },
      durationMs: 1200,
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

    // 防守方出[瞬]：强行吸走攻击牌
    if (defCard.rank === CardRank.FLASH) {
      defender.hand.push(atkCard);
      this.state.discardPile.push(defCard);
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
      // 平局：悬赏金保留
      this.state.discardPile.push(atkCard, defCard);
      this.pushAction({
        type: 'BOUNTY_RETAINED',
        payload: { amount: this.state.bountyPool },
        durationMs: 800,
      });
      this.addLog(`拼点平局！血池保留至下回合`);
    } else {
      const winner = result > 0 ? attacker : defender;
      const loser = result > 0 ? defender : attacker;
      const winCard = result > 0 ? atkCard : defCard;

      // 赢家抽1偷1 + 独吞 bountyPool
      winner.score += this.state.bountyPool;

      // A赢额外+20，B赢额外+10
      const effectiveScore = getEffectiveScore(winCard.rank, this.state.isInverted);
      if (effectiveScore === 6) winner.score += GAME_CONSTANTS.A_WIN_BONUS;
      else if (effectiveScore === 5) winner.score += GAME_CONSTANTS.B_WIN_BONUS;

      this.pushAction({
        type: 'SCORE_BURST',
        payload: { playerId: winner.id, amount: this.state.bountyPool, reason: '拼点胜利' },
        durationMs: 800,
      });

      this.state.bountyPool = 0;

      // 赢家抽1
      const drawn = this.drawFromDeck(1);
      winner.hand.push(...drawn);

      // 赢家偷1
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

      this.state.discardPile.push(atkCard, defCard);
      this.addLog(`${winner.name} 拼点获胜！独吞悬赏 +${this.state.bountyPool}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  阶段 3：CHANT_SCORE (咏唱计分)
  // ═══════════════════════════════════════════════════════════

  public submitComboScore(playerId: string, cardIds: string[], score: number): void {
    this.validatePhase(GamePhase.CHANT_SCORE);
    const player = this.getPlayer(playerId);

    // 移除使用的牌
    const usedCards: ICard[] = [];
    cardIds.forEach(id => {
      const card = player.hand.find(c => c.id === id);
      if (card) {
        usedCards.push(card);
        player.hand = player.hand.filter(c => c.id !== id);
      }
    });

    // 应用早期得分衰减 (推动更多对撞终局)
    const actualScore = this.applyChantScoreDecay(score);
    player.score += actualScore;
    this.state.discardPile.push(...usedCards);

    this.pushAction({
      type: 'COMBO_HIGHLIGHT',
      payload: { cards: usedCards, score: actualScore, originalScore: score },
      durationMs: 600,
    });
    this.pushAction({
      type: 'SCORE_BURST',
      payload: { playerId, amount: actualScore, reason: '咏唱得分' },
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

  // ═══════════════════════════════════════════════════════════
  //  回合控制
  // ═══════════════════════════════════════════════════════════

  private endTurn(): void {
    const currentId = this.state.currentTurnPlayerId;
    const current = this.getPlayer(currentId);

    // 手牌上限检查
    if (current.hand.length > GAME_CONSTANTS.HAND_LIMIT) {
      return; // UI 层应提示弃牌
    }

    // 重置回合计数器
    current.ambushesThisTurn = 0;
    current.marketBuysThisTurn = 0;

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

  private resetTimer(): void {
    this.state.timer = GAME_CONSTANTS.TURN_TIMER_MS;
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
      hasUsedUltimate: false,
      ambushesThisTurn: 0,
      marketBuysThisTurn: 0,
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
