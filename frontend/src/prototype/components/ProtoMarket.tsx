/**
 * v2.1 原型 — 黑市区
 */
import type { Card } from '../protoTypes';
import { PROTO_CONSTANTS as C } from '../protoTypes';
import { ProtoCard } from './ProtoCard';

interface Props {
  cards: Card[];
  playerScore: number;
  disabled?: boolean;
  onBuy?: (cardId: string) => void;
}

export function ProtoMarket({ cards, playerScore, disabled, onBuy }: Props) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 6,
      padding: '6px 10px', borderRadius: 8,
      background: 'rgba(0,0,0,0.3)', border: '1px solid #2a1a3e',
    }}>
      <div style={{ color: '#b8860b', fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>
        黑 市
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {cards.map(card => {
          const price = C.MARKET_PRICE[card.rank] ?? 2;
          const canAfford = playerScore >= price;
          return (
            <div key={card.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <ProtoCard
                card={card}
                disabled={disabled || !canAfford}
                onClick={!disabled && canAfford && onBuy ? () => onBuy(card.id) : undefined}
              />
              <div style={{
                fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
                color: canAfford ? '#ffd700' : '#666',
                padding: '1px 4px', borderRadius: 3,
                background: 'rgba(0,0,0,0.5)',
              }}>
                💰{price}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
