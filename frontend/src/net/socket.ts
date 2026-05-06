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

export interface GameActionPayload {
  kind: string;
  [key: string]: unknown;
}

// ═══════════════════════════════════════════════════════════
//  连接状态
// ═══════════════════════════════════════════════════════════

export type SocketStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'FAILED';
type StatusCallback = (status: SocketStatus) => void;

let socket: Socket | null = null;
let currentStatus: SocketStatus = 'DISCONNECTED';
const statusListeners = new Set<StatusCallback>();

function setStatus(s: SocketStatus) {
  currentStatus = s;
  statusListeners.forEach(cb => cb(s));
}

export function onSocketStatus(cb: StatusCallback): () => void {
  statusListeners.add(cb);
  cb(currentStatus);
  return () => statusListeners.delete(cb);
}

// ═══════════════════════════════════════════════════════════
//  Singleton Socket — 仅在首次 getSocket() 时创建
// ═══════════════════════════════════════════════════════════

export function getSocket(): Socket {
  if (socket) return socket;

  const url = import.meta.env.DEV
    ? (import.meta.env.VITE_SOCKET_URL || 'http://localhost:10000')
    : window.location.origin;

  setStatus('CONNECTING');

  socket = io(url, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 8000,
  });

  socket.on('connect', () => {
    console.log('[socket] connected', socket?.id);
    setStatus('CONNECTED');
  });

  socket.on('disconnect', (reason) => {
    console.log('[socket] disconnected', reason);
    setStatus('DISCONNECTED');
  });

  socket.on('connect_error', (err) => {
    console.warn('[socket] connect_error', err.message);
  });

  socket.io.on('reconnect_failed', () => {
    console.warn('[socket] all reconnection attempts exhausted');
    setStatus('FAILED');
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    setStatus('DISCONNECTED');
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

export function emitGameAction(payload: GameActionPayload): void {
  getSocket().emit('GAME_ACTION', payload);
}

export interface RoomPongPayload {
  inRoom: boolean;
  roomCode?: string;
  slot?: 0 | 1;
  isFull?: boolean;
}

export function emitRoomPing(): void {
  getSocket().emit('ROOM_PING');
}
