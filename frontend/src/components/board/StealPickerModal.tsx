/**
 * 偷牌选择 — 突袭怯战胜利方亲手从对手手牌(面朝下)中挑选 N 张
 * 流程：盲选 → 点"确认偷取" → 翻牌动画展示所选牌面 → 自动入手
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ICard } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { Card } from '../board/Card';

type ModalPhase = 'PICK' | 'REVEAL';

export function StealPickerModal() {
  const gameState = useGameStore(s => s.gameState);
  const localPlayerId = useGameStore(s => s.localPlayerId);
  const confirmSteal = useGameStore(s => s.confirmSteal);

  const [selected, setSelected] = useState<string[]>([]);
  const [phase, setPhase] = useState<ModalPhase>('PICK');
  const [revealCards, setRevealCards] = useState<ICard[]>([]);

  useEffect(() => {
    setSelected([]);
    setPhase('PICK');
    setRevealCards([]);
  }, [gameState?.pendingSteal?.chooserId, gameState?.pendingSteal?.count]);

  if (!gameState || !gameState.pendingSteal) return null;
  const pending = gameState.pendingSteal;
  if (pending.chooserId !== localPlayerId) return null;

  const victim = gameState.players[pending.fromPlayerId];
  if (!victim) return null;

  const targetHand = victim.hand;

  const toggle = (id: string) => {
    if (phase !== 'PICK') return;
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= pending.count) return prev;
      return [...prev, id];
    });
  };

  const onConfirm = () => {
    if (selected.length !== pending.count) return;
    const cards = selected
      .map(id => targetHand.find(c => c.id === id))
      .filter((c): c is ICard => !!c);
    setRevealCards(cards);
    setPhase('REVEAL');
    setTimeout(() => {
      confirmSteal(selected);
      setSelected([]);
      setPhase('PICK');
      setRevealCards([]);
    }, 2200);
  };

  const ready = selected.length === pending.count;

  return (
    <AnimatePresence>
      <motion.div
        key="steal-modal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0, zIndex: 7500,
          background: 'radial-gradient(ellipse at 50% 30%, rgba(80,10,10,0.92), rgba(0,0,0,0.97))',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 24, gap: 0,
        }}
      >
        {/* ─── 翻牌展示阶段 ─── */}
        {phase === 'REVEAL' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', bounce: 0.4 }}
              style={{
                color: '#ffd700',
                fontFamily: '"Cinzel", serif',
                fontSize: 'clamp(20px, 4vw, 30px)',
                fontWeight: 900,
                letterSpacing: 6,
                textShadow: '0 0 30px rgba(255,215,0,0.9)',
              }}
            >
              ✦ 战利品到手 ✦
            </motion.div>

            <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
              {revealCards.map((card, i) => (
                <motion.div
                  key={card.id}
                  initial={{ rotateY: 180, opacity: 0, scale: 0.7 }}
                  animate={{ rotateY: 0, opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.3, duration: 0.6, type: 'spring' }}
                  style={{ filter: 'drop-shadow(0 0 18px rgba(255,215,0,0.7))' }}
                >
                  <Card card={card} size="lg" />
                </motion.div>
              ))}
            </div>

            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              style={{ color: '#ffaa44', fontSize: 13, letterSpacing: 3 }}
            >
              已加入你的手牌…
            </motion.div>
          </motion.div>
        )}

        {/* ─── 盲选阶段 ─── */}
        {phase === 'PICK' && (
          <>
            {/* 标题区 */}
            <motion.div
              initial={{ y: -24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 8, marginBottom: 24,
              }}
            >
              <div style={{
                color: '#ff4444',
                fontFamily: '"Cinzel", serif',
                fontSize: 'clamp(18px, 3.5vw, 28px)',
                fontWeight: 900,
                letterSpacing: 4,
                textShadow: '0 0 24px rgba(255,60,60,0.8)',
              }}>
                ⚔ 突袭胜利
              </div>
              <div style={{
                color: '#ffd700',
                fontSize: 'clamp(13px, 2vw, 16px)',
                letterSpacing: 2,
                fontWeight: 600,
              }}>
                {victim.name} 怯战认输 — 请挑选战利品
              </div>
              {/* 进度指示 */}
              <div style={{
                display: 'flex', gap: 8, alignItems: 'center',
                marginTop: 4,
              }}>
                {Array.from({ length: pending.count }).map((_, i) => (
                  <motion.div
                    key={i}
                    animate={selected.length > i
                      ? { scale: [1, 1.3, 1], backgroundColor: '#ffd700' }
                      : { backgroundColor: '#3a2a00' }
                    }
                    transition={{ duration: 0.3 }}
                    style={{
                      width: 12, height: 12, borderRadius: '50%',
                      border: '2px solid #b8860b',
                    }}
                  />
                ))}
                <span style={{ color: '#b8860b', fontSize: 12, marginLeft: 4 }}>
                  已选 {selected.length} / {pending.count}
                </span>
              </div>
            </motion.div>

            {/* 对方手牌区（面朝下） */}
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              style={{
                display: 'flex',
                gap: 'clamp(10px, 2vw, 18px)',
                flexWrap: 'wrap',
                justifyContent: 'center',
                maxWidth: '92vw',
                padding: 'clamp(16px, 3vw, 28px)',
                background: 'rgba(10,0,20,0.7)',
                borderRadius: 16,
                border: '2px solid rgba(255,215,0,0.35)',
                boxShadow: '0 0 30px rgba(255,150,0,0.12), inset 0 0 24px rgba(80,30,120,0.2)',
                marginBottom: 24,
              }}
            >
              {targetHand.length === 0 ? (
                <div style={{ color: '#888', fontSize: 13, padding: '20px 40px' }}>
                  对方已无手牌可偷
                </div>
              ) : (
                targetHand.map((card, i) => {
                  const isSelected = selected.includes(card.id);
                  const selOrder = selected.indexOf(card.id);
                  const canSelect = !isSelected && selected.length < pending.count;

                  return (
                    <motion.div
                      key={card.id}
                      onClick={() => toggle(card.id)}
                      initial={{ opacity: 0, y: 28 }}
                      animate={{
                        opacity: 1,
                        y: isSelected ? -14 : 0,
                        scale: isSelected ? 1.1 : 1,
                        rotateZ: isSelected ? [-1, 1, -1, 0] : 0,
                      }}
                      transition={{
                        opacity: { delay: i * 0.07, duration: 0.35 },
                        y: { delay: i * 0.07, duration: 0.35 },
                        rotateZ: isSelected ? { duration: 0.5, repeat: Infinity, repeatType: 'mirror' } : { duration: 0.2 },
                        scale: { duration: 0.25 },
                      }}
                      whileHover={canSelect ? { y: -10, scale: 1.06 } : isSelected ? {} : { scale: 0.97 }}
                      whileTap={{ scale: 0.93 }}
                      style={{
                        width: 'clamp(60px, 10vw, 82px)',
                        height: 'clamp(86px, 14vw, 116px)',
                        borderRadius: 10,
                        cursor: 'pointer',
                        position: 'relative',
                        flexShrink: 0,
                        /* 卡背渐变 — 明显的紫色调 */
                        background: isSelected
                          ? 'linear-gradient(145deg, #7a3a10 0%, #5a2a08 40%, #3a1a04 100%)'
                          : 'linear-gradient(145deg, #5c35a0 0%, #3e2278 45%, #2a1358 100%)',
                        border: isSelected
                          ? '3px solid #ffd700'
                          : '2px solid #9b6bdf',
                        boxShadow: isSelected
                          ? '0 0 28px rgba(255,215,0,0.85), 0 6px 20px rgba(0,0,0,0.5), inset 0 0 18px rgba(255,200,60,0.3)'
                          : '0 0 18px rgba(140,90,230,0.55), 0 4px 12px rgba(0,0,0,0.4), inset 0 0 12px rgba(150,100,255,0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        userSelect: 'none',
                      }}
                    >
                      {/* 卡背纹路 */}
                      <div style={{
                        position: 'absolute', inset: 4,
                        borderRadius: 7,
                        border: `1px solid ${isSelected ? 'rgba(255,215,0,0.25)' : 'rgba(180,140,255,0.18)'}`,
                        pointerEvents: 'none',
                      }} />

                      {/* 符文图标 */}
                      <motion.div
                        animate={{ opacity: [0.6, 1, 0.6] }}
                        transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                        style={{
                          fontSize: 'clamp(22px, 4vw, 30px)',
                          color: isSelected ? '#ffd700' : '#c4a0ff',
                          textShadow: isSelected
                            ? '0 0 16px rgba(255,215,0,1)'
                            : '0 0 14px rgba(200,160,255,0.9)',
                          lineHeight: 1,
                        }}
                      >
                        {isSelected ? '✦' : '✧'}
                      </motion.div>

                      {/* 编号 */}
                      <div style={{
                        color: isSelected ? '#ffd700' : '#9b79d4',
                        fontSize: 'clamp(9px, 1.5vw, 12px)',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        letterSpacing: 1,
                      }}>
                        #{i + 1}
                      </div>

                      {/* 已选标记 */}
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0, rotate: -90 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ type: 'spring', bounce: 0.5 }}
                          style={{
                            position: 'absolute',
                            top: -8, right: -8,
                            width: 22, height: 22,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #ffd700, #ff8800)',
                            color: '#1a0b00',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 900,
                            boxShadow: '0 0 10px rgba(255,180,0,0.8)',
                          }}
                        >
                          {selOrder + 1}
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })
              )}
            </motion.div>

            {/* 提示文字 */}
            {!ready && targetHand.length > 0 && (
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.6, repeat: Infinity }}
                style={{
                  color: '#888', fontSize: 12, letterSpacing: 2,
                  marginBottom: 16,
                }}
              >
                点击卡背挑选 {pending.count - selected.length} 张
              </motion.div>
            )}

            {/* 确认按钮 */}
            <motion.button
              onClick={onConfirm}
              disabled={!ready}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              whileHover={ready ? { scale: 1.07, boxShadow: '0 0 28px rgba(255,215,0,0.65)' } : undefined}
              whileTap={ready ? { scale: 0.94 } : undefined}
              style={{
                padding: 'clamp(10px, 2vw, 16px) clamp(24px, 5vw, 44px)',
                borderRadius: 10,
                border: ready ? '2px solid #ffd700' : '1px solid #444',
                background: ready
                  ? 'linear-gradient(180deg, #5a3800, #3a2000)'
                  : 'rgba(30,20,40,0.6)',
                color: ready ? '#ffd700' : '#555',
                fontFamily: '"Cinzel", serif',
                fontWeight: 900,
                fontSize: 'clamp(13px, 2.5vw, 17px)',
                letterSpacing: ready ? 4 : 2,
                cursor: ready ? 'pointer' : 'not-allowed',
                transition: 'all 0.25s',
              }}
            >
              {ready ? '⚔ 确认偷取 ⚔' : `还需选 ${pending.count - selected.length} 张`}
            </motion.button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
