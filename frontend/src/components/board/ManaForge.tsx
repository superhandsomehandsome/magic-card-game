/**
 * 秘力熔炉 — 咏唱分暂存展示组件
 * 视觉：炼金熔炉造型，分数随数值增长而升温
 * 显示：熔炉蓄力值 + 悬赏池 = 总可争夺分
 */
import { motion, AnimatePresence } from 'framer-motion';

interface ManaForgeProps {
  manaForge: number;
  bountyPool: number;
}

function getForgeTier(total: number) {
  if (total >= 80) return { color: '#ff2222', glow: 'rgba(255,50,50,0.9)', accent: '#ff4444', label: '熔炉过载！', intensity: 3 };
  if (total >= 50) return { color: '#ff6600', glow: 'rgba(255,120,0,0.8)', accent: '#ff8c00', label: '秘力涌动', intensity: 2 };
  if (total >= 20) return { color: '#b8860b', glow: 'rgba(184,134,11,0.7)', accent: '#ffd700', label: '', intensity: 1 };
  return { color: '#6b4c00', glow: 'rgba(107,76,0,0.5)', accent: '#b8860b', label: '', intensity: 0 };
}

export function ManaForge({ manaForge, bountyPool }: ManaForgeProps) {
  const total = manaForge + bountyPool;
  const tier = getForgeTier(total);
  const hasContent = total > 0;

  return (
    <AnimatePresence>
      {hasContent && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {/* 熔炉容器 */}
          <motion.div
            style={{
              position: 'relative',
              width: 140,
              padding: '10px 16px',
              borderRadius: 12,
              background: `linear-gradient(180deg, rgba(26,11,46,0.95) 0%, rgba(${tier.intensity >= 2 ? '80,20,0' : '40,15,0'},0.9) 100%)`,
              border: `2px solid ${tier.color}`,
              boxShadow: `0 0 ${8 + tier.intensity * 6}px ${tier.glow}, inset 0 -${4 + tier.intensity * 4}px ${8 + tier.intensity * 4}px ${tier.glow}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              overflow: 'hidden',
            }}
            animate={tier.intensity >= 2 ? {
              boxShadow: [
                `0 0 ${8 + tier.intensity * 6}px ${tier.glow}, inset 0 -8px 16px ${tier.glow}`,
                `0 0 ${16 + tier.intensity * 8}px ${tier.glow}, inset 0 -12px 24px ${tier.glow}`,
                `0 0 ${8 + tier.intensity * 6}px ${tier.glow}, inset 0 -8px 16px ${tier.glow}`,
              ],
            } : {}}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            {/* 熔岩填充（高度随分数变化） */}
            <motion.div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: `linear-gradient(180deg, ${tier.accent}30 0%, ${tier.color}60 100%)`,
                borderRadius: '0 0 10px 10px',
              }}
              animate={{
                height: `${Math.min(95, (total / 100) * 95 + 5)}%`,
              }}
              transition={{ type: 'spring', damping: 15 }}
            />

            {/* 标题 */}
            <div style={{
              position: 'relative',
              color: tier.accent,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 2,
              fontFamily: '"Cinzel", serif',
              textShadow: `0 0 8px ${tier.glow}`,
            }}>
              秘力熔炉
            </div>

            {/* 总分 */}
            <motion.div
              style={{
                position: 'relative',
                color: tier.accent,
                fontSize: total >= 80 ? 28 : total >= 40 ? 24 : 22,
                fontWeight: 900,
                fontFamily: 'monospace',
                textShadow: `0 0 12px ${tier.glow}`,
                lineHeight: 1,
              }}
              animate={tier.intensity >= 2 ? { scale: [1, 1.08, 1] } : {}}
              transition={{ duration: 0.8, repeat: Infinity }}
            >
              {total}
            </motion.div>

            {/* 分项明细 */}
            <div style={{
              position: 'relative',
              display: 'flex',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
            }}>
              {manaForge > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  fontSize: 10, color: '#9b59b6',
                }}>
                  <span style={{ opacity: 0.7 }}>✨</span>
                  <span style={{ fontWeight: 700 }}>{manaForge}</span>
                </div>
              )}
              {manaForge > 0 && bountyPool > 0 && (
                <span style={{ color: '#555', fontSize: 10 }}>+</span>
              )}
              {bountyPool > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  fontSize: 10, color: '#8b0000',
                }}>
                  <span style={{ opacity: 0.7 }}>💀</span>
                  <span style={{ fontWeight: 700 }}>{bountyPool}</span>
                </div>
              )}
            </div>
          </motion.div>

          {/* 过载标签 */}
          {tier.label && (
            <motion.div
              style={{
                color: tier.color,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: 2,
                fontFamily: '"Cinzel", serif',
              }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            >
              {tier.label}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
