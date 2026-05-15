/**
 * 商店 — 购买卡牌 / 移除卡牌
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoguelikeStore } from '../../store/roguelikeStore';
import { Card } from '../board/Card';
import { ROGUELIKE_CONSTANTS } from '../../types/roguelike';

interface ShopScreenProps {
  onLeave: () => void;
}

export function ShopScreen({ onLeave }: ShopScreenProps) {
  const run = useRoguelikeStore(s => s.run);
  const shopCards = useRoguelikeStore(s => s.shopCards);
  const shopBuyCard = useRoguelikeStore(s => s.shopBuyCard);
  const shopRemoveCard = useRoguelikeStore(s => s.shopRemoveCard);
  const [showRemove, setShowRemove] = useState(false);

  if (!run) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 20, padding: 20,
        overflowY: 'auto',
      }}
    >
      <h2 style={{
        color: '#27ae60', fontFamily: '"Cinzel", serif',
        margin: 0, fontSize: 22,
      }}>
        🏪 商店
      </h2>

      <div style={{ color: '#ffd700', fontSize: 14 }}>
        金币: {run.gold}
      </div>

      {/* Buy cards */}
      <div style={{
        display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center',
      }}>
        {shopCards.map((card) => {
          const cost = card.baseScore * 5;
          const canBuy = run.gold >= cost;
          return (
            <motion.div
              key={card.id}
              style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 6, opacity: canBuy ? 1 : 0.4,
              }}
              whileHover={canBuy ? { scale: 1.05 } : {}}
            >
              <div
                style={{ cursor: canBuy ? 'pointer' : 'not-allowed' }}
                onClick={() => canBuy && shopBuyCard(card)}
              >
                <Card card={card} size="md" />
              </div>
              <span style={{
                color: canBuy ? '#ffd700' : '#555',
                fontSize: 12, fontWeight: 700,
              }}>
                {cost} 金币
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Separator */}
      <div style={{ width: '80%', height: 1, background: '#2a1a3e' }} />

      {/* Remove card */}
      <motion.button
        onClick={() => setShowRemove(!showRemove)}
        style={{
          padding: '10px 24px', borderRadius: 8,
          border: '1px solid #e74c3c60',
          background: 'rgba(139,0,0,0.1)',
          color: '#e74c3c', fontSize: 13, cursor: 'pointer',
        }}
        whileHover={{ borderColor: '#e74c3c' }}
      >
        移除卡牌（{ROGUELIKE_CONSTANTS.SHOP_REMOVE_COST} 金币）
      </motion.button>

      <AnimatePresence>
        {showRemove && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{
              display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {run.deck.map((card) => (
              <div
                key={card.id}
                style={{ cursor: run.gold >= ROGUELIKE_CONSTANTS.SHOP_REMOVE_COST && run.deck.length > 5 ? 'pointer' : 'not-allowed' }}
                onClick={() => shopRemoveCard(card.id)}
              >
                <Card card={card} size="sm" />
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leave */}
      <motion.button
        onClick={onLeave}
        style={{
          padding: '12px 36px', borderRadius: 8, marginTop: 8,
          border: '2px solid #27ae60',
          background: 'transparent',
          color: '#27ae60', fontSize: 14, fontWeight: 700,
          cursor: 'pointer',
        }}
        whileHover={{ scale: 1.05 }}
      >
        离开商店
      </motion.button>
    </motion.div>
  );
}
