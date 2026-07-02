/**
 * 《坠典》主界面 — 调度世界地图、叙事、战斗、奖励、商店、事件、休息、契约、结局
 */
import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { v4 as uuid } from 'uuid';
import { useRoguelikeStore } from '../../store/roguelikeStore';
import { useGameStore } from '../../store/gameStore';
import { WorldMap } from './WorldMap';
import { StoryDialog } from './StoryDialog';
import { RewardScreen } from './RewardScreen';
import { ShopScreen } from './ShopScreen';
import { EventScreen } from './EventScreen';
import { GameBoard } from '../board/GameBoard';
import { HeroType } from '../../types/game';
import { AIPlayer } from '../../core/AIPlayer';
import { ROGUELIKE_CONSTANTS } from '../../types/roguelike';
import { PACT_GATE, getEndingTitle } from '../../core/roguelike/story';
import { findStoryNode } from '../../core/roguelike/storyMap';
import { DECREE_POOL } from '../../core/decrees';

interface RoguelikeScreenProps {
  onExit: () => void;
}

const CHAPTER_NAMES: Record<number, string> = {
  0: '序章 · 裂隙之口',
  1: '第一章 · 暮色集市',
  2: '第二章 · 织巢与圣所',
  3: '第三章 · 深渊裂隙',
};

