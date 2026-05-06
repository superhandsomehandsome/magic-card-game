/**
 * 大厅菜单 — 三种入口模式
 * 1. 创建房间 (CREATE_ROOM): 生成房间号等待对手加入
 * 2. 加入房间 (JOIN_ROOM): 输入房间号加入
 * 3. AI 对战 (VS_AI): 立即与电脑对战
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type LobbyMode = 'CREATE_ROOM' | 'JOIN_ROOM' | 'VS_AI';

interface LobbyProps {
  onSelectMode: (mode: LobbyMode, roomCode?: string) => void;
}

export function Lobby({ onSelectMode }: LobbyProps) {
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState('');

  const handleJoin = () => {
    if (roomCodeInput.trim().length >= 3) {
      onSelectMode('JOIN_ROOM', roomCodeInput.trim());
      setShowJoinModal(false);
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
        background: 'radial-gradient(ellipse at center, #1a0b2e, #0d0018)',
      }}
    >
      <motion.h1
        style={{
          color: '#b8860b',
          fontFamily: '"Cinzel", serif',
          fontSize: 42,
          letterSpacing: 6,
          textShadow: '0 0 30px rgba(184,134,11,0.6)',
          margin: 0,
          marginBottom: 12,
        }}
        animate={{
          textShadow: [
            '0 0 20px rgba(184,134,11,0.4)',
            '0 0 50px rgba(184,134,11,0.8)',
            '0 0 20px rgba(184,134,11,0.4)',
          ],
        }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        ⛧ 秘术对决：禁忌魔典 ⛧
      </motion.h1>

      <p style={{
        color: '#888',
        fontSize: 14,
        letterSpacing: 4,
        fontFamily: '"Cinzel", serif',
        marginBottom: 40,
      }}>
        禁忌魔典
      </p>

      {/* 三大入口 */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        width: '100%',
        maxWidth: 320,
      }}>
        <ModeButton
          icon="🎲"
          label="创建房间"
          subtitle="生成房号等待对手加入"
          color="#b8860b"
          onClick={() => onSelectMode('CREATE_ROOM')}
        />
        <ModeButton
          icon="🚪"
          label="加入房间"
          subtitle="输入房号与好友对战"
          color="#9b59b6"
          onClick={() => setShowJoinModal(true)}
        />
        <ModeButton
          icon="🤖"
          label="AI 对战"
          subtitle="立即开始 — 对战智能 AI"
          color="#4488ff"
          onClick={() => onSelectMode('VS_AI')}
        />
      </div>

      <p style={{
        color: '#444',
        fontSize: 11,
        marginTop: 40,
        fontStyle: 'italic',
      }}>
        暗影中的契约，自此立下…
      </p>

      {/* 加入房间弹窗 */}
      <AnimatePresence>
        {showJoinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowJoinModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'linear-gradient(180deg, #1a0b2e, #0d0018)',
                border: '2px solid #9b59b6',
                borderRadius: 16,
                padding: 32,
                minWidth: 340,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                alignItems: 'center',
              }}
            >
              <h3 style={{
                color: '#9b59b6',
                fontFamily: '"Cinzel", serif',
                margin: 0,
                fontSize: 20,
              }}>
                🚪 加入房间
              </h3>
              <input
                autoFocus
                type="text"
                value={roomCodeInput}
                onChange={e => setRoomCodeInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                placeholder="输入房间号"
                maxLength={8}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: 8,
                  border: '1px solid #9b59b6',
                  background: 'rgba(0,0,0,0.4)',
                  color: '#ffd700',
                  fontSize: 22,
                  fontFamily: 'monospace',
                  letterSpacing: 4,
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 12, width: '100%' }}>
                <motion.button
                  onClick={handleJoin}
                  disabled={roomCodeInput.trim().length < 3}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: 8,
                    border: '1px solid #9b59b6',
                    background: roomCodeInput.trim().length >= 3
                      ? 'linear-gradient(180deg, #4a2a6e, #2a1a3e)'
                      : '#222',
                    color: '#9b59b6',
                    fontWeight: 700,
                    cursor: roomCodeInput.trim().length >= 3 ? 'pointer' : 'not-allowed',
                    opacity: roomCodeInput.trim().length >= 3 ? 1 : 0.5,
                  }}
                  whileHover={roomCodeInput.trim().length >= 3 ? { scale: 1.03 } : {}}
                >
                  确认加入
                </motion.button>
                <motion.button
                  onClick={() => setShowJoinModal(false)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: '1px solid #666',
                    background: 'transparent',
                    color: '#888',
                    cursor: 'pointer',
                  }}
                  whileHover={{ scale: 1.03 }}
                >
                  取消
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ModeButton({ icon, label, subtitle, color, onClick }: {
  icon: string;
  label: string;
  subtitle: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      style={{
        padding: '18px 24px',
        borderRadius: 12,
        border: `2px solid ${color}40`,
        background: 'linear-gradient(180deg, rgba(26,11,46,0.9), rgba(13,0,24,0.9))',
        color: '#e0e0e0',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        textAlign: 'left',
      }}
      whileHover={{
        scale: 1.03,
        borderColor: color,
        boxShadow: `0 0 25px ${color}40`,
      }}
      whileTap={{ scale: 0.97 }}
    >
      <span style={{ fontSize: 28 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{
          color,
          fontSize: 16,
          fontWeight: 700,
          fontFamily: '"Cinzel", serif',
          letterSpacing: 1,
        }}>
          {label}
        </div>
        <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
          {subtitle}
        </div>
      </div>
      <span style={{ color: color, fontSize: 16 }}>›</span>
    </motion.button>
  );
}
