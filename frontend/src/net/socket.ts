/**
 * Socket.IO 客户端封装 — 单例连接 + 类型化事件
 *
 * 协议:
 *  out:  CREATE_ROOM | JOIN_ROOM | LEAVE_ROOM | HERO_SELECTED | GAME_ACTION
 *  in :  ROOM_CREATED | ROOM_JOINED | OPPONENT_JOINED | OPPONENT_LEFT
 *        OPPONENT_HERO | GAME_ACTION | ROOM_ERROR
 */
import { io, type Socket } from 'socket.io-client';
import type { HeroType } from '../types/game';

// ═══════════════════════════════════════════════════════════
//  事件协议类型
// ═══════════════════════════════════════════════════════════

export interface RoomCreatedPayload {
  roomCode: string;
  slot: 0 | 1;
}

export interface RoomJoinedPayload {
  roomCode: string;
  slot: 0 | 1;
  opponentReady: boolean;
}

export interface OpponentHeroPayload {
  hero: HeroType;
}

export interface RoomErrorPayload {
  message: string;
}

export type GameActionType =
  | 'AMBUSH_DECLARE'
  | 'AMBUSH_DEFEND'
  | 'CHANT_SUBMIT'
  | 'BLOCKADE_PLACE'
  | 'PHASE_ADVANCE'
  | 'DRAW_CARDS'
  | 'BUY_MARKET'
  | 'USE_ULTIMATE'
  | 'COLLISION_ACTION';

export interface GameActionPayload {
  type: GameActionType;
  payload: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════
//  Singleton Socket
// ═══════════════════════════════════════════════════════════

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket && socket.connected) return socket;

  if (!socket) {
    // 开发: 默认连本地 10000; 生产: 直接连同源
    const url = import.meta.env.DEV
      ? (import.meta.env.VITE_SOCKET_URL || 'http://localhost:10000')
      : window.location.origin;

    socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => console.log('[socket] connected', socket?.id));
    socket.on('disconnect', (reason) => console.log('[socket] disconnected', reason));
    socket.on('connect_error', (err) => console.warn('[socket] connect_error', err.message));
  }

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// ═══════════════════════════════════════════════════════════
//  发送指令的便捷函数
// ═══════════════════════════════════════════════════════════

export function emitCreateRoom(): void {
  getSocket().emit('CREATE_ROOM');
}

export function emitJoinRoom(roomCode: string): void {
  getSocket().emit('JOIN_ROOM', { roomCode });
}

export function emitLeaveRoom(): void {
  getSocket().emit('LEAVE_ROOM');
}

export function emitHeroSelected(hero: HeroType): void {
  getSocket().emit('HERO_SELECTED', { hero });
}

export function emitGameAction(action: GameActionPayload): void {
  getSocket().emit('GAME_ACTION', action);
}
