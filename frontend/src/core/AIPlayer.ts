/**
 * AI 玩家 — 自动决策对战机器人
 *
 * 监听引擎的 PHASE_CHANGED / TURN_CHANGED / AMBUSH_DECLARE 等事件，
 * 在 AI 回合自动执行：抽牌、突袭决策、咏唱、封锁。
 *
 * 设计原则：纯逻辑层，不依赖 UI；通过 GameEngine 的公共 API 操作。
 */
import type { GameEngine } from './GameEngine';
import type { ICard, IPlayerState, IGameState } from '../types/game';
import {
  GamePhase, CardRank, GAME_CONSTANTS,
} from '../types/game';
import type { AmbushDeclaration } from '../types/game';
import { detectCombos, getBlockedRank } from '../utils/scoring';

/** AI 基础行动延迟（毫秒）— 调小可整体提速 */
const AI_BASE_DELAY_MS = 500;

export class AIPlayer {
  private engine: GameEngine;
  private aiPlayerId: string;
  private actionTimer: ReturnType<typeof setTimeout> | null = null;

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
  //  终局：对撞
  // ═══════════════════════════════════════════════════════════
  private handleCollision(): void {
    const state = this.engine.getState();
    const collision = state.collisionState;
    if (!collision) return;

    // 排兵布阵步骤：AI 自动按高分排前面，立即确认
    if (!collision.orderConfirmed?.[this.aiPlayerId]) {
      const cards = collision.playerCards[this.aiPlayerId] || [];
      const ordered = [...cards].sort((a, b) => b.baseScore - a.baseScore);
      this.scheduleAction(() => {
        this.engine.setCollisionOrder(this.aiPlayerId, ordered.map(c => c.id));
      }, 700);
      return;
    }

    // 加注/退缩：80% 加注，劣势时 30% 退缩
    if (state.currentTurnPlayerId !== this.aiPlayerId) return;
    const me = state.players[this.aiPlayerId];
    const opp = this.getOpponent(state);
    const r = Math.random();
    const losing = me.score < opp.score - 30;
    const action: 'RAISE' | 'FOLD' = (losing && r < 0.3) ? 'FOLD' : 'RAISE';
    this.scheduleAction(() => this.engine.collisionAction(this.aiPlayerId, action), 800);
  }

  // ═══════════════════════════════════════════════════════════
  //  阶段1: 黑市
  // ═══════════════════════════════════════════════════════════

  private handleDrawMarket(): void {
    this.engine.drawPhaseCards(this.aiPlayerId);

    this.scheduleAction(() => {
      const state = this.engine.getState();
      const me = state.players[this.aiPlayerId];

      // 黑市判断: 找性价比高的牌购买 (有80%手牌总分余量)
      const target = state.marketCards.find(c => {
        const totalAvail = me.hand.reduce((s, h) => s + h.baseScore, 0);
        return totalAvail >= c.baseScore * 1.8 && c.rank <= CardRank.B;
      });

      if (target) {
        const payment = this.pickPaymentCards(me.hand, target.baseScore);
        if (payment.length > 0) {
          this.engine.buyMarketCard(this.aiPlayerId, target.id, payment.map(c => c.id));
        }
      }

      this.scheduleAction(() => this.engine.nextPhase(), 400);
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

    const combos = detectCombos(me.hand, state.isInverted, blockedRank);
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
  }
}
