/**
 * 战况记事本 — 实时记录关键事件
 * 显示在屏幕左侧（横屏）或顶部小条（窄屏）
 * 玩家可点击展开/收起
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';

const MAX_VISIBLE = 50;

export function BattleLog() {
  const gameState = useGameStore(s => s.gameState);
  // 窄屏（横屏 max-height < 500）默认收起，避免遮挡
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerHeight > 520;
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动滚到底部
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [gameState?.log?.length, open]);

  if (!gameState) return null;
  const log = (gameState.log || []).slice(-MAX_VISIBLE);

  return (
    <div
      style={{
        position: 'absolute',
        left: 'max(8px, env(safe-area-inset-left, 0px))',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 700,
        pointerEvents: 'auto',
      }}
    >
      <AnimatePresence mode="wait">
        {open ? (
          <motion.div
            key="open"
            initial={{ x: -80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -80, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{
              width: 'clamp(180px, 22vw, 240px)',
              maxHeight: '60vh',
              background: 'rgba(13,0,24,0.92)',
              border: '1px solid #b8860b',
              borderRadius: 10,
              boxShadow: '0 0 16px rgba(184,134,11,0.3)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 10px',
              borderBottom: '1px solid #b8860b40',
              background: 'linear-gradient(180deg, #2d1b4e, #1a0b2e)',
            }}>
              <span style={{
                color: '#b8860b', fontSize: 11, fontWeight: 700,
                fontFamily: '"Cinzel", serif', letterSpacing: 2,
              }}>
                📜 战况
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{
                  width: 22, height: 22, borderRadius: 4,
                  border: '1px solid #666', background: 'transparent',
                  color: '#b8860b', cursor: 'pointer',
                  fontSize: 12, lineHeight: 1,
                }}
                title="收起"
              >‹</button>
            </div>
            <div
              ref={scrollRef}
              style={{
                flex: 1, overflowY: 'auto',
                padding: 8, display: 'flex',
                flexDirection: 'column', gap: 4,
              }}
            >
              {log.length === 0 && (
                <div style={{ color: '#666', fontSize: 11, fontStyle: 'italic', textAlign: 'center' }}>
                  暂无记录
                </div>
              )}
              {log.map((entry, i) => (
                <div
                  key={`${entry.timestamp}-${i}`}
                  style={{
                    fontSize: 10, lineHeight: 1.4,
                    color: '#bbb',
                    padding: '3px 6px', borderRadius: 4,
                    background: i === log.length - 1 ? 'rgba(255,215,0,0.08)' : 'transparent',
                    borderLeft: i === log.length - 1 ? '2px solid #ffd700' : '2px solid transparent',
                  }}
                >
                  <span style={{ color: '#666', marginRight: 4 }}>R{entry.turn}</span>
                  {entry.message}
                </div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="closed"
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -40, opacity: 0 }}
            onClick={() => setOpen(true)}
            style={{
              width: 28, height: 60,
              borderRadius: '0 8px 8px 0',
              border: '1px solid #b8860b',
              borderLeft: 'none',
              background: 'linear-gradient(180deg, #2d1b4e, #1a0b2e)',
              color: '#b8860b', cursor: 'pointer',
              writingMode: 'vertical-rl',
              fontSize: 11, letterSpacing: 4,
              fontFamily: '"Cinzel", serif',
            }}
            title="展开战况"
          >
            📜 战况 ›
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
