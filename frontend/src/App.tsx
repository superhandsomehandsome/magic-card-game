/**
 * 秘术对决 V6.0：喋血狂欢 — 主应用入口
 *
 * 流程: Lobby → (Room | AI Setup) → HeroSelect → GameBoard
 */
import { useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { HeroType } from './types/game';
import { useGameStore } from './store/gameStore';
import { Lobby, type LobbyMode } from './components/phases/Lobby';
import { Room } from './components/phases/Room';
import { HeroSelect } from './components/phases/HeroSelect';
import { GameBoard } from './components/board/GameBoard';
import { AIPlayer } from './core/AIPlayer';

type AppStage = 'LOBBY' | 'ROOM' | 'HERO_SELECT' | 'PLAYING';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function App() {
  const { gameState, initGame, setLocalPlayer, startGame } = useGameStore();
  const [stage, setStage] = useState<AppStage>('LOBBY');
  const [mode, setMode] = useState<LobbyMode | null>(null);
  const [roomCode, setRoomCode] = useState<string>('');

  // ═══════════════════════════════════════════════════════════
  //  阶段切换
  // ═══════════════════════════════════════════════════════════

  const handleLobbySelect = useCallback((m: LobbyMode, code?: string) => {
    setMode(m);
    if (m === 'CREATE_ROOM') {
      setRoomCode(generateRoomCode());
      setStage('ROOM');
    } else if (m === 'JOIN_ROOM') {
      setRoomCode(code || '');
      setStage('ROOM');
    } else if (m === 'VS_AI') {
      setStage('HERO_SELECT');
    }
  }, []);

  const handleRoomReady = useCallback(() => {
    setStage('HERO_SELECT');
  }, []);

  const handleLeaveRoom = useCallback(() => {
    setStage('LOBBY');
    setMode(null);
    setRoomCode('');
  }, []);

  const handleHeroSelected = useCallback((myHero: HeroType, opponentHero?: HeroType) => {
    const p1Id = uuid();
    const p2Id = uuid();

    // AI 模式: 对手随机选一个不同的英雄
    let oppHero = opponentHero;
    if (mode === 'VS_AI' && !oppHero) {
      const heroes = [HeroType.PHANTOM, HeroType.WEAVER, HeroType.INQUISITOR, HeroType.SINGER];
      const choices = heroes.filter(h => h !== myHero);
      oppHero = choices[Math.floor(Math.random() * choices.length)];
    }

    // 房间模式 (尚未接入真实 WebSocket): 先随机一个对手英雄占位
    if (!oppHero) {
      const heroes = [HeroType.PHANTOM, HeroType.WEAVER, HeroType.INQUISITOR, HeroType.SINGER];
      const choices = heroes.filter(h => h !== myHero);
      oppHero = choices[Math.floor(Math.random() * choices.length)];
    }

    initGame(p1Id, p2Id, myHero, oppHero);
    setLocalPlayer(p1Id);

    // AI 模式: 启动 AI 玩家代理 P2
    if (mode === 'VS_AI') {
      const engine = useGameStore.getState().engine;
      if (engine) {
        new AIPlayer(engine, p2Id);
      }
    }

    setStage('PLAYING');
    setTimeout(() => startGame(), 500);
  }, [mode, initGame, setLocalPlayer, startGame]);

  // ═══════════════════════════════════════════════════════════
  //  渲染
  // ═══════════════════════════════════════════════════════════

  if (stage === 'LOBBY') {
    return <Lobby onSelectMode={handleLobbySelect} />;
  }

  if (stage === 'ROOM' && (mode === 'CREATE_ROOM' || mode === 'JOIN_ROOM')) {
    return (
      <Room
        mode={mode}
        roomCode={roomCode}
        onReady={handleRoomReady}
        onLeave={handleLeaveRoom}
      />
    );
  }

  if (stage === 'HERO_SELECT') {
    const title = mode === 'VS_AI'
      ? '⛧ AI 对战 — 选择英雄 ⛧'
      : `⛧ 房间 ${roomCode} — 选择英雄 ⛧`;
    return (
      <HeroSelect
        mode="SOLO"
        onSelect={handleHeroSelected}
        title={title}
      />
    );
  }

  if (stage === 'PLAYING' && gameState) {
    return <GameBoard />;
  }

  return null;
}

export default App;
