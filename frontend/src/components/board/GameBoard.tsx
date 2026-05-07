/**
 * 主游戏版面 — 调度所有阶段组件和状态面板
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GamePhase, GAME_CONSTANTS } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { Hand } from './Hand';
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
import { EventToastLayer } from '../vfx/EventToastLayer';
import { FlashSwapModal } from './FlashSwapModal';
import { StealPickerModal } from './StealPickerModal';
import { DecreeContestModal } from '../decree/DecreeContestModal';
import { DecreeArchive } from '../decree/DecreeArchive';
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

      {/* 事件叙事 Toast (对方/系统刚刚发生了什么) */}
      <EventToastLayer />

      {/* 设置菜单（统一收纳音效/规则/投降/退出） */}
      <SettingsMenu />

      {/* 深渊档案库（左侧抽屉） */}
      <DecreeArchive />

      {/* 法案争夺模态（DECREE_CONTEST 阶段时全屏覆盖） */}
      {gameState.phase === GamePhase.DECREE_CONTEST && <DecreeContestModal />}

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

      {/* 偷牌选择(突袭怯战胜方亲手挑) */}
      <StealPickerModal />

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
            onCardClick={(card) => {
              // 阶段组件优先接管
              const handler = useGameStore.getState().handClickHandler;
              if (handler) {
                handler(card);
                return;
              }
              // 默认：己方回合 + 瞬牌 → 弹换牌
              if (isMyTurn && card.rank === CardRank.FLASH) {
                setFlashSwapCard(card);
              }
            }}
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

function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | 'SURRENDER' | 'QUIT'>(null);
  const [bgm, setBgm] = useState(isBGMPlaying());
  const [sfx, setSfx] = useState(isSFXEnabled());

  const surrender = useGameStore(s => s.surrender);
  const quitToMenu = useGameStore(s => s.quitToMenu);

  const handleConfirm = () => {
    if (confirmAction === 'SURRENDER') surrender();
    else if (confirmAction === 'QUIT') quitToMenu();
    setConfirmAction(null);
    setOpen(false);
  };

  return (
    <>
      {/* 主按钮（右上角，远离对手信息条） */}
      <motion.button
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        style={{
          position: 'absolute', top: 8, right: 8, zIndex: 999,
          width: 36, height: 36, borderRadius: 8,
          border: '1px solid #b8860b', background: 'rgba(0,0,0,0.7)',
          color: '#b8860b', fontSize: 18, cursor: 'pointer',
          boxShadow: '0 0 12px rgba(184,134,11,0.3)',
        }}
        title="设置"
      >
        ⚙
      </motion.button>

      {/* 菜单弹层 */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.7)',
              zIndex: 9998,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 10 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: 280, padding: 24,
                borderRadius: 16,
                background: 'linear-gradient(180deg, #1a0b2e, #0d0018)',
                border: '2px solid #b8860b',
                boxShadow: '0 0 30px rgba(184,134,11,0.4)',
                display: 'flex', flexDirection: 'column', gap: 12,
              }}
            >
              <h3 style={{
                color: '#b8860b', margin: 0,
                fontFamily: '"Cinzel", serif',
                fontSize: 16, letterSpacing: 3, textAlign: 'center',
              }}>
                ⚙ 设 置
              </h3>

              <SettingsRow
                label="背景音乐"
                value={bgm ? '🔊 开' : '🔇 关'}
                onClick={() => setBgm(toggleBGM())}
              />
              <SettingsRow
                label="音效"
                value={sfx ? '🔔 开' : '🔕 关'}
                onClick={() => setSfx(toggleSFX())}
              />
              <SettingsRow
                label="📊 积分规则参考"
                value="查看 →"
                onClick={() => { setShowRules(true); setOpen(false); }}
              />

              <div style={{ height: 1, background: '#3a1f5e', margin: '4px 0' }} />

              <SettingsRow
                label="🏳️ 投降"
                value=""
                danger
                onClick={() => setConfirmAction('SURRENDER')}
              />
              <SettingsRow
                label="🚪 退出到主菜单"
                value=""
                danger
                onClick={() => setConfirmAction('QUIT')}
              />

              <button
                onClick={() => setOpen(false)}
                style={{
                  marginTop: 8, padding: '8px 0',
                  borderRadius: 6, border: '1px solid #666',
                  background: 'transparent', color: '#aaa',
                  cursor: 'pointer', fontSize: 12,
                }}
              >
                关闭
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 二次确认对话框 */}
      <AnimatePresence>
        {confirmAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10001,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              style={{
                padding: 24, borderRadius: 12,
                background: 'linear-gradient(180deg, #2a0d0d, #1a0000)',
                border: '2px solid #e74c3c',
                width: 300, textAlign: 'center',
              }}
            >
              <div style={{
                color: '#e74c3c', fontFamily: '"Cinzel", serif',
                fontSize: 16, fontWeight: 700, marginBottom: 14, letterSpacing: 2,
              }}>
                {confirmAction === 'SURRENDER' ? '确认投降？' : '确认退出？'}
              </div>
              <div style={{ color: '#aaa', fontSize: 12, marginBottom: 16 }}>
                {confirmAction === 'SURRENDER'
                  ? '本局将判负，对手获得胜利。'
                  : '当前对局进度将丢失。'}
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  onClick={handleConfirm}
                  style={{
                    padding: '8px 20px', borderRadius: 6,
                    border: '1px solid #e74c3c',
                    background: 'rgba(231,76,60,0.2)',
                    color: '#e74c3c', fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  确认
                </button>
                <button
                  onClick={() => setConfirmAction(null)}
                  style={{
                    padding: '8px 20px', borderRadius: 6,
                    border: '1px solid #666',
                    background: 'transparent', color: '#aaa', cursor: 'pointer',
                  }}
                >
                  取消
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 规则浮窗 */}
      <AnimatePresence>
        {showRules && <ScoringRulesPanel onClose={() => setShowRules(false)} />}
      </AnimatePresence>
    </>
  );
}

