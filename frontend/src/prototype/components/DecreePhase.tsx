/**
 * v2.1 原型 — 法案争夺阶段（2步: 暗标 1-3 张 + 揭晓）
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import type { GameState } from '../protoTypes';
import { Phase } from '../protoTypes';
import { submitDecreeBid, confirmDecreeBid, advanceFromDecreeReveal } from '../protoEngine';
import { ProtoCard } from './ProtoCard';

interface Props {
  gs: GameState;
  playerId: string;
  onUpdate: () => void;
}

export function DecreePhase({ gs, playerId, onUpdate }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const dc = gs.decreeContest;
  if (!dc) return null;

  const player = gs.players[playerId];
  const isReveal = gs.phase === Phase.DECREE_REVEAL;

  const toggle = (id: string) => {
    if (submitted) return;
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < 3 ? [...prev, id] : prev
    );
  };

  const handleSubmit = () => {
    submitDecreeBid(gs, playerId, selectedIds);
    confirmDecreeBid(gs, playerId);
    setSubmitted(true);
    onUpdate();
  };

  const handleSkip = () => {
    submitDecreeBid(gs, playerId, []);
    confirmDecreeBid(gs, playerId);
    setSubmitted(true);
    onUpdate();
  };

  // 揭晓阶段
  if (isReveal) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
      >
        <div style={{ color: '#ffd700', fontSize: 14, fontWeight: 700, letterSpacing: 3 }}>
          法案裁定
        </div>
        <div style={{ color: '#ccc', fontSize: 12 }}>
          {dc.outcome === 'VOID'
            ? '法案作废！'
            : `${gs.players[dc.outcome!]?.name || '?'} 赢得法案！`}
        </div>
        <div style={{
          padding: '8px 16px', borderRadius: 8,
          background: 'rgba(255,215,0,0.1)', border: '1px solid #b8860b60',
          color: '#ffd700', fontSize: 12,
        }}>
          {dc.decree.emoji} {dc.decree.name}
        </div>
        {dc.outcome !== 'VOID' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ padding: '4px 10px', borderRadius: 4, background: 'rgba(46,204,113,0.1)', border: '1px solid #2ecc7160', color: '#2ecc71', fontSize: 10 }}>
              Buff: {dc.decree.buffText}
            </div>
            <div style={{ padding: '4px 10px', borderRadius: 4, background: 'rgba(231,76,60,0.1)', border: '1px solid #e74c3c60', color: '#e74c3c', fontSize: 10 }}>
              Debuff: {dc.decree.debuffText}
            </div>
          </div>
        )}
        <motion.button
          whileHover={{ scale: 1.05 }}
          onClick={() => { advanceFromDecreeReveal(gs); setSubmitted(false); setSelectedIds([]); onUpdate(); }}
          style={{
            padding: '8px 20px', borderRadius: 8,
            border: '1px solid #b8860b', background: 'linear-gradient(135deg, #2d1b4e, #1a0b2e)',
            color: '#ffd700', fontWeight: 700, cursor: 'pointer',
          }}
        >
          继续
        </motion.button>
      </motion.div>
    );
  }

  // 暗标阶段
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}
    >
      <div style={{ color: '#e74c3c', fontSize: 14, fontWeight: 700, letterSpacing: 3 }}>
        法案降临
      </div>
      <div style={{
        padding: '10px 18px', borderRadius: 10,
        background: 'linear-gradient(180deg, #261338, #170824)',
        border: '2px solid #b8860b', textAlign: 'center',
        maxWidth: 400,
      }}>
        <div style={{ fontSize: 28, marginBottom: 4 }}>{dc.decree.emoji}</div>
        <div style={{ color: '#ffd700', fontSize: 16, fontWeight: 900, letterSpacing: 4 }}>
          {dc.decree.name}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'center' }}>
          <div style={{ flex: 1, padding: 8, borderRadius: 6, background: 'rgba(46,204,113,0.08)', border: '1px solid #2ecc7140', textAlign: 'left' }}>
            <div style={{ color: '#2ecc71', fontSize: 9, fontWeight: 700 }}>BUFF</div>
            <div style={{ color: '#ccc', fontSize: 11 }}>{dc.decree.buffText}</div>
          </div>
          <div style={{ flex: 1, padding: 8, borderRadius: 6, background: 'rgba(231,76,60,0.08)', border: '1px solid #e74c3c40', textAlign: 'left' }}>
            <div style={{ color: '#e74c3c', fontSize: 9, fontWeight: 700 }}>DEBUFF</div>
            <div style={{ color: '#ccc', fontSize: 11 }}>{dc.decree.debuffText}</div>
          </div>
        </div>
      </div>

      {!submitted && (
        <>
          <div style={{ color: '#888', fontSize: 11 }}>
            赢家同时获得 Buff 和 Debuff — 选 0-3 张牌暗标
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            {player.hand.map(card => (
              <ProtoCard
                key={card.id}
                card={card}
                selected={selectedIds.includes(card.id)}
                onClick={() => toggle(card.id)}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              onClick={handleSubmit}
              style={{
                padding: '8px 20px', borderRadius: 8,
                border: '2px solid #e74c3c',
                background: selectedIds.length > 0
                  ? 'linear-gradient(135deg, #e74c3c33, #1a0000)' : '#333',
                color: selectedIds.length > 0 ? '#e74c3c' : '#888',
                fontWeight: 700, cursor: 'pointer',
              }}
            >
              {selectedIds.length > 0 ? `投标 (${selectedIds.length} 张)` : '确认放弃'}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              onClick={handleSkip}
              style={{
                padding: '8px 16px', borderRadius: 8,
                border: '1px solid #666', background: 'transparent',
                color: '#888', cursor: 'pointer',
              }}
            >
              放弃
            </motion.button>
          </div>
        </>
      )}
      {submitted && (
        <div style={{ color: '#888', fontSize: 12, fontStyle: 'italic' }}>
          等待对方...
        </div>
      )}
    </motion.div>
  );
}
