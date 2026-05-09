/**
 * 英雄选择 — 支持两种模式
 * 1. SOLO: 单人选择 (AI对战 / 进入房间后)
 * 2. LOCAL: 同设备双人选择 (本地对战测试)
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { HeroType } from '../../types/game';

export interface HeroSelectProps {
  /** SOLO=本人选, AI/对手由系统决定; LOCAL=同屏两个人选 */
  mode?: 'SOLO' | 'LOCAL';
  /** SOLO 时对手已经选好 (来自房间同步), 用于禁用相同英雄 */
  opponentHero?: HeroType | null;
  /** SOLO 时回传我的选择; LOCAL 时回传双方选择 */
  onSelect: (myHero: HeroType, opponentHero?: HeroType) => void;
  title?: string;
}

const HEROES = [
  { type: HeroType.PHANTOM, name: '奥术怪盗', title: 'Arcane Phantom', icon: '🎭', color: '#b8860b',
    desc: '被动：黑市无限购 + 额外抽牌', lore: '暗影中的窃贼，黑市的主宰' },
  { type: HeroType.WEAVER, name: '命运织梦者', title: 'Fate Weaver', icon: '🔮', color: '#9b59b6',
    desc: '主动：每回合掷命运骰生成虚影卡', lore: '编织命运之线，创造虚幻之牌' },
  { type: HeroType.INQUISITOR, name: '至高审判官', title: 'Supreme Inquisitor', icon: '⚖️', color: '#8b0000',
    desc: '大招：天平审判，裁剪对手手牌', lore: '绝对的裁决者，手牌即为律法' },
  { type: HeroType.SINGER, name: '以太歌者', title: 'Aether Singer', icon: '🎵', color: '#4488ff',
    desc: '大招：反转奏鸣曲，颠覆压制链', lore: '天地倒悬之歌，强弱逆转之音' },
];

