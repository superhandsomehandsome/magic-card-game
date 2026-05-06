/**
 * 阶段1：汲取与黑市 — 抽牌 + 黑市交易
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ICard } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { Card } from '../board/Card';
import { getCardDisplayName } from '../../utils/deck';

export function DrawMarketPhase() {
  const { gameState, localPlayerId, drawCards, buyMarketCard, advancePhase, selectedCards, selectCard, deselectCard, clearSelection } = useGameStore();
  const [hasDrawn, setHasDrawn] = useState(false);
  const [buyingCard, setBuyingCard] = useState<ICard | null>(null);

  if (!gameState) return null;
  const player = gameState.players[localPlayerId];
  const isMyTurn = gameState.currentTurnPlayerId === localPlayerId;

  const handleDraw = () => {
    if (!hasDrawn && isMyTurn) {
      drawCards();
      setHasDrawn(true);
    }
  };

  const handleMarketClick = (card: ICard) => {
    if (!isMyTurn) return;
    setBuyingCard(card);
    clearSelection();
  };

  const handleConfirmBuy = () => {
    if (!buyingCard) return;
    const success = buyMarketCard(buyingCard.id, selectedCards);
    if (success) {
      setBuyingCard(null);
      clearSelection();
    }
  };

  const handleCardSelect = (card: ICard) => {
    if (selectedCards.includes(card.id)) {
      deselectCard(card.id);
    } else {
      selectCard(card.id);
    }
  };

  const paymentTotal = selectedCards.reduce((sum, id) => {
    const card = player?.hand.find(c => c.id === id);
    return sum + (card?.baseScore ?? 0);
  }, 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        padding: 16,
      }}
    >
      {/* 抽牌按钮 */}
      {!hasDrawn && isMyTurn && (
        <motion.button
          onClick={handleDraw}
          style={{
            padding: '12px 32px',
            borderRadius: 8,
            border: '1px solid #b8860b',
            background: 'linear-gradient(180deg, #2d1b4e, #1a0b2e)',
            color: '#ffd700',
            fontFamily: '"Cinzel", serif',
            fontWeight: 700,
            fontSize: 16,
            cursor: 'pointer',
          }}
          whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(255,215,0,0.4)' }}
          whileTap={{ scale: 0.95 }}
        >
          🃏 汲取 (抽牌)
        </motion.button>
      )}

      {/* 购买弹窗 */}
      <AnimatePresence>
        {buyingCard && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
          >
            <div style={{
              background: 'linear-gradient(180deg, #1a0b2e, #0d0018)',
              border: '2px solid #b8860b',
              borderRadius: 16,
              padding: 32,
              maxWidth: 500,
              width: '90%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 20,
            }}>
              <h3 style={{ color: '#b8860b', fontFamily: '"Cinzel", serif', margin: 0 }}>
                ⛧ 黑市交易 ⛧
              </h3>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ color: '#888', fontSize: 12 }}>目标：</span>
                <Card card={buyingCard} size="lg" />
              </div>

              <div style={{ color: '#aaa', fontSize: 13 }}>
                需支付总分 ≥ {buyingCard.baseScore} 的手牌
              </div>

              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                justifyContent: 'center',
              }}>
                {player?.hand.map(card => (
                  <Card
                    key={card.id}
                    card={card}
                    size="sm"
                    isSelected={selectedCards.includes(card.id)}
                    onClick={handleCardSelect}
                  />
                ))}
              </div>

              <div style={{
                color: paymentTotal >= buyingCard.baseScore ? '#2ecc71' : '#e74c3c',
                fontSize: 16,
                fontWeight: 700,
              }}>
                已选支付：{paymentTotal} / {buyingCard.baseScore}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <motion.button
                  onClick={handleConfirmBuy}
                  disabled={paymentTotal < buyingCard.baseScore}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 8,
                    border: '1px solid #2ecc71',
                    background: paymentTotal >= buyingCard.baseScore
                      ? 'linear-gradient(180deg, #1a4a2e, #0d2818)'
                      : '#333',
                    color: '#2ecc71',
                    fontWeight: 700,
                    cursor: paymentTotal >= buyingCard.baseScore ? 'pointer' : 'not-allowed',
                    opacity: paymentTotal >= buyingCard.baseScore ? 1 : 0.5,
                  }}
                  whileHover={paymentTotal >= buyingCard.baseScore ? { scale: 1.05 } : {}}
                >
                  确认支付
                </motion.button>
                <motion.button
                  onClick={() => { setBuyingCard(null); clearSelection(); }}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 8,
                    border: '1px solid #666',
                    background: 'transparent',
                    color: '#999',
                    cursor: 'pointer',
                  }}
                  whileHover={{ scale: 1.05 }}
                >
                  取消
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 继续按钮 */}
      {hasDrawn && isMyTurn && (
        <motion.button
          onClick={() => advancePhase()}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            padding: '10px 24px',
            borderRadius: 8,
            border: '1px solid #b8860b',
            background: 'linear-gradient(180deg, #2d1b4e, #1a0b2e)',
            color: '#b8860b',
            fontFamily: '"Cinzel", serif',
            fontWeight: 700,
            cursor: 'pointer',
          }}
          whileHover={{ scale: 1.05 }}
        >
          进入突袭阶段 →
        </motion.button>
      )}
    </motion.div>
  );
}
