/**
 * 深渊法案争夺 — 4 步流程模态
 *
 * Step 1: 抉择期 (OPT_IN) — 双盲选择 [争夺 / 放弃]
 * Step 2: 意向揭晓 (INTENT_RESOLVE) — 自动过渡
 * Step 3: 暗标死斗 (BIDDING) — 1-3 张牌投入祭坛
 * Step 4: 战力裁定 (BID_RESOLVE) — 自动揭晓
 */
import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import type { ICard, IDecree } from '../../types/game';
import { CardRank, GAME_CONSTANTS } from '../../types/game';
import { Card } from '../board/Card';
import { calcBidPower } from '../../core/decrees';
import type { IDecreeContestState } from '../../types/game';

export function DecreeContestModal() {
  const gameState = useGameStore(s => s.gameState);
  const localPlayerId = useGameStore(s => s.localPlayerId);
  const submitOptIn = useGameStore(s => s.submitDecreeOptIn);
  const submitBid = useGameStore(s => s.submitDecreeBid);

  if (!gameState || !gameState.decreeContest) return null;
  const ctx = gameState.decreeContest;
  const decree = ctx.decree;
  const me = gameState.players[localPlayerId];
  const oppId = Object.keys(gameState.players).find(id => id !== localPlayerId)!;
  const opp = gameState.players[oppId];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 8000,
        background: 'radial-gradient(ellipse at center, rgba(35,8,8,0.92), rgba(0,0,0,0.97))',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        // 从顶部开始，确保进度条和法案标题不被裁掉
        justifyContent: 'flex-start',
        padding: 'clamp(8px, 2vw, 24px)',
        // 给手机底部 UI（home indicator / address bar）留安全距离
        paddingTop: 'max(clamp(8px, 2vw, 24px), env(safe-area-inset-top))',
        paddingBottom: 'max(clamp(16px, 3vw, 32px), env(safe-area-inset-bottom))',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* 倒计时进度条 (顶端) */}
      <DeadlineBar
        deadline={ctx.deadline}
        totalMs={
          ctx.step === 'OPT_IN'
            ? GAME_CONSTANTS.DECREE_OPT_IN_TIMER_MS
            : GAME_CONSTANTS.DECREE_BID_TIMER_MS
        }
        key={ctx.step}
      />

      {/* 法案信息卡 */}
      <DecreeCard decree={decree} round={ctx.triggeringRound} />

      {/* 步骤主体 */}
      <div style={{ marginTop: 'clamp(8px, 1.5vw, 18px)', width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'clamp(8px, 1.5vw, 14px)' }}>
        {ctx.step === 'OPT_IN' && (
          <OptInStep
            myChoice={ctx.optIn[localPlayerId]}
            oppChose={ctx.optIn[oppId] !== null}
            onChoose={(c) => submitOptIn(c)}
          />
        )}
        {ctx.step === 'INTENT_RESOLVE' && (
          <IntentRevealStep
            myChoice={ctx.optIn[localPlayerId]}
            oppChoice={ctx.optIn[oppId]}
          />
        )}
        {ctx.step === 'BIDDING' && (
          <BiddingStep
            hand={me?.hand || []}
            isInverted={gameState.isInverted}
            myBid={ctx.bids[localPlayerId]}
            oppBidCount={ctx.bids[oppId] ? (ctx.bids[oppId] as string[]).length : 0}
            onSubmit={(cardIds) => submitBid(cardIds)}
          />
        )}
        {ctx.step === 'BID_RESOLVE' && (
          <ResolveStep ctx={ctx} myId={localPlayerId} oppId={oppId} myName={me?.name} oppName={opp?.name} />
        )}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  共用组件
// ═══════════════════════════════════════════════════════════

function DeadlineBar({ deadline, totalMs }: { deadline: number; totalMs: number }) {
  const [pct, setPct] = useState(100);
  useEffect(() => {
    const tick = () => {
      const remain = Math.max(0, deadline - Date.now());
      setPct((remain / totalMs) * 100);
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [deadline, totalMs]);

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0,
      height: 4, background: 'rgba(255,255,255,0.06)',
    }}>
      <motion.div
        animate={{ width: `${pct}%` }}
        transition={{ ease: 'linear', duration: 0.1 }}
        style={{
          height: '100%',
          background: pct < 30
            ? 'linear-gradient(90deg, #e74c3c, #ff6347)'
            : 'linear-gradient(90deg, #b8860b, #ffd700)',
          boxShadow: pct < 30 ? '0 0 12px #e74c3c' : '0 0 8px #b8860b',
        }}
      />
    </div>
  );
}

