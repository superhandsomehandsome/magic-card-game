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
import { HeroType, GAME_CONSTANTS } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { Card } from '../board/Card';
import { aggregateEffectsFor } from '../../core/decrees';

export function DrawMarketPhase() {
  const {
    gameState, localPlayerId, drawCards, buyMarketCard, advancePhase,
    selectedCards, selectCard, deselectCard, clearSelection,
    setHandClickHandler, claimFreeMarketCard,
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

  // 自动汲取: 进入此阶段后 600ms 自动抽牌, 玩家无需点按钮
  useEffect(() => {
    if (!isMyTurn || hasDrawn) return;
    const t = setTimeout(() => {
      drawCards();
      setHasDrawn(true);
    }, 600);
    return () => clearTimeout(t);
  }, [isMyTurn, hasDrawn, drawCards]);

  if (!gameState || !player) return null;

  // 计算当前玩家的法案效果 (破产法案: priceMult=0 → 白嫖)
  const effects = isMyTurn ? aggregateEffectsFor(gameState, localPlayerId) : null;
  const priceMult = effects?.marketPriceMultiplier ?? 1;
  const isFree = priceMult === 0; // 是否白嫖模式

  // 黑市奇妙夜：免费盲抽
  const freeDrawBase = effects?.marketFreeDrawCount ?? 0;
  const isPhantom = player?.hero === HeroType.PHANTOM;
  const maxFreeDraws = freeDrawBase > 0
    ? freeDrawBase + (isPhantom ? 1 : 0)
    : 0;
  const freeDrawsLeft = Math.max(0, maxFreeDraws - (player?.freeMarketDrawsThisTurn || 0));
  const isMidnight = freeDrawBase > 0;

  // 是否已经买了 1 张普通牌 → 决定是否自动关门
  const buyLimit = isPhantom ? GAME_CONSTANTS.PHANTOM_MARKET_LIMIT : GAME_CONSTANTS.MARKET_BUY_LIMIT;
  const buysLeft = Math.max(0, buyLimit - (player?.marketBuysThisTurn || 0));
  const hasFinishedShopping = buysLeft <= 0 && freeDrawsLeft <= 0;

  // 某张牌的有效价格
  const effectivePrice = (card: ICard) => Math.round(card.baseScore * priceMult);

  const handleSelectMarket = (card: ICard) => {
    if (!isMyTurn) return;
    if (buysLeft <= 0) return; // 已达购买上限

    // 白嫖模式: 直接一键购买, 无需支付流程
    if (isFree) {
      buyMarketCard(card.id, []);
      return;
    }

    if (buyingCard?.id === card.id) {
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

  // 自动关门：完成所有可执行操作（买完上限 + 用完免费抽）后 1.2s 自动进入下一阶段
  useEffect(() => {
    if (!isMyTurn || !hasDrawn || buyingCard) return;
    if (!hasFinishedShopping) return;
    const t = setTimeout(() => advancePhase(), 1200);
    return () => clearTimeout(t);
  }, [isMyTurn, hasDrawn, buyingCard, hasFinishedShopping, advancePhase]);

  const paymentTotal = selectedCards.reduce((sum, id) => {
    const c = player.hand.find(h => h.id === id);
    return sum + (c?.baseScore ?? 0);
  }, 0);

  const enough = buyingCard && paymentTotal >= effectivePrice(buyingCard);

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
      {/* 自动汲取提示 (无需点击) */}
      {!hasDrawn && isMyTurn && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            color: '#ffd700',
            fontFamily: '"Cinzel", serif',
            fontSize: 13,
            letterSpacing: 2,
            padding: '6px 16px',
            border: '1px solid #b8860b',
            borderRadius: 6,
            background: 'rgba(26,11,46,0.6)',
          }}
        >
          🃏 汲取中...
        </motion.div>
      )}

      {/* 黑市标题 */}
      <motion.h3
        style={{
          color: isMidnight ? '#a18bff' : '#b8860b',
          fontFamily: '"Cinzel", serif',
          fontSize: 13,
          letterSpacing: 3,
          margin: 0,
        }}
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        {isMidnight ? '🌙 黑 市 奇 妙 夜 🌙' : '⛧ 黑 市 ⛧'}
      </motion.h3>

      {/* 黑市奇妙夜：背面盲抽提示 */}
      {isMidnight && isMyTurn && freeDrawsLeft > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: '8px 16px', borderRadius: 8,
            background: 'rgba(120,60,200,0.18)',
            border: '1px solid #9b6bdf',
            color: '#c4a0ff',
            fontSize: 12, fontWeight: 700, letterSpacing: 2,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}
        >
          <div>🌙 今夜黑市全部盖牌 — 你可以背面盲抽 {freeDrawsLeft} 张</div>
          <button
            onClick={() => claimFreeMarketCard()}
            style={{
              padding: '6px 14px', borderRadius: 6,
              border: '1px solid #c4a0ff',
              background: 'linear-gradient(135deg, #4a2f8e, #2a1450)',
              color: '#fff', fontWeight: 700, fontSize: 12,
              cursor: 'pointer', letterSpacing: 1,
            }}
          >
            ✦ 盲抽一张
          </button>
        </motion.div>
      )}

      {/* 剩余购买次数 */}
      {isMyTurn && hasDrawn && (
        <div style={{ color: '#888', fontSize: 11, fontFamily: 'monospace' }}>
          剩余购买 {buysLeft} 次{isPhantom ? '（怪盗：上限 2）' : ''}
        </div>
      )}

      {/* 黑市卡牌（点击选择购买目标） */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        {gameState.marketCards.map(card => {
          const disabled = buysLeft <= 0;
          // 黑市奇妙夜：黑市牌"假装"显示为背面（视觉效果）
          if (isMidnight && isMyTurn) {
            return (
              <div key={card.id} style={{
                width: 80, height: 112, borderRadius: 8,
                border: '2px solid #9b6bdf',
                background: 'linear-gradient(135deg, #4a2f8e, #3a1f6e 50%, #2a1450)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 12px rgba(180,140,255,0.5)',
              }}>
                <div style={{ color: '#e8d4ff', fontSize: 32, textShadow: '0 0 12px rgba(220,180,255,1)' }}>✦</div>
              </div>
            );
          }
          return (
            <motion.div
              key={card.id}
              whileHover={isMyTurn && !disabled ? { scale: 1.05, y: -3 } : undefined}
              onClick={() => handleSelectMarket(card)}
              style={{ opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
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
                background: isFree
                  ? 'rgba(46,204,113,0.25)'
                  : (buyingCard?.id === card.id ? '#ffd700' : 'rgba(0,0,0,0.6)'),
                color: isFree
                  ? '#2ecc71'
                  : (buyingCard?.id === card.id ? '#1a0b2e' : '#b8860b'),
                fontSize: 11, fontWeight: 700,
                textAlign: 'center',
                fontFamily: 'monospace',
                border: isFree ? '1px solid #2ecc71' : '1px solid #b8860b',
                boxShadow: isFree ? '0 0 6px rgba(46,204,113,0.4)' : 'none',
              }}>
                {isFree ? '🆓 免费' : `💰 ${effectivePrice(card)}`}
              </div>
            </motion.div>
          );
        })}
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

      {/* 购买面板（白嫖模式时不显示; 普通模式选中后显示） */}
      <AnimatePresence>
        {buyingCard && isMyTurn && !isFree && (
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
              点击下方手牌凑足 <b style={{ color: '#ffd700' }}>{effectivePrice(buyingCard)}</b> 分支付
            </div>
            <div style={{
              fontSize: 18, fontWeight: 900, fontFamily: 'monospace',
              color: enough ? '#2ecc71' : '#e74c3c',
              textShadow: enough ? '0 0 10px rgba(46,204,113,0.6)' : 'none',
            }}>
              {paymentTotal} / {effectivePrice(buyingCard)}
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

      {/* 白嫖提示条 */}
      {isFree && isMyTurn && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            padding: '8px 20px', borderRadius: 8,
            background: 'rgba(46,204,113,0.15)',
            border: '1px solid #2ecc71',
            color: '#2ecc71',
            fontSize: 13, fontWeight: 700, letterSpacing: 2,
            boxShadow: '0 0 12px rgba(46,204,113,0.3)',
          }}
        >
          🆓 破产法案：点击任意黑市牌即可免费获得
        </motion.div>
      )}

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
