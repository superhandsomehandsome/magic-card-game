/**
 * 手牌区组件
 */
import { motion, AnimatePresence } from 'framer-motion';
import type { ICard } from '../../types/game';
import { Card } from './Card';
import { useGameStore } from '../../store/gameStore';

interface HandProps {
  cards: ICard[];
  isOpponent?: boolean;
  disabledRanks?: number[];
  onCardClick?: (card: ICard) => void;
}

export function Hand({ cards, isOpponent = false, disabledRanks = [], onCardClick }: HandProps) {
  const selectedCards = useGameStore(s => s.selectedCards);

  return (
    <motion.div
      style={{
        display: 'flex',
        gap: 8,
        justifyContent: 'center',
        alignItems: 'flex-end',
        padding: '16px 0',
        perspective: 1000,
      }}
    >
      <AnimatePresence mode="popLayout">
        {cards.map((card, index) => {
          const isSelected = selectedCards.includes(card.id);
          const isDisabled = disabledRanks.includes(card.rank);
          const rotation = (index - (cards.length - 1) / 2) * 3;

          return (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 50, rotateY: 180 }}
              animate={{
                opacity: 1,
                y: 0,
                rotateY: 0,
                rotate: isOpponent ? 0 : rotation,
              }}
              exit={{ opacity: 0, y: -50, scale: 0.5 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: index * 0.05 }}
              style={{ transformOrigin: 'bottom center' }}
            >
              <Card
                card={card}
                isFaceDown={isOpponent}
                isSelected={isSelected}
                isDisabled={isDisabled}
                disabledReason={isDisabled ? '被规则封锁' : undefined}
                isPhantom={card.isPhantom}
                onClick={onCardClick}
                size="md"
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}
