/**
 * 当前阶段指示器
 */
import { motion } from 'framer-motion';
import { GamePhase } from '../../types/game';

interface PhaseIndicatorProps {
  phase: GamePhase;
}

const PHASE_INFO: Record<GamePhase, { label: string; icon: string; color: string }> = {
  [GamePhase.IDLE]: { label: '准备中', icon: '⏳', color: '#666' },
  [GamePhase.HERO_SELECT]: { label: '英雄选择', icon: '⚔️', color: '#ffd700' },
  [GamePhase.BOUNTY_ROLL]: { label: '喋血悬赏', icon: '🎲', color: '#8b0000' },
  [GamePhase.DRAW_MARKET]: { label: '汲取与黑市', icon: '🃏', color: '#b8860b' },
  [GamePhase.AMBUSH_DECLARE]: { label: '突袭宣告', icon: '⚡', color: '#ff4500' },
  [GamePhase.AMBUSH_DEFEND]: { label: '突袭抉择', icon: '🛡️', color: '#ff6347' },
  [GamePhase.CHANT_SCORE]: { label: '咏唱计分', icon: '✨', color: '#9b59b6' },
  [GamePhase.BLOCKADE_END]: { label: '明牌封锁', icon: '🔒', color: '#2ecc71' },
  [GamePhase.COLLISION]: { label: '魔力对撞', icon: '💥', color: '#e74c3c' },
  [GamePhase.GAME_OVER]: { label: '终局', icon: '🏆', color: '#ffd700' },
};

export function PhaseIndicator({ phase }: PhaseIndicatorProps) {
  const info = PHASE_INFO[phase];

  return (
    <motion.div
      key={phase}
      initial={{ opacity: 0, y: -20, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 20px',
        borderRadius: 20,
        background: 'rgba(26, 11, 46, 0.9)',
        border: `1px solid ${info.color}40`,
        boxShadow: `0 0 20px ${info.color}20`,
      }}
    >
      <span style={{ fontSize: 20 }}>{info.icon}</span>
      <span style={{
        color: info.color,
        fontFamily: '"Cinzel", serif',
        fontWeight: 700,
        fontSize: 14,
        letterSpacing: 1,
      }}>
        {info.label}
      </span>
    </motion.div>
  );
}
