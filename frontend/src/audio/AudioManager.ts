/**
 * 秘术对决：禁忌魔典 — 音频管理器
 *
 * 从旧版 game.js 移植的 Web Audio API 合成音效系统。
 * 所有音效均为实时合成 (无需加载外部文件)，自带回退机制。
 * BGM 使用 static/bgm.mp3。
 */

let ctx: AudioContext | null = null;
let sfxEnabled = true;
let bgmAudio: HTMLAudioElement | null = null;
let bgmPlaying = false;

function getCtx(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch { /* noop */ }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(
  freq: number, type: OscillatorType, duration: number, volume: number,
  opts: { slide?: number } = {},
) {
  const c = getCtx();
  if (!c || !sfxEnabled) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (opts.slide) osc.frequency.linearRampToValueAtTime(opts.slide, c.currentTime + duration);
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + duration);
  } catch { /* noop */ }
}

function noise(duration: number, volume: number) {
  const c = getCtx();
  if (!c || !sfxEnabled) return;
  try {
    const bufLen = c.sampleRate * duration;
    const buf = c.createBuffer(1, bufLen, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    const gain = c.createGain();
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    src.buffer = buf;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    src.start();
  } catch { /* noop */ }
}

// ═══════════════════════════════════════════════════════════
//  SFX 合成音效 (从旧版 game.js 移植)
// ═══════════════════════════════════════════════════════════

export const SFX = {
  draw() {
    noise(0.06, 0.15);
    tone(900, 'sine', 0.08, 0.06);
  },
  select() {
    tone(1200, 'sine', 0.07, 0.12);
    tone(1600, 'sine', 0.05, 0.06);
  },
  deselect() {
    tone(900, 'sine', 0.06, 0.08);
  },
  click() {
    tone(800, 'sine', 0.05, 0.08);
  },
  error() {
    tone(200, 'square', 0.05, 0.1);
    setTimeout(() => tone(160, 'square', 0.1, 0.12), 80);
  },
  score() {
    tone(440, 'triangle', 0.06, 0.15);
    setTimeout(() => tone(660, 'triangle', 0.08, 0.15), 60);
    setTimeout(() => tone(880, 'sine', 0.15, 0.2), 130);
  },
  scoreBig() {
    [0, 60, 120, 200].forEach((t, i) => {
      const freqs = [330, 440, 550, 880];
      setTimeout(() => tone(freqs[i], 'triangle', 0.25, 0.25), t);
    });
    setTimeout(() => { tone(1100, 'sine', 0.4, 0.3); noise(0.15, 0.05); }, 280);
  },
  buy() {
    tone(350, 'sawtooth', 0.04, 0.1);
    setTimeout(() => tone(500, 'triangle', 0.1, 0.2), 50);
    setTimeout(() => tone(700, 'sine', 0.12, 0.15), 130);
  },
  darkMarket() {
    tone(200, 'sine', 0.3, 0.12, { slide: 600 });
    setTimeout(() => tone(800, 'sine', 0.2, 0.15), 150);
    setTimeout(() => noise(0.1, 0.04), 200);
  },
  ambush() {
    tone(150, 'sawtooth', 0.08, 0.2, { slide: 80 });
    setTimeout(() => noise(0.12, 0.2), 60);
  },
  ambushWin() {
    tone(330, 'square', 0.06, 0.18);
    setTimeout(() => tone(500, 'square', 0.06, 0.18), 70);
    setTimeout(() => tone(660, 'sine', 0.2, 0.25), 140);
  },
  ambushLose() {
    tone(400, 'sawtooth', 0.08, 0.15, { slide: 180 });
    setTimeout(() => noise(0.08, 0.12), 80);
  },
  lockdown() {
    tone(220, 'square', 0.05, 0.15);
    setTimeout(() => tone(180, 'square', 0.15, 0.2), 80);
  },
  lockdownBreak() {
    noise(0.06, 0.3);
    setTimeout(() => tone(600, 'sawtooth', 0.1, 0.2, { slide: 200 }), 60);
  },
  colFlip() {
    noise(0.04, 0.1);
    tone(500 + Math.random() * 200, 'sine', 0.1, 0.1);
  },
  colWin() {
    tone(440, 'triangle', 0.08, 0.2);
    setTimeout(() => tone(660, 'triangle', 0.12, 0.2), 90);
  },
  colTie() {
    tone(300, 'sine', 0.15, 0.1);
    setTimeout(() => tone(300, 'sine', 0.15, 0.08), 180);
  },
  colArrange() {
    tone(300, 'sine', 0.05, 0.1);
    setTimeout(() => tone(450, 'triangle', 0.1, 0.15), 80);
    setTimeout(() => tone(600, 'sine', 0.08, 0.2), 180);
  },
  colStart() {
    noise(0.2, 0.25);
    setTimeout(() => tone(110, 'sawtooth', 0.4, 0.3), 100);
    setTimeout(() => tone(220, 'sawtooth', 0.3, 0.25), 250);
  },
  victory() {
    const melody = [523, 659, 784, 1047];
    melody.forEach((f, i) => setTimeout(() => tone(f, 'triangle', 0.3, 0.3), i * 120));
    setTimeout(() => { tone(1047, 'sine', 0.6, 0.4); noise(0.1, 0.05); }, 520);
  },
  defeat() {
    tone(400, 'sawtooth', 0.1, 0.2, { slide: 200 });
    setTimeout(() => tone(250, 'sawtooth', 0.2, 0.35, { slide: 150 }), 180);
  },
  diceRoll() {
    for (let i = 0; i < 6; i++) {
      setTimeout(() => tone(300 + Math.random() * 300, 'sine', 0.05, 0.1), i * 50);
    }
    setTimeout(() => tone(800, 'triangle', 0.15, 0.2), 350);
  },
  timerTick() {
    tone(1000, 'sine', 0.03, 0.15);
  },
  screenShake() {
    noise(0.3, 0.3);
    tone(80, 'sawtooth', 0.4, 0.25);
  },
  inversion() {
    tone(880, 'sine', 0.5, 0.3, { slide: 220 });
    setTimeout(() => tone(220, 'sine', 0.5, 0.3, { slide: 880 }), 500);
  },
};

// ═══════════════════════════════════════════════════════════
//  BGM 控制
// ═══════════════════════════════════════════════════════════

export function initBGM(): void {
  if (bgmAudio) return;
  bgmAudio = new Audio('/bgm.mp3');
  bgmAudio.loop = true;
  bgmAudio.volume = 0.3;
}

export function playBGM(): void {
  if (!bgmAudio) initBGM();
  if (bgmPlaying || !bgmAudio) return;
  bgmAudio.play().then(() => {
    bgmPlaying = true;
  }).catch(() => {});
}

export function pauseBGM(): void {
  if (bgmAudio && bgmPlaying) {
    bgmAudio.pause();
    bgmPlaying = false;
  }
}

export function toggleBGM(): boolean {
  if (bgmPlaying) { pauseBGM(); return false; }
  playBGM();
  return true;
}

export function isBGMPlaying(): boolean {
  return bgmPlaying;
}

// ═══════════════════════════════════════════════════════════
//  全局控制
// ═══════════════════════════════════════════════════════════

export function setSFXEnabled(enabled: boolean): void {
  sfxEnabled = enabled;
}

export function isSFXEnabled(): boolean {
  return sfxEnabled;
}

export function toggleSFX(): boolean {
  sfxEnabled = !sfxEnabled;
  if (sfxEnabled) SFX.click();
  return sfxEnabled;
}
