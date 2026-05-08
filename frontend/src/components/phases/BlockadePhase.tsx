/**
 * 阶段4：明牌封锁 — 拖拽弃牌至封锁区
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import type { ICard } from '../../types/game';
import { GAME_CONSTANTS, CardRank } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { Card } from '../board/Card';

export function BlockadePhase() {
  const { gameState, localPlayerId, placeBlockade, discardExcess, advancePhase } = useGameStore();
  const [blockadeSelected, setBlockadeSelected] = useState<string | null>(null);
  const [excessSelected, setExcessSelected] = useState<string[]>([]);

  if (!gameState) return null;

  const player = gameState.players[localPlayerId];
  const isMyTurn = gameState.currentTurnPlayerId === localPlayerId;
  const needsDiscard = player.hand.length > GAME_CONSTANTS.HAND_LIMIT;
  const excessCount = player.hand.length - GAME_CONSTANTS.HAND_LIMIT;

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

  const toggleExcess = (cardId: string) => {
    setExcessSelected(prev =>
      prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
        padding: 16,
      }}
    >
      {/* 手牌超限警告 */}
      {needsDiscard && (
        <motion.div
          style={{
            color: '#e74c3c',
            fontSize: 14,
            fontWeight: 700,
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #e74c3c',
            background: 'rgba(231,76,60,0.1)',
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
            选择 {excessCount} 张牌弃置 (已选 {excessSelected.length}/{excessCount})
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {player.hand.map(card => (
              <Card
                key={card.id}
                card={card}
                size="sm"
                isSelected={excessSelected.includes(card.id)}
                onClick={() => toggleExcess(card.id)}
              />
            ))}
          </div>
          <motion.button
            onClick={handleDiscard}
            disabled={excessSelected.length < excessCount}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: '1px solid #e74c3c',
              background: excessSelected.length >= excessCount
                ? 'linear-gradient(180deg, #4a1a1a, #2a0d0d)' : '#222',
              color: '#e74c3c',
              fontWeight: 700,
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
          <div style={{
            color: '#2ecc71',
            fontFamily: '"Cinzel", serif',
            fontSize: 16,
            fontWeight: 700,
          }}>
            🔒 选择一张牌封锁对手
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {player.hand.filter(c => c.rank !== CardRank.FLASH).map(card => (
              <Card
                key={card.id}
                card={card}
                size="sm"
                isSelected={blockadeSelected === card.id}
                onClick={isMyTurn ? (c) => setBlockadeSelected(c.id) : undefined}
              />
            ))}
            {player.hand.every(c => c.rank === CardRank.FLASH) && (
              <div style={{ color: '#666', fontSize: 12, fontStyle: 'italic' }}>
                手牌均为瞬牌，不可用于封锁
              </div>
            )}
          </div>

          {!isMyTurn && (
            <div style={{ color: '#666', fontSize: 12, fontStyle: 'italic' }}>
              对手正在选择封锁牌…
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            {blockadeSelected && (
              <motion.button
                onClick={handleBlockade}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  padding: '10px 24px',
                  borderRadius: 8,
                  border: '1px solid #2ecc71',
                  background: 'linear-gradient(180deg, #1a4a2e, #0d2818)',
                  color: '#2ecc71',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                whileHover={{ scale: 1.05 }}
              >
                🔒 确认封锁
              </motion.button>
            )}

            {isMyTurn && (
              <motion.button
                onClick={() => advancePhase()}
                style={{
                  padding: '10px 24px',
                  borderRadius: 8,
                  border: '1px solid #666',
                  background: 'transparent',
                  color: '#888',
                  cursor: 'pointer',
                  fontSize: 13,
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
