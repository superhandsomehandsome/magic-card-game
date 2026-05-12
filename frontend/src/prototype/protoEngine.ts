/**
 * v2.1 原型 — 纯逻辑引擎（完全独立）
 *
 * 核心循环: GATHER → CONFRONT → CHANT  (法案插入第3/6回合开头)
 * 终局: 牌库空 → 3 回合 FINAL_CHANT
 */
import {
  type Card, type GameState, type PlayerState, type ComboResult, type ComboType,
  type Decree, type AmbushState, type ConfrontAction, type DefendAction,
  Rank, Phase, PROTO_CONSTANTS as C, BOUNTY_TIERS,
} from './protoTypes';

let _uid = 0;
const uid = () => `c${++_uid}`;

// ═══════════════════════════════════════════════════════════
//  牌库
// ═══════════════════════════════════════════════════════════

function buildDeck(): Card[] {
  const cards: Card[] = [];
  for (const [rankStr, count] of Object.entries(C.DECK_COMPOSITION)) {
    const rank = Number(rankStr) as Rank;
    for (let i = 0; i < count; i++) {
      cards.push({ id: uid(), rank, baseScore: rank === Rank.FLASH ? 0 : rank });
    }
  }
  return shuffle(cards);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ═══════════════════════════════════════════════════════════
//  初始化
// ═══════════════════════════════════════════════════════════

export function createGame(mode: 'AI' | 'HOTSEAT'): GameState {
  _uid = 0;
  const deck = buildDeck();
  const p1: PlayerState = {
    id: 'p1', name: mode === 'AI' ? '玩家' : '玩家1',
    score: 0, hand: [], sealedRank: null, decrees: [], hasActedThisTurn: false,
  };
  const p2: PlayerState = {
    id: 'p2', name: mode === 'AI' ? 'AI' : '玩家2',
    score: 0, hand: [], sealedRank: null, decrees: [], hasActedThisTurn: false,
  };
  // 初始发牌: 各 5 张
  for (let i = 0; i < 5; i++) {
    p1.hand.push(deck.pop()!);
    p2.hand.push(deck.pop()!);
  }
  const gs: GameState = {
    phase: Phase.GATHER,
    turnNumber: 1,
    roundNumber: 1,
    currentPlayerId: 'p1',
    players: { p1, p2 },
    playerOrder: ['p1', 'p2'],
    deck,
    marketCards: [deck.pop()!, deck.pop()!, deck.pop()!],
    bountyPool: 0,
    discardPile: [],
    gatherOffers: [],
    ambush: null,
    decreeContest: null,
    finalChantRoundsLeft: 0,
    decreeRoundsTriggered: [],
    log: [],
    winnerId: null,
    mode,
  };
  // 检查是否第 1 回合就该触发法案（v2.1 不在第 1 回合触发）
  startGatherPhase(gs);
  return gs;
}

// ═══════════════════════════════════════════════════════════
//  阶段流转
// ═══════════════════════════════════════════════════════════

function startGatherPhase(gs: GameState) {
  // 检查法案触发（在回合开始时检查）
  if (
    C.DECREE_ROUNDS.includes(gs.roundNumber) &&
    !gs.decreeRoundsTriggered.includes(gs.roundNumber)
  ) {
    gs.decreeRoundsTriggered.push(gs.roundNumber);
    startDecreePhase(gs);
    return;
  }

  gs.phase = Phase.GATHER;
  // 翻 3 张供选择
  const offers: Card[] = [];
  const count = Math.min(C.DRAW_OFFER_COUNT, gs.deck.length);
  for (let i = 0; i < count; i++) offers.push(gs.deck.pop()!);
  gs.gatherOffers = offers;

  if (offers.length === 0) {
    enterFinalChant(gs);
  }
}

export function gatherKeep(gs: GameState, keepIds: string[]): boolean {
  if (gs.phase !== Phase.GATHER) return false;
  const kept = keepIds.slice(0, C.DRAW_KEEP_COUNT);
  const player = gs.players[gs.currentPlayerId];

  for (const id of kept) {
    const idx = gs.gatherOffers.findIndex(c => c.id === id);
    if (idx >= 0) {
      const [card] = gs.gatherOffers.splice(idx, 1);
      if (player.hand.length < C.HAND_LIMIT) player.hand.push(card);
      else gs.discardPile.push(card);
    }
  }
  // 剩余的牌放入黑市（替换最老的）
  for (const card of gs.gatherOffers) {
    if (gs.marketCards.length >= C.MARKET_SIZE) {
      gs.discardPile.push(gs.marketCards.shift()!);
    }
    gs.marketCards.push(card);
  }
  gs.gatherOffers = [];
  gs.phase = Phase.CONFRONT;
  return true;
}

export function buyMarketCard(gs: GameState, cardId: string): boolean {
  if (gs.phase !== Phase.GATHER && gs.phase !== Phase.CONFRONT) return false;
  const player = gs.players[gs.currentPlayerId];
  const idx = gs.marketCards.findIndex(c => c.id === cardId);
  if (idx < 0) return false;
  const card = gs.marketCards[idx];
  const price = C.MARKET_PRICE[card.rank] ?? 2;
  if (player.score < price) return false;
  if (player.hand.length >= C.HAND_LIMIT) return false;

  player.score -= price;
  gs.marketCards.splice(idx, 1);
  player.hand.push(card);
  // 黑市补牌
  if (gs.deck.length > 0) gs.marketCards.push(gs.deck.pop()!);
  gs.log.push(`${player.name} 花费 ${price} 分从黑市购入 ${rankName(card.rank)}`);
  return true;
}

export function skipToConfront(gs: GameState) {
  if (gs.phase === Phase.GATHER) gs.phase = Phase.CONFRONT;
}

// ── 对峙 ──

export function submitConfront(gs: GameState, action: ConfrontAction): boolean {
  if (gs.phase !== Phase.CONFRONT) return false;
  const attacker = gs.players[gs.currentPlayerId];
  const defenderId = gs.playerOrder.find(id => id !== gs.currentPlayerId)!;
  const defender = gs.players[defenderId];

  if (action.type === 'AMBUSH') {
    const cardIdx = attacker.hand.findIndex(c => c.id === action.cardId);
    if (cardIdx < 0) return false;
    const [card] = attacker.hand.splice(cardIdx, 1);
    gs.ambush = { attackerId: attacker.id, attackCard: card, defenderResponse: null };
    gs.phase = Phase.CONFRONT_DEFEND;
    gs.log.push(`${attacker.name} 发动突袭！`);
    return true;
  }

  if (action.type === 'CHARGE') {
    // 抽 1 张
    if (gs.deck.length > 0 && attacker.hand.length < C.HAND_LIMIT) {
      attacker.hand.push(gs.deck.pop()!);
    }
    gs.bountyPool += C.CHARGE_BOUNTY;
    gs.log.push(`${attacker.name} 选择蓄力 — 抽 1 牌，悬赏池 +${C.CHARGE_BOUNTY}`);

    // 可选封印
    if (action.sealRank !== undefined && action.sealCardId) {
      const sealIdx = attacker.hand.findIndex(c => c.id === action.sealCardId);
      if (sealIdx >= 0) {
        const [sealCard] = attacker.hand.splice(sealIdx, 1);
        gs.discardPile.push(sealCard);
        defender.sealedRank = action.sealRank;
        gs.log.push(`${attacker.name} 封印了 ${rankName(action.sealRank)}！`);
      }
    }

    gs.phase = Phase.CHANT;
    return true;
  }

  return false;
}

export function submitDefend(gs: GameState, action: DefendAction): boolean {
  if (gs.phase !== Phase.CONFRONT_DEFEND || !gs.ambush) return false;
  const defenderId = gs.playerOrder.find(id => id !== gs.ambush!.attackerId)!;
  const defender = gs.players[defenderId];
  const attacker = gs.players[gs.ambush.attackerId];
  const atkCard = gs.ambush.attackCard;

  if (action.type === 'FOLD') {
    gs.ambush.defenderResponse = action;
    // 怯战：攻击方收回牌 + 悬赏池入池
    attacker.hand.push(atkCard);
    const bountyAdd = atkCard.baseScore * C.FOLD_BOUNTY_MULT;
    gs.bountyPool += bountyAdd;
    gs.log.push(`${defender.name} 选择怯战 — 悬赏池 +${bountyAdd}`);
    // 攻击方可偷看+偷 1 张手牌
    if (defender.hand.length > 0) {
      const stolenIdx = Math.floor(Math.random() * defender.hand.length);
      const [stolen] = defender.hand.splice(stolenIdx, 1);
      if (attacker.hand.length < C.HAND_LIMIT) {
        attacker.hand.push(stolen);
        gs.log.push(`${attacker.name} 偷走了 ${defender.name} 的 1 张牌`);
      } else {
        gs.discardPile.push(stolen);
      }
    }
    gs.ambush = null;
    gs.phase = Phase.CHANT;
    return true;
  }

  if (action.type === 'FIGHT') {
    const cardIdx = defender.hand.findIndex(c => c.id === action.cardId);
    if (cardIdx < 0) return false;
    const [defCard] = defender.hand.splice(cardIdx, 1);
    gs.ambush.defenderResponse = action;
    gs.ambush.defendCard = defCard;

    // 比较
    const result = compareAmbush(atkCard, defCard);
    if (result === 'ATK_WIN') {
      let bonus = atkCard.baseScore + defCard.baseScore;
      if (atkCard.rank === Rank.A) bonus += C.A_WIN_BONUS;
      if (atkCard.rank === Rank.B) bonus += C.B_WIN_BONUS;
      if (atkCard.rank === Rank.F && defCard.rank === Rank.A) bonus += C.F_SLAY_BONUS;
      attacker.score += bonus;
      gs.log.push(`突袭成功！${attacker.name} +${bonus} 分`);
    } else if (result === 'DEF_WIN') {
      let bonus = atkCard.baseScore + defCard.baseScore;
      if (defCard.rank === Rank.A) bonus += C.A_WIN_BONUS;
      if (defCard.rank === Rank.B) bonus += C.B_WIN_BONUS;
      if (defCard.rank === Rank.F && atkCard.rank === Rank.A) bonus += C.F_SLAY_BONUS;
      defender.score += bonus;
      gs.log.push(`防守成功！${defender.name} +${bonus} 分`);
    } else {
      // 平局 → 悬赏池
      const poolAdd = atkCard.baseScore + defCard.baseScore;
      gs.bountyPool += poolAdd;
      gs.log.push(`突袭平局 — 悬赏池 +${poolAdd}`);
    }

    gs.discardPile.push(atkCard, defCard);
    gs.ambush = null;
    gs.phase = Phase.CHANT;
    checkWin(gs); // 如果达到胜利分数则覆盖为 GAME_OVER
    return true;
  }

  return false;
}

function compareAmbush(atk: Card, def: Card): 'ATK_WIN' | 'DEF_WIN' | 'TIE' {
  if (atk.rank === def.rank) return 'TIE';
  // F 弑 A
  if (atk.rank === Rank.F && def.rank === Rank.A) return 'ATK_WIN';
  if (def.rank === Rank.F && atk.rank === Rank.A) return 'DEF_WIN';
  // FLASH 视为 0
  return atk.rank > def.rank ? 'ATK_WIN' : 'DEF_WIN';
}

// ── 咏唱 ──

export function submitChant(gs: GameState, cardIds: string[]): ComboResult | null {
  if (gs.phase !== Phase.CHANT && gs.phase !== Phase.FINAL_CHANT) return null;
  const player = gs.players[gs.currentPlayerId];

  if (cardIds.length === 0) {
    // 空咏唱
    gs.bountyPool += C.EMPTY_CHANT_BOUNTY;
    gs.log.push(`${player.name} 放弃咏唱 — 悬赏池 +${C.EMPTY_CHANT_BOUNTY}`);
    afterChant(gs, 0);
    return null;
  }

  // 从手牌取出选中的牌
  const selected: Card[] = [];
  for (const id of cardIds) {
    const idx = player.hand.findIndex(c => c.id === id);
    if (idx >= 0) {
      selected.push(player.hand[idx]);
    }
  }
  if (selected.length === 0) return null;

  // 检测组合
  const combo = detectBestCombo(selected, player.sealedRank);
  const chantScore = combo ? combo.totalScore : simpleSum(selected, player.sealedRank);

  // 从手牌移除
  for (const c of selected) {
    const idx = player.hand.findIndex(h => h.id === c.id);
    if (idx >= 0) {
      gs.discardPile.push(player.hand.splice(idx, 1)[0]);
    }
  }

  // 悬赏池提取
  let bountyGained = 0;
  if (gs.bountyPool > 0 && chantScore > 0) {
    for (const tier of BOUNTY_TIERS) {
      if (chantScore >= tier.minScore) {
        bountyGained = Math.floor(gs.bountyPool * tier.extractRate);
        gs.bountyPool -= bountyGained;
        break;
      }
    }
  }

  const totalGain = chantScore + bountyGained;
  player.score += totalGain;

  const comboName = combo ? comboTypeName(combo.type) : '散牌';
  gs.log.push(
    `${player.name} 咏唱 [${comboName}] — ${chantScore} 分` +
    (bountyGained > 0 ? ` + 悬赏 ${bountyGained}` : '') +
    ` = +${totalGain}`
  );

  afterChant(gs, chantScore);
  return combo;
}

function afterChant(gs: GameState, _score: number) {
  const player = gs.players[gs.currentPlayerId];
  // 清除封印
  player.sealedRank = null;

  // 咏唱奖励抽牌（非炼狱模式）
  if (gs.phase === Phase.CHANT && gs.deck.length > 0 && player.hand.length < C.HAND_LIMIT) {
    player.hand.push(gs.deck.pop()!);
  }

  checkWin(gs);
  if (gs.phase === Phase.GAME_OVER) return;

  if (gs.phase === Phase.FINAL_CHANT) {
    advanceFinalChant(gs);
    return;
  }

  endTurn(gs);
}

function endTurn(gs: GameState) {
  const currentIdx = gs.playerOrder.indexOf(gs.currentPlayerId);
  const nextIdx = (currentIdx + 1) % 2;
  gs.currentPlayerId = gs.playerOrder[nextIdx];

  gs.turnNumber++;
  if (nextIdx === 0) {
    gs.roundNumber++;
  }

  // 检查牌库是否耗尽
  if (gs.deck.length === 0 && gs.phase !== Phase.FINAL_CHANT) {
    enterFinalChant(gs);
    return;
  }

  startGatherPhase(gs);
}

// ── 炼狱咏唱 ──

function enterFinalChant(gs: GameState) {
  gs.phase = Phase.FINAL_CHANT;
  gs.finalChantRoundsLeft = C.FINAL_CHANT_ROUNDS;
  gs.currentPlayerId = gs.playerOrder[0];
  gs.log.push('牌库耗尽 — 进入炼狱咏唱！');
}

function advanceFinalChant(gs: GameState) {
  const currentIdx = gs.playerOrder.indexOf(gs.currentPlayerId);
  if (currentIdx === 0) {
    // 第二个玩家还没行动
    gs.currentPlayerId = gs.playerOrder[1];
    return;
  }

  // 两人都行动了，回合 -1
  gs.finalChantRoundsLeft--;
  if (gs.finalChantRoundsLeft <= 0) {
    // 结算
    const [p1, p2] = gs.playerOrder.map(id => gs.players[id]);
    if (p1.score > p2.score) gs.winnerId = p1.id;
    else if (p2.score > p1.score) gs.winnerId = p2.id;
    else gs.winnerId = null; // 平局
    gs.phase = Phase.GAME_OVER;
    gs.log.push(gs.winnerId ? `${gs.players[gs.winnerId].name} 赢得了对决！` : '平局！');
    return;
  }

  gs.currentPlayerId = gs.playerOrder[0];
}

// ── 法案 ──

const DECREE_POOL: Decree[] = [
  { id: 'GLUTTONY', name: '暴食法案', emoji: '🍖', buffText: '黑市免费购买 1 张', debuffText: '手牌上限 -1', effectTag: 'gluttony' },
  { id: 'PRIDE', name: '傲慢法案', emoji: '👑', buffText: '咏唱得分 +20%', debuffText: '必须先赢一次突袭才能咏唱', effectTag: 'pride' },
  { id: 'WRATH', name: '愤怒法案', emoji: '🔥', buffText: '突袭获胜奖励翻倍', debuffText: '怯战时额外失去 5 分', effectTag: 'wrath' },
  { id: 'SLOTH', name: '怠惰法案', emoji: '💤', buffText: '蓄力额外抽 1 张牌', debuffText: '咏唱组合倍率 -1(最低 x1)', effectTag: 'sloth' },
  { id: 'GREED', name: '贪婪法案', emoji: '💰', buffText: '悬赏池提取门槛 -10', debuffText: '黑市购买价格翻倍', effectTag: 'greed' },
  { id: 'ENVY', name: '嫉妒法案', emoji: '💚', buffText: '可窥视对手 2 张手牌', debuffText: '每回合强制弃 1 张牌', effectTag: 'envy' },
];

function startDecreePhase(gs: GameState) {
  const available = DECREE_POOL.filter(d =>
    !gs.decreeRoundsTriggered.slice(0, -1).some((_r, i) =>
      gs.decreeContest?.decree.id === d.id
    )
  );
  const decree = available[Math.floor(Math.random() * available.length)] || DECREE_POOL[0];
  gs.decreeContest = {
    decree,
    bids: { [gs.playerOrder[0]]: [], [gs.playerOrder[1]]: [] },
    revealed: false,
    outcome: null,
  };
  gs.phase = Phase.DECREE;
  gs.log.push(`法案降临: ${decree.emoji} ${decree.name}`);
}

export function submitDecreeBid(gs: GameState, playerId: string, cardIds: string[]): boolean {
  if (gs.phase !== Phase.DECREE || !gs.decreeContest) return false;
  if (cardIds.length > 3) return false;

  const player = gs.players[playerId];
  // 验证牌在手中
  const validIds = cardIds.filter(id => player.hand.some(c => c.id === id));
  gs.decreeContest.bids[playerId] = validIds;

  // 检查双方是否都已提交
  const allSubmitted = gs.playerOrder.every(id => gs.decreeContest!.bids[id].length >= 0 &&
    gs.decreeContest!.bids[id] !== undefined);
  // 需要两方都"确认"提交
  const p1Bid = gs.decreeContest.bids[gs.playerOrder[0]];
  const p2Bid = gs.decreeContest.bids[gs.playerOrder[1]];

  if (p1Bid !== undefined && p2Bid !== undefined &&
      (gs.decreeContest as any)._p1Confirmed && (gs.decreeContest as any)._p2Confirmed) {
    resolveDecree(gs);
  }

  return true;
}

export function confirmDecreeBid(gs: GameState, playerId: string): boolean {
  if (gs.phase !== Phase.DECREE || !gs.decreeContest) return false;
  (gs.decreeContest as any)[`_${playerId}Confirmed`] = true;

  const allConfirmed = gs.playerOrder.every(id => (gs.decreeContest as any)[`_${id}Confirmed`]);
  if (allConfirmed) resolveDecree(gs);
  return true;
}

function resolveDecree(gs: GameState) {
  if (!gs.decreeContest) return;
  const dc = gs.decreeContest;
  dc.revealed = true;
  gs.phase = Phase.DECREE_REVEAL;

  const calcPower = (playerId: string): number => {
    const ids = dc.bids[playerId];
    if (!ids || ids.length === 0) return 0;
    const player = gs.players[playerId];
    const cards = ids.map(id => player.hand.find(c => c.id === id)).filter((c): c is Card => !!c);
    let base = cards.reduce((s, c) => s + c.baseScore, 0);
    // Combo 检测
    if (cards.length >= 2) {
      const ranks = cards.map(c => c.rank).sort((a, b) => a - b);
      const allSame = ranks.every(r => r === ranks[0]);
      if (allSame && cards.length === 3) base += 12;
      else if (allSame && cards.length === 2) base += 6;
      else if (cards.length === 3 && ranks[2] - ranks[0] === 2 && ranks[1] - ranks[0] === 1) base += 10;
    }
    return base;
  };

  const p1Power = calcPower(gs.playerOrder[0]);
  const p2Power = calcPower(gs.playerOrder[1]);

  // 移除竞标牌
  for (const pid of gs.playerOrder) {
    const ids = dc.bids[pid];
    const player = gs.players[pid];
    for (const id of ids) {
      const idx = player.hand.findIndex(c => c.id === id);
      if (idx >= 0) gs.discardPile.push(player.hand.splice(idx, 1)[0]);
    }
  }

  if (p1Power === 0 && p2Power === 0) {
    dc.outcome = 'VOID';
    gs.log.push('双方均未出牌，法案作废');
  } else if (p1Power > p2Power) {
    dc.outcome = gs.playerOrder[0];
    gs.players[gs.playerOrder[0]].decrees.push(dc.decree);
    gs.log.push(`${gs.players[gs.playerOrder[0]].name} 赢得法案 (${p1Power} vs ${p2Power})`);
  } else if (p2Power > p1Power) {
    dc.outcome = gs.playerOrder[1];
    gs.players[gs.playerOrder[1]].decrees.push(dc.decree);
    gs.log.push(`${gs.players[gs.playerOrder[1]].name} 赢得法案 (${p2Power} vs ${p1Power})`);
  } else {
    dc.outcome = 'VOID';
    gs.log.push(`法案平局作废 (${p1Power} vs ${p2Power})`);
  }
}

export function advanceFromDecreeReveal(gs: GameState) {
  if (gs.phase !== Phase.DECREE_REVEAL) return;
  gs.decreeContest = null;
  startGatherPhase(gs);
}

// ── 胜负 ──

function checkWin(gs: GameState) {
  for (const pid of gs.playerOrder) {
    if (gs.players[pid].score >= C.WIN_SCORE) {
      gs.winnerId = pid;
      gs.phase = Phase.GAME_OVER;
      gs.log.push(`${gs.players[pid].name} 达到 ${C.WIN_SCORE} 分，赢得对决！`);
      return;
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  咏唱组合检测
// ═══════════════════════════════════════════════════════════

function getEffective(card: Card, sealedRank: Rank | null): number {
  if (card.rank === Rank.FLASH) return 0;
  if (sealedRank !== null && card.rank === sealedRank) return 0;
  return card.baseScore;
}

function simpleSum(cards: Card[], sealedRank: Rank | null): number {
  return cards.reduce((s, c) => s + getEffective(c, sealedRank), 0);
}

export function detectBestCombo(cards: Card[], sealedRank: Rank | null): ComboResult | null {
  const playable = cards.filter(c => c.rank !== Rank.FLASH);
  if (playable.length === 0) return null;

  const combos: ComboResult[] = [];

  // 大顺: A-F 各一张
  const rankSet = new Set(playable.map(c => c.rank));
  if ([Rank.A, Rank.B, Rank.C, Rank.D, Rank.E, Rank.F].every(r => rankSet.has(r))) {
    const straightCards = [Rank.A, Rank.B, Rank.C, Rank.D, Rank.E, Rank.F].map(
      r => playable.find(c => c.rank === r)!
    );
    const raw = straightCards.reduce((s, c) => s + getEffective(c, sealedRank), 0);
    combos.push({ type: 'GRAND_STRAIGHT', cards: straightCards, rawScore: raw, multiplier: 3, totalScore: raw * 3 });
  }

  // 按 rank 分组
  const groups: Record<number, Card[]> = {};
  for (const c of playable) {
    (groups[c.rank] ??= []).push(c);
  }

  // 四条
  for (const [, g] of Object.entries(groups)) {
    if (g.length >= 4) {
      const c4 = g.slice(0, 4);
      const raw = c4.reduce((s, c) => s + getEffective(c, sealedRank), 0);
      combos.push({ type: 'FOUR_KIND', cards: c4, rawScore: raw, multiplier: 4, totalScore: raw * 4 });
    }
  }

  // 葫芦: 三条+对子
  const triples = Object.entries(groups).filter(([, g]) => g.length >= 3);
  const pairs = Object.entries(groups).filter(([, g]) => g.length >= 2);
  for (const [tr, tg] of triples) {
    for (const [pr, pg] of pairs) {
      if (tr === pr) continue;
      const fh = [...tg.slice(0, 3), ...pg.slice(0, 2)];
      const raw = fh.reduce((s, c) => s + getEffective(c, sealedRank), 0);
      combos.push({ type: 'FULL_HOUSE', cards: fh, rawScore: raw, multiplier: 3, totalScore: raw * 3 });
    }
  }

  // 小顺 (4+ 连续 rank)
  const uniqueRanks = [...new Set(playable.map(c => c.rank).filter(r => r > 0))].sort((a, b) => a - b);
  let bestRun: number[] = [];
  let currentRun: number[] = [uniqueRanks[0]];
  for (let i = 1; i < uniqueRanks.length; i++) {
    if (uniqueRanks[i] === uniqueRanks[i - 1] + 1) {
      currentRun.push(uniqueRanks[i]);
    } else {
      if (currentRun.length > bestRun.length) bestRun = currentRun;
      currentRun = [uniqueRanks[i]];
    }
  }
  if (currentRun.length > bestRun.length) bestRun = currentRun;

  if (bestRun.length >= 4) {
    const straightCards = bestRun.map(r => playable.find(c => c.rank === r)!);
    const raw = straightCards.reduce((s, c) => s + getEffective(c, sealedRank), 0);
    combos.push({ type: 'SMALL_STRAIGHT', cards: straightCards, rawScore: raw, multiplier: 2, totalScore: raw * 2 });
  }

  // 三条
  for (const [, g] of Object.entries(groups)) {
    if (g.length >= 3) {
      const c3 = g.slice(0, 3);
      const raw = c3.reduce((s, c) => s + getEffective(c, sealedRank), 0);
      combos.push({ type: 'THREE_KIND', cards: c3, rawScore: raw, multiplier: 2, totalScore: raw * 2 });
    }
  }

  // 对子
  for (const [, g] of Object.entries(groups)) {
    if (g.length >= 2) {
      const c2 = g.slice(0, 2);
      const raw = c2.reduce((s, c) => s + getEffective(c, sealedRank), 0);
      combos.push({ type: 'PAIR', cards: c2, rawScore: raw, multiplier: 1, totalScore: raw * 1 });
    }
  }

  if (combos.length === 0) return null;
  combos.sort((a, b) => b.totalScore - a.totalScore);
  return combos[0];
}

// ═══════════════════════════════════════════════════════════
//  工具函数
// ═══════════════════════════════════════════════════════════

export function rankName(rank: Rank): string {
  if (rank === Rank.FLASH) return '瞬';
  return { [Rank.A]: 'A', [Rank.B]: 'B', [Rank.C]: 'C', [Rank.D]: 'D', [Rank.E]: 'E', [Rank.F]: 'F' }[rank] || '?';
}

export function comboTypeName(type: ComboType): string {
  const names: Record<ComboType, string> = {
    GRAND_STRAIGHT: '大顺',
    FOUR_KIND: '四条',
    FULL_HOUSE: '葫芦',
    SMALL_STRAIGHT: '小顺',
    THREE_KIND: '三条',
    PAIR: '对子',
  };
  return names[type];
}

export function getOpponentId(gs: GameState): string {
  return gs.playerOrder.find(id => id !== gs.currentPlayerId)!;
}
