/**
 * 《坠典》世界地图 — 连续纵向卷轴（苏丹的游戏式）
 *
 * 坐标系 1000 x 3000，三章背景图纵向拼接；
 * SVG 曲线绘制路径，蜡封印章式节点，英雄棋子沿路径移动。
 */
import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { IStoryNode, StoryNodeType } from '../../types/roguelike';
import { ROGUELIKE_CONSTANTS } from '../../types/roguelike';
import { HeroType } from '../../types/game';

const MAP_W = ROGUELIKE_CONSTANTS.MAP_WIDTH;
const MAP_H = ROGUELIKE_CONSTANTS.MAP_HEIGHT;

const HERO_ICONS: Record<HeroType, string> = {
  [HeroType.PHANTOM]: '🎭',
  [HeroType.WEAVER]: '🔮',
  [HeroType.INQUISITOR]: '⚖️',
  [HeroType.SINGER]: '🎵',
};

const NODE_VISUAL: Record<StoryNodeType, { icon: string; color: string; size: number }> = {
  STORY: { icon: '⛧', color: '#9b59b6', size: 44 },
  BATTLE: { icon: '⚔️', color: '#b8860b', size: 48 },
  ELITE: { icon: '💀', color: '#e74c3c', size: 52 },
  BOSS: { icon: '👹', color: '#8b0000', size: 62 },
  FINAL_BOSS: { icon: '📖', color: '#e8e0d0', size: 68 },
  SHOP: { icon: '🏪', color: '#2ecc71', size: 46 },
  EVENT: { icon: '❓', color: '#9b59b6', size: 46 },
  REST: { icon: '🏕️', color: '#3498db', size: 46 },
  PACT: { icon: '🚪', color: '#ffd700', size: 58 },
};

interface WorldMapProps {
  nodes: IStoryNode[];
  currentNodeId: string | null;
  reachableNodeIds: string[];
  heroType: HeroType;
  onSelectNode: (nodeId: string) => void;
}

