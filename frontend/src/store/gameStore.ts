/**
 * Zustand Store — 桥接 GameEngine 与 React UI
 * 表现层通过 Store 读取状态, 通过 Store 方法触发引擎 API
 *
 * networkMode:
 *   LOCAL — 单机或 AI 对战, 引擎本地运行
 *   HOST  — 多人主机, 引擎本地运行 + HostSync 广播
 *   GUEST — 多人客机, 不运行引擎逻辑, 状态由 STATE_SYNC 写入,
 *           本地动作转发给主机执行
 */
import { create } from 'zustand';
import type {
  IGameState, IActionCommand, AmbushDeclaration,
} from '../types/game';
import { GamePhase, HeroType } from '../types/game';
import { GameEngine } from '../core/GameEngine';
import { PhantomStrategy, WeaverStrategy, InquisitorStrategy, SingerStrategy } from '../core/heroes';
import { HostSync, GuestSync, sendPlayerAction } from '../net/sync';

export type NetworkMode = 'LOCAL' | 'HOST' | 'GUEST';

interface GameStore {
  engine: GameEngine | null;
  gameState: IGameState | null;
  actionQueue: IActionCommand[];
  isAnimating: boolean;
  selectedCards: string[];
  localPlayerId: string;
  networkMode: NetworkMode;
  hostSync: HostSync | null;
  guestSync: GuestSync | null;

  initGame: (player1Id: string, player2Id: string, hero1: HeroType, hero2: HeroType) => void;
  setLocalPlayer: (id: string) => void;
  setNetworkMode: (mode: NetworkMode) => void;
  enableHostSync: (guestPlayerId: string) => void;
  enableGuestSync: () => void;
  teardownSync: () => void;

  advancePhase: () => void;
  startGame: () => void;
  drawCards: () => void;
  buyMarketCard: (marketCardId: string, paymentCardIds: string[]) => boolean;
  declareAmbush: (cardId: string, declaration: AmbushDeclaration | null) => boolean;
  respondAmbush: (choice: 'FOLD' | 'CALL_BLUFF' | 'DEFEND', defenderCardId?: string) => void;
  submitCombo: (cardIds: string[], score: number) => void;
  placeBlockade: (cardId: string) => void;
  discardExcess: (cardIds: string[]) => void;
  useUltimate: () => boolean;
  collisionAction: (action: 'RAISE' | 'FOLD') => void;

  selectCard: (cardId: string) => void;
  deselectCard: (cardId: string) => void;
  clearSelection: () => void;

  consumeNextAction: () => IActionCommand | null;
  setAnimating: (v: boolean) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  engine: null,
  gameState: null,
  actionQueue: [],
  isAnimating: false,
  selectedCards: [],
  localPlayerId: '',
  networkMode: 'LOCAL',
  hostSync: null,
  guestSync: null,

  setLocalPlayer: (id: string) => set({ localPlayerId: id }),
  setNetworkMode: (mode: NetworkMode) => set({ networkMode: mode }),

  initGame: (player1Id, player2Id, hero1, hero2) => {
    const engine = new GameEngine(player1Id, player2Id, hero1, hero2);

    const strategyMap = {
      [HeroType.PHANTOM]: (id: string) => new PhantomStrategy(id),
      [HeroType.WEAVER]: (id: string) => new WeaverStrategy(id),
      [HeroType.INQUISITOR]: (id: string) => new InquisitorStrategy(id),
      [HeroType.SINGER]: (id: string) => new SingerStrategy(id),
    };

    engine.registerHeroStrategy(player1Id, strategyMap[hero1](player1Id));
    engine.registerHeroStrategy(player2Id, strategyMap[hero2](player2Id));

    const { networkMode } = get();

    // GUEST 不本地运行引擎逻辑, 不订阅引擎事件,
    // 状态由 STATE_SYNC 直接写入 store
    if (networkMode !== 'GUEST') {
      engine.on('STATE_UPDATED', (state: IGameState) => {
        set({ gameState: state });
      });

      engine.on('ACTION_QUEUED', (action: IActionCommand) => {
        set(prev => ({ actionQueue: [...prev.actionQueue, action] }));
      });

      engine.on('PHASE_CHANGED', () => {
        set({ gameState: engine.getStateSnapshot() });
      });

      engine.on('TIMER_TICK', () => {
        set({ gameState: engine.getStateSnapshot() });
      });
    }

    set({
      engine,
      gameState: engine.getStateSnapshot(),
      actionQueue: [],
    });
  },

