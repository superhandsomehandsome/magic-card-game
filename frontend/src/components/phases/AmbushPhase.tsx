/**
 * 阶段2：突袭与虚实之言
 *
 * 攻击方流程（三国杀式直接点牌）：
 *   - 第 1 次突袭：直接点底部手牌 → 弹宣告 modal
 *   - 第 2 次突袭：第一次点牌 = 弃牌代价（橙色高亮）；
 *                  再点另一张牌 = 攻击牌 → 弹宣告 modal；
 *                  点同一张取消弃牌选择
 * 防守方流程：
 *   - 选择 [拆穿 / 怯战 / 迎战(选牌)]
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ICard, AmbushDeclaration, IAmbushState } from '../../types/game';
import { CardRank, GamePhase, GAME_CONSTANTS } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { Card } from '../board/Card';
import { getCardDisplayName, compareCards } from '../../utils/deck';

interface AmbushResult {
  choice: string;
  attackCard: ICard;
  defenderCard: ICard | null;
  declaration: AmbushDeclaration | null;
}

export function AmbushPhase() {
  const {
    gameState, localPlayerId, declareAmbush, respondAmbush, advancePhase,
    engine, setHandClickHandler,
  } = useGameStore();

  const [selectedAttackId, setSelectedAttackId] = useState<string | null>(null);
  const [selectedDiscardId, setSelectedDiscardId] = useState<string | null>(null);
  const [showDeclare, setShowDeclare] = useState(false);
  const [lastResult, setLastResult] = useState<AmbushResult | null>(null);
  // 二次突袭引导：'NEED_CHOICE' 弹出"是否二连"; 'PICK_DISCARD' 等弃牌; 'PICK_ATTACK' 等攻击牌; 'DECLINED' 已拒绝
  const [secondFlow, setSecondFlow] = useState<'NEED_CHOICE' | 'PICK_DISCARD' | 'PICK_ATTACK' | 'DECLINED'>('NEED_CHOICE');
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = gameState?.players[localPlayerId];
  const isMyTurn = gameState?.currentTurnPlayerId === localPlayerId;
  const isDefending = gameState?.phase === GamePhase.AMBUSH_DEFEND &&
    gameState.ambushState?.defenderId === localPlayerId;
  const ambushCount = player?.ambushesThisTurn ?? 0;
  const isSecondAmbush = ambushCount === 1;
  const maxAmbushReached = ambushCount >= GAME_CONSTANTS.MAX_AMBUSH_PER_TURN;

  // 重置：每次突袭轮次变化时（如新回合、刚完成第一次突袭）回到选择阶段
  useEffect(() => {
    if (ambushCount === 0) setSecondFlow('NEED_CHOICE');
    else if (ambushCount === 1) {
      // 完成第一次突袭后，回到二连选择面板
      setSecondFlow('NEED_CHOICE');
      setSelectedDiscardId(null);
    }
  }, [ambushCount]);

  // 监听突袭结算
  useEffect(() => {
    if (!engine) return;
    const handleResolved = (data: AmbushResult) => {
      setLastResult(data);
      setSelectedAttackId(null);
      setSelectedDiscardId(null);
      setShowDeclare(false);
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      resultTimerRef.current = setTimeout(() => setLastResult(null), 3500);
    };
    engine.on('AMBUSH_RESOLVED', handleResolved);
    return () => {
      engine.off('AMBUSH_RESOLVED', handleResolved);
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    };
  }, [engine]);

  // 注册底部手牌点击（引导式分步操作）
  useEffect(() => {
    // 防守方视角由 DefenderView 自行注册，此处不干扰
    if (isDefending) return;
    if (!isMyTurn || gameState?.phase !== GamePhase.AMBUSH_DECLARE || maxAmbushReached) {
      setHandClickHandler(null);
      return;
    }
    // 二次突袭流程进入"NEED_CHOICE"阶段时禁止点牌（等用户先点"发起二连"按钮）
    if (isSecondAmbush && secondFlow === 'NEED_CHOICE') {
      setHandClickHandler(null);
      return;
    }
    if (isSecondAmbush && secondFlow === 'DECLINED') {
      setHandClickHandler(null);
      return;
    }
    setHandClickHandler((card: ICard) => {
      // FLASH 牌不能用作攻击牌
      if (card.rank === CardRank.FLASH) return;

      if (isSecondAmbush) {
        if (secondFlow === 'PICK_DISCARD') {
          if (card.id === selectedDiscardId) {
            // 重复点击 = 取消弃牌
            setSelectedDiscardId(null);
            return;
          }
          setSelectedDiscardId(card.id);
          setSecondFlow('PICK_ATTACK');
          return;
        }
        if (secondFlow === 'PICK_ATTACK') {
          // 点已弃的牌：撤回弃牌选择
          if (card.id === selectedDiscardId) {
            setSelectedDiscardId(null);
            setSecondFlow('PICK_DISCARD');
            return;
          }
          setSelectedAttackId(card.id);
          setShowDeclare(true);
          return;
        }
        return;
      }

      // 第一次突袭：直接选攻击牌进入宣告
      setSelectedAttackId(card.id);
      setShowDeclare(true);
    });
    return () => setHandClickHandler(null);
  }, [isMyTurn, isDefending, gameState?.phase, isSecondAmbush, selectedDiscardId, maxAmbushReached, setHandClickHandler, secondFlow]);

  if (!gameState || !player) return null;

  // ─────────────────────────── 防守方视角 ───────────────────────────
  if (isDefending && gameState.ambushState) {
    return <DefenderView
      ambushState={gameState.ambushState}
      onChoice={(choice, cardId) => respondAmbush(choice, cardId)}
    />;
  }

  // ─────────────────────────── 攻击方视角 ───────────────────────────
  const handleDeclare = (decl: AmbushDeclaration | null) => {
    if (!selectedAttackId) return;
    const ok = declareAmbush(selectedAttackId, decl, selectedDiscardId || undefined);
    if (!ok) {
      setSelectedAttackId(null);
      setSelectedDiscardId(null);
      setShowDeclare(false);
    }
  };

  const cancelDeclare = () => {
    setSelectedAttackId(null);
    setShowDeclare(false);
  };

  // 非己方回合 / 非宣告阶段 → 等待或显示结果
  if (!isMyTurn || gameState.phase !== GamePhase.AMBUSH_DECLARE) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 16 }}
      >
        <AnimatePresence>
          {lastResult && <AmbushResultPanel result={lastResult} isInverted={gameState.isInverted} />}
        </AnimatePresence>
        {!isMyTurn && (
          <div style={{ color: '#666', fontSize: 12, fontStyle: 'italic' }}>
            🤖 对手在突袭阶段…
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: 12,
      }}
    >
      <AnimatePresence>
        {lastResult && <AmbushResultPanel result={lastResult} isInverted={gameState.isInverted} />}
      </AnimatePresence>

      {/* 状态条 */}
      <div style={{
        color: '#ff4500', fontFamily: '"Cinzel", serif',
        fontSize: 14, fontWeight: 700, letterSpacing: 2,
      }}>
        ⚡ 突袭 ({ambushCount}/{GAME_CONSTANTS.MAX_AMBUSH_PER_TURN})
      </div>

      {/* 大横幅指引：根据当前突袭状态动态显示 */}
      {!maxAmbushReached && !isSecondAmbush && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            padding: '10px 20px', borderRadius: 10,
            border: '2px solid #ff4500',
            background: 'rgba(255,69,0,0.12)',
            color: '#ff8c00', fontSize: 14, fontWeight: 700,
            fontFamily: '"Cinzel", serif', letterSpacing: 2,
            textAlign: 'center',
          }}
        >
          👆 点击下方手牌选择攻击牌
        </motion.div>
      )}

      {/* 二次突袭引导：分 3 步 */}
      {isSecondAmbush && secondFlow === 'PICK_DISCARD' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            padding: '12px 22px', borderRadius: 10,
            border: '2px solid #ff8c00',
            background: 'rgba(255,140,0,0.15)',
            color: '#ffb347', fontSize: 14, fontWeight: 900,
            fontFamily: '"Cinzel", serif', letterSpacing: 2,
            textAlign: 'center',
            boxShadow: '0 0 16px rgba(255,140,0,0.4)',
          }}
        >
          <motion.div
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            ⚡ 第二次突袭 · 第 1 步
          </motion.div>
          <div style={{ marginTop: 6, fontSize: 13, color: '#ff8c00', letterSpacing: 1 }}>
            👆 请点击一张手牌作为<strong>弃牌代价</strong>
          </div>
        </motion.div>
      )}

      {isSecondAmbush && secondFlow === 'PICK_ATTACK' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            padding: '12px 22px', borderRadius: 10,
            border: '2px solid #ff4500',
            background: 'rgba(255,69,0,0.18)',
            color: '#ff6347', fontSize: 14, fontWeight: 900,
            fontFamily: '"Cinzel", serif', letterSpacing: 2,
            textAlign: 'center',
            boxShadow: '0 0 16px rgba(255,69,0,0.5)',
          }}
        >
          <motion.div
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            ⚡ 第二次突袭 · 第 2 步
          </motion.div>
          <div style={{ marginTop: 6, fontSize: 13, color: '#ff4500', letterSpacing: 1 }}>
            👆 再选一张手牌作为<strong>攻击牌</strong>
          </div>
        </motion.div>
      )}

      {maxAmbushReached && (
        <div style={{ color: '#666', fontSize: 12 }}>
          已达最大突袭次数
        </div>
      )}

      {/* 二次突袭：是否发起选择弹窗（在第一次突袭完成后弹出） */}
      <AnimatePresence>
        {isSecondAmbush && secondFlow === 'NEED_CHOICE' && !maxAmbushReached && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 5000,
              background: 'radial-gradient(ellipse at center, rgba(40,8,8,0.85), rgba(0,0,0,0.92))',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              style={{
                background: 'linear-gradient(180deg, #1a0b2e, #0d0018)',
                border: '2px solid #ff4500',
                borderRadius: 16,
                padding: 28,
                display: 'flex', flexDirection: 'column', gap: 16,
                alignItems: 'center', maxWidth: 380,
                boxShadow: '0 0 40px rgba(255,69,0,0.5)',
              }}
            >
              <h3 style={{
                color: '#ff4500', fontFamily: '"Cinzel", serif',
                margin: 0, fontSize: 20, letterSpacing: 4,
                textShadow: '0 0 18px rgba(255,69,0,0.6)',
              }}>
                ⚡ 是否发起第二次突袭？
              </h3>
              <div style={{ color: '#ccc', fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>
                第二次突袭需<strong style={{ color: '#ff8c00' }}>额外弃 1 张手牌</strong>作为代价，<br />
                之后再选一张牌发起攻击。
              </div>
              <div style={{ display: 'flex', gap: 14 }}>
                <motion.button
                  onClick={() => setSecondFlow('PICK_DISCARD')}
                  whileHover={{ scale: 1.06, boxShadow: '0 0 20px rgba(255,69,0,0.7)' }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    padding: '12px 28px', borderRadius: 10,
                    border: '2px solid #ff4500',
                    background: 'linear-gradient(135deg, #ff4500, #8b0000)',
                    color: '#fff', fontWeight: 900, fontSize: 14,
                    cursor: 'pointer', fontFamily: '"Cinzel", serif', letterSpacing: 2,
                  }}
                >
                  ⚡ 发起二连
                </motion.button>
                <motion.button
                  onClick={() => {
                    setSecondFlow('DECLINED');
                    advancePhase();
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    padding: '12px 24px', borderRadius: 10,
                    border: '1px solid #888',
                    background: 'transparent',
                    color: '#aaa', fontSize: 13, cursor: 'pointer',
                  }}
                >
                  结束 → 咏唱
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 已选弃牌代价预览（PICK_ATTACK 阶段才显示） */}
      <AnimatePresence>
        {isSecondAmbush && secondFlow === 'PICK_ATTACK' && selectedDiscardId && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '6px 12px', borderRadius: 8,
              background: 'rgba(255,140,0,0.1)',
              border: '1px solid #ff8c0080',
            }}
          >
            <span style={{ color: '#ff8c00', fontSize: 11 }}>弃牌代价 →</span>
            {(() => {
              const c = player.hand.find(h => h.id === selectedDiscardId);
              return c ? <Card card={c} size="sm" /> : null;
            })()}
            <button
              onClick={() => {
                setSelectedDiscardId(null);
                setSecondFlow('PICK_DISCARD');
              }}
              style={{
                padding: '4px 10px', fontSize: 11, borderRadius: 4,
                border: '1px solid #888', background: 'transparent',
                color: '#aaa', cursor: 'pointer',
              }}
            >
              重选
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 操作按钮（仅第一次突袭前 / 二连选择已拒绝时显示） */}
      <div style={{ display: 'flex', gap: 8 }}>
        {ambushCount === 0 && (
          <motion.button
            onClick={() => advancePhase()}
            whileHover={{ scale: 1.05 }}
            style={{
              padding: '8px 18px', borderRadius: 6,
              border: '1px solid #666', background: 'transparent',
              color: '#999', cursor: 'pointer', fontSize: 12,
            }}
          >
            跳过突袭 → 咏唱阶段
          </motion.button>
        )}
      </div>

      {/* 宣告 modal */}
      <AnimatePresence>
        {showDeclare && selectedAttackId && (
          <DeclareModal
            attackCard={player.hand.find(c => c.id === selectedAttackId)!}
            onDeclare={handleDeclare}
            onCancel={cancelDeclare}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  宣告弹窗
// ═══════════════════════════════════════════════════════════

function DeclareModal({
  attackCard, onDeclare, onCancel,
}: {
  attackCard: ICard;
  onDeclare: (d: AmbushDeclaration | null) => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div style={{
        background: 'linear-gradient(180deg, #1a0b2e, #0d0018)',
        border: '2px solid #ff4500',
        borderRadius: 16, padding: 24,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        maxWidth: 380,
      }}>
        <h3 style={{
          color: '#ff4500', fontFamily: '"Cinzel", serif',
          margin: 0, letterSpacing: 3,
        }}>
          ⚡ 虚实之言 ⚡
        </h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#888', fontSize: 11 }}>暗扣：</span>
          <Card card={attackCard} size="sm" />
        </div>

        <p style={{ color: '#aaa', fontSize: 12, margin: 0, textAlign: 'center' }}>
          宣告这张牌的等级（可说谎），或保持沉默
        </p>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[CardRank.A, CardRank.B, CardRank.C, CardRank.D, CardRank.E, CardRank.F].map(rank => (
            <motion.button
              key={rank}
              onClick={() => onDeclare(rank)}
              style={{
                width: 44, height: 44, borderRadius: 6,
                border: '1px solid #b8860b',
                background: '#1a0b2e', color: '#ffd700',
                fontWeight: 900, fontSize: 16,
                cursor: 'pointer',
                fontFamily: '"Cinzel", serif',
              }}
              whileHover={{ scale: 1.1, boxShadow: '0 0 12px rgba(255,215,0,0.5)' }}
              whileTap={{ scale: 0.9 }}
            >
              {getCardDisplayName(rank)}
            </motion.button>
          ))}
        </div>

        <motion.button
          onClick={() => onDeclare(null)}
          whileHover={{ scale: 1.05 }}
          style={{
            padding: '8px 24px', borderRadius: 6,
            border: '1px solid #666', background: 'transparent',
            color: '#aaa', fontSize: 12, cursor: 'pointer',
          }}
        >
          🤫 保持沉默
        </motion.button>

        <button
          onClick={onCancel}
          style={{
            padding: '4px 12px', fontSize: 11,
            border: 'none', background: 'transparent',
            color: '#666', cursor: 'pointer',
          }}
        >
          取消
        </button>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  防守方视角
// ═══════════════════════════════════════════════════════════

interface DefenderViewProps {
  ambushState: IAmbushState;
  onChoice: (choice: 'FOLD' | 'CALL_BLUFF' | 'DEFEND', cardId?: string) => void;
}

function DefenderView({ ambushState, onChoice }: DefenderViewProps) {
  const { gameState, localPlayerId, setHandClickHandler } = useGameStore();
  const [selectedDefendCard, setSelectedDefendCard] = useState<string | null>(null);
  const hasDeclaration = ambushState.declaration !== null && ambushState.declaration !== 'SILENT';

  const player = gameState?.players[localPlayerId];

  // 注册手牌点击：选迎战牌
  useEffect(() => {
    setHandClickHandler((card: ICard) => {
      setSelectedDefendCard(card.id);
    });
    return () => setHandClickHandler(null);
  }, [setHandClickHandler]);

  if (!player) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 16, padding: 16,
      }}
    >
      <motion.div
        style={{
          color: '#ff0000', fontFamily: '"Cinzel", serif',
          fontSize: 18, fontWeight: 900,
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
        <div style={{ color: '#ffd700', fontSize: 13 }}>
          对手宣告：这是一张 <strong>{getCardDisplayName(ambushState.declaration as CardRank)}</strong>
        </div>
      )}

      {/* 选中的迎战牌预览 */}
      {selectedDefendCard && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', borderRadius: 6,
          background: 'rgba(46,204,113,0.1)', border: '1px solid #2ecc7180',
        }}>
          <span style={{ color: '#2ecc71', fontSize: 11 }}>已选迎战牌 →</span>
          {(() => {
            const c = player.hand.find(h => h.id === selectedDefendCard);
            return c ? <Card card={c} size="sm" /> : null;
          })()}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <motion.button
          onClick={() => onChoice('FOLD')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{
            padding: '12px 20px', borderRadius: 8,
            border: '2px solid #666',
            background: 'linear-gradient(180deg, #2a2a2a, #1a1a1a)',
            color: '#aaa', fontWeight: 700, fontSize: 13,
            cursor: 'pointer',
          }}
        >
          😰 怯战
        </motion.button>

        {hasDeclaration && (
          <motion.button
            onClick={() => onChoice('CALL_BLUFF')}
            whileHover={{ scale: 1.05, boxShadow: '0 0 15px rgba(255,99,71,0.5)' }}
            whileTap={{ scale: 0.95 }}
            style={{
              padding: '12px 20px', borderRadius: 8,
              border: '2px solid #ff6347',
              background: 'linear-gradient(180deg, #4a1a1a, #2a0d0d)',
              color: '#ff6347', fontWeight: 700, fontSize: 13,
              cursor: 'pointer',
            }}
          >
            🔥 拆穿
          </motion.button>
        )}

        <motion.button
          onClick={() => {
            if (selectedDefendCard) onChoice('DEFEND', selectedDefendCard);
          }}
          disabled={!selectedDefendCard}
          whileHover={selectedDefendCard ? { scale: 1.05 } : undefined}
          style={{
            padding: '12px 20px', borderRadius: 8,
            border: '2px solid #2ecc71',
            background: selectedDefendCard
              ? 'linear-gradient(180deg, #1a4a2e, #0d2818)'
              : '#222',
            color: '#2ecc71', fontWeight: 700, fontSize: 13,
            cursor: selectedDefendCard ? 'pointer' : 'not-allowed',
            opacity: selectedDefendCard ? 1 : 0.5,
          }}
        >
          ⚔️ 迎战
        </motion.button>
      </div>

      <div style={{ color: '#888', fontSize: 11 }}>
        点击下方手牌选择迎战牌
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
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        padding: '12px 18px', borderRadius: 10,
        background: 'rgba(13,0,24,0.95)',
        border: `2px solid ${resultColor}40`,
        boxShadow: `0 0 18px ${resultColor}30`,
      }}
    >
      <div style={{
        color: '#888', fontSize: 10, letterSpacing: 2,
        fontFamily: '"Cinzel", serif',
      }}>
        上次突袭结算
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <Card card={atkCard} size="sm" />
          <span style={{ color: '#b8860b', fontSize: 10 }}>攻击方</span>
        </div>

        <span style={{ color: resultColor, fontSize: 22, fontWeight: 900 }}>⚔</span>

        {defCard ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
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
          color: resultColor, fontSize: 13, fontWeight: 700,
          textShadow: `0 0 10px ${resultColor}60`, textAlign: 'center',
        }}
        animate={{ opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        {resultText}
      </motion.div>
    </motion.div>
  );
}
