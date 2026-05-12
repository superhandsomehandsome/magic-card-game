/**
 * v2.1 原型 — 简易 AI（随机 + 基础启发式）
 */
import {
  type GameState, type Card, type ConfrontAction, type DefendAction,
  Phase, Rank, PROTO_CONSTANTS as C,
} from './protoTypes';
import {
  gatherKeep, submitConfront, submitDefend, submitChant,
  submitDecreeBid, confirmDecreeBid, buyMarketCard, detectBestCombo,
  skipToConfront, advanceFromDecreeReveal,
} from './protoEngine';

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function aiTurn(gs: GameState): void {
  const me = gs.players[gs.currentPlayerId];
  if (me.id !== 'p2') return;

  switch (gs.phase) {
    case Phase.GATHER:
      aiGather(gs);
      break;
    case Phase.CONFRONT:
      aiConfront(gs);
      break;
    case Phase.CONFRONT_DEFEND:
      aiDefend(gs);
      break;
    case Phase.CHANT:
    case Phase.FINAL_CHANT:
      aiChant(gs);
      break;
    case Phase.DECREE:
      aiDecree(gs);
      break;
    case Phase.DECREE_REVEAL:
      advanceFromDecreeReveal(gs);
      break;
  }
}

function aiGather(gs: GameState) {
  const offers = gs.gatherOffers;
  if (offers.length === 0) return;
  // 选分数最高的 2 张
  const sorted = [...offers].sort((a, b) => b.baseScore - a.baseScore);
  const keepIds = sorted.slice(0, C.DRAW_KEEP_COUNT).map(c => c.id);
  gatherKeep(gs, keepIds);

  // 简单决策：如果有便宜的好牌且分数够，买一张
  const me = gs.players['p2'];
  const affordable = gs.marketCards.filter(c => {
    const price = C.MARKET_PRICE[c.rank] ?? 2;
    return price <= me.score && me.hand.length < C.HAND_LIMIT && c.baseScore >= 4;
  });
  if (affordable.length > 0 && Math.random() > 0.4) {
    const best = affordable.sort((a, b) => b.baseScore - a.baseScore)[0];
    buyMarketCard(gs, best.id);
  }
}

function aiConfront(gs: GameState) {
  const me = gs.players['p2'];
  const hand = me.hand.filter(c => c.rank !== Rank.FLASH);

  // 60% 概率突袭（如果有牌），40% 蓄力
  if (hand.length > 0 && Math.random() < 0.6) {
    // 选一张中等牌突袭
    const sorted = [...hand].sort((a, b) => a.baseScore - b.baseScore);
    const midIdx = Math.floor(sorted.length / 2);
    const action: ConfrontAction = { type: 'AMBUSH', cardId: sorted[midIdx].id };
    submitConfront(gs, action);
  } else {
    // 蓄力，偶尔附带封印
    let sealRank: Rank | undefined;
    let sealCardId: string | undefined;
    if (hand.length > 2 && Math.random() < 0.3) {
      const weakest = hand.sort((a, b) => a.baseScore - b.baseScore)[0];
      sealRank = pick([Rank.A, Rank.B, Rank.C]) as Rank;
      sealCardId = weakest.id;
    }
    const action: ConfrontAction = { type: 'CHARGE', sealRank, sealCardId };
    submitConfront(gs, action);
  }
}

function aiDefend(gs: GameState) {
  const me = gs.players['p2'];
  const hand = me.hand.filter(c => c.rank !== Rank.FLASH);

  // 有好牌就迎战，否则怯战
  if (hand.length > 0) {
    const best = hand.sort((a, b) => b.baseScore - a.baseScore)[0];
    if (best.baseScore >= 3 || Math.random() < 0.5) {
      const action: DefendAction = { type: 'FIGHT', cardId: best.id };
      submitDefend(gs, action);
      return;
    }
  }
  submitDefend(gs, { type: 'FOLD' });
}

function aiChant(gs: GameState) {
  const me = gs.players['p2'];
  const hand = me.hand.filter(c => c.rank !== Rank.FLASH);

  if (hand.length === 0) {
    submitChant(gs, []);
    return;
  }

  // 尝试找最佳组合
  const best = detectBestCombo(hand, me.sealedRank);
  if (best && best.totalScore >= 8) {
    submitChant(gs, best.cards.map(c => c.id));
  } else if (hand.length >= 2) {
    // 随便出两张最大的
    const sorted = [...hand].sort((a, b) => b.baseScore - a.baseScore);
    submitChant(gs, sorted.slice(0, 2).map(c => c.id));
  } else {
    submitChant(gs, [hand[0].id]);
  }
}

function aiDecree(gs: GameState) {
  const me = gs.players['p2'];
  const hand = me.hand.filter(c => c.rank !== Rank.FLASH);

  // 50% 概率参与竞标
  if (hand.length > 0 && Math.random() < 0.5) {
    const sorted = [...hand].sort((a, b) => a.baseScore - b.baseScore);
    const bid = sorted.slice(0, Math.min(2, sorted.length)).map(c => c.id);
    submitDecreeBid(gs, 'p2', bid);
  } else {
    submitDecreeBid(gs, 'p2', []);
  }
  confirmDecreeBid(gs, 'p2');
}
