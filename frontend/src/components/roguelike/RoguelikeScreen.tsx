/**
 * Roguelike 主界面 — 调度地图、战斗、奖励、商店、事件、休息
 */
import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { v4 as uuid } from 'uuid';
import { useRoguelikeStore } from '../../store/roguelikeStore';
import { useGameStore } from '../../store/gameStore';
import { RoguelikeMap } from './RoguelikeMap';
import { RewardScreen } from './RewardScreen';
import { ShopScreen } from './ShopScreen';
import { EventScreen } from './EventScreen';
import { GameBoard } from '../board/GameBoard';
import { HeroType } from '../../types/game';
import { AIPlayer } from '../../core/AIPlayer';
import { ROGUELIKE_CONSTANTS } from '../../types/roguelike';

interface RoguelikeScreenProps {
  onExit: () => void;
}

export function RoguelikeScreen({ onExit }: RoguelikeScreenProps) {
  const run = useRoguelikeStore(s => s.run);
  const selectNode = useRoguelikeStore(s => s.selectNode);
  const getReachableNodes = useRoguelikeStore(s => s.getReachableNodes);
  const onBattleEnd = useRoguelikeStore(s => s.onBattleEnd);
  const restHeal = useRoguelikeStore(s => s.restHeal);
  const abandonRun = useRoguelikeStore(s => s.abandonRun);
  const returnToMap = useRoguelikeStore(s => s.returnToMap);
  const { gameState, initGame, setLocalPlayer, setNetworkMode } = useGameStore();
  const [battleActive, setBattleActive] = useState(false);

  // Monitor battle end
  useEffect(() => {
    if (!battleActive || !gameState) return;
    if (gameState.phase !== 'GAME_OVER') return;

    const localId = useGameStore.getState().localPlayerId;
    const localPlayer = gameState.players[localId];
    const oppId = Object.keys(gameState.players).find(id => id !== localId)!;
    const oppPlayer = gameState.players[oppId];

    if (!localPlayer || !oppPlayer) return;

    const won = localPlayer.score > oppPlayer.score;
    const scoreDiff = Math.abs(localPlayer.score - oppPlayer.score);

    // Delay to let victory screen show briefly
    const timer = setTimeout(() => {
      setBattleActive(false);
      useGameStore.getState().quitToMenu();
      onBattleEnd(won, scoreDiff);
    }, 2500);

    return () => clearTimeout(timer);
  }, [battleActive, gameState, onBattleEnd]);

  const startBattle = useCallback(() => {
    if (!run || !run.currentEnemy) return;

    const p1Id = uuid();
    const p2Id = uuid();
    const enemy = run.currentEnemy;

    setNetworkMode('LOCAL');
    initGame(p1Id, p2Id, run.heroType, enemy.hero);
    setLocalPlayer(p1Id);

    const engine = useGameStore.getState().engine;
    if (engine) {
      // Configure engine for roguelike quick mode
      engine.mutateState(s => {
        (s as any).__roguelikeWinScore = enemy.winScore;
      });

      new AIPlayer(engine, p2Id, {
        aggression: enemy.aggression,
        skill: enemy.skill,
      });
    }

    setBattleActive(true);
    setTimeout(() => {
      useGameStore.getState().startGame();
    }, 500);
  }, [run, initGame, setLocalPlayer, setNetworkMode]);

  if (!run) return null;

  // Battle phase — render the game board
  if (run.phase === 'BATTLE' && battleActive && gameState) {
    return <GameBoard />;
  }

  // Battle phase — pre-battle screen
  if (run.phase === 'BATTLE' && !battleActive && run.currentEnemy) {
    return (
      <ScreenContainer>
        <PreBattleScreen
          enemy={run.currentEnemy}
          heroType={run.heroType}
          onStart={startBattle}
        />
      </ScreenContainer>
    );
  }

  // Reward phase
  if (run.phase === 'REWARD') {
    return (
      <ScreenContainer>
        <RewardScreen />
      </ScreenContainer>
    );
  }

  // Shop phase
  if (run.phase === 'SHOP') {
    return (
      <ScreenContainer>
        <ShopScreen onLeave={returnToMap} />
      </ScreenContainer>
    );
  }

  // Event phase
  if (run.phase === 'EVENT') {
    return (
      <ScreenContainer>
        <EventScreen />
      </ScreenContainer>
    );
  }

  // Rest phase
  if (run.phase === 'REST') {
    return (
      <ScreenContainer>
        <RestScreen hp={run.hp} maxHp={run.maxHp} onRest={restHeal} />
      </ScreenContainer>
    );
  }

  // Victory
  if (run.phase === 'VICTORY') {
    return (
      <ScreenContainer>
        <EndScreen
          title="通关！"
          subtitle={`你击败了所有 ${ROGUELIKE_CONSTANTS.TOTAL_FLOORS} 层的敌人！`}
          color="#ffd700"
          battlesWon={run.battlesWon}
          gold={run.gold}
          deckSize={run.deck.length}
          onExit={() => { abandonRun(); onExit(); }}
        />
      </ScreenContainer>
    );
  }

  // Defeat
  if (run.phase === 'DEFEAT') {
    return (
      <ScreenContainer>
        <EndScreen
          title="深渊吞噬了你..."
          subtitle={`存活了 ${run.battlesWon} 场战斗`}
          color="#8b0000"
          battlesWon={run.battlesWon}
          gold={run.gold}
          deckSize={run.deck.length}
          onExit={() => { abandonRun(); onExit(); }}
        />
      </ScreenContainer>
    );
  }

  // Map phase (default)
  const currentFloorMap = run.maps[run.currentFloor];
  const reachable = getReachableNodes();

  return (
    <ScreenContainer>
      {/* HUD */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 20px',
        borderBottom: '1px solid #2a1a3e',
      }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <HudStat label="HP" value={`${run.hp}/${run.maxHp}`} color="#e74c3c" />
          <HudStat label="金币" value={`${run.gold}`} color="#ffd700" />
          <HudStat label="牌组" value={`${run.deck.length}`} color="#9b59b6" />
          <HudStat label="层数" value={`${run.currentFloor + 1}/${ROGUELIKE_CONSTANTS.TOTAL_FLOORS}`} color="#3498db" />
        </div>
        <motion.button
          onClick={() => { abandonRun(); onExit(); }}
          style={{
            padding: '6px 16px', borderRadius: 6,
            border: '1px solid #444', background: 'transparent',
            color: '#888', cursor: 'pointer', fontSize: 12,
          }}
          whileHover={{ borderColor: '#8b0000', color: '#8b0000' }}
        >
          放弃探索
        </motion.button>
      </div>

      {/* Floor title */}
      <div style={{ textAlign: 'center', padding: '16px 0 0' }}>
        <h2 style={{
          color: '#b8860b', fontFamily: '"Cinzel", serif',
          fontSize: 20, margin: 0,
        }}>
          第 {run.currentFloor + 1} 层
        </h2>
        <p style={{ color: '#666', fontSize: 12, margin: '4px 0 0' }}>
          选择路线继续深入
        </p>
      </div>

      {/* Map */}
      {currentFloorMap && (
        <RoguelikeMap
          floor={currentFloorMap}
          currentNodeId={run.currentNodeId}
          reachableNodeIds={reachable}
          onSelectNode={selectNode}
        />
      )}
    </ScreenContainer>
  );
}