export function WorldMap({ nodes, currentNodeId, reachableNodeIds, heroType, onSelectNode }: WorldMapProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const current = nodes.find(n => n.id === currentNodeId) ?? null;

  // 当前节点变化时自动滚动到视野中心
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !current) return;
    const t = setTimeout(() => {
      const yFraction = current.y / MAP_H;
      const target = yFraction * container.scrollHeight - container.clientHeight * 0.45;
      container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(t);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        display: 'flex', justifyContent: 'center',
      }}
    >
      <div style={{
        position: 'relative',
        width: 'min(100%, 720px)',
        aspectRatio: `${MAP_W} / ${MAP_H}`,
        flexShrink: 0,
        height: 'auto',
      }}>
        {/* ═══ 三章背景图 ═══ */}
        {['chapter1', 'chapter2', 'chapter3'].map((name, i) => (
          <img
            key={name}
            src={`./map/${name}.png`}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: 0, top: `${(i * 100) / 3}%`,
              width: '100%', height: `${100 / 3}%`,
              objectFit: 'cover',
              userSelect: 'none',
              filter: 'brightness(0.85)',
            }}
          />
        ))}

        {/* 章节衔接过渡遮罩 */}
        {[1, 2].map(i => (
          <div
            key={i}
            style={{
              position: 'absolute', left: 0,
              top: `calc(${(i * 100) / 3}% - 4%)`,
              width: '100%', height: '8%',
              background: 'linear-gradient(180deg, transparent, rgba(5,0,10,0.9) 50%, transparent)',
              pointerEvents: 'none',
            }}
          />
        ))}
        {/* 整体暗色氛围遮罩 */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 50% 30%, transparent 40%, rgba(5,0,10,0.45) 100%)',
          pointerEvents: 'none',
        }} />

        {/* ═══ SVG 路径 ═══ */}
        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {nodes.map(node =>
            node.connections.map(targetId => {
              const target = nodes.find(n => n.id === targetId);
              if (!target) return null;
              const isTraveled = node.completed && (target.completed || target.id === currentNodeId);
              const isReachableEdge = node.id === currentNodeId && reachableNodeIds.includes(targetId);
              // 纵向曲线：中点横向偏移制造蜿蜒感
              const midY = (node.y + target.y) / 2;
              const bend = (node.x - target.x) * 0.3;
              const d = `M ${node.x} ${node.y} C ${node.x - bend} ${midY}, ${target.x + bend} ${midY}, ${target.x} ${target.y}`;
              return (
                <g key={`${node.id}-${targetId}`}>
                  <path
                    d={d}
                    fill="none"
                    stroke={isTraveled ? '#b8860b' : isReachableEdge ? '#ffd700' : '#4a3a5e'}
                    strokeWidth={isReachableEdge ? 5 : 3.5}
                    strokeDasharray={isTraveled ? 'none' : '10 8'}
                    opacity={isTraveled ? 0.9 : isReachableEdge ? 0.95 : 0.4}
                  />
                  {isReachableEdge && (
                    <path
                      d={d}
                      fill="none"
                      stroke="#ffd700"
                      strokeWidth={9}
                      opacity={0.18}
                    />
                  )}
                </g>
              );
            })
          )}
        </svg>

        {/* ═══ 节点 ═══ */}
        {nodes.map(node => {
          const v = NODE_VISUAL[node.type];
          const isCurrent = node.id === currentNodeId;
          const isReachable = reachableNodeIds.includes(node.id);
          const isDone = node.completed && !isCurrent;
          const interactive = isReachable && !isCurrent;

          return (
            <div
              key={node.id}
              style={{
                position: 'absolute',
                left: `${(node.x / MAP_W) * 100}%`,
                top: `${(node.y / MAP_H) * 100}%`,
                transform: 'translate(-50%, -50%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                zIndex: isCurrent ? 5 : 3,
              }}
            >
              <motion.button
                onClick={interactive ? () => onSelectNode(node.id) : undefined}
                whileHover={interactive ? { scale: 1.18 } : undefined}
                whileTap={interactive ? { scale: 0.92 } : undefined}
                animate={isReachable ? {
                  boxShadow: [
                    `0 0 8px ${v.color}80`,
                    `0 0 22px ${v.color}`,
                    `0 0 8px ${v.color}80`,
                  ],
                } : undefined}
                transition={isReachable ? { duration: 1.6, repeat: Infinity } : undefined}
                style={{
                  width: v.size, height: v.size,
                  borderRadius: '50%',
                  border: `2.5px solid ${isDone ? '#3a2a4e' : v.color}`,
                  background: isDone
                    ? 'radial-gradient(circle, #16101f, #0a0612)'
                    : `radial-gradient(circle, #241530, #0f0818 70%, ${v.color}22)`,
                  color: '#fff',
                  fontSize: v.size * 0.42,
                  cursor: interactive ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: isDone ? 0.45 : 1,
                  filter: !isReachable && !isCurrent && !node.completed ? 'grayscale(0.7) brightness(0.6)' : 'none',
                  padding: 0,
                }}
              >
                {isDone ? '✓' : v.icon}
              </motion.button>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: isDone ? '#554466' : isReachable ? '#ffd700' : '#8877aa',
                textShadow: '0 1px 4px #000, 0 0 8px #000',
                whiteSpace: 'nowrap',
                letterSpacing: 1,
                pointerEvents: 'none',
              }}>
                {node.label}
              </span>
            </div>
          );
        })}

        {/* ═══ 英雄棋子 ═══ */}
        {current && (
          <motion.div
            initial={false}
            animate={{
              left: `${(current.x / MAP_W) * 100}%`,
              top: `${(current.y / MAP_H) * 100 - 1.6}%`,
            }}
            transition={{ type: 'spring', stiffness: 60, damping: 14 }}
            style={{
              position: 'absolute',
              transform: 'translate(-50%, -100%)',
              zIndex: 10,
              pointerEvents: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                width: 44, height: 44, borderRadius: '50%',
                border: '2.5px solid #ffd700',
                background: 'radial-gradient(circle, #2a1a3e, #0d0018)',
                boxShadow: '0 0 18px rgba(255,215,0,0.7), 0 4px 12px rgba(0,0,0,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22,
              }}
            >
              {HERO_ICONS[heroType]}
            </motion.div>
            <div style={{
              width: 0, height: 0, marginTop: -2,
              borderLeft: '7px solid transparent',
              borderRight: '7px solid transparent',
              borderTop: '9px solid #ffd700',
              filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.7))',
            }} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
