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
      return <CardClash payload={effect.payload} />;
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
    <>
      <motion.div
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          pointerEvents: 'none',
        }}
        animate={{
          x: [0, -12, 14, -10, 10, -6, 6, -2, 0],
          y: [0, 8, -8, 6, -6, 3, -3, 1, 0],
        }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
      {/* 红色闪光叠加 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.3, 0] }}
        transition={{ duration: 0.3 }}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'radial-gradient(circle at center, rgba(139,0,0,0.4), transparent 80%)',
        }}
      />
    </>
  );
}

function SpawnBounty({ amount }: { amount: number }) {
  return (
    <>
      {/* 背景血色闪光 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.15, 0] }}
        transition={{ duration: 0.5 }}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'radial-gradient(circle at 50% 30%, rgba(139,0,0,0.4), transparent 70%)',
        }}
      />
      {/* 掉落筹码粒子 */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: -60, x: (i - 2.5) * 30 }}
          animate={{ opacity: [0, 1, 1, 0], y: [- 60, 20, 40], rotate: [0, 180 + i * 60] }}
          transition={{ delay: 0.1 + i * 0.06, duration: 0.7 }}
          style={{
            position: 'absolute', top: '30%', left: '50%',
            width: 14, height: 14, borderRadius: '50%',
            background: 'radial-gradient(circle, #ffd700, #b8860b)',
            boxShadow: '0 0 8px rgba(255,215,0,0.6)',
          }}
        />
      ))}
      {/* 主文字 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.3, y: -100 }}
        animate={{ opacity: [0, 1, 1, 0.8], scale: [0.3, 1.3, 1], y: [-100, 0] }}
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
    </>
  );
}

function BurnEffect() {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.6, 0] }}
        transition={{ duration: 0.8 }}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'radial-gradient(circle at center, rgba(255,80,0,0.35), transparent 65%)',
        }}
      />
      {/* 火焰粒子上升 */}
      {[...Array(10)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 0, scale: 1 }}
          animate={{
            opacity: [0, 0.9, 0],
            y: [0, -120 - Math.random() * 80],
            x: [(Math.random() - 0.5) * 40, (Math.random() - 0.5) * 80],
            scale: [1, 0.3],
          }}
          transition={{ delay: i * 0.05, duration: 0.6 + Math.random() * 0.4 }}
          style={{
            position: 'absolute',
            bottom: '30%',
            left: `${30 + Math.random() * 40}%`,
            width: 8 + Math.random() * 8,
            height: 8 + Math.random() * 8,
            borderRadius: '50%',
            background: `hsl(${15 + Math.random() * 25}, 100%, ${50 + Math.random() * 20}%)`,
            boxShadow: '0 0 6px rgba(255,100,0,0.6)',
          }}
        />
      ))}
    </>
  );
}

function ReverseEffect() {
  return (
    <>
      {/* 全屏蓝色音波脉冲 */}
      {[0, 0.3, 0.6].map((delay, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 0.6, 0], scale: [0.2, 3 + i, 6 + i] }}
          transition={{ delay, duration: 1.2 }}
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 150, height: 150,
            borderRadius: '50%',
            border: '3px solid #4488ff',
            boxShadow: '0 0 40px #4488ff, inset 0 0 30px rgba(68,136,255,0.3)',
          }}
        />
      ))}
      {/* 全屏反色闪烁 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.2, 0, 0.15, 0] }}
        transition={{ duration: 1.5 }}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: '#4488ff',
          mixBlendMode: 'difference',
        }}
      />
      {/* 中央文字 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.2, 1] }}
        transition={{ delay: 0.3, duration: 1.2 }}
        style={{
          position: 'absolute', top: '40%', left: '50%',
          transform: 'translateX(-50%)',
          color: '#4488ff', fontSize: 28, fontWeight: 900,
          fontFamily: '"Cinzel", serif',
          textShadow: '0 0 30px rgba(68,136,255,0.8)',
          letterSpacing: 6,
        }}
      >
        ♪ INVERSION ♪
      </motion.div>
    </>
  );
}

function ScoreBurst({ amount }: { amount: number }) {
  return (
    <>
      {/* 放射光芒 */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 0.7, 0], scale: [0, 2, 3], rotate: i * 45 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          style={{
            position: 'absolute', top: '40%', left: '50%',
            width: 3, height: 60,
            background: 'linear-gradient(to top, transparent, #ffd700)',
            transformOrigin: 'bottom center',
          }}
        />
      ))}
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
          textShadow: '0 0 20px rgba(255,215,0,0.8), 0 0 40px rgba(255,215,0,0.4)',
          fontFamily: '"Cinzel", serif',
        }}
      >
        +{amount}
      </motion.div>
    </>
  );
}