export function RoguelikeScreen({ onExit }: RoguelikeScreenProps) {
  const run = useRoguelikeStore(s => s.run);
  const selectNode = useRoguelikeStore(s => s.selectNode);
  const getReachableNodes = useRoguelikeStore(s => s.getReachableNodes);
  const onBattleEnd = useRoguelikeStore(s => s.onBattleEnd);
  const restHeal = useRoguelikeStore(s => s.restHeal);
  const abandonRun = useRoguelikeStore(s => s.abandonRun);
  const returnToMap = useRoguelikeStore(s => s.returnToMap);
  const completeStory = useRoguelikeStore(s => s.completeStory);
  const choosePact = useRoguelikeStore(s => s.choosePact);
  const { gameState, initGame, setLocalPlayer, setNetworkMode } = useGameStore();
  const [battleActive, setBattleActive] = useState(false);

  // 战斗结束监听
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
    const node = findStoryNode(run.nodes, run.currentNodeId);

    setNetworkMode('LOCAL');
    initGame(p1Id, p2Id, run.heroType, enemy.hero);
    setLocalPlayer(p1Id);

    const engine = useGameStore.getState().engine;
    if (engine) {
      engine.mutateState(s => {
        (s as any).__roguelikeWinScore = enemy.winScore;

        // Boss 开局法案 — 作为"领域规则"施加给双方
        if (enemy.startingDecree) {
          s.players[p1Id].activeDecrees.push(enemy.startingDecree);
          s.players[p2Id].activeDecrees.push(enemy.startingDecree);
        }
        // 回响歌姬：开局反转态 2 回合
        if (enemy.startsInverted) {
          s.isInverted = true;
          s.invertedTurnsLeft = 2;
        }
        // 最终战：契约抉择修正
        if (node?.type === 'FINAL_BOSS') {
          if (run.pactChoice === 'SIGN') {
            // 魔典之力：开局 +30 分
            s.players[p1Id].score = 30;
          } else if (run.pactChoice === 'REFUSE') {
            // 魔典震怒：Boss 携带双法案 buff
            const pride = DECREE_POOL.find(d => d.id === 'PRIDE');
            const deicide = DECREE_POOL.find(d => d.id === 'DEICIDE');
            if (pride) s.players[p2Id].activeDecrees.push(pride);
            if (deicide) s.players[p2Id].activeDecrees.push(deicide);
          }
        }
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

  // ═══ 叙事对话 ═══
  if (run.phase === 'STORY' && run.pendingStory) {
    return (
      <ScreenContainer>
        <StoryDialog story={run.pendingStory} onComplete={completeStory} />
      </ScreenContainer>
    );
  }

  // ═══ 战斗（棋盘） ═══
  if (run.phase === 'BATTLE' && battleActive && gameState) {
    return <GameBoard />;
  }

  // ═══ 战前界面 ═══
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

  // ═══ 契约之门 ═══
  if (run.phase === 'PACT') {
    return (
      <ScreenContainer>
        <PactScreen
          decreePages={run.decreePages}
          onChoose={choosePact}
        />
      </ScreenContainer>
    );
  }

  // ═══ 奖励 ═══
  if (run.phase === 'REWARD') {
    return (
      <ScreenContainer>
        <RewardScreen />
      </ScreenContainer>
    );
  }

  // ═══ 商店 ═══
  if (run.phase === 'SHOP') {
    return (
      <ScreenContainer>
        <ShopScreen onLeave={returnToMap} />
      </ScreenContainer>
    );
  }

  // ═══ 事件 ═══
  if (run.phase === 'EVENT') {
    return (
      <ScreenContainer>
        <EventScreen />
      </ScreenContainer>
    );
  }

  // ═══ 休息 ═══
  if (run.phase === 'REST') {
    return (
      <ScreenContainer>
        <RestScreen hp={run.hp} maxHp={run.maxHp} onRest={restHeal} />
      </ScreenContainer>
    );
  }

  // ═══ 通关（按结局显示） ═══
  if (run.phase === 'VICTORY') {
    const endingTitle = run.endingId ? getEndingTitle(run.endingId) : '通关！';
    return (
      <ScreenContainer>
        <EndScreen
          title={endingTitle}
          subtitle={run.endingId === 'STITCHER'
            ? '你亲手重写了十二法案——隐藏结局达成'
            : '深渊的故事，到此为止……这一次。'}
          color={run.endingId === 'NEW_MASTER' ? '#9b59b6' : run.endingId === 'STITCHER' ? '#ffd700' : '#e8e0d0'}
          battlesWon={run.battlesWon}
          gold={run.gold}
          deckSize={run.deck.length}
          onExit={() => { abandonRun(); onExit(); }}
        />
      </ScreenContainer>
    );
  }

  // ═══ 死亡 ═══
  if (run.phase === 'DEFEAT') {
    return (
      <ScreenContainer>
        <EndScreen
          title="深渊吞噬了你…"
          subtitle={`你的故事在${CHAPTER_NAMES[run.chapter] ?? '深渊'}戛然而止`}
          color="#8b0000"
          battlesWon={run.battlesWon}
          gold={run.gold}
          deckSize={run.deck.length}
          onExit={() => { abandonRun(); onExit(); }}
        />
      </ScreenContainer>
    );
  }

  // ═══ 世界地图（默认） ═══
  const reachable = getReachableNodes();

  return (
    <ScreenContainer>
      {/* HUD */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 20px',
        borderBottom: '1px solid #2a1a3e',
        background: 'rgba(10,0,20,0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 20,
      }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <HudStat label="HP" value={`${run.hp}/${run.maxHp}`} color="#e74c3c" />
          <HudStat label="金币" value={`${run.gold}`} color="#ffd700" />
          <HudStat label="牌组" value={`${run.deck.length}`} color="#9b59b6" />
          <HudStat label="残页" value={`${run.decreePages}/${ROGUELIKE_CONSTANTS.PAGES_REQUIRED}`} color="#e8e0d0" />
        </div>
        <div style={{
          color: '#b8860b', fontFamily: '"Cinzel", "Noto Serif SC", serif',
          fontSize: 14, letterSpacing: 3, fontWeight: 700,
        }}>
          {CHAPTER_NAMES[run.chapter]}
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

      {/* 世界地图 */}
      <WorldMap
        nodes={run.nodes}
        currentNodeId={run.currentNodeId}
        reachableNodeIds={reachable}
        heroType={run.heroType}
        onSelectNode={selectNode}
      />
    </ScreenContainer>
  );
}

// ═══════════════════════════════════════════════════════════
//  子组件
// ═══════════════════════════════════════════════════════════

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
  enemy: { name: string; tier: string; hero: HeroType; winScore: number; flavor?: string };
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
        alignItems: 'center', justifyContent: 'center', gap: 22,
      }}
    >
      <h2 style={{ color: tierColors[enemy.tier] || '#b8860b', fontFamily: '"Cinzel", "Noto Serif SC", serif', margin: 0 }}>
        {enemy.name}
      </h2>
      {enemy.flavor && (
        <p style={{ color: '#776688', fontSize: 13, fontStyle: 'italic', margin: 0 }}>
          「{enemy.flavor}」
        </p>
      )}
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

function PactScreen({ decreePages, onChoose }: {
  decreePages: number;
  onChoose: (choice: 'SIGN' | 'REFUSE' | 'REWRITE') => void;
}) {
  const canRewrite = decreePages >= ROGUELIKE_CONSTANTS.PAGES_REQUIRED;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 24,
        padding: 24,
      }}
    >
      <motion.div
        animate={{ textShadow: [
          '0 0 20px rgba(255,215,0,0.3)',
          '0 0 45px rgba(255,215,0,0.7)',
          '0 0 20px rgba(255,215,0,0.3)',
        ] }}
        transition={{ duration: 3, repeat: Infinity }}
        style={{ fontSize: 56 }}
      >
        🚪
      </motion.div>
      <h1 style={{
        color: '#ffd700', fontFamily: '"Cinzel", "Noto Serif SC", serif',
        fontSize: 28, margin: 0, letterSpacing: 8,
      }}>
        {PACT_GATE.title}
      </h1>
      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {PACT_GATE.description.map((t, i) => (
          <p key={i} style={{
            color: i === 0 ? '#998fae' : '#ccbbdd',
            fontSize: 14, lineHeight: 1.9, margin: 0,
            textAlign: 'center',
            fontStyle: i === 0 ? 'italic' : 'normal',
          }}>
            {t}
          </p>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12, width: 'min(90%, 460px)' }}>
        <PactChoiceButton
          label={PACT_GATE.choices.SIGN.label}
          hint={PACT_GATE.choices.SIGN.hint}
          color="#9b59b6"
          onClick={() => onChoose('SIGN')}
        />
        <PactChoiceButton
          label={PACT_GATE.choices.REFUSE.label}
          hint={PACT_GATE.choices.REFUSE.hint}
          color="#e8e0d0"
          onClick={() => onChoose('REFUSE')}
        />
        <PactChoiceButton
          label={`${PACT_GATE.choices.REWRITE.label}（残页 ${decreePages}/${ROGUELIKE_CONSTANTS.PAGES_REQUIRED}）`}
          hint={canRewrite ? PACT_GATE.choices.REWRITE.hint : '残页不足，无法选择此项……'}
          color="#ffd700"
          disabled={!canRewrite}
          onClick={() => onChoose('REWRITE')}
        />
      </div>
    </motion.div>
  );
}

