/**
 * 卡牌组件 — 暗黑哥特 / 塔罗牌质感（参考 V5 旧版圣物/元素/中坚配色）
 */
import { motion } from 'framer-motion';
import type { ICard } from '../../types/game';
import { CardRank } from '../../types/game';
import {
  getCardDisplayName, getRankColor, getRankBackground,
  getRankBorder, getRankSubtitle, getRankGlow,
} from '../../utils/deck';

interface CardProps {
  card: ICard;
  isSelected?: boolean;
  isDisabled?: boolean;
  isBlocked?: boolean;
  disabledReason?: string;
  isFaceDown?: boolean;
  isPhantom?: boolean;
  onClick?: (card: ICard) => void;
  size?: 'sm' | 'md' | 'lg';
}

export function Card({
  card,
  isSelected = false,
  isDisabled = false,
  isBlocked = false,
  disabledReason,
  isFaceDown = false,
  isPhantom = false,
  onClick,
  size = 'md',
}: CardProps) {
  const sizeMap = {
    sm: { w: 'calc(var(--card-w, 80px) * 0.75)', h: 'calc(var(--card-h, 112px) * 0.75)' },
    md: { w: 'var(--card-w, 80px)', h: 'var(--card-h, 112px)' },
    lg: { w: 'calc(var(--card-w, 80px) * 1.25)', h: 'calc(var(--card-h, 112px) * 1.25)' },
  };
  const { w, h } = sizeMap[size];
  const color = getRankColor(card.rank);
  const background = getRankBackground(card.rank);
  const borderColor = getRankBorder(card.rank);
  const glow = getRankGlow(card.rank);
  const subtitle = getRankSubtitle(card.rank);
  const name = getCardDisplayName(card.rank);

  const isAGlowing = card.rank === CardRank.A && !isFaceDown;

  return (
    <motion.div
      className={`card ${isSelected ? 'card--selected' : ''} ${isDisabled ? 'card--disabled' : ''}`}
      style={{
        width: w,
        height: h,
        borderRadius: 'clamp(4px, 1vw, 8px)',
        border: `2px solid ${isSelected ? '#ffd700' : isBlocked ? '#e74c3c' : borderColor}`,
        background: isFaceDown
          ? 'linear-gradient(135deg, #1a0b2e 0%, #2d1b4e 50%, #1a0b2e 100%)'
          : background,
        boxShadow: isSelected
          ? '0 0 20px rgba(255,215,0,0.6), inset 0 0 10px rgba(255,215,0,0.2)'
          : isBlocked
          ? '0 0 12px rgba(231,76,60,0.5)'
          : glow !== 'none' ? glow : '0 4px 12px rgba(0,0,0,0.5)',
        cursor: isDisabled ? 'not-allowed' : (onClick ? 'pointer' : 'default'),
        position: 'relative',
        overflow: 'hidden',
        opacity: isDisabled ? 0.4 : isPhantom ? 0.7 : 1,
        userSelect: 'none',
      }}
      title={isBlocked ? `被对手封锁 (含此牌咏唱将扣 ${card.baseScore * 3} 分)` : (isDisabled && disabledReason ? disabledReason : undefined)}
      onClick={() => {
        if (isDisabled) return;
        onClick?.(card);
      }}
      whileHover={!isDisabled ? { scale: 1.08, y: -8 } : undefined}
      whileTap={!isDisabled ? { scale: 0.95 } : undefined}
      animate={
        isAGlowing
          ? {
              y: isSelected ? -12 : 0,
              boxShadow: isSelected
                ? '0 0 20px rgba(255,215,0,0.6), inset 0 0 10px rgba(255,215,0,0.2)'
                : [
                    '0 0 12px rgba(139,105,20,0.4)',
                    '0 0 24px rgba(139,105,20,0.7)',
                    '0 0 12px rgba(139,105,20,0.4)',
                  ],
            }
          : (isSelected ? { y: -12 } : { y: 0 })
      }
      transition={
        isAGlowing && !isSelected
          ? { boxShadow: { duration: 3, repeat: Infinity, ease: 'easeInOut' } }
          : { type: 'spring', stiffness: 300, damping: 20 }
      }
      layout
    >
      {isFaceDown ? (
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size === 'lg' ? 32 : 24,
          color: '#3a1f5e',
        }}>
          ✦
        </div>
      ) : (
        <>
          {/* 左上角等级 */}
          <div style={{
            position: 'absolute', top: 4, left: 6,
            fontSize: size === 'lg' ? 18 : 14,
            fontWeight: 900,
            color,
            textShadow: `0 0 8px ${color}`,
            fontFamily: '"Cinzel", serif',
            zIndex: 2,
          }}>
            {name}
          </div>

          {/* 右上角小圆点 */}
          <div style={{
            position: 'absolute', top: 6, right: 6,
            width: size === 'lg' ? 8 : 6,
            height: size === 'lg' ? 8 : 6,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 6px ${color}`,
          }} />

          {/* 中央等级 + 副标题 */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center',
            zIndex: 2,
          }}>
            <div style={{
              fontSize: size === 'lg' ? 36 : size === 'md' ? 28 : 20,
              fontWeight: 900,
              color,
              textShadow: `0 0 14px ${color}, 0 0 24px ${color}50`,
              fontFamily: '"Cinzel", serif',
              lineHeight: 1,
            }}>
              {card.rank === CardRank.FLASH ? '⚡' : name}
            </div>
            <div style={{
              fontSize: size === 'lg' ? 11 : size === 'md' ? 10 : 9,
              color: `${color}cc`,
              marginTop: 2,
              letterSpacing: 1,
              fontFamily: '"Cinzel", serif',
            }}>
              {subtitle}
            </div>
          </div>

          {/* 右下角分数 */}
          <div style={{
            position: 'absolute', bottom: 4, right: 6,
            fontSize: size === 'lg' ? 11 : 9,
            color: `${color}aa`,
            fontFamily: 'monospace',
            zIndex: 2,
          }}>
            {card.rank !== CardRank.FLASH ? `${card.baseScore}` : '⚡'}
          </div>

          {/* 底部左下角等级 (倒置) */}
          <div style={{
            position: 'absolute', bottom: 4, left: 6,
            fontSize: size === 'lg' ? 14 : 11,
            fontWeight: 900,
            color,
            opacity: 0.4,
            transform: 'rotate(180deg)',
            fontFamily: '"Cinzel", serif',
          }}>
            {name}
          </div>

          {/* 顶部等级色条 */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: 3,
            background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
            opacity: card.rank >= CardRank.C ? 0.85 : 0.4,
          }} />

          {/* 虚影牌标记 */}
          {(card.isPhantom || isPhantom) && (
            <div style={{
              position: 'absolute', top: 0, left: 0,
              width: '100%', height: '100%',
              background: 'radial-gradient(circle, rgba(138,43,226,0.25) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />
          )}

          {/* 封锁罚分标记 */}
          {isBlocked && (
            <div style={{
              position: 'absolute', bottom: 18, left: '50%',
              transform: 'translateX(-50%)',
              padding: '1px 5px', borderRadius: 3,
              background: 'rgba(231,76,60,0.85)',
              color: '#fff', fontSize: 9, fontWeight: 700,
              whiteSpace: 'nowrap',
            }}>
              -{card.baseScore * 3}罚
            </div>
          )}

          {/* 哥特边框装饰 */}
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            border: '1px solid rgba(184, 134, 11, 0.2)',
            borderRadius: 6,
            pointerEvents: 'none',
          }} />
        </>
      )}
    </motion.div>
  );
}
