/**
 * 终局：魔力对撞 — 排兵布阵 + 德州扑克式分批下注
 *
 * 第一步：双方调整自己手牌的揭牌顺序（最先揭哪张排在最前）
 * 第二步：分 3 轮（Flop/Turn/River）翻牌对撞
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ICard } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { Card } from '../board/Card';

export function CollisionPhase() {
  const { gameState, localPlayerId, collisionAction, setCollisionOrder } = useGameStore();

  if (!gameState?.collisionState) return null;

  const collision = gameState.collisionState;
  const opponentId = Object.keys(gameState.players).find(id => id !== localPlayerId)!;
  const myRevealed = collision.revealedCards[localPlayerId] || [];
  const opponentRevealed = collision.revealedCards[opponentId] || [];
  const isMyTurn = gameState.currentTurnPlayerId === localPlayerId;

  // 排兵布阵阶段：尚未揭任何牌时
  const inSetupPhase = myRevealed.length === 0 && opponentRevealed.length === 0;

  if (inSetupPhase && !collision.orderConfirmed?.[localPlayerId]) {
    return <SetupView
      myCards={collision.playerCards[localPlayerId] || []}
      onConfirm={(order) => setCollisionOrder(order)}
      bothReady={collision.orderConfirmed}
      myId={localPlayerId}
    />;
  }

  const roundLabels = { FLOP: '翻牌 (Flop)', TURN: '转牌 (Turn)', RIVER: '河牌 (River)' };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        padding: 32,
        background: 'radial-gradient(ellipse at center, rgba(139,0,0,0.1), transparent)',
      }}
    >
      <motion.h2
        style={{
          color: '#e74c3c',
          fontFamily: '"Cinzel", serif',
          fontSize: 24,
          margin: 0,
          textShadow: '0 0 20px rgba(231,76,60,0.6)',
        }}
        animate={{ scale: [1, 1.02, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        💥 魔力对撞 💥
      </motion.h2>

      <div style={{ color: '#b8860b', fontSize: 14, fontWeight: 700 }}>
        第 {collision.roundIndex + 1}/3 轮 — {roundLabels[collision.round]}
      </div>

      {/* 底池 */}
      <div style={{
        color: '#ffd700',
        fontSize: 20,
        fontWeight: 900,
        textShadow: '0 0 10px rgba(255,215,0,0.5)',
      }}>
        底池: {collision.pot}
      </div>

      {/* 对撞区域 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        width: '100%',
        maxWidth: 500,
        gap: 32,
      }}>
        {/* 对手揭示 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#888', fontSize: 12 }}>对手</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {opponentRevealed.map(card => (
              <Card key={card.id} card={card} size="sm" />
            ))}
            {Array.from({ length: 3 - opponentRevealed.length }).map((_, i) => (
              <div key={i} style={{
                width: 60, height: 84,
                borderRadius: 8,
                border: '2px dashed #3a1f5e',
                background: 'rgba(26,11,46,0.5)',
              }} />
            ))}
          </div>
        </div>

        {/* 我方揭示 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#888', fontSize: 12 }}>我方</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {myRevealed.map(card => (
              <Card key={card.id} card={card} size="sm" />
            ))}
            {Array.from({ length: 3 - myRevealed.length }).map((_, i) => (
              <div key={i} style={{
                width: 60, height: 84,
                borderRadius: 8,
                border: '2px dashed #3a1f5e',
                background: 'rgba(26,11,46,0.5)',
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* 操作按钮（仅我方回合可点） */}
      {isMyTurn ? (
        <div style={{ display: 'flex', gap: 16 }}>
          <motion.button
            onClick={() => collisionAction('RAISE')}
            style={{
              padding: '14px 32px',
              borderRadius: 8,
              border: '2px solid #ffd700',
              background: 'linear-gradient(180deg, #4a3a0a, #2a1f05)',
              color: '#ffd700',
              fontWeight: 900,
              fontSize: 16,
              cursor: 'pointer',
            }}
            whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(255,215,0,0.5)' }}
            whileTap={{ scale: 0.95 }}
          >
            ⚡ 加注 (Raise)
          </motion.button>

          <motion.button
            onClick={() => collisionAction('FOLD')}
            style={{
              padding: '14px 32px',
              borderRadius: 8,
              border: '2px solid #666',
              background: 'linear-gradient(180deg, #2a2a2a, #1a1a1a)',
              color: '#999',
              fontWeight: 700,
              fontSize: 16,
              cursor: 'pointer',
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            💀 退缩 (Fold)
          </motion.button>
        </div>
      ) : (
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          style={{
            color: '#888', fontSize: 13, fontStyle: 'italic',
            padding: '8px 16px', borderRadius: 6,
            border: '1px dashed #444',
          }}
        >
          🤖 等待对手抉择 (加注 / 退缩)…
        </motion.div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  排兵布阵 (调整揭牌顺序)
// ═══════════════════════════════════════════════════════════

interface SetupViewProps {
  myCards: ICard[];
  onConfirm: (orderedIds: string[]) => void;
  bothReady?: Record<string, boolean>;
  myId: string;
}

function SetupView({ myCards, onConfirm, bothReady, myId }: SetupViewProps) {
  const [order, setOrder] = useState<ICard[]>(myCards);
  const [confirmed, setConfirmed] = useState(false);

  // 当外部 myCards 更新（罕见），同步重排
  useEffect(() => {
    if (!confirmed) setOrder(myCards);
  }, [myCards, confirmed]);

  const move = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= order.length) return;
    const next = [...order];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setOrder(next);
  };

  const handleConfirm = () => {
    setConfirmed(true);
    onConfirm(order.map(c => c.id));
  };

  const oppReady = bothReady && Object.entries(bothReady).some(([id, v]) => id !== myId && v);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 16, padding: 24,
      }}
    >
      <motion.h2 style={{
        color: '#e74c3c', fontFamily: '"Cinzel", serif',
        fontSize: 22, margin: 0,
        textShadow: '0 0 20px rgba(231,76,60,0.6)',
      }}>
        💥 排兵布阵 💥
      </motion.h2>

      <div style={{ color: '#b8860b', fontSize: 13, textAlign: 'center', maxWidth: 380 }}>
        调整你的揭牌顺序 — 顶部的牌将在 <b>翻牌轮</b> 第一个被揭示。<br/>
        点击 ↑ ↓ 移动，或用箭头键。
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: 12, borderRadius: 12,
        background: 'rgba(0,0,0,0.4)',
        border: '1px solid #3a1f5e',
        minWidth: 280,
      }}>
        <AnimatePresence mode="popLayout">
          {order.map((card, idx) => (
            <motion.div
              key={card.id}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              style={{
                display: 'flex', alignItems: 'center',
                gap: 10, padding: '4px 8px',
                borderRadius: 8,
                background: idx < 3 ? 'rgba(255,215,0,0.08)' : 'transparent',
                border: idx < 3 ? '1px solid #b8860b40' : '1px solid #2a1a3e',
              }}
            >
              <span style={{
                color: idx < 3 ? '#ffd700' : '#666',
                fontSize: 11, fontFamily: 'monospace',
                width: 20, textAlign: 'center',
              }}>
                #{idx + 1}
              </span>
              <Card card={card} size="sm" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginLeft: 'auto' }}>
                <button
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0 || confirmed}
                  style={{
                    width: 28, height: 22,
                    borderRadius: 4, border: '1px solid #666',
                    background: 'transparent', color: '#aaa',
                    cursor: idx === 0 || confirmed ? 'not-allowed' : 'pointer',
                    opacity: idx === 0 || confirmed ? 0.3 : 1,
                  }}
                >
                  ↑
                </button>
                <button
                  onClick={() => move(idx, 1)}
                  disabled={idx === order.length - 1 || confirmed}
                  style={{
                    width: 28, height: 22,
                    borderRadius: 4, border: '1px solid #666',
                    background: 'transparent', color: '#aaa',
                    cursor: idx === order.length - 1 || confirmed ? 'not-allowed' : 'pointer',
                    opacity: idx === order.length - 1 || confirmed ? 0.3 : 1,
                  }}
                >
                  ↓
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div style={{ color: '#666', fontSize: 10 }}>
        ✦ 前 3 张高亮 = 第一轮 / 第二轮 / 第三轮
      </div>

      {!confirmed ? (
        <motion.button
          onClick={handleConfirm}
          style={{
            padding: '12px 32px', borderRadius: 8,
            border: '2px solid #ffd700',
            background: 'linear-gradient(180deg, #4a3a0a, #2a1f05)',
            color: '#ffd700', fontWeight: 900,
            fontSize: 14, cursor: 'pointer',
            letterSpacing: 2,
          }}
          whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(255,215,0,0.5)' }}
          whileTap={{ scale: 0.95 }}
        >
          ⚡ 确认阵列
        </motion.button>
      ) : (
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          style={{
            color: oppReady ? '#2ecc71' : '#888',
            fontSize: 13, padding: '8px 16px',
            borderRadius: 6, border: '1px dashed #444',
          }}
        >
          {oppReady ? '✓ 双方已就绪 — 开始翻牌!' : '⏳ 等待对手就绪…'}
        </motion.div>
      )}
    </motion.div>
  );
}
