/**
 * Roguelike Store — 管理 run 进度、地图导航、奖励选择
 */
import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { IRoguelikeRun, RunPhase, IEnemyPreset, IRandomEvent } from '../types/roguelike';
import { ROGUELIKE_CONSTANTS } from '../types/roguelike';
import type { ICard } from '../types/game';
import { HeroType, CardRank } from '../types/game';
import { generateAllMaps, findNode, getReachableNodeIds } from '../core/roguelike/mapGenerator';
import { getEnemyForFloorAndNode } from '../core/roguelike/enemyPresets';
import { pickEvent } from '../core/roguelike/events';
import { createDeck, shuffleDeck } from '../utils/deck';

function buildStartingDeck(): ICard[] {
  const fullDeck = shuffleDeck(createDeck());
  return fullDeck.slice(0, ROGUELIKE_CONSTANTS.STARTING_DECK_SIZE);
}

function generateRewardCards(seed: number): ICard[] {
  const pool = shuffleDeck(createDeck());
  const goodCards = pool.filter(c =>
    c.rank === CardRank.A || c.rank === CardRank.B || c.rank === CardRank.C || c.rank === CardRank.FLASH
  );
  const picks: ICard[] = [];
  const source = goodCards.length >= 3 ? goodCards : pool;
  for (let i = 0; i < 3 && i < source.length; i++) {
    picks.push({ ...source[(seed + i * 7) % source.length], id: uuid() });
  }
  return picks;
}

interface RoguelikeStore {
  run: IRoguelikeRun | null;
  /** 开始新的 roguelike run */
  startRun: (hero: HeroType) => void;
  /** 选择地图节点 */
  selectNode: (nodeId: string) => void;
  /** 战斗结束回调 (从 GameBoard 调用) */
  onBattleEnd: (won: boolean, scoreDiff: number) => void;
  /** 选择奖励牌 */
  pickRewardCard: (cardId: string) => void;
  /** 跳过奖励 */
  skipReward: () => void;
  /** 事件选择 */
  resolveEvent: (choiceIndex: number) => void;
  /** 休息站：回复 HP */
  restHeal: () => void;
  /** 商店：购买卡牌 */
  shopBuyCard: (card: ICard) => void;
  /** 商店：移除卡牌 */
  shopRemoveCard: (cardId: string) => void;
  /** 完成当前节点，回到地图 */
  returnToMap: () => void;
  /** 退出 run */
  abandonRun: () => void;
  /** 获取可到达的节点 */
  getReachableNodes: () => string[];
  /** 商店可购买的牌 */
  shopCards: ICard[];
  refreshShop: () => void;
}

