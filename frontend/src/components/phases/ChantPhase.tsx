/**
 * 阶段3：咏唱计分 — 智能高亮 + 自动凑点 + 详细组合构成与分差对比
 *
 * 点击得分区域时显示类似 "3×A + 2×B = 48分" 的构成明细，
 * 并列出同类组合的分差对比（如 3×A+2×B vs 3×B+2×F 差多少）
 */
import { useMemo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ICard, IComboResult } from '../../types/game';
import { ComboType, CardRank, HeroType, GAME_CONSTANTS } from '../../types/game';
import { useGameStore } from '../../store/gameStore';
import { detectCombos, getBlockedRank } from '../../utils/scoring';
import { getCardDisplayName, getEffectiveScore } from '../../utils/deck';
import { Card } from '../board/Card';
import { aggregateEffectsFor } from '../../core/decrees';

/** 组合签名：每次 state 更新都会产生新的 combo 引用，故用稳定签名比较 */
function comboSig(combo: IComboResult | null): string {
  if (!combo) return '';
  return combo.type + '|' + combo.cards.map(c => c.id).sort().join(',');
}

const DBL_CLICK_MS = 350;

const COMBO_NAMES: Record<ComboType, { name: string; icon: string; description: string }> = {
  [ComboType.GRAND_STRAIGHT]: { name: '大顺', icon: '🌟', description: 'A-B-C-D-E-F 各一张 (×3)' },
  [ComboType.SMALL_STRAIGHT]: { name: '小顺', icon: '✨', description: '连续4+张 (×2)' },
  [ComboType.FOUR_OF_KIND]: { name: '四条', icon: '💎', description: '4张相同 (×4)' },
  [ComboType.FULL_HOUSE]: { name: '葫芦', icon: '🏠', description: '三条+对子 (×3)' },
  [ComboType.THREE_OF_KIND]: { name: '三条', icon: '🔥', description: '3张相同 (×2)' },
  [ComboType.PAIR]: { name: '对子', icon: '♦️', description: '2张相同 (×1)' },
};

