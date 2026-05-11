/**
 * 喋血悬赏池组件 — 桌面中央筹码
 * 色彩分级：<20 暗红, 20~39 橙金, ≥40 血红高亮脉冲, 已满特殊标识
 */
import { motion, AnimatePresence } from 'framer-motion';
import { GAME_CONSTANTS } from '../../types/game';

interface BountyPoolProps {
  amount: number;
  isRetained?: boolean;
}

function getPoolTier(amount: number) {
  if (amount >= GAME_CONSTANTS.BOUNTY_POOL_MAX) return { color: '#ff2222', glow: 'rgba(255,34,34,0.9)', label: '悬赏已满！' };
  if (amount >= 40) return { color: '#ff2222', glow: 'rgba(255,34,34,0.9)', label: '巨额悬赏！' };
  if (amount >= 20) return { color: '#ffa500', glow: 'rgba(255,165,0,0.7)', label: '' };
  return { color: '#8b0000', glow: 'rgba(139,0,0,0.6)', label: '' };
}

export function BountyPool({ amount, isRetained = false }: BountyPoolProps) {
  const tier = getPoolTier(amount);
  const isHigh = amount >= 40;
  const isMid = amount >= 20;

  return (
    <motion.div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <AnimatePresence>
        {amount > 0 && (
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 180 }}
            style={{
              position: 'relative',
              width: 120,
              height: 80,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {Array.from({ length: Math.min(5, Math.ceil(amount / 10)) }).map((_, i) => (
              <motion.div
                key={i}
                style={{
                  position: 'absolute',
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: isHigh
                    ? 'radial-gradient(circle, #ff3300, #8b0000)'
                    : isMid
                    ? 'radial-gradient(circle, #b8860b, #6b4c00)'
                    : 'radial-gradient(circle, #8b0000, #4a0000)',
                  border: `2px solid ${isHigh ? '#ff4444' : '#b8860b'}`,
                  boxShadow: `0 2px 8px ${tier.glow}`,
                  bottom: i * 4,
                }}
                animate={{
                  boxShadow: isRetained
                    ? [`0 2px 8px ${tier.glow}`, '0 2px 20px rgba(0,255,100,0.8)', `0 2px 8px ${tier.glow}`]
                    : isHigh
                    ? [`0 2px 10px ${tier.glow}`, `0 2px 24px ${tier.glow}`, `0 2px 10px ${tier.glow}`]
                    : `0 2px 8px ${tier.glow}`,
                }}
                transition={{ duration: isHigh ? 0.8 : 1.5, repeat: (isRetained || isHigh) ? Infinity : 0 }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        style={{
          color: tier.color,
          fontFamily: '"Cinzel", serif',
          fontWeight: 900,
          fontSize: isHigh ? 24 : isMid ? 22 : 20,
          textShadow: `0 0 ${isHigh ? '16px' : '10px'} ${tier.glow}`,
        }}
        animate={isHigh ? { scale: [1, 1.15, 1], textShadow: [`0 0 10px ${tier.glow}`, `0 0 24px ${tier.glow}`, `0 0 10px ${tier.glow}`] } : amount > 0 ? { scale: [1, 1.1, 1] } : {}}
        transition={{ duration: isHigh ? 0.6 : 0.5, repeat: isHigh ? Infinity : 0 }}
      >
        {amount > 0 ? `💀 ${amount}` : ''}
      </motion.div>

      {isHigh && !isRetained && (
        <motion.div
          style={{ color: '#ff4444', fontSize: 10, fontWeight: 900, letterSpacing: 2 }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 0.6, repeat: Infinity }}
        >
          {tier.label}
        </motion.div>
      )}

      {isRetained && (
        <motion.div
          style={{ color: '#00ff64', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          BLOOD POOL RETAINED
        </motion.div>
      )}
    </motion.div>
  );
}
