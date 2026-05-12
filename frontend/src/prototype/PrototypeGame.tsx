/**
 * v2.1 原型 — 主游戏入口 & 调度器
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GameState } from './protoTypes';
import { Phase, PROTO_CONSTANTS as C } from './protoTypes';
import { createGame, getOpponentId, submitDecreeBid, confirmDecreeBid } from './protoEngine';
import { aiTurn } from './protoAI';
import { GatherPhase } from './components/GatherPhase';
import { ConfrontPhase } from './components/ConfrontPhase';
import { ChantPhase } from './components/ChantPhase';
import { DecreePhase } from './components/DecreePhase';
import { ProtoHand } from './components/ProtoHand';
import { ProtoMarket } from './components/ProtoMarket';

interface Props {
  onExit: () => void;
}

export function PrototypeGame({ onExit }: Props) {
  const [mode, setMode] = useState<'AI' | 'HOTSEAT' | null>(null);
  const [gs, setGs] = useState<GameState | null>(null);
  const [, setTick] = useState(0);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const forceUpdate = useCallback(() => setTick(t => t + 1), []);

  const startGame = (m: 'AI' | 'HOTSEAT') => {
    setMode(m);
    setGs(createGame(m));
  };

  // AI 自动行动
  useEffect(() => {
    if (!gs || mode !== 'AI') return;
    if (gs.phase === Phase.GAME_OVER) return;

    // 法案阶段：双方同时暗标，AI 自动提交
    if (gs.phase === Phase.DECREE && gs.decreeContest && !(gs.decreeContest as any)._p2Confirmed) {
      aiTimerRef.current = setTimeout(() => {
        const aiHand = gs.players['p2'].hand.filter(c => c.rank !== 0);
        if (aiHand.length > 0 && Math.random() < 0.5) {
          const sorted = [...aiHand].sort((a, b) => a.baseScore - b.baseScore);
          const bid = sorted.slice(0, Math.min(2, sorted.length)).map(c => c.id);
          submitDecreeBid(gs, 'p2', bid);
        } else {
          submitDecreeBid(gs, 'p2', []);
        }
        confirmDecreeBid(gs, 'p2');
        forceUpdate();
      }, 800);
      return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
    }

    if (gs.currentPlayerId !== 'p2') return;

    aiTimerRef.current = setTimeout(() => {
      aiTurn(gs);
      forceUpdate();
    }, 600);

    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  }, [gs, gs?.phase, gs?.currentPlayerId, gs?.turnNumber, mode, forceUpdate]);

  // 模式选择
  if (!mode || !gs) {
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 20,
        background: 'radial-gradient(ellipse at center, #1a0b2e, #0d0018)',
      }}>
        <h1 style={{
          color: '#ffd700', fontFamily: '"Cinzel", serif',
          fontSize: 24, letterSpacing: 6, textAlign: 'center',
        }}>
          秘术对决 v2.1
        </h1>
        <div style={{ color: '#888', fontSize: 12, letterSpacing: 2 }}>试 玩 原 型</div>
        <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
          <ModeButton label="VS AI" subtitle="单人对战" color="#b8860b" onClick={() => startGame('AI')} />
          <ModeButton label="热座" subtitle="双人轮流" color="#9b59b6" onClick={() => startGame('HOTSEAT')} />
        </div>
        <button
          onClick={onExit}
          style={{
            marginTop: 20, padding: '8px 20px', borderRadius: 6,
            border: '1px solid #666', background: 'transparent',
            color: '#888', cursor: 'pointer', fontSize: 12,
          }}
        >
          返回主菜单
        </button>
      </div>
    );
  }

  const me = gs.players[gs.currentPlayerId];
  const opp = gs.players[getOpponentId(gs)];
  const isAiTurn = mode === 'AI' && gs.currentPlayerId === 'p2';
  const isMyAction = !isAiTurn;

  return (
    <div style={{
      width: '100%', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      background: 'radial-gradient(ellipse at center, #1a0b2e, #0d0018)',
      fontFamily: 'system-ui, sans-serif', position: 'relative',
    }}>
      {/* 顶栏: 双方信息 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '6px 12px', flexShrink: 0,
        borderBottom: '1px solid #2a1a3e',
      }}>
        <PlayerInfo player={gs.players['p1']} isCurrent={gs.currentPlayerId === 'p1'} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ color: '#666', fontSize: 9 }}>回合 {gs.turnNumber} / R{gs.roundNumber}</div>
          <div style={{ color: '#ffd700', fontSize: 10, fontWeight: 700 }}>
            悬赏 {gs.bountyPool}
          </div>
          <div style={{ color: '#555', fontSize: 9 }}>牌库 {gs.deck.length}</div>
        </div>
        <PlayerInfo player={gs.players['p2']} isCurrent={gs.currentPlayerId === 'p2'} />
      </div>

      {/* 中央: 阶段内容 */}
      <div style={{
        flex: 1, minHeight: 0, overflow: 'auto',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 12,
      }}>
        {gs.phase === Phase.GAME_OVER ? (
          <GameOverScreen gs={gs} onRestart={() => startGame(mode)} onExit={onExit} />
        ) : isAiTurn ? (
          <div style={{ color: '#888', fontSize: 14, fontStyle: 'italic' }}>
            AI 思考中...
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={gs.phase + gs.currentPlayerId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {renderPhase(gs, isMyAction, forceUpdate)}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* 底部: 当前玩家手牌 + 操作提示 */}
      {gs.phase !== Phase.GAME_OVER && (
        <div style={{
          borderTop: '1px solid #2a1a3e',
          padding: '4px 8px', flexShrink: 0,
        }}>
          <div style={{ color: '#666', fontSize: 9, textAlign: 'center', marginBottom: 2 }}>
            {mode === 'HOTSEAT'
              ? `${me.name} 的手牌`
              : (isAiTurn ? 'AI 回合' : '你的手牌')}
          </div>
          <ProtoHand
            cards={isAiTurn ? [] : me.hand}
            sealedRank={me.sealedRank}
            disabled
          />
        </div>
      )}

      {/* 日志抽屉 */}
      <LogDrawer log={gs.log} />

      {/* 退出按钮 */}
      <button
        onClick={onExit}
        style={{
          position: 'absolute', top: 4, right: 4,
          width: 28, height: 28, borderRadius: 6,
          border: '1px solid #666', background: 'rgba(0,0,0,0.5)',
          color: '#888', fontSize: 14, cursor: 'pointer',
        }}
        title="退出"
      >
        ×
      </button>
    </div>
  );
}

