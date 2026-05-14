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
    case 'AMBUSH_BLUFF':
      return <AmbushBluff payload={effect.payload} />;
    case 'AMBUSH_FOLD':
      return <AmbushFold payload={effect.payload} />;
    case 'SLOW_MOTION':
      return <SlowMotion />;
    case 'BOUNTY_RETAINED':
      return <BountyRetained />;
    case 'AUDIO_MUTE':
      return <AudioMute />;
    case 'DICE_ROLL':
      return <DiceRoll roll={effect.payload.roll as number} />;
    case 'FATE_DICE':
      return <FateDiceRoll roll={effect.payload.roll as number} />;
    case 'VFX_BID_COMBO':
      return <BidComboBurst payload={effect.payload} />;
    case 'GLOBAL_MUTATION':
      return null; // 已由 SupremeDecreeReadingScreen 替代
    case 'DECREE_AWARDED':
      return <DecreeAwarded payload={effect.payload} />;
    case 'DECREE_VOIDED':
      return <DecreeVoided payload={effect.payload} />;
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

      {/* F弑神特效 — 全屏血色震荡 + 圆环爆裂 + 血迹喷溅 */}
      {isFSlaysA && (
        <>
          {/* 全屏血色震荡覆层 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.85, 0.4, 0.85, 0] }}
            transition={{ delay: 0.6, duration: 1.5 }}
            style={{
              position: 'absolute', inset: 0,
              background: 'radial-gradient(ellipse at center, rgba(139,0,0,0.7) 0%, rgba(80,0,0,0.85) 50%, rgba(0,0,0,0.95) 100%)',
              mixBlendMode: 'screen',
            }}
          />
          {/* 屏幕震动框 */}
          <motion.div
            initial={{ x: 0, y: 0 }}
            animate={{
              x: [0, -10, 12, -8, 6, -4, 2, 0],
              y: [0, 8, -10, 6, -4, 2, 0],
            }}
            transition={{ delay: 0.6, duration: 0.8 }}
            style={{
              position: 'absolute', inset: 0,
              border: '6px solid rgba(255,0,0,0.6)',
              boxShadow: 'inset 0 0 80px rgba(139,0,0,0.7)',
              pointerEvents: 'none',
            }}
          />
          {/* 双重爆炸圆环 */}
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
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0], scale: [0.5, 4, 7] }}
            transition={{ delay: 0.85, duration: 1.0 }}
            style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 100, height: 100, borderRadius: '50%',
              border: '2px solid #ff4444',
              boxShadow: '0 0 60px #ff4444',
            }}
          />
          {/* 血滴喷溅 */}
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={`blood-${i}`}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
              animate={{
                x: Math.cos((i / 20) * Math.PI * 2) * (180 + Math.random() * 120),
                y: Math.sin((i / 20) * Math.PI * 2) * (180 + Math.random() * 120),
                opacity: [0, 1, 0.7, 0],
                scale: [0, 1.4, 1, 0.5],
              }}
              transition={{ delay: 0.7 + i * 0.015, duration: 0.9 }}
              style={{
                position: 'absolute', top: '50%', left: '50%',
                width: 8 + Math.random() * 14,
                height: 8 + Math.random() * 14,
                background: i % 3 === 0 ? '#8b0000' : '#ff0000',
                borderRadius: '50%',
                boxShadow: '0 0 10px #8b0000',
              }}
            />
          ))}
          {/* F 弑神 文字 */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: [-20, -60], scale: [0.6, 1.4, 1.2] }}
            transition={{ delay: 1, duration: 1.2 }}
            style={{
              position: 'absolute', top: '30%', left: '50%',
              transform: 'translateX(-50%)',
              color: '#ff0000', fontSize: 36, fontWeight: 900,
              textShadow: '0 0 30px rgba(255,0,0,1), 0 0 60px rgba(255,0,0,0.6), 0 0 90px rgba(139,0,0,0.5)',
              fontFamily: '"Cinzel", serif', letterSpacing: 6,
            }}
          >
            ⚔ F 弑 神 ⚔
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

