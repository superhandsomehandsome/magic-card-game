/**
 * 实时对局同步层
 *
 * 模型: 主机权威 (Host-Authoritative)
 *   - HOST  端运行真正的 GameEngine。所有引擎事件被序列化后通过 socket 广播。
 *   - GUEST 端不运行引擎逻辑，只接收 STATE_SYNC 写入 store。本地 UI 触发的
 *     动作转化为 PLAYER_ACTION 发回 HOST，由 HOST 在自己的引擎上执行。
 *
 * 通信走 socket 的 GAME_ACTION 通道, 服务器只做转发。
 *
 * 信封 kind:
 *   STATE_SYNC      { state }                    HOST → GUEST  完整状态快照
 *   ACTION_ENQUEUE  { action }                   HOST → GUEST  动画指令
 *   ENGINE_EVENT    { event, args }              HOST → GUEST  转发引擎事件
 *   PLAYER_ACTION   { action, payload }          GUEST → HOST  代执行请求
 */
import type { Socket } from 'socket.io-client';
import type { GameEngine } from '../core/GameEngine';
import type { IGameState, IActionCommand, ICard } from '../types/game';
import { GamePhase } from '../types/game';
import { getSocket, emitGameAction } from './socket';

// 占位卡: 客机视角下被遮蔽的卡牌 (与 StateSerializer.HIDDEN_CARD 一致)
function makeHiddenCard(originalId: string): ICard {
  return { id: originalId, rank: -1 as never, baseScore: 0 };
}

// ═══════════════════════════════════════════════════════════
//  协议类型
// ═══════════════════════════════════════════════════════════

export type PlayerActionKind =
  | 'START_GAME'
  | 'ADVANCE_PHASE'
  | 'DRAW_CARDS'
  | 'BUY_MARKET'
  | 'DECLARE_AMBUSH'
  | 'RESOLVE_AMBUSH'
  | 'SUBMIT_COMBO'
  | 'PLACE_BLOCKADE'
  | 'DISCARD_EXCESS'
  | 'USE_ULTIMATE'
  | 'ROLL_FATE_DICE'
  | 'COLLISION_ACTION'
  | 'SET_COLLISION_ORDER'
  | 'FLASH_SWAP'
  | 'DECREE_OPT_IN'
  | 'DECREE_BID'
  | 'CONFIRM_STEAL'
  | 'DARK_SACRIFICE'
  | 'USE_ORACLE'
  | 'COLLISION_PICK_CARDS'
  | 'COLLISION_PLACE_BET'
  | 'COLLISION_REVEAL'
  | 'CLAIM_FREE_MARKET'
  | 'SURRENDER';

interface StateSyncEnv { kind: 'STATE_SYNC'; state: IGameState }
interface ActionEnqueueEnv { kind: 'ACTION_ENQUEUE'; action: IActionCommand }
interface EngineEventEnv { kind: 'ENGINE_EVENT'; event: string; args: unknown[] }
interface PlayerActionEnv {
  kind: 'PLAYER_ACTION';
  action: PlayerActionKind;
  payload: Record<string, unknown>;
}

type SyncEnvelope =
  | StateSyncEnv
  | ActionEnqueueEnv
  | EngineEventEnv
  | PlayerActionEnv;

// ═══════════════════════════════════════════════════════════
//  HOST: 监听引擎 → 广播; 接收对手动作 → 应用
// ═══════════════════════════════════════════════════════════

const HOST_BROADCAST_EVENTS = [
  'STATE_UPDATED',
  'PHASE_CHANGED',
  'TIMER_TICK',
  'TURN_CHANGED',
] as const;

const HOST_RELAY_EVENTS = [
  'HERO_ABILITY_USED',
  'GAME_OVER',
  'AMBUSH_RESOLVED',
  'SCORE_CHANGED',
  'DECK_EMPTY',
  'DECREE_CONTEST_STARTED',
  'DECREE_INTENT_RESOLVED',
  'DECREE_BID_RESOLVED',
  'DECREE_AWARDED',
  'SUPREME_DECREE_APPLIED',
  'LOG_ADDED',
] as const;

