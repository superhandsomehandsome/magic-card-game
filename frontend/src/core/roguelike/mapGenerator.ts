/**
 * Roguelike 地图生成器 — 生成类似杀戮尖塔的分支路径
 */
import { v4 as uuid } from 'uuid';
import type { IFloorMap, IMapNode, NodeType } from '../../types/roguelike';
import { ROGUELIKE_CONSTANTS } from '../../types/roguelike';

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function pickRandom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function generateNodeType(row: number, totalRows: number, rng: () => number): NodeType {
  if (row === totalRows - 1) return 'BOSS';

  const roll = rng();
  if (row === 0) {
    return roll < 0.7 ? 'BATTLE' : 'EVENT';
  }
  // middle rows have more variety
  if (roll < 0.40) return 'BATTLE';
  if (roll < 0.55) return 'ELITE';
  if (roll < 0.70) return 'EVENT';
  if (roll < 0.85) return 'SHOP';
  return 'REST';
}

export function generateFloorMap(floor: number, seed: number): IFloorMap {
  const rng = seededRandom(seed + floor * 7919);
  const { ROWS_PER_FLOOR, MAX_COLS } = ROGUELIKE_CONSTANTS;
  const totalRows = ROWS_PER_FLOOR + 1; // +1 for boss row
  const rows: IMapNode[][] = [];

  for (let r = 0; r < totalRows; r++) {
    const colCount = r === totalRows - 1
      ? 1
      : Math.max(2, Math.min(MAX_COLS, 2 + Math.floor(rng() * 3)));

    const row: IMapNode[] = [];
    for (let c = 0; c < colCount; c++) {
      row.push({
        id: uuid(),
        type: generateNodeType(r, totalRows, rng),
        row: r,
        col: c,
        connections: [],
        completed: false,
      });
    }
    rows.push(row);
  }

  // Wire connections: each node connects to 1-2 nodes in the next row
  for (let r = 0; r < totalRows - 1; r++) {
    const currentRow = rows[r];
    const nextRow = rows[r + 1];
    if (!nextRow || nextRow.length === 0) continue;

    for (let c = 0; c < currentRow.length; c++) {
      const node = currentRow[c];
      // Always connect to the closest node in the next row
      const mappedCol = Math.min(c, nextRow.length - 1);
      node.connections.push(nextRow[mappedCol].id);

      // 50% chance to also connect to an adjacent node
      if (rng() > 0.5 && mappedCol + 1 < nextRow.length) {
        node.connections.push(nextRow[mappedCol + 1].id);
      }
      if (rng() > 0.7 && mappedCol - 1 >= 0) {
        const altId = nextRow[mappedCol - 1].id;
        if (!node.connections.includes(altId)) {
          node.connections.push(altId);
        }
      }
    }

    // Ensure every next-row node is reachable by at least one current-row node
    for (const nextNode of nextRow) {
      const hasIncoming = currentRow.some(n => n.connections.includes(nextNode.id));
      if (!hasIncoming) {
        const connector = pickRandom(currentRow, rng);
        connector.connections.push(nextNode.id);
      }
    }
  }

  const bossNodeId = rows[totalRows - 1][0].id;

  return { floor, rows, bossNodeId };
}

export function generateAllMaps(seed: number): IFloorMap[] {
  const maps: IFloorMap[] = [];
  for (let f = 0; f < ROGUELIKE_CONSTANTS.TOTAL_FLOORS; f++) {
    maps.push(generateFloorMap(f, seed));
  }
  return maps;
}

export function findNode(maps: IFloorMap[], nodeId: string): IMapNode | null {
  for (const floor of maps) {
    for (const row of floor.rows) {
      for (const node of row) {
        if (node.id === nodeId) return node;
      }
    }
  }
  return null;
}

export function getReachableNodeIds(maps: IFloorMap[], currentNodeId: string | null, currentFloor: number): string[] {
  const floor = maps[currentFloor];
  if (!floor) return [];

  if (currentNodeId === null) {
    return floor.rows[0].map(n => n.id);
  }

  const node = findNode(maps, currentNodeId);
  if (!node) return [];

  // If current node is the boss and is completed, go to next floor row 0
  if (node.type === 'BOSS' && node.completed) {
    const nextFloor = maps[currentFloor + 1];
    if (nextFloor) {
      return nextFloor.rows[0].map(n => n.id);
    }
    return [];
  }

  return node.connections;
}
