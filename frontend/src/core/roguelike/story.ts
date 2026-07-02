/**
 * 《坠典》— 深渊故事模式全部叙事文本
 *
 * 背景：禁忌魔典一夜之间自我撕裂，十二篇法案化作残页散落深渊，
 * 秘术世界的规则开始崩坏。深渊裂隙中传来魔典残躯的低语：
 * 「把我缝合，或者取代我。」
 */
import { HeroType } from '../../types/game';
import type { IStoryLine, IPendingStory, EndingId, RunPhase } from '../../types/roguelike';

const HERO_NAMES: Record<HeroType, string> = {
  [HeroType.PHANTOM]: '奥术怪盗',
  [HeroType.WEAVER]: '命运织梦者',
  [HeroType.INQUISITOR]: '至高审判官',
  [HeroType.SINGER]: '以太歌者',
};

export function heroName(hero: HeroType): string {
  return HERO_NAMES[hero];
}

// ═══════════════════════════════════════════════════════════
//  序章 — 四英雄各自的入渊动机
// ═══════════════════════════════════════════════════════════

const PROLOGUES: Record<HeroType, IStoryLine[]> = {
  [HeroType.PHANTOM]: [
    { text: '那一夜，禁忌魔典自我撕裂。十二篇法案化作残页，如同燃烧的乌鸦坠入深渊。' },
    { text: '黑市在一个时辰内崩塌了。契约失效，赃物变回尘土，连影子都开始赖账。' },
    { speaker: '奥术怪盗', text: '规则死了，生意就死了。我这辈子偷过王冠、偷过命运、偷过神的怀表……' },
    { speaker: '奥术怪盗', text: '现在，我要去偷这世上最后的赃物——魔典本体。深渊，开门吧。' },
  ],
  [HeroType.WEAVER]: [
    { text: '那一夜，禁忌魔典自我撕裂。十二篇法案化作残页，如同断线的流星坠入深渊。' },
    { text: '她睁开眼，看见织机上所有的命运之线都断了——每一根断口，都指向同一处裂隙。' },
    { speaker: '命运织梦者', text: '一千万条命运，断在同一个深渊里。这不是巧合，是呼唤。' },
    { speaker: '命运织梦者', text: '线断了，就要有人下去接。我带上了针。' },
  ],
  [HeroType.INQUISITOR]: [
    { text: '那一夜，禁忌魔典自我撕裂。十二篇法案化作残页，如同撕碎的判决书坠入深渊。' },
    { text: '律法之源堕落了。世间所有的天平在同一刻倾斜，无人再能称量罪恶。' },
    { speaker: '至高审判官', text: '我审判过盗贼、暴君、伪神。但从未审判过律法本身。' },
    { speaker: '至高审判官', text: '魔典，你自撕篇章、放逐规则，罪当极刑。本庭，现在开庭。' },
  ],
  [HeroType.SINGER]: [
    { text: '那一夜，禁忌魔典自我撕裂。十二篇法案化作残页，如同走调的音符坠入深渊。' },
    { text: '她在午夜听见了那首歌——终焉之歌。每一个小节都在崩坏，副歌指向世界的终止符。' },
    { speaker: '以太歌者', text: '整个世界的乐谱都在走调。如果没人去改写，最后一个音符落下时，一切都会静止。' },
    { speaker: '以太歌者', text: '那么，就让我在终止符之前，加上一段新的乐章。' },
  ],
};

// ═══════════════════════════════════════════════════════════
//  章节引言
// ═══════════════════════════════════════════════════════════