export class HostSync {
  private socket: Socket;
  private engineListeners: Array<{ event: string; fn: (...a: unknown[]) => void }> = [];
  private destroyed = false;

  constructor(
    private engine: GameEngine,
    private guestPlayerId: string,
  ) {
    this.socket = getSocket();
    this.bindEngine();
    this.socket.on('GAME_ACTION', this.onSocketAction);
    // Guest 重连后自动推送全量状态恢复
    this.socket.on('OPPONENT_JOINED', this.onOpponentRejoined);
  }

  /** 立刻向对手发送一份当前状态快照 (开局握手用) */
  pushFullState(): void {
    emitGameAction({ kind: 'STATE_SYNC', state: this.snapshotForGuest() });
  }

  /**
   * 在广播之前对客机视角遮蔽: 主机的手牌、未结算的暗扣突袭牌
   * 都替换为 HIDDEN_CARD, 杜绝抓包/控制台读取
   */
  private snapshotForGuest(): IGameState {
    const raw = this.engine.getStateSnapshot() as IGameState;
    // 深拷贝, 然后做差异化覆写
    const masked = JSON.parse(JSON.stringify(raw)) as IGameState;

    // 检测裸露法案：双方明牌；其它情况隐藏对手手牌
    const exposeHands = this.checkExposeHands(masked);
    for (const [pid, player] of Object.entries(masked.players)) {
      if (pid !== this.guestPlayerId && !exposeHands) {
        player.hand = player.hand.map(c => makeHiddenCard(c.id));
      }
    }
    if (masked.ambushState && !masked.ambushState.resolved) {
      const a = masked.ambushState;
      if (a.attackerId !== this.guestPlayerId && a.attackCard) {
        a.attackCard = makeHiddenCard(a.attackCard.id);
      }
      if (a.defenderCard && a.defenderId !== this.guestPlayerId) {
        a.defenderCard = makeHiddenCard(a.defenderCard.id);
      }
    }

    // 法案争夺双盲：抉择期未全部完成 → 隐藏对手 optIn；
    // 暗标期未全部完成 → 隐藏对手 bids 内容
    if (masked.decreeContest) {
      const ctx = masked.decreeContest;
      if (ctx.step === 'OPT_IN') {
        for (const pid of Object.keys(ctx.optIn)) {
          if (pid !== this.guestPlayerId) ctx.optIn[pid] = null;
        }
      }
      if (ctx.step === 'BIDDING') {
        for (const pid of Object.keys(ctx.bids)) {
          if (pid !== this.guestPlayerId && ctx.bids[pid]) {
            // 对手仅显示提交了几张, 内容遮蔽
            const count = (ctx.bids[pid] as string[]).length;
            ctx.bids[pid] = new Array(count).fill('HIDDEN');
            ctx.bidPower[pid] = 0;
            ctx.bidComboType[pid] = null;
          }
        }
      }
    }

    return masked;
  }

  private checkExposeHands(state: IGameState): boolean {
    if (state.supremeDecree) {
      return !!state.supremeDecree.debuff.exposeHands || !!state.supremeDecree.buff.exposeHands;
    }
    for (const p of Object.values(state.players)) {
      for (const d of p.activeDecrees || []) {
        if (d.debuff.exposeHands || d.buff.exposeHands) return true;
      }
    }
    return false;
  }

