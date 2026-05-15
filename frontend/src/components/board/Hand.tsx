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
  /** 裸露法案：强制明牌，对手手牌也面朝上 */
  exposeHands?: boolean;
  /** 被对手封锁的 rank — 不再禁用，仅做罚分标记 */
  blockedRank?: number;
  onCardClick?: (card: ICard) => void;
}

export function Hand({ cards, isOpponent = false, exposeHands = false, blockedRank, onCardClick }: HandProps) {
  const selectedCards = useGameStore(s => s.selectedCards);
  const isLandscapeCompact = typeof window !== 'undefined' && window.innerHeight < 520 && window.innerWidth > window.innerHeight;
  const manyCards = cards.length > 6;

  return (
    <motion.div
      className="hand-scroll-x"
      style={{
        display: 'flex',
        gap: isLandscapeCompact ? 'clamp(1px, 0.3vw, 3px)' : 'clamp(2px, 0.4vw, 6px)',
        justifyContent: isLandscapeCompact ? 'flex-start' : 'center',
        alignItems: 'flex-end',
        padding: isLandscapeCompact ? '1px 2px 0' : 'clamp(2px, 0.8vh, 10px) 0',
        perspective: 1000,
        maxWidth: '100%',
      }}
    >
      <AnimatePresence>
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
              transition={{ type: 'spring', stiffness: 120, damping: 20, delay: index * 0.08 }}
              style={{ transformOrigin: 'bottom center' }}
            >
              <Card
                card={card}
                isFaceDown={isOpponent && !exposeHands}
                isSelected={isSelected}
                isBlocked={isBlocked}
                isPhantom={card.isPhantom}
                onClick={(isOpponent && !exposeHands) ? undefined : onCardClick}
                size="md"
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}
