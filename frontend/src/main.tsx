import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App'
import './utils/montecarlo'

// Sentry 错误追踪 — 需要在 .env 或环境变量中配置 VITE_SENTRY_DSN
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.DEV ? 'development' : 'production',
    release: `magic-card@${import.meta.env.VITE_APP_VERSION || '0.1.0'}`,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: 0.3,
    beforeSend(event) {
      // 不上报开发环境的错误
      if (import.meta.env.DEV) return null;
      return event;
    },
  });
}

function updateVH() {
  const h = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--vh', `${h * 0.01}px`);
}
updateVH();
window.addEventListener('resize', updateVH);
window.addEventListener('orientationchange', () => setTimeout(updateVH, 200));
window.visualViewport?.addEventListener('resize', updateVH);

// ─── 首次交互请求全屏 ───
function requestFullScreen() {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullScreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
  };
  if (el.requestFullscreen) {
    el.requestFullscreen().catch(() => {});
  } else if (el.webkitRequestFullScreen) {
    el.webkitRequestFullScreen();
  } else if (el.msRequestFullscreen) {
    el.msRequestFullscreen();
  }
}

function onFirstInteraction() {
  requestFullScreen();
  window.removeEventListener('pointerdown', onFirstInteraction);
}
window.addEventListener('pointerdown', onFirstInteraction, { once: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
