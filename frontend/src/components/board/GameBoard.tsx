/**
 * 主游戏版面 — 调度所有阶段组件和状态面板
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { ScoreToast } from '../vfx/ScoreToast';
import { FlashSwapModal } from './FlashSwapModal';
import type { ICard } from '../../types/game';
import { CardRank } from '../../types/game';
import { HeroType } from '../../types/game';
import { useGameAudio } from '../../audio/useGameAudio';
import { toggleBGM, toggleSFX, isBGMPlaying, isSFXEnabled } from '../../audio/AudioManager';

const HERO_COLORS: Record<HeroType, string> = {
  [HeroType.PHANTOM]: '#b8860b',
  [HeroType.WEAVER]: '#9b59b6',
  [HeroType.INQUISITOR]: '#8b0000',
  [HeroType.SINGER]: '#4488ff',
};

export function GameBoard() {
  const { gameState, localPlayerId } = useGameStore();
  const [flashSwapCard, setFlashSwapCard] = useState<ICard | null>(null);
  useGameAudio();

  if (!gameState) return null;

  const playerIds = Object.keys(gameState.players);
  const localPlayer = gameState.players[localPlayerId];
  const opponentId = playerIds.find(id => id !== localPlayerId)!;
  const opponent = gameState.players[opponentId];

  const isGameOver = gameState.phase === GamePhase.GAME_OVER;
  const isMyTurn = gameState.currentTurnPlayerId === localPlayerId;
  // 突袭防守视角下豁免禁交互（防守方需要选牌应对）
  const isAmbushDefender =
    gameState.phase === GamePhase.AMBUSH_DEFEND &&
    gameState.ambushState?.defenderId === localPlayerId;
  const handsLocked = !isMyTurn && !isAmbushDefender;

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

      {/* 得分浮字 (对方/我方加减分) */}
      <ScoreToast />

      {/* 音频控制 (移至左下角，避开顶栏) */}
      <AudioControls />
      <ScoringRulesButton />

      {/* 英雄台词层 */}
      <VoiceLineLayer />

      {/* 回合归属 HUD */}
      <TurnHUD isMyTurn={isMyTurn} phase={gameState.phase} />

      {/* 胜利画面 */}
      {isGameOver && <VictoryScreen />}

      {/* 瞬换牌弹窗 */}
      {flashSwapCard && (
        <FlashSwapModal
          flashCard={flashSwapCard}
          hand={localPlayer.hand}
          onClose={() => setFlashSwapCard(null)}
        />
      )}

      {/* ═══ 顶部：对手区域 ═══ */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 'clamp(6px, 1.5vh, 12px) clamp(12px, 2vw, 24px)',
        gap: 12,
      }}>
        <ScoreBar
          score={opponent.score}
          playerName={opponent.name}
          heroColor={HERO_COLORS[opponent.hero]}
          side="left"
        />
        <div style={{
          display: 'flex', gap: 12,
          padding: '4px 12px', borderRadius: 8,
          background: 'rgba(0,0,0,0.4)', border: '1px solid #2a1a3e',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ color: '#666', fontSize: 10 }}>对手手牌</span>
            <span style={{ color: '#b8860b', fontSize: 14, fontWeight: 700 }}>
              {opponent.hand.length}
            </span>
          </div>
          <div style={{ width: 1, background: '#3a1f5e' }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ color: '#666', fontSize: 10 }}>牌库</span>
            <span style={{ color: '#888', fontSize: 14 }}>{gameState.deckCount}</span>
          </div>
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
        padding: '0 clamp(12px, 2vw, 24px) clamp(8px, 1.5vh, 12px)',
        position: 'relative',
      }}>
        {/* 玩家手牌（对方回合锁定交互） */}
        <div style={{
          pointerEvents: handsLocked ? 'none' : 'auto',
          opacity: handsLocked ? 0.7 : 1,
          filter: handsLocked ? 'saturate(0.6)' : 'none',
          transition: 'opacity 0.3s, filter 0.3s',
        }}>
          <Hand
            cards={localPlayer.hand}
            blockedRank={opponent.blockadeZone ? opponent.blockadeZone.rank : undefined}
            onCardClick={isMyTurn ? (card) => {
              if (card.rank === CardRank.FLASH) {
                setFlashSwapCard(card);
              }
            } : undefined}
          />
        </div>

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
            {/* 大招按钮 (仅己方回合) */}
            {!localPlayer.hasUsedUltimate && isMyTurn && (
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

function AudioControls() {
  const [bgm, setBgm] = useState(isBGMPlaying());
  const [sfx, setSfx] = useState(isSFXEnabled());

  return (
    <div style={{
      position: 'absolute', bottom: 8, left: 8,
      display: 'flex', gap: 4, zIndex: 999,
    }}>
      <button
        onClick={() => setBgm(toggleBGM())}
        style={{
          width: 32, height: 32, borderRadius: 6,
          border: '1px solid #444', background: 'rgba(0,0,0,0.6)',
          color: bgm ? '#b8860b' : '#555', cursor: 'pointer', fontSize: 16,
        }}
        title={bgm ? 'BGM 开' : 'BGM 关'}
      >
        {bgm ? '🔊' : '🔇'}
      </button>
      <button
        onClick={() => setSfx(toggleSFX())}
        style={{
          width: 32, height: 32, borderRadius: 6,
          border: '1px solid #444', background: 'rgba(0,0,0,0.6)',
          color: sfx ? '#b8860b' : '#555', cursor: 'pointer', fontSize: 16,
        }}
        title={sfx ? '音效 开' : '音效 关'}
      >
        {sfx ? '🔔' : '🔕'}
      </button>
    </div>
  );
}

function TurnHUD({ isMyTurn, phase }: { isMyTurn: boolean; phase: GamePhase }) {
  // 突袭防守阶段属于"轮到你应对"
  const isAmbushDefendingMe = phase === GamePhase.AMBUSH_DEFEND;
  const showAsMine = isMyTurn || isAmbushDefendingMe;

  if (phase === GamePhase.GAME_OVER) return null;

  return (
    <motion.div
      key={showAsMine ? 'mine' : 'opp'}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        position: 'absolute', top: 4, left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 998,
        padding: '4px 18px', borderRadius: 16,
        border: `1.5px solid ${showAsMine ? '#ffd700' : '#8b0000'}`,
        background: showAsMine
          ? 'linear-gradient(180deg, rgba(74,58,10,0.85), rgba(42,31,5,0.9))'
          : 'linear-gradient(180deg, rgba(74,10,10,0.85), rgba(40,5,5,0.9))',
        color: showAsMine ? '#ffd700' : '#ff6347',
        fontSize: 12, fontWeight: 700, letterSpacing: 2,
        fontFamily: '"Cinzel", serif',
        boxShadow: showAsMine
          ? '0 0 15px rgba(255,215,0,0.4)'
          : '0 0 15px rgba(139,0,0,0.4)',
      }}
    >
      <motion.span
        animate={{ opacity: showAsMine ? 1 : [0.6, 1, 0.6] }}
        transition={{ duration: 1.5, repeat: showAsMine ? 0 : Infinity }}
      >
        {showAsMine
          ? (isAmbushDefendingMe ? '⚠️ 应对突袭 — 你的抉择' : '✦ 你的回合 — 请操作 ✦')
          : '🤖 对手回合 — 思考中…'}
      </motion.span>
    </motion.div>
  );
}

