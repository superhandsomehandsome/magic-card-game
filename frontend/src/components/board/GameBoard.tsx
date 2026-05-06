/**
 * 主游戏版面 — 调度所有阶段组件和状态面板
 */
import { motion } from 'framer-motion';
import { GamePhase } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { Hand } from './Hand';
import { Market } from './Market';
import { BountyPool } from './BountyPool';
import { ScoreBar } from './ScoreBar';
import { Timer } from './Timer';
import { PhaseIndicator } from './PhaseIndicator';
import { BountyRollPhase } from '../phases/BountyRollPhase';
import { DrawMarketPhase } from '../phases/DrawMarketPhase';
import { AmbushPhase } from '../phases/AmbushPhase';
import { ChantPhase } from '../phases/ChantPhase';
import { BlockadePhase } from '../phases/BlockadePhase';
import { CollisionPhase } from '../phases/CollisionPhase';
import { VFXLayer } from '../vfx/VFXLayer';
import { VictoryScreen } from '../vfx/VictoryScreen';
import { VoiceLineLayer } from '../vfx/VoiceLine';
import { HeroType } from '../../types/game';

const HERO_COLORS: Record<HeroType, string> = {
  [HeroType.PHANTOM]: '#b8860b',
  [HeroType.WEAVER]: '#9b59b6',
  [HeroType.INQUISITOR]: '#8b0000',
  [HeroType.SINGER]: '#4488ff',
};

export function GameBoard() {
  const { gameState, localPlayerId } = useGameStore();

  if (!gameState) return null;

  const playerIds = Object.keys(gameState.players);
  const localPlayer = gameState.players[localPlayerId];
  const opponentId = playerIds.find(id => id !== localPlayerId)!;
  const opponent = gameState.players[opponentId];

  const isGameOver = gameState.phase === GamePhase.GAME_OVER;

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'radial-gradient(ellipse at 50% 50%, #1a0b2e 0%, #0d0018 60%, #000 100%)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* VFX 全局特效层 */}
      <VFXLayer />

      {/* 英雄台词层 */}
      <VoiceLineLayer />

      {/* 胜利画面 */}
      {isGameOver && <VictoryScreen />}

      {/* ═══ 顶部：对手区域 ═══ */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 24px',
      }}>
        <ScoreBar
          score={opponent.score}
          playerName={opponent.name}
          heroColor={HERO_COLORS[opponent.hero]}
          side="left"
        />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#666', fontSize: 11 }}>对手手牌</span>
          <span style={{ color: '#b8860b', fontSize: 16, fontWeight: 700 }}>
            {opponent.hand.length} 张
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#666', fontSize: 11 }}>牌库</span>
          <span style={{ color: '#888', fontSize: 14 }}>{gameState.deckCount}</span>
        </div>
      </div>

      {/* 对手手牌(背面) */}
      <Hand cards={opponent.hand} isOpponent={true} />

      {/* ═══ 中央：游戏区域 ═══ */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '0 24px',
      }}>
        {/* 阶段指示器 + 计时器 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <PhaseIndicator phase={gameState.phase} />
          <Timer timeMs={gameState.timer} />
        </div>

        {/* 喋血悬赏池 */}
        <BountyPool amount={gameState.bountyPool} />

        {/* 黑市 */}
        {gameState.phase === GamePhase.DRAW_MARKET && (
          <Market cards={gameState.marketCards} />
        )}

        {/* 封锁区显示 */}
        {opponent.blockadeZone && (
          <motion.div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 12px',
              borderRadius: 4,
              border: '1px solid #2ecc71',
              background: 'rgba(46,204,113,0.1)',
            }}
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <span style={{ color: '#2ecc71', fontSize: 11 }}>
              🔒 对手封锁：{opponent.blockadeZone.rank} 级
            </span>
          </motion.div>
        )}

        {/* 反转状态提示 */}
        {gameState.isInverted && (
          <motion.div
            style={{
              color: '#4488ff',
              fontSize: 12,
              padding: '4px 12px',
              borderRadius: 4,
              border: '1px solid #4488ff',
              background: 'rgba(68,136,255,0.1)',
            }}
            animate={{
              boxShadow: ['0 0 5px rgba(68,136,255,0.3)', '0 0 15px rgba(68,136,255,0.7)', '0 0 5px rgba(68,136,255,0.3)'],
            }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            🔄 以太反转中 — 剩余 {gameState.invertedTurnsLeft} 回合
          </motion.div>
        )}

        {/* 阶段内容 */}
        <div style={{ width: '100%', maxWidth: 600 }}>
          {renderPhaseContent(gameState.phase)}
        </div>
      </div>

      {/* ═══ 底部：玩家区域 ═══ */}
      <div style={{
        padding: '0 24px 12px',
      }}>
        {/* 玩家手牌 */}
        <Hand
          cards={localPlayer.hand}
          disabledRanks={opponent.blockadeZone ? [opponent.blockadeZone.rank] : []}
        />

        {/* 玩家信息栏 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 0',
        }}>
          <ScoreBar
            score={localPlayer.score}
            playerName={localPlayer.name}
            heroColor={HERO_COLORS[localPlayer.hero]}
            side="left"
          />
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {/* 大招按钮 */}
            {!localPlayer.hasUsedUltimate && (
              <UltimateButton hero={localPlayer.hero} />
            )}
            <div style={{ color: '#666', fontSize: 11 }}>
              回合 {gameState.turnNumber}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderPhaseContent(phase: GamePhase) {
  switch (phase) {
    case GamePhase.BOUNTY_ROLL: return <BountyRollPhase />;
    case GamePhase.DRAW_MARKET: return <DrawMarketPhase />;
    case GamePhase.AMBUSH_DECLARE:
    case GamePhase.AMBUSH_DEFEND: return <AmbushPhase />;
    case GamePhase.CHANT_SCORE: return <ChantPhase />;
    case GamePhase.BLOCKADE_END: return <BlockadePhase />;
    case GamePhase.COLLISION: return <CollisionPhase />;
    default: return null;
  }
}

function UltimateButton({ hero }: { hero: HeroType }) {
  const useUltimate = useGameStore(s => s.useUltimate);
  const color = HERO_COLORS[hero];

  return (
    <motion.button
      onClick={() => useUltimate()}
      style={{
        padding: '8px 16px',
        borderRadius: 8,
        border: `2px solid ${color}`,
        background: 'rgba(0,0,0,0.8)',
        color,
        fontWeight: 900,
        fontSize: 12,
        cursor: 'pointer',
        letterSpacing: 1,
      }}
      whileHover={{ scale: 1.1, boxShadow: `0 0 20px ${color}80` }}
      whileTap={{ scale: 0.9 }}
      animate={{
        boxShadow: [`0 0 5px ${color}40`, `0 0 15px ${color}80`, `0 0 5px ${color}40`],
      }}
      transition={{ duration: 2, repeat: Infinity }}
    >
      ⚡ 大招
    </motion.button>
  );
}
