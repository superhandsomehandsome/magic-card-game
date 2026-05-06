/**
 * 卡牌组件 — 暗黑哥特 / 塔罗牌质感
 */
import { motion } from 'framer-motion';
import type { ICard } from '../../types/game';
import { CardRank } from '../../types/game';
import { getCardDisplayName, getRankColor } from '../../utils/deck';

interface CardProps {
  card: ICard;
  isSelected?: boolean;
  isDisabled?: boolean;
  isFaceDown?: boolean;
  isPhantom?: boolean;
  onClick?: (card: ICard) => void;
  size?: 'sm' | 'md' | 'lg';
}

export function Card({
  card,
  isSelected = false,
  isDisabled = false,
  isFaceDown = false,
  isPhantom = false,
  onClick,
  size = 'md',
}: CardProps) {
  const sizeMap = { sm: { w: 60, h: 84 }, md: { w: 80, h: 112 }, lg: { w: 100, h: 140 } };
  const { w, h } = sizeMap[size];
  const color = getRankColor(card.rank);
  const name = getCardDisplayName(card.rank);

  return (
    <motion.div
      className={`card ${isSelected ? 'card--selected' : ''} ${isDisabled ? 'card--disabled' : ''}`}
      style={{
        width: w,
        height: h,
        borderRadius: 8,
        border: `2px solid ${isSelected ? '#ffd700' : '#3a1f5e'}`,
        background: isFaceDown
          ? 'linear-gradient(135deg, #1a0b2e 0%, #2d1b4e 50%, #1a0b2e 100%)'
          : `linear-gradient(180deg, #0d0018 0%, #1a0b2e 100%)`,
        boxShadow: isSelected
          ? '0 0 20px rgba(255,215,0,0.6), inset 0 0 10px rgba(255,215,0,0.2)'
          : '0 4px 12px rgba(0,0,0,0.5)',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        overflow: 'hidden',
        opacity: isDisabled ? 0.4 : isPhantom ? 0.7 : 1,
        userSelect: 'none',
      }}
      onClick={() => !isDisabled && onClick?.(card)}
      whileHover={!isDisabled ? { scale: 1.08, y: -8 } : undefined}
      whileTap={!isDisabled ? { scale: 0.95 } : undefined}
      animate={isSelected ? { y: -12 } : { y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      layout
    >
      {isFaceDown ? (
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: '60%', height: '70%',
            border: '1px solid #b8860b',
            borderRadius: 4,
            background: 'repeating-linear-gradient(45deg, #1a0b2e, #1a0b2e 4px, #2d1b4e 4px, #2d1b4e 8px)',
          }} />
        </div>
      ) : (
        <>
          {/* 卡牌等级标识 */}
          <div style={{
            position: 'absolute', top: 4, left: 6,
            fontSize: size === 'lg' ? 18 : 14,
            fontWeight: 900,
            color,
            textShadow: `0 0 8px ${color}`,
            fontFamily: '"Cinzel", serif',
          }}>
            {name}
          </div>

          {/* 中央分数 */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: size === 'lg' ? 36 : size === 'md' ? 28 : 20,
            fontWeight: 900,
            color,
            textShadow: `0 0 15px ${color}, 0 0 30px ${color}40`,
            fontFamily: '"Cinzel", serif',
          }}>
            {card.rank === CardRank.FLASH ? '⚡' : card.baseScore}
          </div>

          {/* 底部装饰 */}
          <div style={{
            position: 'absolute', bottom: 4, right: 6,
            fontSize: size === 'lg' ? 18 : 14,
            fontWeight: 900,
            color,
            opacity: 0.6,
            transform: 'rotate(180deg)',
            fontFamily: '"Cinzel", serif',
          }}>
            {name}
          </div>

          {/* 虚影牌标记 */}
          {(card.isPhantom || isPhantom) && (
            <div style={{
              position: 'absolute', top: 0, left: 0,
              width: '100%', height: '100%',
              background: 'radial-gradient(circle, rgba(138,43,226,0.2) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />
          )}

          {/* 哥特边框装饰 */}
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            border: '1px solid rgba(184, 134, 11, 0.3)',
            borderRadius: 6,
            pointerEvents: 'none',
          }} />
        </>
      )}
    </motion.div>
  );
}
