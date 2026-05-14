/**
 * 平衡性模拟脚本 — 模拟新流程（咏唱→突袭→封锁）下的游戏进行
 * 用纯随机 AI 策略跑大量对局，统计关键指标
 * 
 * 运行：npx tsx frontend/src/scripts/balanceSim.ts
 */

const NUM_GAMES = 5000;

// ========== 内联常量 ==========
const DECK_COMPOSITION: Record<number, number> = {
  6: 5,   // A
  5: 7,   // B
  4: 10,  // C
  3: 14,  // D
  2: 17,  // E
  1: 19,  // F
  0: 6,   // FLASH
};
const TOTAL_CARDS = 78;
const WIN_SCORE = 220;
const MARKET_SIZE = 3;
const DRAW_PER_TURN = 2;
const BOUNTY_MULTIPLIER = 3;
const BOUNTY_CAP = 15;
const BOUNTY_POOL_MAX = 60;
const HAND_LIMIT = 8;
const RESERVOIR_SKIP_RATIO = 0.55;
const RESERVOIR_LOSE_RATIO = 0.35;
const RESERVOIR_DEFEND_WIN_BOUNTY_RATIO = 0.45;
const BOUNTY_TIE_SPLIT_RATIO = 0.25;
const EARLY_COMBO_TURN_THRESHOLD = 3;
const EARLY_COMBO_PENALTY = 0.5;
const CHANT_SCORE_DECAY = 0.7;
const CHANT_FULL_POWER_TURN = 5;
const DECREE_TRIGGER_ROUNDS = [1, 4, 7];
const DECREE_SUPREME_ROUND = 9;
const FOLD_BOUNTY_BONUS_MULT = 1.5;
const MAX_TURN_LIMIT = 50;

interface Card {
  rank: number;
  baseScore: number;
}

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const [rankStr, count] of Object.entries(DECK_COMPOSITION)) {
    const rank = Number(rankStr);
    for (let i = 0; i < count; i++) {
      deck.push({ rank, baseScore: rank === 0 ? 5 : rank });
    }
  }
  return deck;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function compareCards(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  if (a === 1 && b === 6) return 1;  // F beats A
  if (b === 1 && a === 6) return -1;
  return a - b;
}

interface Player {
  score: number;
  hand: Card[];
  blockadeRank: number | null;
}

// Detect best combo from hand (simplified)
function detectBestCombo(hand: Card[]): { cards: Card[]; score: number } | null {
  const nonFlash = hand.filter(c => c.rank !== 0);
  if (nonFlash.length < 2) return null;

  const rankCounts = new Map<number, Card[]>();
  for (const c of nonFlash) {
    if (!rankCounts.has(c.rank)) rankCounts.set(c.rank, []);
    rankCounts.get(c.rank)!.push(c);
  }

  // Check for pairs, trips, quads
  let bestCombo: { cards: Card[]; score: number } | null = null;

  // Grand straight (A-B-C-D-E-F, ranks 6-5-4-3-2-1)
  const ranks = new Set(nonFlash.map(c => c.rank));
  if ([1, 2, 3, 4, 5, 6].every(r => ranks.has(r))) {
    const cards = [1, 2, 3, 4, 5, 6].map(r => rankCounts.get(r)![0]);
    const score = cards.reduce((s, c) => s + c.baseScore, 0) * 4;
    bestCombo = { cards, score };
  }

  // Four of a kind
  if (!bestCombo) {
    for (const [, cards] of rankCounts) {
      if (cards.length >= 4) {
        const picked = cards.slice(0, 4);
        const score = picked.reduce((s, c) => s + c.baseScore, 0) * 3;
        if (!bestCombo || score > bestCombo.score) bestCombo = { cards: picked, score };
      }
    }
  }

  // Full house
  if (!bestCombo) {
    const trips = [...rankCounts.entries()].filter(([, c]) => c.length >= 3);
    const pairs = [...rankCounts.entries()].filter(([, c]) => c.length >= 2);
    for (const [tr, tc] of trips) {
      for (const [pr, pc] of pairs) {
        if (tr === pr) continue;
        const cards = [...tc.slice(0, 3), ...pc.slice(0, 2)];
        const score = cards.reduce((s, c) => s + c.baseScore, 0) * 2.5;
        if (!bestCombo || score > bestCombo.score) bestCombo = { cards, score: Math.floor(score) };
      }
    }
  }

  // Three of a kind
  if (!bestCombo) {
    for (const [, cards] of rankCounts) {
      if (cards.length >= 3) {
        const picked = cards.slice(0, 3);
        const score = picked.reduce((s, c) => s + c.baseScore, 0) * 2;
        if (!bestCombo || score > bestCombo.score) bestCombo = { cards: picked, score };
      }
    }
  }

  // Small straight (4+ consecutive)
  if (!bestCombo) {
    const sorted = [...ranks].sort((a, b) => a - b);
    for (let start = 0; start <= sorted.length - 4; start++) {
      let run = 1;
      for (let i = start + 1; i < sorted.length && sorted[i] === sorted[i - 1] + 1; i++) run++;
      if (run >= 4) {
        const runRanks = sorted.slice(start, start + run);
        const cards = runRanks.map(r => rankCounts.get(r)![0]);
        const score = cards.reduce((s, c) => s + c.baseScore, 0) * 1.5;
        if (!bestCombo || score > bestCombo.score) bestCombo = { cards, score: Math.floor(score) };
      }
    }
  }

  // Pair
  if (!bestCombo) {
    for (const [, cards] of rankCounts) {
      if (cards.length >= 2) {
        const picked = cards.slice(0, 2);
        const score = picked.reduce((s, c) => s + c.baseScore, 0);
        if (!bestCombo || score > bestCombo.score) bestCombo = { cards: picked, score };
      }
    }
  }

  return bestCombo;
}