const CHAPTER_HERO_LINES: Record<string, Record<HeroType, string>> = {
  c1: {
    [HeroType.PHANTOM]: '我的老地盘……变成了这副样子。谁干的，谁就得付账。',
    [HeroType.WEAVER]: '这里的命运之线乱成了一团死结。先从最粗的那根开始解。',
    [HeroType.INQUISITOR]: '黑市本就藏污纳垢。但纵使罪人，也应死于判决，而非混乱。',
    [HeroType.SINGER]: '听，集市的喧哗变成了哀鸣。这是第一段走调的旋律。',
  },
  c2a: {
    [HeroType.PHANTOM]: '梦境里的东西偷不走——但梦的主人可以被叫醒。',
    [HeroType.WEAVER]: '这是我同门的织巢。她织的不是梦，是把所有人困在里面的茧。',
    [HeroType.INQUISITOR]: '以梦掩罪，罪加一等。',
    [HeroType.SINGER]: '摇篮曲不该唱成安魂曲。',
  },
  c2b: {
    [HeroType.PHANTOM]: '倒悬的圣所……连重力都在赖账。我喜欢。',
    [HeroType.WEAVER]: '这里的线是倒着织的。因果颠倒，织机也会哭泣。',
    [HeroType.INQUISITOR]: '颠倒黑白者，天平会记住你。',
    [HeroType.SINGER]: '这是我教过的和声……她把它唱反了。',
  },
  c3: {
    [HeroType.PHANTOM]: '深渊底层。传说中所有被偷走的东西，最后都会掉到这里。',
    [HeroType.WEAVER]: '所有断线的尽头。织机在颤抖——它害怕下面的东西。',
    [HeroType.INQUISITOR]: '律法堕落之地。今日之后，此地要么重归秩序，要么不复存在。',
    [HeroType.SINGER]: '终焉之歌的最后一个乐章，就在下面。深呼吸。',
  },
};

const CHAPTER_INTROS: Record<string, { title: string; lines: IStoryLine[] }> = {
  c1: {
    title: '第一章 · 暮色集市',
    lines: [
      { text: '深渊的第一层，是崩坏的黑市废墟。永恒的黄昏悬在头顶，烛火在坍塌的摊位间明明灭灭。' },
      { text: '规则崩坏后，这里的物价以秒为单位疯涨。有人用一枚金币买下一条街，又在下一秒破产。' },
      { text: '废墟深处，一个自称"蜃"的存在接管了黑市。他贩卖的商品只有一种：幻觉。' },
    ],
  },
  c2a: {
    title: '第二章 · 永夜织巢',
    lines: [
      { text: '穿过集市的裂隙，你坠入一片紫色的梦境。这里是永夜织巢——所有沉睡者的梦，都被织成了一张巨网。' },
      { text: '网的中央，端坐着永夜织梦者。她曾是命运的守护者，如今却用断掉的命运之线，编织永不醒来的梦。' },
      { text: '「何必醒来呢？」蛛网间回荡着她的低语，「梦里，规则还活着。」' },
    ],
  },
  c2b: {
    title: '第二章 · 倒悬圣所',
    lines: [
      { text: '穿过集市的裂隙，你坠入一座倒悬的圣所。尖塔向下生长，钟声向上坠落，圣歌的每个音符都是反的。' },
      { text: '圣所的穹顶（或者说地底），站着回响歌姬。她曾是天籁的化身，如今只唱倒转的镇魂曲。' },
      { text: '「强者为弱，弱者为强。」她的歌声让你的血液倒流，「在我的圣所里，一切都要倒过来。」' },
    ],
  },
  c3: {
    title: '第三章 · 深渊裂隙',
    lines: [
      { text: '这里是深渊的最底层。血红色的裂隙中，漂浮着魔典残躯——一本没有字的书，缓慢地翻动着空白的书页。' },
      { text: '守在裂隙前的，是深渊暴君。他曾是第一代审判官，因试图独占魔典而被封印于此，成为了魔典的看门犬。' },
      { text: '空白书页的沙沙声中，你听见了那句低语：「把我缝合，或者取代我。」' },
    ],
  },
};

// ═══════════════════════════════════════════════════════════
//  Boss 对话（战前/战后）
// ═══════════════════════════════════════════════════════════

interface IBossDialogue {
  pre: (hero: HeroType) => IStoryLine[];
  post: (hero: HeroType) => IStoryLine[];
}

