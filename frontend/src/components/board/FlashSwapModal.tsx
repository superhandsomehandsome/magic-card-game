/**
 * 瞬换牌弹窗 — 任意阶段（己方回合）可触发：
 * 选择 1-3 张手牌（不含瞬本身）替换为牌库随机抽取的同数量新牌。
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import type { ICard } from '../../types/game';
import { CardRank } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { Card } from './Card';

interface FlashSwapModalProps {
  flashCard: ICard;
  hand: ICard[];
  onClose: () => void;
}

export function FlashSwapModal({ flashCard, hand, onClose }: FlashSwapModalProps) {
  const flashSwap = useGameStore(s => s.flashSwap);
  const [selected, setSelected] = useState<string[]>([]);

  const swappable = hand.filter(c => c.id !== flashCard.id);

  const toggle = (id: string) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const handleConfirm = () => {
    if (selected.length === 0) return;
    flashSwap(flashCard.id, selected);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <motion.div
        initial={{ scale: 0.85, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.85, y: 20 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #1A0033, #4A148C, #1A0033)',
          border: '2px solid #CE93D8',
          borderRadius: 16,
          padding: 24, width: '90%', maxWidth: 520,
          boxShadow: '0 0 30px rgba(206,147,216,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span style={{ fontSize: 28 }}>⚡</span>
          <div>
            <h3 style={{
              color: '#CE93D8', fontFamily: '"Cinzel", serif',
              margin: 0, fontSize: 18, letterSpacing: 2,
            }}>
              瞬 — 换牌
            </h3>
            <div style={{ color: '#aaa', fontSize: 11, marginTop: 2 }}>
              选 1-3 张手牌（已选 {selected.length}/3），从牌库随机抽取等量新牌替换
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex', gap: 8, flexWrap: 'wrap',
          justifyContent: 'center', padding: 12,
          maxHeight: 280, overflowY: 'auto',
          borderRadius: 8,
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid #4A148C',
          marginBottom: 16,
        }}>
          {swappable.length === 0 ? (
            <div style={{ color: '#888', fontSize: 12, padding: 20 }}>
              没有可换的牌
            </div>
          ) : swappable.map(c => (
            <Card
              key={c.id}
              card={c}
              size="sm"
              isSelected={selected.includes(c.id)}
              onClick={() => toggle(c.id)}
            />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <motion.button
            onClick={handleConfirm}
            disabled={selected.length === 0}
            whileHover={selected.length > 0 ? { scale: 1.05 } : undefined}
            whileTap={selected.length > 0 ? { scale: 0.95 } : undefined}
            style={{
              padding: '10px 24px', borderRadius: 8,
              border: '2px solid #CE93D8',
              background: selected.length > 0
                ? 'linear-gradient(180deg, #4A148C, #2A0044)'
                : '#222',
              color: selected.length > 0 ? '#CE93D8' : '#555',
              fontWeight: 700, fontSize: 13,
              cursor: selected.length > 0 ? 'pointer' : 'not-allowed',
              fontFamily: '"Cinzel", serif',
              letterSpacing: 2,
            }}
          >
            ⚡ 确认换 {selected.length} 张
          </motion.button>
          <motion.button
            onClick={onClose}
            whileHover={{ scale: 1.05 }}
            style={{
              padding: '10px 24px', borderRadius: 8,
              border: '1px solid #666', background: 'transparent',
              color: '#aaa', fontSize: 12, cursor: 'pointer',
            }}
          >
            取消
          </motion.button>
        </div>

        <div style={{
          marginTop: 12, paddingTop: 10,
          borderTop: '1px solid #4A148C',
          color: '#888', fontSize: 10, textAlign: 'center', fontStyle: 'italic',
        }}>
          ⚠ 瞬牌将被弃置；若牌库不足按余量给牌
        </div>
      </motion.div>
    </motion.div>
  );
}

/** 监测点击瞬牌弹出 Modal 的 hook 工具 */
export function isFlashCard(card: ICard): boolean {
  return card.rank === CardRank.FLASH;
}
