/**
 * 《坠典》固定世界地图定义
 *
 * 坐标系：1000(宽) x 3000(高)，y 越大越深（坠入深渊）
 *   第一章 暮色集市：y 0-1000
 *   第二章 永夜织巢(A线,左) / 倒悬圣所(B线,右)：y 1000-2000
 *   第三章 深渊裂隙：y 2000-3000
 */
import type { IStoryNode } from '../../types/roguelike';

/** 生成一份全新的（未完成状态）故事地图节点列表 */
export function createStoryNodes(): IStoryNode[] {
  const nodes: IStoryNode[] = [
    // ═══ 第一章 · 暮色集市 ═══
    {
      id: 'start', type: 'STORY', x: 500, y: 100,
      label: '裂隙之口', chapter: 1,
      connections: ['c1_battle1'], completed: true,
    },
    {
      id: 'c1_battle1', type: 'BATTLE', x: 480, y: 280,
      label: '坍塌的市集大道', chapter: 1,
      connections: ['c1_elite_a', 'c1_shop_b'], completed: false,
      enemyPresetId: 'goblin',
    },
    // —— 分岔：血契小径（左，高风险）——
    {
      id: 'c1_elite_a', type: 'ELITE', x: 290, y: 450,
      label: '血契小径 · 收债人', chapter: 1,
      connections: ['c1_event_a'], completed: false,
      enemyPresetId: 'phantom_lord', pageDrop: true,
    },
    {
      id: 'c1_event_a', type: 'EVENT', x: 260, y: 610,
      label: '血契祭坛', chapter: 1,
      connections: ['c1_rest'], completed: false,
      eventId: 'ev_blood_altar',
    },
    // —— 分岔：迷雾商道（右，安全）——
    {
      id: 'c1_shop_b', type: 'SHOP', x: 710, y: 450,
      label: '迷雾商道 · 残存黑市', chapter: 1,
      connections: ['c1_event_b'], completed: false,
    },
    {
      id: 'c1_event_b', type: 'EVENT', x: 740, y: 610,
      label: '雾中旅商', chapter: 1,
      connections: ['c1_rest'], completed: false,
      eventId: 'ev_mist_merchant',
    },
    {
      id: 'c1_rest', type: 'REST', x: 500, y: 750,
      label: '灰烬酒馆', chapter: 1,
      connections: ['c1_boss'], completed: false,
    },
    {
      id: 'c1_boss', type: 'BOSS', x: 500, y: 900,
      label: 'Boss · 黑市之主 蜃', chapter: 1,
      connections: ['c2a_battle', 'c2b_battle'], completed: false,
      enemyPresetId: 'boss_mirage',
    },

    // ═══ 第二章A · 永夜织巢（左路）═══
    {
      id: 'c2a_battle', type: 'BATTLE', x: 280, y: 1130,
      label: '织巢入口', chapter: 2, route: 'A',
      connections: ['c2a_event'], completed: false,
      enemyPresetId: 'cultist',
    },
    {
      id: 'c2a_event', type: 'EVENT', x: 240, y: 1310,
      label: '沉睡者之茧', chapter: 2, route: 'A',
      connections: ['c2a_elite'], completed: false,
      eventId: 'ev_dream_cocoon',
    },
    {
      id: 'c2a_elite', type: 'ELITE', x: 300, y: 1490,
      label: '织巢守卫', chapter: 2, route: 'A',
      connections: ['c2a_rest'], completed: false,
      enemyPresetId: 'fate_weaver', pageDrop: true,
    },
    {
      id: 'c2a_rest', type: 'REST', x: 260, y: 1670,
      label: '梦境浅滩', chapter: 2, route: 'A',
      connections: ['c2a_boss'], completed: false,
    },
    {
      id: 'c2a_boss', type: 'BOSS', x: 320, y: 1860,
      label: 'Boss · 永夜织梦者', chapter: 2, route: 'A',
      connections: ['c3_battle'], completed: false,
      enemyPresetId: 'boss_dream',
    },

    // ═══ 第二章B · 倒悬圣所（右路）═══
    {
      id: 'c2b_battle', type: 'BATTLE', x: 720, y: 1130,
      label: '倒悬回廊', chapter: 2, route: 'B',
      connections: ['c2b_shop'], completed: false,
      enemyPresetId: 'vagrant',
    },
    {
      id: 'c2b_shop', type: 'SHOP', x: 760, y: 1310,
      label: '倒吊人商栈', chapter: 2, route: 'B',
      connections: ['c2b_elite'], completed: false,
    },
    {
      id: 'c2b_elite', type: 'ELITE', x: 700, y: 1490,
      label: '圣所卫歌者', chapter: 2, route: 'B',
      connections: ['c2b_event'], completed: false,
      enemyPresetId: 'warden', pageDrop: true,
    },
    {
      id: 'c2b_event', type: 'EVENT', x: 730, y: 1670,
      label: '倒转钟楼', chapter: 2, route: 'B',
      connections: ['c2b_boss'], completed: false,
      eventId: 'ev_inverted_bell',
    },
    {
      id: 'c2b_boss', type: 'BOSS', x: 680, y: 1860,
      label: 'Boss · 回响歌姬', chapter: 2, route: 'B',
      connections: ['c3_battle'], completed: false,
      enemyPresetId: 'boss_echo',
    },

    // ═══ 第三章 · 深渊裂隙 ═══
    {
      id: 'c3_battle', type: 'BATTLE', x: 500, y: 2100,
      label: '裂隙边缘', chapter: 3,
      connections: ['c3_event'], completed: false,
      enemyPresetId: 'knight',
    },
    {
      id: 'c3_event', type: 'EVENT', x: 440, y: 2260,
      label: '血之低语', chapter: 3,
      connections: ['c3_elite'], completed: false,
      eventId: 'ev_blood_whisper',
    },
    {
      id: 'c3_elite', type: 'ELITE', x: 560, y: 2420,
      label: '堕典侍从', chapter: 3,
      connections: ['c3_rest'], completed: false,
      enemyPresetId: 'warden', pageDrop: true,
    },
    {
      id: 'c3_rest', type: 'REST', x: 500, y: 2570,
      label: '最后的篝火', chapter: 3,
      connections: ['c3_boss'], completed: false,
    },
    {
      id: 'c3_boss', type: 'BOSS', x: 500, y: 2710,
      label: 'Boss · 深渊暴君', chapter: 3,
      connections: ['pact'], completed: false,
      enemyPresetId: 'boss_tyrant',
    },
    {
      id: 'pact', type: 'PACT', x: 500, y: 2830,
      label: '契约之门', chapter: 3,
      connections: ['final'], completed: false,
    },
    {
      id: 'final', type: 'FINAL_BOSS', x: 500, y: 2940,
      label: '魔典之心 · 缚典者', chapter: 3,
      connections: [], completed: false,
      enemyPresetId: 'boss_codex',
    },
  ];

  return nodes;
}

export function findStoryNode(nodes: IStoryNode[], id: string | null): IStoryNode | null {
  if (!id) return null;
  return nodes.find(n => n.id === id) ?? null;
}

/**
 * 从当前节点出发可到达的节点（未完成的直接后继）。
 * 第二章路线锁定：一旦选择了 A/B 路线，另一条路线的节点不可达。
 */
export function getReachableStoryNodes(
  nodes: IStoryNode[],
  currentNodeId: string | null,
  routeChosen: 'A' | 'B' | null,
): string[] {
  const current = findStoryNode(nodes, currentNodeId);
  if (!current) return ['c1_battle1'];
  return current.connections.filter(id => {
    const target = findStoryNode(nodes, id);
    if (!target || target.completed) return false;
    if (target.route && routeChosen && target.route !== routeChosen) return false;
    return true;
  });
}
