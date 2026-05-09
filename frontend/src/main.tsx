import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import './utils/montecarlo'

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