const BOSS_HERO_TAUNTS: Record<string, Record<HeroType, string>> = {
  boss_mirage: {
    [HeroType.PHANTOM]: '蜃？呵，用幻觉骗钱是我玩剩下的把戏。让专业的来教你什么叫交易。',
    [HeroType.WEAVER]: '幻觉也有命运之线——而你的线，到今天为止。',
    [HeroType.INQUISITOR]: '以虚假牟利，欺诈罪成立。宣判开始。',
    [HeroType.SINGER]: '幻觉是无声的谎言。让真实的音色戳破它。',
  },
  boss_dream: {
    [HeroType.PHANTOM]: '永不醒来的梦？那谁来付住宿费？我来叫醒他们。',
    [HeroType.WEAVER]: '师姐……你织错了。梦是用来醒的，就像线是用来断的。',
    [HeroType.INQUISITOR]: '囚禁千万沉睡者，罪名：剥夺自由。判决：立即执行。',
    [HeroType.SINGER]: '你的摇篮曲很美。可惜，我要唱的是起床号。',
  },
  boss_echo: {
    [HeroType.PHANTOM]: '倒转的圣所……那我倒着偷，不就正好？',
    [HeroType.WEAVER]: '倒着织的茧，困不住正着走的人。',
    [HeroType.INQUISITOR]: '颠倒众生者，本庭现在拨乱反正。',
    [HeroType.SINGER]: '老师教过我们：走调不可怕，可怕的是不肯回到正确的调上。……对不起，师姐。',
  },
  boss_tyrant: {
    [HeroType.PHANTOM]: '看门狗也配拦我？我偷过的门，比你看过的还多。',
    [HeroType.WEAVER]: '被锁链缚住千年的命运……我来剪断它，顺便剪断你。',
    [HeroType.INQUISITOR]: '前辈。你的判决书，由我这个后辈来写完。',
    [HeroType.SINGER]: '千年的怨吼也是一种歌。让我为它写下休止符。',
  },
  boss_codex: {
    [HeroType.PHANTOM]: '世上最后的赃物……我来了。这一票，够吹一辈子。',
    [HeroType.WEAVER]: '所有断线的源头。今天，织机与针，对峙白纸与墨。',
    [HeroType.INQUISITOR]: '被告：禁忌魔典。罪名：弑规则。最终审判——开庭。',
    [HeroType.SINGER]: '终焉之歌的最后一小节。深渊，听好了——这是我的改写。',
  },
};

const BOSS_DIALOGUES: Record<string, IBossDialogue> = {
  boss_mirage: {
    pre: (hero) => [
      { speaker: '黑市之主 · 蜃', text: '欢迎光临，稀客。要买点什么？永恒的财富？逝去的爱人？还是……你自己的倒影？' },
      { speaker: '黑市之主 · 蜃', text: '在我的集市里，万物皆可成交。价格嘛——不过是你的真实。' },
      { speaker: heroName(hero), text: BOSS_HERO_TAUNTS.boss_mirage[hero] },
    ],
    post: (hero) => [
      { speaker: '黑市之主 · 蜃', text: '哈……哈哈。原来真实的牌，比幻觉更锋利……' },
      { text: '蜃的身形如雾般消散，露出他身后的裂隙。无数幻觉商品化为泡影，只留下一枚真实的钥匙。' },
      { speaker: heroName(hero), text: hero === HeroType.PHANTOM ? '幻觉退款，概不讲价。' : '第一道门，开了。' },
    ],
  },
  boss_dream: {
    pre: (hero) => [
      { speaker: '永夜织梦者', text: '你来了。我在一千万个梦里，都看见了你的脸。' },
      { speaker: '永夜织梦者', text: '规则死了，孩子。只有在梦里，昨日的秩序才依然运转。留下来吧——永远。' },
      { speaker: heroName(hero), text: BOSS_HERO_TAUNTS.boss_dream[hero] },
    ],
    post: (hero) => [
      { speaker: '永夜织梦者', text: '梦……破了。可笑，我竟然……松了一口气……' },
      { text: '巨网寸寸断裂，千万沉睡者的梦如萤火升空。织梦者在光雨中闭上眼，唇边带着解脱的微笑。' },
      { speaker: heroName(hero), text: hero === HeroType.WEAVER ? '睡吧，师姐。这次是真正的安眠。' : '醒来的人们，会记得这场梦的。' },
    ],
  },
  boss_echo: {
    pre: (hero) => [
      { speaker: '回响歌姬', text: '♪——欢迎，来到倒悬之地。在这里，强者跪下，弱者加冕。' },
      { speaker: '回响歌姬', text: '规则崩坏的那晚，我终于听清了世界的真相：正着唱的歌，全是谎言。' },
      { speaker: heroName(hero), text: BOSS_HERO_TAUNTS.boss_echo[hero] },
    ],
    post: (hero) => [
      { speaker: '回响歌姬', text: '这个音……好熟悉。是正调……原来，正调也可以这么温柔……' },
      { text: '圣所缓缓翻转归位，钟声第一次向下沉落。歌姬的身影化作一段清澈的音阶，消散在光里。' },
      { speaker: heroName(hero), text: hero === HeroType.SINGER ? '师姐的最后一课：如何优雅地谢幕。' : '钟声归位。前路已开。' },
    ],
  },
  boss_tyrant: {
    pre: (hero) => [
      { speaker: '深渊暴君', text: '又一个来抢魔典的。千年了，你们这些"救世主"，一个都没走到这扇门后。' },
      { speaker: '深渊暴君', text: '我曾是第一代审判官。我比谁都清楚——碰过魔典的手，没有一只是干净的。包括你的。' },
      { speaker: heroName(hero), text: BOSS_HERO_TAUNTS.boss_tyrant[hero] },
    ],
    post: (hero) => [
      { speaker: '深渊暴君', text: '锁链……断了？千年来，第一次……有人赢得堂堂正正。' },
      { speaker: '深渊暴君', text: '去吧。门后的东西会给你一个"提议"。记住——无论它开出什么价，都先看清合同。' },
      { speaker: heroName(hero), text: hero === HeroType.INQUISITOR ? '前辈的判决，我收下了。' : '最后一道门。就在前面。' },
    ],
  },
  boss_codex: {
    pre: (hero) => [
      { speaker: '缚典者 · 空白之主', text: '（空白的书页无风自动，一个没有声带的声音直接在你颅内响起）' },
      { speaker: '缚典者 · 空白之主', text: '我撕碎自己，是为了看清：没有规则的世界，和有规则的世界，哪个更配得上存在。' },
      { speaker: '缚典者 · 空白之主', text: '答案令我失望。那么最后的测试——由你，来写下结论。' },
      { speaker: heroName(hero), text: BOSS_HERO_TAUNTS.boss_codex[hero] },
    ],
    post: () => [
      { text: '空白之主的形体如墨般溃散。漫天的法案残页停止了燃烧，静静悬浮在裂隙上空。' },
      { speaker: '缚典者 · 空白之主', text: '……原来如此。这，就是你的答案。' },
    ],
  },
};

