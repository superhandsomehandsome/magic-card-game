/**
 * Roguelike 随机事件池 + 《坠典》故事模式叙事事件
 */
import type { IRandomEvent } from '../../types/roguelike';
import { CardRank } from '../../types/game';

export const EVENT_POOL: IRandomEvent[] = [
  {
    id: 'abandoned_shrine',
    title: '废弃的祭坛',
    description: '你在暗处发现了一座古旧的祭坛，上面散落着暗金色的符文。祭坛似乎还残留着微弱的魔力……',
    choices: [
      { label: '献祭血液（-15 HP, +40 金币）', effect: { type: 'LOSE_HP', amount: 15 } },
      { label: '默默离开', effect: { type: 'NOTHING' } },
    ],
  },
  {
    id: 'wandering_merchant',
    title: '流浪旅商',
    description: '一个蒙面旅商拦住了你的去路，他低声说："交出一些金币，我可以帮你遗忘一张不需要的牌。"',
    choices: [
      { label: '交易（-20 金币，移除1张牌）', effect: { type: 'LOSE_GOLD', amount: 20 } },
      { label: '拒绝交易', effect: { type: 'NOTHING' } },
    ],
  },
  {
    id: 'mysterious_fountain',
    title: '神秘泉水',
    description: '清澈的泉水从岩缝中涌出，散发着淡淡的光芒。饮用后你感到全身充满了力量。',
    choices: [
      { label: '饮用泉水（+20 HP）', effect: { type: 'GAIN_HP', amount: 20 } },
      { label: '用泉水净化牌组（移除1张牌）', effect: { type: 'REMOVE_CARD' } },
    ],
  },
  {
    id: 'treasure_chest',
    title: '被遗忘的宝箱',
    description: '路旁有一个布满灰尘的宝箱，锁已经锈蚀了。你轻轻推开盖子——',
    choices: [
      { label: '搜刮财宝（+30 金币）', effect: { type: 'GAIN_GOLD', amount: 30 } },
      { label: '小心离开（可能有陷阱）', effect: { type: 'NOTHING' } },
    ],
  },
  {
    id: 'blood_pact',
    title: '血之契约',
    description: '暗红色的卷轴悬浮在空中，上面写着：以鲜血换取力量。代价是你的生命力，回报是金币与魔力。',
    choices: [
      { label: '签订契约（-25 HP, +60 金币）', effect: { type: 'LOSE_HP', amount: 25 } },
      { label: '撕毁卷轴', effect: { type: 'GAIN_HP', amount: 5 } },
    ],
  },
  {
    id: 'fortune_teller',
    title: '命运占卜师',
    description: '"命运已经注定……但我可以为你微调一下。"占卜师神秘地笑着。',
    choices: [
      { label: '接受占卜（+10 金币）', effect: { type: 'GAIN_GOLD', amount: 10 } },
      { label: '请求治疗（+15 HP）', effect: { type: 'GAIN_HP', amount: 15 } },
    ],
  },
];

export function pickEvent(seed: number): IRandomEvent {
  const idx = Math.abs(seed) % EVENT_POOL.length;
  return EVENT_POOL[idx];
}

// ═══════════════════════════════════════════════════════════
//  《坠典》故事模式叙事事件（按地图节点 eventId 精确取用）
// ═══════════════════════════════════════════════════════════

export const STORY_EVENTS: IRandomEvent[] = [
  {
    id: 'ev_blood_altar',
    title: '血契祭坛',
    description: '血契小径的尽头，一座祭坛仍在跳动——像一颗裸露的心脏。祭坛上刻着半篇残缺的法案，缺口的形状，恰好是一只手掌。收债人的血还未干透，祭坛显然还饿着。',
    choices: [
      { label: '按上手掌，以血续约（-20 HP，+55 金币）', effect: { type: 'LOSE_HP', amount: 20 } },
      { label: '刮下祭坛上的金粉（+25 金币）', effect: { type: 'GAIN_GOLD', amount: 25 } },
      { label: '为死者默哀后离开（+10 HP）', effect: { type: 'GAIN_HP', amount: 10 } },
    ],
  },
  {
    id: 'ev_mist_merchant',
    title: '雾中旅商',
    description: '浓雾中亮起一盏灯笼。旅商的脸藏在兜帽下，声音却出奇地和善："规则崩坏之后，我是这条商道上最后一个守约的人。看在你还活着的份上，给你个实价。"',
    choices: [
      { label: '买下他最后的存货（-25 金币，获得 1 张圣物 A）', effect: { type: 'GAIN_CARD', card: { id: 'story_relic_a', rank: CardRank.A, baseScore: 6 } } },
      { label: '买一壶雾酿和一顿热饭（-15 金币，+15 HP）', effect: { type: 'LOSE_GOLD', amount: 15 } },
      { label: '道谢后继续赶路', effect: { type: 'NOTHING' } },
    ],
  },
  {
    id: 'ev_dream_cocoon',
    title: '沉睡者之茧',
    description: '一枚半透明的梦茧悬在网上，里面蜷缩着一个熟睡的旅人。他脸上带着幸福的微笑——在梦里，他大概正过着规则尚存的旧日子。叫醒他，还是让他继续睡？',
    choices: [
      { label: '割开茧唤醒他（他感激地送你盘缠，+35 金币）', effect: { type: 'GAIN_GOLD', amount: 35 } },
      { label: '守着他睡完这一觉（你也小憩片刻，+20 HP）', effect: { type: 'GAIN_HP', amount: 20 } },
      { label: '取走茧丝纺成新牌（获得 1 张元素 B）', effect: { type: 'GAIN_CARD', card: { id: 'story_dream_b', rank: CardRank.B, baseScore: 5 } } },
    ],
  },
  {
    id: 'ev_inverted_bell',
    title: '倒转钟楼',
    description: '钟楼倒悬，巨钟悬在你脚下。钟身刻着一行字："敲响我，失去的会归来；沉默着，拥有的会翻倍。"在这个颠倒的圣所里，你不确定哪句是真话。',
    choices: [
      { label: '敲响巨钟（+25 HP，钟声治愈伤痕）', effect: { type: 'GAIN_HP', amount: 25 } },
      { label: '保持沉默走过（+30 金币，口袋莫名变沉）', effect: { type: 'GAIN_GOLD', amount: 30 } },
      { label: '撬下钟舌藏进袖中（获得 1 张瞬）', effect: { type: 'GAIN_CARD', card: { id: 'story_bell_flash', rank: CardRank.FLASH, baseScore: 5 } } },
    ],
  },
  {
    id: 'ev_blood_whisper',
    title: '血之低语',
    description: '裂隙的血光中，一张法案残页悬浮在你面前——它没有燃烧，而是在低语。它说它想被带走，但作为交换，它要"尝一口执笔者的血"。',
    choices: [
      { label: '割破手掌递给它（-15 HP，获得 1 张法案残页）', effect: { type: 'GAIN_PAGE', hpCost: 15 } },
      { label: '拒绝它的交易（+15 金币，它扔下赏钱嘲笑你）', effect: { type: 'GAIN_GOLD', amount: 15 } },
    ],
  },
];

/** 故事模式：按事件 id 精确取事件；找不到时从随机池兜底 */
export function getEventById(id: string): IRandomEvent {
  return STORY_EVENTS.find(e => e.id === id)
    ?? EVENT_POOL.find(e => e.id === id)
    ?? EVENT_POOL[0];
}
