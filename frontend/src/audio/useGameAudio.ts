/**
 * 游戏音频 Hook — 监听引擎事件自动播放对应音效
 */
import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { GamePhase } from '../types/game';
import { SFX, playBGM } from './AudioManager';

export function useGameAudio() {
  const engine = useGameStore(s => s.engine);
  const gameState = useGameStore(s => s.gameState);
  const prevPhaseRef = useRef<GamePhase | null>(null);
  const prevTimerRef = useRef<number>(0);

  // 尝试启动 BGM（需要用户交互后才能播放）
  useEffect(() => {
    const startBGM = () => {
      playBGM();
      document.removeEventListener('click', startBGM);
      document.removeEventListener('keydown', startBGM);
    };
    document.addEventListener('click', startBGM);
    document.addEventListener('keydown', startBGM);
    return () => {
      document.removeEventListener('click', startBGM);
      document.removeEventListener('keydown', startBGM);
    };
  }, []);

  // 阶段切换触发音效
  useEffect(() => {
    if (!gameState) return;
    const phase = gameState.phase;
    const prev = prevPhaseRef.current;
    if (phase === prev) return;
    prevPhaseRef.current = phase;

    switch (phase) {
      case GamePhase.BOUNTY_ROLL:
        SFX.diceRoll();
        break;
      case GamePhase.DRAW_MARKET:
        SFX.draw();
        break;
      case GamePhase.AMBUSH_DECLARE:
        SFX.ambush();
        break;
      case GamePhase.CHANT_SCORE:
        SFX.score();
        break;
      case GamePhase.BLOCKADE_END:
        SFX.lockdown();
        break;
      case GamePhase.COLLISION:
        SFX.colArrange();
        break;
      case GamePhase.GAME_OVER:
        // 胜负音效由 VictoryScreen 或引擎事件触发
        break;
    }
  }, [gameState?.phase]);

  // 倒计时最后5秒滴答声
  useEffect(() => {
    if (!gameState) return;
    const timer = gameState.timer;
    const prevTimer = prevTimerRef.current;
    prevTimerRef.current = timer;
    if (timer <= 5000 && timer > 0 && prevTimer > timer) {
      SFX.timerTick();
    }
  }, [gameState?.timer]);

  // 监听引擎事件
  useEffect(() => {
    if (!engine) return;

    const onAmbushResolved = (data: { winnerId?: string }) => {
      if (data.winnerId) SFX.ambushWin();
      else SFX.colTie();
    };

    const onScoreChanged = (data: { delta?: number }) => {
      if (data.delta && data.delta >= 30) SFX.scoreBig();
      else SFX.score();
    };

    const onGameOver = (data: { winnerId: string }) => {
      const localId = useGameStore.getState().localPlayerId;
      if (data.winnerId === localId) SFX.victory();
      else SFX.defeat();
    };

    const onHeroAbility = () => {
      SFX.screenShake();
    };

    engine.on('AMBUSH_RESOLVED', onAmbushResolved);
    engine.on('SCORE_CHANGED', onScoreChanged);
    engine.on('GAME_OVER', onGameOver);
    engine.on('HERO_ABILITY_USED', onHeroAbility);

    return () => {
      engine.off('AMBUSH_RESOLVED', onAmbushResolved);
      engine.off('SCORE_CHANGED', onScoreChanged);
      engine.off('GAME_OVER', onGameOver);
      engine.off('HERO_ABILITY_USED', onHeroAbility);
    };
  }, [engine]);
}
