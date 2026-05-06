/**
 * 阶段0：喋血悬赏 — 骰子翻滚演出
 */
import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';

export function BountyRollPhase() {
  const advancePhase = useGameStore(s => s.advancePhase);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 32,
      }}
    >
      {/* 骰子动画区域 */}
      <motion.div
        style={{
          width: 100,
          height: 100,
          borderRadius: 16,
          background: 'radial-gradient(circle, #8b0000, #4a0000)',
          border: '3px solid #b8860b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 48,
          boxShadow: '0 0 30px rgba(139,0,0,0.6)',
        }}
        animate={{
          rotate: [0, 360, 720, 1080],
          scale: [1, 1.2, 0.9, 1],
        }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
      >
        🎲
      </motion.div>

      <motion.button
        onClick={() => advancePhase()}
        style={{
          padding: '12px 32px',
          borderRadius: 8,
          border: '1px solid #b8860b',
          background: 'linear-gradient(180deg, #2d1b4e, #1a0b2e)',
          color: '#b8860b',
          fontFamily: '"Cinzel", serif',
          fontWeight: 700,
          fontSize: 14,
          cursor: 'pointer',
          letterSpacing: 1,
        }}
        whileHover={{ scale: 1.05, boxShadow: '0 0 15px rgba(184,134,11,0.5)' }}
        whileTap={{ scale: 0.95 }}
      >
        继续
      </motion.button>
    </motion.div>
  );
}