function CardClash({ payload }: { payload: Record<string, unknown> }) {
  const atkRank = (payload.attackCard as { rank?: number })?.rank;
  const defRank = (payload.defendCard as { rank?: number })?.rank;
  const result = payload.result as number | undefined;
  const isFSlaysA = (atkRank === 1 && defRank === 6) || (defRank === 1 && atkRank === 6);
  const isTruthful = payload.isTruthful as boolean | undefined;

  const atkLabel = atkRank === 0 ? '⚡' : atkRank !== undefined ? ['?','F','E','D','C','B','A'][atkRank] || '?' : '?';
  const defLabel = defRank === 0 ? '⚡' : defRank !== undefined ? ['?','F','E','D','C','B','A'][defRank] || '?' : '?';

  const winSide = result !== undefined ? (result > 0 ? 'atk' : result < 0 ? 'def' : 'tie') : (isTruthful !== undefined ? 'bluff' : 'tie');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isFSlaysA ? 'radial-gradient(circle, rgba(139,0,0,0.6), rgba(0,0,0,0.9))' : 'rgba(0,0,0,0.7)',
      }}
    >
      {/* 攻击方卡牌 */}
      <motion.div
        initial={{ x: -200, rotateY: 180, opacity: 0 }}
        animate={{ x: -80, rotateY: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{
          width: 100, height: 140, borderRadius: 10,
          background: 'linear-gradient(180deg, #1a0b2e, #0d0018)',
          border: `3px solid ${winSide === 'atk' ? '#ffd700' : winSide === 'def' ? '#8b0000' : '#666'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 42, fontWeight: 900, fontFamily: '"Cinzel", serif',
          color: winSide === 'atk' ? '#ffd700' : '#ccc',
          boxShadow: winSide === 'atk' ? '0 0 30px rgba(255,215,0,0.6)' : '0 0 15px rgba(0,0,0,0.5)',
        }}
      >
        {atkLabel}
      </motion.div>

      {/* VS 闪光 */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 2, 1.2], opacity: [0, 1, 0.8] }}
        transition={{ delay: 0.4, duration: 0.3 }}
        style={{ fontSize: 36, color: isFSlaysA ? '#ff0000' : '#ffd700', margin: '0 8px', fontWeight: 900 }}
      >
        ⚔
      </motion.div>

      {/* 防守方卡牌 */}
      <motion.div
        initial={{ x: 200, rotateY: -180, opacity: 0 }}
        animate={{ x: 80, rotateY: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{
          width: 100, height: 140, borderRadius: 10,
          background: 'linear-gradient(180deg, #1a0b2e, #0d0018)',
          border: `3px solid ${winSide === 'def' ? '#ffd700' : winSide === 'atk' ? '#8b0000' : '#666'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 42, fontWeight: 900, fontFamily: '"Cinzel", serif',
          color: winSide === 'def' ? '#ffd700' : '#ccc',
          boxShadow: winSide === 'def' ? '0 0 30px rgba(255,215,0,0.6)' : '0 0 15px rgba(0,0,0,0.5)',
        }}
      >
        {defLabel}
      </motion.div>

      {/* 输家粉碎特效 */}
      {winSide !== 'tie' && winSide !== 'bluff' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ delay: 0.7, duration: 0.6 }}
          style={{
            position: 'absolute',
            [winSide === 'atk' ? 'right' : 'left']: 'calc(50% + 30px)',
            top: '50%', transform: 'translateY(-50%)',
          }}
        >
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{
                x: (Math.random() - 0.5) * 160,
                y: (Math.random() - 0.5) * 160,
                opacity: 0, scale: 0, rotate: Math.random() * 360,
              }}
              transition={{ delay: 0.8, duration: 0.5 }}
              style={{
                position: 'absolute', width: 12, height: 12,
                background: winSide === 'atk' ? '#8b0000' : '#8b0000',
                borderRadius: 2,
              }}
            />
          ))}
        </motion.div>
      )}

      {/* F弑神特效 */}
      {isFSlaysA && (
        <>
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0], scale: [0.5, 3, 5] }}
            transition={{ delay: 0.6, duration: 0.8 }}
            style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 100, height: 100, borderRadius: '50%',
              border: '4px solid #ff0000',
              boxShadow: '0 0 80px #ff0000, 0 0 120px rgba(255,0,0,0.5)',
            }}
          />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: [0, 1, 1, 0], y: [-20, -60] }}
            transition={{ delay: 1, duration: 0.8 }}
            style={{
              position: 'absolute', top: '30%', left: '50%',
              transform: 'translateX(-50%)',
              color: '#ff0000', fontSize: 28, fontWeight: 900,
              textShadow: '0 0 20px rgba(255,0,0,0.8), 0 0 40px rgba(255,0,0,0.4)',
              fontFamily: '"Cinzel", serif', letterSpacing: 4,
            }}
          >
            F 弑 神 !
          </motion.div>
        </>
      )}

      {/* 结果文字 */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: [0, 1, 1, 0], y: [30, 0] }}
        transition={{ delay: 1, duration: 0.6 }}
        style={{
          position: 'absolute', bottom: '25%', left: '50%',
          transform: 'translateX(-50%)',
          color: '#ffd700', fontSize: 18, fontWeight: 700,
          fontFamily: '"Cinzel", serif',
          textShadow: '0 0 10px rgba(255,215,0,0.5)',
        }}
      >
        {winSide === 'tie' ? 'DRAW — 血池保留' :
         winSide === 'bluff' ? (isTruthful ? '拆穿失败!' : '拆穿成功!') :
         winSide === 'atk' ? '攻击方胜!' : '防守方胜!'}
      </motion.div>
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
    <>
      {/* 背景暗化 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.5, 0.5, 0] }}
        transition={{ duration: 1.5 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: '#000' }}
      />
      {/* 星光粒子拖尾 */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 0.8, 0],
            scale: [0, 1, 0.3],
            x: [(Math.random() - 0.5) * 100, (Math.random() - 0.5) * 200],
            y: [(Math.random() - 0.5) * 100, (Math.random() - 0.5) * 200],
          }}
          transition={{ delay: 0.2 + i * 0.08, duration: 0.6 }}
          style={{
            position: 'absolute', top: '35%', left: '50%',
            width: 4, height: 4, borderRadius: '50%',
            background: '#ffd700',
            boxShadow: '0 0 6px #ffd700',
          }}
        />
      ))}
      {/* 骰子本体 */}
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
          boxShadow: '0 0 40px rgba(139,0,0,0.8), 0 0 80px rgba(139,0,0,0.4)',
        }}
      >
        {roll}
      </motion.div>
    </>
  );
}
