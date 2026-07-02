/**
 * Roguelike 敌人预设 — 不同难度梯度的 AI 对手
 */
import { HeroType } from '../../types/game';
import type { IDecree } from '../../types/game';
import type { IEnemyPreset, EnemyTier } from '../../types/roguelike';
import { ROGUELIKE_CONSTANTS } from '../../types/roguelike';
import { DECREE_POOL } from '../decrees';

function decreeById(id: string): IDecree | undefined {
  return DECREE_POOL.find(d => d.id === id);
}

const WEAK_ENEMIES: IEnemyPreset[] = [
  {
    id: 'goblin',
    name: '暗巷窃贼',
    tier: 'WEAK',
    hero: HeroType.PHANTOM,
    aggression: 0.3,
    skill: 0.2,
    winScore: ROGUELIKE_CONSTANTS.BATTLE_WIN_SCORE,
    goldReward: 15,
  },
  {
    id: 'cultist',
    name: '低阶信徒',
    tier: 'WEAK',
    hero: HeroType.WEAVER,
    aggression: 0.25,
    skill: 0.3,
    winScore: ROGUELIKE_CONSTANTS.BATTLE_WIN_SCORE,
    goldReward: 15,
  },
  {
    id: 'vagrant',
    name: '流浪法师',
    tier: 'WEAK',
    hero: HeroType.SINGER,
    aggression: 0.2,
    skill: 0.25,
    winScore: ROGUELIKE_CONSTANTS.BATTLE_WIN_SCORE,
    goldReward: 12,
  },
];

const NORMAL_ENEMIES: IEnemyPreset[] = [
  {
    id: 'knight',
    name: '堕落骑士',
    tier: 'NORMAL',
    hero: HeroType.INQUISITOR,
    aggression: 0.5,
    skill: 0.4,
    winScore: ROGUELIKE_CONSTANTS.BATTLE_WIN_SCORE,
    goldReward: 20,
  },
  {
    id: 'merchant',
    name: '黑市商人',
    tier: 'NORMAL',
    hero: HeroType.PHANTOM,
    aggression: 0.45,
    skill: 0.5,
    winScore: ROGUELIKE_CONSTANTS.BATTLE_WIN_SCORE,
    goldReward: 25,
  },
  {
    id: 'seer',
    name: '迷途先知',
    tier: 'NORMAL',
    hero: HeroType.WEAVER,
    aggression: 0.4,
    skill: 0.45,
    winScore: ROGUELIKE_CONSTANTS.BATTLE_WIN_SCORE,
    goldReward: 22,
  },
];

const ELITE_ENEMIES: IEnemyPreset[] = [
  {
    id: 'warden',
    name: '深渊守卫',
    tier: 'ELITE',
    hero: HeroType.INQUISITOR,
    aggression: 0.7,
    skill: 0.65,
    winScore: ROGUELIKE_CONSTANTS.ELITE_WIN_SCORE,
    goldReward: 40,
  },
  {
    id: 'phantom_lord',
    name: '影域领主',
    tier: 'ELITE',
    hero: HeroType.PHANTOM,
    aggression: 0.75,
    skill: 0.7,
    winScore: ROGUELIKE_CONSTANTS.ELITE_WIN_SCORE,
    goldReward: 45,
  },
  {
    id: 'fate_weaver',
    name: '命运编织者',
    tier: 'ELITE',
    hero: HeroType.WEAVER,
    aggression: 0.6,
    skill: 0.75,
    winScore: ROGUELIKE_CONSTANTS.ELITE_WIN_SCORE,
    goldReward: 42,
  },
];

const BOSS_ENEMIES: IEnemyPreset[] = [
  {
    id: 'boss_mirage',
    name: '黑市之主 · 蜃',
    tier: 'BOSS',
    hero: HeroType.PHANTOM,
    aggression: 0.7,
    skill: 0.65,
    winScore: 90,
    startingDecree: decreeById('MIDNIGHT_BAZAAR'),
    goldReward: 60,
    flavor: '万物皆可成交，价格是你的真实。',
  },
  {
    id: 'boss_dream',
    name: '永夜织梦者',
    tier: 'BOSS',
    hero: HeroType.WEAVER,
    aggression: 0.8,
    skill: 0.85,
    winScore: 110,
    startingDecree: decreeById('PARANOIA'),
    goldReward: 80,
    flavor: '何必醒来呢？梦里，规则还活着。',
  },
  {
    id: 'boss_echo',
    name: '回响歌姬',
    tier: 'BOSS',
    hero: HeroType.SINGER,
    aggression: 0.9,
    skill: 0.8,
    winScore: 110,
    startsInverted: true,
    goldReward: 80,
    flavor: '强者跪下，弱者加冕。',
  },
  {
    id: 'boss_tyrant',
    name: '深渊暴君',
    tier: 'BOSS',
    hero: HeroType.INQUISITOR,
    aggression: 0.85,
    skill: 0.85,
    winScore: ROGUELIKE_CONSTANTS.BOSS_WIN_SCORE,
    startingDecree: decreeById('IMPRISONMENT'),
    goldReward: 80,
    flavor: '碰过魔典的手，没有一只是干净的。',
  },
  {
    id: 'boss_codex',
    name: '缚典者 · 空白之主',
    tier: 'BOSS',
    hero: HeroType.INQUISITOR,
    aggression: 0.9,
    skill: 0.9,
    winScore: ROGUELIKE_CONSTANTS.FINAL_WIN_SCORE,
    goldReward: 150,
    flavor: '由你，来写下结论。',
  },
];

const TIER_MAP: Record<EnemyTier, IEnemyPreset[]> = {
  WEAK: WEAK_ENEMIES,
  NORMAL: NORMAL_ENEMIES,
  ELITE: ELITE_ENEMIES,
  BOSS: BOSS_ENEMIES,
};

export function pickEnemy(tier: EnemyTier, seed: number): IEnemyPreset {
  const pool = TIER_MAP[tier];
  const idx = Math.abs(seed) % pool.length;
  return pool[idx];
}

/** 故事模式：按预设 id 精确取敌人 */
export function getEnemyById(id: string): IEnemyPreset | null {
  const all = [...WEAK_ENEMIES, ...NORMAL_ENEMIES, ...ELITE_ENEMIES, ...BOSS_ENEMIES];
  return all.find(e => e.id === id) ?? null;
}

export function getEnemyForFloorAndNode(
  floor: number,
  nodeType: 'BATTLE' | 'ELITE' | 'BOSS',
  seed: number,
): IEnemyPreset {
  if (nodeType === 'BOSS') return pickEnemy('BOSS', seed + floor * 31);
  if (nodeType === 'ELITE') return pickEnemy('ELITE', seed + floor * 17);
  // Normal battles get harder on later floors
  if (floor === 0) return pickEnemy('WEAK', seed);
  if (floor === 1) return pickEnemy(seed % 3 === 0 ? 'NORMAL' : 'WEAK', seed);
  return pickEnemy('NORMAL', seed);
}
