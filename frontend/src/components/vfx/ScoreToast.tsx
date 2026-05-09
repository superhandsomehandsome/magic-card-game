/**
 * 得分浮字层 — 监听引擎 SCORE_CHANGED 事件，
 * 在屏幕中央显示对手/我方加减分提示，避免"对方莫名其妙得分"问题。
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';

interface ScoreEvent {
  id: number;
  playerId: string;
  delta: number;
  source: string;
  isMine: boolean;
}

let toastId = 0;

export function ScoreToast() {
  const { engine, localPlayerId, gameState } = useGameStore();
  const [events, setEvents] = useState<ScoreEvent[]>([]);

  useEffect(() => {
    if (!engine) return;
    const handler = (data: { playerId: string; delta: number; source: string }) => {
      if (!data.delta) return;
      const id = ++toastId;
      const isMine = data.playerId === localPlayerId;
      setEvents(prev => [...prev, { id, ...data, isMine }]);
      setTimeout(() => {
        setEvents(prev => prev.filter(e => e.id !== id));
      }, 4000);
    };
    engine.on('SCORE_CHANGED', handler);
    return () => {
      engine.off('SCORE_CHANGED', handler);
    };
  }, [engine, localPlayerId]);

  if (!gameState) return null;

  // 对手 toast 在屏幕上半部、我方 toast 在下半部，从上到下堆叠
  const oppEvents = events.filter(e => !e.isMine);
  const myEvents = events.filter(e => e.isMine);

  return (
    <div style={{
      position: 'fixed', inset: 0, pointerEvents: 'none',
      zIndex: 998,
    }}>
      {/* 对手得分（屏幕上方） */}
      <div style={{
        position: 'absolute', top: '15%', left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}>
        <AnimatePresence>
          {oppEvents.map(e => <ToastItem key={e.id} event={e} />)}
        </AnimatePresence>
      </div>

      {/* 我方得分（屏幕下方） */}
      <div style={{
        position: 'absolute', bottom: '20%', left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}>
        <AnimatePresence>
          {myEvents.map(e => <ToastItem key={e.id} event={e} />)}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ToastItem({ event }: { event: ScoreEvent }) {
  const positive = event.delta > 0;
  const color = event.isMine
    ? (positive ? '#ffd700' : '#e74c3c')
    : (positive ? '#ff6b6b' : '#2ecc71'); // 对方得分 = 红 / 对方扣分 = 绿(对我有利)
  const sign = positive ? '+' : '';
  const owner = event.isMine ? '你' : '对手';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.6 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 160, damping: 22 }}
      style={{
        padding: '8px 18px', borderRadius: 20,
        background: `linear-gradient(180deg, rgba(0,0,0,0.85), rgba(0,0,0,0.95))`,
        border: `2px solid ${color}80`,
        boxShadow: `0 0 18px ${color}60`,
        display: 'flex', alignItems: 'center', gap: 10,
        fontFamily: '"Cinzel", serif',
      }}
    >
      <span style={{ color: '#888', fontSize: 11 }}>{owner}</span>
      <span style={{
        color, fontWeight: 900, fontSize: 18,
        textShadow: `0 0 8px ${color}`,
      }}>
        {sign}{event.delta}
      </span>
      <span style={{ color: '#aaa', fontSize: 11 }}>{event.source}</span>
    </motion.div>
  );
}
