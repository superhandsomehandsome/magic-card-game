/**
 * v2.1 原型 — 手牌区
 */
import type { Card } from '../protoTypes';
import { Rank } from '../protoTypes';
import { ProtoCard } from './ProtoCard';

interface Props {
  cards: Card[];
  selectedIds?: string[];
  sealedRank?: number | null;
  disabled?: boolean;
  onToggle?: (cardId: string) => void;
}

export function ProtoHand({ cards, selectedIds = [], sealedRank, disabled, onToggle }: Props) {
  return (
    <div style={{
      display: 'flex', gap: 4, flexWrap: 'wrap',
      justifyContent: 'center', padding: '4px 0',
    }}>
      {cards.map(card => (
        <ProtoCard
          key={card.id}
          card={card}
          selected={selectedIds.includes(card.id)}
          sealed={sealedRank !== null && sealedRank !== undefined && card.rank === sealedRank}
          disabled={disabled}
          onClick={onToggle ? () => onToggle(card.id) : undefined}
        />
      ))}
      {cards.length === 0 && (
        <div style={{ color: '#666', fontSize: 12, padding: 16 }}>手牌为空</div>
      )}
    </div>
  );
}
