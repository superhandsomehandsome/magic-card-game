/**
 * 奥术怪盗 (Arcane Phantom) — 策略实现
 * 被动 BlackMarketBypass: 购买黑市卡牌无次数限制
 * 被动 SleightOfHand: 触发免费拿牌时，额外 drawCard(1)
 */
import type { IHeroStrategy, IGameEngineAPI } from '../../types/game';
import { HeroType } from '../../types/game';

export class PhantomStrategy implements IHeroStrategy {
  heroType = HeroType.PHANTOM;
  private playerId: string = '';

  constructor(playerId: string) {
    this.playerId = playerId;
  }

  onInitialize(engine: IGameEngineAPI): void {
    // 拦截黑市购买校验：怪盗无限购买
    // 通过事件系统注册被动能力
    engine.emit('HERO_PASSIVE_REGISTERED', {
      heroType: this.heroType,
      playerId: this.playerId,
      passive: 'BLACK_MARKET_BYPASS',
    });
  }

  onTurnStart(engine: IGameEngineAPI, playerId: string): void {
    if (playerId !== this.playerId) return;

    engine.pushAction({
      type: 'PHANTOM_COIN',
      payload: { playerId: this.playerId },
      durationMs: 800,
    });
  }
}