function DecreeCard({ decree, round }: { decree: IDecree; round: number }) {
  // 矮屏（手机横屏）紧凑模式
  const isShort = typeof window !== 'undefined' && window.innerHeight < 500;
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0, y: -30 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      style={{
        width: '100%', maxWidth: 580,
        padding: isShort ? '10px 14px' : 'clamp(16px, 2.5vw, 28px)',
        borderRadius: 12,
        background: 'linear-gradient(180deg, #261338, #170824)',
        border: '2px solid #b8860b',
        boxShadow: '0 0 40px rgba(184,134,11,0.45), inset 0 0 20px rgba(0,0,0,0.4)',
        textAlign: 'center',
      }}
    >
      {!isShort && (
        <div style={{
          fontSize: 11, color: '#e74c3c',
          fontFamily: '"Cinzel", serif',
          letterSpacing: 4,
          marginBottom: 6,
        }}>
          DECREE CONTEST · 第 {round} 回合
        </div>
      )}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: isShort ? 10 : 0,
        flexDirection: isShort ? 'row' : 'column',
      }}>
        <div style={{
          fontSize: isShort ? 28 : 'clamp(40px, 8vw, 56px)',
          marginBottom: isShort ? 0 : 4,
        }}>
          {decree.emoji}
        </div>
        <h2 style={{
          margin: 0,
          fontFamily: '"Cinzel", serif',
          fontSize: isShort ? 16 : 'clamp(20px, 3.5vw, 28px)',
          fontWeight: 900,
          color: '#ffd700',
          letterSpacing: isShort ? 2 : 6,
          textShadow: '0 0 14px rgba(255,215,0,0.5)',
        }}>
          《{decree.name}》
          {isShort && <span style={{ marginLeft: 8, fontSize: 10, color: '#e74c3c', letterSpacing: 1 }}>R{round}</span>}
        </h2>
      </div>
      <div style={{
        marginTop: isShort ? 8 : 16,
        display: 'flex', gap: isShort ? 6 : 12,
        flexWrap: 'wrap', justifyContent: 'center',
      }}>
        <div style={{
          flex: '1 1 240px', minWidth: isShort ? 160 : 200,
          padding: isShort ? '6px 8px' : 12, borderRadius: 8,
          background: 'rgba(46,204,113,0.08)',
          border: '1px solid #2ecc7150',
          textAlign: 'left',
        }}>
          <div style={{
            color: '#2ecc71', fontSize: 10, fontWeight: 700,
            letterSpacing: 2, marginBottom: isShort ? 2 : 6,
          }}>
            ✦ 特 权 (BUFF)
          </div>
          <div style={{ color: '#ddd', fontSize: isShort ? 11 : 12, lineHeight: 1.4 }}>
            {decree.buffText}
          </div>
        </div>
        <div style={{
          flex: '1 1 240px', minWidth: isShort ? 160 : 200,
          padding: isShort ? '6px 8px' : 12, borderRadius: 8,
          background: 'rgba(231,76,60,0.08)',
          border: '1px solid #e74c3c50',
          textAlign: 'left',
        }}>
          <div style={{
            color: '#e74c3c', fontSize: 10, fontWeight: 700,
            letterSpacing: 2, marginBottom: isShort ? 2 : 6,
          }}>
            ☠ 毒 誓 (DEBUFF)
          </div>
          <div style={{ color: '#ddd', fontSize: isShort ? 11 : 12, lineHeight: 1.4 }}>
            {decree.debuffText}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
//  Step 1: OPT_IN
// ═══════════════════════════════════════════════════════════

