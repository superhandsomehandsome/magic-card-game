/**
 * 牌库工具函数 — 创建、洗牌、比较
 */
import { v4 as uuid } from 'uuid';
import type { ICard } from '../types/game';
import { CardRank, GAME_CONSTANTS } from '../types/game';

export function createDeck(): ICard[] {
  const deck: ICard[] = [];
  const composition = GAME_CONSTANTS.DECK_COMPOSITION;

  for (const [rankStr, count] of Object.entries(composition)) {
    const rank = Number(rankStr) as CardRank;
    for (let i = 0; i < count; i++) {
      deck.push({
        id: uuid(),
        rank,
        baseScore: rank,
      });
    }
  }

  return deck;
}

export function shuffleDeck(deck: ICard[]): ICard[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 获取牌的有效分值（考虑以太歌者反转）
 */
export function getEffectiveScore(rank: CardRank, isInverted: boolean): number {
  if (rank === CardRank.FLASH) return 0;
  if (!isInverted) return rank;
  // 反转：F(1)->6, E(2)->5, D(3)->4, C(4)->3, B(5)->2, A(6)->1
  return 7 - rank;
}

/**
 * 比较两张牌：返回 >0 表示 a 赢，<0 表示 b 赢，0 表示平局
 * 绝对特例：F > A（即使反转后也保留此规则的精神：最弱胜最强）
 */
export function compareCards(a: CardRank, b: CardRank, isInverted: boolean): number {
  if (a === CardRank.FLASH || b === CardRank.FLASH) return 0;

  const scoreA = getEffectiveScore(a, isInverted);
  const scoreB = getEffectiveScore(b, isInverted);

  // F弑神规则：有效分最低的牌赢有效分最高的牌
  const minScore = isInverted ? 1 : 1; // F 的有效分
  const maxScore = isInverted ? 1 : 6; // A 的有效分

  if (!isInverted) {
    // 正常：F(1) 赢 A(6)
    if (a === CardRank.F && b === CardRank.A) return 1;
    if (b === CardRank.F && a === CardRank.A) return -1;
  } else {
    // 反转后：A(有效分1，最弱) 赢 F(有效分6，最强)
    if (a === CardRank.A && b === CardRank.F) return 1;
    if (b === CardRank.A && a === CardRank.F) return -1;
  }

  return scoreA - scoreB;
}

/**
 * 获取牌的显示名称
 */
export function getCardDisplayName(rank: CardRank): string {
  switch (rank) {
    case CardRank.A: return 'A';
    case CardRank.B: return 'B';
    case CardRank.C: return 'C';
    case CardRank.D: return 'D';
    case CardRank.E: return 'E';
    case CardRank.F: return 'F';
    case CardRank.FLASH: return '瞬';
    default: return '?';
  }
}

export function getRankColor(rank: CardRank): string {
  switch (rank) {
    case CardRank.A: return '#ffd700';
    case CardRank.B: return '#c0c0c0';
    case CardRank.C: return '#cd7f32';
    case CardRank.D: return '#8b4513';
    case CardRank.E: return '#4a4a4a';
    case CardRank.F: return '#2d1b4e';
    case CardRank.FLASH: return '#00ffff';
    default: return '#ffffff';
  }
}
