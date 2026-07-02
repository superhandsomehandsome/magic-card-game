/**
 * 《坠典》故事模式流程自测脚本（node tsx 运行，不进浏览器）
 * 模拟：序章 → 第一章(血契路线) → Boss蜃 → 第二章A线 → 织梦者
 *      → 第三章 → 暴君 → 契约(重写) → 最终战 → 隐藏结局
 */
import { useRoguelikeStore } from '../src/store/roguelikeStore';
import { HeroType } from '../src/types/game';

// 提供 localStorage stub 供 zustand persist 使用
(globalThis as any).localStorage = {
  store: new Map<string, string>(),
  getItem(k: string) { return this.store.get(k) ?? null; },
  setItem(k: string, v: string) { this.store.set(k, v); },
  removeItem(k: string) { this.store.delete(k); },
};

let failures = 0;
function expect(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failures++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

const S = () => useRoguelikeStore.getState();

function playStory(label: string) {
  const run = S().run!;
  expect(run.phase === 'STORY' && !!run.pendingStory, `${label}: 处于叙事阶段`);
  if (run.pendingStory) {
    console.log(`    [叙事] ${run.pendingStory.title || '(对话)'} — ${run.pendingStory.lines.length} 行 → next=${run.pendingStory.next}`);
  }
  S().completeStory();
}

function winBattle(label: string, diff = 30) {
  const run = S().run!;
  expect(run.phase === 'BATTLE', `${label}: 处于战斗阶段 (enemy=${run.currentEnemy?.name})`);
  S().onBattleEnd(true, diff);
}

function takeReward(label: string) {
  const run = S().run!;
  expect(run.phase === 'REWARD' && (run.rewardCards?.length ?? 0) === 3, `${label}: 奖励 3 选 1`);
  S().pickRewardCard(run.rewardCards![0].id);
}

console.log('═══ 开局：命运织梦者 ═══');
S().startRun(HeroType.WEAVER);
playStory('序章');
expect(S().run!.phase === 'MAP', '序章后回到地图');
expect(S().getReachableNodes().join() === 'c1_battle1', '起点只能去 c1_battle1');

console.log('═══ 第一章 ═══');
S().selectNode('c1_battle1');
playStory('第一章引言'); // chapter 0→1 触发引言
winBattle('市集大道');
takeReward('市集大道');
expect(S().getReachableNodes().sort().join() === 'c1_elite_a,c1_shop_b', '分岔两条路可选');

S().selectNode('c1_elite_a'); // 血契小径
winBattle('血契小径精英');
expect(S().run!.decreePages === 1, '精英掉落残页 1/3');
takeReward('血契精英');

S().selectNode('c1_event_a');
expect(S().run!.phase === 'EVENT' && S().run!.currentEvent?.id === 'ev_blood_altar', '血契祭坛事件');
const hpBefore = S().run!.hp, goldBefore = S().run!.gold;
S().resolveEvent(0); // 血祭 -20HP +55金币
expect(S().run!.hp === hpBefore - 20 && S().run!.gold === goldBefore + 55, '血祭扣血加钱生效');

S().selectNode('c1_rest');
expect(S().run!.phase === 'REST', '灰烬酒馆休息');
S().restHeal();

S().selectNode('c1_boss');
playStory('蜃·战前对话');
expect(S().run!.currentEnemy?.id === 'boss_mirage' && S().run!.currentEnemy?.startingDecree?.id === 'MIDNIGHT_BAZAAR', '蜃携带黑市奇妙夜');
winBattle('黑市之主蜃', 40);
playStory('蜃·战后对话');
takeReward('蜃');

console.log('═══ 第二章（A线 永夜织巢）═══');
expect(S().getReachableNodes().sort().join() === 'c2a_battle,c2b_battle', '命运岔路二选一');
S().selectNode('c2a_battle');
expect(S().run!.routeChosen === 'A', '路线锁定 A');
playStory('第二章A引言');
winBattle('织巢入口');
takeReward('织巢入口');

S().selectNode('c2a_event');
S().resolveEvent(1); // 守着他睡 +20HP
S().selectNode('c2a_elite');
winBattle('织巢守卫');
expect(S().run!.decreePages === 2, '残页 2/3');
takeReward('织巢守卫');
S().selectNode('c2a_rest');
S().restHeal();

S().selectNode('c2a_boss');
playStory('织梦者·战前');
expect(S().run!.currentEnemy?.startingDecree?.id === 'PARANOIA', '织梦者携带偏执法案');
winBattle('永夜织梦者', 50);
playStory('织梦者·战后');
takeReward('织梦者');

console.log('═══ 第三章 ═══');
expect(S().getReachableNodes().join() === 'c3_battle', 'A线Boss后汇合到 c3_battle');
S().selectNode('c3_battle');
playStory('第三章引言');
winBattle('裂隙边缘');
takeReward('裂隙边缘');

S().selectNode('c3_event');
const hp3 = S().run!.hp;
S().resolveEvent(0); // 血之低语 -15HP +1残页
expect(S().run!.decreePages === 3 && S().run!.hp === hp3 - 15, '血之低语获得残页 3/3');

S().selectNode('c3_elite');
winBattle('堕典侍从');
expect(S().run!.decreePages === 4, '第三章精英再掉 1 页（共4）');
takeReward('堕典侍从');
S().selectNode('c3_rest');
S().restHeal();

S().selectNode('c3_boss');
playStory('暴君·战前');
expect(S().run!.currentEnemy?.startingDecree?.id === 'IMPRISONMENT', '暴君携带禁锢法案');
winBattle('深渊暴君', 60);
playStory('暴君·战后');
takeReward('暴君');

console.log('═══ 契约之门 → 隐藏结局 ═══');
expect(S().getReachableNodes().join() === 'pact', 'Boss 后通向契约之门');
S().selectNode('pact');
expect(S().run!.phase === 'PACT', '契约之门抉择');
S().choosePact('REWRITE');
expect(S().run!.pactChoice === 'REWRITE', '选择重写（残页足够）');
expect(S().getReachableNodes().join() === 'final', '契约后通向最终战');

S().selectNode('final');
playStory('缚典者·战前');
expect(S().run!.currentEnemy?.id === 'boss_codex' && S().run!.currentEnemy?.winScore === 150, '最终Boss胜分150');
winBattle('缚典者', 70);
playStory('结局');
expect(S().run!.phase === 'VICTORY' && S().run!.endingId === 'STITCHER', '达成隐藏结局「缝合者」');

console.log('═══ 补充：战败回退 & B线 & 契约门槛 ═══');
S().abandonRun();
S().startRun(HeroType.SINGER);
S().completeStory(); // 序章
S().selectNode('c1_battle1');
S().completeStory(); // 章节引言
S().onBattleEnd(false, 30); // 战败 -15HP
const r2 = S().run!;
expect(r2.phase === 'MAP' && r2.currentNodeId === 'start' && r2.hp === 85, '战败存活：回退起点，扣血');
expect(S().getReachableNodes().join() === 'c1_battle1', '战败节点可重试');

// 大分差致死
S().onBattleEnd(false, 300);
expect(S().run!.hp >= 0, '不会出现负血');
S().abandonRun();

// B 线 + 契约残页不足
S().startRun(HeroType.PHANTOM);
S().completeStory();
S().selectNode('c1_battle1'); S().completeStory(); S().onBattleEnd(true, 30); S().skipReward();
S().selectNode('c1_shop_b');
expect(S().run!.phase === 'SHOP' && S().shopCards.length === 5, '商店节点刷新 5 张牌');
S().returnToMap();
S().selectNode('c1_event_b');
S().resolveEvent(2); // 撬钟舌获得瞬
S().selectNode('c1_rest'); S().restHeal();
S().selectNode('c1_boss'); S().completeStory(); S().onBattleEnd(true, 40); S().completeStory(); S().skipReward();
S().selectNode('c2b_battle');
expect(S().run!.routeChosen === 'B', 'B 线锁定');
S().completeStory(); S().onBattleEnd(true, 30); S().skipReward();
expect(S().getReachableNodes().join() === 'c2b_shop', 'A线节点不可达（路线锁）');
S().selectNode('c2b_shop'); S().returnToMap();
S().selectNode('c2b_elite'); S().onBattleEnd(true, 30); S().skipReward();
S().selectNode('c2b_event'); S().resolveEvent(0);
S().selectNode('c2b_boss'); S().completeStory();
expect(S().run!.currentEnemy?.startsInverted === true, '回响歌姬开局反转标记');
S().onBattleEnd(true, 40); S().completeStory(); S().skipReward();
S().selectNode('c3_battle'); S().completeStory(); S().onBattleEnd(true, 30); S().skipReward();
S().selectNode('c3_event'); S().resolveEvent(1); // 拒绝残页
S().selectNode('c3_elite'); S().onBattleEnd(true, 30); S().skipReward();
S().selectNode('c3_rest'); S().restHeal();
S().selectNode('c3_boss'); S().completeStory(); S().onBattleEnd(true, 40); S().completeStory(); S().skipReward();
S().selectNode('pact');
expect(S().run!.decreePages === 2, 'B线只拿到 2 残页');
S().choosePact('REWRITE');
expect(S().run!.pactChoice === null && S().run!.phase === 'PACT', '残页不足时无法选择重写');
S().choosePact('SIGN');
expect(S().run!.pactChoice === 'SIGN', '签订契约成功');
S().selectNode('final'); S().completeStory(); S().onBattleEnd(true, 30); S().completeStory();
expect(S().run!.endingId === 'NEW_MASTER', '签约结局「魔典的新主」');

console.log('');
if (failures > 0) {
  console.error(`═══ ${failures} 项断言失败 ═══`);
  process.exit(1);
}
console.log('═══ 全部断言通过 ═══');