export function HeroSelect({ mode = 'SOLO', opponentHero = null, onSelect, title }: HeroSelectProps) {
  const [myHero, setMyHero] = useState<HeroType | null>(null);
  const [otherHero, setOtherHero] = useState<HeroType | null>(null);
  const [selecting, setSelecting] = useState<1 | 2>(1);

  const isSolo = mode === 'SOLO';

  const handleClickHero = (heroType: HeroType) => {
    if (isSolo) {
      setMyHero(heroType);
      return;
    }
    // LOCAL: 双人轮选
    if (selecting === 1) {
      setMyHero(heroType);
      setSelecting(2);
    } else {
      if (heroType === myHero) return;
      setOtherHero(heroType);
    }
  };

  const handleConfirm = () => {
    if (!myHero) return;
    if (isSolo) {
      onSelect(myHero);
    } else if (otherHero) {
      onSelect(myHero, otherHero);
    }
  };

  const canConfirm = isSolo ? !!myHero : !!myHero && !!otherHero;

  const promptText = isSolo
    ? '选择你的英雄'
    : selecting === 1
      ? '玩家 1 — 选择英雄'
      : '玩家 2 — 选择英雄';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: 'calc(var(--vh, 1vh) * 100)',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        padding: '24px 16px 140px',
        background: 'radial-gradient(ellipse at center, #1a0b2e, #0d0018)',
      }}
    >
      <motion.h1
        style={{
          color: '#b8860b',
          fontFamily: '"Cinzel", serif',
          fontSize: 26,
          letterSpacing: 4,
          textShadow: '0 0 20px rgba(184,134,11,0.5)',
          margin: 0,
        }}
        animate={{
          textShadow: [
            '0 0 20px rgba(184,134,11,0.3)',
            '0 0 40px rgba(184,134,11,0.7)',
            '0 0 20px rgba(184,134,11,0.3)',
          ],
        }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        {title || '⛧ 选择英雄 ⛧'}
      </motion.h1>

      <div style={{
        color: '#aaa',
        fontSize: 13,
        marginTop: 8,
        marginBottom: 24,
        letterSpacing: 1,
      }}>
        {promptText}
      </div>

      {/* 英雄网格 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 14,
        width: '100%',
        maxWidth: 720,
      }}>
        {HEROES.map(hero => {
          const isMine = myHero === hero.type;
          const isOther = otherHero === hero.type || opponentHero === hero.type;
          const isOccupiedByOpponent = opponentHero === hero.type;
          const isLocked = isOccupiedByOpponent || (mode === 'LOCAL' && selecting === 2 && isMine);

          return (
            <motion.div
              key={hero.type}
              onClick={() => !isLocked && handleClickHero(hero.type)}
              style={{
                padding: 16,
                borderRadius: 12,
                border: `2px solid ${(isMine || isOther) ? hero.color : '#3a1f5e'}`,
                background: isLocked
                  ? 'rgba(20,10,30,0.5)'
                  : 'linear-gradient(180deg, rgba(26,11,46,0.9), rgba(13,0,24,0.9))',
                cursor: isLocked ? 'not-allowed' : 'pointer',
                opacity: isLocked ? 0.4 : 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                position: 'relative',
                overflow: 'hidden',
              }}
              whileHover={!isLocked ? {
                scale: 1.02,
                boxShadow: `0 0 25px ${hero.color}40`,
                borderColor: hero.color,
              } : {}}
              whileTap={!isLocked ? { scale: 0.97 } : {}}
            >
              <span style={{ fontSize: 36 }}>{hero.icon}</span>
              <div style={{
                color: hero.color,
                fontSize: 15,
                fontWeight: 700,
                fontFamily: '"Cinzel", serif',
              }}>
                {hero.name}
              </div>
              <div style={{ color: '#666', fontSize: 10, fontStyle: 'italic' }}>
                {hero.title}
              </div>
              <div style={{ color: '#aaa', fontSize: 11, textAlign: 'center', minHeight: 28 }}>
                {hero.desc}
              </div>
              <div style={{ color: '#555', fontSize: 10, fontStyle: 'italic', textAlign: 'center' }}>
                "{hero.lore}"
              </div>

              {(isMine || isOther) && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{
                    position: 'absolute',
                    top: 6, right: 6,
                    color: hero.color,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    border: `1px solid ${hero.color}`,
                    background: 'rgba(0,0,0,0.5)',
                  }}
                >
                  {isOccupiedByOpponent
                    ? '对手'
                    : isMine
                      ? (mode === 'LOCAL' ? 'P1' : '我')
                      : 'P2'}
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* 固定底部确认按钮 (移动端友好) */}
      <motion.div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '16px 24px 24px',
          background: 'linear-gradient(180deg, transparent, rgba(13,0,24,0.95) 30%)',
          display: 'flex',
          justifyContent: 'center',
          zIndex: 100,
        }}
      >
        <motion.button
          onClick={handleConfirm}
          disabled={!canConfirm}
          style={{
            padding: '14px 48px',
            borderRadius: 10,
            border: `2px solid ${canConfirm ? '#ffd700' : '#444'}`,
            background: canConfirm
              ? 'linear-gradient(180deg, #4a3a0a, #2a1f05)'
              : '#1a1a1a',
            color: canConfirm ? '#ffd700' : '#666',
            fontFamily: '"Cinzel", serif',
            fontWeight: 900,
            fontSize: 16,
            cursor: canConfirm ? 'pointer' : 'not-allowed',
            letterSpacing: 3,
            boxShadow: canConfirm ? '0 0 25px rgba(255,215,0,0.3)' : 'none',
          }}
          animate={canConfirm ? {
            boxShadow: [
              '0 0 15px rgba(255,215,0,0.3)',
              '0 0 30px rgba(255,215,0,0.6)',
              '0 0 15px rgba(255,215,0,0.3)',
            ],
          } : {}}
          transition={{ duration: 2, repeat: Infinity }}
          whileHover={canConfirm ? { scale: 1.05 } : {}}
          whileTap={canConfirm ? { scale: 0.95 } : {}}
        >
          ⚔ {isSolo ? '确认出战' : '开始对决'} ⚔
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
