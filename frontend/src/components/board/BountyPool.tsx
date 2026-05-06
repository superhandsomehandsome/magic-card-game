/**
 * 喋血悬赏池组件 — 桌面中央筹码
 */
import { motion, AnimatePresence } from 'framer-motion';

interface BountyPoolProps {
  amount: number;
  isRetained?: boolean;
}

export function BountyPool({ amount, isRetained = false }: BountyPoolProps) {
  return (
    <motion.div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
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
            {/* 筹码堆叠效果 */}
            {Array.from({ length: Math.min(5, Math.ceil(amount / 10)) }).map((_, i) => (
              <motion.div
                key={i}
                style={{
                  position: 'absolute',
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: `radial-gradient(circle, #8b0000, #4a0000)`,
                  border: '2px solid #b8860b',
                  boxShadow: '0 2px 8px rgba(139,0,0,0.6)',
                  bottom: i * 4,
                }}
                animate={{
                  boxShadow: isRetained
                    ? ['0 2px 8px rgba(139,0,0,0.6)', '0 2px 20px rgba(0,255,100,0.8)', '0 2px 8px rgba(139,0,0,0.6)']
                    : '0 2px 8px rgba(139,0,0,0.6)',
                }}
                transition={{ duration: 1.5, repeat: isRetained ? Infinity : 0 }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        style={{
          color: '#8b0000',
          fontFamily: '"Cinzel", serif',
          fontWeight: 900,
          fontSize: 20,
          textShadow: '0 0 10px rgba(139,0,0,0.8)',
        }}
        animate={amount > 0 ? { scale: [1, 1.1, 1] } : {}}
        transition={{ duration: 0.5 }}
      >
        {amount > 0 ? `💀 ${amount}` : ''}
      </motion.div>

      {isRetained && (
        <motion.div
          style={{
            color: '#00ff64',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1,
          }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          BLOOD POOL RETAINED
        </motion.div>
      )}
    </motion.div>
  );
}
