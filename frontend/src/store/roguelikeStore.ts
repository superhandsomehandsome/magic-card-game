/**
 * 《坠典》Roguelike Store — 故事模式：固定地图导航、残页收集、契约抉择、三结局
 * 使用 zustand persist 中间件自动存档到 localStorage
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuid } from 'uuid';
import type { IRoguelikeRun, RunPhase, PactChoice, EndingId } from '../types/roguelike';
import { ROGUELIKE_CONSTANTS } from '../types/roguelike';
import type { ICard } from '../types/game';
import { HeroType, CardRank } from '../types/game';
import { createStoryNodes, findStoryNode, getReachableStoryNodes } from '../core/roguelike/storyMap';
import { getEnemyById } from '../core/roguelike/enemyPresets';
import { getEventById } from '../core/roguelike/events';
import {
  getPrologue, getChapterIntro, getBossPreDialogue, getBossPostDialogue, getEnding,
} from '../core/roguelike/story';
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

/** 章节引言 key：进入某章第一个节点时触发 */
function chapterIntroKey(node: { chapter: number; route?: 'A' | 'B' }): 'c1' | 'c2a' | 'c2b' | 'c3' {
  if (node.chapter === 1) return 'c1';
  if (node.chapter === 2) return node.route === 'B' ? 'c2b' : 'c2a';
  return 'c3';
}