// ═══════════════════════════════════════════════════════════
//  契约之门
// ═══════════════════════════════════════════════════════════

export const PACT_GATE = {
  title: '契约之门',
  description: [
    '深渊暴君身后，矗立着一扇由法案残页拼成的巨门。门上浮现出一份暗影契约，墨迹如活物般蠕动。',
    '「签下名字，」魔典的声音响起，「我将借你全部之力，助你终结这一切——而你，将成为新的我。」',
  ],
  choices: {
    SIGN: {
      label: '签订契约',
      hint: '获得魔典之力（最终战开局 +30 分），但代价未知……',
    },
    REFUSE: {
      label: '撕毁契约',
      hint: '拒绝一切交易。魔典将倾尽全力阻止你（最终 Boss 强化）。',
    },
    REWRITE: {
      label: '以残页重写契约',
      hint: '以集齐的 3 张法案残页为凭，亲手改写契约的条款。',
    },
  },
} as const;

// ═══════════════════════════════════════════════════════════
//  结局（3 结局 × 4 英雄专属尾声）
// ═══════════════════════════════════════════════════════════

interface IEnding {
  title: string;
  common: IStoryLine[];
  heroEpilogue: Record<HeroType, string>;
}

const ENDINGS: Record<EndingId, IEnding> = {
  NEW_MASTER: {
    title: '结局 · 魔典的新主',
    common: [
      { text: '契约生效了。魔典的力量涌入你的身体——然后，你听见书页翻动的声音，从你自己的胸腔里传来。' },
      { text: '「谢谢你，」旧的魔典微笑着消散，「现在轮到你，坐进这个装订线里了。」' },
      { text: '深渊重归平静。规则恢复了，世界得救了。只是从此以后，深渊最底层的裂隙里，漂浮着一本新的书。' },
    ],
    heroEpilogue: {
      [HeroType.PHANTOM]: '黑市里流传着一个新传说：世上最伟大的怪盗，最后偷到了自己——连本带利，永不赎回。',
      [HeroType.WEAVER]: '织机还在转动，只是再没有人坐在它前面。所有命运之线的尽头，都系在深渊里那本书的书脊上。',
      [HeroType.INQUISITOR]: '天平的两端，一端是世界，一端是他自己。他判了自己终身监禁——而世界，无罪释放。',
      [HeroType.SINGER]: '有人说，深夜靠近裂隙时，能听见书页里传出微弱的歌声。那首歌很美，美得让人不敢再听第二遍。',
    },
  },
  BURNER: {
    title: '结局 · 焚典者',
    common: [
      { text: '你点燃了魔典。空白的书页在火焰中蜷曲、变黑、化为飞灰。没有惨叫，只有一声几不可闻的叹息——像是感谢。' },
      { text: '规则没有恢复。但世界并没有毁灭——人们开始自己书写规矩：一条街一条街地谈，一个市场一个市场地定。' },
      { text: '混乱吗？混乱。但这是活人的混乱，好过死书的秩序。' },
    ],
    heroEpilogue: {
      [HeroType.PHANTOM]: '黑市重开那天，他坐在最高的屋顶上喝酒。没有规则的生意不好做——但他这辈子，最擅长的就是没规矩。',
      [HeroType.WEAVER]: '她重新坐回织机前，把烧剩的灰烬纺进了新线里。这一次，命运之线的颜色，由每个人自己挑。',
      [HeroType.INQUISITOR]: '他把天平熔了，铸成了一口钟。从此审判不再由一人独断——钟声响起时，所有人都要到场。',
      [HeroType.SINGER]: '终焉之歌没有了终止符。她把最后一小节改成了反复记号——这首歌，人们想唱多久，就唱多久。',
    },
  },
  STITCHER: {
    title: '结局 · 缝合者',
    common: [
      { text: '你取出三张法案残页，以自己的方式，一针一线地缝合魔典。这一次，条款由你来写。' },
      { text: '新的魔典苏醒了。它不再高踞于万物之上，而是化作千万份副本，落入每一个愿意翻开它的人手中。' },
      { text: '深渊的裂隙缓缓闭合。最后一缕光里，你听见十二篇法案齐声翻动——那声音，像掌声。' },
    ],
    heroEpilogue: {
      [HeroType.PHANTOM]: '新魔典的第一页写着怪盗的座右铭：「万物皆可交易，唯诚信千金不换。」黑市从此有了它唯一的铁律。',
      [HeroType.WEAVER]: '新魔典的扉页织着一根金线，任何人翻开时，都能看见自己命运的下一针该落在哪里——但只有自己能下针。',
      [HeroType.INQUISITOR]: '新魔典的封底铸着一座小小的天平。它不再称量罪恶，只提醒每个读者：你写下的每条规矩，自己要第一个遵守。',
      [HeroType.SINGER]: '新魔典合上时会哼出一小段旋律，每个人听到的都不一样。据说那是终焉之歌的新版本——名字叫《序曲》。',
    },
  },
};

