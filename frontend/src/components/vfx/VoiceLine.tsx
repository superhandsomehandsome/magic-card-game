/**
 * 英雄台词浮出组件
 * 在大招释放、英雄选择、斩杀胜利等时机自动显示台词气泡
 * 后期接入 TTS/音频文件时，只需在此组件中调用 Audio API
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HeroType, HERO_VOICE_LINES } from '../../types/game';
import type { IHeroVoiceLine } from '../../types/game';
import { useGameStore } from '../../store/gameStore';

type VoiceLineTrigger = keyof IHeroVoiceLine;

interface VoiceLineDisplay {
  id: number;
  hero: HeroType;
  text: string;
  trigger: VoiceLineTrigger;
}

let lineId = 0;

export function VoiceLineLayer() {
  const [activeLine, setActiveLine] = useState<VoiceLineDisplay | null>(null);
  const gameState = useGameStore(s => s.gameState);
  const engine = useGameStore(s => s.engine);

  const showVoiceLine = useCallback((hero: HeroType, trigger: VoiceLineTrigger) => {
    const lines = HERO_VOICE_LINES[hero];
    const text = lines[trigger];
    if (!text) return;

    const display: VoiceLineDisplay = {
      id: ++lineId,
      hero,
      text,
      trigger,
    };

    setActiveLine(display);

    // 未来扩展: 在此处调用 audioManager.playVoice(hero, trigger)
    // audioManager.play(`/voices/${hero}/${trigger}.mp3`);

    setTimeout(() => {
      setActiveLine(prev => prev?.id === display.id ? null : prev);
    }, 3000);
  }, []);

  // 监听引擎事件
  useEffect(() => {
    if (!engine) return;

    const handleAbilityUsed = (data: { playerId: string; hero: HeroType }) => {
      showVoiceLine(data.hero, 'onUltimate');
    };

    const handleGameOver = (data: { winnerId: string }) => {
      if (!gameState) return;
      const winner = gameState.players[data.winnerId];
      if (winner) {
        showVoiceLine(winner.hero, 'onKill');
      }
    };

    engine.on('HERO_ABILITY_USED', handleAbilityUsed);
    engine.on('GAME_OVER', handleGameOver);

    return () => {
      engine.off('HERO_ABILITY_USED', handleAbilityUsed);
      engine.off('GAME_OVER', handleGameOver);
    };
  }, [engine, gameState, showVoiceLine]);

  return (
    <AnimatePresence>
      {activeLine && (
        <motion.div
          key={activeLine.id}
          initial={{ opacity: 0, y: 30, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          style={{
            position: 'fixed',
            bottom: 180,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9998,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            maxWidth: 500,
          }}
        >
          {/* 英雄图标 */}
          <div style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: getHeroGradient(activeLine.hero),
            border: `2px solid ${getHeroColor(activeLine.hero)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            flexShrink: 0,
            boxShadow: `0 0 15px ${getHeroColor(activeLine.hero)}60`,
          }}>
            {getHeroIcon(activeLine.hero)}
          </div>

          {/* 台词气泡 */}
          <motion.div
            style={{
              background: 'rgba(13, 0, 24, 0.95)',
              border: `1px solid ${getHeroColor(activeLine.hero)}60`,
              borderRadius: 12,
              padding: '10px 18px',
              position: 'relative',
              boxShadow: `0 4px 20px rgba(0,0,0,0.6), 0 0 10px ${getHeroColor(activeLine.hero)}20`,
            }}
            animate={{
              borderColor: [`${getHeroColor(activeLine.hero)}60`, `${getHeroColor(activeLine.hero)}`, `${getHeroColor(activeLine.hero)}60`],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {/* 三角指示 */}
            <div style={{
              position: 'absolute',
              left: -6,
              top: '50%',
              transform: 'translateY(-50%) rotate(45deg)',
              width: 12,
              height: 12,
              background: 'rgba(13, 0, 24, 0.95)',
              borderLeft: `1px solid ${getHeroColor(activeLine.hero)}60`,
              borderBottom: `1px solid ${getHeroColor(activeLine.hero)}60`,
            }} />

            <p style={{
              color: '#e0e0e0',
              fontSize: 14,
              fontStyle: 'italic',
              margin: 0,
              lineHeight: 1.5,
              fontFamily: '"Cinzel", serif',
            }}>
              "{activeLine.text}"
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// 可从外部触发台词 (如英雄选择页)
export function triggerVoiceLine(_hero: HeroType, _trigger: VoiceLineTrigger): void {
  // 通过全局事件总线触发 — 预留接口
}

function getHeroColor(hero: HeroType): string {
  const colors: Record<HeroType, string> = {
    [HeroType.PHANTOM]: '#b8860b',
    [HeroType.WEAVER]: '#9b59b6',
    [HeroType.INQUISITOR]: '#8b0000',
    [HeroType.SINGER]: '#4488ff',
  };
  return colors[hero];
}

function getHeroGradient(hero: HeroType): string {
  const color = getHeroColor(hero);
  return `radial-gradient(circle, ${color}40, ${color}10)`;
}

function getHeroIcon(hero: HeroType): string {
  const icons: Record<HeroType, string> = {
    [HeroType.PHANTOM]: '🎭',
    [HeroType.WEAVER]: '🔮',
    [HeroType.INQUISITOR]: '⚖️',
    [HeroType.SINGER]: '🎵',
  };
  return icons[hero];
}