function ScreenContainer({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'radial-gradient(ellipse at 50% 50%, #1a0b2e 0%, #0d0018 60%, #000 100%)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {children}
    </div>
  );
}

function HudStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ color: '#666', fontSize: 10 }}>{label}</span>
      <span style={{ color, fontSize: 14, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function PreBattleScreen({ enemy, heroType, onStart }: {
  enemy: { name: string; tier: string; hero: HeroType; winScore: number };
  heroType: HeroType;
  onStart: () => void;
}) {
  const HERO_ICONS: Record<HeroType, string> = {
    [HeroType.PHANTOM]: '🎭',
    [HeroType.WEAVER]: '🔮',
    [HeroType.INQUISITOR]: '⚖️',
    [HeroType.SINGER]: '🎵',
  };
  const tierColors: Record<string, string> = {
    WEAK: '#888', NORMAL: '#b8860b', ELITE: '#e74c3c', BOSS: '#8b0000',
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 24,
      }}
    >
      <h2 style={{ color: tierColors[enemy.tier] || '#b8860b', fontFamily: '"Cinzel", serif', margin: 0 }}>
        {enemy.name}
      </h2>
      <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
        <div style={{ fontSize: 48 }}>{HERO_ICONS[heroType]}</div>
        <div style={{ fontSize: 24, color: '#8b0000' }}>VS</div>
        <div style={{ fontSize: 48 }}>{HERO_ICONS[enemy.hero]}</div>
      </div>
      <div style={{ color: '#888', fontSize: 13 }}>
        胜分目标: {enemy.winScore}
      </div>
      <motion.button
        onClick={onStart}
        style={{
          padding: '14px 40px', borderRadius: 10,
          border: '2px solid #b8860b',
          background: 'linear-gradient(180deg, #2a1a0e, #1a0b06)',
          color: '#ffd700', fontSize: 16, fontWeight: 700,
          cursor: 'pointer', fontFamily: '"Cinzel", serif',
        }}
        whileHover={{ scale: 1.05, boxShadow: '0 0 25px rgba(184,134,11,0.5)' }}
        whileTap={{ scale: 0.95 }}
      >
        开始战斗
      </motion.button>
    </motion.div>
  );
}

