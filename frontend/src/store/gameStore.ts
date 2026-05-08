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
  IGameState, IActionCommand, AmbushDeclaration, ICard,
} from '../types/game';
import { GamePhase, HeroType } from '../types/game';

/** 阶段组件接管手牌点击的 handler */
export type HandClickHandler = (card: ICard) => void;
import { GameEngine } from '../core/GameEngine';
import { PhantomStrategy, WeaverStrategy, InquisitorStrategy, SingerStrategy } from '../core/heroes';
import { HostSync, GuestSync, sendPlayerAction } from '../net/sync';

export type NetworkMode = 'LOCAL' | 'HOST' | 'GUEST';

/** 事件 Toast: 简短叙事提示, 仅显示最新一条 */
export interface IEventToast {
  id: number;
  message: string;
  timestamp: number;
}

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
  eventToasts: IEventToast[];
  pushEventToast: (message: string) => void;
  dismissEventToast: (id: number) => void;

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
  declareAmbush: (cardId: string, declaration: AmbushDeclaration | null, discardCardId?: string) => boolean;
  respondAmbush: (choice: 'FOLD' | 'CALL_BLUFF' | 'DEFEND', defenderCardId?: string) => void;
  submitCombo: (cardIds: string[], score: number) => void;
  placeBlockade: (cardId: string) => void;
  discardExcess: (cardIds: string[]) => void;
  useUltimate: () => boolean;
  rollFateDice: () => boolean;
  collisionAction: (action: 'RAISE' | 'FOLD') => void;
  setCollisionOrder: (cardIds: string[]) => void;
  flashSwap: (flashCardId: string, swapCardIds: string[]) => void;
  submitDecreeOptIn: (choice: 'CONTEST' | 'PASS') => void;
  submitDecreeBid: (cardIds: string[]) => boolean;
  confirmSteal: (cardIds: string[]) => boolean;
  darkSacrifice: (handCardId: string, pileCardId: string) => boolean;
  useOracle: (choice: 'peek_hand' | 'peek_deck' | 'peek_market') => { cards: ICard[]; error?: string };

  selectCard: (cardId: string) => void;
  deselectCard: (cardId: string) => void;
  clearSelection: () => void;

  /**
   * 手牌点击转发：阶段组件可注册 handler 接管底部 Hand 的点击。
   * 若为 null，则使用 GameBoard 默认行为（FLASH 换牌）。
   */
  handClickHandler: HandClickHandler | null;
  setHandClickHandler: (h: HandClickHandler | null) => void;

  consumeNextAction: () => IActionCommand | null;
  setAnimating: (v: boolean) => void;

  /** 投降：自动判负 */
  surrender: () => void;
  /** 退出回到主菜单：清空 engine + state */
  quitToMenu: () => void;
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
  handClickHandler: null,
  eventToasts: [],

  pushEventToast: (message: string) => {
    const toast = { id: Date.now() + Math.floor(Math.random() * 1000), message, timestamp: Date.now() };
    set(prev => ({ eventToasts: [...prev.eventToasts.slice(-4), toast] }));
  },
  dismissEventToast: (id: number) => {
    set(prev => ({ eventToasts: prev.eventToasts.filter(t => t.id !== id) }));
  },

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

    // Toast 订阅: 主机/单机/客机都需要 (客机的 LOG_ADDED 通过 onEngineEvent 重发到本地引擎)
    engine.on('LOG_ADDED', (entry: { message: string }) => {
      get().pushEventToast(entry.message);
    });

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

  declareAmbush: (cardId, declaration, discardCardId?) => {
    const { engine, localPlayerId, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('DECLARE_AMBUSH', { cardId, declaration, discardCardId });
      return true;
    }
    if (!engine) return false;
    return engine.declareAmbush(localPlayerId, cardId, declaration, discardCardId);
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

  rollFateDice: () => {
    const { engine, localPlayerId, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('ROLL_FATE_DICE');
      return true;
    }
    if (!engine) return false;
    const strategy = (engine as any).heroStrategies?.get(localPlayerId);
    if (strategy && typeof strategy.rollFateDice === 'function') {
      const card = strategy.rollFateDice(engine);
      return card !== null;
    }
    return false;
  },

  collisionAction: (action) => {
    const { engine, localPlayerId, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('COLLISION_ACTION', { action });
      return;
    }
    engine?.collisionAction(localPlayerId, action);
  },

  setCollisionOrder: (cardIds) => {
    const { engine, localPlayerId, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('SET_COLLISION_ORDER', { cardIds });
      return;
    }
    engine?.setCollisionOrder(localPlayerId, cardIds);
  },

  flashSwap: (flashCardId, swapCardIds) => {
    const { engine, localPlayerId, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('FLASH_SWAP', { flashCardId, swapCardIds });
      return;
    }
    engine?.flashSwap(localPlayerId, flashCardId, swapCardIds);
  },

  submitDecreeOptIn: (choice) => {
    const { engine, localPlayerId, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('DECREE_OPT_IN', { choice });
      return;
    }
    engine?.submitDecreeOptIn(localPlayerId, choice);
  },

  submitDecreeBid: (cardIds) => {
    const { engine, localPlayerId, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('DECREE_BID', { cardIds });
      return true;
    }
    if (!engine) return false;
    return engine.submitDecreeBid(localPlayerId, cardIds);
  },

  confirmSteal: (cardIds) => {
    const { engine, localPlayerId, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('CONFIRM_STEAL', { cardIds });
      return true;
    }
    if (!engine) return false;
    return engine.confirmSteal(localPlayerId, cardIds);
  },

  darkSacrifice: (handCardId, pileCardId) => {
    const { engine, localPlayerId, networkMode } = get();
    if (networkMode === 'GUEST') {
      sendPlayerAction('DARK_SACRIFICE', { handCardId, pileCardId });
      return true;
    }
    if (!engine) return false;
    return engine.darkSacrifice(localPlayerId, handCardId, pileCardId);
  },

  useOracle: (choice) => {
    const { engine, localPlayerId } = get();
    if (!engine) return { cards: [] };
    return engine.useOracle(localPlayerId, choice);
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

  setHandClickHandler: (h) => set({ handClickHandler: h }),

  consumeNextAction: () => {
    const { actionQueue } = get();
    if (actionQueue.length === 0) return null;
    const [next, ...rest] = actionQueue;
    set({ actionQueue: rest, isAnimating: true });
    return next;
  },

  setAnimating: (v) => set({ isAnimating: v }),

  surrender: () => {
    const { engine, localPlayerId } = get();
    if (!engine) return;
    // 投降：让对手以 999 分数过 155 阈值即可
    const oppId = Object.keys(engine.getState().players).find(id => id !== localPlayerId);
    if (!oppId) return;
    engine.mutateState(s => {
      s.players[oppId].score = 999;
      s.phase = GamePhase.GAME_OVER;
    });
    engine.emit('GAME_OVER', { winnerId: oppId, reason: 'SURRENDER' });
  },

  quitToMenu: () => {
    const { engine, hostSync, guestSync } = get();
    try { hostSync?.destroy?.(); } catch { /* noop */ }
    try { guestSync?.destroy?.(); } catch { /* noop */ }
    if (engine) {
      try { engine.removeAllListeners(); } catch { /* noop */ }
    }
    set({
      engine: null, gameState: null, actionQueue: [],
      isAnimating: false, selectedCards: [],
      networkMode: 'LOCAL', hostSync: null, guestSync: null,
      handClickHandler: null, localPlayerId: '',
    });
  },
}));

// 让 GamePhase 仍能从 store 文件导出 (历史兼容)
export { GamePhase };
