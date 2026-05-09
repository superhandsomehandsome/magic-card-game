/**
 * 横屏锁定 — 手机竖屏时显示提示，引导用户旋转设备
 *
 * 触发条件：
 *   1. 触屏设备 (pointer: coarse)
 *   2. 屏幕较窄 (max(width,height) ≤ 1024)
 *   3. 当前竖屏 (height > width)
 *
 * 三者全满足 → 显示全屏"请横屏游玩"提示，遮挡主 UI
 *
 * 附加能力：
 *   - 在横屏状态下首次交互时请求全屏
 *   - 全屏后尝试锁定横屏方向
 */
import { useEffect, useState, useCallback, useRef } from 'react';
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

function tryRequestFullscreen() {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullScreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
  };
  const p = el.requestFullscreen?.()
    ?? el.webkitRequestFullScreen?.()
    ?? el.msRequestFullscreen?.();
  if (p && typeof (p as Promise<void>).then === 'function') {
    (p as Promise<void>).then(() => {
      const so = (screen as Screen & { orientation?: { lock?: (o: string) => Promise<void> } }).orientation;
      so?.lock?.('landscape').catch(() => {});
    }).catch(() => {});
  }
}

export function OrientationGate({ children }: { children: React.ReactNode }) {
  const [block, setBlock] = useState<boolean>(() => checkShouldBlock());
  const fullscreenAttempted = useRef(false);

  useEffect(() => {
    const update = () => setBlock(checkShouldBlock());
    const delayedUpdate = () => setTimeout(update, 200);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', delayedUpdate);
    const mql = window.matchMedia('(orientation: portrait)');
    mql.addEventListener('change', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', delayedUpdate);
      mql.removeEventListener('change', update);
    };
  }, []);

  // 全屏退出时重新检测方向（用户可能退出全屏后竖屏）
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setBlock(checkShouldBlock());
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  // 尝试用 ScreenOrientation API 锁定（仅在 PWA 全屏模式或部分浏览器有效）
  useEffect(() => {
    const so = (screen as Screen & { orientation?: { lock?: (o: string) => Promise<void> } }).orientation;
    if (so?.lock) {
      so.lock('landscape').catch(() => {});
    }
  }, []);

  // 横屏后首次交互尝试全屏
  const handleInteraction = useCallback(() => {
    if (!fullscreenAttempted.current && !document.fullscreenElement) {
      fullscreenAttempted.current = true;
      tryRequestFullscreen();
    }
  }, []);

  // 竖屏遮罩上的"进入全屏横屏"按钮
  const handleFullscreenAndRotate = useCallback(() => {
    tryRequestFullscreen();
  }, []);

  return (
    <div
      onPointerDown={handleInteraction}
      style={{ width: '100%', height: '100%' }}
    >
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
            paddingTop: 'max(32px, env(safe-area-inset-top, 0px))',
            paddingBottom: 'max(32px, env(safe-area-inset-bottom, 0px))',
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

          <motion.button
            onClick={handleFullscreenAndRotate}
            whileTap={{ scale: 0.92 }}
            style={{
              padding: '12px 28px',
              borderRadius: 8,
              border: '2px solid #b8860b',
              background: 'rgba(184,134,11,0.15)',
              color: '#b8860b',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: '"Cinzel", serif',
              letterSpacing: 2,
              cursor: 'pointer',
              boxShadow: '0 0 20px rgba(184,134,11,0.3)',
            }}
          >
            ⛶ 进入全屏模式
          </motion.button>

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
    </div>
  );
}
