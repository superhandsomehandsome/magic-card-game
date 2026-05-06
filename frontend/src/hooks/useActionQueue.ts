/**
 * 动画指令队列消费 Hook
 * 彻底解耦"状态计算瞬时性"与"动画播放耗时性"
 */
import { useEffect, useRef, useCallback } from 'react';
import type { IActionCommand } from '../types/game';
import { useGameStore } from '../store/gameStore';

export function useActionQueue(onAction: (action: IActionCommand) => void) {
  const consumeNextAction = useGameStore(s => s.consumeNextAction);
  const setAnimating = useGameStore(s => s.setAnimating);
  const actionQueue = useGameStore(s => s.actionQueue);
  const isAnimating = useGameStore(s => s.isAnimating);
  const processingRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    let action = consumeNextAction();
    while (action) {
      onAction(action);
      await sleep(action.durationMs);
      action = consumeNextAction();
    }

    setAnimating(false);
    processingRef.current = false;
  }, [consumeNextAction, setAnimating, onAction]);

  useEffect(() => {
    if (actionQueue.length > 0 && !isAnimating && !processingRef.current) {
      processQueue();
    }
  }, [actionQueue.length, isAnimating, processQueue]);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
