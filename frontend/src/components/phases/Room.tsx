/**
 * 房间界面 — 真实 Socket.IO 多人房间同步
 *
 * 流程:
 *   CREATE_ROOM → 等待 ROOM_CREATED → 等待 OPPONENT_JOINED → onReady
 *   JOIN_ROOM   → 等待 ROOM_JOINED  → 立即 onReady (因为另一方已在)
 */
import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  getSocket, emitCreateRoom, emitJoinRoom, emitLeaveRoom, emitRoomPing,
  onSocketStatus, type SocketStatus,
  type RoomCreatedPayload, type RoomJoinedPayload, type RoomErrorPayload,
  type RoomPongPayload,
} from '../../net/socket';

interface RoomProps {
  mode: 'CREATE_ROOM' | 'JOIN_ROOM';
  initialRoomCode?: string;
  /** 双方就位时回调; slot 决定本机是 P1(0) 还是 P2(1) */
  onReady: (roomCode: string, slot: 0 | 1) => void;
  onLeave: () => void;
}

type RoomStatus =
  | 'CONNECTING'
  | 'WAITING_HOST'
  | 'WAITING_OPPONENT'
  | 'BOTH_READY'
  | 'ERROR';

export function Room({ mode, initialRoomCode, onReady, onLeave }: RoomProps) {
  const [roomCode, setRoomCode] = useState<string>(initialRoomCode || '');
  const [mySlot, setMySlot] = useState<0 | 1 | null>(null);
  const [status, setStatus] = useState<RoomStatus>('CONNECTING');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const firedRef = useRef(false);

  // 监听 socket 连接状态 → 超时/失败时显示错误
  useEffect(() => {
    const unsub = onSocketStatus((s: SocketStatus) => {
      if (s === 'FAILED') {
        setStatus('ERROR');
        setErrorMsg('无法连接到服务器，请检查网络或稍后重试');
      }
    });
    return unsub;
  }, []);

  // 额外的硬超时: 15 秒无任何 socket 事件 → 显示错误
  useEffect(() => {
    const timer = setTimeout(() => {
      setStatus(prev => {
        if (prev === 'CONNECTING') {
          setErrorMsg('连接超时 — 服务器可能未启动');
          return 'ERROR';
        }
        return prev;
      });
    }, 15000);
    return () => clearTimeout(timer);
  }, []);

  // 主连接生命周期
  useEffect(() => {
    const socket = getSocket();
    firedRef.current = false;

    const handleCreated = (data: RoomCreatedPayload) => {
      console.log('[Room] ROOM_CREATED', data);
      setRoomCode(data.roomCode);
      setMySlot(data.slot);
      setStatus('WAITING_OPPONENT');
    };

    const handleJoined = (data: RoomJoinedPayload) => {
      console.log('[Room] ROOM_JOINED', data);
      setRoomCode(data.roomCode);
      setMySlot(data.slot);
      setStatus(data.opponentReady ? 'BOTH_READY' : 'WAITING_OPPONENT');
    };

    const handleOpponentJoined = () => {
      console.log('[Room] OPPONENT_JOINED received');
      setStatus(prev => prev === 'BOTH_READY' ? prev : 'BOTH_READY');
    };

    const handleOpponentLeft = () => {
      setStatus('WAITING_OPPONENT');
      setErrorMsg('对手已离开房间');
    };

    const handleError = (data: RoomErrorPayload) => {
      setStatus('ERROR');
      setErrorMsg(data.message || '未知错误');
    };

    const handleRoomPong = (data: RoomPongPayload) => {
      console.log('[Room] ROOM_PONG', data);
      if (data.inRoom && data.isFull) {
        setStatus(prev => prev === 'BOTH_READY' ? prev : 'BOTH_READY');
        if (data.slot !== undefined) setMySlot(data.slot as 0 | 1);
        if (data.roomCode) setRoomCode(data.roomCode);
      }
    };

    socket.on('ROOM_CREATED', handleCreated);
    socket.on('ROOM_JOINED', handleJoined);
    socket.on('OPPONENT_JOINED', handleOpponentJoined);
    socket.on('OPPONENT_LEFT', handleOpponentLeft);
    socket.on('ROOM_ERROR', handleError);
    socket.on('ROOM_PONG', handleRoomPong);

    const fire = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      if (mode === 'CREATE_ROOM') emitCreateRoom();
      else if (initialRoomCode) emitJoinRoom(initialRoomCode);
    };

    if (socket.connected) {
      fire();
    } else {
      socket.once('connect', fire);
    }

    // 轮询: 每3秒主动查询房间状态 (防止 OPPONENT_JOINED 事件丢失)
    const pollInterval = setInterval(() => {
      if (socket.connected) {
        emitRoomPing();
      }
    }, 3000);

    return () => {
      clearInterval(pollInterval);
      socket.off('ROOM_CREATED', handleCreated);
      socket.off('ROOM_JOINED', handleJoined);
      socket.off('OPPONENT_JOINED', handleOpponentJoined);
      socket.off('OPPONENT_LEFT', handleOpponentLeft);
      socket.off('ROOM_ERROR', handleError);
      socket.off('ROOM_PONG', handleRoomPong);
    };
  }, [mode, initialRoomCode]);

  // 双方就位 → 进入英雄选择
  useEffect(() => {
    if (status === 'BOTH_READY' && mySlot !== null && roomCode) {
      const t = setTimeout(() => onReady(roomCode, mySlot), 1200);
      return () => clearTimeout(t);
    }
  }, [status, mySlot, roomCode, onReady]);

  const handleCopy = () => {
    if (navigator.clipboard && roomCode) {
      navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleLeave = () => {
    emitLeaveRoom();
    onLeave();
  };

  // ═══════════════════════════════════════════════════════════
  //  错误界面
  // ═══════════════════════════════════════════════════════════

  if (status === 'ERROR') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: 'calc(var(--vh, 1vh) * 100)', padding: 32, gap: 24,
          background: 'radial-gradient(ellipse at center, #1a0b2e, #0d0018)',
        }}
      >
        <h2 style={{ color: '#e74c3c', fontFamily: '"Cinzel", serif', margin: 0 }}>
          ⚠️ 连接失败
        </h2>
        <p style={{ color: '#ccc', textAlign: 'center', maxWidth: 400 }}>
          {errorMsg || '无法连接到服务器'}
        </p>
        <motion.button
          onClick={onLeave}
          style={{
            padding: '10px 28px', borderRadius: 8,
            border: '1px solid #b8860b', background: 'transparent',
            color: '#b8860b', cursor: 'pointer',
          }}
          whileHover={{ scale: 1.05 }}
        >
          返回大厅
        </motion.button>
      </motion.div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  正常房间界面
  // ═══════════════════════════════════════════════════════════

  const opponentReady = status === 'BOTH_READY';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        minHeight: 'calc(var(--vh, 1vh) * 100)', padding: 32, gap: 32,
        background: 'radial-gradient(ellipse at center, #1a0b2e, #0d0018)',
      }}
    >
      <motion.h2
        style={{
          color: '#b8860b', fontFamily: '"Cinzel", serif',
          fontSize: 28, margin: 0, letterSpacing: 4,
        }}
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        {mode === 'CREATE_ROOM' ? '⛧ 召唤之圈 ⛧' : '⛧ 进入秘境 ⛧'}
      </motion.h2>

      {/* 房间号显示 */}
      <motion.div
        style={{
          padding: '24px 48px', borderRadius: 16,
          border: '2px solid #b8860b',
          background: 'linear-gradient(180deg, rgba(26,11,46,0.9), rgba(13,0,24,0.9))',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 8, minWidth: 280,
          cursor: roomCode && mode === 'CREATE_ROOM' ? 'pointer' : 'default',
        }}
        onClick={mode === 'CREATE_ROOM' && roomCode ? handleCopy : undefined}
      >
        <div style={{ color: '#888', fontSize: 12, letterSpacing: 2 }}>房间号</div>
        <div style={{
          color: '#ffd700', fontSize: 48, fontWeight: 900,
          fontFamily: 'monospace', letterSpacing: 8,
          textShadow: '0 0 20px rgba(255,215,0,0.5)',
        }}>
          {roomCode || '— — — —'}
        </div>
        {mode === 'CREATE_ROOM' && roomCode && (
          <div style={{ color: copied ? '#2ecc71' : '#666', fontSize: 11 }}>
            {copied ? '✓ 已复制' : '点击复制 · 分享给对手'}
          </div>
        )}
      </motion.div>

      {/* 玩家槽位 */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <PlayerSlot
          label={mySlot === 0 ? '我 (P1)' : '对手'}
          status={mySlot === 0 ? 'ready' : opponentReady ? 'ready' : 'waiting'}
          isMe={mySlot === 0}
        />
        <span style={{ color: '#444', fontSize: 24 }}>VS</span>
        <PlayerSlot
          label={mySlot === 1 ? '我 (P2)' : '对手'}
          status={mySlot === 1 ? 'ready' : opponentReady ? 'ready' : 'waiting'}
          isMe={mySlot === 1}
        />
      </div>

      {/* 状态提示 */}
      <motion.div
        style={{
          color: opponentReady ? '#2ecc71' : '#b8860b',
          fontSize: 14, fontFamily: '"Cinzel", serif',
        }}
        animate={!opponentReady ? { opacity: [0.4, 1, 0.4] } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        {opponentReady
          ? '✓ 双方就位 — 即将进入英雄选择'
          : status === 'CONNECTING'
            ? '正在连接服务器…'
            : '等待对手加入…'}
      </motion.div>

      <motion.button
        onClick={handleLeave}
        style={{
          padding: '8px 24px', borderRadius: 8,
          border: '1px solid #666', background: 'transparent',
          color: '#888', cursor: 'pointer', fontSize: 12,
        }}
        whileHover={{ scale: 1.05, borderColor: '#aaa' }}
      >
        离开房间
      </motion.button>
    </motion.div>
  );
}

function PlayerSlot({ label, status, isMe }: {
  label: string;
  status: 'ready' | 'waiting';
  isMe?: boolean;
}) {
  const isReady = status === 'ready';
  return (
    <motion.div
      style={{
        width: 120, height: 120, borderRadius: 12,
        border: `2px ${isReady ? 'solid' : 'dashed'} ${isReady ? '#2ecc71' : '#444'}`,
        background: isReady ? 'rgba(46,204,113,0.1)' : 'rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 6,
      }}
      animate={!isReady ? { borderColor: ['#444', '#888', '#444'] } : {}}
      transition={{ duration: 1.5, repeat: Infinity }}
    >
      <span style={{ fontSize: 36 }}>{isReady ? (isMe ? '🧙' : '👤') : '❓'}</span>
      <span style={{
        color: isReady ? '#2ecc71' : '#666',
        fontSize: 11, fontFamily: '"Cinzel", serif',
      }}>
        {label}
      </span>
      <span style={{
        color: isReady ? '#2ecc71' : '#666', fontSize: 10,
      }}>
        {isReady ? '已就位' : '等待中…'}
      </span>
    </motion.div>
  );
}