function applyChantDecay(score: number, turnNumber: number): number {
  if (turnNumber <= EARLY_COMBO_TURN_THRESHOLD) return Math.floor(score * EARLY_COMBO_PENALTY);
  if (turnNumber < CHANT_FULL_POWER_TURN) return Math.floor(score * CHANT_SCORE_DECAY);
  return score;
}

interface GameResult {
  endReason: 'score_win' | 'collision' | 'turn_limit';
  turns: number;
  deckRemaining: number;
  p1Score: number;
  p2Score: number;
  supremeTriggered: boolean;
  deckAtTurn19: number | null;
  reservoirSettlements: { win: number; lose: number; skip: number; tie: number };
}

function simulateGame(): GameResult {
  let deck = shuffle(createDeck());
  const draw = (n: number): Card[] => {
    const cards: Card[] = [];
    for (let i = 0; i < n && deck.length > 0; i++) cards.push(deck.pop()!);
    return cards;
  };

  const players: [Player, Player] = [
    { score: 0, hand: draw(5), blockadeRank: null },
    { score: 0, hand: draw(5), blockadeRank: null },
  ];
  const market = draw(MARKET_SIZE);

  let bountyPool = 0;
  let turnNumber = 1;
  let currentPlayer = 0;
  let supremeTriggered = false;
  let deckAtTurn19: number | null = null;
  let gracePeriod = 0;
  const decreeRoundsTriggered: number[] = [];
  const settlements = { win: 0, lose: 0, skip: 0, tie: 0 };

  while (turnNumber <= MAX_TURN_LIMIT) {
    if (turnNumber === 19) deckAtTurn19 = deck.length;

    const p = players[currentPlayer];
    const opp = players[1 - currentPlayer];

    // --- Check decree trigger ---
    const round = Math.ceil(turnNumber / 2);
    if ([...DECREE_TRIGGER_ROUNDS, DECREE_SUPREME_ROUND].includes(round) && !decreeRoundsTriggered.includes(round)) {
      decreeRoundsTriggered.push(round);
      if (round === DECREE_SUPREME_ROUND) {
        supremeTriggered = true;
        gracePeriod = 2;
      }
    }

    // --- Phase 0: BOUNTY_ROLL ---
    const roll = Math.floor(Math.random() * 6) + 1;
    let bountyAdd = Math.min(roll * BOUNTY_MULTIPLIER, BOUNTY_CAP);
    bountyAdd = Math.min(bountyAdd, BOUNTY_POOL_MAX - bountyPool);
    bountyPool += bountyAdd;

    // --- Phase 1: DRAW_MARKET ---
    const drawn = draw(DRAW_PER_TURN);
    p.hand.push(...drawn);

    // Simple market buy (50% chance)
    if (Math.random() > 0.5 && market.length > 0 && p.hand.length > 1) {
      const mIdx = Math.floor(Math.random() * market.length);
      const mCard = market[mIdx];
      const payable = p.hand.filter(c => c.baseScore >= mCard.baseScore);
      if (payable.length > 0) {
        const payIdx = p.hand.indexOf(payable[0]);
        p.hand.splice(payIdx, 1);
        market.splice(mIdx, 1);
        p.hand.push(mCard);
        const refill = draw(1);
        market.push(...refill);
      }
    }

    // --- Phase 2: CHANT_SCORE ---
    let reservoir = 0;
    const combo = detectBestCombo(p.hand);
    if (combo) {
      const decayed = applyChantDecay(combo.score, turnNumber);
      let penalty = 0;
      if (opp.blockadeRank !== null) {
        penalty = combo.cards.filter(c => c.rank === opp.blockadeRank).reduce((s, c) => s + c.baseScore * 3, 0);
      }
      const chantScore = Math.max(0, decayed - penalty);
      reservoir = chantScore;
      for (const card of combo.cards) {
        const idx = p.hand.indexOf(card);
        if (idx >= 0) p.hand.splice(idx, 1);
      }
      const reward = draw(1);
      p.hand.push(...reward);
    }

    // --- Phase 3: AMBUSH ---
    const nonFlashCards = p.hand.filter(c => c.rank !== 0);
    const doAmbush = nonFlashCards.length > 0 && (reservoir > 0 || bountyPool > 0) && Math.random() > 0.3;

    if (doAmbush) {
      const atkCard = nonFlashCards[Math.floor(Math.random() * nonFlashCards.length)];
      const atkIdx = p.hand.indexOf(atkCard);
      p.hand.splice(atkIdx, 1);

      const oppNonFlash = opp.hand.filter(c => c.rank !== 0);

      // Defender decides: fold(30%), defend(70%)
      if (oppNonFlash.length === 0 || Math.random() < 0.3) {
        // FOLD
        const total = reservoir + bountyPool;
        p.score += total;
        reservoir = 0;
        bountyPool = 0;
        p.hand.push(atkCard);
        if (opp.hand.length > 0) {
          const stealIdx = Math.floor(Math.random() * opp.hand.length);
          p.hand.push(opp.hand.splice(stealIdx, 1)[0]);
        }
        settlements.win++;
      } else {
        // DEFEND
        const defCard = oppNonFlash[Math.floor(Math.random() * oppNonFlash.length)];
        const defIdx = opp.hand.indexOf(defCard);
        opp.hand.splice(defIdx, 1);

        const result = compareCards(atkCard.rank, defCard.rank);

        if (result > 0) {
          // Attacker wins
          const total = reservoir + bountyPool;
          p.score += total;
          reservoir = 0;
          bountyPool = 0;
          const drawn2 = draw(1);
          p.hand.push(...drawn2);
          if (opp.hand.length > 0) {
            const stealIdx = Math.floor(Math.random() * opp.hand.length);
            p.hand.push(opp.hand.splice(stealIdx, 1)[0]);
          }
          opp.cursedNextChant = true;
          settlements.win++;
        } else if (result < 0) {
          // Defender wins (attacker loses)
          const chantKeep = Math.floor(reservoir * RESERVOIR_LOSE_RATIO);
          const defBounty = Math.floor(bountyPool * RESERVOIR_DEFEND_WIN_BOUNTY_RATIO);
          p.score += chantKeep;
          opp.score += defBounty;
          reservoir = 0;
          bountyPool = 0;
          const drawn2 = draw(1);
          opp.hand.push(...drawn2);
          if (p.hand.length > 0) {
            const stealIdx = Math.floor(Math.random() * p.hand.length);
            opp.hand.push(p.hand.splice(stealIdx, 1)[0]);
          }
          settlements.lose++;
        } else {
          // Tie
          const keepChant = Math.floor(reservoir * RESERVOIR_SKIP_RATIO);
          p.score += keepChant;
          reservoir = 0;
          if (bountyPool > 0) {
            const splitEach = Math.floor(bountyPool * BOUNTY_TIE_SPLIT_RATIO);
            p.score += splitEach;
            opp.score += splitEach;
            bountyPool -= splitEach * 2;
          }
          settlements.tie++;
        }
      }
    } else {
      // SKIP ambush
      if (reservoir > 0) {
        const skipKeep = Math.floor(reservoir * RESERVOIR_SKIP_RATIO);
        p.score += skipKeep;
        reservoir = 0;
        settlements.skip++;
      }
    }

    // Check win
    if (p.score >= WIN_SCORE || opp.score >= WIN_SCORE) {
      return {
        endReason: 'score_win',
        turns: turnNumber,
        deckRemaining: deck.length,
        p1Score: players[0].score,
        p2Score: players[1].score,
        supremeTriggered,
        deckAtTurn19,
        reservoirSettlements: settlements,
      };
    }

    // --- Phase 4: BLOCKADE ---
    const blockableCards = p.hand.filter(c => c.rank !== 0);
    if (blockableCards.length > 0 && Math.random() > 0.4) {
      const bCard = blockableCards[Math.floor(Math.random() * blockableCards.length)];
      const bIdx = p.hand.indexOf(bCard);
      p.hand.splice(bIdx, 1);
      p.blockadeRank = bCard.rank;
    } else {
      p.blockadeRank = null;
    }

    // Discard excess
    while (p.hand.length > HAND_LIMIT) {
      p.hand.splice(Math.floor(Math.random() * p.hand.length), 1);
    }

    // --- endTurn ---
    if (gracePeriod > 0) {
      gracePeriod--;
      if (gracePeriod === 0 && deck.length === 0) {
        return {
          endReason: 'collision',
          turns: turnNumber,
          deckRemaining: 0,
          p1Score: players[0].score,
          p2Score: players[1].score,
          supremeTriggered,
          deckAtTurn19,
          reservoirSettlements: settlements,
        };
      }
    }

    // Check deck empty
    if (deck.length === 0 && gracePeriod === 0) {
      return {
        endReason: 'collision',
        turns: turnNumber,
        deckRemaining: 0,
        p1Score: players[0].score,
        p2Score: players[1].score,
        supremeTriggered,
        deckAtTurn19,
        reservoirSettlements: settlements,
      };
    }

    // Clear opponent blockade (it lasted one turn)
    opp.blockadeRank = null;

    // Switch player
    currentPlayer = 1 - currentPlayer;
    turnNumber++;
  }

  return {
    endReason: 'turn_limit',
    turns: turnNumber,
    deckRemaining: deck.length,
    p1Score: players[0].score,
    p2Score: players[1].score,
    supremeTriggered,
    deckAtTurn19,
    reservoirSettlements: settlements,
  };
}