export const useRoguelikeStore = create<RoguelikeStore>((set, get) => ({
  run: null,
  shopCards: [],

  startRun: (hero: HeroType) => {
    const seed = Date.now();
    const maps = generateAllMaps(seed);
    const run: IRoguelikeRun = {
      seed,
      heroType: hero,
      currentFloor: 0,
      currentNodeId: null,
      maps,
      deck: buildStartingDeck(),
      gold: ROGUELIKE_CONSTANTS.STARTING_GOLD,
      hp: ROGUELIKE_CONSTANTS.STARTING_HP,
      maxHp: ROGUELIKE_CONSTANTS.STARTING_HP,
      activeDecrees: [],
      phase: 'MAP',
      rewardCards: null,
      currentEvent: null,
      battlesWon: 0,
      currentEnemy: null,
    };
    set({ run });
  },

  selectNode: (nodeId: string) => {
    const { run } = get();
    if (!run) return;

    const reachable = getReachableNodeIds(run.maps, run.currentNodeId, run.currentFloor);
    if (!reachable.includes(nodeId)) return;

    const node = findNode(run.maps, nodeId);
    if (!node || node.completed) return;

    const updatedRun = { ...run, currentNodeId: nodeId };

    switch (node.type) {
      case 'BATTLE':
      case 'ELITE':
      case 'BOSS': {
        const enemy = getEnemyForFloorAndNode(
          run.currentFloor,
          node.type,
          run.seed + nodeId.charCodeAt(0),
        );
        set({ run: { ...updatedRun, phase: 'BATTLE', currentEnemy: enemy } });
        break;
      }
      case 'SHOP':
        get().refreshShop();
        set({ run: { ...updatedRun, phase: 'SHOP' } });
        break;
      case 'EVENT': {
        const event = pickEvent(run.seed + nodeId.charCodeAt(0) + run.battlesWon);
        set({ run: { ...updatedRun, phase: 'EVENT', currentEvent: event } });
        break;
      }
      case 'REST':
        set({ run: { ...updatedRun, phase: 'REST' } });
        break;
    }
  },

  onBattleEnd: (won: boolean, scoreDiff: number) => {
    const { run } = get();
    if (!run) return;

    if (!won) {
      const hpLoss = Math.ceil(Math.abs(scoreDiff) * ROGUELIKE_CONSTANTS.DEFEAT_HP_LOSS_PER_POINT);
      const newHp = Math.max(0, run.hp - hpLoss);
      if (newHp <= 0) {
        set({ run: { ...run, hp: 0, phase: 'DEFEAT', currentEnemy: null } });
      } else {
        // Lost the battle but survived — mark node and return to map
        markCurrentNodeCompleted(run);
        set({ run: { ...run, hp: newHp, phase: 'MAP', currentEnemy: null } });
      }
      return;
    }

    const heal = Math.ceil(scoreDiff * ROGUELIKE_CONSTANTS.VICTORY_HEAL_RATIO);
    const newHp = Math.min(run.maxHp, run.hp + heal);
    const goldReward = run.currentEnemy?.goldReward ?? 20;
    const rewardCards = generateRewardCards(run.seed + run.battlesWon);

    markCurrentNodeCompleted(run);

    set({
      run: {
        ...run,
        hp: newHp,
        gold: run.gold + goldReward,
        battlesWon: run.battlesWon + 1,
        phase: 'REWARD',
        rewardCards,
        currentEnemy: null,
      },
    });
  },

  pickRewardCard: (cardId: string) => {
    const { run } = get();
    if (!run || !run.rewardCards) return;
    const card = run.rewardCards.find(c => c.id === cardId);
    if (!card) return;

    const isBoss = run.currentNodeId
      ? findNode(run.maps, run.currentNodeId)?.type === 'BOSS'
      : false;

    let nextFloor = run.currentFloor;
    let nextNodeId = run.currentNodeId;
    let nextPhase: RunPhase = 'MAP';

    if (isBoss) {
      if (run.currentFloor >= ROGUELIKE_CONSTANTS.TOTAL_FLOORS - 1) {
        nextPhase = 'VICTORY';
      } else {
        nextFloor = run.currentFloor + 1;
        nextNodeId = null;
      }
    }

    set({
      run: {
        ...run,
        deck: [...run.deck, card],
        rewardCards: null,
        phase: nextPhase,
        currentFloor: nextFloor,
        currentNodeId: nextNodeId,
      },
    });
  },

  skipReward: () => {
    const { run } = get();
    if (!run) return;

    const isBoss = run.currentNodeId
      ? findNode(run.maps, run.currentNodeId)?.type === 'BOSS'
      : false;

    let nextFloor = run.currentFloor;
    let nextNodeId = run.currentNodeId;
    let nextPhase: RunPhase = 'MAP';

    if (isBoss) {
      if (run.currentFloor >= ROGUELIKE_CONSTANTS.TOTAL_FLOORS - 1) {
        nextPhase = 'VICTORY';
      } else {
        nextFloor = run.currentFloor + 1;
        nextNodeId = null;
      }
    }

    set({
      run: {
        ...run,
        rewardCards: null,
        phase: nextPhase,
        currentFloor: nextFloor,
        currentNodeId: nextNodeId,
      },
    });
  },

  resolveEvent: (choiceIndex: number) => {
    const { run } = get();
    if (!run || !run.currentEvent) return;

    const choice = run.currentEvent.choices[choiceIndex];
    if (!choice) return;

    const updated = { ...run, currentEvent: null };

    switch (choice.effect.type) {
      case 'GAIN_GOLD':
        updated.gold += choice.effect.amount;
        break;
      case 'LOSE_GOLD':
        updated.gold = Math.max(0, updated.gold - choice.effect.amount);
        break;
      case 'GAIN_HP':
        updated.hp = Math.min(updated.maxHp, updated.hp + choice.effect.amount);
        break;
      case 'LOSE_HP':
        // Also give the gold reward from abandoned_shrine / blood_pact
        updated.hp = Math.max(1, updated.hp - choice.effect.amount);
        if (choice.label.includes('金币')) {
          const goldMatch = choice.label.match(/\+(\d+)\s*金币/);
          if (goldMatch) updated.gold += parseInt(goldMatch[1], 10);
        }
        break;
      case 'GAIN_CARD':
        updated.deck = [...updated.deck, choice.effect.card];
        break;
      case 'REMOVE_CARD':
        // Will be handled via separate UI — for now just proceed
        break;
      case 'NOTHING':
        break;
    }

    markCurrentNodeCompleted(run);
    set({ run: { ...updated, phase: 'MAP' } });
  },

  restHeal: () => {
    const { run } = get();
    if (!run) return;
    markCurrentNodeCompleted(run);
    set({
      run: {
        ...run,
        hp: Math.min(run.maxHp, run.hp + ROGUELIKE_CONSTANTS.REST_HEAL),
        phase: 'MAP',
      },
    });
  },

  shopBuyCard: (card: ICard) => {
    const { run, shopCards } = get();
    if (!run) return;
    const cost = card.baseScore * 5;
    if (run.gold < cost) return;

    set({
      run: {
        ...run,
        deck: [...run.deck, { ...card, id: uuid() }],
        gold: run.gold - cost,
      },
      shopCards: shopCards.filter(c => c.id !== card.id),
    });
  },

  shopRemoveCard: (cardId: string) => {
    const { run } = get();
    if (!run) return;
    if (run.gold < ROGUELIKE_CONSTANTS.SHOP_REMOVE_COST) return;
    if (run.deck.length <= 5) return;

    set({
      run: {
        ...run,
        deck: run.deck.filter(c => c.id !== cardId),
        gold: run.gold - ROGUELIKE_CONSTANTS.SHOP_REMOVE_COST,
      },
    });
  },

  returnToMap: () => {
    const { run } = get();
    if (!run) return;
    markCurrentNodeCompleted(run);
    set({ run: { ...run, phase: 'MAP' } });
  },

  abandonRun: () => {
    set({ run: null, shopCards: [] });
  },

  getReachableNodes: () => {
    const { run } = get();
    if (!run) return [];
    return getReachableNodeIds(run.maps, run.currentNodeId, run.currentFloor);
  },

  refreshShop: () => {
    const pool = shuffleDeck(createDeck()).slice(0, 5);
    set({ shopCards: pool });
  },
}));

function markCurrentNodeCompleted(run: IRoguelikeRun) {
  if (!run.currentNodeId) return;
  const node = findNode(run.maps, run.currentNodeId);
  if (node) node.completed = true;
}
