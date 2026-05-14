/**
 * 阶段4：明牌封锁 — 从底部手牌点击选牌封锁
 */
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { ICard } from '../../types/game';
import { GAME_CONSTANTS, CardRank } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { Card } from '../board/Card';

export function BlockadePhase() {
  const { gameState, localPlayerId, placeBlockade, discardExcess, advancePhase, setHandClickHandler } = useGameStore();
  const [blockadeSelected, setBlockadeSelected] = useState<string | null>(null);
  const [excessSelected, setExcessSelected] = useState<string[]>([]);

  if (!gameState) return null;

  const player = gameState.players[localPlayerId];
  const isMyTurn = gameState.currentTurnPlayerId === localPlayerId;
  const needsDiscard = player.hand.length > GAME_CONSTANTS.HAND_LIMIT;
  const excessCount = player.hand.length - GAME_CONSTANTS.HAND_LIMIT;

  // 注册手牌点击 handler — 封锁选牌 / 弃牌选牌
  useEffect(() => {
    if (!isMyTurn) { setHandClickHandler(null); return; }
    if (needsDiscard) {
      setHandClickHandler((card: ICard) => {
        setExcessSelected(prev =>
          prev.includes(card.id) ? prev.filter(id => id !== card.id) : [...prev, card.id]
        );
      });
    } else {
      setHandClickHandler((card: ICard) => {
        if (card.rank === CardRank.FLASH) return;
        setBlockadeSelected(prev => prev === card.id ? null : card.id);
      });
    }
    return () => setHandClickHandler(null);
  }, [isMyTurn, needsDiscard, setHandClickHandler]);

  const handleBlockade = () => {
    if (blockadeSelected && isMyTurn) {
      placeBlockade(blockadeSelected);
      setBlockadeSelected(null);
    }
  };

  const handleDiscard = () => {
    if (excessSelected.length >= excessCount) {
      discardExcess(excessSelected);
      setExcessSelected([]);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'clamp(8px, 2vh, 20px)',
        padding: 'clamp(8px, 2vh, 16px)',
      }}
    >
      {needsDiscard && (
        <motion.div
          style={{
            color: '#e74c3c', fontSize: 14, fontWeight: 700,
            padding: '8px 16px', borderRadius: 8,
            border: '1px solid #e74c3c', background: 'rgba(231,76,60,0.1)',
          }}
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          ⚠️ 手牌超限！需弃置 {excessCount} 张
        </motion.div>
      )}

      {needsDiscard ? (
        <>
          <div style={{ color: '#aaa', fontSize: 13 }}>
            点击下方手牌选择弃置 (已选 {excessSelected.length}/{excessCount})
          </div>
          <motion.button
            onClick={handleDiscard}
            disabled={excessSelected.length < excessCount}
            style={{
              padding: '10px 24px', borderRadius: 8,
              border: '1px solid #e74c3c',
              background: excessSelected.length >= excessCount
                ? 'linear-gradient(180deg, #4a1a1a, #2a0d0d)' : '#222',
              color: '#e74c3c', fontWeight: 700,
              cursor: excessSelected.length >= excessCount ? 'pointer' : 'not-allowed',
              opacity: excessSelected.length >= excessCount ? 1 : 0.5,
            }}
            whileHover={excessSelected.length >= excessCount ? { scale: 1.05 } : {}}
          >
            确认弃置
          </motion.button>
        </>
      ) : (
        <>
          {isMyTurn ? (
            <motion.div
              style={{
                color: '#2ecc71', fontFamily: '"Cinzel", serif',
                fontSize: 14, fontWeight: 700, letterSpacing: 2,
                textAlign: 'center',
              }}
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              🔒 暗置封锁牌（对手不可见，瞬牌不可封锁）
            </motion.div>
          ) : (
            <div style={{ color: '#666', fontSize: 12, fontStyle: 'italic' }}>
              对手正在选择封锁牌…
            </div>
          )}

          {/* 选中预览 */}
          {blockadeSelected && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <Card
                card={player.hand.find(c => c.id === blockadeSelected)!}
                size="sm"
                isSelected
              />
              <span style={{ color: '#2ecc71', fontSize: 12 }}>将暗置封锁此等级</span>
            </motion.div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            {blockadeSelected && (
              <motion.button
                onClick={handleBlockade}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  padding: '10px 24px', borderRadius: 8,
                  border: '1px solid #2ecc71',
                  background: 'linear-gradient(180deg, #1a4a2e, #0d2818)',
                  color: '#2ecc71', fontWeight: 700, cursor: 'pointer',
                }}
                whileHover={{ scale: 1.05 }}
              >
                🔒 暗置封锁
              </motion.button>
            )}

            {isMyTurn && (
              <motion.button
                onClick={() => advancePhase()}
                style={{
                  padding: '10px 24px', borderRadius: 8,
                  border: '1px solid #666', background: 'transparent',
                  color: '#888', cursor: 'pointer', fontSize: 13,
                }}
                whileHover={{ scale: 1.05 }}
              >
                跳过封锁 → 结束回合
              </motion.button>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}