// ═══════════════════════════════════════════════════════════
//  取用函数
// ═══════════════════════════════════════════════════════════

export function getPrologue(hero: HeroType): IPendingStory {
  return {
    title: '序章 · 裂隙之口',
    lines: PROLOGUES[hero],
    next: 'MAP',
  };
}

export function getChapterIntro(
  key: 'c1' | 'c2a' | 'c2b' | 'c3',
  hero: HeroType,
  next: RunPhase,
): IPendingStory {
  const intro = CHAPTER_INTROS[key];
  return {
    title: intro.title,
    lines: [
      ...intro.lines,
      { speaker: heroName(hero), text: CHAPTER_HERO_LINES[key][hero] },
    ],
    next,
  };
}

export function getBossPreDialogue(bossId: string, hero: HeroType): IPendingStory | null {
  const d = BOSS_DIALOGUES[bossId];
  if (!d) return null;
  return { title: '', lines: d.pre(hero), next: 'BATTLE' };
}

export function getBossPostDialogue(bossId: string, hero: HeroType, next: RunPhase): IPendingStory | null {
  const d = BOSS_DIALOGUES[bossId];
  if (!d) return null;
  return { title: '', lines: d.post(hero), next };
}

export function getEnding(endingId: EndingId, hero: HeroType): IPendingStory {
  const e = ENDINGS[endingId];
  return {
    title: e.title,
    lines: [
      ...e.common,
      { text: e.heroEpilogue[hero] },
    ],
    next: 'VICTORY',
  };
}

export function getEndingTitle(endingId: EndingId): string {
  return ENDINGS[endingId].title;
}
