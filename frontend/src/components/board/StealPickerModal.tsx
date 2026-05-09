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

  // 切换偷牌任务时清空状态
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
    // 获取选中的实际牌对象（用于翻牌展示）
    const cards = selected
      .map(id => targetHand.find(c => c.id === id))
      .filter((c): c is ICard => !!c);
    setRevealCards(cards);
    setPhase('REVEAL');
    // 翻牌展示 1.8s 后自动确认并关闭
    setTimeout(() => {
      confirmSteal(selected);
      setSelected([]);
      setPhase('PICK');
      setRevealCards([]);
    }, 1800);
  };

  const ready = selected.length === pending.count;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0, zIndex: 7500,
          background: 'radial-gradient(ellipse at center, rgba(50,8,8,0.85), rgba(0,0,0,0.93))',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 24, gap: 20,
        }}
      >
        {/* ─── 翻牌展示阶段 ─── */}
        {phase === 'REVEAL' && (
          <>
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{
                color: '#ffd700',
                fontFamily: '"Cinzel", "Noto Serif SC", serif',
                fontSize: 'clamp(18px, 3vw, 26px)',
                fontWeight: 900,
                letterSpacing: 4,
                textShadow: '0 0 24px rgba(255,215,0,0.8)',
              }}
            >
              ✦ 你得到了… ✦
            </motion.div>

            <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
              {revealCards.map((card, i) => (
                <motion.div
                  key={card.id}
                  initial={{ rotateY: 180, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  transition={{ delay: i * 0.25, duration: 0.5, type: 'spring' }}
                  style={{ perspective: 800 }}
                >
                  <Card card={card} size="lg" />
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.8, ease: 'easeInOut' }}
              style={{ color: '#ffaa44', fontSize: 14, letterSpacing: 2 }}
            >
              加入你的手牌…
            </motion.div>
          </>
        )}

        {/* ─── 盲选阶段 ─── */}
        {phase === 'PICK' && (
          <>
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              style={{
                color: '#ffd700',
                fontFamily: '"Cinzel", "Noto Serif SC", serif',
                fontSize: 'clamp(18px, 3vw, 28px)',
                fontWeight: 900,
                letterSpacing: 4,
                textShadow: '0 0 18px rgba(255,215,0,0.6)',
              }}
            >
              ☠ {victim.name} 怯战 ☠
            </motion.div>

            <div style={{
              color: '#ffaa44',
              fontSize: 14,
              letterSpacing: 2,
            }}>
              请挑选 {pending.count} 张敌方手牌偷走 ({selected.length}/{pending.count})
            </div>

            {/* 对方手牌（面朝下）— 玩家可点击 */}
            <div style={{
              display: 'flex',
              gap: 14,
              flexWrap: 'wrap',
              justifyContent: 'center',
              maxWidth: '90vw',
              padding: 20,
              background: 'rgba(20,5,40,0.85)',
              borderRadius: 14,
              border: '2px solid #ffd700',
              boxShadow: '0 0 24px rgba(255,215,0,0.35), inset 0 0 18px rgba(120,60,200,0.25)',
            }}>
              {targetHand.length === 0 && (
                <div style={{ color: '#888', fontSize: 13, padding: 16 }}>
                  对方已无手牌可偷
                </div>
              )}
              {targetHand.map((card, i) => {
                const isSelected = selected.includes(card.id);
                return (
                  <motion.div
                    key={card.id}
                    onClick={() => toggle(card.id)}
                    whileHover={{ y: -8, scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    animate={isSelected
                      ? { y: -16, scale: 1.08 }
                      : { y: 0, scale: 1 }
                    }
                    initial={{ opacity: 0, y: 30 }}
                    transition={{ delay: i * 0.08 }}
                    style={{
                      width: 76, height: 108,
                      borderRadius: 10,
                      cursor: 'pointer',
                      border: isSelected ? '3px solid #ffd700' : '2px solid #c4a0ff',
                      background: isSelected
                        ? 'linear-gradient(135deg, #6a4080, #4a2b6e)'
                        : 'linear-gradient(135deg, #4a2f8e, #3a1f6e 50%, #2a1450)',
                      boxShadow: isSelected
                        ? '0 0 24px rgba(255,215,0,0.85), inset 0 0 14px rgba(255,215,0,0.4)'
                        : '0 0 14px rgba(180,140,255,0.7), inset 0 0 10px rgba(180,140,255,0.25)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      gap: 4,
                    }}
                  >
                    {/* 卡背图案 + 编号让卡片明显 */}
                    <div style={{
                      fontFamily: '"Cinzel", serif',
                      color: isSelected ? '#ffd700' : '#e8d4ff',
                      textShadow: isSelected
                        ? '0 0 14px rgba(255,215,0,1)'
                        : '0 0 12px rgba(220,180,255,1)',
                      fontSize: 30,
                      fontWeight: 900,
                      letterSpacing: 1,
                      lineHeight: 1,
                    }}>
                      ✦
                    </div>
                    <div style={{
                      fontFamily: 'monospace',
                      color: isSelected ? '#ffd700' : '#b8a0e0',
                      fontSize: 11,
                      letterSpacing: 1,
                    }}>
                      #{i + 1}
                    </div>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        style={{
                          position: 'absolute',
                          top: 4, right: 4,
                          width: 18, height: 18,
                          borderRadius: '50%',
                          background: '#ffd700',
                          color: '#1a0b2e',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 900,
                        }}
                      >
                        {selected.indexOf(card.id) + 1}
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            <motion.button
              onClick={onConfirm}
              disabled={!ready}
              whileHover={ready ? { scale: 1.08 } : undefined}
              whileTap={ready ? { scale: 0.95 } : undefined}
              style={{
                padding: '14px 36px',
                borderRadius: 8,
                border: ready ? '1px solid #ffd700' : '1px solid #555',
                background: ready
                  ? 'linear-gradient(180deg, #4a3a1e, #2d1b0e)'
                  : '#222',
                color: ready ? '#ffd700' : '#666',
                fontFamily: '"Cinzel", serif',
                fontWeight: 900,
                fontSize: 16,
                letterSpacing: 4,
                cursor: ready ? 'pointer' : 'not-allowed',
                boxShadow: ready ? '0 0 20px rgba(255,215,0,0.4)' : 'none',
              }}
            >
              {ready ? '✦ 确认偷取 ✦' : `选 ${pending.count - selected.length} 张`}
            </motion.button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