function ScoringRulesButton() {
  const [show, setShow] = useState(false);

  const combos = [
    { name: '大顺', rule: 'A+B+C+D+E+F 各一', mult: '×3', example: '(6+5+4+3+2+1)×3 = 63', icon: '🌟' },
    { name: '四条', rule: '4张相同等级', mult: '×4', example: '4×A = 6×4×4 = 96', icon: '💎' },
    { name: '葫芦', rule: '三条+对子', mult: '×3', example: '3A+2B = (18+10)×3 = 84', icon: '🏠' },
    { name: '小顺', rule: '连续4张以上', mult: '×2', example: 'A-B-C-D = (6+5+4+3)×2 = 36', icon: '✨' },
    { name: '三条', rule: '3张相同等级', mult: '×2', example: '3×A = 6×3×2 = 36', icon: '🔥' },
    { name: '对子', rule: '2张相同等级', mult: '×1', example: '2×A = 6×2 = 12', icon: '♦️' },
  ];

  return (
    <>
      <button
        onClick={() => setShow(true)}
        style={{
          position: 'absolute', top: 8, left: 8,
          width: 32, height: 32, borderRadius: 6,
          border: '1px solid #444', background: 'rgba(0,0,0,0.6)',
          color: '#b8860b', cursor: 'pointer', fontSize: 16,
          zIndex: 999,
        }}
        title="积分规则"
      >
        📊
      </button>

      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShow(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 10000, pointerEvents: 'auto',
            }}
          >
            <motion.div
              initial={{ scale: 0.85 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.85 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'linear-gradient(180deg, #1a0b2e, #0d0018)',
                border: '2px solid #b8860b', borderRadius: 16,
                padding: 24, maxWidth: 420, width: '90%',
              }}
            >
              <h3 style={{
                color: '#b8860b', fontFamily: '"Cinzel", serif',
                margin: '0 0 16px', textAlign: 'center', fontSize: 18,
              }}>
                📊 咏唱积分组合表
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {combos.map((c, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid #2a1a3e',
                  }}>
                    <span style={{ fontSize: 18, width: 28 }}>{c.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#ffd700', fontWeight: 700, fontSize: 14 }}>{c.name}</span>
                        <span style={{ color: '#ff8c00', fontWeight: 700, fontSize: 13 }}>{c.mult}</span>
                      </div>
                      <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>{c.rule}</div>
                      <div style={{ color: '#666', fontSize: 10, marginTop: 1, fontStyle: 'italic' }}>例: {c.example}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,140,0,0.08)', border: '1px solid #ff8c0040' }}>
                <div style={{ color: '#ff8c00', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>⚡ 特殊规则</div>
                <div style={{ color: '#888', fontSize: 10, lineHeight: 1.6 }}>
                  • F弑神：F {'>'} A（无论正常/反转）<br/>
                  • 瞬 (FLASH)：功能牌，吸收对手攻击牌<br/>
                  • 前期衰减：前几回合咏唱得分打折<br/>
                  • 胜利条件：155分 或 牌库耗尽→魔力对撞
                </div>
              </div>
              <button
                onClick={() => setShow(false)}
                style={{
                  display: 'block', margin: '14px auto 0', padding: '8px 24px',
                  borderRadius: 6, border: '1px solid #666',
                  background: 'transparent', color: '#888',
                  cursor: 'pointer', fontSize: 12,
                }}
              >
                关闭
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
