/**
 * 终局：魔力对撞 — 德州扑克式分批下注
 */
import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { Card } from '../board/Card';

export function CollisionPhase() {
  const { gameState, localPlayerId, collisionAction } = useGameStore();

  if (!gameState?.collisionState) return null;

  const collision = gameState.collisionState;
  const opponentId = Object.keys(gameState.players).find(id => id !== localPlayerId)!;
  const myRevealed = collision.revealedCards[localPlayerId] || [];
  const opponentRevealed = collision.revealedCards[opponentId] || [];

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
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}>
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
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}>
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

      {/* 操作按钮 */}
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
    </motion.div>
  );
}
