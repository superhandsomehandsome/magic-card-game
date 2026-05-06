/**
 * 以太歌者 (Aether Singer) — 策略实现
 * 大招 SonataOfInversion (全局1次): 篡改底层逻辑，持续2个回合
 * 将卡牌阶级反转：F(最强,6分) > E > D > C > B > A(最弱,1分)
 */
import type { IHeroStrategy, IGameEngineAPI } from '../../types/game';
import { HeroType, GAME_CONSTANTS } from '../../types/game';

export class SingerStrategy implements IHeroStrategy {
  heroType = HeroType.SINGER;
  private playerId: string;

  constructor(playerId: string) {
    this.playerId = playerId;
  }

  onInitialize(engine: IGameEngineAPI): void {
    engine.emit('HERO_PASSIVE_REGISTERED', {
      heroType: this.heroType,
      playerId: this.playerId,
      passive: 'SONATA_OF_INVERSION',
    });
  }

  /**
   * 大招：反转奏鸣曲 — 颠覆压制链条
   */
  public sonataOfInversion(engine: IGameEngineAPI): boolean {
    const state = engine.getState();
    const player = state.players[this.playerId];

    if (player.hasUsedUltimate) return false;

    engine.mutateState(mutableState => {
      mutableState.players[this.playerId].hasUsedUltimate = true;
      mutableState.isInverted = true;
      mutableState.invertedTurnsLeft = GAME_CONSTANTS.INVERSION_DURATION;
    });

    // 全场静音 1秒
    engine.pushAction({
      type: 'AUDIO_MUTE',
      payload: { durationMs: 1000 },
      durationMs: 1000,
    });

    // 全屏蓝色音波 + 反转滤镜
    engine.pushAction({
      type: 'VFX_REVERSE',
      payload: { playerId: this.playerId, turnsLeft: GAME_CONSTANTS.INVERSION_DURATION },
      durationMs: 2000,
    });

    engine.emit('HERO_ABILITY_USED', {
      playerId: this.playerId,
      hero: this.heroType,
      ability: 'SonataOfInversion',
    });

    return true;
  }
}
