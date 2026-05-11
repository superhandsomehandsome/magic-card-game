/**
 * 牌库预警 + 至高法案保护期首次全屏提醒（各一次，3.5 秒后自动消失）
 */
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';

export function DeckLowWarning() {
  const deckCount = useGameStore(s => s.gameState?.deckCount ?? -1);
  const gracePeriod = useGameStore(s => s.gameState?.collisionGracePeriod ?? 0);

  const [showDeckLow, setShowDeckLow] = useState(false);
  const deckFired = useRef(false);

  const [showGrace, setShowGrace] = useState(false);
  const graceFired = useRef(false);

  useEffect(() => {
    if (!deckFired.current && deckCount > 0 && deckCount <= 10) {
      deckFired.current = true;
      setShowDeckLow(true);
      const t = setTimeout(() => setShowDeckLow(false), 3500);
      return () => clearTimeout(t);
    }
  }, [deckCount]);

  useEffect(() => {
    if (!graceFired.current && gracePeriod > 0) {
      graceFired.current = true;
      setShowGrace(true);
      const t = setTimeout(() => setShowGrace(false), 4000);
      return () => clearTimeout(t);
    }
  }, [gracePeriod]);

  return (
    <AnimatePresence>
      {showDeckLow && (
        <FullScreenAlert key="deck-low">
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            style={{
              color: '#ffd700', fontFamily: '"Cinzel", serif',
              fontSize: 22, fontWeight: 900,
              letterSpacing: 4, textShadow: '0 0 18px rgba(255,215,0,0.7)',
            }}
          >
            ⚠ 牌库仅剩 {deckCount} 张
          </motion.div>
          <div style={{ color: '#ff8c00', fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
            终极对撞临近 — 储备好你的核心手牌！
          </div>
        </FullScreenAlert>
      )}

      {showGrace && (
        <FullScreenAlert key="grace-start">
          <motion.div
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
            style={{
              color: '#ff4500', fontFamily: '"Cinzel", serif',
              fontSize: 20, fontWeight: 900,
              letterSpacing: 4, textShadow: '0 0 18px rgba(255,69,0,0.6)',
            }}
          >
            ⚖ 至高法案降临
          </motion.div>
          <div style={{ color: '#ffb347', fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
            保护期 {gracePeriod} 回合 — 牌库枯竭也不会立即对撞
          </div>
        </FullScreenAlert>
      )}
    </AnimatePresence>
  );
}

function FullScreenAlert({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.4 }}
      style={{
        position: 'fixed',
        top: '20%',
        left: '50%',
        transform: 'translate(-50%, 0)',
        zIndex: 4500,
        padding: '20px 36px',
        borderRadius: 14,
        background: 'linear-gradient(135deg, rgba(139,0,0,0.95), rgba(40,8,8,0.92))',
        border: '2px solid #ff4500',
        boxShadow: '0 0 40px rgba(255,69,0,0.6)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 8,
        pointerEvents: 'none',
      }}
    >
      {children}
    </motion.div>
  );
}
