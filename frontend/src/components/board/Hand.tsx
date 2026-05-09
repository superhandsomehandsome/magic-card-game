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
  /** 被对手封锁的 rank — 不再禁用，仅做罚分标记 */
  blockedRank?: number;
  onCardClick?: (card: ICard) => void;
}

export function Hand({ cards, isOpponent = false, blockedRank, onCardClick }: HandProps) {
  const selectedCards = useGameStore(s => s.selectedCards);

  return (
    <motion.div
      className="hand-scroll-x"
      style={{
        display: 'flex',
        gap: 'clamp(2px, 0.4vw, 6px)',
        justifyContent: 'center',
        alignItems: 'flex-end',
        padding: 'clamp(2px, 0.8vh, 10px) 0',
        perspective: 1000,
        maxWidth: '100%',
      }}
    >
      <AnimatePresence mode="popLayout">
        {cards.map((card, index) => {
          const isSelected = selectedCards.includes(card.id);
          const isBlocked = blockedRank !== undefined && card.rank === blockedRank;
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
                isBlocked={isBlocked}
                isPhantom={card.isPhantom}
                onClick={isOpponent ? undefined : onCardClick}
                size="md"
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}
