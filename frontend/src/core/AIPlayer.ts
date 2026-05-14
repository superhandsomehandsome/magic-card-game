/**
 * AI 玩家 — 自动决策对战机器人
 *
 * 监听引擎的 PHASE_CHANGED / TURN_CHANGED / AMBUSH_DECLARE 等事件，
 * 在 AI 回合自动执行：抽牌、突袭决策、咏唱、封锁。
 *
 * 设计原则：纯逻辑层，不依赖 UI；通过 GameEngine 的公共 API 操作。
 */
import type { GameEngine } from './GameEngine';
import type { ICard, IPlayerState, IGameState, IDecree } from '../types/game';
import {
  GamePhase, CardRank, GAME_CONSTANTS,
} from '../types/game';
import type { AmbushDeclaration } from '../types/game';
import { detectCombos, getBlockedRank } from '../utils/scoring';
import { aggregateEffectsFor, calcBidPower } from './decrees';

/** AI 基础行动延迟（毫秒）— 调小可整体提速 */
const AI_BASE_DELAY_MS = 500;

export class AIPlayer {
  private engine: GameEngine;
  private aiPlayerId: string;
  private actionTimer: ReturnType<typeof setTimeout> | null = null;
  private collisionTickTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(engine: GameEngine, aiPlayerId: string) {
    this.engine = engine;
    this.aiPlayerId = aiPlayerId;
    this.bind();
  }

  private bind(): void {
    this.engine.on('PHASE_CHANGED', (phase: GamePhase) => {
      this.scheduleAction(() => this.onPhaseChanged(phase));
    });
    this.engine.on('TURN_CHANGED', () => {
      this.scheduleAction(() => this.onPhaseChanged(this.engine.getState().phase));
    });
    // 对撞阶段 engine 仅 emit STATE_UPDATED, 需要主动推进
    // 用独立 timer 槽位避免被主 actionTimer 覆盖掉
    this.engine.on('STATE_UPDATED', () => {
      const s = this.engine.getState();
      if (s.phase === GamePhase.COLLISION) {
        if (this.collisionTickTimer) clearTimeout(this.collisionTickTimer);
        this.collisionTickTimer = setTimeout(() => this.handleCollision(), 200);
      }
      // 偷牌待办 (AI 是 chooser 时随机挑)
      if (s.pendingSteal && s.pendingSteal.chooserId === this.aiPlayerId) {
        if (this.collisionTickTimer) clearTimeout(this.collisionTickTimer);
        this.collisionTickTimer = setTimeout(() => this.handlePendingSteal(), 600);
      }
    });
  }

  private scheduleAction(fn: () => void, delayMs = AI_BASE_DELAY_MS): void {
    if (this.actionTimer) clearTimeout(this.actionTimer);
    this.actionTimer = setTimeout(fn, delayMs);
  }

  // ═══════════════════════════════════════════════════════════
  //  阶段路由
  // ═══════════════════════════════════════════════════════════