function AmbushBluff({ payload }: { payload: Record<string, unknown> }) {
  const isTruthful = payload.isTruthful as boolean;
  const declared = payload.declared as number | undefined;
  const atkRank = (payload.attackCard as { rank?: number })?.rank;
  const rankLabels = ['?','F','E','D','C','B','A'];
  const atkLabel = atkRank !== undefined ? rankLabels[atkRank] || '?' : '?';
  const declLabel = declared !== undefined ? rankLabels[declared] || '?' : '?';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.88)',
      }}
    >
      {/* 标题 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          color: '#b8860b', fontSize: 14, fontFamily: '"Cinzel", serif',
          letterSpacing: 3, marginBottom: 8,
        }}
      >
        声 明 「 {declLabel} 」
      </motion.div>

      {/* 卡牌容器 + 一刀切动画 */}
      <div style={{
        position: 'relative', width: 120, height: 170,
        marginBottom: 16,
      }}>
        {!isTruthful ? (
          // 拆穿成功（说谎）— 卡牌一刀切成两半
          <>
            {/* 上半 */}
            <motion.div
              initial={{ y: 0, x: 0, rotate: 0, opacity: 1 }}
              animate={{ y: -180, x: -60, rotate: -25, opacity: 0 }}
              transition={{ delay: 1.0, duration: 0.7, ease: 'easeOut' }}
              style={{
                position: 'absolute', top: 0, left: 0,
                width: 120, height: 85,
                background: 'linear-gradient(180deg, #4A0E17, #721C24)',
                border: '2px solid #b8860b',
                borderBottom: 'none',
                borderRadius: '10px 10px 0 0',
                clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 60%)',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                paddingTop: 12,
                fontSize: 36, color: '#ff6347', fontWeight: 900,
                fontFamily: '"Cinzel", serif',
                boxShadow: '0 0 20px rgba(255,0,0,0.5)',
              }}
            >
              {atkLabel}
            </motion.div>
            {/* 下半 */}
            <motion.div
              initial={{ y: 0, x: 0, rotate: 0, opacity: 1 }}
              animate={{ y: 180, x: 60, rotate: 25, opacity: 0 }}
              transition={{ delay: 1.0, duration: 0.7, ease: 'easeOut' }}
              style={{
                position: 'absolute', bottom: 0, left: 0,
                width: 120, height: 85,
                background: 'linear-gradient(180deg, #721C24, #4A0E17)',
                border: '2px solid #b8860b',
                borderTop: 'none',
                borderRadius: '0 0 10px 10px',
                clipPath: 'polygon(0 40%, 100% 0, 100% 100%, 0 100%)',
                fontSize: 14, color: '#aaa',
                fontFamily: '"Cinzel", serif',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                paddingBottom: 8,
                boxShadow: '0 0 20px rgba(255,0,0,0.5)',
              }}
            >
              圣物
            </motion.div>
            {/* 切割闪光斜线 */}
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: [0, 1.3, 1.3, 0], opacity: [0, 1, 1, 0] }}
              transition={{ delay: 0.8, duration: 0.6 }}
              style={{
                position: 'absolute', top: '50%', left: '-20%',
                width: '140%', height: 5,
                background: 'linear-gradient(90deg, transparent, #fff, #ff0000, #fff, transparent)',
                boxShadow: '0 0 25px rgba(255,255,255,0.9), 0 0 50px rgba(255,0,0,0.6)',
                transform: 'rotate(-15deg)',
                transformOrigin: 'center',
              }}
            />
            {/* 切口火花 */}
            {[...Array(14)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ x: 60, y: 85, opacity: 0, scale: 0 }}
                animate={{
                  x: 60 + (Math.random() - 0.5) * 200,
                  y: 85 + (Math.random() - 0.5) * 200,
                  opacity: [0, 1, 0],
                  scale: [0, 1.2, 0.3],
                  rotate: Math.random() * 360,
                }}
                transition={{ delay: 0.9 + i * 0.02, duration: 0.6 }}
                style={{
                  position: 'absolute',
                  width: 4 + Math.random() * 6,
                  height: 4 + Math.random() * 6,
                  background: i % 2 ? '#ff0000' : '#ffd700',
                  borderRadius: '50%',
                  boxShadow: '0 0 8px currentColor',
                }}
              />
            ))}
          </>
        ) : (
          // 拆穿失败（说真话）— 卡牌完整翻转，绿色光芒
          <motion.div
            initial={{ rotateY: 180, scale: 0.6 }}
            animate={{ rotateY: 0, scale: 1 }}
            transition={{ duration: 0.6 }}
            style={{
              width: 120, height: 170, borderRadius: 10,
              background: 'linear-gradient(180deg, #4A0E17, #721C24)',
              border: '3px solid #2ecc71',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 30px rgba(46,204,113,0.7)',
              fontFamily: '"Cinzel", serif',
            }}
          >
            <span style={{ fontSize: 48, color: '#2ecc71', fontWeight: 900 }}>{atkLabel}</span>
            <span style={{ fontSize: 11, color: '#2ecc71aa', marginTop: 4 }}>属实！</span>
          </motion.div>
        )}
      </div>

      {/* 结果文字 */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.3, duration: 0.4 }}
        style={{
          color: isTruthful ? '#e74c3c' : '#ffd700',
          fontSize: 28, fontWeight: 900,
          fontFamily: '"Cinzel", serif',
          textShadow: `0 0 24px ${isTruthful ? 'rgba(231,76,60,0.7)' : 'rgba(255,215,0,0.7)'}`,
          letterSpacing: 4,
        }}
      >
        {isTruthful ? '✗ 拆穿失败' : '⚔ 拆 穿 ⚔'}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6 }}
        style={{ color: '#ff8c00', fontSize: 13, marginTop: 8 }}
      >
        {isTruthful ? '说的是真话 — 防守方 -15 分' : '识破谎言 — 攻击方 -15 分，牌归防守方'}
      </motion.div>
    </motion.div>
  );
}

