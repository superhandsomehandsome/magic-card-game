/**
 * 专项平衡性测试脚本 — Node.js 直接运行
 *
 * 测试目标：
 *   1. turnNumber=19 时牌库剩余张数分布
 *   2. 至高法案出现后（第9轮，即turn≈17-18起）1-2回合内是否触发对撞
 *   3. 得分胜 vs 对撞胜 概率
 *
 * 运行: node sim_balance_test.js
 */

// ─── 游戏参数 ───────────────────────────────────────────────
const C = {
  WIN_SCORE:            220,
  TOTAL_CARDS:          78,
  INITIAL_HAND:         5,    // 初始手牌每人
  MARKET_SIZE:          3,    // 初始黑市占用
  DRAW_PER_TURN:        2,    // 每回合主动抽
  AMBUSH_DRAW_WIN:      1,    // 突袭胜利方奖励抽
  MARKET_REFILL:        1,    // 每次购买黑市后补充1张
  MARKET_BUY_PROB:      0.35, // 每回合购买黑市的概率
  AMBUSH_PROB:          0.60, // 每回合发起突袭的概率
  AMBUSH_WIN_PROB:      0.50, // 突袭胜率（简化）
  HAND_LIMIT:           8,
  COLLISION_GRACE_TURNS: 2,   // 至高法案保护期
  DECREE_SUPREME_ROUND: 9,    // 至高法案出现的"轮"（1轮=2回合）
  // DECREE_SUPREME_ROUND=9 => 大约 turn = 9*2 - 1 = 17 左右开始保护期
  BOUNTY_MULTIPLIER:    3,
  BOUNTY_CAP:           15,
  EARLY_COMBO_THRESHOLD: 3,
  EARLY_COMBO_PENALTY:  0.5,
  CHANT_DECAY:          0.7,
  CHANT_FULL_POWER_TURN: 5,
  BLUFF_PENALTY:        15,
  A_WIN_BONUS:          20,
  B_WIN_BONUS:          10,
};

// 卡牌分值分布（rank->score），用于手牌价值估算
const RANK_SCORES = [6, 5, 4, 3, 2, 1, 0]; // A=0, B=1, C=2, D=3, E=4, F=5, FLASH=6
const DECK_DIST   = [5, 7, 10, 14, 17, 19, 6]; // 各rank数量

