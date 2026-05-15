/**
 * Roguelike 地图组件 — 分支路径可视化
 */
import { motion } from 'framer-motion';
import type { IFloorMap, IMapNode, NodeType } from '../../types/roguelike';

interface RoguelikeMapProps {
  floor: IFloorMap;
  currentNodeId: string | null;
  reachableNodeIds: string[];
  onSelectNode: (nodeId: string) => void;
}

const NODE_ICONS: Record<NodeType, string> = {
  BATTLE: '⚔️',
  ELITE: '💀',
  BOSS: '👹',
  SHOP: '🏪',
  EVENT: '❓',
  REST: '🏕️',
};

const NODE_COLORS: Record<NodeType, string> = {
  BATTLE: '#b8860b',
  ELITE: '#e74c3c',
  BOSS: '#8b0000',
  SHOP: '#27ae60',
  EVENT: '#9b59b6',
  REST: '#3498db',
};

const NODE_LABELS: Record<NodeType, string> = {
  BATTLE: '战斗',
  ELITE: '精英',
  BOSS: 'BOSS',
  SHOP: '商店',
  EVENT: '事件',
  REST: '休息',
};

export function RoguelikeMap({ floor, currentNodeId, reachableNodeIds, onSelectNode }: RoguelikeMapProps) {
  const allNodes = floor.rows.flat();
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      padding: '20px 10px',
      position: 'relative',
      minHeight: 300,
    }}>
      {/* SVG connections */}
      <svg
        style={{
          position: 'absolute',
          top: 0, left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        {floor.rows.map((row, ri) =>
          row.map((node) =>
            node.connections.map((targetId) => {
              const target = nodeMap.get(targetId);
              if (!target) return null;
              const currentRow = floor.rows[ri];
              const targetRow = floor.rows[ri + 1];
              if (!currentRow || !targetRow) return null;

              const x1Pct = (node.col + 0.5) / currentRow.length * 100;
              const y1Pct = (ri + 0.5) / floor.rows.length * 100;
              const x2Pct = (target.col + 0.5) / targetRow.length * 100;
              const y2Pct = ((ri + 1) + 0.5) / floor.rows.length * 100;

              const isActive = reachableNodeIds.includes(targetId) ||
                (currentNodeId === node.id);

              return (
                <line
                  key={`${node.id}-${targetId}`}
                  x1={`${x1Pct}%`}
                  y1={`${y1Pct}%`}
                  x2={`${x2Pct}%`}
                  y2={`${y2Pct}%`}
                  stroke={isActive ? '#b8860b60' : '#2a1a3e40'}
                  strokeWidth={isActive ? 2 : 1}
                  strokeDasharray={isActive ? undefined : '4 4'}
                />
              );
            })
          )
        )}
      </svg>

      {/* Node rows */}
      {floor.rows.map((row, ri) => (
        <div
          key={ri}
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 'clamp(16px, 4vw, 48px)',
            width: '100%',
            zIndex: 1,
          }}
        >
          {row.map((node) => {
            const isReachable = reachableNodeIds.includes(node.id);
            const isCurrent = node.id === currentNodeId;
            const color = NODE_COLORS[node.type];

            return (
              <MapNode
                key={node.id}
                node={node}
                color={color}
                isReachable={isReachable}
                isCurrent={isCurrent}
                onClick={() => isReachable && !node.completed && onSelectNode(node.id)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function MapNode({ node, color, isReachable, isCurrent, onClick }: {
  node: IMapNode;
  color: string;
  isReachable: boolean;
  isCurrent: boolean;
  onClick: () => void;
}) {
  const canClick = isReachable && !node.completed;

  return (
    <motion.button
      onClick={onClick}
      disabled={!canClick}
      style={{
        width: 'clamp(52px, 10vw, 72px)',
        height: 'clamp(52px, 10vw, 72px)',
        borderRadius: 12,
        border: `2px solid ${node.completed ? '#333' : isCurrent ? '#ffd700' : isReachable ? color : '#2a1a3e'}`,
        background: node.completed
          ? 'rgba(30,30,30,0.6)'
          : `linear-gradient(180deg, ${color}15, ${color}08)`,
        cursor: canClick ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        opacity: node.completed ? 0.4 : canClick ? 1 : 0.5,
        position: 'relative',
      }}
      whileHover={canClick ? {
        scale: 1.1,
        borderColor: color,
        boxShadow: `0 0 20px ${color}40`,
      } : {}}
      whileTap={canClick ? { scale: 0.95 } : {}}
      animate={isReachable && !node.completed ? {
        boxShadow: [
          `0 0 8px ${color}20`,
          `0 0 16px ${color}50`,
          `0 0 8px ${color}20`,
        ],
      } : {}}
      transition={isReachable ? { duration: 2, repeat: Infinity } : {}}
    >
      <span style={{ fontSize: 'clamp(18px, 3vw, 24px)' }}>
        {node.completed ? '✓' : NODE_ICONS[node.type]}
      </span>
      <span style={{
        fontSize: 'clamp(8px, 1.5vw, 10px)',
        color: node.completed ? '#555' : color,
        fontWeight: 700,
      }}>
        {NODE_LABELS[node.type]}
      </span>
    </motion.button>
  );
}
