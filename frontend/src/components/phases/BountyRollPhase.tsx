/**
 * 阶段0：喋血悬赏 — 骰子翻滚演出
 */
import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';

const isLandscape = () =>
  typeof window !== 'undefined' && window.innerHeight < 520 && window.innerWidth > window.innerHeight;

export function BountyRollPhase() {
  const { advancePhase, gameState, localPlayerId } = useGameStore();
  const isMyTurn = gameState?.currentTurnPlayerId === localPlayerId;
  const compact = isLandscape();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        display: 'flex',
        flexDirection: compact ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: compact ? 'clamp(10px, 3vw, 24px)' : 'clamp(8px, 2vh, 24px)',
        padding: compact ? '4px 8px' : 'clamp(8px, 3vh, 32px)',
      }}
    >
      {/* 骰子动画区域 */}
      <motion.div
        style={{
          width: compact ? 'clamp(44px, 10vh, 64px)' : 'clamp(56px, 14vh, 100px)',
          height: compact ? 'clamp(44px, 10vh, 64px)' : 'clamp(56px, 14vh, 100px)',
          borderRadius: compact ? 10 : 'clamp(8px, 2vh, 16px)',
          background: 'radial-gradient(circle, #8b0000, #4a0000)',
          border: '3px solid #b8860b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: compact ? 'clamp(20px, 5vh, 32px)' : 'clamp(24px, 6vh, 48px)',
          boxShadow: '0 0 30px rgba(139,0,0,0.6)',
          flexShrink: 0,
        }}
        animate={{
          rotate: [0, 360, 720, 1080],
          scale: [1, 1.2, 0.9, 1],
        }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
      >
        🎲
      </motion.div>

      {isMyTurn ? (
        <motion.button
          onClick={() => advancePhase()}
          style={{
            padding: compact ? '8px 20px' : '12px 32px',
            borderRadius: 8,
            border: '1px solid #b8860b',
            background: 'linear-gradient(180deg, #2d1b4e, #1a0b2e)',
            color: '#b8860b',
            fontFamily: '"Cinzel", serif',
            fontWeight: 700,
            fontSize: compact ? 12 : 14,
            cursor: 'pointer',
            letterSpacing: 1,
          }}
          whileHover={{ scale: 1.05, boxShadow: '0 0 15px rgba(184,134,11,0.5)' }}
          whileTap={{ scale: 0.95 }}
        >
          继续
        </motion.button>
      ) : (
        <div style={{ color: '#666', fontSize: compact ? 11 : 12, fontStyle: 'italic' }}>
          等待对手投掷悬赏骰…
        </div>
      )}
    </motion.div>
  );
}
