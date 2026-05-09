/**
 * 终局：魔力对撞 — 暗选 3 张 → 排序 → 下注 → 逐对翻牌
 *
 * 流程：
 *   1. PICK：双方各从手牌选 3 张（背面），可调顺序
 *   2. BETTING：双方下注（0~20）
 *   3. REVEAL_1/2/3：依次翻第 1/2/3 对，赢者得当前对底池，平局滚雪球
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ICard } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { Card } from '../board/Card';

const MAX_BET = 20;

export function CollisionPhase() {
  const {
    gameState, localPlayerId,
    collisionPickCards, collisionPlaceBet, collisionReveal,
    collisionAction,
  } = useGameStore();

  if (!gameState?.collisionState) return null;
  const c = gameState.collisionState;
  const opponentId = Object.keys(gameState.players).find(id => id !== localPlayerId)!;
  const me = gameState.players[localPlayerId];
  const opp = gameState.players[opponentId];

  // ─── PICK 阶段：从手牌挑 3 张 ───────────────────
  if (c.step === 'PICK' && !c.pickConfirmed[localPlayerId]) {
    return (
      <PickView
        hand={me.hand}
        onConfirm={(orderedIds) => collisionPickCards(orderedIds)}
        oppReady={c.pickConfirmed[opponentId]}
      />
    );
  }
  if (c.step === 'PICK' && c.pickConfirmed[localPlayerId]) {
    return (
      <WaitingPanel
        title="✦ 阵列已就位"
        text={c.pickConfirmed[opponentId] ? '对手也已就位…' : '⏳ 等待对手暗选 3 张牌…'}
      />
    );
  }

  // ─── BETTING 阶段 ─────────────────────────────
  if (c.step === 'BETTING' && !c.betConfirmed[localPlayerId]) {
    return (
      <BettingView
        playerName={me.name}
        onConfirm={(amount) => collisionPlaceBet(amount)}
        oppReady={c.betConfirmed[opponentId]}
      />
    );
  }
  if (c.step === 'BETTING' && c.betConfirmed[localPlayerId]) {
    return (
      <WaitingPanel
        title={`✦ 你下注 ${c.bets[localPlayerId]} 分`}
        text={c.betConfirmed[opponentId] ? '对手也下注完毕…' : '⏳ 等待对手下注…'}
      />
    );
  }

  // ─── REVEAL_1/2/3 阶段 ────────────────────────
  const stepIdx = c.step === 'REVEAL_1' ? 0 : c.step === 'REVEAL_2' ? 1 : 2;

  return (
    <RevealView
      step={stepIdx}
      myCards={c.playerCards[localPlayerId]}
      oppCards={c.playerCards[opponentId]}
      myRevealed={c.revealedCards[localPlayerId]}
      oppRevealed={c.revealedCards[opponentId]}
      pairWinners={c.pairWinners}
      pairPot={c.pairPot}
      pot={c.pot}
      myBet={c.bets[localPlayerId]}
      oppBet={c.bets[opponentId]}
      myName={me.name}
      oppName={opp.name}
      myId={localPlayerId}
      oppId={opponentId}
      onReveal={() => collisionReveal()}
      onFold={() => collisionAction('FOLD')}
    />
  );
}

// ═══════════════════════════════════════════════════════════
//  PICK：暗选 3 张并排序
// ═══════════════════════════════════════════════════════════

interface PickViewProps {
  hand: ICard[];
  onConfirm: (orderedIds: string[]) => void;
  oppReady: boolean;
}

function PickView({ hand, onConfirm, oppReady }: PickViewProps) {
  const [picked, setPicked] = useState<ICard[]>([]);

  const togglePick = (card: ICard) => {
    if (picked.find(c => c.id === card.id)) {
      setPicked(picked.filter(c => c.id !== card.id));
    } else if (picked.length < 3) {
      setPicked([...picked, card]);
    }
  };

  const move = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= picked.length) return;
    const next = [...picked];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setPicked(next);
  };

  const targetCount = Math.min(3, hand.length);
  const ready = picked.length === targetCount;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 14, padding: 16,
        maxWidth: '95vw',
      }}
    >
      <h2 style={{
        color: '#e74c3c', fontFamily: '"Cinzel", serif',
        fontSize: 22, margin: 0,
        textShadow: '0 0 18px rgba(231,76,60,0.6)',
      }}>
        💥 魔力对撞 — 暗选 3 张 💥
      </h2>

      <div style={{ color: '#b8860b', fontSize: 12, textAlign: 'center', maxWidth: 420 }}>
        从手牌选出 <b>{targetCount}</b> 张作为对撞阵列；列表顶部 = 第一对。<br />
        所有牌均面朝下出击，对手看不到你的选择与顺序。
      </div>

      {/* 已选阵列（顶部 = 第一对） */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: 10, borderRadius: 12,
        background: 'rgba(20,5,40,0.7)',
        border: '2px solid #b8860b',
        minWidth: 260, minHeight: 80,
      }}>
        <div style={{ color: '#b8860b', fontSize: 11, letterSpacing: 2, textAlign: 'center' }}>
          阵列 {picked.length}/{targetCount}
        </div>
        <AnimatePresence>
          {picked.map((card, idx) => (
            <motion.div
              key={card.id}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              style={{
                display: 'flex', alignItems: 'center',
                gap: 8, padding: '4px 8px',
                borderRadius: 6,
                background: 'rgba(255,215,0,0.08)',
                border: '1px solid #b8860b60',
              }}
            >
              <span style={{
                color: '#ffd700', fontSize: 11,
                fontFamily: 'monospace', minWidth: 22,
              }}>
                #{idx + 1}
              </span>
              <Card card={card} size="sm" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginLeft: 'auto' }}>
                <button
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  style={{
                    width: 26, height: 20, borderRadius: 4,
                    border: '1px solid #666', background: 'transparent',
                    color: '#aaa', cursor: idx === 0 ? 'not-allowed' : 'pointer',
                    opacity: idx === 0 ? 0.3 : 1,
                  }}
                >↑</button>
                <button
                  onClick={() => move(idx, 1)}
                  disabled={idx === picked.length - 1}
                  style={{
                    width: 26, height: 20, borderRadius: 4,
                    border: '1px solid #666', background: 'transparent',
                    color: '#aaa',
                    cursor: idx === picked.length - 1 ? 'not-allowed' : 'pointer',
                    opacity: idx === picked.length - 1 ? 0.3 : 1,
                  }}
                >↓</button>
              </div>
              <button
                onClick={() => setPicked(picked.filter(c => c.id !== card.id))}
                style={{
                  padding: '2px 6px', borderRadius: 4,
                  border: '1px solid #e74c3c80', background: 'transparent',
                  color: '#e74c3c', cursor: 'pointer', fontSize: 10,
                }}
              >移除</button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 候选手牌 */}
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap',
        justifyContent: 'center', maxWidth: '90vw',
        padding: 10, borderRadius: 10,
        background: 'rgba(0,0,0,0.4)', border: '1px solid #2a1a3e',
      }}>
        {hand.map(card => {
          const isPicked = !!picked.find(c => c.id === card.id);
          return (
            <motion.div
              key={card.id}
              onClick={() => togglePick(card)}
              whileHover={{ y: -4, scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                cursor: 'pointer',
                opacity: isPicked ? 0.4 : 1,
                filter: isPicked ? 'grayscale(0.5)' : 'none',
              }}
            >
              <Card card={card} size="sm" isSelected={isPicked} />
            </motion.div>
          );
        })}
      </div>

      <motion.button
        onClick={() => onConfirm(picked.map(c => c.id))}
        disabled={!ready}
        whileHover={ready ? { scale: 1.05 } : undefined}
        style={{
          padding: '12px 32px', borderRadius: 8,
          border: '2px solid ' + (ready ? '#ffd700' : '#666'),
          background: ready
            ? 'linear-gradient(180deg, #4a3a0a, #2a1f05)'
            : '#222',
          color: ready ? '#ffd700' : '#555',
          fontWeight: 900, fontSize: 14,
          cursor: ready ? 'pointer' : 'not-allowed',
          letterSpacing: 2, fontFamily: '"Cinzel", serif',
        }}
      >
        ⚡ 确认阵列
      </motion.button>
      {oppReady && (
        <div style={{ color: '#2ecc71', fontSize: 11, fontStyle: 'italic' }}>
          ✓ 对手已就位
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  BETTING：下注
// ═══════════════════════════════════════════════════════════

interface BettingViewProps {
  playerName: string;
  onConfirm: (amount: number) => void;
  oppReady: boolean;
}

function BettingView({ playerName, onConfirm, oppReady }: BettingViewProps) {
  const [bet, setBet] = useState(10);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 18, padding: 24,
        maxWidth: 420,
      }}
    >
      <h2 style={{
        color: '#ffd700', fontFamily: '"Cinzel", serif',
        fontSize: 22, margin: 0,
        textShadow: '0 0 18px rgba(255,215,0,0.6)',
      }}>
        💰 下注阶段 (最高 {MAX_BET})
      </h2>
      <div style={{ color: '#b8860b', fontSize: 12, textAlign: 'center', maxWidth: 320, lineHeight: 1.5 }}>
        下注分将作为底池，按 3 等份分给三对赢家；<br />
        <b style={{ color: '#ffd700' }}>平局 → 该对底池滚雪球到下一对！</b>
      </div>

      <div style={{
        fontSize: 56, fontWeight: 900, fontFamily: 'monospace',
        color: '#ffd700', textShadow: '0 0 20px rgba(255,215,0,0.8)',
        letterSpacing: 4,
      }}>
        {bet}
      </div>

      <input
        type="range"
        min={0}
        max={MAX_BET}
        value={bet}
        onChange={e => setBet(Number(e.target.value))}
        style={{ width: 300, accentColor: '#ffd700' }}
      />

      <div style={{ display: 'flex', gap: 8 }}>
        {[0, 5, 10, 15, 20].map(n => (
          <button
            key={n}
            onClick={() => setBet(n)}
            style={{
              padding: '6px 14px', borderRadius: 6,
              border: '1px solid #b8860b',
              background: bet === n ? '#b8860b' : 'transparent',
              color: bet === n ? '#1a0b2e' : '#b8860b',
              fontWeight: 700, cursor: 'pointer', fontSize: 12,
            }}
          >
            {n}
          </button>
        ))}
      </div>

      <motion.button
        onClick={() => onConfirm(bet)}
        whileHover={{ scale: 1.05 }}
        style={{
          padding: '12px 32px', borderRadius: 8,
          border: '2px solid #ffd700',
          background: 'linear-gradient(180deg, #4a3a0a, #2a1f05)',
          color: '#ffd700', fontWeight: 900, fontSize: 14,
          cursor: 'pointer', letterSpacing: 2,
          fontFamily: '"Cinzel", serif',
        }}
      >
        ✓ 确认下注 {bet}
      </motion.button>
      {oppReady && (
        <div style={{ color: '#2ecc71', fontSize: 11, fontStyle: 'italic' }}>
          ✓ 对手已下注
        </div>
      )}
      <div style={{ color: '#666', fontSize: 10 }}>
        玩家：{playerName}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  REVEAL：逐对翻牌
// ═══════════════════════════════════════════════════════════

interface RevealViewProps {
  step: number; // 0/1/2
  myCards: ICard[];
  oppCards: ICard[];
  myRevealed: ICard[];
  oppRevealed: ICard[];
  pairWinners: Array<string | 'TIE'>;
  pairPot: number[];
  pot: number;
  myBet: number;
  oppBet: number;
  myName: string;
  oppName: string;
  myId: string;
  oppId: string;
  onReveal: () => void;
  onFold: () => void;
}

function RevealView(p: RevealViewProps) {
  const [revealedClicked, setRevealedClicked] = useState(false);
  // 防止重复触发
  useEffect(() => { setRevealedClicked(false); }, [p.step]);

  const renderPair = (idx: number) => {
    const myCard = p.myRevealed[idx];
    const oppCard = p.oppRevealed[idx];
    const winner = p.pairWinners[idx];
    const value = p.pairPot[idx];
    const isCurrent = idx === p.step;
    const isFuture = idx > p.step;

    return (
      <motion.div
        key={idx}
        initial={{ opacity: 0, y: 10 }}
        animate={{
          opacity: isFuture ? 0.45 : 1,
          y: 0,
          scale: isCurrent ? 1.05 : 1,
        }}
        style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 6,
          padding: 8, borderRadius: 10,
          border: isCurrent ? '2px solid #ffd700' : '1px solid #2a1a3e',
          background: isCurrent ? 'rgba(255,215,0,0.05)' : 'transparent',
          minWidth: 100,
        }}
      >
        <div style={{ color: '#888', fontSize: 10, fontWeight: 700 }}>
          第 {idx + 1} 对
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <CardSlot card={myCard} faceDown={!myCard} highlight={winner === p.myId} />
          <CardSlot card={oppCard} faceDown={!oppCard} highlight={winner === p.oppId} />
        </div>
        {winner !== undefined && winner !== null && (
          <div style={{
            fontSize: 11, fontWeight: 700,
            color: winner === 'TIE' ? '#888' : (winner === p.myId ? '#2ecc71' : '#e74c3c'),
          }}>
            {winner === 'TIE' ? `平 (${value} 滚雪球)` : `+${value}`}
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 14, padding: 16,
      }}
    >
      <h2 style={{
        color: '#e74c3c', fontFamily: '"Cinzel", serif',
        fontSize: 22, margin: 0,
        textShadow: '0 0 18px rgba(231,76,60,0.6)',
      }}>
        💥 翻牌：第 {p.step + 1} / 3 对
      </h2>
      <div style={{ color: '#ffd700', fontSize: 14, fontWeight: 700, letterSpacing: 2 }}>
        💰 底池 {p.pot}（你 {p.myBet} + 对手 {p.oppBet}）
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {[0, 1, 2].map(i => renderPair(i))}
      </div>

      <div style={{
        display: 'flex', gap: 24, fontSize: 11, color: '#666',
        marginTop: 4,
      }}>
        <div>👤 你 = 左边</div>
        <div>🤖 对手 = 右边</div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <motion.button
          onClick={() => { if (!revealedClicked) { setRevealedClicked(true); p.onReveal(); } }}
          disabled={revealedClicked}
          whileHover={!revealedClicked ? { scale: 1.05 } : undefined}
          style={{
            padding: '12px 28px', borderRadius: 8,
            border: '2px solid #ffd700',
            background: revealedClicked
              ? '#222'
              : 'linear-gradient(180deg, #4a3a0a, #2a1f05)',
            color: revealedClicked ? '#555' : '#ffd700',
            fontWeight: 900, fontSize: 14,
            cursor: revealedClicked ? 'wait' : 'pointer',
            letterSpacing: 2, fontFamily: '"Cinzel", serif',
          }}
        >
          ⚡ 翻第 {p.step + 1} 对
        </motion.button>
        <motion.button
          onClick={p.onFold}
          whileHover={{ scale: 1.05 }}
          style={{
            padding: '12px 24px', borderRadius: 8,
            border: '2px solid #666',
            background: 'transparent',
            color: '#999', fontWeight: 700, fontSize: 13,
            cursor: 'pointer',
          }}
        >
          💀 退缩 (Fold)
        </motion.button>
      </div>
    </motion.div>
  );
}

