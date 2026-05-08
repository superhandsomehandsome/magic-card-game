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
        baseScore: rank === CardRank.FLASH ? 5 : rank,
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

/**
 * 卡牌主题色 (用于文字、副标题等)
 * 配色参考 V5 旧版 [圣物/元素/中坚/基础/低阶/杂鱼] 风格
 */
export function getRankColor(rank: CardRank): string {
  switch (rank) {
    case CardRank.A: return '#D4AF37';     // 暗金（圣物）
    case CardRank.B: return '#7B9DFF';     // 蓝（元素）
    case CardRank.C: return '#4CAF50';     // 翠绿（中坚）
    case CardRank.D: return '#A1887F';     // 棕褐（基础）
    case CardRank.E: return '#78909C';     // 蓝灰（低阶）
    case CardRank.F: return '#9E9E9E';     // 灰（杂鱼）
    case CardRank.FLASH: return '#CE93D8'; // 紫（瞬）
    default: return '#ffffff';
  }
}

/**
 * 卡牌正面渐变背景 (160deg 三色渐变)
 */
export function getRankBackground(rank: CardRank): string {
  switch (rank) {
    case CardRank.A: return 'linear-gradient(160deg, #4A0E17, #721C24, #4A0E17)';
    case CardRank.B: return 'linear-gradient(160deg, #0D1B3E, #1A237E, #0D1B3E)';
    case CardRank.C: return 'linear-gradient(160deg, #0D2818, #1B5E20, #0D2818)';
    case CardRank.D: return 'linear-gradient(160deg, #2C1A10, #4E342E, #2C1A10)';
    case CardRank.E: return 'linear-gradient(160deg, #1E2328, #2C3E50, #1E2328)';
    case CardRank.F: return 'linear-gradient(160deg, #2C2F33, #4B4C50, #2C2F33)';
    case CardRank.FLASH: return 'linear-gradient(160deg, #1A0033, #4A148C, #1A0033)';
    default: return 'linear-gradient(180deg, #0d0018 0%, #1a0b2e 100%)';
  }
}

/** 边框色 */
export function getRankBorder(rank: CardRank): string {
  switch (rank) {
    case CardRank.A: return '#8B6914';
    case CardRank.B: return '#3A5ABA';
    case CardRank.C: return '#2E7D32';
    case CardRank.D: return '#5D4037';
    case CardRank.E: return '#455A64';
    case CardRank.F: return '#616161';
    case CardRank.FLASH: return '#7B1FA2';
    default: return '#3a1f5e';
  }
}

/** 副标题（卡牌底部小字） */
export function getRankSubtitle(rank: CardRank): string {
  switch (rank) {
    case CardRank.A: return '圣物';
    case CardRank.B: return '元素';
    case CardRank.C: return '中坚';
    case CardRank.D: return '基础';
    case CardRank.E: return '低阶';
    case CardRank.F: return '杂鱼';
    case CardRank.FLASH: return '瞬';
    default: return '?';
  }
}

/** 发光强度（用于 A/B 等高级牌） */
export function getRankGlow(rank: CardRank): string {
  switch (rank) {
    case CardRank.A: return '0 0 18px rgba(139,105,20,0.5), 0 0 36px rgba(139,105,20,0.25)';
    case CardRank.B: return '0 0 12px rgba(58,90,186,0.4)';
    case CardRank.C: return '0 0 8px rgba(46,125,50,0.3)';
    case CardRank.D: return 'none';
    case CardRank.E: return 'none';
    case CardRank.F: return 'none';
    case CardRank.FLASH: return '0 0 14px rgba(123,31,162,0.5)';
    default: return 'none';
  }
}
