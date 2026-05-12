/**
 * v2.1 原型 — 卡牌组件
 */
import { motion } from 'framer-motion';
import type { Card } from '../protoTypes';
import { Rank } from '../protoTypes';
import { rankName } from '../protoEngine';

const RANK_COLORS: Record<number, string> = {
  [Rank.A]: '#b8860b',
  [Rank.B]: '#c0392b',
  [Rank.C]: '#8e44ad',
  [Rank.D]: '#2980b9',
  [Rank.E]: '#27ae60',
  [Rank.F]: '#7f8c8d',
  [Rank.FLASH]: '#e67e22',
};

interface Props {
  card: Card;
  selected?: boolean;
  disabled?: boolean;
  faceDown?: boolean;
  sealed?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md';
}

export function ProtoCard({ card, selected, disabled, faceDown, sealed, onClick, size = 'md' }: Props) {
  const color = RANK_COLORS[card.rank] || '#888';
  const w = size === 'sm' ? 48 : 60;
  const h = size === 'sm' ? 68 : 84;

  if (faceDown) {
    return (
      <div style={{
        width: w, height: h, borderRadius: 6,
        border: '2px solid #3a1f5e',
        background: 'linear-gradient(135deg, #1a0b2e, #2d1b4e)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#3a1f5e', fontSize: 18,
      }}>
        ✦
      </div>
    );
  }

  return (
    <motion.div
      onClick={disabled ? undefined : onClick}
      whileHover={!disabled && onClick ? { scale: 1.1, y: -6 } : undefined}
      whileTap={!disabled && onClick ? { scale: 0.95 } : undefined}
      style={{
        width: w, height: h, borderRadius: 6,
        border: `2px solid ${selected ? '#ffd700' : sealed ? '#e74c3c' : color + '80'}`,
        background: sealed
          ? 'linear-gradient(135deg, rgba(231,76,60,0.15), #1a0b2e)'
          : `linear-gradient(135deg, #0d0018, ${color}15)`,
        boxShadow: selected
          ? '0 0 16px rgba(255,215,0,0.5)'
          : sealed ? '0 0 10px rgba(231,76,60,0.4)' : 'none',
        cursor: disabled ? 'default' : onClick ? 'pointer' : 'default',
        opacity: disabled ? 0.4 : 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        position: 'relative', userSelect: 'none',
        transform: selected ? 'translateY(-8px)' : undefined,
        transition: 'transform 0.2s',
      }}
    >
      <div style={{
        fontSize: size === 'sm' ? 18 : 24, fontWeight: 900,
        color, fontFamily: '"Cinzel", serif',
        textShadow: `0 0 8px ${color}80`,
      }}>
        {card.rank === Rank.FLASH ? '⚡' : rankName(card.rank)}
      </div>
      <div style={{ fontSize: 9, color: `${color}cc`, marginTop: 2 }}>
        {card.rank === Rank.FLASH ? 'FLASH' : card.baseScore}
      </div>
      {sealed && (
        <div style={{
          position: 'absolute', top: 2, right: 2,
          fontSize: 8, color: '#e74c3c', fontWeight: 700,
        }}>
          封
        </div>
      )}
      {card.isPhantom && (
        <div style={{
          position: 'absolute', bottom: 2, fontSize: 8, color: '#9b59b6',
        }}>
          虚
        </div>
      )}
    </motion.div>
  );
}
