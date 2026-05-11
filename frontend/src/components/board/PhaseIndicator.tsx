/**
 * 当前阶段指示器 — 每阶段有独特边框+脉冲+提示语
 */
import { motion } from 'framer-motion';
import { GamePhase } from '../../types/game';

interface PhaseIndicatorProps {
  phase: GamePhase;
}

const PHASE_INFO: Record<GamePhase, { label: string; icon: string; color: string; hint: string }> = {
  [GamePhase.IDLE]: { label: '准备中', icon: '⏳', color: '#666', hint: '' },
  [GamePhase.HERO_SELECT]: { label: '英雄选择', icon: '⚔️', color: '#ffd700', hint: '选择你的英雄' },
  [GamePhase.DECREE_CONTEST]: { label: '法案争夺', icon: '📜', color: '#e74c3c', hint: '决定是否争夺法案' },
  [GamePhase.BOUNTY_ROLL]: { label: '喋血悬赏', icon: '🎲', color: '#8b0000', hint: '悬赏金注入奖池' },
  [GamePhase.DRAW_MARKET]: { label: '汲取与黑市', icon: '🃏', color: '#b8860b', hint: '抽牌 + 黑市交易' },
  [GamePhase.AMBUSH_DECLARE]: { label: '突袭宣告', icon: '⚡', color: '#ff4500', hint: '从手牌选牌发起突袭' },
  [GamePhase.AMBUSH_DEFEND]: { label: '突袭抉择', icon: '🛡️', color: '#ff6347', hint: '怯战/拆穿/迎战' },
  [GamePhase.CHANT_SCORE]: { label: '咏唱计分', icon: '✨', color: '#9b59b6', hint: '选牌组合凑分' },
  [GamePhase.BLOCKADE_END]: { label: '明牌封锁', icon: '🔒', color: '#2ecc71', hint: '从手牌选牌封锁对手' },
  [GamePhase.COLLISION]: { label: '魔力对撞', icon: '💥', color: '#e74c3c', hint: '终局对决！' },
  [GamePhase.GAME_OVER]: { label: '终局', icon: '🏆', color: '#ffd700', hint: '' },
};

export function PhaseIndicator({ phase }: PhaseIndicatorProps) {
  const info = PHASE_INFO[phase];
  const isAction = phase === GamePhase.AMBUSH_DECLARE || phase === GamePhase.AMBUSH_DEFEND || phase === GamePhase.COLLISION;

  return (
    <motion.div
      key={phase}
      initial={{ opacity: 0, y: -20, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <motion.div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 18px',
          borderRadius: 20,
          background: 'rgba(26, 11, 46, 0.9)',
          border: `2px solid ${info.color}`,
          boxShadow: `0 0 12px ${info.color}50`,
        }}
        animate={isAction ? {
          boxShadow: [`0 0 8px ${info.color}40`, `0 0 20px ${info.color}90`, `0 0 8px ${info.color}40`],
        } : {}}
        transition={isAction ? { duration: 1.2, repeat: Infinity } : undefined}
      >
        <span style={{ fontSize: 18 }}>{info.icon}</span>
        <span style={{
          color: info.color,
          fontFamily: '"Cinzel", serif',
          fontWeight: 900,
          fontSize: 13,
          letterSpacing: 2,
        }}>
          {info.label}
        </span>
      </motion.div>
      {info.hint && (
        <span style={{
          color: `${info.color}aa`,
          fontSize: 10,
          letterSpacing: 1,
        }}>
          {info.hint}
        </span>
      )}
    </motion.div>
  );
}
