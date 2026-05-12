/**
 * v2.1 原型 — 汲取阶段（抽 3 选 2 + 黑市）
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import type { GameState } from '../protoTypes';
import { PROTO_CONSTANTS as C } from '../protoTypes';
import { gatherKeep, buyMarketCard } from '../protoEngine';
import { ProtoCard } from './ProtoCard';
import { ProtoMarket } from './ProtoMarket';

interface Props {
  gs: GameState;
  onUpdate: () => void;
}

export function GatherPhase({ gs, onUpdate }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const player = gs.players[gs.currentPlayerId];
  const hasOffers = gs.gatherOffers.length > 0;

  const toggleOffer = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < C.DRAW_KEEP_COUNT ? [...prev, id] : prev
    );
  };

  const handleConfirm = () => {
    if (selectedIds.length !== Math.min(C.DRAW_KEEP_COUNT, gs.gatherOffers.length)) return;
    gatherKeep(gs, selectedIds);
    setSelectedIds([]);
    onUpdate();
  };

  const handleBuy = (cardId: string) => {
    buyMarketCard(gs, cardId);
    onUpdate();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
    >
      <div style={{ color: '#ffd700', fontSize: 14, fontWeight: 700, letterSpacing: 3 }}>
        汲 取
      </div>

      {hasOffers && (
        <>
          <div style={{ color: '#ccc', fontSize: 11 }}>
            选择 {Math.min(C.DRAW_KEEP_COUNT, gs.gatherOffers.length)} 张保留，其余放入黑市
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {gs.gatherOffers.map(card => (
              <ProtoCard
                key={card.id}
                card={card}
                selected={selectedIds.includes(card.id)}
                onClick={() => toggleOffer(card.id)}
              />
            ))}
          </div>
          <motion.button
            onClick={handleConfirm}
            disabled={selectedIds.length !== Math.min(C.DRAW_KEEP_COUNT, gs.gatherOffers.length)}
            whileHover={{ scale: 1.05 }}
            style={{
              padding: '8px 20px', borderRadius: 8,
              border: '1px solid #b8860b',
              background: selectedIds.length === Math.min(C.DRAW_KEEP_COUNT, gs.gatherOffers.length)
                ? 'linear-gradient(135deg, #2d1b4e, #1a0b2e)' : '#222',
              color: selectedIds.length === Math.min(C.DRAW_KEEP_COUNT, gs.gatherOffers.length)
                ? '#ffd700' : '#555',
              fontWeight: 700, fontSize: 12, cursor: 'pointer',
            }}
          >
            确认选择
          </motion.button>
        </>
      )}

      <ProtoMarket
        cards={gs.marketCards}
        playerScore={player.score}
        onBuy={handleBuy}
      />
    </motion.div>
  );
}