  private bindEngine(): void {
    const broadcastState = () => {
      if (this.destroyed) return;
      emitGameAction({ kind: 'STATE_SYNC', state: this.snapshotForGuest() });
    };

    HOST_BROADCAST_EVENTS.forEach((ev) => {
      const fn = () => broadcastState();
      this.engine.on(ev, fn);
      this.engineListeners.push({ event: ev, fn });
    });

    HOST_RELAY_EVENTS.forEach((ev) => {
      const fn = (...args: unknown[]) => {
        if (this.destroyed) return;
        emitGameAction({
          kind: 'ENGINE_EVENT',
          event: ev,
          args: this.scrubArgs(args),
        });
        // 这些事件之后状态多半已变, 顺便补一次 STATE_SYNC
        broadcastState();
      };
      this.engine.on(ev, fn);
      this.engineListeners.push({ event: ev, fn });
    });

    const onActionQueued = (action: IActionCommand) => {
      if (this.destroyed) return;
      emitGameAction({ kind: 'ACTION_ENQUEUE', action });
    };
    this.engine.on('ACTION_QUEUED', onActionQueued);
    this.engineListeners.push({ event: 'ACTION_QUEUED', fn: onActionQueued as (...a: unknown[]) => void });
  }

  /** 防止把整个 state 多次塞进事件 args 里, 仅保留基本类型字段 */
  private scrubArgs(args: unknown[]): unknown[] {
    return args.map((a) => {
      if (a === null || a === undefined) return a;
      if (typeof a !== 'object') return a;
      const obj = a as Record<string, unknown>;
      if ('matchId' in obj && 'players' in obj) return null; // 这是完整 state, 别重复发
      return obj;
    });
  }

  private onSocketAction = (msg: unknown) => {
    const env = msg as SyncEnvelope | undefined;
    if (!env || env.kind !== 'PLAYER_ACTION') return;
    const playerId = this.guestPlayerId;
    const p = env.payload || {};

    try {
      switch (env.action) {
        case 'START_GAME':
          // HOST 已自行 startGame, 不响应
          break;
        case 'ADVANCE_PHASE':
          if (this.engine.getState().currentTurnPlayerId === playerId) {
            this.engine.nextPhase();
          }
          break;
        case 'DRAW_CARDS':
          this.engine.drawPhaseCards(playerId);
          break;
        case 'BUY_MARKET':
          this.engine.buyMarketCard(
            playerId,
            String(p.marketCardId),
            (p.paymentCardIds as string[]) || [],
          );
          break;
        case 'DECLARE_AMBUSH':
          this.engine.declareAmbush(
            playerId,
            String(p.cardId),
            (p.declaration as never) ?? null,
            p.discardCardId ? String(p.discardCardId) : undefined,
          );
          break;
        case 'RESOLVE_AMBUSH':
          this.engine.resolveAmbushDefend(
            playerId,
            p.choice as 'FOLD' | 'CALL_BLUFF' | 'DEFEND',
            p.defenderCardId as string | undefined,
          );
          break;
        case 'SUBMIT_COMBO':
          this.engine.submitComboScore(
            playerId,
            (p.cardIds as string[]) || [],
            Number(p.score) || 0,
          );
          break;
        case 'PLACE_BLOCKADE':
          this.engine.placeBlockade(playerId, String(p.cardId));
          break;
        case 'DISCARD_EXCESS':
          this.engine.discardExcess(playerId, (p.cardIds as string[]) || []);
          break;
        case 'USE_ULTIMATE':
          this.engine.useUltimate(playerId);
          break;
        case 'COLLISION_ACTION':
          this.engine.collisionAction(playerId, p.action as 'RAISE' | 'FOLD');
          break;
        case 'SET_COLLISION_ORDER':
          this.engine.setCollisionOrder(playerId, (p.cardIds as string[]) || []);
          break;
        case 'FLASH_SWAP':
          this.engine.flashSwap(
            playerId,
            p.flashCardId as string,
            (p.swapCardIds as string[]) || [],
          );
          break;
        case 'DECREE_OPT_IN':
          this.engine.submitDecreeOptIn(
            playerId,
            p.choice as 'CONTEST' | 'PASS',
          );
          break;
        case 'DECREE_BID':
          this.engine.submitDecreeBid(
            playerId,
            (p.cardIds as string[]) || [],
          );
          break;
        case 'CONFIRM_STEAL':
          this.engine.confirmSteal(
            playerId,
            (p.cardIds as string[]) || [],
          );
          break;
        case 'COLLISION_PICK_CARDS':
          this.engine.collisionPickCards(playerId, (p.cardIds as string[]) || []);
          break;
        case 'COLLISION_PLACE_BET':
          this.engine.collisionPlaceBet(playerId, Number(p.amount) || 0);
          break;
        case 'COLLISION_REVEAL':
          this.engine.collisionReveal(playerId);
          break;
        case 'CLAIM_FREE_MARKET':
          this.engine.claimFreeMarketCard(playerId, p.cardId as string | undefined);
          break;
        case 'DARK_SACRIFICE':
          this.engine.darkSacrifice(playerId, String(p.handCardId), String(p.pileCardId));
          break;
        case 'USE_ORACLE':
          this.engine.useOracle(playerId, p.choice as 'peek_hand' | 'peek_deck' | 'peek_market');
          break;
        case 'ROLL_FATE_DICE': {
          const strategy = (this.engine as any).heroStrategies?.get(playerId);
          if (strategy && typeof strategy.rollFateDice === 'function') {
            strategy.rollFateDice(this.engine);
          }
          break;
        }
        case 'SURRENDER': {
          const oppId = Object.keys(this.engine.getState().players).find(id => id !== playerId);
          if (oppId) {
            this.engine.mutateState(s => {
              s.players[oppId].score = 999;
              s.phase = GamePhase.GAME_OVER;
            });
            this.engine.emit('GAME_OVER', { winnerId: oppId, reason: 'SURRENDER' });
          }
          break;
        }
      }
    } catch (e) {
      console.error('[HostSync] failed to apply guest action', env, e);
    }
  };

