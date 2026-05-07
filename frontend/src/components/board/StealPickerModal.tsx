/**
 * 偷牌选择 — 突袭怯战胜利方亲手从对手手牌(面朝下)中挑选 N 张
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';

export function StealPickerModal() {
  const gameState = useGameStore(s => s.gameState);
  const localPlayerId = useGameStore(s => s.localPlayerId);
  const confirmSteal = useGameStore(s => s.confirmSteal);

  const [selected, setSelected] = useState<string[]>([]);

  // 切换偷牌任务时清空选择
  useEffect(() => {
    setSelected([]);
  }, [gameState?.pendingSteal?.chooserId, gameState?.pendingSteal?.count]);

  if (!gameState || !gameState.pendingSteal) return null;
  const pending = gameState.pendingSteal;
  if (pending.chooserId !== localPlayerId) return null;

  const victim = gameState.players[pending.fromPlayerId];
  if (!victim) return null;

  const targetHand = victim.hand;

  const toggle = (id: string) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= pending.count) return prev; // 满了
      return [...prev, id];
    });
  };

  const onConfirm = () => {
    if (selected.length !== pending.count) return;
    confirmSteal(selected);
    setSelected([]);
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
          gap: 12,
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: '90vw',
          padding: 16,
          background: 'rgba(0,0,0,0.4)',
          borderRadius: 12,
          border: '1px solid #b8860b80',
        }}>
          {targetHand.map((card, i) => {
            const isSelected = selected.includes(card.id);
            return (
              <motion.div
                key={card.id}
                onClick={() => toggle(card.id)}
                whileHover={{ y: -8, scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                animate={isSelected
                  ? { y: -16, scale: 1.08, boxShadow: '0 0 24px rgba(255,215,0,0.7)' }
                  : { y: 0, scale: 1 }
                }
                initial={{ opacity: 0, y: 30 }}
                transition={{ delay: i * 0.05 }}
                style={{
                  width: 70, height: 100,
                  borderRadius: 8,
                  cursor: 'pointer',
                  border: isSelected ? '2px solid #ffd700' : '2px solid #5a3a2a',
                  background: isSelected
                    ? 'linear-gradient(135deg, #4a2a3a, #2d1b3e)'
                    : 'linear-gradient(135deg, #2a1a3a, #1a0b2e)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  color: '#5a3a8a',
                  position: 'relative',
                }}
              >
                {/* 卡背图案 */}
                <div style={{
                  fontFamily: '"Cinzel", serif',
                  color: isSelected ? '#ffd700' : '#5a3a8a',
                  textShadow: isSelected ? '0 0 8px rgba(255,215,0,0.7)' : 'none',
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: 1,
                }}>
                  ✦
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
      </motion.div>
    </AnimatePresence>
  );
}