function PactChoiceButton({ label, hint, color, disabled, onClick }: {
  label: string; hint: string; color: string; disabled?: boolean; onClick: () => void;
}) {
  return (
    <motion.button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.03, boxShadow: `0 0 22px ${color}55` }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      style={{
        padding: '14px 22px', borderRadius: 10,
        border: `2px solid ${disabled ? '#3a3344' : color}`,
        background: disabled ? 'rgba(20,15,28,0.6)' : `linear-gradient(180deg, ${color}18, rgba(13,0,24,0.9))`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        opacity: disabled ? 0.5 : 1,
        display: 'flex', flexDirection: 'column', gap: 5,
      }}
    >
      <span style={{
        color: disabled ? '#665577' : color,
        fontSize: 16, fontWeight: 800, letterSpacing: 2,
        fontFamily: '"Cinzel", "Noto Serif SC", serif',
      }}>
        {label}
      </span>
      <span style={{ color: '#887799', fontSize: 12 }}>
        {hint}
      </span>
    </motion.button>
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
        休整
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
        color, fontFamily: '"Cinzel", "Noto Serif SC", serif', fontSize: 30, margin: 0,
        textShadow: `0 0 30px ${color}60`,
        textAlign: 'center', padding: '0 20px',
      }}>
        {title}
      </h1>
      <p style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>{subtitle}</p>
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