  private onPhaseChanged(phase: GamePhase): void {
    const state = this.engine.getState();

    // 法案争夺 (双方都需要参与)
    if (phase === GamePhase.DECREE_CONTEST) {
      this.handleDecreeContest();
      return;
    }

    // 防守方决策 (无论谁的回合)
    if (phase === GamePhase.AMBUSH_DEFEND &&
        state.ambushState?.defenderId === this.aiPlayerId) {
      this.handleAmbushDefend();
      return;
    }

    // 仅 AI 自己的回合执行进攻动作
    if (state.currentTurnPlayerId !== this.aiPlayerId) return;

    switch (phase) {
      case GamePhase.BOUNTY_ROLL:
        this.scheduleAction(() => this.engine.nextPhase(), 600);
        break;
      case GamePhase.DRAW_MARKET:
        this.handleDrawMarket();
        break;
      case GamePhase.AMBUSH_DECLARE:
        this.handleAmbushDeclare();
        break;
      case GamePhase.CHANT_SCORE:
        this.handleChant();
        break;
      case GamePhase.BLOCKADE_END:
        this.handleBlockade();
        break;
      case GamePhase.COLLISION:
        this.handleCollision();
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  法案争夺 (Decree Contest)
  // ═══════════════════════════════════════════════════════════

  private handleDecreeContest(): void {
    const state = this.engine.getState();
    const ctx = state.decreeContest;
    if (!ctx) return;

    // OPT_IN: 决定争夺/放弃
    if (ctx.step === 'OPT_IN' && ctx.optIn[this.aiPlayerId] === null) {
      const choice = this.evaluateDecreeOptIn(ctx.decree);
      this.scheduleAction(() => {
        this.engine.submitDecreeOptIn(this.aiPlayerId, choice);
      }, 800 + Math.random() * 1500); // 0.8-2.3s 模拟思考
      return;
    }

    // BIDDING: 选 1-3 张牌出价
    if (ctx.step === 'BIDDING' && ctx.bids[this.aiPlayerId] === null) {
      const cards = this.pickBidCards(state, ctx.decree);
      this.scheduleAction(() => {
        if (cards.length === 0) {
          // 没牌可竞标 → 自动放弃
          this.engine.submitDecreeBid(this.aiPlayerId, []);
        } else {
          this.engine.submitDecreeBid(this.aiPlayerId, cards.map(c => c.id));
        }
      }, 1000 + Math.random() * 2000); // 1-3s 思考
      return;
    }
  }

  /** 评估法案对自己的价值 → 决定 CONTEST/PASS */
  private evaluateDecreeOptIn(decree: IDecree): 'CONTEST' | 'PASS' {
    // 简单启发：根据法案类别和当前状态决定。给一个 0-1 的"想要度"。
    let desire = 0.5;

    const state = this.engine.getState();
    const me = state.players[this.aiPlayerId];
    const opp = this.getOpponent(state);

    // 落后则更激进
    if (me.score < opp.score - 20) desire += 0.2;
    if (me.score > opp.score + 20) desire -= 0.1;

    // 类别偏好
    switch (decree.category) {
      case 'ECONOMY':
        // 暴食/破产：抽牌强力，想要
        desire += 0.15;
        break;
      case 'AMBUSH':
        // 突袭法案：当己方手牌少且落后时较弱
        if (me.hand.length < 4) desire -= 0.1;
        else desire += 0.1;
        break;
      case 'CHANT':
        // 咏唱法案：手牌足时强力
        desire += me.hand.length >= 5 ? 0.15 : -0.05;
        break;
      case 'TEMPO':
        // 过载：节奏掌控，中性偏弱
        desire -= 0.1;
        break;
    }

    // debuff 严重程度大致权重
    const debuffStr = decree.debuff;
    if (debuffStr.handLimitDelta && debuffStr.handLimitDelta < -2) desire -= 0.15;
    if (debuffStr.forbidStraights) desire -= 0.1;
    if (debuffStr.requireAmbushWinForChant) desire -= 0.15;

    desire += (Math.random() - 0.5) * 0.2; // 抖动
    return desire > 0.5 ? 'CONTEST' : 'PASS';
  }

  /** 选竞标卡：尽量出小牌 + 尝试凑组合奖励 */
  private pickBidCards(state: IGameState, _decree: IDecree): ICard[] {
    void _decree;
    const me = state.players[this.aiPlayerId];
    const valid = me.hand.filter(c => c.rank !== CardRank.FLASH && !c.isPhantom);
    if (valid.length === 0) return [];
    if (valid.length === 1) return valid;

    // 评估几种组合策略，挑战力高且消耗小的
    const candidates: { cards: ICard[]; total: number; cost: number }[] = [];

    // 策略 A: 单张最低
    const sortedAsc = [...valid].sort((a, b) => a.baseScore - b.baseScore);
    candidates.push({
      cards: [sortedAsc[0]],
      total: calcBidPower([sortedAsc[0]], state.isInverted).total,
      cost: sortedAsc[0].baseScore,
    });

    // 策略 B: 最低 2 张
    if (sortedAsc.length >= 2) {
      const cards = [sortedAsc[0], sortedAsc[1]];
      candidates.push({
        cards,
        total: calcBidPower(cards, state.isInverted).total,
        cost: cards.reduce((s, c) => s + c.baseScore, 0),
      });
    }

    // 策略 C: 凑三同
    const rankGroups = new Map<CardRank, ICard[]>();
    for (const c of valid) {
      const arr = rankGroups.get(c.rank) || [];
      arr.push(c);
      rankGroups.set(c.rank, arr);
    }
    for (const [, group] of rankGroups) {
      if (group.length >= 3) {
        const cards = group.slice(0, 3);
        candidates.push({
          cards,
          total: calcBidPower(cards, state.isInverted).total,
          cost: cards.reduce((s, c) => s + c.baseScore, 0),
        });
      } else if (group.length === 2) {
        // 凑对子 + 1 张散牌
        const extra = sortedAsc.find(c => c.rank !== group[0].rank);
        if (extra) {
          const cards = [...group, extra];
          candidates.push({
            cards,
            total: calcBidPower(cards, state.isInverted).total,
            cost: cards.reduce((s, c) => s + c.baseScore, 0),
          });
        }
      }
    }

    // 策略 D: 三阶序列
    const ranks = [...new Set(valid.map(c => c.rank))].sort((a, b) => a - b);
    for (let i = 0; i + 2 < ranks.length; i++) {
      if (ranks[i + 1] === ranks[i] + 1 && ranks[i + 2] === ranks[i] + 2) {
        const cards = [
          valid.find(c => c.rank === ranks[i])!,
          valid.find(c => c.rank === ranks[i + 1])!,
          valid.find(c => c.rank === ranks[i + 2])!,
        ];
        candidates.push({
          cards,
          total: calcBidPower(cards, state.isInverted).total,
          cost: cards.reduce((s, c) => s + c.baseScore, 0),
        });
      }
    }

    // 选战力 / 损耗比最高的
    candidates.sort((a, b) => (b.total / Math.max(b.cost, 1)) - (a.total / Math.max(a.cost, 1)));
    return candidates[0].cards;
  }

  // ═══════════════════════════════════════════════════════════
  //  偷牌待办: AI 随机挑
  // ═══════════════════════════════════════════════════════════
  private handlePendingSteal(): void {
    const state = this.engine.getState();
    const pending = state.pendingSteal;
    if (!pending || pending.chooserId !== this.aiPlayerId) return;
    const victim = state.players[pending.fromPlayerId];
    if (!victim) return;
    // 随机挑 N 张
    const pool = [...victim.hand];
    const picks: string[] = [];
    for (let i = 0; i < pending.count && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      picks.push(pool[idx].id);
      pool.splice(idx, 1);
    }
    if (picks.length === pending.count) {
      this.engine.confirmSteal(this.aiPlayerId, picks);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  终局：对撞
  // ═══════════════════════════════════════════════════════════
  private handleCollision(): void {
    const state = this.engine.getState();
    const collision = state.collisionState;
    if (!collision) return;

    // ── Step 1: PICK — 从手牌选 3 张（或全部）参战 ──
    if (collision.step === 'PICK' && !collision.pickConfirmed[this.aiPlayerId]) {
      const me = state.players[this.aiPlayerId];
      const pickCount = Math.min(3, me.hand.length);
      if (pickCount === 0) return;
      const sorted = [...me.hand].sort((a, b) => b.baseScore - a.baseScore);
      const pickIds = sorted.slice(0, pickCount).map(c => c.id);
      this.scheduleAction(() => {
        if (this.engine.getState().phase !== GamePhase.COLLISION) return;
        this.engine.collisionPickCards(this.aiPlayerId, pickIds);
        this.scheduleAction(() => this.handleCollision(), 500);
      }, 800);
      return;
    }

    // ── Step 2: BETTING — 下注 0-20 ──
    if (collision.step === 'BETTING' && !collision.betConfirmed[this.aiPlayerId]) {
      const me = state.players[this.aiPlayerId];
      const opp = this.getOpponent(state);
      const myCards = collision.playerCards[this.aiPlayerId] || [];
      const myPower = myCards.reduce((s, c) => s + c.baseScore, 0);
      // 手牌强就多下注，弱就少下
      const bet = myPower >= 12 ? Math.floor(10 + Math.random() * 11)
                : myPower >= 6  ? Math.floor(3 + Math.random() * 8)
                : Math.floor(Math.random() * 4);
      this.scheduleAction(() => {
        if (this.engine.getState().phase !== GamePhase.COLLISION) return;
        this.engine.collisionPlaceBet(this.aiPlayerId, bet);
        this.scheduleAction(() => this.handleCollision(), 500);
      }, 800);
      return;
    }

    // ── Step 2.5: 排序确认（仅翻牌前执行一次） ──
    const totalRevealed = Object.values(collision.revealedCards)
      .reduce((s, arr) => s + arr.length, 0);
    if (!collision.orderConfirmed?.[this.aiPlayerId] && totalRevealed === 0) {
      const cards = collision.playerCards[this.aiPlayerId] || [];
      if (cards.length > 0) {
        const ordered = [...cards].sort((a, b) => b.baseScore - a.baseScore);
        this.scheduleAction(() => {
          this.engine.setCollisionOrder(this.aiPlayerId, ordered.map(c => c.id));
        }, 600);
      }
      return;
    }

    // ── Step 3: REVEAL —— 由人类玩家点击翻牌按钮驱动，AI 无需操作 ──
  }

  // ═══════════════════════════════════════════════════════════
  //  阶段1: 黑市
  // ═══════════════════════════════════════════════════════════

  private handleDrawMarket(): void {
    // 抽牌 (引擎可能因 deck empty 内部转 COLLISION, 此后状态会变)
    if (this.engine.getState().phase === GamePhase.DRAW_MARKET) {
      this.engine.drawPhaseCards(this.aiPlayerId);
    }

    this.scheduleAction(() => {
      const state = this.engine.getState();
      // 防御: 若已离开 DRAW_MARKET (例如 deck empty 触发了 COLLISION), 直接退出
      if (state.phase !== GamePhase.DRAW_MARKET) return;
      const me = state.players[this.aiPlayerId];

      // 黑市判断: 找性价比高的牌购买 (有80%手牌总分余量)
      const target = state.marketCards.find(c => {
        const totalAvail = me.hand.reduce((s, h) => s + h.baseScore, 0);
        return totalAvail >= c.baseScore * 1.8 && c.rank <= CardRank.B;
      });

      if (target) {
        const payment = this.pickPaymentCards(me.hand, target.baseScore);
        if (payment.length > 0 && this.engine.getState().phase === GamePhase.DRAW_MARKET) {
          this.engine.buyMarketCard(this.aiPlayerId, target.id, payment.map(c => c.id));
        }
      }

      this.scheduleAction(() => {
        if (this.engine.getState().phase === GamePhase.DRAW_MARKET) {
          this.engine.nextPhase();
        }
      }, 400);
    }, 400);
  }

  private pickPaymentCards(hand: ICard[], targetScore: number): ICard[] {
    // 选最低分的几张凑齐目标分
    const sorted = [...hand].sort((a, b) => a.baseScore - b.baseScore);
    const picked: ICard[] = [];
    let total = 0;
    for (const card of sorted) {
      if (total >= targetScore) break;
      picked.push(card);
      total += card.baseScore;
    }
    return total >= targetScore ? picked : [];
  }

  // ═══════════════════════════════════════════════════════════
  //  阶段2: 突袭 (攻击方)
  // ═══════════════════════════════════════════════════════════

  private handleAmbushDeclare(): void {
    const state = this.engine.getState();
    const me = state.players[this.aiPlayerId];

    if (me.ambushesThisTurn >= GAME_CONSTANTS.MAX_AMBUSH_PER_TURN) {
      this.scheduleAction(() => this.engine.nextPhase(), 300);
      return;
    }

    const candidates = me.hand.filter(c => c.rank !== CardRank.FLASH);

    // 第一次突袭：决定是否打
    if (me.ambushesThisTurn === 0) {
      const shouldAmbush = Math.random() < 0.6 && me.hand.length > 1 && candidates.length > 0;
      if (!shouldAmbush) {
        this.scheduleAction(() => this.engine.nextPhase(), 300);
        return;
      }
      this.executeAmbush(candidates);
      return;
    }

    // 第二次突袭：需 ≥ 2 张非瞬牌，且 30% 概率发起
    if (me.ambushesThisTurn === 1) {
      const wantsSecond = Math.random() < 0.3 && candidates.length >= 2;
      if (!wantsSecond) {
        this.scheduleAction(() => this.engine.nextPhase(), 300);
        return;
      }
      // 弃最低分牌 + 第二低或最高分作攻击牌
      const sortedAsc = [...candidates].sort((a, b) => a.baseScore - b.baseScore);
      const discardCard = sortedAsc[0];
      const attackCandidates = sortedAsc.slice(1);
      this.executeAmbush(attackCandidates, discardCard.id);
      return;
    }
  }

  private executeAmbush(candidates: ICard[], discardCardId?: string): void {
    if (candidates.length === 0) {
      this.scheduleAction(() => this.engine.nextPhase(), 300);
      return;
    }
    const card = candidates[Math.floor(Math.random() * candidates.length)];
    const r = Math.random();
    let declaration: AmbushDeclaration | null = null;

    if (r < 0.4) {
      declaration = null;
    } else if (r < 0.7) {
      declaration = card.rank;
    } else {
      const ranks = [CardRank.A, CardRank.B, CardRank.C, CardRank.D, CardRank.E, CardRank.F];
      const lies = ranks.filter(r2 => r2 !== card.rank);
      declaration = lies[Math.floor(Math.random() * lies.length)];
    }

    const ok = this.engine.declareAmbush(this.aiPlayerId, card.id, declaration, discardCardId);
    if (!ok) {
      // 失败兜底：直接进入下一阶段
      this.scheduleAction(() => this.engine.nextPhase(), 300);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  阶段2: 突袭防守
  // ═══════════════════════════════════════════════════════════

  private handleAmbushDefend(): void {
    const state = this.engine.getState();
    const ambush = state.ambushState;
    if (!ambush) return;

    const me = state.players[this.aiPlayerId];
    const declaration = ambush.declaration;
    const hasDeclaration = declaration !== null && declaration !== 'SILENT';

    // 决策矩阵
    const r = Math.random();

    // 没牌: 只能怯战
    if (me.hand.length === 0) {
      this.scheduleAction(() => {
        this.engine.resolveAmbushDefend(this.aiPlayerId, 'FOLD');
      }, 600);
      return;
    }

    // 有声明: 30%拆穿, 50%迎战, 20%怯战
    // 无声明: 60%迎战, 25%怯战, 15%只能盲战
    if (hasDeclaration && r < 0.3) {
      this.scheduleAction(() => {
        this.engine.resolveAmbushDefend(this.aiPlayerId, 'CALL_BLUFF');
      }, 800);
      return;
    }

    if (r < (hasDeclaration ? 0.8 : 0.85)) {
      // 迎战: 选最高有效分的牌
      const sorted = [...me.hand].sort((a, b) => {
        if (a.rank === CardRank.FLASH) return 1;
        if (b.rank === CardRank.FLASH) return -1;
        return b.rank - a.rank;
      });
      const defCard = sorted[0];
      this.scheduleAction(() => {
        this.engine.resolveAmbushDefend(this.aiPlayerId, 'DEFEND', defCard.id);
      }, 800);
      return;
    }

    // 怯战
    this.scheduleAction(() => {
      this.engine.resolveAmbushDefend(this.aiPlayerId, 'FOLD');
    }, 600);
  }

  // ═══════════════════════════════════════════════════════════
  //  阶段3: 咏唱
  // ═══════════════════════════════════════════════════════════

  private handleChant(): void {
    const state = this.engine.getState();
    const me = state.players[this.aiPlayerId];
    const opponent = this.getOpponent(state);
    const blockedRank = getBlockedRank(opponent);
    const effects = aggregateEffectsFor(state, this.aiPlayerId);

    // 傲慢 debuff: 没赢突袭就直接进入封锁
    if (effects.requireAmbushWinForChant && !me.ambushWonThisTurn) {
      this.scheduleAction(() => this.engine.nextPhase(), 400);
      return;
    }

    const combos = detectCombos(me.hand, state.isInverted, blockedRank, effects);
    // 只挑净得分（含封锁罚分）正的组合
    const profitable = combos.filter(c => (c.score - (c.blockedPenalty || 0)) > 0);
    if (profitable.length === 0) {
      this.scheduleAction(() => this.engine.nextPhase(), 400);
      return;
    }

    // 选净得分最高的组合
    const best = profitable.sort(
      (a, b) => (b.score - (b.blockedPenalty || 0)) - (a.score - (a.blockedPenalty || 0)),
    )[0];
    this.scheduleAction(() => {
      this.engine.submitComboScore(
        this.aiPlayerId,
        best.cards.map(c => c.id),
        best.score
      );
      this.scheduleAction(() => this.engine.nextPhase(), 500);
    }, 600);
  }

  // ═══════════════════════════════════════════════════════════
  //  阶段4: 封锁
  // ═══════════════════════════════════════════════════════════

  private handleBlockade(): void {
    const state = this.engine.getState();
    const me = state.players[this.aiPlayerId];
    const opponent = this.getOpponent(state);

    // 处理弃牌超限
    if (me.hand.length > GAME_CONSTANTS.HAND_LIMIT) {
      const excess = me.hand.length - GAME_CONSTANTS.HAND_LIMIT;
      const sorted = [...me.hand].sort((a, b) => a.baseScore - b.baseScore);
      const toDiscard = sorted.slice(0, excess);
      this.engine.discardExcess(this.aiPlayerId, toDiscard.map(c => c.id));
    }

    // 决策: 选对手最多的同 rank 进行封锁
    const oppRankCounts = new Map<CardRank, number>();
    opponent.hand.forEach(c => {
      if (c.rank !== CardRank.FLASH) {
        oppRankCounts.set(c.rank, (oppRankCounts.get(c.rank) || 0) + 1);
      }
    });

    let mostCommonOppRank: CardRank | null = null;
    let maxCount = 0;
    oppRankCounts.forEach((count, rank) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommonOppRank = rank;
      }
    });

    // 找一张可以封锁该 rank 的牌; 否则选最低有效分牌
    const blockCard = mostCommonOppRank !== null
      ? me.hand.find(c => c.rank === mostCommonOppRank)
      : null;

    const target = blockCard ?? [...me.hand]
      .filter(c => c.rank !== CardRank.FLASH)
      .sort((a, b) => a.baseScore - b.baseScore)[0];

    if (target) {
      this.scheduleAction(() => {
        this.engine.placeBlockade(this.aiPlayerId, target.id);
        this.scheduleAction(() => this.engine.nextPhase(), 500);
      }, 500);
    } else {
      this.scheduleAction(() => this.engine.nextPhase(), 400);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  辅助
  // ═══════════════════════════════════════════════════════════

  private getOpponent(state: IGameState): IPlayerState {
    const oppId = Object.keys(state.players).find(id => id !== this.aiPlayerId)!;
    return state.players[oppId];
  }

  public destroy(): void {
    if (this.actionTimer) clearTimeout(this.actionTimer);
    if (this.collisionTickTimer) clearTimeout(this.collisionTickTimer);
  }
}
