/**
 * v2.1 原型 — 对峙阶段（突袭 / 蓄力+可选封印 二选一）
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import type { GameState, ConfrontAction } from '../protoTypes';
import { Rank, Phase } from '../protoTypes';
import { submitConfront, submitDefend, rankName } from '../protoEngine';
import { ProtoCard } from './ProtoCard';

interface Props {
  gs: GameState;
  onUpdate: () => void;
}

export function ConfrontPhase({ gs, onUpdate }: Props) {
  const [mode, setMode] = useState<'CHOOSE' | 'AMBUSH_SELECT' | 'SEAL_SELECT' | 'DEFEND'>('CHOOSE');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sealRank, setSealRank] = useState<Rank | null>(null);

  const player = gs.players[gs.currentPlayerId];
  const isDefendPhase = gs.phase === Phase.CONFRONT_DEFEND;

  // 防守方视角
  if (isDefendPhase && gs.ambush) {
    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
      >
        <div style={{ color: '#e74c3c', fontSize: 14, fontWeight: 700, letterSpacing: 3 }}>
          遭遇突袭！
        </div>
        <div style={{ color: '#888', fontSize: 11 }}>
          {gs.players[gs.ambush.attackerId].name} 发起了突袭
        </div>
        <ProtoCard card={gs.ambush.attackCard} faceDown />
        <div style={{ color: '#ccc', fontSize: 11, marginTop: 8 }}>选择回应：</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <ActionButton
            label="迎战"
            color="#e74c3c"
            onClick={() => setMode('DEFEND')}
            active={mode === 'DEFEND'}
          />
          <ActionButton
            label="怯战"
            color="#888"
            onClick={() => {
              submitDefend(gs, { type: 'FOLD' });
              onUpdate();
            }}
          />
        </div>
        {mode === 'DEFEND' && (
          <>
            <div style={{ color: '#ccc', fontSize: 11 }}>选择一张牌迎战：</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
              {player.hand.map(card => (
                <ProtoCard
                  key={card.id}
                  card={card}
                  selected={selectedId === card.id}
                  onClick={() => setSelectedId(card.id)}
                />
              ))}
            </div>
            {selectedId && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                onClick={() => {
                  submitDefend(gs, { type: 'FIGHT', cardId: selectedId });
                  setSelectedId(null);
                  setMode('CHOOSE');
                  onUpdate();
                }}
                style={{
                  padding: '8px 20px', borderRadius: 8,
                  border: '2px solid #e74c3c',
                  background: 'linear-gradient(135deg, #e74c3c33, #1a0000)',
                  color: '#e74c3c', fontWeight: 700, cursor: 'pointer',
                }}
              >
                确认迎战
              </motion.button>
            )}
          </>
        )}
      </motion.div>
    );
  }

  // 攻击方视角
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
    >
      <div style={{ color: '#ff6600', fontSize: 14, fontWeight: 700, letterSpacing: 3 }}>
        对 峙
      </div>
      <div style={{ color: '#888', fontSize: 11 }}>选择你的行动</div>

      {mode === 'CHOOSE' && (
        <div style={{ display: 'flex', gap: 12 }}>
          <ActionButton
            label="突袭"
            subtitle="出 1 张暗牌挑战"
            color="#e74c3c"
            onClick={() => setMode('AMBUSH_SELECT')}
          />
          <ActionButton
            label="蓄力"
            subtitle="+1 牌 +3 悬赏"
            color="#3498db"
            onClick={() => {
              const action: ConfrontAction = { type: 'CHARGE' };
              submitConfront(gs, action);
              onUpdate();
            }}
          />
          {player.hand.length > 1 && (
            <ActionButton
              label="蓄力+封印"
              subtitle="+1 牌，封印 1 个 rank"
              color="#9b59b6"
              onClick={() => setMode('SEAL_SELECT')}
            />
          )}
        </div>
      )}

      {mode === 'AMBUSH_SELECT' && (
        <>
          <div style={{ color: '#ccc', fontSize: 11 }}>选择突袭用牌：</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            {player.hand.map(card => (
              <ProtoCard
                key={card.id}
                card={card}
                selected={selectedId === card.id}
                onClick={() => setSelectedId(card.id)}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {selectedId && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                onClick={() => {
                  submitConfront(gs, { type: 'AMBUSH', cardId: selectedId });
                  setSelectedId(null);
                  setMode('CHOOSE');
                  onUpdate();
                }}
                style={{
                  padding: '8px 20px', borderRadius: 8,
                  border: '2px solid #e74c3c',
                  background: 'linear-gradient(135deg, #e74c3c33, #1a0000)',
                  color: '#e74c3c', fontWeight: 700, cursor: 'pointer',
                }}
              >
                发动突袭
              </motion.button>
            )}
            <button
              onClick={() => { setMode('CHOOSE'); setSelectedId(null); }}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #666', background: 'transparent', color: '#888', cursor: 'pointer' }}
            >
              返回
            </button>
          </div>
        </>
      )}

      {mode === 'SEAL_SELECT' && (
        <>
          <div style={{ color: '#ccc', fontSize: 11 }}>选择要献祭的牌（该牌的 rank 不重要，你将选择封印哪个 rank）：</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            {player.hand.map(card => (
              <ProtoCard
                key={card.id}
                card={card}
                selected={selectedId === card.id}
                onClick={() => setSelectedId(card.id)}
              />
            ))}
          </div>
          {selectedId && (
            <>
              <div style={{ color: '#ccc', fontSize: 11, marginTop: 4 }}>选择封印的 rank：</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[Rank.A, Rank.B, Rank.C, Rank.D, Rank.E, Rank.F].map(r => (
                  <motion.button
                    key={r}
                    whileHover={{ scale: 1.1 }}
                    onClick={() => setSealRank(r)}
                    style={{
                      padding: '6px 12px', borderRadius: 6,
                      border: `2px solid ${sealRank === r ? '#9b59b6' : '#444'}`,
                      background: sealRank === r ? 'rgba(155,89,182,0.2)' : 'transparent',
                      color: sealRank === r ? '#9b59b6' : '#888',
                      fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {rankName(r)}
                  </motion.button>
                ))}
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {selectedId && sealRank !== null && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                onClick={() => {
                  submitConfront(gs, { type: 'CHARGE', sealRank, sealCardId: selectedId });
                  setSelectedId(null);
                  setSealRank(null);
                  setMode('CHOOSE');
                  onUpdate();
                }}
                style={{
                  padding: '8px 20px', borderRadius: 8,
                  border: '2px solid #9b59b6',
                  background: 'linear-gradient(135deg, #9b59b633, #1a0b2e)',
                  color: '#9b59b6', fontWeight: 700, cursor: 'pointer',
                }}
              >
                蓄力 + 封印 {rankName(sealRank)}
              </motion.button>
            )}
            <button
              onClick={() => { setMode('CHOOSE'); setSelectedId(null); setSealRank(null); }}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #666', background: 'transparent', color: '#888', cursor: 'pointer' }}
            >
              返回
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}

function ActionButton({ label, subtitle, color, onClick, active }: {
  label: string; subtitle?: string; color: string; onClick: () => void; active?: boolean;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.05, y: -3 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      style={{
        padding: '12px 18px', borderRadius: 10,
        border: `2px solid ${active ? color : color + '80'}`,
        background: active ? `${color}22` : 'rgba(0,0,0,0.5)',
        color, fontWeight: 700, fontSize: 13,
        cursor: 'pointer', minWidth: 100,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      }}
    >
      <span>{label}</span>
      {subtitle && <span style={{ fontSize: 9, color: '#888' }}>{subtitle}</span>}
    </motion.button>
  );
}
