/**
 * 秘术对决 V6.0：喋血狂欢 — 主应用入口
 */
import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { HeroType } from './types/game';
import { useGameStore } from './store/gameStore';
import { HeroSelect } from './components/phases/HeroSelect';
import { GameBoard } from './components/board/GameBoard';

function App() {
  const { gameState, initGame, setLocalPlayer, startGame } = useGameStore();
  const [gameStarted, setGameStarted] = useState(false);

  const handleHeroSelect = (hero1: HeroType, hero2: HeroType) => {
    const p1Id = uuid();
    const p2Id = uuid();
    initGame(p1Id, p2Id, hero1, hero2);
    setLocalPlayer(p1Id);
    setGameStarted(true);

    // 延迟启动游戏让 UI 先渲染
    setTimeout(() => startGame(), 500);
  };

  if (!gameStarted || !gameState) {
    return <HeroSelect onSelect={handleHeroSelect} />;
  }

  return <GameBoard />;
}

export default App;