// Extend Card with optional field for tracking
interface CardWithCurse extends Card {
  cursedNextChant?: boolean;
}

// Add cursedNextChant to Player
declare module './balanceSim' {
  interface Player {
    cursedNextChant?: boolean;
  }
}

// ========== Main ==========

console.log(`\n===== 平衡性模拟 (${NUM_GAMES} 局) =====\n`);

const results: GameResult[] = [];
for (let i = 0; i < NUM_GAMES; i++) {
  results.push(simulateGame());
}

const scoreWins = results.filter(r => r.endReason === 'score_win');
const collisions = results.filter(r => r.endReason === 'collision');
const turnLimits = results.filter(r => r.endReason === 'turn_limit');
const supremeCount = results.filter(r => r.supremeTriggered).length;

const deckAt19 = results.map(r => r.deckAtTurn19).filter((v): v is number => v !== null);
const avgDeckAt19 = deckAt19.length > 0 ? deckAt19.reduce((a, b) => a + b, 0) / deckAt19.length : 0;
const minDeckAt19 = deckAt19.length > 0 ? Math.min(...deckAt19) : 0;
const maxDeckAt19 = deckAt19.length > 0 ? Math.max(...deckAt19) : 0;

const avgTurns = results.reduce((s, r) => s + r.turns, 0) / results.length;
const avgP1Score = results.reduce((s, r) => s + r.p1Score, 0) / results.length;
const avgP2Score = results.reduce((s, r) => s + r.p2Score, 0) / results.length;