function OptInStep({
  myChoice, oppChose, onChoose,
}: {
  myChoice: 'CONTEST' | 'PASS' | null;
  oppChose: boolean;
  onChoose: (c: 'CONTEST' | 'PASS') => void;
}) {
  const locked = myChoice !== null;
  const isShort = typeof window !== 'undefined' && window.innerHeight < 500;
  return (
    <>
      <div style={{
        color: '#ccc', fontSize: isShort ? 11 : 13,
        fontFamily: '"Cinzel", serif', letterSpacing: 2,
        marginTop: isShort ? 0 : 4,
      }}>
        ▼ 双 盲 抉 择 ▼
      </div>
      <div style={{
        display: 'flex', gap: 'clamp(10px, 3vw, 32px)',
        flexWrap: 'wrap', justifyContent: 'center',
      }}>
        <BigButton
          label="🩸 争 夺"
          subtitle="CONTEST"
          color="#e74c3c"
          chosen={myChoice === 'CONTEST'}
          locked={locked}
          onClick={() => onChoose('CONTEST')}
        />
        <BigButton
          label="💨 放 弃"
          subtitle="PASS"
          color="#888"
          chosen={myChoice === 'PASS'}
          locked={locked}
          onClick={() => onChoose('PASS')}
        />
      </div>
      <div style={{
        marginTop: isShort ? 2 : 8, fontSize: isShort ? 10 : 11,
        color: oppChose ? '#ffd700' : '#666',
        fontFamily: '"Cinzel", serif', letterSpacing: 2,
      }}>
        {locked
          ? (oppChose ? '⚖ 双方已抉择，等待揭晓…' : '… 等待对手抉择 …')
          : '尽快抉择！倒计时结束默认放弃。'}
      </div>
    </>
  );
}

function BigButton({
  label, subtitle, color, chosen, locked, onClick,
}: {
  label: string; subtitle: string;
  color: string; chosen: boolean; locked: boolean;
  onClick: () => void;
}) {
  const isShort = typeof window !== 'undefined' && window.innerHeight < 500;
  return (
    <motion.button
      onClick={() => !locked && onClick()}
      whileHover={!locked ? { scale: 1.05, y: -3 } : undefined}
      whileTap={!locked ? { scale: 0.95 } : undefined}
      animate={chosen
        ? { boxShadow: [`0 0 10px ${color}`, `0 0 30px ${color}aa`, `0 0 10px ${color}`] }
        : {}
      }
      transition={chosen ? { duration: 1.5, repeat: Infinity } : undefined}
      style={{
        flex: isShort ? '0 0 130px' : '0 0 clamp(120px, 30vw, 200px)',
        padding: isShort ? '10px 18px' : 'clamp(14px, 3vw, 26px) clamp(18px, 4vw, 32px)',
        borderRadius: 12,
        border: `3px solid ${chosen ? color : color + '60'}`,
        background: chosen
          ? `linear-gradient(135deg, ${color}33, ${color}11)`
          : 'rgba(0,0,0,0.5)',
        color,
        fontFamily: '"Cinzel", serif',
        fontSize: isShort ? 16 : 'clamp(18px, 3vw, 26px)',
        fontWeight: 900,
        letterSpacing: isShort ? 2 : 4,
        cursor: locked ? 'default' : 'pointer',
        opacity: locked && !chosen ? 0.4 : 1,
      }}
    >
      <div>{label}</div>
      <div style={{
        fontSize: isShort ? 9 : 10, color: '#aaa',
        marginTop: isShort ? 2 : 6, letterSpacing: 3,
      }}>
        {subtitle}
      </div>
    </motion.button>
  );
}

// ═══════════════════════════════════════════════════════════
//  Step 2: INTENT_RESOLVE — 揭晓双方意向
// ═══════════════════════════════════════════════════════════

function IntentRevealStep({
  myChoice, oppChoice,
}: {
  myChoice: 'CONTEST' | 'PASS' | null;
  oppChoice: 'CONTEST' | 'PASS' | null;
}) {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      style={{ display: 'flex', gap: 24, alignItems: 'center', justifyContent: 'center' }}
    >
      <ChoiceReveal label="你" choice={myChoice} />
      <div style={{ color: '#888', fontSize: 24 }}>VS</div>
      <ChoiceReveal label="对手" choice={oppChoice} />
    </motion.div>
  );
}

