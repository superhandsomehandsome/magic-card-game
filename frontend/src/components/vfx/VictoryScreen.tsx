/**
 * 终局胜利演出 — 英雄动态立绘 + 数据统计面板
 */
import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { HeroType } from '../../types/game';

const HERO_INFO: Record<HeroType, { name: string; title: string; color: string; icon: string }> = {
  [HeroType.PHANTOM]: { name: '奥术怪盗', title: 'Arcane Phantom', color: '#b8860b', icon: '🎭' },
  [HeroType.WEAVER]: { name: '命运织梦者', title: 'Fate Weaver', color: '#9b59b6', icon: '🔮' },
  [HeroType.INQUISITOR]: { name: '至高审判官', title: 'Supreme Inquisitor', color: '#8b0000', icon: '⚖️' },
  [HeroType.SINGER]: { name: '以太歌者', title: 'Aether Singer', color: '#4488ff', icon: '🎵' },
};

export function VictoryScreen() {
  const gameState = useGameStore(s => s.gameState);

  if (!gameState) return null;

  const playerIds = Object.keys(gameState.players);
  const winner = playerIds
    .map(id => gameState.players[id])
    .sort((a, b) => b.score - a.score)[0];

  const loser = playerIds
    .map(id => gameState.players[id])
    .find(p => p.id !== winner.id)!;

  const heroInfo = HERO_INFO[winner.hero];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1.5, duration: 1 }}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.85), #000)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        gap: 32,
      }}
    >
      {/* 英雄图标 */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 2, type: 'spring', stiffness: 200 }}
        style={{
          fontSize: 100,
          filter: `drop-shadow(0 0 40px ${heroInfo.color})`,
        }}
      >
        {heroInfo.icon}
      </motion.div>

      {/* VICTORY 标题 */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.5, duration: 0.8 }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <motion.h1
          style={{
            color: '#ffd700',
            fontFamily: '"Cinzel", serif',
            fontSize: 56,
            fontWeight: 900,
            margin: 0,
            letterSpacing: 8,
            textShadow: '0 0 30px rgba(255,215,0,0.6), 0 0 60px rgba(255,215,0,0.3)',
          }}
          animate={{
            textShadow: [
              '0 0 30px rgba(255,215,0,0.6)',
              '0 0 60px rgba(255,215,0,0.9)',
              '0 0 30px rgba(255,215,0,0.6)',
            ],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          VICTORY
        </motion.h1>
        <div style={{ color: heroInfo.color, fontSize: 20, fontFamily: '"Cinzel", serif' }}>
          {heroInfo.name} — {heroInfo.title}
        </div>
      </motion.div>

      {/* 数据统计面板 */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 3, duration: 0.6 }}
        style={{
          background: 'rgba(26, 11, 46, 0.9)',
          border: '2px solid #b8860b',
          borderRadius: 16,
          padding: 32,
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: 16,
          minWidth: 400,
        }}
      >
        {/* 胜者 */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#ffd700', fontSize: 16, fontWeight: 700 }}>{winner.name}</div>
          <div style={{ color: heroInfo.color, fontSize: 12 }}>{HERO_INFO[winner.hero].name}</div>
          <div style={{ color: '#ffd700', fontSize: 36, fontWeight: 900, marginTop: 8 }}>
            {winner.score}
          </div>
        </div>

        {/* VS */}
        <div style={{
          display: 'flex', alignItems: 'center',
          color: '#666', fontSize: 20, fontWeight: 900,
        }}>
          VS
        </div>

        {/* 败者 */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#888', fontSize: 16, fontWeight: 700 }}>{loser.name}</div>
          <div style={{ color: '#666', fontSize: 12 }}>{HERO_INFO[loser.hero].name}</div>
          <div style={{ color: '#888', fontSize: 36, fontWeight: 900, marginTop: 8 }}>
            {loser.score}
          </div>
        </div>

        {/* 统计数据行 */}
        <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #3a1f5e', paddingTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', color: '#aaa', fontSize: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#b8860b', fontSize: 14 }}>回合数</div>
              <div>{gameState.turnNumber}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#b8860b', fontSize: 14 }}>剩余牌库</div>
              <div>{gameState.deckCount}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#b8860b', fontSize: 14 }}>事件日志</div>
              <div>{gameState.log.length} 条</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 重新开始 */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 4 }}
        onClick={() => window.location.reload()}
        style={{
          padding: '14px 40px',
          borderRadius: 8,
          border: '2px solid #b8860b',
          background: 'linear-gradient(180deg, #2d1b4e, #1a0b2e)',
          color: '#b8860b',
          fontFamily: '"Cinzel", serif',
          fontWeight: 700,
          fontSize: 16,
          cursor: 'pointer',
          letterSpacing: 2,
        }}
      >
        再来一局
      </motion.button>
    </motion.div>
  );
}