interface RoguelikeStore {
  run: IRoguelikeRun | null;
  /** 开始新的故事 run */
  startRun: (hero: HeroType) => void;
  /** 选择地图节点 */
  selectNode: (nodeId: string) => void;
  /** 叙事对话播放完毕 */
  completeStory: () => void;
  /** 契约之门抉择 */
  choosePact: (choice: PactChoice) => void;
  /** 战斗结束回调 (从 RoguelikeScreen 调用) */
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

function markNodeCompleted(run: IRoguelikeRun, nodeId: string | null): IRoguelikeRun['nodes'] {
  if (!nodeId) return run.nodes;
  return run.nodes.map(n => n.id === nodeId ? { ...n, completed: true } : n);
}

export const useRoguelikeStore = create<RoguelikeStore>()(
  persist(
    (set, get) => ({
      run: null,
      shopCards: [],

      startRun: (hero: HeroType) => {
        const run: IRoguelikeRun = {
          seed: Date.now(),
          heroType: hero,
          nodes: createStoryNodes(),
          currentNodeId: 'start',
          prevNodeId: null,
          // 从 0 开始：进入第一章首个节点时触发章节引言
          chapter: 0,
          routeChosen: null,
          pactChoice: null,
          decreePages: 0,
          endingId: null,
          pendingStory: getPrologue(hero),
          deck: buildStartingDeck(),
          gold: ROGUELIKE_CONSTANTS.STARTING_GOLD,
          hp: ROGUELIKE_CONSTANTS.STARTING_HP,
          maxHp: ROGUELIKE_CONSTANTS.STARTING_HP,
          activeDecrees: [],
          phase: 'STORY',
          rewardCards: null,
          currentEvent: null,
          battlesWon: 0,
          currentEnemy: null,
        };
        set({ run });
      },

      selectNode: (nodeId: string) => {
        const { run } = get();
        if (!run || run.phase !== 'MAP') return;

        const reachable = getReachableStoryNodes(run.nodes, run.currentNodeId, run.routeChosen);
        if (!reachable.includes(nodeId)) return;

        const node = findStoryNode(run.nodes, nodeId);
        if (!node || node.completed) return;

        const prevNodeId = run.currentNodeId;
        let updated: IRoguelikeRun = { ...run, currentNodeId: nodeId, prevNodeId };

        // 第二章路线锁定
        if (node.route && !run.routeChosen) {
          updated = { ...updated, routeChosen: node.route };
        }

        // 章节引言（进入新章节的第一个节点时播放）
        const enteringNewChapter = node.chapter > run.chapter;
        if (enteringNewChapter) {
          updated = { ...updated, chapter: node.chapter };
        }

        switch (node.type) {
          case 'BATTLE':
          case 'ELITE': {
            const enemy = node.enemyPresetId ? getEnemyById(node.enemyPresetId) : null;
            if (!enemy) return;
            if (enteringNewChapter) {
              updated = {
                ...updated,
                currentEnemy: enemy,
                pendingStory: getChapterIntro(chapterIntroKey(node), run.heroType, 'BATTLE'),
                phase: 'STORY',
              };
            } else {
              updated = { ...updated, currentEnemy: enemy, phase: 'BATTLE' };
            }
            break;
          }
          case 'BOSS':
          case 'FINAL_BOSS': {
            const enemy = node.enemyPresetId ? getEnemyById(node.enemyPresetId) : null;
            if (!enemy) return;
            const pre = getBossPreDialogue(node.enemyPresetId!, run.heroType);
            updated = {
              ...updated,
              currentEnemy: enemy,
              pendingStory: pre,
              phase: pre ? 'STORY' : 'BATTLE',
            };
            break;
          }
          case 'SHOP':
            get().refreshShop();
            updated = { ...updated, phase: 'SHOP' };
            break;
          case 'EVENT': {
            const event = node.eventId ? getEventById(node.eventId) : null;
            if (!event) return;
            updated = { ...updated, currentEvent: event, phase: 'EVENT' };
            break;
          }
          case 'REST':
            updated = { ...updated, phase: 'REST' };
            break;
          case 'PACT':
            updated = { ...updated, phase: 'PACT' };
            break;
          default:
            return;
        }

        set({ run: updated });
      },

      completeStory: () => {
        const { run } = get();
        if (!run || !run.pendingStory) return;
        const next: RunPhase = run.pendingStory.next;
        set({ run: { ...run, pendingStory: null, phase: next } });
      },

      choosePact: (choice: PactChoice) => {
        const { run } = get();
        if (!run || run.phase !== 'PACT') return;
        // 隐藏结局需要集齐残页
        if (choice === 'REWRITE' && run.decreePages < ROGUELIKE_CONSTANTS.PAGES_REQUIRED) return;
        set({
          run: {
            ...run,
            pactChoice: choice,
            nodes: markNodeCompleted(run, run.currentNodeId),
            phase: 'MAP',
          },
        });
      },

      onBattleEnd: (won: boolean, scoreDiff: number) => {
        const { run } = get();
        if (!run) return;

        const node = findStoryNode(run.nodes, run.currentNodeId);

        if (!won) {
          const hpLoss = Math.ceil(Math.abs(scoreDiff) * ROGUELIKE_CONSTANTS.DEFEAT_HP_LOSS_PER_POINT);
          const newHp = Math.max(0, run.hp - hpLoss);
          if (newHp <= 0) {
            set({ run: { ...run, hp: 0, phase: 'DEFEAT', currentEnemy: null } });
          } else {
            // 战败存活：退回上一个节点，本节点保持未完成可重试
            set({
              run: {
                ...run,
                hp: newHp,
                currentNodeId: run.prevNodeId ?? run.currentNodeId,
                phase: 'MAP',
                currentEnemy: null,
              },
            });
          }
          return;
        }

        // ——— 胜利 ———
        const heal = Math.ceil(scoreDiff * ROGUELIKE_CONSTANTS.VICTORY_HEAL_RATIO);
        const newHp = Math.min(run.maxHp, run.hp + heal);
        const goldReward = run.currentEnemy?.goldReward ?? 20;
        const pagesGained = node?.pageDrop ? 1 : 0;

        let updated: IRoguelikeRun = {
          ...run,
          hp: newHp,
          gold: run.gold + goldReward,
          battlesWon: run.battlesWon + 1,
          decreePages: run.decreePages + pagesGained,
          nodes: markNodeCompleted(run, run.currentNodeId),
        };

        if (node?.type === 'FINAL_BOSS') {
          // 最终 Boss：按契约抉择进入对应结局
          const endingId: EndingId =
            run.pactChoice === 'SIGN' ? 'NEW_MASTER'
            : run.pactChoice === 'REWRITE' ? 'STITCHER'
            : 'BURNER';
          updated = {
            ...updated,
            endingId,
            pendingStory: getEnding(endingId, run.heroType),
            phase: 'STORY',
          };
        } else if (node?.type === 'BOSS' && node.enemyPresetId) {
          // 普通 Boss：战后对话 → 奖励
          const post = getBossPostDialogue(node.enemyPresetId, run.heroType, 'REWARD');
          updated = {
            ...updated,
            rewardCards: generateRewardCards(run.seed + run.battlesWon),
            pendingStory: post,
            phase: post ? 'STORY' : 'REWARD',
          };
        } else {
          updated = {
            ...updated,
            rewardCards: generateRewardCards(run.seed + run.battlesWon),
            phase: 'REWARD',
          };
        }

        set({ run: updated });
      },

      pickRewardCard: (cardId: string) => {
        const { run } = get();
        if (!run || !run.rewardCards) return;
        const card = run.rewardCards.find(c => c.id === cardId);
        if (!card) return;
        set({
          run: {
            ...run,
            deck: [...run.deck, card],
            rewardCards: null,
            phase: 'MAP',
          },
        });
      },

      skipReward: () => {
        const { run } = get();
        if (!run) return;
        set({ run: { ...run, rewardCards: null, phase: 'MAP' } });
      },

      resolveEvent: (choiceIndex: number) => {
        const { run } = get();
        if (!run || !run.currentEvent) return;

        const choice = run.currentEvent.choices[choiceIndex];
        if (!choice) return;

        let updated: IRoguelikeRun = { ...run, currentEvent: null };

        switch (choice.effect.type) {
          case 'GAIN_GOLD':
            updated = { ...updated, gold: updated.gold + choice.effect.amount };
            break;
          case 'LOSE_GOLD': {
            let hp = updated.hp;
            // 花钱换补给类事件：从标签解析 HP 奖励
            const hpMatch = choice.label.match(/\+(\d+)\s*HP/);
            if (hpMatch) hp = Math.min(updated.maxHp, hp + parseInt(hpMatch[1], 10));
            updated = { ...updated, gold: Math.max(0, updated.gold - choice.effect.amount), hp };
            break;
          }
          case 'GAIN_HP':
            updated = { ...updated, hp: Math.min(updated.maxHp, updated.hp + choice.effect.amount) };
            break;
          case 'LOSE_HP': {
            let hp = Math.max(1, updated.hp - choice.effect.amount);
            let gold = updated.gold;
            // 血祭类事件：从标签解析金币奖励
            const goldMatch = choice.label.match(/\+(\d+)\s*金币/);
            if (goldMatch) gold += parseInt(goldMatch[1], 10);
            updated = { ...updated, hp, gold };
            break;
          }
          case 'GAIN_CARD':
            updated = {
              ...updated,
              deck: [...updated.deck, { ...choice.effect.card, id: uuid() }],
            };
            break;
          case 'GAIN_PAGE': {
            const hpCost = choice.effect.hpCost ?? 0;
            updated = {
              ...updated,
              hp: Math.max(1, updated.hp - hpCost),
              decreePages: updated.decreePages + 1,
            };
            break;
          }
          case 'REMOVE_CARD':
            // 由独立 UI 处理，这里直接跳过
            break;
          case 'NOTHING':
          default:
            break;
        }

        set({
          run: {
            ...updated,
            nodes: markNodeCompleted(run, run.currentNodeId),
            phase: 'MAP',
          },
        });
      },

      restHeal: () => {
        const { run } = get();
        if (!run) return;
        set({
          run: {
            ...run,
            hp: Math.min(run.maxHp, run.hp + ROGUELIKE_CONSTANTS.REST_HEAL),
            nodes: markNodeCompleted(run, run.currentNodeId),
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
        set({
          run: {
            ...run,
            nodes: markNodeCompleted(run, run.currentNodeId),
            phase: 'MAP',
          },
        });
      },

      abandonRun: () => {
        set({ run: null, shopCards: [] });
      },

      getReachableNodes: () => {
        const { run } = get();
        if (!run) return [];
        return getReachableStoryNodes(run.nodes, run.currentNodeId, run.routeChosen);
      },

      refreshShop: () => {
        const pool = shuffleDeck(createDeck()).slice(0, 5);
        set({ shopCards: pool });
      },
    }),
    {
      name: 'roguelike-save-v2',
      partialize: (state) => ({ run: state.run, shopCards: state.shopCards }),
    },
  ),
);