function ChoiceReveal({ label, choice }: { label: string; choice: 'CONTEST' | 'PASS' | null }) {
  const isContest = choice === 'CONTEST';
  return (
    <div style={{
      padding: '14px 24px', borderRadius: 12,
      border: `2px solid ${isContest ? '#e74c3c' : '#666'}`,
      background: isContest
        ? 'linear-gradient(135deg, #e74c3c33, #1a0000)'
        : 'rgba(50,50,50,0.5)',
      color: isContest ? '#e74c3c' : '#aaa',
      textAlign: 'center', minWidth: 120,
    }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 3, fontFamily: '"Cinzel", serif' }}>
        {isContest ? '🩸 争夺' : '💨 放弃'}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  Step 3: BIDDING — 暗扣 1-3 张牌
// ═══════════════════════════════════════════════════════════

function BiddingStep({
  hand, isInverted, myBid, oppBidCount, onSubmit,
}: {
  hand: ICard[];
  isInverted: boolean;
  myBid: string[] | null;
  oppBidCount: number;
  onSubmit: (cardIds: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);

  const eligible = useMemo(() =>
    hand.filter(c => c.rank !== CardRank.FLASH && !c.isPhantom),
    [hand],
  );

  const pickedCards = picked
    .map(id => eligible.find(c => c.id === id))
    .filter((c): c is ICard => c !== undefined);

  const power = calcBidPower(pickedCards, isInverted);
  const submitted = myBid !== null;

  const toggleCard = (id: string) => {
    if (submitted) return;
    setPicked(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length >= 3 ? prev : [...prev, id]
    );
  };

  const comboLabel: Record<string, { name: string; color: string; bonus: number }> = {
    SCATTER: { name: '散牌', color: '#888', bonus: 0 },
    PAIR: { name: '双生共鸣', color: '#4488ff', bonus: 6 },
    STRAIGHT: { name: '三阶序列', color: '#2ecc71', bonus: 10 },
    TRIPLE: { name: '绝对狂热', color: '#e74c3c', bonus: 12 },
  };
  const cmb = comboLabel[power.combo];

  return (
    <>
      <div style={{
        color: '#e74c3c', fontSize: 14,
        fontFamily: '"Cinzel", serif', letterSpacing: 3,
      }}>
        ☠ 暗 标 死 斗 ☠
      </div>

      {/* 祭坛槽位 */}
      <div style={{
        display: 'flex', gap: 8, padding: 'clamp(8px, 2vw, 14px)',
        borderRadius: 10,
        background: 'radial-gradient(ellipse at center, rgba(231,76,60,0.18), rgba(0,0,0,0.5))',
        border: '1px dashed #e74c3c80',
        minHeight: 140, alignItems: 'center', justifyContent: 'center',
      }}>
        {pickedCards.length === 0 ? (
          <div style={{ color: '#666', fontSize: 12, fontStyle: 'italic' }}>
            从下方手牌选 1-3 张投入祭坛 (瞬/虚影不可竞标)
          </div>
        ) : pickedCards.map(c => (
          <Card key={c.id} card={c} size="sm" isSelected onClick={() => toggleCard(c.id)} />
        ))}
      </div>

      {/* 战力实时显示 */}
      {pickedCards.length > 0 && (
        <div style={{
          display: 'flex', gap: 16, alignItems: 'center',
          padding: '8px 14px', borderRadius: 8,
          background: 'rgba(0,0,0,0.6)', border: `1px solid ${cmb.color}40`,
        }}>
          <span style={{ color: '#888', fontSize: 11 }}>
            基础分 {power.baseSum}
          </span>
          {cmb.bonus > 0 && (
            <span style={{ color: cmb.color, fontSize: 12, fontWeight: 700 }}>
              + [{cmb.name}] +{cmb.bonus}
            </span>
          )}
          <span style={{
            color: '#ffd700', fontSize: 18, fontWeight: 900,
            fontFamily: '"Cinzel", serif',
          }}>
            战力 {power.total}
          </span>
        </div>
      )}

      {/* 手牌选择区 (横滚) */}
      <div style={{
        width: '100%', maxWidth: 720,
        overflowX: 'auto', display: 'flex',
        gap: 8, padding: '4px 8px',
        scrollbarColor: '#3a1f5e #0d0018',
      }}>
        {eligible.length === 0 ? (
          <div style={{ color: '#666', fontSize: 12, padding: '20px' }}>
            手牌已空 — 自动放弃竞标
          </div>
        ) : eligible.map(c => (
          <Card
            key={c.id}
            card={c}
            size="sm"
            isSelected={picked.includes(c.id)}
            onClick={() => toggleCard(c.id)}
          />
        ))}
      </div>

      {/* 提交按钮 */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <motion.button
          disabled={submitted || picked.length === 0}
          onClick={() => {
            onSubmit(picked);
          }}
          whileHover={!submitted && picked.length > 0 ? { scale: 1.05 } : undefined}
          whileTap={!submitted && picked.length > 0 ? { scale: 0.95 } : undefined}
          style={{
            padding: '12px 24px', borderRadius: 10,
            border: '2px solid #e74c3c',
            background: submitted || picked.length === 0
              ? 'rgba(50,50,50,0.4)'
              : 'linear-gradient(135deg, #e74c3c, #8b0000)',
            color: submitted ? '#888' : '#fff',
            fontFamily: '"Cinzel", serif', fontSize: 14, fontWeight: 900,
            letterSpacing: 4,
            cursor: submitted || picked.length === 0 ? 'not-allowed' : 'pointer',
            opacity: submitted || picked.length === 0 ? 0.5 : 1,
          }}
        >
          {submitted ? '✓ 已 投 标' : '☠ 投 入 祭 坛'}
        </motion.button>
        <div style={{ color: '#888', fontSize: 11 }}>
          对手已投：{oppBidCount > 0 ? `${oppBidCount} 张 (面朝下)` : '思考中…'}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
//  Step 4: BID_RESOLVE — 揭晓
// ═══════════════════════════════════════════════════════════

function ResolveStep({
  ctx, myId, oppId, myName, oppName,
}: {
  ctx: IDecreeContestState;
  myId: string;
  oppId: string;
  myName?: string;
  oppName?: string;
}) {
  const isMyWin = ctx.outcome === myId;
  const isOppWin = ctx.outcome === oppId;
  const isVoid = ctx.outcome === 'VOID' || ctx.outcome === 'TIE';
  const myPower = ctx.bidPower[myId] || 0;
  const oppPower = ctx.bidPower[oppId] || 0;
  const myCards = ctx.bidCards?.[myId] || [];
  const oppCards = ctx.bidCards?.[oppId] || [];
  const myCombo = ctx.bidComboType[myId];
  const oppCombo = ctx.bidComboType[oppId];

  // 翻牌时序: 0-700ms 卡背入场 → 700-2200ms 戏剧化暂停 → 2200ms 翻面+战力 → 4200ms 胜负揭晓
  // 总展示时长约 6 秒（与引擎 finalizeDecree 6500ms 超时同步）
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(0);
  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 700);    // 卡背入场完成
    const t2 = setTimeout(() => setStage(2), 2200);   // 翻面完成 → 显示战力
    const t3 = setTimeout(() => setStage(3), 4200);   // 显示胜负标题
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // 当前阶段文字
  const stageLabel = stage === 0 ? '☠ 双方暗牌入场 ☠'
    : stage === 1 ? '⚖ 战力裁定中…'
    : stage === 2 ? '🔥 翻面揭晓 🔥'
    : '✦ 胜负已分 ✦';

  return (
    <motion.div
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 18, width: '100%', maxWidth: 720,
      }}
    >
      {/* 当前阶段提示横幅 */}
      <motion.div
        key={stage}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          padding: '6px 18px', borderRadius: 6,
          border: '1px solid #b8860b80',
          background: 'rgba(184,134,11,0.12)',
          color: '#ffd700', fontSize: 13, fontWeight: 700,
          fontFamily: '"Cinzel", serif', letterSpacing: 3,
        }}
      >
        {stageLabel}
      </motion.div>

      {/* 双方卡牌翻牌区 */}
      <div style={{
        display: 'flex', justifyContent: 'space-around',
        width: '100%', alignItems: 'center', gap: 16,
      }}>
        <BidRevealSide
          name={myName || '你'}
          cards={myCards}
          combo={myCombo}
          power={myPower}
          stage={stage}
          color="#ffd700"
          isWinner={isMyWin}
        />
        <motion.div
          style={{ color: '#666', fontSize: 28, fontFamily: '"Cinzel", serif', letterSpacing: 4 }}
          animate={stage >= 2 ? { scale: [1, 1.3, 1], color: ['#666', '#e74c3c', '#666'] } : {}}
          transition={{ duration: 0.8 }}
        >
          VS
        </motion.div>
        <BidRevealSide
          name={oppName || '对手'}
          cards={oppCards}
          combo={oppCombo}
          power={oppPower}
          stage={stage}
          color="#e74c3c"
          isWinner={isOppWin}
        />
      </div>

      {/* 胜负标题 (stage 3 才出) */}
      {stage >= 3 && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 12 }}
          style={{
            fontSize: 'clamp(20px, 4vw, 32px)',
            color: isMyWin ? '#ffd700' : isOppWin ? '#e74c3c' : '#888',
            fontFamily: '"Cinzel", serif',
            fontWeight: 900, letterSpacing: 6,
            textShadow: isMyWin
              ? '0 0 24px rgba(255,215,0,0.7)'
              : isOppWin
                ? '0 0 24px rgba(231,76,60,0.7)'
                : 'none',
          }}
        >
          {isMyWin ? `✦ ${myName || '你'} 赢得法案 ✦`
           : isOppWin ? `☠ ${oppName || '对手'} 赢得法案 ☠`
           : '🔥 法案撕裂作废 🔥'}
        </motion.div>
      )}

      {stage >= 3 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{ color: '#888', fontSize: 11, fontStyle: 'italic' }}
        >
          {isVoid
            ? (myCards.length > 0 || oppCards.length > 0
                ? '双方提交的卡牌已全部销毁。'
                : '双方均未出牌, 法案直接化为灰烬。')
            : (myCards.length > 0 && oppCards.length > 0
                ? '法案归属, 双方竞标牌沉入弃牌堆。'
                : '对手未出牌, 你的暗标牌已退回手牌。')}
        </motion.div>
      )}
    </motion.div>
  );
}