function AmbushFold({ payload }: { payload: Record<string, unknown> }) {
  const attackerName = (payload.attackerName as string) || '攻击方';
  const defenderName = (payload.defenderName as string) || '防守方';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(ellipse at center, rgba(40,30,10,0.55), rgba(0,0,0,0.92))',
      }}
    >
      {/* 颤抖的防守方"白旗" */}
      <motion.div
        initial={{ scale: 0, opacity: 0, rotate: 0 }}
        animate={{ scale: [0, 1.2, 1], opacity: 1, rotate: [-8, 8, -6, 6, -3, 3, 0] }}
        transition={{ duration: 0.9 }}
        style={{ fontSize: 80, marginBottom: 20 }}
      >
        😰
      </motion.div>

      {/* 攻击牌从中央回流到攻击方手牌方向 */}
      <motion.div
        initial={{ y: 0, x: 0, scale: 1, opacity: 1, rotateZ: 0 }}
        animate={{
          y: [0, -200, -300],
          x: [0, -100, -300],
          scale: [1, 0.9, 0.4],
          opacity: [1, 1, 0],
          rotateZ: [0, -180, -360],
        }}
        transition={{ delay: 0.5, duration: 1.2, ease: 'easeIn' }}
        style={{
          position: 'absolute', top: '40%',
          width: 70, height: 100, borderRadius: 8,
          background: 'linear-gradient(135deg, #1a0b2e, #2d1b4e)',
          border: '2px solid #b8860b',
          boxShadow: '0 0 25px rgba(184,134,11,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#b8860b', fontFamily: '"Cinzel", serif', fontSize: 12,
        }}
      >
        ↩ 收回
      </motion.div>

      {/* 偷牌阴影从对方手牌飞向攻击方 */}
      <motion.div
        initial={{ x: 200, y: -100, opacity: 0, scale: 0.6 }}
        animate={{
          x: [-200, -350],
          y: [-100, -300],
          opacity: [0, 0.85, 0.85, 0],
          scale: [0.6, 1, 0.5],
        }}
        transition={{ delay: 1.0, duration: 1.0 }}
        style={{
          position: 'absolute', top: '50%',
          width: 50, height: 70, borderRadius: 6,
          background: 'linear-gradient(180deg, rgba(20,20,20,0.9), rgba(0,0,0,0.95))',
          border: '1px dashed #555',
          boxShadow: '0 0 18px rgba(0,0,0,0.6)',
          fontSize: 11, color: '#888',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: '"Cinzel", serif',
        }}
      >
        👤 偷
      </motion.div>

      {/* 主标题 */}
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        style={{
          color: '#b8860b', fontSize: 28, fontWeight: 900,
          fontFamily: '"Cinzel", serif',
          textShadow: '0 0 20px rgba(184,134,11,0.6)',
          letterSpacing: 4,
        }}
      >
        💀 {defenderName} 怯 战
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        style={{
          color: '#ffd700', fontSize: 14, marginTop: 10,
          fontFamily: '"Cinzel", serif', letterSpacing: 2,
          textShadow: '0 0 10px rgba(255,215,0,0.4)',
        }}
      >
        {attackerName} 收回攻击牌 · 窃取 1 张 · 独吞悬赏金
      </motion.div>

      {/* 边缘金光暗影 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.3, 0] }}
        transition={{ delay: 0.4, duration: 1.6 }}
        style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(184,134,11,0.3) 100%)',
          mixBlendMode: 'screen',
          pointerEvents: 'none',
        }}
      />
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  深渊法案 VFX
// ═══════════════════════════════════════════════════════════

function BidComboBurst({ payload }: { payload: Record<string, unknown> }) {
  const combo = payload.combo as 'PAIR' | 'STRAIGHT' | 'TRIPLE';
  const power = payload.power as number;
  const labels: Record<string, { text: string; color: string; bonus: number }> = {
    PAIR: { text: '双 生 共 鸣', color: '#4488ff', bonus: 6 },
    STRAIGHT: { text: '三 阶 序 列', color: '#2ecc71', bonus: 10 },
    TRIPLE: { text: '绝 对 狂 热', color: '#e74c3c', bonus: 12 },
  };
  const cfg = labels[combo];
  if (!cfg) return null;

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: [0, 1.2, 1], opacity: 1 }}
      exit={{ opacity: 0, scale: 0.6 }}
      style={{
        position: 'absolute',
        top: '38%', left: '50%', transform: 'translate(-50%, -50%)',
        textAlign: 'center', pointerEvents: 'none',
      }}
    >
      <motion.div
        animate={{
          textShadow: [
            `0 0 10px ${cfg.color}`,
            `0 0 30px ${cfg.color}, 0 0 60px ${cfg.color}aa`,
            `0 0 10px ${cfg.color}`,
          ],
        }}
        transition={{ duration: 0.6, repeat: 2 }}
        style={{
          color: cfg.color,
          fontSize: 42, fontWeight: 900,
          fontFamily: '"Cinzel", serif',
          letterSpacing: 6,
        }}
      >
        {cfg.text}
      </motion.div>
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        style={{
          color: '#ffd700', fontSize: 22,
          fontFamily: '"Cinzel", serif', fontWeight: 900,
          marginTop: 12,
          textShadow: '0 0 15px rgba(255,215,0,0.8)',
        }}
      >
        +{cfg.bonus} 暴击 · 战力 {power}
      </motion.div>
    </motion.div>
  );
}


function DecreeAwarded({ payload }: { payload: Record<string, unknown> }) {
  const decree = payload.decree as { name?: string; emoji?: string };
  return (
    <motion.div
      initial={{ scale: 0.4, opacity: 0, y: 0 }}
      animate={{ scale: [0.4, 1.1, 1, 0.6], opacity: [0, 1, 1, 0], y: [0, 0, -40, -180] }}
      transition={{ duration: 1.8, ease: 'easeInOut' }}
      style={{
        position: 'absolute', top: '40%', left: '50%',
        transform: 'translate(-50%, -50%)',
        padding: '14px 28px', borderRadius: 12,
        background: 'linear-gradient(135deg, #2a1a3e, #1a0b2e)',
        border: '2px solid #b8860b',
        color: '#b8860b', fontFamily: '"Cinzel", serif',
        fontSize: 18, fontWeight: 700, letterSpacing: 3,
        boxShadow: '0 0 30px rgba(184,134,11,0.6)',
        textAlign: 'center', pointerEvents: 'none',
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 4 }}>{decree?.emoji}</div>
      📜 {decree?.name || '法案'} 归属
    </motion.div>
  );
}

function DecreeVoided({ payload }: { payload: Record<string, unknown> }) {
  const decree = payload.decree as { name?: string };
  return (
    <motion.div
      initial={{ opacity: 0, scale: 1 }}
      animate={{ opacity: [0, 1, 0.5, 0], scale: [1, 1.1, 0.8, 0.4], filter: ['blur(0px)', 'blur(0px)', 'blur(8px)', 'blur(20px)'] }}
      transition={{ duration: 1.5 }}
      style={{
        position: 'absolute', top: '38%', left: '50%',
        transform: 'translate(-50%, -50%)',
        padding: '14px 28px', borderRadius: 12,
        background: 'linear-gradient(135deg, #1a0b0b, #0d0000)',
        border: '2px solid #555',
        color: '#aaa', fontFamily: '"Cinzel", serif',
        fontSize: 16, letterSpacing: 3, pointerEvents: 'none',
      }}
    >
      🔥 [{decree?.name || '法案'}] 化为灰烬
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  命运骰子 (织梦者被动 FATE_DICE)
// ═══════════════════════════════════════════════════════════

function FateDiceRoll({ roll }: { roll: number }) {
  // 1=F, 2=E, 3=D, 4=C, 5=B, 6=A
  const rankLabel = ['F', 'E', 'D', 'C', 'B', 'A'][roll - 1] || '?';
  return (
    <>
      {/* 紫色虚空背景 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.65, 0.65, 0] }}
        transition={{ duration: 2.0 }}
        style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(75,0,130,0.7), rgba(0,0,0,0.92))',
        }}
      />
      {/* 标题 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: [0, 1, 1, 0], y: [-20, 0, 0, -10] }}
        transition={{ duration: 2.0 }}
        style={{
          position: 'absolute', top: '20%', left: '50%',
          transform: 'translateX(-50%)',
          color: '#c39bd3', fontFamily: '"Cinzel", serif',
          fontSize: 18, fontWeight: 900, letterSpacing: 6,
          textShadow: '0 0 18px rgba(155,89,182,0.8)',
          pointerEvents: 'none',
        }}
      >
        🔮 命运骰子 · 织梦者被动 🔮
      </motion.div>
      {/* 紫色星光粒子 */}
      {[...Array(16)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1.2, 0.4],
            x: [(Math.random() - 0.5) * 60, (Math.random() - 0.5) * 280],
            y: [(Math.random() - 0.5) * 60, (Math.random() - 0.5) * 280],
          }}
          transition={{ delay: 0.3 + i * 0.06, duration: 1.0 }}
          style={{
            position: 'absolute', top: '45%', left: '50%',
            width: 6, height: 6, borderRadius: '50%',
            background: '#c39bd3',
            boxShadow: '0 0 10px #9b59b6',
          }}
        />
      ))}
      {/* 骰子本体（先翻滚显示数字 1-6，再定格到结果） */}
      <motion.div
        initial={{ opacity: 0, rotate: -180, scale: 0.3 }}
        animate={{
          opacity: [0, 1, 1, 1, 0],
          rotate: [0, 540, 900, 1080, 1080],
          scale: [0.3, 1.4, 1.2, 1.0, 0.9],
        }}
        transition={{ duration: 2.0, times: [0, 0.3, 0.6, 0.85, 1] }}
        style={{
          position: 'absolute',
          top: '40%', left: '50%',
          transform: 'translateX(-50%)',
          width: 120, height: 120,
          borderRadius: 18,
          background: 'radial-gradient(circle, #4b0082, #1a0033)',
          border: '3px solid #9b59b6',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          fontFamily: '"Cinzel", serif',
          color: '#c39bd3', fontWeight: 900,
          boxShadow: '0 0 50px rgba(155,89,182,0.8), 0 0 90px rgba(75,0,130,0.5)',
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontSize: 56, lineHeight: 1, textShadow: '0 0 16px #9b59b6' }}>{roll}</div>
        <div style={{ fontSize: 14, letterSpacing: 4, marginTop: 4, color: '#ffd700' }}>
          → {rankLabel}
        </div>
      </motion.div>
      {/* 末尾结果文字 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 0, 1, 1, 0] }}
        transition={{ duration: 2.0, times: [0, 0.4, 0.7, 0.8, 0.95, 1] }}
        style={{
          position: 'absolute', top: '70%', left: '50%',
          transform: 'translateX(-50%)',
          color: '#ffd700', fontFamily: '"Cinzel", serif',
          fontSize: 14, fontWeight: 700, letterSpacing: 3,
          textShadow: '0 0 12px rgba(255,215,0,0.6)',
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}
      >
        ✦ 获得 {rankLabel} 级虚影牌（仅本回合有效）✦
      </motion.div>
    </>
  );
}