const totalSettlements = results.reduce((acc, r) => ({
  win: acc.win + r.reservoirSettlements.win,
  lose: acc.lose + r.reservoirSettlements.lose,
  skip: acc.skip + r.reservoirSettlements.skip,
  tie: acc.tie + r.reservoirSettlements.tie,
}), { win: 0, lose: 0, skip: 0, tie: 0 });
const totalSettCount = totalSettlements.win + totalSettlements.lose + totalSettlements.skip + totalSettlements.tie;

console.log('┌──────────────────────────────────────────────┐');
console.log('│          结局分布                             │');
console.log('├──────────────────────────────────────────────┤');
console.log(`│  得分获胜：${scoreWins.length} 局 (${(scoreWins.length / NUM_GAMES * 100).toFixed(1)}%)`);
console.log(`│  魔力对撞：${collisions.length} 局 (${(collisions.length / NUM_GAMES * 100).toFixed(1)}%)`);
console.log(`│  超时限制：${turnLimits.length} 局 (${(turnLimits.length / NUM_GAMES * 100).toFixed(1)}%)`);
console.log('├──────────────────────────────────────────────┤');
console.log('│          回合数据                             │');
console.log('├──────────────────────────────────────────────┤');
console.log(`│  平均回合数：${avgTurns.toFixed(1)}`);
console.log(`│  平均先手得分：${avgP1Score.toFixed(1)}`);
console.log(`│  平均后手得分：${avgP2Score.toFixed(1)}`);
console.log('├──────────────────────────────────────────────┤');
console.log('│          turnNumber=19 时牌库状态              │');
console.log('├──────────────────────────────────────────────┤');
console.log(`│  样本量：${deckAt19.length} 局到达第19轮`);
console.log(`│  平均剩余牌数：${avgDeckAt19.toFixed(1)} 张`);
console.log(`│  最少：${minDeckAt19} 张 / 最多：${maxDeckAt19} 张`);
console.log('├──────────────────────────────────────────────┤');
console.log('│          至高法案 & 对撞                      │');
console.log('├──────────────────────────────────────────────┤');
console.log(`│  至高法案触发率：${(supremeCount / NUM_GAMES * 100).toFixed(1)}% (${supremeCount}/${NUM_GAMES})`);
console.log(`│  对撞发生率：${(collisions.length / NUM_GAMES * 100).toFixed(1)}%`);
console.log(`│  得分斩杀率：${(scoreWins.length / NUM_GAMES * 100).toFixed(1)}%`);
console.log('├──────────────────────────────────────────────┤');
console.log('│          蓄水池结算分布                        │');
console.log('├──────────────────────────────────────────────┤');
console.log(`│  突袭获胜(全额)：${totalSettlements.win} 次 (${(totalSettlements.win / totalSettCount * 100).toFixed(1)}%)`);
console.log(`│  突袭失败(保底)：${totalSettlements.lose} 次 (${(totalSettlements.lose / totalSettCount * 100).toFixed(1)}%)`);
console.log(`│  跳过突袭(保底)：${totalSettlements.skip} 次 (${(totalSettlements.skip / totalSettCount * 100).toFixed(1)}%)`);
console.log(`│  拼点平局(保底)：${totalSettlements.tie} 次 (${(totalSettlements.tie / totalSettCount * 100).toFixed(1)}%)`);
console.log('└──────────────────────────────────────────────┘');