  private onOpponentRejoined = () => {
    if (this.destroyed) return;
    console.log('[HostSync] opponent rejoined, pushing full state');
    this.pushFullState();
  };

  destroy(): void {
    this.destroyed = true;
    this.engineListeners.forEach(({ event, fn }) => this.engine.off(event, fn));
    this.engineListeners = [];
    this.socket.off('GAME_ACTION', this.onSocketAction);
    this.socket.off('OPPONENT_JOINED', this.onOpponentRejoined);
  }
}

// ═══════════════════════════════════════════════════════════
//  GUEST: 接收主机消息 → 写入 store; 转发本地动作
// ═══════════════════════════════════════════════════════════

export interface GuestSyncHandlers {
  onStateSync(state: IGameState): void;
  onActionEnqueue(action: IActionCommand): void;
  onEngineEvent(event: string, args: unknown[]): void;
}

export class GuestSync {
  private socket: Socket;

  constructor(private handlers: GuestSyncHandlers) {
    this.socket = getSocket();
    this.socket.on('GAME_ACTION', this.onSocketMessage);
  }

  private onSocketMessage = (msg: unknown) => {
    const env = msg as SyncEnvelope | undefined;
    if (!env || !env.kind) return;
    switch (env.kind) {
      case 'STATE_SYNC':
        this.handlers.onStateSync(env.state);
        break;
      case 'ACTION_ENQUEUE':
        this.handlers.onActionEnqueue(env.action);
        break;
      case 'ENGINE_EVENT':
        this.handlers.onEngineEvent(env.event, env.args);
        break;
      // PLAYER_ACTION 是发给主机的, 客户端忽略
      default:
        break;
    }
  };

  destroy(): void {
    this.socket.off('GAME_ACTION', this.onSocketMessage);
  }
}

/** 客机发送一个待主机执行的动作 */
export function sendPlayerAction(
  action: PlayerActionKind,
  payload: Record<string, unknown> = {},
): void {
  emitGameAction({ kind: 'PLAYER_ACTION', action, payload });
}
