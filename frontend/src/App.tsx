/**
 * 秘术对决 V6.0：喋血狂欢 — 主应用入口
 *
 * 流程: Lobby → (Room | AI Setup) → HeroSelect → GameBoard
 *
 * 多人模式: Room 通过 Socket.IO 同步双方加入与英雄选择
 * AI 模式: 本地 AIPlayer 代理 P2
 */
import { useState, useCallback, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import { HeroType } from './types/game';
import { useGameStore } from './store/gameStore';
import { Lobby, type LobbyMode } from './components/phases/Lobby';
import { Room } from './components/phases/Room';
import { HeroSelect } from './components/phases/HeroSelect';
import { GameBoard } from './components/board/GameBoard';
import { AIPlayer } from './core/AIPlayer';
import {
  getSocket, emitHeroSelected, emitLeaveRoom,
  type OpponentHeroPayload,
} from './net/socket';

type AppStage = 'LOBBY' | 'ROOM' | 'HERO_SELECT' | 'PLAYING';

function App() {
  const { gameState, initGame, setLocalPlayer, startGame } = useGameStore();
  const [stage, setStage] = useState<AppStage>('LOBBY');
  const [mode, setMode] = useState<LobbyMode | null>(null);
  const [roomCode, setRoomCode] = useState<string>('');
  const [mySlot, setMySlot] = useState<0 | 1 | null>(null);
  const [opponentHero, setOpponentHero] = useState<HeroType | null>(null);
  const [myHero, setMyHero] = useState<HeroType | null>(null);

  // ═══════════════════════════════════════════════════════════
  //  联网模式: 监听对手英雄选择
  // ═══════════════════════════════════════════════════════════

  useEffect(() => {
    if (mode !== 'CREATE_ROOM' && mode !== 'JOIN_ROOM') return;
    const socket = getSocket();
    const handleOpponentHero = (data: OpponentHeroPayload) => {
      setOpponentHero(data.hero);
    };
    socket.on('OPPONENT_HERO', handleOpponentHero);
    return () => {
      socket.off('OPPONENT_HERO', handleOpponentHero);
    };
  }, [mode]);

  // ═══════════════════════════════════════════════════════════
  //  联网模式: 双方都选好英雄即开战
  // ═══════════════════════════════════════════════════════════

  useEffect(() => {
    if (
      stage === 'HERO_SELECT' &&
      (mode === 'CREATE_ROOM' || mode === 'JOIN_ROOM') &&
      myHero && opponentHero && mySlot !== null
    ) {
      startNetworkedMatch(myHero, opponentHero, mySlot);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, mode, myHero, opponentHero, mySlot]);

  const startNetworkedMatch = (mine: HeroType, opp: HeroType, slot: 0 | 1) => {
    const p1Id = uuid();
    const p2Id = uuid();

    const myId = slot === 0 ? p1Id : p2Id;
    const oppId = slot === 0 ? p2Id : p1Id;

    // 始终将 slot=0 视为先手 (P1)
    initGame(p1Id, p2Id, slot === 0 ? mine : opp, slot === 0 ? opp : mine);
    setLocalPlayer(myId);
    setStage('PLAYING');
    setTimeout(() => startGame(), 500);
    // 注: 真实多人对战的指令同步将由 GameEngine 通过 Socket 转发实现
    //     现阶段双方各自独立运行引擎 (待后续接入指令转发层)
    void oppId;
  };

  // ═══════════════════════════════════════════════════════════
  //  阶段切换
  // ═══════════════════════════════════════════════════════════

  const handleLobbySelect = useCallback((m: LobbyMode, code?: string) => {
    setMode(m);
    setOpponentHero(null);
    setMyHero(null);
    if (m === 'CREATE_ROOM') {
      setStage('ROOM');
    } else if (m === 'JOIN_ROOM') {
      setRoomCode(code || '');
      setStage('ROOM');
    } else if (m === 'VS_AI') {
      setMySlot(0);
      setStage('HERO_SELECT');
    }
  }, []);

  const handleRoomReady = useCallback((code: string, slot: 0 | 1) => {
    setRoomCode(code);
    setMySlot(slot);
    setStage('HERO_SELECT');
  }, []);

  const handleLeaveRoom = useCallback(() => {
    if (mode === 'CREATE_ROOM' || mode === 'JOIN_ROOM') {
      emitLeaveRoom();
    }
    setStage('LOBBY');
    setMode(null);
    setRoomCode('');
    setMySlot(null);
    setOpponentHero(null);
    setMyHero(null);
  }, [mode]);

  const handleHeroSelected = useCallback((selectedHero: HeroType) => {
    setMyHero(selectedHero);

    // AI 模式: 立即开战
    if (mode === 'VS_AI') {
      const heroes = [HeroType.PHANTOM, HeroType.WEAVER, HeroType.INQUISITOR, HeroType.SINGER];
      const aiHero = heroes.filter(h => h !== selectedHero)[
        Math.floor(Math.random() * (heroes.length - 1))
      ];

      const p1Id = uuid();
      const p2Id = uuid();
      initGame(p1Id, p2Id, selectedHero, aiHero);
      setLocalPlayer(p1Id);

      const engine = useGameStore.getState().engine;
      if (engine) new AIPlayer(engine, p2Id);

      setStage('PLAYING');
      setTimeout(() => startGame(), 500);
      return;
    }

    // 联网模式: 通知对手, 等对方也选好
    if (mode === 'CREATE_ROOM' || mode === 'JOIN_ROOM') {
      emitHeroSelected(selectedHero);
    }
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
        initialRoomCode={mode === 'JOIN_ROOM' ? roomCode : undefined}
        onReady={handleRoomReady}
        onLeave={handleLeaveRoom}
      />
    );
  }

  if (stage === 'HERO_SELECT') {
    const isOnline = mode === 'CREATE_ROOM' || mode === 'JOIN_ROOM';
    const title = mode === 'VS_AI'
      ? '⛧ AI 对战 — 选择英雄 ⛧'
      : `⛧ 房间 ${roomCode} — 选择英雄 ⛧`;

    // 选完后等待对手
    if (isOnline && myHero && !opponentHero) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', gap: 24, padding: 32,
          background: 'radial-gradient(ellipse at center, #1a0b2e, #0d0018)',
        }}>
          <h2 style={{ color: '#b8860b', fontFamily: '"Cinzel", serif' }}>
            ✓ 你已选择
          </h2>
          <div style={{ fontSize: 48 }}>{getHeroIcon(myHero)}</div>
          <p style={{ color: '#888' }}>等待对手选择英雄…</p>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '3px solid #b8860b40', borderTopColor: '#b8860b',
            animation: 'spin 1s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }

    return (
      <HeroSelect
        mode="SOLO"
        opponentHero={opponentHero}
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

function getHeroIcon(hero: HeroType): string {
  return {
    [HeroType.PHANTOM]: '🎭',
    [HeroType.WEAVER]: '🔮',
    [HeroType.INQUISITOR]: '⚖️',
    [HeroType.SINGER]: '🎵',
  }[hero];
}

export default App;