function createDeck() {
  const deck = [];
  for (let r = 0; r < 7; r++) {
    for (let n = 0; n < DECK_DIST[r]; n++) {
      deck.push({ rank: r, score: RANK_SCORES[r] });
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function drawN(deck, n) {
  const drawn = [];
  for (let i = 0; i < n && deck.length > 0; i++) {
    drawn.push(deck.pop());
  }
  return drawn;
}

function simulateChant(hand, turn) {
  // 简化咏唱：统计手牌中的对子/三条
  const counts = {};
  hand.forEach(c => { if (c.score > 0) counts[c.rank] = (counts[c.rank] || 0) + 1; });
  let score = 0;
  for (const r in counts) {
    const cnt = counts[r];
    const eff = RANK_SCORES[r];
    if (cnt >= 3 && Math.random() > 0.5)      { score += eff * 3 * 2; break; }
    else if (cnt >= 2 && Math.random() > 0.55) { score += eff * 2; break; }
  }
  if (turn <= C.EARLY_COMBO_THRESHOLD)       score = Math.floor(score * C.EARLY_COMBO_PENALTY);
  else if (turn < C.CHANT_FULL_POWER_TURN)   score = Math.floor(score * C.CHANT_DECAY);
  return score;
}

function simulateGame() {
  const deck = createDeck();

  // 初始消耗：每人5张手牌 + 3张黑市
  const p1 = { score: 0, hand: drawN(deck, C.INITIAL_HAND) };
  const p2 = { score: 0, hand: drawN(deck, C.INITIAL_HAND) };
  drawN(deck, C.MARKET_SIZE); // 黑市初始占位

  let turn = 0;
  let graceTurnsLeft = 0;    // 至高法案保护期剩余
  let supremeActivated = false;
  let supremeActivatedTurn = -1;

  // 统计用
  const deckAtTurn19 = { recorded: false, value: -1 };
  let endReason = 'TIMEOUT';
  let endTurn = 0;
  let isCollision = false;
  let collisionAfterSupremeTurns = -1;

  while (turn < 60) {
    turn++;
    // 计算当前"轮"（每2个turn为1轮）
    const currentRound = Math.ceil(turn / 2);

    // 至高法案激活（第DECREE_SUPREME_ROUND轮开始时）
    if (!supremeActivated && currentRound >= C.DECREE_SUPREME_ROUND) {
      supremeActivated = true;
      supremeActivatedTurn = turn;
      graceTurnsLeft = C.COLLISION_GRACE_TURNS;
    }
    if (graceTurnsLeft > 0) graceTurnsLeft--;

    const atk = turn % 2 === 1 ? p1 : p2;
    const def = turn % 2 === 1 ? p2 : p1;

    // 阶段1：抽牌
    atk.hand.push(...drawN(deck, C.DRAW_PER_TURN));

    // 记录第19回合牌库
    if (turn === 19 && !deckAtTurn19.recorded) {
      deckAtTurn19.recorded = true;
      deckAtTurn19.value = deck.length;
    }

    // 黑市购买（有概率补充牌库消耗）
    if (Math.random() < C.MARKET_BUY_PROB && deck.length > 0) {
      drawN(deck, C.MARKET_REFILL); // 购买后黑市补充1张
    }

    // 牌库耗尽检查（保护期内不触发对撞）
    if (deck.length === 0 && graceTurnsLeft <= 0) {
      isCollision = true;
      endTurn = turn;
      endReason = 'COLLISION';
      if (supremeActivated) {
        collisionAfterSupremeTurns = turn - supremeActivatedTurn;
      }
      break;
    }

    // 阶段2：突袭（简化）
    if (atk.hand.length > 0 && Math.random() < C.AMBUSH_PROB) {
      if (Math.random() < C.AMBUSH_WIN_PROB) {
        // 突袭胜：抽1张
        atk.hand.push(...drawN(deck, C.AMBUSH_DRAW_WIN));
        atk.score += 15; // 平均悬赏
      } else {
        // 突袭败：防守方得分
        def.score += 12;
        def.hand.push(...drawN(deck, C.AMBUSH_DRAW_WIN));
      }
    }

    // 阶段3：咏唱
    const chant = simulateChant(atk.hand, turn);
    atk.score += chant;

    // 过牌奖励(咏唱后抽1张 — GameEngine: "咏唱过牌奖励：1 张")
    atk.hand.push(...drawN(deck, 1));

    // 手牌上限
    while (atk.hand.length > C.HAND_LIMIT) atk.hand.pop();
    while (def.hand.length > C.HAND_LIMIT) def.hand.pop();

    // 胜负检查
    if (atk.score >= C.WIN_SCORE) {
      endTurn = turn; endReason = 'SCORE'; break;
    }
    if (def.score >= C.WIN_SCORE) {
      endTurn = turn; endReason = 'SCORE_DEF'; break;
    }
  }

  if (!deckAtTurn19.recorded) {
    // 游戏在19回合前就结束了
    deckAtTurn19.value = deck.length; // 可能为0或已结束
  }

  return {
    endTurn,
    endReason,
    isCollision,
    supremeActivatedTurn,
    collisionAfterSupremeTurns,
    deckAtTurn19: deckAtTurn19.value,
    gameEndedBeforeTurn19: endTurn > 0 && endTurn < 19,
  };
}

// ─── 主模拟 ──────────────────────────────────────────────────
const N = 50000;
console.log(`\n运行 ${N} 局模拟...\n`);

const stats = {
  total: N,
  // 终局类型
  scoreWin:     0,
  collisionWin: 0,
  timeout:      0,

  // 第19回合牌库
  deckAtTurn19Sum:   0,
  deckAtTurn19Count: 0,
  deckAtTurn19Hist:  {}, // {value: count}
  gameEndedBefore19: 0,

  // 结束回合分布
  endTurnHist: {},
  endTurnSum: 0,

  // 至高法案后对撞时机
  supremeActivated: 0,
  collisionAfterSupreme: 0,
  collisionTurnsAfterSupreme: [], // 间隔回合数列表
};

for (let i = 0; i < N; i++) {
  const r = simulateGame();

  if (r.endReason === 'SCORE' || r.endReason === 'SCORE_DEF') stats.scoreWin++;
  else if (r.isCollision) stats.collisionWin++;
  else stats.timeout++;

  stats.endTurnSum += r.endTurn;
  stats.endTurnHist[r.endTurn] = (stats.endTurnHist[r.endTurn] || 0) + 1;

  if (!r.gameEndedBeforeTurn19) {
    stats.deckAtTurn19Sum += r.deckAtTurn19;
    stats.deckAtTurn19Count++;
    const k = Math.floor(r.deckAtTurn19 / 5) * 5; // 5为一组
    stats.deckAtTurn19Hist[k] = (stats.deckAtTurn19Hist[k] || 0) + 1;
  } else {
    stats.gameEndedBefore19++;
  }

  if (r.supremeActivatedTurn > 0) {
    stats.supremeActivated++;
    if (r.isCollision && r.collisionAfterSupremeTurns >= 0) {
      stats.collisionAfterSupreme++;
      stats.collisionTurnsAfterSupreme.push(r.collisionAfterSupremeTurns);
    }
  }
}

// ─── 输出结果 ────────────────────────────────────────────────
const pct = v => (v / N * 100).toFixed(1) + '%';

console.log('═══════════════════════════════════════════════════════');
console.log('   秘术对决 — 专项平衡测试报告');
console.log(`   参数：牌库78张 | 每回合抽2 | 胜利分220 | 保护期${C.COLLISION_GRACE_TURNS}`);
console.log('═══════════════════════════════════════════════════════\n');

console.log('【1】 终局类型分布');
console.log(`  得分胜利 (SCORE):    ${stats.scoreWin.toLocaleString().padStart(7)} 局  ${pct(stats.scoreWin)}`);
console.log(`  对撞胜利 (COLLISION):${stats.collisionWin.toLocaleString().padStart(7)} 局  ${pct(stats.collisionWin)}`);
console.log(`  超时终局 (TIMEOUT):  ${stats.timeout.toLocaleString().padStart(7)} 局  ${pct(stats.timeout)}`);

console.log('\n【2】 第19回合 牌库剩余张数');
if (stats.gameEndedBefore19 > 0) {
  console.log(`  注：${pct(stats.gameEndedBefore19)} 的对局在第19回合前结束（不计入均值）`);
}
if (stats.deckAtTurn19Count > 0) {
  const avg = (stats.deckAtTurn19Sum / stats.deckAtTurn19Count).toFixed(1);
  console.log(`  平均剩余：${avg} 张  (有效样本 ${stats.deckAtTurn19Count.toLocaleString()} 局)`);
  console.log('  分布（以5张为组）：');
  const sorted = Object.keys(stats.deckAtTurn19Hist).map(Number).sort((a,b)=>a-b);
  for (const k of sorted) {
    const cnt = stats.deckAtTurn19Hist[k];
    const pctV = (cnt / stats.deckAtTurn19Count * 100).toFixed(1);
    const bar = '▓'.repeat(Math.round(cnt / stats.deckAtTurn19Count * 40));
    console.log(`    ${String(k).padStart(3)}~${String(k+4).padEnd(3)}: ${bar} ${pctV}%`);
  }
} else {
  console.log('  所有对局均在第19回合前结束！');
}

console.log(`\n【2.5】 游戏结束回合分布（平均 ${(stats.endTurnSum/N).toFixed(1)} 回合）`);
const sortedTurns = Object.keys(stats.endTurnHist).map(Number).sort((a,b)=>a-b);
let cumPct = 0;
for (const t of sortedTurns) {
  const cnt = stats.endTurnHist[t];
  const p = cnt / N * 100;
  cumPct += p;
  const bar = '▓'.repeat(Math.round(p * 1.5));
  // 标注至高法案大约出现的时机（第9轮=约turn17/18）
  const tag = (t === 17 || t === 18) ? ' ← ≈至高法案激活时机' : '';
  console.log(`  Turn ${String(t).padStart(2)}: ${bar} ${p.toFixed(1)}%  (累计 ${cumPct.toFixed(1)}%)${tag}`);
}

console.log('\n【3】 至高法案出现后对撞情况');
console.log(`  至高法案触发比例：${pct(stats.supremeActivated)} (${stats.supremeActivated.toLocaleString()}局)`);
if (stats.supremeActivated > 0) {
  console.log(`  触发后最终进入对撞：${pct(stats.collisionAfterSupreme)} (${stats.collisionAfterSupreme.toLocaleString()}局)`);
  if (stats.collisionTurnsAfterSupreme.length > 0) {
    const arr = stats.collisionTurnsAfterSupreme;
    const avg = (arr.reduce((s,v)=>s+v,0) / arr.length).toFixed(1);
    const within2 = arr.filter(v => v <= 2).length;
    const within4 = arr.filter(v => v <= 4).length;
    const within6 = arr.filter(v => v <= 6).length;
    console.log(`  至高法案→对撞 平均间隔：${avg} 回合`);
    console.log(`  ≤2 回合内对撞：${(within2/arr.length*100).toFixed(1)}%  ← 保护期内冲突风险`);
    console.log(`  ≤4 回合内对撞：${(within4/arr.length*100).toFixed(1)}%`);
    console.log(`  ≤6 回合内对撞：${(within6/arr.length*100).toFixed(1)}%`);

    // 分布直方图
    const hist = {};
    arr.forEach(v => { hist[v] = (hist[v]||0)+1; });
    console.log('  间隔分布（回合数）：');
    Object.keys(hist).map(Number).sort((a,b)=>a-b).slice(0,15).forEach(k => {
      const cnt = hist[k];
      const pctV = (cnt/arr.length*100).toFixed(1);
      const bar = '▓'.repeat(Math.round(cnt/arr.length*50));
      console.log(`    +${String(k).padEnd(2)} 回合: ${bar} ${pctV}%`);
    });
  }
}

console.log('\n═══════════════════════════════════════════════════════');
console.log('  ⚡ 理论牌库推算（无随机消耗）');
const initialDraw = C.INITIAL_HAND * 2 + C.MARKET_SIZE; // 5+5+3=13
const deckAt19_theory = C.TOTAL_CARDS - initialDraw - 19 * C.DRAW_PER_TURN - 19 * 2; // 每回合还有咏唱过牌2张
console.log(`  初始占用: ${initialDraw}张 (双方手牌各5 + 黑市3)`);
console.log(`  第19回合前抽牌消耗: 19回合 × ${C.DRAW_PER_TURN}(主抽) = ${19 * C.DRAW_PER_TURN}张`);
  console.log(`  第19回合前咏唱过牌: 19回合 × 1(过牌奖励) = ${19 * 1}张`);
  const theory = C.TOTAL_CARDS - initialDraw - 19*C.DRAW_PER_TURN - 19*1;
  console.log(`  理论最少剩余: ${C.TOTAL_CARDS} - ${initialDraw} - ${19*C.DRAW_PER_TURN} - ${19*1} = ${theory}张（含突袭和黑市消耗将更少）`);
console.log('═══════════════════════════════════════════════════════\n');