  enableHostSync: (guestPlayerId: string) => {
    const { engine, hostSync } = get();
    if (!engine || hostSync) return;
    const sync = new HostSync(engine, guestPlayerId);
    set({ hostSync: sync, networkMode: 'HOST' });
  },

  enableGuestSync: () => {
    const { guestSync } = get();
    if (guestSync) return;
    const sync = new GuestSync({
      onStateSync: (state) => {
        set({ gameState: state });
        // 让本地引擎也同步一下 (供 VoiceLine 等读取 hero 等不可变信息时使用)
        const eng = get().engine;
        if (eng) {
          eng.mutateState(prev => {
            Object.assign(prev, state);
          });
        }
      },
      onActionEnqueue: (action) => {
        set(prev => ({ actionQueue: [...prev.actionQueue, action] }));
      },
      onEngineEvent: (event, args) => {
        // 在客机的引擎实例上重发同名事件, 让 VoiceLine 等订阅者依然工作
        const eng = get().engine;
        if (eng) {
          (eng as unknown as { emit: (e: string, ...a: unknown[]) => void })
            .emit(event, ...args);
        }
      },
    });
    set({ guestSync: sync, networkMode: 'GUEST' });
  },

  teardownSync: () => {
    const { hostSync, guestSync } = get();
    hostSync?.destroy();
    guestSync?.destroy();
    set({ hostSync: null, guestSync: null });
  },

  startGame: () => {
    const { engine, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('START_GAME');
      return;
    }
    engine?.startGame();
  },

  advancePhase: () => {
    const { engine, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('ADVANCE_PHASE');
      return;
    }
    engine?.nextPhase();
  },

  drawCards: () => {
    const { engine, localPlayerId, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('DRAW_CARDS');
      return;
    }
    engine?.drawPhaseCards(localPlayerId);
  },

  buyMarketCard: (marketCardId, paymentCardIds) => {
    const { engine, localPlayerId, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('BUY_MARKET', { marketCardId, paymentCardIds });
      return true;
    }
    if (!engine) return false;
    return engine.buyMarketCard(localPlayerId, marketCardId, paymentCardIds);
  },

  declareAmbush: (cardId, declaration) => {
    const { engine, localPlayerId, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('DECLARE_AMBUSH', { cardId, declaration });
      return true;
    }
    if (!engine) return false;
    return engine.declareAmbush(localPlayerId, cardId, declaration);
  },

  respondAmbush: (choice, defenderCardId) => {
    const { engine, localPlayerId, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('RESOLVE_AMBUSH', { choice, defenderCardId });
      return;
    }
    engine?.resolveAmbushDefend(localPlayerId, choice, defenderCardId);
  },

  submitCombo: (cardIds, score) => {
    const { engine, localPlayerId, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('SUBMIT_COMBO', { cardIds, score });
      return;
    }
    engine?.submitComboScore(localPlayerId, cardIds, score);
  },

  placeBlockade: (cardId) => {
    const { engine, localPlayerId, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('PLACE_BLOCKADE', { cardId });
      return;
    }
    engine?.placeBlockade(localPlayerId, cardId);
  },

  discardExcess: (cardIds) => {
    const { engine, localPlayerId, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('DISCARD_EXCESS', { cardIds });
      return;
    }
    engine?.discardExcess(localPlayerId, cardIds);
  },

  useUltimate: () => {
    const { engine, localPlayerId, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('USE_ULTIMATE');
      return true;
    }
    if (!engine) return false;
    return engine.useUltimate(localPlayerId);
  },

  collisionAction: (action) => {
    const { engine, localPlayerId, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('COLLISION_ACTION', { action });
      return;
    }
    engine?.collisionAction(localPlayerId, action);
  },

  selectCard: (cardId) => {
    set(prev => ({
      selectedCards: prev.selectedCards.includes(cardId)
        ? prev.selectedCards
        : [...prev.selectedCards, cardId],
    }));
  },

  deselectCard: (cardId) => {
    set(prev => ({
      selectedCards: prev.selectedCards.filter(id => id !== cardId),
    }));
  },

  clearSelection: () => set({ selectedCards: [] }),

  consumeNextAction: () => {
    const { actionQueue } = get();
    if (actionQueue.length === 0) return null;
    const [next, ...rest] = actionQueue;
    set({ actionQueue: rest, isAnimating: true });
    return next;
  },

  setAnimating: (v) => set({ isAnimating: v }),
}));

// 让 GamePhase 仍能从 store 文件导出 (历史兼容)
export { GamePhase };
