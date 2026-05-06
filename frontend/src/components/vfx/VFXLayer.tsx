/**
 * VFX 全局特效层 — 覆盖在游戏板上方，消费指令队列渲染动画
 */
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { IActionCommand, ActionType } from '../../types/game';
import { useActionQueue } from '../../hooks/useActionQueue';

interface ActiveVFX {
  id: number;
  type: ActionType;
  payload: Record<string, unknown>;
}

let vfxId = 0;

export function VFXLayer() {
  const [activeEffects, setActiveEffects] = useState<ActiveVFX[]>([]);

  const handleAction = useCallback((action: IActionCommand) => {
    const id = ++vfxId;
    setActiveEffects(prev => [...prev, { id, type: action.type, payload: action.payload }]);

    setTimeout(() => {
      setActiveEffects(prev => prev.filter(e => e.id !== id));
    }, action.durationMs);
  }, []);

  useActionQueue(handleAction);

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      pointerEvents: 'none',
      zIndex: 9999,
      overflow: 'hidden',
    }}>
      <AnimatePresence>
        {activeEffects.map(effect => (
          <VFXEffect key={effect.id} effect={effect} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function VFXEffect({ effect }: { effect: ActiveVFX }) {
  switch (effect.type) {
    case 'SCREEN_SHAKE':
      return <ScreenShake />;
    case 'SPAWN_BOUNTY':
      return <SpawnBounty amount={effect.payload.amount as number} />;
    case 'VFX_BURN':
      return <BurnEffect />;
    case 'VFX_REVERSE':
      return <ReverseEffect />;
    case 'SCORE_BURST':
      return <ScoreBurst amount={effect.payload.amount as number} />;
    case 'CARD_CLASH':
      return <CardClash />;
    case 'SLOW_MOTION':
      return <SlowMotion />;
    case 'BOUNTY_RETAINED':
      return <BountyRetained />;
    case 'AUDIO_MUTE':
      return <AudioMute />;
    case 'DICE_ROLL':
      return <DiceRoll roll={effect.payload.roll as number} />;
    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════
//  个别特效实现
// ═══════════════════════════════════════════════════════════

function ScreenShake() {
  return (
    <motion.div
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
      }}
      animate={{
        x: [0, -10, 10, -8, 8, -4, 4, 0],
        y: [0, 5, -5, 4, -4, 2, -2, 0],
      }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    />
  );
}

function SpawnBounty({ amount }: { amount: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.3, y: -100 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.5 }}
      style={{
        position: 'absolute',
        top: '30%',
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#8b0000',
        fontSize: 48,
        fontWeight: 900,
        fontFamily: '"Cinzel", serif',
        textShadow: '0 0 30px rgba(139,0,0,0.8), 0 0 60px rgba(139,0,0,0.4)',
      }}
    >
      +{amount} 💀
    </motion.div>
  );
}

function BurnEffect() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.8, 0] }}
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'radial-gradient(circle at center, rgba(255,100,0,0.3), transparent 70%)',
      }}
    />
  );
}

function ReverseEffect() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: [0, 0.8, 0.4, 0],
        scale: [0.5, 3, 5],
      }}
      transition={{ duration: 2 }}
      style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 200, height: 200,
        borderRadius: '50%',
        border: '3px solid #4488ff',
        boxShadow: '0 0 60px #4488ff, inset 0 0 60px rgba(68,136,255,0.3)',
        filter: 'hue-rotate(200deg)',
      }}
    />
  );
}

function ScoreBurst({ amount }: { amount: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5, y: 0 }}
      animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.5, 1.2], y: -80 }}
      transition={{ duration: 0.8 }}
      style={{
        position: 'absolute',
        top: '40%', left: '50%',
        transform: 'translateX(-50%)',
        color: '#ffd700',
        fontSize: 56,
        fontWeight: 900,
        textShadow: '0 0 20px rgba(255,215,0,0.8)',
        fontFamily: '"Cinzel", serif',
      }}
    >
      +{amount}
    </motion.div>
  );
}

function CardClash() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0] }}
      transition={{ duration: 1.5 }}
      style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        fontSize: 80,
      }}
    >
      <motion.span
        animate={{ rotate: [0, -15, 15, 0], scale: [1, 1.5, 1] }}
        transition={{ duration: 0.5 }}
      >
        ⚔️
      </motion.span>
    </motion.div>
  );
}

function SlowMotion() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.6, 0.6, 0] }}
      transition={{ duration: 1.5 }}
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.7), rgba(0,0,0,0.9))',
        backdropFilter: 'blur(2px)',
      }}
    />
  );
}

function BountyRetained() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: [0, 1, 1, 0], y: [20, 0, 0, -20] }}
      transition={{ duration: 1.5 }}
      style={{
        position: 'absolute',
        top: '45%', left: '50%',
        transform: 'translateX(-50%)',
        color: '#00ff64',
        fontSize: 20,
        fontWeight: 900,
        letterSpacing: 3,
        textShadow: '0 0 15px rgba(0,255,100,0.8)',
      }}
    >
      BLOOD POOL RETAINED
    </motion.div>
  );
}

function AudioMute() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.9, 0.9, 0] }}
      transition={{ duration: 1 }}
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <motion.span
        style={{ fontSize: 64, color: '#4488ff' }}
        animate={{ scale: [1, 1.5, 1] }}
      >
        🔇
      </motion.span>
    </motion.div>
  );
}

function DiceRoll({ roll }: { roll: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, rotate: -180, scale: 0.3 }}
      animate={{ opacity: [0, 1, 1, 0], rotate: [0, 360, 720], scale: [0.3, 1.5, 1] }}
      transition={{ duration: 1.5 }}
      style={{
        position: 'absolute',
        top: '35%', left: '50%',
        transform: 'translateX(-50%)',
        width: 100, height: 100,
        borderRadius: 16,
        background: 'radial-gradient(circle, #8b0000, #4a0000)',
        border: '3px solid #b8860b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 48,
        color: '#ffd700',
        fontWeight: 900,
        boxShadow: '0 0 40px rgba(139,0,0,0.8)',
      }}
    >
      {roll}
    </motion.div>
  );
}