function CardSlot({ card, faceDown, highlight }: { card: ICard | undefined; faceDown: boolean; highlight: boolean }) {
  if (faceDown || !card) {
    return (
      <div style={{
        width: 56, height: 78,
        borderRadius: 8,
        border: highlight ? '2px solid #ffd700' : '2px solid #9b6bdf',
        background: 'linear-gradient(135deg, #3a1f6e, #2a1450)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: highlight
          ? '0 0 12px rgba(255,215,0,0.6)'
          : '0 0 6px rgba(120,60,200,0.4)',
      }}>
        <div style={{ color: '#c4a0ff', fontSize: 22, textShadow: '0 0 8px rgba(180,140,255,0.8)' }}>✦</div>
      </div>
    );
  }
  return (
    <div style={{
      transform: highlight ? 'scale(1.05)' : 'scale(1)',
      filter: highlight ? 'drop-shadow(0 0 10px rgba(255,215,0,0.7))' : 'none',
      transition: 'all 0.3s',
    }}>
      <Card card={card} size="sm" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  通用等待面板
// ═══════════════════════════════════════════════════════════

function WaitingPanel({ title, text }: { title: string; text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 16, padding: 32,
      }}
    >
      <h2 style={{
        color: '#ffd700', fontFamily: '"Cinzel", serif',
        fontSize: 20, margin: 0, letterSpacing: 3,
      }}>
        {title}
      </h2>
      <motion.div
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.4, repeat: Infinity }}
        style={{
          color: '#888', fontSize: 13, fontStyle: 'italic',
          padding: '10px 20px', borderRadius: 8,
          border: '1px dashed #444',
        }}
      >
        {text}
      </motion.div>
    </motion.div>
  );
}
