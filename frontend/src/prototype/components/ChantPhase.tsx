/**
 * v2.1 原型 — 咏唱阶段（选牌组合积分）
 */
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { GameState } from '../protoTypes';
import { Rank, Phase, BOUNTY_TIERS } from '../protoTypes';
import { submitChant, detectBestCombo, comboTypeName } from '../protoEngine';
import { ProtoCard } from './ProtoCard';

interface Props {
  gs: GameState;
  onUpdate: () => void;
}

export function ChantPhase({ gs, onUpdate }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const player = gs.players[gs.currentPlayerId];
  const isFinal = gs.phase === Phase.FINAL_CHANT;

  const toggle = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectedCards = useMemo(
    () => selectedIds.map(id => player.hand.find(c => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c),
    [selectedIds, player.hand],
  );

  const preview = useMemo(() => {
    if (selectedCards.length === 0) return null;
    return detectBestCombo(selectedCards, player.sealedRank);
  }, [selectedCards, player.sealedRank]);

  const previewScore = preview
    ? preview.totalScore
    : selectedCards.reduce((s, c) => {
        if (c.rank === Rank.FLASH) return s;
        if (player.sealedRank !== null && c.rank === player.sealedRank) return s;
        return s + c.baseScore;
      }, 0);

  const bountyPreview = useMemo(() => {
    if (gs.bountyPool <= 0 || previewScore <= 0) return 0;
    for (const tier of BOUNTY_TIERS) {
      if (previewScore >= tier.minScore) return Math.floor(gs.bountyPool * tier.extractRate);
    }
    return 0;
  }, [previewScore, gs.bountyPool]);

  const handleSubmit = () => {
    submitChant(gs, selectedIds);
    setSelectedIds([]);
    onUpdate();
  };

  const handleSkip = () => {
    submitChant(gs, []);
    setSelectedIds([]);
    onUpdate();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}
    >
      <div style={{
        color: isFinal ? '#e74c3c' : '#9b59b6',
        fontSize: 14, fontWeight: 700, letterSpacing: 3,
      }}>
        {isFinal ? `炼狱咏唱 (剩余 ${gs.finalChantRoundsLeft} 回合)` : '咏 唱'}
      </div>

      {player.sealedRank !== null && (
        <div style={{
          padding: '3px 10px', borderRadius: 4,
          border: '1px solid #e74c3c', background: 'rgba(231,76,60,0.1)',
          color: '#e74c3c', fontSize: 10, fontWeight: 700,
        }}>
          被封印: {['', 'F', 'E', 'D', 'C', 'B', 'A'][player.sealedRank] || '?'} (计 0 分)
        </div>
      )}

      <div style={{ color: '#888', fontSize: 11 }}>点击手牌选择咏唱组合</div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
        {player.hand.map(card => (
          <ProtoCard
            key={card.id}
            card={card}
            selected={selectedIds.includes(card.id)}
            sealed={player.sealedRank !== null && card.rank === player.sealedRank}
            onClick={() => toggle(card.id)}
          />
        ))}
      </div>

      {/* 预览 */}
      {selectedCards.length > 0 && (
        <div style={{
          padding: '6px 14px', borderRadius: 8,
          background: 'rgba(0,0,0,0.5)', border: '1px solid #9b59b640',
          display: 'flex', gap: 12, alignItems: 'center',
        }}>
          <span style={{ color: '#888', fontSize: 11 }}>
            {preview ? comboTypeName(preview.type) : '散牌'}
          </span>
          {preview && (
            <span style={{ color: '#9b59b6', fontSize: 11, fontWeight: 700 }}>
              {preview.rawScore} x{preview.multiplier}
            </span>
          )}
          <span style={{ color: '#ffd700', fontSize: 16, fontWeight: 900, fontFamily: 'monospace' }}>
            {previewScore}
          </span>
          {bountyPreview > 0 && (
            <span style={{ color: '#ff8c00', fontSize: 11 }}>
              +悬赏 {bountyPreview}
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        {selectedCards.length > 0 && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={handleSubmit}
            style={{
              padding: '10px 24px', borderRadius: 8,
              border: '2px solid #9b59b6',
              background: 'linear-gradient(135deg, #9b59b6, #6c3483)',
              color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}
          >
            咏唱 (+{previewScore + bountyPreview})
          </motion.button>
        )}
        <motion.button
          whileHover={{ scale: 1.05 }}
          onClick={handleSkip}
          style={{
            padding: '10px 20px', borderRadius: 8,
            border: '1px solid #666',
            background: 'transparent',
            color: '#888', fontSize: 12, cursor: 'pointer',
          }}
        >
          跳过 (悬赏池 +5)
        </motion.button>
      </div>
    </motion.div>
  );
}
