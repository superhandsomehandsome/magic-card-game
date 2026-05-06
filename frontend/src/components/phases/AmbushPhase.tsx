/**
 * 阶段2：突袭与虚实之言 — 系统最高复杂度环节
 * 攻击方宣告 + 防守方抉择
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ICard, AmbushDeclaration } from '../../types/game';
import { CardRank, GamePhase } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { Card } from '../board/Card';
import { getCardDisplayName } from '../../utils/deck';

export function AmbushPhase() {
  const { gameState, localPlayerId, declareAmbush, respondAmbush, advancePhase, selectedCards, selectCard, clearSelection } = useGameStore();
  const [selectedAmbushCard, setSelectedAmbushCard] = useState<string | null>(null);
  const [declaration, setDeclaration] = useState<AmbushDeclaration | null>(null);
  const [showDeclareModal, setShowDeclareModal] = useState(false);

  if (!gameState) return null;

  const player = gameState.players[localPlayerId];
  const isMyTurn = gameState.currentTurnPlayerId === localPlayerId;
  const isDefending = gameState.phase === GamePhase.AMBUSH_DEFEND &&
    gameState.ambushState?.defenderId === localPlayerId;

  // ═══════════════════════════════════════════════════════════
  //  攻击方视角：宣告突袭
  // ═══════════════════════════════════════════════════════════

  const handleSelectAmbushCard = (card: ICard) => {
    setSelectedAmbushCard(card.id);
    setShowDeclareModal(true);
  };

  const handleDeclare = (decl: AmbushDeclaration | null) => {
    if (!selectedAmbushCard) return;
    setDeclaration(decl);
    const success = declareAmbush(selectedAmbushCard, decl);
    if (success) {
      setShowDeclareModal(false);
      setSelectedAmbushCard(null);
    }
  };

  // ═══════════════════════════════════════════════════════════
  //  防守方视角：抉择
  // ═══════════════════════════════════════════════════════════

  const handleDefendChoice = (choice: 'FOLD' | 'CALL_BLUFF' | 'DEFEND', cardId?: string) => {
    respondAmbush(choice, cardId);
  };

  // ═══════════════════════════════════════════════════════════
  //  渲染
  // ═══════════════════════════════════════════════════════════

  if (isDefending && gameState.ambushState) {
    return <DefenderView
      ambushState={gameState.ambushState}
      hand={player.hand}
      onChoice={handleDefendChoice}
    />;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        padding: 16,
      }}
    >
      {isMyTurn && gameState.phase === GamePhase.AMBUSH_DECLARE && (
        <>
          <div style={{
            color: '#ff4500',
            fontFamily: '"Cinzel", serif',
            fontSize: 16,
            fontWeight: 700,
          }}>
            ⚡ 选择一张牌发起突袭 ({player.ambushesThisTurn}/{2})
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {player.hand.map(card => (
              <Card
                key={card.id}
                card={card}
                size="sm"
                isSelected={selectedAmbushCard === card.id}
                onClick={handleSelectAmbushCard}
              />
            ))}
          </div>

          <motion.button
            onClick={() => advancePhase()}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: '1px solid #666',
              background: 'transparent',
              color: '#999',
              cursor: 'pointer',
              marginTop: 8,
            }}
            whileHover={{ scale: 1.05 }}
          >
            跳过突袭 → 咏唱阶段
          </motion.button>
        </>
      )}

      {/* 宣告弹窗 */}
      <AnimatePresence>
        {showDeclareModal && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
          >
            <div style={{
              background: 'linear-gradient(180deg, #1a0b2e, #0d0018)',
              border: '2px solid #ff4500',
              borderRadius: 16,
              padding: 32,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 20,
            }}>
              <h3 style={{ color: '#ff4500', fontFamily: '"Cinzel", serif', margin: 0 }}>
                ⚡ 虚实之言 ⚡
              </h3>
              <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>
                宣告你的牌等级，或保持沉默
              </p>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {[CardRank.A, CardRank.B, CardRank.C, CardRank.D, CardRank.E, CardRank.F].map(rank => (
                  <motion.button
                    key={rank}
                    onClick={() => handleDeclare(rank)}
                    style={{
                      width: 50, height: 50,
                      borderRadius: 8,
                      border: '1px solid #b8860b',
                      background: '#1a0b2e',
                      color: '#ffd700',
                      fontWeight: 900,
                      fontSize: 18,
                      cursor: 'pointer',
                    }}
                    whileHover={{ scale: 1.1, boxShadow: '0 0 15px rgba(255,215,0,0.5)' }}
                    whileTap={{ scale: 0.9 }}
                  >
                    {getCardDisplayName(rank)}
                  </motion.button>
                ))}
              </div>

              <motion.button
                onClick={() => handleDeclare(null)}
                style={{
                  padding: '10px 32px',
                  borderRadius: 8,
                  border: '1px solid #666',
                  background: 'transparent',
                  color: '#888',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
                whileHover={{ scale: 1.05 }}
              >
                🤫 保持沉默
              </motion.button>

              <motion.button
                onClick={() => { setShowDeclareModal(false); setSelectedAmbushCard(null); }}
                style={{
                  padding: '8px 20px',
                  border: 'none',
                  background: 'transparent',
                  color: '#666',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                取消
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  防守方视角子组件
// ═══════════════════════════════════════════════════════════

interface DefenderViewProps {
  ambushState: NonNullable<typeof useGameStore extends () => infer S ? S extends { gameState: infer G } ? G extends { ambushState: infer A } ? A : never : never : never>;
  hand: ICard[];
  onChoice: (choice: 'FOLD' | 'CALL_BLUFF' | 'DEFEND', cardId?: string) => void;
}

function DefenderView({ ambushState, hand, onChoice }: DefenderViewProps) {
  const [selectedDefendCard, setSelectedDefendCard] = useState<string | null>(null);
  const hasDeclaration = ambushState.declaration !== null && ambushState.declaration !== 'SILENT';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
        padding: 24,
      }}
    >
      {/* 警告闪烁 */}
      <motion.div
        style={{
          color: '#ff0000',
          fontFamily: '"Cinzel", serif',
          fontSize: 20,
          fontWeight: 900,
          textShadow: '0 0 20px rgba(255,0,0,0.8)',
        }}
        animate={{
          opacity: [0.5, 1, 0.5],
          textShadow: ['0 0 10px rgba(255,0,0,0.4)', '0 0 30px rgba(255,0,0,1)', '0 0 10px rgba(255,0,0,0.4)'],
        }}
        transition={{ duration: 0.8, repeat: Infinity }}
      >
        ⚠️ 遭到突袭！
      </motion.div>

      {hasDeclaration && (
        <div style={{ color: '#ffd700', fontSize: 14 }}>
          对手宣告：这是一张 <strong>{getCardDisplayName(ambushState.declaration as CardRank)}</strong>
        </div>
      )}

      {/* 抉择按钮 */}
      <div style={{ display: 'flex', gap: 12 }}>
        <motion.button
          onClick={() => onChoice('FOLD')}
          style={{
            padding: '14px 24px',
            borderRadius: 8,
            border: '2px solid #666',
            background: 'linear-gradient(180deg, #2a2a2a, #1a1a1a)',
            color: '#aaa',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          😰 怯战 (Fold)
        </motion.button>

        {hasDeclaration && (
          <motion.button
            onClick={() => onChoice('CALL_BLUFF')}
            style={{
              padding: '14px 24px',
              borderRadius: 8,
              border: '2px solid #ff6347',
              background: 'linear-gradient(180deg, #4a1a1a, #2a0d0d)',
              color: '#ff6347',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
            whileHover={{ scale: 1.05, boxShadow: '0 0 15px rgba(255,99,71,0.5)' }}
            whileTap={{ scale: 0.95 }}
          >
            🔥 拆穿 (Call Bluff)
          </motion.button>
        )}

        <motion.button
          onClick={() => {
            if (selectedDefendCard) onChoice('DEFEND', selectedDefendCard);
          }}
          disabled={!selectedDefendCard}
          style={{
            padding: '14px 24px',
            borderRadius: 8,
            border: '2px solid #2ecc71',
            background: selectedDefendCard
              ? 'linear-gradient(180deg, #1a4a2e, #0d2818)'
              : '#222',
            color: '#2ecc71',
            fontWeight: 700,
            fontSize: 14,
            cursor: selectedDefendCard ? 'pointer' : 'not-allowed',
            opacity: selectedDefendCard ? 1 : 0.5,
          }}
          whileHover={selectedDefendCard ? { scale: 1.05 } : {}}
        >
          ⚔️ 迎战 (Defend)
        </motion.button>
      </div>

      {/* 选择迎战牌 */}
      <div style={{ color: '#888', fontSize: 12 }}>选择一张牌迎战：</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {hand.map(card => (
          <Card
            key={card.id}
            card={card}
            size="sm"
            isSelected={selectedDefendCard === card.id}
            onClick={(c) => setSelectedDefendCard(c.id)}
          />
        ))}
      </div>
    </motion.div>
  );
}
