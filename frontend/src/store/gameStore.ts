/**
 * Zustand Store — 桥接 GameEngine 与 React UI
 * 表现层通过 Store 读取状态，通过 Store 方法触发引擎 API
 */
import { create } from 'zustand';
import type {
  IGameState, IActionCommand, AmbushDeclaration, IComboResult,
} from '../types/game';
import { GamePhase, HeroType } from '../types/game';
import { GameEngine } from '../core/GameEngine';
import { PhantomStrategy, WeaverStrategy, InquisitorStrategy, SingerStrategy } from '../core/heroes';

interface GameStore {
  // 状态
  engine: GameEngine | null;
  gameState: IGameState | null;
  actionQueue: IActionCommand[];
  isAnimating: boolean;
  selectedCards: string[];
  localPlayerId: string;

  // 初始化
  initGame: (player1Id: string, player2Id: string, hero1: HeroType, hero2: HeroType) => void;
  setLocalPlayer: (id: string) => void;

  // 阶段控制
  advancePhase: () => void;
  startGame: () => void;

  // 阶段1：黑市
  drawCards: () => void;
  buyMarketCard: (marketCardId: string, paymentCardIds: string[]) => boolean;

  // 阶段2：突袭
  declareAmbush: (cardId: string, declaration: AmbushDeclaration | null) => boolean;
  respondAmbush: (choice: 'FOLD' | 'CALL_BLUFF' | 'DEFEND', defenderCardId?: string) => void;

  // 阶段3：咏唱
  submitCombo: (cardIds: string[], score: number) => void;

  // 阶段4：封锁
  placeBlockade: (cardId: string) => void;
  discardExcess: (cardIds: string[]) => void;

  // 英雄大招
  useUltimate: () => boolean;

  // 终局对撞
  collisionAction: (action: 'RAISE' | 'FOLD') => void;

  // UI 交互
  selectCard: (cardId: string) => void;
  deselectCard: (cardId: string) => void;
  clearSelection: () => void;

  // 动画队列消费
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

  setLocalPlayer: (id: string) => set({ localPlayerId: id }),

  initGame: (player1Id, player2Id, hero1, hero2) => {
    const engine = new GameEngine(player1Id, player2Id, hero1, hero2);

    // 注册英雄策略
    const strategyMap = {
      [HeroType.PHANTOM]: (id: string) => new PhantomStrategy(id),
      [HeroType.WEAVER]: (id: string) => new WeaverStrategy(id),
      [HeroType.INQUISITOR]: (id: string) => new InquisitorStrategy(id),
      [HeroType.SINGER]: (id: string) => new SingerStrategy(id),
    };

    engine.registerHeroStrategy(player1Id, strategyMap[hero1](player1Id));
    engine.registerHeroStrategy(player2Id, strategyMap[hero2](player2Id));

    // 订阅引擎事件 → 同步到 Zustand
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

    set({
      engine,
      gameState: engine.getStateSnapshot(),
      actionQueue: [],
    });
  },

  startGame: () => {
    const { engine } = get();
    engine?.startGame();
  },

  advancePhase: () => {
    const { engine } = get();
    engine?.nextPhase();
  },

  drawCards: () => {
    const { engine, localPlayerId } = get();
    engine?.drawPhaseCards(localPlayerId);
  },

  buyMarketCard: (marketCardId, paymentCardIds) => {
    const { engine, localPlayerId } = get();
    if (!engine) return false;
    return engine.buyMarketCard(localPlayerId, marketCardId, paymentCardIds);
  },

  declareAmbush: (cardId, declaration) => {
    const { engine, localPlayerId } = get();
    if (!engine) return false;
    return engine.declareAmbush(localPlayerId, cardId, declaration);
  },

  respondAmbush: (choice, defenderCardId) => {
    const { engine, localPlayerId } = get();
    engine?.resolveAmbushDefend(localPlayerId, choice, defenderCardId);
  },

  submitCombo: (cardIds, score) => {
    const { engine, localPlayerId } = get();
    engine?.submitComboScore(localPlayerId, cardIds, score);
  },

  placeBlockade: (cardId) => {
    const { engine, localPlayerId } = get();
    engine?.placeBlockade(localPlayerId, cardId);
  },

  discardExcess: (cardIds) => {
    const { engine, localPlayerId } = get();
    engine?.discardExcess(localPlayerId, cardIds);
  },

  useUltimate: () => {
    const { engine, localPlayerId } = get();
    if (!engine) return false;
    return engine.useUltimate(localPlayerId);
  },

  collisionAction: (action) => {
    const { engine, localPlayerId } = get();
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