// Distribution of deck at turn 19
if (deckAt19.length > 0) {
  const buckets = [0, 5, 10, 15, 20, 25, 30, 35, 40];
  console.log('\n  turnNumber=19 牌库分布：');
  for (let i = 0; i < buckets.length; i++) {
    const lo = buckets[i];
    const hi = i < buckets.length - 1 ? buckets[i + 1] : Infinity;
    const count = deckAt19.filter(v => v >= lo && v < hi).length;
    const bar = '█'.repeat(Math.ceil(count / deckAt19.length * 50));
    console.log(`  ${String(lo).padStart(2)}-${hi === Infinity ? '∞' : String(hi).padStart(2)}: ${bar} ${count} (${(count / deckAt19.length * 100).toFixed(1)}%)`);
  }
}

// Score distribution at game end for score wins
if (scoreWins.length > 0) {
  console.log('\n  得分获胜时双方分差分布：');
  const diffs = scoreWins.map(r => Math.abs(r.p1Score - r.p2Score));
  const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const medianDiff = diffs.sort((a, b) => a - b)[Math.floor(diffs.length / 2)];
  console.log(`  平均分差：${avgDiff.toFixed(1)}, 中位数分差：${medianDiff}`);
}

if (collisions.length > 0) {
  const collisionTurns = collisions.map(r => r.turns);
  const avgCollisionTurn = collisionTurns.reduce((a, b) => a + b, 0) / collisionTurns.length;
  console.log(`\n  对撞平均发生回合：${avgCollisionTurn.toFixed(1)}`);
}
