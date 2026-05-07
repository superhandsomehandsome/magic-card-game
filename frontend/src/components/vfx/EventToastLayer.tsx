/**
 * 事件叙事 Toast — 把对方/系统的关键动作以"刚刚发生了什么"的形式弹出
 * 显示在屏幕中上部, 最多保留最新 4 条, 每条 4s 自动消失
 */
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';

const TOAST_LIFE_MS = 4000;

export function EventToastLayer() {
  const { eventToasts, dismissEventToast } = useGameStore();

  useEffect(() => {
    if (eventToasts.length === 0) return;
    const timers = eventToasts.map(t => {
      const elapsed = Date.now() - t.timestamp;
      const remaining = Math.max(0, TOAST_LIFE_MS - elapsed);
      return setTimeout(() => dismissEventToast(t.id), remaining);
    });
    return () => { timers.forEach(clearTimeout); };
  }, [eventToasts, dismissEventToast]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 90,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        alignItems: 'center',
        pointerEvents: 'none',
        zIndex: 600,
        maxWidth: '90vw',
      }}
    >
      <AnimatePresence>
        {eventToasts.map(toast => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85, y: -10 }}
            transition={{ duration: 0.3 }}
            style={{
              padding: '8px 18px',
              borderRadius: 6,
              background: 'rgba(13, 0, 24, 0.92)',
              border: '1px solid #b8860b',
              color: '#ffd9a0',
              fontSize: 13,
              fontFamily: '"Cinzel", "Noto Serif SC", serif',
              letterSpacing: 1,
              boxShadow: '0 4px 18px rgba(0,0,0,0.6), 0 0 12px rgba(184,134,11,0.35)',
              whiteSpace: 'nowrap',
              maxWidth: '90vw',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            ◆ {toast.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
