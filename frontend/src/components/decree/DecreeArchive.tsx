/**
 * 深渊档案库 — 常驻侧边栏 / 抽屉
 *
 * 渲染在棋盘左侧。展示己方/敌方/全局法案，悬停 tooltip 详情。
 * 桌面端：常驻 200px 抽屉；手机端：折叠为 📜 触发图标，点击展开覆盖层。
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import type { IDecree, IOfferedDecree } from '../../types/game';

export function DecreeArchive() {
  const gameState = useGameStore(s => s.gameState);
  const localPlayerId = useGameStore(s => s.localPlayerId);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<IDecree | null>(null);

  if (!gameState) return null;

  const me = gameState.players[localPlayerId];
  const oppId = Object.keys(gameState.players).find(id => id !== localPlayerId);
  const opp = oppId ? gameState.players[oppId] : null;
  const supreme = gameState.supremeDecree;

  const myDecrees = me?.activeDecrees || [];
  const oppDecrees = opp?.activeDecrees || [];

  // 已出现过但作废 / 跳过的，单独陈列在"已烧毁"区
  const burned = (gameState.offeredDecrees || []).filter(o => {
    if (o.ownerId === 'VOID') return true;
    if (supreme) return true; // 至高法案上线后所有私有都被吸收
    return false;
  });

  // 只统计有内容时才显示
  const totalCount = myDecrees.length + oppDecrees.length + burned.length + (supreme ? 1 : 0);
  if (totalCount === 0) return null;

  return (
    <>
      {/* 触发按钮 (左边缘) */}
      <motion.button
        onClick={() => setOpen(o => !o)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        style={{
          position: 'absolute',
          left: open ? 'clamp(180px, 30vw, 220px)' : 0,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 950,
          width: 32, height: 64,
          borderRadius: '0 8px 8px 0',
          border: '1px solid #b8860b',
          borderLeft: 'none',
          background: 'rgba(20,8,40,0.92)',
          color: '#b8860b',
          fontSize: 18, cursor: 'pointer',
          boxShadow: '4px 0 12px rgba(184,134,11,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column',
          fontFamily: '"Cinzel", serif',
          letterSpacing: 1,
          transition: 'left 0.3s',
        }}
        title="深渊档案库"
      >
        📜
        <div style={{ fontSize: 8, marginTop: 2, color: '#888' }}>
          {totalCount}
        </div>
      </motion.button>

      {/* 抽屉 */}
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: -240, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -240, opacity: 0 }}
            transition={{ ease: 'easeOut', duration: 0.3 }}
            style={{
              position: 'absolute',
              left: 0, top: 0, bottom: 0,
              width: 'clamp(180px, 30vw, 220px)',
              zIndex: 949,
              background: 'linear-gradient(180deg, #170824, #0a0014)',
              borderRight: '1px solid #b8860b40',
              padding: '16px 12px',
              overflowY: 'auto',
              fontFamily: '"Cinzel", serif',
            }}
          >
            <div style={{
              fontSize: 14, color: '#b8860b',
              letterSpacing: 4, fontWeight: 900,
              marginBottom: 14, textAlign: 'center',
            }}>
              📜 深 渊 档 案
            </div>

            {supreme && (
              <Section title="⚠ 至高法案 (全局)" color="#e74c3c">
                <DecreeIcon decree={supreme} onHover={setHovered} mode="supreme" />
              </Section>
            )}

            {myDecrees.length > 0 && (
              <Section title="✦ 己方法案" color="#ffd700">
                {myDecrees.map(d => (
                  <DecreeIcon key={d.id} decree={d} onHover={setHovered} mode="own" />
                ))}
              </Section>
            )}

            {oppDecrees.length > 0 && (
              <Section title="☠ 敌方法案" color="#e74c3c">
                {oppDecrees.map(d => (
                  <DecreeIcon key={d.id} decree={d} onHover={setHovered} mode="enemy" />
                ))}
              </Section>
            )}

            {burned.length > 0 && (
              <Section title="🔥 已 烧 毁 / 已 吸 收" color="#666">
                {burned.map(o => (
                  <DecreeIcon
                    key={o.decree.id + o.round}
                    decree={o.decree}
                    onHover={setHovered}
                    mode="burned"
                    badge={`R${o.round}`}
                  />
                ))}
              </Section>
            )}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Tooltip */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              left: 'clamp(220px, 32vw, 250px)',
              top: 80, zIndex: 960,
              width: 280, padding: 14,
              borderRadius: 10,
              background: 'linear-gradient(180deg, #1a0b2e, #0d0018)',
              border: '1px solid #b8860b',
              boxShadow: '0 0 20px rgba(184,134,11,0.4)',
              pointerEvents: 'none',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            <div style={{
              fontSize: 14, color: '#ffd700',
              fontFamily: '"Cinzel", serif', fontWeight: 700,
              letterSpacing: 3, marginBottom: 8,
            }}>
              {hovered.emoji} 《{hovered.name}》
            </div>
            <div style={{
              fontSize: 11, color: '#2ecc71', marginBottom: 4,
              fontWeight: 700, letterSpacing: 2,
            }}>
              ✦ 特权 (BUFF)
            </div>
            <div style={{
              fontSize: 11, color: '#ddd', lineHeight: 1.5, marginBottom: 8,
              whiteSpace: 'pre-line',
            }}>
              {hovered.buffText}
            </div>
            <div style={{
              fontSize: 11, color: '#e74c3c', marginBottom: 4,
              fontWeight: 700, letterSpacing: 2,
            }}>
              ☠ 毒誓 (DEBUFF)
            </div>
            <div style={{
              fontSize: 11, color: '#ddd', lineHeight: 1.5,
              whiteSpace: 'pre-line',
            }}>
              {hovered.debuffText}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 10, color, letterSpacing: 2,
        marginBottom: 6, fontWeight: 700,
      }}>
        {title}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))',
        gap: 6,
      }}>
        {children}
      </div>
    </div>
  );
}

function DecreeIcon({
  decree, onHover, mode, badge,
}: {
  decree: IDecree;
  onHover: (d: IDecree | null) => void;
  mode: 'own' | 'enemy' | 'burned' | 'supreme';
  badge?: string;
}) {
  const colors = {
    own: { border: '#ffd700', bg: 'rgba(255,215,0,0.08)' },
    enemy: { border: '#e74c3c', bg: 'rgba(231,76,60,0.08)' },
    burned: { border: '#555', bg: 'rgba(80,80,80,0.1)' },
    supreme: { border: '#e74c3c', bg: 'linear-gradient(135deg, #e74c3c33, #1a0000)' },
  }[mode];

  return (
    <motion.div
      onMouseEnter={() => onHover(decree)}
      onMouseLeave={() => onHover(null)}
      onTouchStart={() => onHover(decree)}
      onTouchEnd={() => setTimeout(() => onHover(null), 1500)}
      whileHover={{ scale: 1.1 }}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1.2',
        borderRadius: 6,
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
        cursor: 'help',
        filter: mode === 'burned' ? 'grayscale(0.8) brightness(0.6)' : undefined,
      }}
    >
      <span>{decree.emoji}</span>
      {badge && (
        <span style={{
          position: 'absolute', bottom: 1, right: 2,
          fontSize: 8, color: '#888',
          fontFamily: '"Cinzel", serif',
        }}>
          {badge}
        </span>
      )}
    </motion.div>
  );
}
