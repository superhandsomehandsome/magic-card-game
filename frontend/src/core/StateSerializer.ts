/**
 * 状态序列化与视角脱敏层 (State Serializer & View-Based Masking)
 *
 * 核心原则：基于视角的差异化状态脱敏 (Perspective-Based Differential Masking)
 * - Owner 视角: 完整卡牌元数据 (cardId, rank, baseScore)
 * - Opponent 视角: 服务端层面字段混淆 (Field Obfuscation), 强制覆写为 HIDDEN_CARD
 * - 坚决杜绝客户端本地 UI 隐藏 (Client-Side Hiding), 防止抓包作弊
 */
import type { IGameState, ICard, IAmbushState, IPlayerState, ICollisionState } from '../types/game';

// ═══════════════════════════════════════════════════════════
//  常量：占位符卡牌
// ═══════════════════════════════════════════════════════════

export const HIDDEN_CARD: Readonly<ICard> = Object.freeze({
  id: '__HIDDEN__',
  rank: -1 as any,
  baseScore: 0,
});

// ═══════════════════════════════════════════════════════════
//  DTO 类型定义：差异化视角输出
// ═══════════════════════════════════════════════════════════

export interface IAmbushZoneDTO {
  attackerId: string;
  defenderId: string;
  /** Owner 可见完整卡牌; Opponent 视角为 HIDDEN_CARD */
  attackCard: ICard | typeof HIDDEN_CARD;
  declaration: IAmbushState['declaration'];
  defenderCard: ICard | typeof HIDDEN_CARD | null;
  resolved: boolean;
}

export interface IPlayerStateDTO {
  id: string;
  name: string;
  hero: IPlayerState['hero'];
  score: number;
  /** Owner 看到完整手牌; Opponent 只看到数量 */
  hand: ICard[] | null;
  handCount: number;
  blockadeZone: ICard | null;
  hasUsedUltimate: boolean;
  ambushesThisTurn: number;
}

export interface IGameStateDTO {
  matchId: string;
  currentTurnPlayerId: string;
  phase: IGameState['phase'];
  turnNumber: number;
  timer: number;
  bountyPool: number;
  isInverted: boolean;
  invertedTurnsLeft: number;
  players: Record<string, IPlayerStateDTO>;
  marketCards: ICard[];
  deckCount: number;
  ambushState: IAmbushZoneDTO | null;
  collisionState: ICollisionState | null;
  log: IGameState['log'];
}

// ═══════════════════════════════════════════════════════════
//  序列化引擎：基于 viewerId 产出脱敏后的 DTO
// ═══════════════════════════════════════════════════════════

export class StateSerializer {
  /**
   * 将完整游戏状态序列化为指定玩家视角的 DTO
   * 所有敏感信息在此处进行服务端级脱敏
   */
  static serialize(fullState: IGameState, viewerId: string): IGameStateDTO {
    const players: Record<string, IPlayerStateDTO> = {};

    for (const [pid, player] of Object.entries(fullState.players)) {
      players[pid] = StateSerializer.serializePlayer(player, pid === viewerId);
    }

    return {
      matchId: fullState.matchId,
      currentTurnPlayerId: fullState.currentTurnPlayerId,
      phase: fullState.phase,
      turnNumber: fullState.turnNumber,
      timer: fullState.timer,
      bountyPool: fullState.bountyPool,
      isInverted: fullState.isInverted,
      invertedTurnsLeft: fullState.invertedTurnsLeft,
      players,
      marketCards: fullState.marketCards,
      deckCount: fullState.deckCount,
      ambushState: fullState.ambushState
        ? StateSerializer.serializeAmbushZone(fullState.ambushState, viewerId)
        : null,
      collisionState: fullState.collisionState
        ? StateSerializer.serializeCollision(fullState.collisionState, viewerId)
        : null,
      log: fullState.log,
    };
  }

  /**
   * 突袭区脱敏 — 核心差异化逻辑
   *
   * 规则:
   * 1. attackCard: 仅攻击方(Owner)可见完整数据，防守方看到 HIDDEN_CARD
   * 2. defenderCard: 仅防守方(Owner)可见完整数据，攻击方看到 HIDDEN_CARD
   * 3. 结算完毕(resolved=true)后双方均可见
   */
  private static serializeAmbushZone(ambush: IAmbushState, viewerId: string): IAmbushZoneDTO {
    const isAttacker = ambush.attackerId === viewerId;
    const isDefender = ambush.defenderId === viewerId;

    let maskedAttackCard: ICard | typeof HIDDEN_CARD;
    let maskedDefenderCard: ICard | typeof HIDDEN_CARD | null;

    if (ambush.resolved) {
      // 结算后全部公开
      maskedAttackCard = ambush.attackCard;
      maskedDefenderCard = ambush.defenderCard;
    } else {
      // 攻击牌: 仅攻击方可见
      maskedAttackCard = isAttacker ? ambush.attackCard : HIDDEN_CARD;

      // 防守牌: 仅防守方可见 (未出牌时为 null)
      if (ambush.defenderCard === null) {
        maskedDefenderCard = null;
      } else {
        maskedDefenderCard = isDefender ? ambush.defenderCard : HIDDEN_CARD;
      }
    }

    return {
      attackerId: ambush.attackerId,
      defenderId: ambush.defenderId,
      attackCard: maskedAttackCard,
      declaration: ambush.declaration,
      defenderCard: maskedDefenderCard,
      resolved: ambush.resolved,
    };
  }

  /**
   * 玩家状态脱敏
   * Owner: 完整手牌数据
   * Opponent: hand 设为 null, 仅暴露 handCount
   */
  private static serializePlayer(player: IPlayerState, isOwner: boolean): IPlayerStateDTO {
    return {
      id: player.id,
      name: player.name,
      hero: player.hero,
      score: player.score,
      hand: isOwner ? [...player.hand] : null,
      handCount: player.hand.length,
      blockadeZone: player.blockadeZone,
      hasUsedUltimate: player.hasUsedUltimate,
      ambushesThisTurn: player.ambushesThisTurn,
    };
  }

  /**
   * 对撞状态脱敏 — 未揭示的牌对对手不可见
   */
  private static serializeCollision(collision: ICollisionState, viewerId: string): ICollisionState {
    const maskedPlayerCards: Record<string, ICard[]> = {};

    for (const [pid, cards] of Object.entries(collision.playerCards)) {
      if (pid === viewerId) {
        maskedPlayerCards[pid] = [...cards];
      } else {
        // 对手暗阵: 只暴露数量, 内容全部为 HIDDEN
        maskedPlayerCards[pid] = cards.map(() => ({ ...HIDDEN_CARD }));
      }
    }

    return {
      ...collision,
      playerCards: maskedPlayerCards,
      revealedCards: collision.revealedCards, // 已揭示的双方可见
    };
  }
}
