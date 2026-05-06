/**
 * 阶段2：突袭与虚实之言 — 系统最高复杂度环节
 * 攻击方宣告 + 防守方抉择
 */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ICard, AmbushDeclaration, IAmbushState } from '../../types/game';
import { CardRank, GamePhase } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { Card } from '../board/Card';
import { getCardDisplayName, getRankColor, compareCards } from '../../utils/deck';

interface AmbushResult {
  choice: string;
  attackCard: ICard;
  defenderCard: ICard | null;
  declaration: AmbushDeclaration | null;
}

export function AmbushPhase() {
  const { gameState, localPlayerId, declareAmbush, respondAmbush, advancePhase, selectedCards, selectCard, clearSelection, engine } = useGameStore();
  const [selectedAmbushCard, setSelectedAmbushCard] = useState<string | null>(null);
  const [declaration, setDeclaration] = useState<AmbushDeclaration | null>(null);
  const [showDeclareModal, setShowDeclareModal] = useState(false);
  const [lastResult, setLastResult] = useState<AmbushResult | null>(null);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!engine) return;
    const handleResolved = (data: AmbushResult) => {
      setLastResult(data);
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      resultTimerRef.current = setTimeout(() => setLastResult(null), 3500);
    };
    engine.on('AMBUSH_RESOLVED', handleResolved);
    return () => {
      engine.off('AMBUSH_RESOLVED', handleResolved);
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    };
  }, [engine]);

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
      {/* 上次突袭结算结果展示 */}
      <AnimatePresence>
        {lastResult && (
          <AmbushResultPanel result={lastResult} isInverted={gameState.isInverted} />
        )}
      </AnimatePresence>

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
  ambushState: IAmbushState;
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

// ═══════════════════════════════════════════════════════════
//  突袭结算结果展示面板
// ═══════════════════════════════════════════════════════════

function AmbushResultPanel({ result, isInverted }: { result: AmbushResult; isInverted: boolean }) {
  const atkCard = result.attackCard;
  const defCard = result.defenderCard;
  const isFold = result.choice === 'FOLD';
  const isBluff = result.choice === 'CALL_BLUFF';

  let resultText = '';
  let resultColor = '#888';

  if (isFold) {
    resultText = '😰 怯战 — 攻击方收回牌并窃取';
    resultColor = '#b8860b';
  } else if (isBluff) {
    const isTruthful = result.declaration !== null && result.declaration !== 'SILENT' &&
      (result.declaration as CardRank) === atkCard.rank;
    resultText = isTruthful ? '拆穿失败！防守方 -15分' : '拆穿成功！攻击方 -15分';
    resultColor = isTruthful ? '#e74c3c' : '#2ecc71';
  } else if (defCard) {
    const cmp = compareCards(atkCard.rank, defCard.rank, isInverted);
    const isFSlaysA = (atkCard.rank === CardRank.F && defCard.rank === CardRank.A) ||
      (atkCard.rank === CardRank.A && defCard.rank === CardRank.F);
    if (cmp > 0) {
      resultText = isFSlaysA ? '⚡ F 弑神 A！攻击方胜' :
        `攻击方 ${getCardDisplayName(atkCard.rank)} 胜 > ${getCardDisplayName(defCard.rank)}`;
      resultColor = '#ffd700';
    } else if (cmp < 0) {
      resultText = isFSlaysA ? '⚡ F 弑神 A！防守方胜' :
        `防守方 ${getCardDisplayName(defCard.rank)} 胜 > ${getCardDisplayName(atkCard.rank)}`;
      resultColor = '#e74c3c';
    } else {
      resultText = '平局 — 血池保留';
      resultColor = '#888';
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.9 }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        padding: '16px 24px', borderRadius: 12,
        background: 'rgba(13,0,24,0.95)',
        border: `2px solid ${resultColor}40`,
        boxShadow: `0 0 20px ${resultColor}30`,
        width: '100%', maxWidth: 400,
      }}
    >
      <div style={{
        color: '#888', fontSize: 11, letterSpacing: 2,
        fontFamily: '"Cinzel", serif',
      }}>
        上次突袭结算
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* 攻击方牌 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <Card card={atkCard} size="sm" />
          <span style={{ color: '#b8860b', fontSize: 10 }}>攻击方</span>
        </div>

        <span style={{ color: resultColor, fontSize: 24, fontWeight: 900 }}>⚔</span>

        {/* 防守方牌 */}
        {defCard ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Card card={defCard} size="sm" />
            <span style={{ color: '#e74c3c', fontSize: 10 }}>防守方</span>
          </div>
        ) : (
          <div style={{
            width: 60, height: 84, borderRadius: 8,
            background: 'rgba(100,100,100,0.2)', border: '1px dashed #555',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#555', fontSize: 11,
          }}>
            {isFold ? '怯战' : isBluff ? '拆穿' : '—'}
          </div>
        )}
      </div>

      <motion.div
        style={{
          color: resultColor, fontSize: 14, fontWeight: 700,
          textShadow: `0 0 10px ${resultColor}60`,
          textAlign: 'center',
        }}
        animate={{ opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        {resultText}
      </motion.div>
    </motion.div>
  );
}
