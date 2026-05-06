/**
 * 倒计时组件 — 电竞倒计时，最后5秒闪烁红光+滴答音效
 */
import { motion } from 'framer-motion';
import { GAME_CONSTANTS } from '../../types/game';

interface TimerProps {
  timeMs: number;
}

export function Timer({ timeMs }: TimerProps) {
  const seconds = Math.ceil(timeMs / 1000);
  const percentage = (timeMs / GAME_CONSTANTS.TURN_TIMER_MS) * 100;
  const isWarning = timeMs <= GAME_CONSTANTS.TIMER_WARNING_MS;
  const isCritical = timeMs <= 3000;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
    }}>
      <motion.div
        style={{
          fontSize: 24,
          fontWeight: 900,
          fontFamily: 'monospace',
          color: isCritical ? '#ff0000' : isWarning ? '#ff6600' : '#b8860b',
        }}
        animate={isWarning ? {
          scale: [1, 1.2, 1],
          textShadow: ['0 0 10px #ff0000', '0 0 30px #ff0000', '0 0 10px #ff0000'],
        } : {}}
        transition={{ duration: 0.5, repeat: isWarning ? Infinity : 0 }}
      >
        {seconds}s
      </motion.div>

      {/* 进度条 */}
      <div style={{
        width: 200,
        height: 4,
        borderRadius: 2,
        background: '#1a0b2e',
        overflow: 'hidden',
      }}>
        <motion.div
          style={{
            height: '100%',
            background: isCritical
              ? '#ff0000'
              : isWarning
                ? 'linear-gradient(90deg, #ff6600, #ff0000)'
                : 'linear-gradient(90deg, #b8860b, #ffd700)',
          }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  );
}
