/**
 * 阶段1：汲取与黑市 — 抽牌 + 黑市交易（内联购买流程）
 *
 * 流程：
 *   1. 点击 🃏 汲取按钮 → 抽 2 张牌
 *   2. 点击黑市某张牌 → 高亮选中，下方提示「需支付 X 分」
 *   3. 点击底部手牌 → 累计支付分（绿/红 反馈）
 *   4. 凑足后 → "确认购买" 按钮亮起
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ICard } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { Card } from '../board/Card';

export function DrawMarketPhase() {
  const {
    gameState, localPlayerId, drawCards, buyMarketCard, advancePhase,
    selectedCards, selectCard, deselectCard, clearSelection,
    setHandClickHandler,
  } = useGameStore();
  const [hasDrawn, setHasDrawn] = useState(false);
  const [buyingCard, setBuyingCard] = useState<ICard | null>(null);

  const player = gameState?.players[localPlayerId];
  const isMyTurn = gameState?.currentTurnPlayerId === localPlayerId;

  // 注册底部手牌点击 handler — 选/反选支付牌
  useEffect(() => {
    if (!isMyTurn || !buyingCard) {
      setHandClickHandler(null);
      return;
    }
    setHandClickHandler((card: ICard) => {
      if (selectedCards.includes(card.id)) {
        deselectCard(card.id);
      } else {
        selectCard(card.id);
      }
    });
    return () => setHandClickHandler(null);
  }, [isMyTurn, buyingCard, selectedCards, selectCard, deselectCard, setHandClickHandler]);

  if (!gameState || !player) return null;

  const handleDraw = () => {
    if (!hasDrawn && isMyTurn) {
      drawCards();
      setHasDrawn(true);
    }
  };

  const handleSelectMarket = (card: ICard) => {
    if (!isMyTurn) return;
    if (buyingCard?.id === card.id) {
      // 取消选择
      setBuyingCard(null);
      clearSelection();
      return;
    }
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

  const paymentTotal = selectedCards.reduce((sum, id) => {
    const c = player.hand.find(h => h.id === id);
    return sum + (c?.baseScore ?? 0);
  }, 0);

  const enough = buyingCard && paymentTotal >= buyingCard.baseScore;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: 12,
      }}
    >
      {/* 抽牌按钮 */}
      {!hasDrawn && isMyTurn && (
        <motion.button
          onClick={handleDraw}
          style={{
            padding: '10px 26px',
            borderRadius: 8,
            border: '1px solid #b8860b',
            background: 'linear-gradient(180deg, #2d1b4e, #1a0b2e)',
            color: '#ffd700',
            fontFamily: '"Cinzel", serif',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
          whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(255,215,0,0.4)' }}
          whileTap={{ scale: 0.95 }}
        >
          🃏 汲取 (抽牌)
        </motion.button>
      )}

      {/* 黑市标题 */}
      <motion.h3
        style={{
          color: '#b8860b',
          fontFamily: '"Cinzel", serif',
          fontSize: 13,
          letterSpacing: 3,
          margin: 0,
        }}
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        ⛧ 黑 市 ⛧
      </motion.h3>

      {/* 黑市卡牌（点击选择购买目标） */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        {gameState.marketCards.map(card => (
          <motion.div
            key={card.id}
            whileHover={isMyTurn ? { scale: 1.05, y: -3 } : undefined}
            onClick={() => handleSelectMarket(card)}
          >
            <Card
              card={card}
              size="md"
              isSelected={buyingCard?.id === card.id}
            />
            {/* 价格标签 */}
            <div style={{
              marginTop: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: buyingCard?.id === card.id ? '#ffd700' : 'rgba(0,0,0,0.6)',
              color: buyingCard?.id === card.id ? '#1a0b2e' : '#b8860b',
              fontSize: 11, fontWeight: 700,
              textAlign: 'center',
              fontFamily: 'monospace',
              border: '1px solid #b8860b',
            }}>
              💰 {card.baseScore}
            </div>
          </motion.div>
        ))}
        {/* 空槽位 */}
        {Array.from({ length: 3 - gameState.marketCards.length }).map((_, i) => (
          <div key={`empty-${i}`} style={{
            width: 80, height: 112,
            borderRadius: 8,
            border: '2px dashed #3a1f5e',
            background: 'rgba(26,11,46,0.4)',
          }} />
        ))}
      </div>

      {/* 购买面板（仅在选中目标卡时显示） */}
      <AnimatePresence>
        {buyingCard && isMyTurn && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              padding: '10px 18px', borderRadius: 10,
              background: 'rgba(13,0,24,0.85)',
              border: `2px solid ${enough ? '#2ecc71' : '#b8860b'}`,
              boxShadow: enough
                ? '0 0 18px rgba(46,204,113,0.4)'
                : '0 0 12px rgba(184,134,11,0.3)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              minWidth: 280,
            }}
          >
            <div style={{ color: '#888', fontSize: 11, letterSpacing: 2 }}>
              点击下方手牌凑足 <b style={{ color: '#ffd700' }}>{buyingCard.baseScore}</b> 分支付
            </div>
            <div style={{
              fontSize: 18, fontWeight: 900, fontFamily: 'monospace',
              color: enough ? '#2ecc71' : '#e74c3c',
              textShadow: enough ? '0 0 10px rgba(46,204,113,0.6)' : 'none',
            }}>
              {paymentTotal} / {buyingCard.baseScore}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <motion.button
                onClick={handleConfirmBuy}
                disabled={!enough}
                whileHover={enough ? { scale: 1.05 } : undefined}
                style={{
                  padding: '8px 18px', borderRadius: 6,
                  border: '1px solid #2ecc71',
                  background: enough
                    ? 'linear-gradient(180deg, #1a4a2e, #0d2818)'
                    : '#222',
                  color: enough ? '#2ecc71' : '#555',
                  fontWeight: 700, fontSize: 13,
                  cursor: enough ? 'pointer' : 'not-allowed',
                }}
              >
                ✓ 确认购买
              </motion.button>
              <button
                onClick={() => { setBuyingCard(null); clearSelection(); }}
                style={{
                  padding: '8px 18px', borderRadius: 6,
                  border: '1px solid #666', background: 'transparent',
                  color: '#888', cursor: 'pointer', fontSize: 12,
                }}
              >
                取消
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 继续按钮 */}
      {hasDrawn && isMyTurn && !buyingCard && (
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

      {!isMyTurn && (
        <div style={{ color: '#666', fontSize: 12, fontStyle: 'italic' }}>
          🤖 对手抽牌 / 黑市中…
        </div>
      )}
    </motion.div>
  );
}
