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

    const localId = () => useGameStore.getState().localPlayerId;

    const onAmbushResolved = (data: { winnerId?: string | null; choice?: string }) => {
      const me = localId();
      if (data.choice === 'FOLD') {
        // 怯战：攻击方 = 自己 → 胜，否则 = 输
        if (data.winnerId === me) SFX.ambushWin();
        else SFX.defeat();
        return;
      }
      if (data.winnerId === me) SFX.ambushWin();
      else if (data.winnerId == null) SFX.colTie();
      else SFX.ambushLose();
    };

    const onScoreChanged = (data: { delta?: number; playerId?: string; source?: string }) => {
      const me = localId();
      const delta = data.delta || 0;
      // 负分用 error 音效
      if (delta < 0) {
        SFX.error();
        return;
      }
      if (data.playerId === me) {
        if (delta >= 30) SFX.scoreBig();
        else SFX.score();
      } else {
        // 对手得分用低沉提示
        SFX.colFlip();
      }
    };

    const onGameOver = (data: { winnerId: string }) => {
      if (data.winnerId === localId()) SFX.victory();
      else SFX.defeat();
    };

    const onHeroAbility = () => {
      SFX.screenShake();
    };

    // 监听 ACTION_QUEUED 派发更细的音效（黑市买、封锁、对撞、瞬等）
    const onActionQueued = (action: { type: string; payload?: Record<string, unknown> }) => {
      switch (action.type) {
        case 'VFX_BURN':
          SFX.buy(); break;
        case 'BLOCKADE_CHAIN':
          SFX.lockdown(); break;
        case 'FLASH_SWAP':
          SFX.darkMarket(); break;
        case 'COLLISION_CLASH':
        case 'CARD_CLASH':
          SFX.colFlip(); break;
        case 'AMBUSH_FOLD':
          SFX.defeat(); break;
        case 'AMBUSH_BLUFF':
          SFX.error(); SFX.screenShake(); break;
        case 'VFX_REVERSE':
          SFX.inversion(); break;
        case 'BOUNTY_RETAINED':
          SFX.colTie(); break;
        case 'PHANTOM_COIN':
          SFX.buy(); break;
        case 'FATE_DICE':
          SFX.diceRoll(); break;
        case 'SLOW_MOTION':
          SFX.colStart(); break;
        case 'COMBO_HIGHLIGHT': {
          const score = (action.payload?.score as number) || 0;
          if (score >= 30) SFX.scoreBig();
          break;
        }
      }
    };

    engine.on('AMBUSH_RESOLVED', onAmbushResolved);
    engine.on('SCORE_CHANGED', onScoreChanged);
    engine.on('GAME_OVER', onGameOver);
    engine.on('HERO_ABILITY_USED', onHeroAbility);
    engine.on('ACTION_QUEUED', onActionQueued);

    return () => {
      engine.off('AMBUSH_RESOLVED', onAmbushResolved);
      engine.off('SCORE_CHANGED', onScoreChanged);
      engine.off('GAME_OVER', onGameOver);
      engine.off('HERO_ABILITY_USED', onHeroAbility);
      engine.off('ACTION_QUEUED', onActionQueued);
    };
  }, [engine]);
}
