/**
 * 咏唱计分 — 组合检测系统
 */
import type { ICard, IComboResult, IPlayerState } from '../types/game';
import { CardRank, ComboType } from '../types/game';
import { getEffectiveScore } from './deck';

/**
 * 检测玩家手牌中所有可用组合
 */
export function detectCombos(hand: ICard[], isInverted: boolean, blockedRank: CardRank | null): IComboResult[] {
  const combos: IComboResult[] = [];
  // 封锁机制改为「扣分」：仍允许使用被封锁 rank，但每张该 rank 牌组合后扣 baseScore × 3 分
  const availableCards = hand;

  const grandStraight = detectGrandStraight(availableCards, isInverted);
  if (grandStraight) combos.push(grandStraight);

  const smallStraights = detectSmallStraights(availableCards, isInverted);
  combos.push(...smallStraights);

  const fourOfKinds = detectNOfKind(availableCards, 4, isInverted);
  combos.push(...fourOfKinds);

  const fullHouses = detectFullHouse(availableCards, isInverted);
  combos.push(...fullHouses);

  const threeOfKinds = detectNOfKind(availableCards, 3, isInverted);
  combos.push(...threeOfKinds);

  const pairs = detectNOfKind(availableCards, 2, isInverted);
  combos.push(...pairs);

  // 计算每个组合的封锁罚分
  if (blockedRank !== null) {
    for (const combo of combos) {
      const blockedCards = combo.cards.filter(c => c.rank === blockedRank);
      combo.blockedPenalty = blockedCards.reduce((s, c) => s + c.baseScore * 3, 0);
    }
  } else {
    for (const combo of combos) combo.blockedPenalty = 0;
  }

  return combos;
}

function detectGrandStraight(cards: ICard[], isInverted: boolean): IComboResult | null {
  const ranks = [CardRank.A, CardRank.B, CardRank.C, CardRank.D, CardRank.E, CardRank.F];
  const usedCards: ICard[] = [];

  for (const rank of ranks) {
    const card = cards.find(c => c.rank === rank && !usedCards.includes(c));
    if (!card) return null;
    usedCards.push(card);
  }

  const score = usedCards.reduce((sum, c) => sum + getEffectiveScore(c.rank, isInverted), 0) * 3;
  return { type: ComboType.GRAND_STRAIGHT, cards: usedCards, score };
}

function detectSmallStraights(cards: ICard[], isInverted: boolean): IComboResult[] {
  const results: IComboResult[] = [];
  const ranks = [CardRank.F, CardRank.E, CardRank.D, CardRank.C, CardRank.B, CardRank.A];
  const sortedUnique = [...new Set(cards.map(c => c.rank))].sort((a, b) => a - b);

  for (let start = 0; start <= sortedUnique.length - 4; start++) {
    let consecutive = 1;
    const straightRanks = [sortedUnique[start]];

    for (let i = start + 1; i < sortedUnique.length; i++) {
      if (sortedUnique[i] === sortedUnique[i - 1] + 1) {
        consecutive++;
        straightRanks.push(sortedUnique[i]);
      } else break;
    }

    if (consecutive >= 4) {
      const usedCards = straightRanks
        .map(rank => cards.find(c => c.rank === rank)!)
        .filter(Boolean);
      const score = usedCards.reduce((sum, c) => sum + getEffectiveScore(c.rank, isInverted), 0) * 2;
      results.push({ type: ComboType.SMALL_STRAIGHT, cards: usedCards, score });
    }
  }

  return results;
}

function detectNOfKind(cards: ICard[], n: number, isInverted: boolean): IComboResult[] {
  const results: IComboResult[] = [];
  const rankGroups = new Map<CardRank, ICard[]>();

  cards.forEach(card => {
    if (card.rank === CardRank.FLASH) return;
    const group = rankGroups.get(card.rank) || [];
    group.push(card);
    rankGroups.set(card.rank, group);
  });

  rankGroups.forEach((group, rank) => {
    if (group.length >= n) {
      const usedCards = group.slice(0, n);
      let multiplier = 1;
      let type: ComboType;

      switch (n) {
        case 4:
          multiplier = 4;
          type = ComboType.FOUR_OF_KIND;
          break;
        case 3:
          multiplier = 2;
          type = ComboType.THREE_OF_KIND;
          break;
        default:
          multiplier = 1;
          type = ComboType.PAIR;
      }

      const score = usedCards.reduce((sum, c) => sum + getEffectiveScore(c.rank, isInverted), 0) * multiplier;
      results.push({ type, cards: usedCards, score });
    }
  });

  return results;
}

function detectFullHouse(cards: ICard[], isInverted: boolean): IComboResult[] {
  const results: IComboResult[] = [];
  const rankGroups = new Map<CardRank, ICard[]>();

  cards.forEach(card => {
    if (card.rank === CardRank.FLASH) return;
    const group = rankGroups.get(card.rank) || [];
    group.push(card);
    rankGroups.set(card.rank, group);
  });

  const threes = [...rankGroups.entries()].filter(([, g]) => g.length >= 3);
  const twos = [...rankGroups.entries()].filter(([, g]) => g.length >= 2);

  for (const [threeRank, threeGroup] of threes) {
    for (const [twoRank, twoGroup] of twos) {
      if (threeRank === twoRank) continue;
      const usedCards = [...threeGroup.slice(0, 3), ...twoGroup.slice(0, 2)];
      const score = usedCards.reduce((sum, c) => sum + getEffectiveScore(c.rank, isInverted), 0) * 3;
      results.push({ type: ComboType.FULL_HOUSE, cards: usedCards, score });
    }
  }

  return results;
}

/**
 * 获取被封锁的 rank（对手封锁区的牌）
 */
export function getBlockedRank(opponent: IPlayerState): CardRank | null {
  return opponent.blockadeZone?.rank ?? null;
}
