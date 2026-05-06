/**
 * 英雄选择界面
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { HeroType } from '../../types/game';

interface HeroSelectProps {
  onSelect: (hero1: HeroType, hero2: HeroType) => void;
}

const HEROES = [
  {
    type: HeroType.PHANTOM,
    name: '奥术怪盗',
    title: 'Arcane Phantom',
    icon: '🎭',
    color: '#b8860b',
    desc: '被动：黑市无限购 + 额外抽牌',
    lore: '暗影中的窃贼，黑市的主宰',
  },
  {
    type: HeroType.WEAVER,
    name: '命运织梦者',
    title: 'Fate Weaver',
    icon: '🔮',
    color: '#9b59b6',
    desc: '主动：每回合掷命运骰生成虚影卡',
    lore: '编织命运之线，创造虚幻之牌',
  },
  {
    type: HeroType.INQUISITOR,
    name: '至高审判官',
    title: 'Supreme Inquisitor',
    icon: '⚖️',
    color: '#8b0000',
    desc: '大招：天平审判，裁剪对手手牌',
    lore: '绝对的裁决者，手牌即为律法',
  },
  {
    type: HeroType.SINGER,
    name: '以太歌者',
    title: 'Aether Singer',
    icon: '🎵',
    color: '#4488ff',
    desc: '大招：反转奏鸣曲，颠覆压制链',
    lore: '天地倒悬之歌，强弱逆转之音',
  },
];

export function HeroSelect({ onSelect }: HeroSelectProps) {
  const [p1Hero, setP1Hero] = useState<HeroType | null>(null);
  const [p2Hero, setP2Hero] = useState<HeroType | null>(null);
  const [selecting, setSelecting] = useState<1 | 2>(1);

  const handleSelect = (heroType: HeroType) => {
    if (selecting === 1) {
      setP1Hero(heroType);
      setSelecting(2);
    } else {
      setP2Hero(heroType);
    }
  };

  const handleConfirm = () => {
    if (p1Hero && p2Hero) {
      onSelect(p1Hero, p2Hero);
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
        gap: 32,
        padding: 32,
        background: 'radial-gradient(ellipse at center, #1a0b2e, #0d0018)',
      }}
    >
      <motion.h1
        style={{
          color: '#b8860b',
          fontFamily: '"Cinzel", serif',
          fontSize: 32,
          letterSpacing: 4,
          textShadow: '0 0 20px rgba(184,134,11,0.5)',
          margin: 0,
        }}
        animate={{ textShadow: ['0 0 20px rgba(184,134,11,0.3)', '0 0 40px rgba(184,134,11,0.7)', '0 0 20px rgba(184,134,11,0.3)'] }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        ⛧ 秘术对决 V6.0 ⛧
      </motion.h1>

      <div style={{ color: '#888', fontSize: 14 }}>
        {selecting === 1 ? '玩家 1 选择英雄' : '玩家 2 选择英雄'}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 20,
        maxWidth: 700,
      }}>
        {HEROES.map(hero => {
          const isP1Selected = p1Hero === hero.type;
          const isP2Selected = p2Hero === hero.type;
          const isDisabled = (selecting === 2 && isP1Selected);

          return (
            <motion.div
              key={hero.type}
              onClick={() => !isDisabled && handleSelect(hero.type)}
              style={{
                padding: 24,
                borderRadius: 16,
                border: `2px solid ${(isP1Selected || isP2Selected) ? hero.color : '#3a1f5e'}`,
                background: isDisabled
                  ? 'rgba(20,10,30,0.5)'
                  : 'linear-gradient(180deg, rgba(26,11,46,0.9), rgba(13,0,24,0.9))',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled ? 0.4 : 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                position: 'relative',
                overflow: 'hidden',
              }}
              whileHover={!isDisabled ? {
                scale: 1.03,
                boxShadow: `0 0 30px ${hero.color}40`,
                borderColor: hero.color,
              } : {}}
              whileTap={!isDisabled ? { scale: 0.97 } : {}}
            >
              <span style={{ fontSize: 48 }}>{hero.icon}</span>
              <div style={{ color: hero.color, fontSize: 18, fontWeight: 700, fontFamily: '"Cinzel", serif' }}>
                {hero.name}
              </div>
              <div style={{ color: '#666', fontSize: 11, fontStyle: 'italic' }}>
                {hero.title}
              </div>
              <div style={{ color: '#aaa', fontSize: 12, textAlign: 'center' }}>
                {hero.desc}
              </div>
              <div style={{ color: '#555', fontSize: 11, fontStyle: 'italic', textAlign: 'center' }}>
                "{hero.lore}"
              </div>

              {(isP1Selected || isP2Selected) && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    position: 'absolute',
                    top: 8, right: 8,
                    color: hero.color,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    border: `1px solid ${hero.color}`,
                  }}
                >
                  {isP1Selected ? 'P1' : 'P2'}
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      {p1Hero && p2Hero && (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleConfirm}
          style={{
            padding: '16px 48px',
            borderRadius: 8,
            border: '2px solid #ffd700',
            background: 'linear-gradient(180deg, #4a3a0a, #2a1f05)',
            color: '#ffd700',
            fontFamily: '"Cinzel", serif',
            fontWeight: 900,
            fontSize: 18,
            cursor: 'pointer',
            letterSpacing: 3,
          }}
          whileHover={{ scale: 1.05, boxShadow: '0 0 30px rgba(255,215,0,0.5)' }}
          whileTap={{ scale: 0.95 }}
        >
          ⚔ 开始对决 ⚔
        </motion.button>
      )}
    </motion.div>
  );
}
