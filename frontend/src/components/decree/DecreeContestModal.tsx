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
import { CardRank } from '../../types/game';
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
        alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(12px, 3vw, 24px)',
        overflowY: 'auto',
      }}
    >
      {/* 倒计时进度条 (顶端) */}
      <DeadlineBar deadline={ctx.deadline} totalMs={10000} key={ctx.step} />

      {/* 法案信息卡 */}
      <DecreeCard decree={decree} round={ctx.triggeringRound} />

      {/* 步骤主体 */}
      <div style={{ marginTop: 18, width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
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
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0, y: -30 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      style={{
        width: '100%', maxWidth: 580,
        padding: 'clamp(16px, 2.5vw, 28px)',
        borderRadius: 16,
        background: 'linear-gradient(180deg, #261338, #170824)',
        border: '2px solid #b8860b',
        boxShadow: '0 0 40px rgba(184,134,11,0.45), inset 0 0 20px rgba(0,0,0,0.4)',
        textAlign: 'center',
      }}
    >
      <div style={{
        fontSize: 11, color: '#e74c3c',
        fontFamily: '"Cinzel", serif',
        letterSpacing: 4,
        marginBottom: 6,
      }}>
        DECREE CONTEST · 第 {round} 回合
      </div>
      <div style={{
        fontSize: 'clamp(40px, 8vw, 56px)',
        marginBottom: 4,
      }}>
        {decree.emoji}
      </div>
      <h2 style={{
        margin: 0,
        fontFamily: '"Cinzel", serif',
        fontSize: 'clamp(20px, 3.5vw, 28px)',
        fontWeight: 900,
        color: '#ffd700',
        letterSpacing: 6,
        textShadow: '0 0 14px rgba(255,215,0,0.5)',
      }}>
        《{decree.name}》
      </h2>
      <div style={{
        marginTop: 16,
        display: 'flex', gap: 12,
        flexWrap: 'wrap', justifyContent: 'center',
      }}>
        <div style={{
          flex: '1 1 240px', minWidth: 200,
          padding: 12, borderRadius: 10,
          background: 'rgba(46,204,113,0.08)',
          border: '1px solid #2ecc7150',
          textAlign: 'left',
        }}>
          <div style={{
            color: '#2ecc71', fontSize: 11, fontWeight: 700,
            letterSpacing: 2, marginBottom: 6,
          }}>
            ✦ 特 权 (BUFF)
          </div>
          <div style={{ color: '#ddd', fontSize: 12, lineHeight: 1.5 }}>
            {decree.buffText}
          </div>
        </div>
        <div style={{
          flex: '1 1 240px', minWidth: 200,
          padding: 12, borderRadius: 10,
          background: 'rgba(231,76,60,0.08)',
          border: '1px solid #e74c3c50',
          textAlign: 'left',
        }}>
          <div style={{
            color: '#e74c3c', fontSize: 11, fontWeight: 700,
            letterSpacing: 2, marginBottom: 6,
          }}>
            ☠ 毒 誓 (DEBUFF)
          </div>
          <div style={{ color: '#ddd', fontSize: 12, lineHeight: 1.5 }}>
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
  return (
    <>
      <div style={{
        color: '#ccc', fontSize: 13,
        fontFamily: '"Cinzel", serif', letterSpacing: 2,
        marginTop: 4,
      }}>
        ▼ 双 盲 抉 择 ▼
      </div>
      <div style={{
        display: 'flex', gap: 'clamp(12px, 3vw, 32px)',
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
        marginTop: 8, fontSize: 11,
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
        flex: '0 0 clamp(120px, 30vw, 200px)',
        padding: 'clamp(14px, 3vw, 26px) clamp(18px, 4vw, 32px)',
        borderRadius: 14,
        border: `3px solid ${chosen ? color : color + '60'}`,
        background: chosen
          ? `linear-gradient(135deg, ${color}33, ${color}11)`
          : 'rgba(0,0,0,0.5)',
        color,
        fontFamily: '"Cinzel", serif',
        fontSize: 'clamp(18px, 3vw, 26px)',
        fontWeight: 900,
        letterSpacing: 4,
        cursor: locked ? 'default' : 'pointer',
        opacity: locked && !chosen ? 0.4 : 1,
      }}
    >
      <div>{label}</div>
      <div style={{
        fontSize: 10, color: '#aaa',
        marginTop: 6, letterSpacing: 3,
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

  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 14,
      }}
    >
      <div style={{
        fontSize: 'clamp(20px, 4vw, 32px)',
        color: isMyWin ? '#ffd700' : isOppWin ? '#e74c3c' : '#888',
        fontFamily: '"Cinzel", serif',
        fontWeight: 900, letterSpacing: 6,
        textShadow: isMyWin
          ? '0 0 20px rgba(255,215,0,0.6)'
          : isOppWin
            ? '0 0 20px rgba(231,76,60,0.6)'
            : 'none',
      }}>
        {isMyWin ? `✦ ${myName || '你'} 赢得法案 ✦`
         : isOppWin ? `☠ ${oppName || '对手'} 赢得法案 ☠`
         : '🔥 法案撕裂作废 🔥'}
      </div>
      <div style={{
        display: 'flex', gap: 24, alignItems: 'center',
        fontFamily: '"Cinzel", serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#888', fontSize: 11 }}>{myName || '你'}</div>
          <div style={{ color: '#ffd700', fontSize: 22, fontWeight: 900 }}>{myPower}</div>
        </div>
        <div style={{ color: '#666', fontSize: 18 }}>VS</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#888', fontSize: 11 }}>{oppName || '对手'}</div>
          <div style={{ color: '#e74c3c', fontSize: 22, fontWeight: 900 }}>{oppPower}</div>
        </div>
      </div>
      <div style={{ color: '#666', fontSize: 11, fontStyle: 'italic' }}>
        {isVoid
          ? '提交牌全部销毁。'
          : '法案归属，竞标牌全部销毁。'}
      </div>
    </motion.div>
  );
}