function RestScreen({ hp, maxHp, onRest }: { hp: number; maxHp: number; onRest: () => void }) {
  const healAmount = Math.min(ROGUELIKE_CONSTANTS.REST_HEAL, maxHp - hp);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 24,
      }}
    >
      <span style={{ fontSize: 48 }}>🏕️</span>
      <h2 style={{ color: '#3498db', fontFamily: '"Cinzel", serif', margin: 0 }}>
        休息站
      </h2>
      <p style={{ color: '#888', fontSize: 14 }}>
        在篝火旁稍作休息，恢复体力。
      </p>
      <div style={{ color: '#aaa', fontSize: 13 }}>
        当前 HP: {hp}/{maxHp}
      </div>
      <motion.button
        onClick={onRest}
        style={{
          padding: '12px 36px', borderRadius: 8,
          border: '2px solid #3498db',
          background: 'linear-gradient(180deg, #0a1a2e, #0a0a1e)',
          color: '#3498db', fontSize: 14, fontWeight: 700,
          cursor: 'pointer',
        }}
        whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(52,152,219,0.4)' }}
      >
        休息（+{healAmount} HP）
      </motion.button>
    </motion.div>
  );
}

function EndScreen({ title, subtitle, color, battlesWon, gold, deckSize, onExit }: {
  title: string; subtitle: string; color: string;
  battlesWon: number; gold: number; deckSize: number;
  onExit: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20,
      }}
    >
      <h1 style={{
        color, fontFamily: '"Cinzel", serif', fontSize: 32, margin: 0,
        textShadow: `0 0 30px ${color}60`,
      }}>
        {title}
      </h1>
      <p style={{ color: '#888', fontSize: 14 }}>{subtitle}</p>
      <div style={{
        display: 'flex', gap: 24,
        padding: 16, borderRadius: 8,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid #2a1a3e',
      }}>
        <HudStat label="胜场" value={`${battlesWon}`} color="#b8860b" />
        <HudStat label="金币" value={`${gold}`} color="#ffd700" />
        <HudStat label="牌组" value={`${deckSize}`} color="#9b59b6" />
      </div>
      <motion.button
        onClick={onExit}
        style={{
          padding: '12px 36px', borderRadius: 8, marginTop: 12,
          border: `2px solid ${color}`,
          background: 'transparent',
          color, fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}
        whileHover={{ scale: 1.05 }}
      >
        返回主菜单
      </motion.button>
    </motion.div>
  );
}
