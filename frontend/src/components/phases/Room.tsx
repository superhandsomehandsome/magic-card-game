/**
 * 房间界面 — 房间号显示 / 玩家就位 / 准备进入英雄选择
 *
 * 当前为本地模拟房间 (无后端 WebSocket)。
 * 后续接入 Socket.IO 时只需替换 useEffect 中的模拟逻辑即可。
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface RoomProps {
  mode: 'CREATE_ROOM' | 'JOIN_ROOM';
  roomCode: string;
  onReady: () => void;
  onLeave: () => void;
}

export function Room({ mode, roomCode, onReady, onLeave }: RoomProps) {
  const [opponentJoined, setOpponentJoined] = useState(mode === 'JOIN_ROOM');
  const [copied, setCopied] = useState(false);

  // 模拟对手加入 (3秒后, 仅本地占位)
  useEffect(() => {
    if (mode === 'CREATE_ROOM' && !opponentJoined) {
      const t = setTimeout(() => setOpponentJoined(true), 3000);
      return () => clearTimeout(t);
    }
  }, [mode, opponentJoined]);

  // 双方就位后自动进入英雄选择
  useEffect(() => {
    if (opponentJoined) {
      const t = setTimeout(() => onReady(), 1200);
      return () => clearTimeout(t);
    }
  }, [opponentJoined, onReady]);

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 32,
        gap: 32,
        background: 'radial-gradient(ellipse at center, #1a0b2e, #0d0018)',
      }}
    >
      <motion.h2
        style={{
          color: '#b8860b',
          fontFamily: '"Cinzel", serif',
          fontSize: 28,
          margin: 0,
          letterSpacing: 4,
        }}
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        {mode === 'CREATE_ROOM' ? '⛧ 召唤之圈 ⛧' : '⛧ 进入秘境 ⛧'}
      </motion.h2>

      {/* 房间号显示 */}
      <motion.div
        style={{
          padding: '24px 48px',
          borderRadius: 16,
          border: '2px solid #b8860b',
          background: 'linear-gradient(180deg, rgba(26,11,46,0.9), rgba(13,0,24,0.9))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          minWidth: 280,
          cursor: mode === 'CREATE_ROOM' ? 'pointer' : 'default',
        }}
        onClick={mode === 'CREATE_ROOM' ? handleCopy : undefined}
        whileHover={mode === 'CREATE_ROOM' ? {
          boxShadow: '0 0 30px rgba(184,134,11,0.4)',
        } : {}}
      >
        <div style={{ color: '#888', fontSize: 12, letterSpacing: 2 }}>房间号</div>
        <div style={{
          color: '#ffd700',
          fontSize: 48,
          fontWeight: 900,
          fontFamily: 'monospace',
          letterSpacing: 8,
          textShadow: '0 0 20px rgba(255,215,0,0.5)',
        }}>
          {roomCode}
        </div>
        {mode === 'CREATE_ROOM' && (
          <div style={{ color: copied ? '#2ecc71' : '#666', fontSize: 11, marginTop: 4 }}>
            {copied ? '✓ 已复制' : '点击复制 · 分享给对手'}
          </div>
        )}
      </motion.div>

      {/* 玩家槽位 */}
      <div style={{
        display: 'flex',
        gap: 16,
        alignItems: 'center',
      }}>
        <PlayerSlot label="玩家 1" status="ready" />
        <span style={{ color: '#444', fontSize: 24 }}>VS</span>
        <PlayerSlot
          label="玩家 2"
          status={opponentJoined ? 'ready' : 'waiting'}
        />
      </div>

      {/* 状态提示 */}
      <motion.div
        style={{
          color: opponentJoined ? '#2ecc71' : '#b8860b',
          fontSize: 14,
          fontFamily: '"Cinzel", serif',
        }}
        animate={!opponentJoined ? { opacity: [0.4, 1, 0.4] } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        {opponentJoined
          ? '✓ 双方就位 — 即将进入英雄选择'
          : '等待对手加入…'}
      </motion.div>

      {/* 离开 */}
      <motion.button
        onClick={onLeave}
        style={{
          padding: '8px 24px',
          borderRadius: 8,
          border: '1px solid #666',
          background: 'transparent',
          color: '#888',
          cursor: 'pointer',
          fontSize: 12,
        }}
        whileHover={{ scale: 1.05, borderColor: '#aaa' }}
      >
        离开房间
      </motion.button>
    </motion.div>
  );
}

function PlayerSlot({ label, status }: { label: string; status: 'ready' | 'waiting' }) {
  const isReady = status === 'ready';
  return (
    <motion.div
      style={{
        width: 120,
        height: 120,
        borderRadius: 12,
        border: `2px ${isReady ? 'solid' : 'dashed'} ${isReady ? '#2ecc71' : '#444'}`,
        background: isReady
          ? 'rgba(46,204,113,0.1)'
          : 'rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
      animate={!isReady ? {
        borderColor: ['#444', '#888', '#444'],
      } : {}}
      transition={{ duration: 1.5, repeat: Infinity }}
    >
      <span style={{ fontSize: 36 }}>
        {isReady ? '🧙' : '❓'}
      </span>
      <span style={{
        color: isReady ? '#2ecc71' : '#666',
        fontSize: 11,
        fontFamily: '"Cinzel", serif',
      }}>
        {label}
      </span>
      <span style={{
        color: isReady ? '#2ecc71' : '#666',
        fontSize: 10,
      }}>
        {isReady ? '已就位' : '等待中…'}
      </span>
    </motion.div>
  );
}
