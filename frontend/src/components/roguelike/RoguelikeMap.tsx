/**
 * Roguelike 地图组件 — 分支路径可视化
 *
 * 连线方案：在相邻两行之间插入一排小箭头行，
 * 按连接关系对齐列，避免 SVG 百分比与 flex 布局错位问题。
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

/** 节点占位宽度（与 MapNode 保持一致） */
const NODE_W = 72;
const NODE_GAP = 48;

export function RoguelikeMap({ floor, currentNodeId, reachableNodeIds, onSelectNode }: RoguelikeMapProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0,
      padding: '20px 10px',
    }}>
      {floor.rows.map((row, ri) => {
        const nextRow = floor.rows[ri + 1];
        return (
          <div key={ri} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            {/* 节点行 */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: `clamp(16px, 4vw, ${NODE_GAP}px)`,
              width: '100%',
            }}>
              {row.map((node) => {
                const isReachable = reachableNodeIds.includes(node.id);
                const isCurrent = node.id === currentNodeId;
                return (
                  <MapNode
                    key={node.id}
                    node={node}
                    color={NODE_COLORS[node.type]}
                    isReachable={isReachable}
                    isCurrent={isCurrent}
                    onClick={() => isReachable && !node.completed && onSelectNode(node.id)}
                  />
                );
              })}
            </div>

            {/* 连线行：仅当存在下一行时渲染 */}
            {nextRow && (
              <ConnectorRow
                fromRow={row}
                toRow={nextRow}
                reachableNodeIds={reachableNodeIds}
                currentNodeId={currentNodeId}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 连线行 — 在两行节点之间绘制竖线/斜线箭头。
 * 使用 SVG，宽度固定为容器实际节点区域，
 * 坐标基于节点数量和固定间距计算，与 flex 布局一致。
 */
function ConnectorRow({ fromRow, toRow, reachableNodeIds, currentNodeId }: {
  fromRow: IMapNode[];
  toRow: IMapNode[];
  reachableNodeIds: string[];
  currentNodeId: string | null;
}) {
  const H = 28; // 连线行高度

  // 计算一行节点的中心 x 坐标列表（相对于行宽中心）
  function centerXs(rowLen: number, totalW: number): number[] {
    const rowW = rowLen * NODE_W + (rowLen - 1) * NODE_GAP;
    const startX = (totalW - rowW) / 2 + NODE_W / 2;
    return Array.from({ length: rowLen }, (_, i) => startX + i * (NODE_W + NODE_GAP));
  }

  // 总宽度取两行中较宽的那行
  const maxLen = Math.max(fromRow.length, toRow.length);
  const totalW = maxLen * NODE_W + (maxLen - 1) * NODE_GAP;

  const fromXs = centerXs(fromRow.length, totalW);
  const toXs = centerXs(toRow.length, totalW);

  const lines: { x1: number; x2: number; active: boolean }[] = [];

  for (let fi = 0; fi < fromRow.length; fi++) {
    const fromNode = fromRow[fi];
    for (const targetId of fromNode.connections) {
      const ti = toRow.findIndex(n => n.id === targetId);
      if (ti === -1) continue;
      const isActive = reachableNodeIds.includes(targetId) || currentNodeId === fromNode.id;
      lines.push({ x1: fromXs[fi], x2: toXs[ti], active: isActive });
    }
  }

  return (
    <svg
      width={totalW}
      height={H}
      style={{ overflow: 'visible', display: 'block' }}
    >
      {lines.map(({ x1, x2, active }, i) => (
        <line
          key={i}
          x1={x1} y1={0}
          x2={x2} y2={H}
          stroke={active ? '#b8860b80' : '#2a1a3e50'}
          strokeWidth={active ? 2 : 1}
          strokeDasharray={active ? undefined : '4 4'}
        />
      ))}
    </svg>
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
        width: NODE_W,
        height: NODE_W,
        flexShrink: 0,
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
      <span style={{ fontSize: 20 }}>
        {node.completed ? '✓' : NODE_ICONS[node.type]}
      </span>
      <span style={{
        fontSize: 10,
        color: node.completed ? '#555' : color,
        fontWeight: 700,
      }}>
        {NODE_LABELS[node.type]}
      </span>
    </motion.button>
  );
}
