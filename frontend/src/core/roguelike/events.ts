/**
 * Roguelike 随机事件池
 */
import type { IRandomEvent } from '../../types/roguelike';

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
