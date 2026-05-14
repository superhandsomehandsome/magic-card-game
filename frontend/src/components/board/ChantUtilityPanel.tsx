/**
 * 咏唱阶段辅助技能面板 — 先知低语 & 黑暗献祭
 *
 * 仅在咏唱阶段（自己的回合）显示，放置在大招按钮旁边。
 * 各自包含完整的弹窗逻辑。
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ICard } from '../../types/game';
import { GamePhase, CardRank } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { getCardDisplayName } from '../../utils/deck';
import { Card } from './Card';

export function ChantUtilityPanel() {
  const gameState = useGameStore(s => s.gameState);
  const localPlayerId = useGameStore(s => s.localPlayerId);
  const useOracle = useGameStore(s => s.useOracle);
  const darkSacrifice = useGameStore(s => s.darkSacrifice);

  const [showOracle, setShowOracle] = useState(false);
  const [showSacrifice, setShowSacrifice] = useState(false);
  const [oracleResult, setOracleResult] = useState<{ cards: ICard[]; label: string } | null>(null);

  if (!gameState) return null;
  if (gameState.phase !== GamePhase.CHANT_SCORE) return null;
  if (gameState.currentTurnPlayerId !== localPlayerId) return null;

  const player = gameState.players[localPlayerId];
  const canOracle = !player.hasUsedOracle;
  const canSacrifice = !player.hasUsedDarkSacrificeThisTurn && gameState.discardPile.length > 0;

  if (!canOracle && !canSacrifice) return null;

  return (
    <>
      {/* 技能按钮组 */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        alignItems: 'flex-end',
      }}>
        {canOracle && (
          <motion.button
            onClick={() => setShowOracle(true)}
            whileHover={{ scale: 1.08, boxShadow: '0 0 14px rgba(147,112,219,0.7)' }}
            whileTap={{ scale: 0.93 }}
            style={{
              padding: '5px 10px',
              borderRadius: 7,
              border: '1px solid #9370db',
              background: 'rgba(75,0,130,0.25)',
              color: '#b39ddb',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 11,
              letterSpacing: 0.5,
              whiteSpace: 'nowrap',
            }}
          >
            🔮 先知低语
          </motion.button>
        )}
        {canSacrifice && (
          <motion.button
            onClick={() => setShowSacrifice(true)}
            whileHover={{ scale: 1.08, boxShadow: '0 0 14px rgba(139,0,0,0.7)' }}
            whileTap={{ scale: 0.93 }}
            style={{
              padding: '5px 10px',
              borderRadius: 7,
              border: '1px solid #8b0000',
              background: 'rgba(100,0,0,0.22)',
              color: '#cd5c5c',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 11,
              letterSpacing: 0.5,
              whiteSpace: 'nowrap',
            }}
          >
            🩸 黑暗献祭
          </motion.button>
        )}
      </div>

      {/* 先知低语弹窗 */}
      <AnimatePresence>
        {showOracle && (
          <OracleModal
            deckCount={gameState.deckCount}
            onChoice={(choice) => {
              const result = useOracle(choice);
              setShowOracle(false);
              if (result.error) {
                alert(result.error);
              } else {
                const labels: Record<string, string> = {
                  peek_hand: '对手手牌',
                  peek_deck: '牌库顶',
                  peek_market: '黑市',
                };
                setOracleResult({ cards: result.cards, label: labels[choice] });
                setTimeout(() => setOracleResult(null), 5000);
              }
            }}
            onCancel={() => setShowOracle(false)}
          />
        )}
      </AnimatePresence>

      {/* 先知低语结果展示 */}
      <AnimatePresence>
        {oracleResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 8000,
              background: 'radial-gradient(ellipse at center, rgba(75,0,130,0.82), rgba(0,0,0,0.92))',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 20,
            }}
            onClick={() => setOracleResult(null)}
          >
            <div style={{
              color: '#9370db', fontFamily: '"Cinzel", serif',
              fontSize: 22, fontWeight: 900, letterSpacing: 4,
              textShadow: '0 0 20px rgba(147,112,219,0.8)',
            }}>
              🔮 先知低语
            </div>
            <div style={{ color: '#b39ddb', fontSize: 13 }}>
              {oracleResult.label}（共 {oracleResult.cards.length} 张）：
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              {oracleResult.cards.map((card, i) => (
                <motion.div
                  key={card.id}
                  initial={{ rotateY: -90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  transition={{ delay: i * 0.15, duration: 0.4, type: 'spring' }}
                >
                  <Card card={card} size="md" />
                </motion.div>
              ))}
            </div>
            <div style={{ color: '#7e57c2', fontSize: 12 }}>点击任意处关闭（5秒后自动消失）</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 黑暗献祭弹窗 */}
      <AnimatePresence>
        {showSacrifice && (
          <DarkSacrificeModal
            playerHand={player.hand}
            discardPile={gameState.discardPile}
            onConfirm={(handId, pileId) => {
              darkSacrifice(handId, pileId);
              setShowSacrifice(false);
            }}
            onCancel={() => setShowSacrifice(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
//  先知低语：三选一弹窗
// ═══════════════════════════════════════════════════════════

function OracleModal({
  deckCount,
  onChoice,
  onCancel,
}: {
  deckCount: number;
  onChoice: (c: 'peek_hand' | 'peek_deck' | 'peek_market') => void;
  onCancel: () => void;
}) {
  const handBlocked = deckCount <= 4;
  const choices: {
    id: 'peek_hand' | 'peek_deck' | 'peek_market';
    icon: string;
    label: string;
    desc: string;
    disabled?: boolean;
  }[] = [
    {
      id: 'peek_hand', icon: '🃏', label: '窥探手牌',
      desc: `随机看对手 3 张手牌${handBlocked ? '（牌库≤4，不可用）' : ''}`,
      disabled: handBlocked,
    },
    { id: 'peek_deck', icon: '📚', label: '窥视牌库', desc: '查看牌库顶 3 张牌' },
    { id: 'peek_market', icon: '🏪', label: '窥视黑市', desc: '查看当前黑市剩余牌' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 8500,
        background: 'radial-gradient(ellipse at center, rgba(75,0,130,0.85), rgba(0,0,0,0.93))',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20,
      }}
    >
      <div style={{
        color: '#9370db', fontFamily: '"Cinzel", serif',
        fontSize: 22, fontWeight: 900, letterSpacing: 4,
        textShadow: '0 0 20px rgba(147,112,219,0.8)',
      }}>
        🔮 先知低语
      </div>
      <div style={{ color: '#b39ddb', fontSize: 13 }}>花费 5 分，本局只能使用一次，选择窥视目标：</div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
        {choices.map(c => (
          <motion.button
            key={c.id}
            disabled={c.disabled}
            onClick={() => !c.disabled && onChoice(c.id)}
            whileHover={!c.disabled ? { scale: 1.06, boxShadow: '0 0 18px rgba(147,112,219,0.6)' } : undefined}
            style={{
              padding: '18px 22px', borderRadius: 12,
              border: `2px solid ${c.disabled ? '#444' : '#9370db'}`,
              background: c.disabled ? '#1a1a2e' : 'rgba(75,0,130,0.25)',
              color: c.disabled ? '#555' : '#c39bd3',
              cursor: c.disabled ? 'not-allowed' : 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              minWidth: 130,
            }}
          >
            <span style={{ fontSize: 28 }}>{c.icon}</span>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{c.label}</span>
            <span style={{ fontSize: 11, color: '#888', textAlign: 'center' }}>{c.desc}</span>
          </motion.button>
        ))}
      </div>

      <motion.button
        onClick={onCancel}
        whileHover={{ scale: 1.05 }}
        style={{
          padding: '8px 20px', borderRadius: 6,
          border: '1px solid #555', background: 'transparent',
          color: '#666', cursor: 'pointer', fontSize: 12,
        }}
      >
        取消
      </motion.button>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  黑暗献祭弹窗
// ═══════════════════════════════════════════════════════════

function DarkSacrificeModal({
  playerHand,
  discardPile,
  onConfirm,
  onCancel,
}: {
  playerHand: ICard[];
  discardPile: ICard[];
  onConfirm: (handCardId: string, pileCardId: string) => void;
  onCancel: () => void;
}) {
  const [handSelected, setHandSelected] = useState<string | null>(null);
  const [pileSelected, setPileSelected] = useState<string | null>(null);
  const step = handSelected ? 'PICK_PILE' : 'PICK_HAND';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 8000,
        background: 'radial-gradient(ellipse at center, rgba(80,0,0,0.85), rgba(0,0,0,0.93))',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 20, padding: 24,
      }}
    >
      <div style={{
        color: '#cd5c5c', fontFamily: '"Cinzel", serif',
        fontSize: 22, fontWeight: 900, letterSpacing: 4,
        textShadow: '0 0 20px rgba(205,92,92,0.8)',
      }}>
        🩸 黑暗献祭
      </div>

      {step === 'PICK_HAND' && (
        <>
          <div style={{ color: '#ffaa99', fontSize: 13 }}>第一步：选择弃置一张手牌</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '90vw' }}>
            {playerHand.map(card => (
              <motion.div
                key={card.id}
                whileHover={{ y: -6, scale: 1.05 }}
                onClick={() => setHandSelected(card.id)}
                style={{ cursor: 'pointer' }}
              >
                <Card card={card} size="md" isSelected={handSelected === card.id} />
              </motion.div>
            ))}
          </div>
        </>
      )}

      {step === 'PICK_PILE' && (
        <>
          <div style={{ color: '#ffaa99', fontSize: 13 }}>
            第二步：从弃牌堆选取一张牌
            <span style={{ color: '#cd5c5c', marginLeft: 8, fontSize: 11 }}>
              (弃置: {getCardDisplayName(playerHand.find(c => c.id === handSelected)?.rank ?? CardRank.A)})
            </span>
          </div>
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
            maxWidth: '90vw', maxHeight: '40vh', overflowY: 'auto',
            padding: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 10,
            border: '1px solid #8b000080',
          }}>
            {discardPile.map(card => (
              <motion.div
                key={card.id}
                whileHover={{ y: -6, scale: 1.05 }}
                onClick={() => setPileSelected(card.id)}
                style={{ cursor: 'pointer' }}
              >
                <Card card={card} size="sm" isSelected={pileSelected === card.id} />
              </motion.div>
            ))}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        {step === 'PICK_PILE' && handSelected && pileSelected && (
          <motion.button
            onClick={() => onConfirm(handSelected, pileSelected)}
            whileHover={{ scale: 1.05, boxShadow: '0 0 16px rgba(205,92,92,0.6)' }}
            style={{
              padding: '12px 28px', borderRadius: 8,
              border: '2px solid #cd5c5c',
              background: 'linear-gradient(180deg, #4a1010, #2a0808)',
              color: '#cd5c5c', fontWeight: 900, fontSize: 14,
              cursor: 'pointer', fontFamily: '"Cinzel", serif', letterSpacing: 2,
            }}
          >
            🩸 献祭
          </motion.button>
        )}
        {step === 'PICK_PILE' && (
          <motion.button
            onClick={() => { setHandSelected(null); setPileSelected(null); }}
            whileHover={{ scale: 1.05 }}
            style={{
              padding: '10px 20px', borderRadius: 8,
              border: '1px solid #666', background: 'transparent',
              color: '#888', cursor: 'pointer', fontSize: 12,
            }}
          >
            ← 重新选弃牌
          </motion.button>
        )}
        <motion.button
          onClick={onCancel}
          whileHover={{ scale: 1.05 }}
          style={{
            padding: '10px 20px', borderRadius: 8,
            border: '1px solid #555', background: 'transparent',
            color: '#666', cursor: 'pointer', fontSize: 12,
          }}
        >
          取消
        </motion.button>
      </div>
    </motion.div>
  );
}