function renderPhase(gs: GameState, isMyAction: boolean, onUpdate: () => void) {
  switch (gs.phase) {
    case Phase.GATHER:
      return <GatherPhase gs={gs} onUpdate={onUpdate} />;
    case Phase.CONFRONT:
    case Phase.CONFRONT_DEFEND:
      return <ConfrontPhase gs={gs} onUpdate={onUpdate} />;
    case Phase.CHANT:
    case Phase.FINAL_CHANT:
      return <ChantPhase gs={gs} onUpdate={onUpdate} />;
    case Phase.DECREE:
    case Phase.DECREE_REVEAL:
      return <DecreePhase gs={gs} playerId={gs.currentPlayerId} onUpdate={onUpdate} />;
    default:
      return null;
  }
}

function PlayerInfo({ player, isCurrent }: { player: GameState['players'][string]; isCurrent: boolean }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
      opacity: isCurrent ? 1 : 0.6,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700,
        color: isCurrent ? '#ffd700' : '#888',
        fontFamily: '"Cinzel", serif',
      }}>
        {player.name}
      </div>
      <div style={{
        fontSize: 20, fontWeight: 900, fontFamily: 'monospace',
        color: isCurrent ? '#ffd700' : '#aaa',
      }}>
        {player.score}
      </div>
      <div style={{ width: 80, height: 3, borderRadius: 2, background: '#1a0b2e', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min((player.score / C.WIN_SCORE) * 100, 100)}%`,
          height: '100%', borderRadius: 2,
          background: isCurrent ? '#ffd700' : '#666',
          transition: 'width 0.3s',
        }} />
      </div>
      <div style={{ fontSize: 9, color: '#555' }}>{player.hand.length} 张</div>
      {player.decrees.length > 0 && (
        <div style={{ fontSize: 9, color: '#b8860b' }}>
          {player.decrees.map(d => d.emoji).join('')}
        </div>
      )}
    </div>
  );
}

function GameOverScreen({ gs, onRestart, onExit }: { gs: GameState; onRestart: () => void; onExit: () => void }) {
  const winner = gs.winnerId ? gs.players[gs.winnerId] : null;
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}
    >
      <div style={{
        fontSize: 28, fontWeight: 900, fontFamily: '"Cinzel", serif',
        color: '#ffd700', letterSpacing: 6,
        textShadow: '0 0 20px rgba(255,215,0,0.5)',
      }}>
        {winner ? `${winner.name} 胜利！` : '平局！'}
      </div>
      <div style={{ display: 'flex', gap: 24 }}>
        {gs.playerOrder.map(id => {
          const p = gs.players[id];
          return (
            <div key={id} style={{ textAlign: 'center' }}>
              <div style={{ color: '#888', fontSize: 12 }}>{p.name}</div>
              <div style={{
                fontSize: 32, fontWeight: 900, fontFamily: 'monospace',
                color: id === gs.winnerId ? '#ffd700' : '#666',
              }}>
                {p.score}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <motion.button
          whileHover={{ scale: 1.05 }}
          onClick={onRestart}
          style={{
            padding: '10px 24px', borderRadius: 8,
            border: '2px solid #b8860b',
            background: 'linear-gradient(135deg, #2d1b4e, #1a0b2e)',
            color: '#ffd700', fontWeight: 700, cursor: 'pointer',
          }}
        >
          再来一局
        </motion.button>
        <button
          onClick={onExit}
          style={{
            padding: '10px 24px', borderRadius: 8,
            border: '1px solid #666', background: 'transparent',
            color: '#888', cursor: 'pointer',
          }}
        >
          返回
        </button>
      </div>
    </motion.div>
  );
}

function LogDrawer({ log }: { log: string[] }) {
  const [open, setOpen] = useState(false);
  const recent = log.slice(-20).reverse();

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'absolute', bottom: 4, left: 4,
          padding: '4px 8px', borderRadius: 4,
          border: '1px solid #3a1f5e', background: 'rgba(0,0,0,0.6)',
          color: '#888', fontSize: 10, cursor: 'pointer',
        }}
      >
        {open ? '关闭日志' : '日志'}
      </button>
      {open && (
        <motion.div
          initial={{ x: -200 }} animate={{ x: 0 }}
          style={{
            position: 'absolute', left: 0, top: 40, bottom: 40,
            width: 260, background: 'rgba(10,2,20,0.95)',
            border: '1px solid #3a1f5e', borderRadius: '0 8px 8px 0',
            padding: 10, overflowY: 'auto', zIndex: 100,
          }}
        >
          {recent.map((l, i) => (
            <div key={i} style={{ color: '#888', fontSize: 10, padding: '2px 0', borderBottom: '1px solid #1a0b2e' }}>
              {l}
            </div>
          ))}
        </motion.div>
      )}
    </>
  );
}

function ModeButton({ label, subtitle, color, onClick }: {
  label: string; subtitle: string; color: string; onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.05, y: -3 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      style={{
        padding: '16px 28px', borderRadius: 12,
        border: `2px solid ${color}`,
        background: `linear-gradient(135deg, ${color}22, #0d0018)`,
        color, fontWeight: 700, fontSize: 16,
        cursor: 'pointer', minWidth: 120,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        fontFamily: '"Cinzel", serif', letterSpacing: 3,
      }}
    >
      <span>{label}</span>
      <span style={{ fontSize: 10, color: '#888', letterSpacing: 1 }}>{subtitle}</span>
    </motion.button>
  );
}