/** 单方暗标牌翻牌展示 */
function BidRevealSide({
  name, cards, combo, power, stage, color, isWinner,
}: {
  name: string;
  cards: ICard[];
  combo: 'SCATTER' | 'PAIR' | 'STRAIGHT' | 'TRIPLE' | null | undefined;
  power: number;
  stage: 0 | 1 | 2 | 3;
  color: string;
  isWinner: boolean;
}) {
  const COMBO_LABEL: Record<string, string> = {
    PAIR: '双生共鸣 +6',
    STRAIGHT: '三阶序列 +10',
    TRIPLE: '绝对狂热 +12',
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      flex: 1, minWidth: 0,
    }}>
      <div style={{ color: '#888', fontSize: 11, letterSpacing: 2 }}>{name}</div>

      {/* 卡牌区: stage 0/1 显示卡背, stage>=2 翻到正面 */}
      <div style={{
        display: 'flex', gap: 6, justifyContent: 'center', minHeight: 100,
        position: 'relative',
      }}>
        {cards.length === 0 ? (
          <div style={{
            color: '#444', fontSize: 12, fontStyle: 'italic',
            border: '1px dashed #333', borderRadius: 6, padding: '24px 16px',
            background: 'rgba(0,0,0,0.3)',
          }}>
            未出牌
          </div>
        ) : (
          cards.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ rotateY: 180, scale: 0.6, opacity: 0 }}
              animate={{
                rotateY: stage >= 2 ? 0 : 180,
                scale: 1,
                opacity: 1,
              }}
              transition={{
                duration: 0.6,
                delay: stage >= 2 ? 0.1 * i : 0.05 * i,
              }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              <Card card={c} size="sm" />
            </motion.div>
          ))
        )}
      </div>

      {/* Combo 高亮 (stage >= 2) */}
      {stage >= 2 && combo && combo !== 'SCATTER' && (
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: [0.6, 1.2, 1], opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          style={{
            padding: '4px 14px',
            borderRadius: 4,
            background: 'rgba(255, 80, 80, 0.2)',
            border: '1px solid #ff5555',
            color: '#ffaaaa',
            fontSize: 12,
            fontFamily: '"Cinzel", serif',
            letterSpacing: 2,
            textShadow: '0 0 8px rgba(255,80,80,0.7)',
          }}
        >
          ⚡ {COMBO_LABEL[combo] || combo}
        </motion.div>
      )}

      {/* 战力数字 */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={stage >= 2 ? { scale: 1, opacity: 1 } : { scale: 0.5, opacity: 0 }}
        transition={{ delay: 0.4, type: 'spring' }}
        style={{
          fontSize: 28, fontWeight: 900, fontFamily: 'monospace',
          color: isWinner && stage >= 3 ? '#ffd700' : color,
          textShadow: isWinner && stage >= 3
            ? `0 0 18px ${color}, 0 0 28px rgba(255,215,0,0.8)`
            : `0 0 8px ${color}`,
        }}
      >
        {cards.length === 0 ? '—' : power}
      </motion.div>

      {/* 胜方光环 */}
      {isWinner && stage >= 3 && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.4, 1], opacity: [0, 0.8, 0.4] }}
          transition={{ duration: 1, repeat: Infinity, repeatType: 'reverse' }}
          style={{
            position: 'absolute',
            width: 200, height: 200,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${color}40, transparent)`,
            pointerEvents: 'none',
            marginTop: 30,
          }}
        />
      )}
    </div>
  );
}
