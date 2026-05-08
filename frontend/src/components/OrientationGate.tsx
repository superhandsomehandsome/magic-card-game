/**
 * 横屏锁定 — 手机竖屏时显示提示，引导用户旋转设备
 *
 * 触发条件：
 *   1. 触屏设备 (pointer: coarse)
 *   2. 屏幕较窄 (max(width,height) ≤ 1024)
 *   3. 当前竖屏 (height > width)
 *
 * 三者全满足 → 显示全屏"请横屏游玩"提示，遮挡主 UI
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

function checkShouldBlock(): boolean {
  if (typeof window === 'undefined') return false;
  const isCoarse = window.matchMedia('(pointer: coarse)').matches;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const longSide = Math.max(w, h);
  const isMobile = isCoarse && longSide <= 1024;
  const isPortrait = h > w;
  return isMobile && isPortrait;
}

export function OrientationGate({ children }: { children: React.ReactNode }) {
  const [block, setBlock] = useState<boolean>(() => checkShouldBlock());

  useEffect(() => {
    const update = () => setBlock(checkShouldBlock());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  // 尝试用 ScreenOrientation API 锁定（仅在 PWA 全屏模式或部分浏览器有效）
  useEffect(() => {
    const so = (screen as Screen & { orientation?: { lock?: (o: string) => Promise<void> } }).orientation;
    if (so?.lock) {
      so.lock('landscape').catch(() => {
        // 大部分移动浏览器在非全屏不允许锁定，静默忽略
      });
    }
  }, []);

  return (
    <>
      {children}
      {block && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'radial-gradient(ellipse at center, #1a0b2e 0%, #0d0018 70%, #000 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 28,
            padding: 32,
            color: '#b8860b',
            fontFamily: '"Cinzel", serif',
          }}
        >
          <motion.div
            animate={{ rotate: [0, -90, -90, 0] }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: 'easeInOut',
              times: [0, 0.4, 0.7, 1],
            }}
            style={{ fontSize: 80, filter: 'drop-shadow(0 0 20px rgba(184,134,11,0.6))' }}
          >
            📱
          </motion.div>

          <h2 style={{
            fontSize: 22,
            letterSpacing: 4,
            textAlign: 'center',
            textShadow: '0 0 20px rgba(184,134,11,0.5)',
            margin: 0,
          }}>
            ⛧ 请横屏游玩 ⛧
          </h2>

          <p style={{
            color: '#888',
            fontSize: 14,
            textAlign: 'center',
            lineHeight: 1.7,
            maxWidth: 320,
            margin: 0,
          }}>
            魔典的奥秘需要广阔的画卷展开。<br />
            请将设备旋转至横屏模式以继续。
          </p>

          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            style={{
              fontSize: 11,
              color: '#666',
              letterSpacing: 2,
              padding: '8px 16px',
              border: '1px solid #3a1f5e',
              borderRadius: 4,
            }}
          >
            ↻ 旋转设备
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