export function ChantPhase() {
  const { gameState, localPlayerId, submitCombo, advancePhase, rollFateDice, darkSacrifice, useOracle } = useGameStore();
  const [selectedSig, setSelectedSig] = useState<string>('');
  const [showDetail, setShowDetail] = useState(false);
  const [showSacrifice, setShowSacrifice] = useState(false);
  const [showOracle, setShowOracle] = useState(false);
  const [oracleResult, setOracleResult] = useState<{ cards: ICard[]; label: string } | null>(null);
  const lastClickRef = useRef<{ sig: string; time: number }>({ sig: '', time: 0 });
  const fateRolledRef = useRef<string | null>(null);

  // 命运织梦者：进入咏唱阶段自动掷骰（被动）
  useEffect(() => {
    if (!gameState) return;
    const player = gameState.players[localPlayerId];
    if (!player) return;
    if (player.hero !== HeroType.WEAVER) return;
    if (gameState.currentTurnPlayerId !== localPlayerId) return;
    // 当前回合 + 阶段组合做唯一 key，避免重复触发
    const key = `${gameState.turnNumber}`;
    if (fateRolledRef.current === key) return;
    // 仅当本回合手牌里没有虚影牌时才掷骰
    const hasPhantom = player.hand.some(c => c.isPhantom);
    if (hasPhantom) {
      fateRolledRef.current = key;
      return;
    }
    fateRolledRef.current = key;
    rollFateDice();
  }, [gameState?.turnNumber, gameState?.currentTurnPlayerId, gameState?.phase, localPlayerId, rollFateDice]);

  if (!gameState) return null;

  const player = gameState.players[localPlayerId];
  const opponentId = Object.keys(gameState.players).find(id => id !== localPlayerId)!;
  const opponent = gameState.players[opponentId];
  const isMyTurn = gameState.currentTurnPlayerId === localPlayerId;
  const blockedRank = getBlockedRank(opponent);

  const effects = useMemo(
    () => aggregateEffectsFor(gameState, localPlayerId),
    [gameState, localPlayerId],
  );
  const combos = useMemo(() => {
    return detectCombos(player.hand, gameState.isInverted, blockedRank, effects);
  }, [player.hand, gameState.isInverted, blockedRank, effects]);

  // 按类型分组用于分差对比
  const combosByType = useMemo(() => {
    const grouped = new Map<ComboType, IComboResult[]>();
    combos.forEach(combo => {
      const list = grouped.get(combo.type) || [];
      list.push(combo);
      grouped.set(combo.type, list);
    });
    return grouped;
  }, [combos]);

  // 傲慢法案 debuff: 须先在突袭中获胜
  const prideLocked = effects.requireAmbushWinForChant && !player.ambushWonThisTurn;

  const handleComboClick = (combo: IComboResult) => {
    if (!isMyTurn) return;
    if (prideLocked) return;

    const sig = comboSig(combo);
    const now = Date.now();
    // 双击 → 直接出牌
    if (lastClickRef.current.sig === sig && now - lastClickRef.current.time < DBL_CLICK_MS) {
      lastClickRef.current = { sig: '', time: 0 };
      handleSubmitCombo(combo);
      return;
    }
    lastClickRef.current = { sig, time: now };

    // 单击 → 展开/收起切换
    if (selectedSig === sig) {
      setSelectedSig('');
    } else {
      setSelectedSig(sig);
    }
  };

  const handleSubmitCombo = (combo: IComboResult) => {
    submitCombo(combo.cards.map(c => c.id), combo.score);
    setSelectedSig('');
    setShowDetail(false);
  };

  // 通过签名找回当前选中的 combo（避免引用相等问题）
  const selectedCombo = useMemo(
    () => combos.find(c => comboSig(c) === selectedSig) || null,
    [combos, selectedSig],
  );

  // 计算当前回合的衰减系数
  const decayInfo = useMemo(() => {
    const turn = gameState.turnNumber;
    if (turn <= GAME_CONSTANTS.EARLY_COMBO_TURN_THRESHOLD) {
      return { multiplier: GAME_CONSTANTS.EARLY_COMBO_PENALTY, label: '早期折扣' };
    }
    if (turn < GAME_CONSTANTS.CHANT_FULL_POWER_TURN) {
      return { multiplier: GAME_CONSTANTS.CHANT_SCORE_DECAY, label: '衰减期' };
    }
    return { multiplier: 1, label: '全力' };
  }, [gameState.turnNumber]);

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
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}>
        <div style={{
          color: '#9b59b6',
          fontFamily: '"Cinzel", serif',
          fontSize: 16,
          fontWeight: 700,
        }}>
          ✨ 咏唱计分
        </div>
        <div style={{
          color: '#9b59b680',
          fontSize: 11,
          letterSpacing: 1,
        }}>
          得分将注入秘力熔炉，由突袭结果决定最终分配
        </div>
      </div>

      {/* 破法者诅咒提示 */}
      {player.cursedNextChant && (
        <motion.div
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1, repeat: Infinity }}
          style={{
            padding: '6px 14px', borderRadius: 6,
            border: '1px solid #e74c3c',
            background: 'rgba(231,76,60,0.1)',
            color: '#e74c3c', fontSize: 12, fontWeight: 700,
          }}
        >
          💀 破法者标记：本次咏唱将扣除 15 分
        </motion.div>
      )}

      {/* 先知低语按钮（本局一次，花费 -5 分） */}
      {isMyTurn && !player.hasUsedOracle && (
        <motion.button
          onClick={() => setShowOracle(true)}
          whileHover={{ scale: 1.05, boxShadow: '0 0 14px rgba(147,112,219,0.6)' }}
          style={{
            padding: '8px 18px', borderRadius: 8,
            border: '1px solid #9370db',
            background: 'rgba(75,0,130,0.2)',
            color: '#9370db', fontWeight: 700,
            cursor: 'pointer', fontSize: 12,
            fontFamily: '"Cinzel", serif', letterSpacing: 1,
          }}
        >
          🔮 先知低语（-5分，本局一次）
        </motion.button>
      )}

      {/* 先知低语：三选一弹窗 */}
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
                const labels = { peek_hand: '对手手牌', peek_deck: '牌库顶', peek_market: '黑市' };
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
            <div style={{ color: '#7e57c2', fontSize: 12 }}>点击任意处关闭 (5秒后自动消失)</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 黑暗献祭按钮 */}
      {isMyTurn && !player.hasUsedDarkSacrificeThisTurn && gameState.discardPile.length > 0 && (
        <motion.button
          onClick={() => setShowSacrifice(true)}
          whileHover={{ scale: 1.05, boxShadow: '0 0 14px rgba(139,0,0,0.6)' }}
          style={{
            padding: '8px 18px', borderRadius: 8,
            border: '1px solid #8b0000',
            background: 'rgba(100,0,0,0.2)',
            color: '#cd5c5c', fontWeight: 700,
            cursor: 'pointer', fontSize: 12,
            fontFamily: '"Cinzel", serif', letterSpacing: 1,
          }}
        >
          🩸 黑暗献祭（弃一换一）
        </motion.button>
      )}

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

      {/* 织梦者：被动技能提示 */}
      {player.hero === HeroType.WEAVER && isMyTurn && player.hand.some(c => c.isPhantom) && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: '6px 14px', borderRadius: 6,
            border: '1px solid #9b59b6',
            background: 'rgba(155,89,182,0.12)',
            color: '#c39bd3', fontSize: 12, fontWeight: 700,
            fontFamily: '"Cinzel", serif', letterSpacing: 1,
          }}
        >
          🔮 命运骰子（被动）：本回合获得一张虚影牌（咏唱后消失）
        </motion.div>
      )}

      {/* 傲慢法案锁定提示 */}
      {prideLocked && (
        <motion.div
          style={{
            color: '#e74c3c',
            fontSize: 12, fontWeight: 700,
            padding: '6px 14px', borderRadius: 4,
            border: '1px solid #e74c3c',
            background: 'rgba(231,76,60,0.15)',
            fontFamily: '"Cinzel", serif',
            letterSpacing: 2,
          }}
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          👑 傲慢法案：须本回合先在突袭中获胜，否则禁止咏唱
        </motion.div>
      )}

      {/* 衰减提示 */}
      {decayInfo.multiplier < 1 && (
        <motion.div
          style={{
            color: '#ff8c00',
            fontSize: 11,
            padding: '4px 12px',
            borderRadius: 4,
            border: '1px solid #ff8c00',
            background: 'rgba(255,140,0,0.1)',
          }}
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          ⚡ {decayInfo.label} — 得分×{decayInfo.multiplier} (第{GAME_CONSTANTS.CHANT_FULL_POWER_TURN}回合起恢复全力)
        </motion.div>
      )}

      {/* 封锁提示 */}
      {blockedRank !== null && (
        <div style={{
          color: '#2ecc71', fontSize: 11, padding: '3px 10px',
          borderRadius: 4, border: '1px solid #2ecc71',
          background: 'rgba(46,204,113,0.1)',
        }}>
          🔒 对手封锁了 {getCardDisplayName(blockedRank)} 级牌
        </div>
      )}

      {/* 可用组合列表 */}
      {combos.length > 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          width: '100%', maxWidth: 500,
        }}>
          {combos.map((combo, i) => {
            const decayedScore = Math.floor(combo.score * decayInfo.multiplier);
            const penalty = combo.blockedPenalty || 0;
            const netScore = decayedScore - penalty;
            const info = COMBO_NAMES[combo.type];
            const sameTypeCombos = combosByType.get(combo.type) || [];

            return (
              <motion.div
                key={i}
                style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: comboSig(combo) === selectedSig ? '2px solid #ffd700' : '1px solid #3a1f5e',
                  background: 'rgba(26, 11, 46, 0.9)',
                  cursor: isMyTurn ? 'pointer' : 'default',
                  opacity: netScore <= 0 ? 0.7 : 1,
                }}
                onClick={() => handleComboClick(combo)}
                whileHover={isMyTurn ? { scale: 1.01, borderColor: '#b8860b' } : {}}
              >
                {/* 组合名称行 */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{info.icon}</span>
                    <span style={{ color: '#ccc', fontSize: 14, fontWeight: 700 }}>
                      {info.name}
                    </span>
                    <span style={{ color: '#666', fontSize: 11 }}>
                      {info.description}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {penalty > 0 && (
                      <span style={{
                        color: '#e74c3c', fontWeight: 700, fontSize: 12,
                        padding: '1px 6px', borderRadius: 4,
                        background: 'rgba(231,76,60,0.15)',
                        border: '1px solid #e74c3c80',
                      }}>
                        −{penalty} 封锁罚
                      </span>
                    )}
                    <motion.span
                      style={{
                        color: netScore > 0 ? '#ffd700' : '#e74c3c',
                        fontWeight: 900, fontSize: 18,
                        fontFamily: 'monospace',
                      }}
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      {netScore >= 0 ? '+' : ''}{netScore}
                    </motion.span>
                  </div>
                </div>

                {/* 详细构成: 类似 "3×A + 2×B" */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  flexWrap: 'wrap',
                }}>
                  <ComboComposition combo={combo} isInverted={gameState.isInverted} />
                </div>

                {/* 同类组合分差对比 (有多个同类时显示) */}
                {sameTypeCombos.length > 1 && comboSig(combo) === selectedSig && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    style={{
                      marginTop: 8, paddingTop: 8,
                      borderTop: '1px solid #3a1f5e',
                    }}
                  >
                    <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>
                      📊 同类组合分差对比:
                    </div>
                    {sameTypeCombos.map((c, j) => {
                      const cScore = Math.floor(c.score * decayInfo.multiplier);
                      const diff = cScore - netScore;
                      return (
                        <div key={j} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          fontSize: 11, color: diff > 0 ? '#2ecc71' : diff < 0 ? '#e74c3c' : '#888',
                          padding: '2px 0',
                        }}>
                          <ComboComposition combo={c} isInverted={gameState.isInverted} compact />
                          <span style={{ fontWeight: 700 }}>= {cScore}</span>
                          {diff !== 0 && (
                            <span style={{ fontSize: 10 }}>
                              ({diff > 0 ? '+' : ''}{diff})
                            </span>
                          )}
                          {c === combo && <span style={{ color: '#ffd700' }}>◄ 当前</span>}
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div style={{ color: '#666', fontSize: 14 }}>
          当前手牌无可用组合
        </div>
      )}

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        {selectedCombo && isMyTurn && (
          <>
            <motion.button
              onClick={() => handleSubmitCombo(selectedCombo)}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.08, boxShadow: '0 0 16px rgba(255,215,0,0.5)' }}
              whileTap={{ scale: 0.95 }}
              style={{
                padding: '10px 24px', borderRadius: 8,
                border: '2px solid #ffd700',
                background: 'linear-gradient(180deg, #4a3a1e, #2d1b0e)',
                color: '#ffd700', fontWeight: 900,
                cursor: 'pointer', fontSize: 14,
                fontFamily: '"Cinzel", serif', letterSpacing: 2,
              }}
            >
              ✓ 注入熔炉 +{Math.floor(selectedCombo.score * decayInfo.multiplier) - (selectedCombo.blockedPenalty || 0)}
            </motion.button>
            <motion.button
              onClick={() => { setShowDetail(true); }}
              style={{
                padding: '6px 14px', borderRadius: 6,
                border: '1px solid #9b59b6', background: 'transparent',
                color: '#9b59b6', cursor: 'pointer', fontSize: 11,
              }}
              whileHover={{ scale: 1.05 }}
            >
              📊 查看明细
            </motion.button>
          </>
        )}

        {isMyTurn && (
          <motion.button
            onClick={() => advancePhase()}
            style={{
              padding: '10px 20px', borderRadius: 8,
              border: `1px solid ${player.hasChantedThisTurn ? '#ffd700' : '#666'}`,
              background: player.hasChantedThisTurn
                ? 'linear-gradient(180deg, rgba(74,58,10,0.6), rgba(42,31,5,0.8))'
                : 'transparent',
              color: player.hasChantedThisTurn ? '#ffd700' : '#888',
              cursor: 'pointer', fontSize: 13,
              fontWeight: player.hasChantedThisTurn ? 700 : 400,
              marginLeft: 'auto',
            }}
            whileHover={{ scale: 1.05, boxShadow: player.hasChantedThisTurn ? '0 0 12px rgba(255,215,0,0.4)' : 'none' }}
          >
            {player.hasChantedThisTurn ? '结束咏唱 → 突袭阶段' : '跳过咏唱 → 突袭阶段'}
          </motion.button>
        )}
      </div>

      {/* 详细面板弹窗 */}
      <AnimatePresence>
        {showDetail && selectedCombo && (
          <ComboDetailPanel
            combo={selectedCombo}
            allCombos={combos}
            isInverted={gameState.isInverted}
            decayMultiplier={decayInfo.multiplier}
            onClose={() => setShowDetail(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  组合构成展示子组件: "3×A + 2×B"
// ═══════════════════════════════════════════════════════════

function ComboComposition({ combo, isInverted, compact = false }: {
  combo: IComboResult;
  isInverted: boolean;
  compact?: boolean;
}) {
  // 统计每种 rank 的数量
  const rankCounts = new Map<CardRank, number>();
  combo.cards.forEach(c => {
    rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
  });

  const parts: { count: number; rank: CardRank; score: number }[] = [];
  rankCounts.forEach((count, rank) => {
    parts.push({ count, rank, score: getEffectiveScore(rank, isInverted) * count });
  });

  // 按有效分降序
  parts.sort((a, b) => b.score - a.score);

  const fontSize = compact ? 11 : 13;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 3 : 6, flexWrap: 'wrap' }}>
      {parts.map((part, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {i > 0 && <span style={{ color: '#555', fontSize }}>+</span>}
          <span style={{
            color: '#b8860b', fontWeight: 700, fontSize,
            fontFamily: 'monospace',
          }}>
            {part.count}×{getCardDisplayName(part.rank)}
          </span>
          <span style={{ color: '#555', fontSize: fontSize - 2 }}>
            ({part.score})
          </span>
        </span>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  详细得分面板 — 分差对比
// ═══════════════════════════════════════════════════════════

function ComboDetailPanel({ combo, allCombos, isInverted, decayMultiplier, onClose }: {
  combo: IComboResult;
  allCombos: IComboResult[];
  isInverted: boolean;
  decayMultiplier: number;
  onClose: () => void;
}) {
  const actualScore = Math.floor(combo.score * decayMultiplier);
  const info = COMBO_NAMES[combo.type];

  // 找所有同类型组合进行分差对比
  const sameType = allCombos.filter(c => c.type === combo.type);
  // 也对比不同类型的最高/最低
  const otherBest = allCombos
    .filter(c => c.type !== combo.type)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.7)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.8 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #1a0b2e, #0d0018)',
          border: '2px solid #b8860b',
          borderRadius: 16, padding: 28,
          maxWidth: 450, width: '90%',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <h3 style={{
          color: '#ffd700', fontFamily: '"Cinzel", serif',
          margin: 0, textAlign: 'center',
        }}>
          {info.icon} {info.name} — 得分明细
        </h3>

        {/* 当前组合构成 */}
        <div style={{
          padding: 12, borderRadius: 8,
          background: 'rgba(255,215,0,0.05)',
          border: '1px solid #b8860b40',
        }}>
          <div style={{ marginBottom: 8, color: '#aaa', fontSize: 11 }}>当前选择:</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ComboComposition combo={combo} isInverted={isInverted} />
            <span style={{ color: '#ffd700', fontWeight: 900, fontSize: 20, marginLeft: 'auto' }}>
              = {actualScore}分
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {combo.cards.map(card => (
              <Card key={card.id} card={card} size="sm" />
            ))}
          </div>
          {decayMultiplier < 1 && (
            <div style={{ color: '#ff8c00', fontSize: 10, marginTop: 6 }}>
              ⚡ 含衰减: 原始 {combo.score} × {decayMultiplier} = {actualScore}
            </div>
          )}
        </div>

        {/* 分差对比表 */}
        {(sameType.length > 1 || otherBest.length > 0) && (
          <div>
            <div style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>
              📊 分差对比:
            </div>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 6,
              maxHeight: 180, overflowY: 'auto',
            }}>
              {[...sameType, ...otherBest]
                .filter(c => c !== combo)
                .sort((a, b) => b.score - a.score)
                .map((c, i) => {
                  const cScore = Math.floor(c.score * decayMultiplier);
                  const diff = cScore - actualScore;
                  const cInfo = COMBO_NAMES[c.type];
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px', borderRadius: 6,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid #2a1a3e',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12 }}>{cInfo.icon}</span>
                        <ComboComposition combo={c} isInverted={isInverted} compact />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#aaa', fontSize: 12, fontWeight: 700 }}>
                          {cScore}分
                        </span>
                        <span style={{
                          color: diff > 0 ? '#2ecc71' : diff < 0 ? '#e74c3c' : '#666',
                          fontSize: 11, fontWeight: 700,
                          minWidth: 40, textAlign: 'right',
                        }}>
                          {diff > 0 ? `+${diff}` : diff === 0 ? '=' : `${diff}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        <motion.button
          onClick={onClose}
          style={{
            padding: '8px 20px', borderRadius: 6,
            border: '1px solid #666', background: 'transparent',
            color: '#888', cursor: 'pointer', fontSize: 12,
            alignSelf: 'center',
          }}
          whileHover={{ scale: 1.05 }}
        >
          关闭
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  先知低语：三选一选择弹窗
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
  const choices: { id: 'peek_hand' | 'peek_deck' | 'peek_market'; icon: string; label: string; desc: string; disabled?: boolean }[] = [
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
//  黑暗献祭弹窗：先选弃置手牌，再选从弃牌堆取回的牌
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