function SettingsRow({
  label, value, onClick, danger = false,
}: {
  label: string; value: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${danger ? '#e74c3c40' : '#3a1f5e'}`,
        borderRadius: 8,
        color: danger ? '#e74c3c' : '#ccc',
        fontSize: 13, cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <span>{label}</span>
      <span style={{ color: danger ? '#e74c3c' : '#b8860b', fontSize: 12 }}>{value}</span>
    </button>
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

function ScoringRulesPanel({ onClose }: { onClose: () => void }) {
  const combos = [
    { name: '大顺', rule: 'A+B+C+D+E+F 各一', mult: '×3', example: '(6+5+4+3+2+1)×3 = 63', icon: '🌟' },
    { name: '四条', rule: '4张相同等级', mult: '×4', example: '4×A = 6×4×4 = 96', icon: '💎' },
    { name: '葫芦', rule: '三条+对子', mult: '×3', example: '3A+2B = (18+10)×3 = 84', icon: '🏠' },
    { name: '小顺', rule: '连续4张以上', mult: '×2', example: 'A-B-C-D = (6+5+4+3)×2 = 36', icon: '✨' },
    { name: '三条', rule: '3张相同等级', mult: '×2', example: '3×A = 6×3×2 = 36', icon: '🔥' },
    { name: '对子', rule: '2张相同等级', mult: '×1', example: '2×A = 6×2 = 12', icon: '♦️' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000,
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
            • 瞬 (FLASH)：任意阶段可换 1-3 张手牌<br/>
            • 封锁：被封锁 rank 入组合每张扣 baseScore×3 分<br/>
            • 前期衰减：前几回合咏唱得分打折<br/>
            • 胜利条件：{GAME_CONSTANTS.WIN_SCORE}分 或 牌库耗尽→魔力对撞
          </div>
        </div>
        <button
          onClick={onClose}
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
  );
}
