/**
 * 计分进度条组件 — 温度计风格，155分爆表碎裂
 */
import { motion } from 'framer-motion';
import { GAME_CONSTANTS } from '../../types/game';

interface ScoreBarProps {
  score: number;
  playerName: string;
  heroColor: string;
  side: 'left' | 'right';
}

export function ScoreBar({ score, playerName, heroColor, side }: ScoreBarProps) {
  const percentage = Math.min((score / GAME_CONSTANTS.WIN_SCORE) * 100, 100);
  const isNearWin = percentage >= 85;
  const isWin = score >= GAME_CONSTANTS.WIN_SCORE;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: side === 'left' ? 'flex-start' : 'flex-end',
      gap: 4,
      width: 160,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        width: '100%',
        alignItems: 'baseline',
      }}>
        <span style={{
          color: '#ccc',
          fontSize: 12,
          fontFamily: '"Cinzel", serif',
        }}>
          {playerName}
        </span>
        <motion.span
          style={{
            color: isNearWin ? '#ff4444' : heroColor,
            fontSize: 18,
            fontWeight: 900,
            fontFamily: 'monospace',
          }}
          animate={isNearWin ? { scale: [1, 1.1, 1], color: ['#ff4444', '#ffaa00', '#ff4444'] } : {}}
          transition={{ duration: 0.8, repeat: isNearWin ? Infinity : 0 }}
        >
          {score}
        </motion.span>
      </div>

      {/* 进度条 */}
      <div style={{
        width: '100%',
        height: 12,
        borderRadius: 6,
        background: 'rgba(26, 11, 46, 0.8)',
        border: '1px solid #3a1f5e',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <motion.div
          style={{
            height: '100%',
            borderRadius: 6,
            background: isWin
              ? 'linear-gradient(90deg, #ffd700, #ff6600)'
              : `linear-gradient(90deg, ${heroColor}40, ${heroColor})`,
            boxShadow: isNearWin ? `0 0 10px ${heroColor}` : 'none',
          }}
          animate={{ width: `${percentage}%` }}
          transition={{ type: 'spring', stiffness: 100, damping: 15 }}
        />
        {/* 155分刻度线 */}
        <div style={{
          position: 'absolute',
          right: 0,
          top: 0,
          height: '100%',
          width: 2,
          background: '#ff0000',
          opacity: 0.6,
        }} />
      </div>

      <span style={{
        color: '#666',
        fontSize: 10,
        fontFamily: 'monospace',
      }}>
        / {GAME_CONSTANTS.WIN_SCORE}
      </span>
    </div>
  );
}
