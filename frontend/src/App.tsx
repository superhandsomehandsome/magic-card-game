/**
 * 秘术对决：禁忌魔典 — 主应用入口
 *
 * 流程: Lobby → (Room | AI Setup) → HeroSelect → PLAYING (GameBoard)
 *
 * 多人模式 (HOST/GUEST):
 *   - 双方先在 Room 中互相确认就位
 *   - 双方进入 HeroSelect 各自选择, 通过 OPPONENT_HERO 同步
 *   - HOST (slot=0) 收齐双方英雄后:
 *       1. 协商共享的 player1Id / player2Id (HOST 生成, 通过 NET_INIT 广播)
 *       2. 启用 HostSync 并在自己引擎上 startGame
 *       3. 通过 HostSync 不断把状态广播给 GUEST
 *   - GUEST (slot=1) 等待 HOST 的 NET_INIT, 拿到双方 ID 后:
 *       1. 启用 GuestSync, 不在本地运行引擎逻辑
 *       2. 仅以 STATE_SYNC 接收的状态作为渲染数据源
 *
 * AI 模式 / 单机: networkMode = LOCAL, 本地引擎直接运行
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuid } from 'uuid';
import { HeroType } from './types/game';
import { useGameStore } from './store/gameStore';
import { Lobby, type LobbyMode } from './components/phases/Lobby';
import { Room } from './components/phases/Room';
import { HeroSelect } from './components/phases/HeroSelect';
import { GameBoard } from './components/board/GameBoard';
import { AIPlayer } from './core/AIPlayer';
import {
  getSocket, emitHeroSelected, emitLeaveRoom, emitGameAction,
  type OpponentHeroPayload,
} from './net/socket';

type AppStage = 'LOBBY' | 'ROOM' | 'HERO_SELECT' | 'PLAYING';

interface NetInitEnvelope {
  kind: 'NET_INIT';
  p1Id: string;
  p2Id: string;
  hero1: HeroType;
  hero2: HeroType;
}

function App() {
  const {
    gameState, initGame, setLocalPlayer,
    setNetworkMode, enableHostSync, enableGuestSync, teardownSync,
  } = useGameStore();
  const [stage, setStage] = useState<AppStage>('LOBBY');
  const [mode, setMode] = useState<LobbyMode | null>(null);
  const [roomCode, setRoomCode] = useState<string>('');
  const [mySlot, setMySlot] = useState<0 | 1 | null>(null);
  const [opponentHero, setOpponentHero] = useState<HeroType | null>(null);
  const [myHero, setMyHero] = useState<HeroType | null>(null);
  const matchStartedRef = useRef(false);

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
  //  联网模式: GUEST 监听 HOST 发来的 NET_INIT
  // ═══════════════════════════════════════════════════════════

  useEffect(() => {
    if (mode !== 'JOIN_ROOM') return;
    const socket = getSocket();
    const handleGameAction = (msg: unknown) => {
      const env = msg as NetInitEnvelope | { kind: string };
      if (!env || env.kind !== 'NET_INIT') return;
      if (matchStartedRef.current) return;
      const init = env as NetInitEnvelope;
      matchStartedRef.current = true;

      // 客机: 启用 GuestSync 后再 init, 这样 init 内不订阅引擎事件
      enableGuestSync();
      initGame(init.p1Id, init.p2Id, init.hero1, init.hero2);
      setLocalPlayer(init.p2Id);
      setStage('PLAYING');
    };
    socket.on('GAME_ACTION', handleGameAction);
    return () => {
      socket.off('GAME_ACTION', handleGameAction);
    };
  }, [mode, enableGuestSync, initGame, setLocalPlayer]);

  // ═══════════════════════════════════════════════════════════
  //  联网模式: 双方都选好英雄即开战
  // ═══════════════════════════════════════════════════════════

  useEffect(() => {
    if (
      stage === 'HERO_SELECT' &&
      mode === 'CREATE_ROOM' &&
      myHero && opponentHero && mySlot === 0 &&
      !matchStartedRef.current
    ) {
      matchStartedRef.current = true;
      startNetworkedMatch(myHero, opponentHero);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, mode, myHero, opponentHero, mySlot]);

  /** HOST 端启动同步对局: 生成共享 ID + NET_INIT 广播 + 启用 HostSync */
  const startNetworkedMatch = (mineHero: HeroType, oppHero: HeroType) => {
    const p1Id = uuid();
    const p2Id = uuid();

    // HOST 一定是 slot 0 = P1
    setNetworkMode('HOST');
    initGame(p1Id, p2Id, mineHero, oppHero);
    setLocalPlayer(p1Id);

    // 启用主机同步层
    enableHostSync(p2Id);

    // 通知客机: 双方约定的玩家 ID + 英雄
    emitGameAction({
      kind: 'NET_INIT',
      p1Id,
      p2Id,
      hero1: mineHero,
      hero2: oppHero,
    });

    setStage('PLAYING');
    // 给客机一点时间收到 NET_INIT 再 startGame, 这样首批 STATE_SYNC 才会被对方接收
    setTimeout(() => {
      useGameStore.getState().startGame();
      const sync = useGameStore.getState().hostSync;
      sync?.pushFullState();
    }, 600);
  };

  // ═══════════════════════════════════════════════════════════
  //  阶段切换
  // ═══════════════════════════════════════════════════════════

  const handleLobbySelect = useCallback((m: LobbyMode, code?: string) => {
    setMode(m);
    setOpponentHero(null);
    setMyHero(null);
    matchStartedRef.current = false;
    teardownSync();
    if (m === 'CREATE_ROOM') {
      setStage('ROOM');
    } else if (m === 'JOIN_ROOM') {
      setRoomCode(code || '');
      setStage('ROOM');
    } else if (m === 'VS_AI') {
      setMySlot(0);
      setNetworkMode('LOCAL');
      setStage('HERO_SELECT');
    }
  }, [setNetworkMode, teardownSync]);

  const handleRoomReady = useCallback((code: string, slot: 0 | 1) => {
    setRoomCode(code);
    setMySlot(slot);
    setStage('HERO_SELECT');
  }, []);

  const handleLeaveRoom = useCallback(() => {
    if (mode === 'CREATE_ROOM' || mode === 'JOIN_ROOM') {
      emitLeaveRoom();
    }
    teardownSync();
    setNetworkMode('LOCAL');
    matchStartedRef.current = false;
    setStage('LOBBY');
    setMode(null);
    setRoomCode('');
    setMySlot(null);
    setOpponentHero(null);
    setMyHero(null);
  }, [mode, teardownSync, setNetworkMode]);

  const handleHeroSelected = useCallback((selectedHero: HeroType) => {
    setMyHero(selectedHero);

    // AI 模式: 立即开战
    if (mode === 'VS_AI') {
      try {
        const heroes = [HeroType.PHANTOM, HeroType.WEAVER, HeroType.INQUISITOR, HeroType.SINGER];
        const remaining = heroes.filter(h => h !== selectedHero);
        const aiHero = remaining[Math.floor(Math.random() * remaining.length)];

        const p1Id = uuid();
        const p2Id = uuid();
        setNetworkMode('LOCAL');
        initGame(p1Id, p2Id, selectedHero, aiHero);
        setLocalPlayer(p1Id);

        const engine = useGameStore.getState().engine;
        if (engine) {
          new AIPlayer(engine, p2Id);
        } else {
          console.error('[App] initGame 未创建 engine');
        }

        setStage('PLAYING');
        setTimeout(() => {
          useGameStore.getState().startGame();
        }, 500);
      } catch (err) {
        console.error('[App] AI game start failed:', err);
        alert('启动对局失败: ' + (err as Error).message);
      }
      return;
    }

    // 联网模式: 通知对手, 等对方也选好
    if (mode === 'CREATE_ROOM' || mode === 'JOIN_ROOM') {
      emitHeroSelected(selectedHero);
    }
  }, [mode, initGame, setLocalPlayer, setNetworkMode]);

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

    // 双方都选好但还没开局 (常见于 GUEST 等 HOST 发 NET_INIT)
    if (isOnline && myHero && opponentHero && stage === 'HERO_SELECT') {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', gap: 24, padding: 32,
          background: 'radial-gradient(ellipse at center, #1a0b2e, #0d0018)',
        }}>
          <h2 style={{ color: '#b8860b', fontFamily: '"Cinzel", serif' }}>
            ⚔ 对局即将开始 ⚔
          </h2>
          <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
            <div style={{ fontSize: 48 }}>{getHeroIcon(myHero)}</div>
            <div style={{ fontSize: 24, color: '#8b0000' }}>VS</div>
            <div style={{ fontSize: 48 }}>{getHeroIcon(opponentHero)}</div>
          </div>
          <p style={{ color: '#888' }}>
            {mySlot === 0 ? '正在准备对局…' : '等待主机开局…'}
          </p>
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

  if (stage === 'PLAYING' && !gameState) {
    // GUEST 在等首个 STATE_SYNC
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', gap: 24, padding: 32,
        background: 'radial-gradient(ellipse at center, #1a0b2e, #0d0018)',
        color: '#b8860b',
      }}>
        <h2 style={{ fontFamily: '"Cinzel", serif' }}>正在与主机同步对局…</h2>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: '3px solid #b8860b40', borderTopColor: '#b8860b',
          animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
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
