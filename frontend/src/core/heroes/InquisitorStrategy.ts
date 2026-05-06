/**
 * 至高审判官 (Supreme Inquisitor) — 策略实现
 * 大招 ScalesOfJustice (全局1次): 强制对手 hand.length 裁剪至与自己相等
 * 随机弃除对手多余卡牌
 */
import type { IHeroStrategy, IGameEngineAPI } from '../../types/game';
import { HeroType } from '../../types/game';

export class InquisitorStrategy implements IHeroStrategy {
  heroType = HeroType.INQUISITOR;
  private playerId: string;

  constructor(playerId: string) {
    this.playerId = playerId;
  }

  onInitialize(engine: IGameEngineAPI): void {
    engine.emit('HERO_PASSIVE_REGISTERED', {
      heroType: this.heroType,
      playerId: this.playerId,
      passive: 'SCALES_OF_JUSTICE',
    });
  }

  /**
   * 大招：审判天平 — 强制裁剪对手手牌
   */
  public scalesOfJustice(engine: IGameEngineAPI): boolean {
    const state = engine.getState();
    const player = state.players[this.playerId];

    if (player.hasUsedUltimate) return false;

    const opponentId = Object.keys(state.players).find(id => id !== this.playerId)!;

    engine.mutateState(mutableState => {
      const me = mutableState.players[this.playerId];
      const opponent = mutableState.players[opponentId];

      me.hasUsedUltimate = true;

      const excess = opponent.hand.length - me.hand.length;
      if (excess <= 0) return;

      // 随机弃除多余牌
      const discarded = [];
      for (let i = 0; i < excess; i++) {
        const idx = Math.floor(Math.random() * opponent.hand.length);
        const removed = opponent.hand.splice(idx, 1)[0];
        mutableState.discardPile.push(removed);
        discarded.push(removed);
      }
    });

    engine.pushAction({
      type: 'SCREEN_SHAKE',
      payload: { intensity: 'heavy', playerId: this.playerId },
      durationMs: 1500,
    });

    engine.pushAction({
      type: 'VFX_BURN',
      payload: { reason: 'scales_of_justice', targetId: opponentId },
      durationMs: 1200,
    });

    engine.emit('HERO_ABILITY_USED', {
      playerId: this.playerId,
      hero: this.heroType,
      ability: 'ScalesOfJustice',
    });

    return true;
  }
}
