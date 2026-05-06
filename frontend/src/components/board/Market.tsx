/**
 * 黑市区域组件 — 3张明牌槽位
 */
import { motion } from 'framer-motion';
import type { ICard } from '../../types/game';
import { Card } from './Card';

interface MarketProps {
  cards: ICard[];
  onCardClick?: (card: ICard) => void;
}

export function Market({ cards, onCardClick }: MarketProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
    }}>
      <motion.h3
        style={{
          color: '#b8860b',
          fontFamily: '"Cinzel", serif',
          fontSize: 14,
          letterSpacing: 2,
          textTransform: 'uppercase',
          margin: 0,
        }}
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        ⛧ 黑市 ⛧
      </motion.h3>
      <div style={{ display: 'flex', gap: 12 }}>
        {cards.map(card => (
          <motion.div
            key={card.id}
            whileHover={{ scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            <Card
              card={card}
              onClick={onCardClick}
              size="md"
            />
          </motion.div>
        ))}
        {/* 空槽位占位 */}
        {Array.from({ length: 3 - cards.length }).map((_, i) => (
          <div
            key={`empty-${i}`}
            style={{
              width: 80,
              height: 112,
              borderRadius: 8,
              border: '2px dashed #3a1f5e',
              background: 'rgba(26, 11, 46, 0.5)',
            }}
          />
        ))}
      </div>
    </div>
  );
}
