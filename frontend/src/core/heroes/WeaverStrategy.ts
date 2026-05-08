/**
 * 命运织梦者 (Fate Weaver) — 策略实现
 * 主动 RollFateDice (每回合1次): 咏唱阶段投掷个人骰子(1-6对应F-A)
 * 生成一张仅限本回合使用的半透明"虚影卡(Phantom Card)"用于凑点
 */
import { v4 as uuid } from 'uuid';
import type { IHeroStrategy, IGameEngineAPI, ICard } from '../../types/game';
import { HeroType, CardRank } from '../../types/game';

export class WeaverStrategy implements IHeroStrategy {
  heroType = HeroType.WEAVER;
  private playerId: string;
  private usedThisTurn: boolean = false;

  constructor(playerId: string) {
    this.playerId = playerId;
  }

  onInitialize(engine: IGameEngineAPI): void {
    engine.emit('HERO_PASSIVE_REGISTERED', {
      heroType: this.heroType,
      playerId: this.playerId,
      passive: 'FATE_DICE',
    });
  }

  onTurnStart(_engine: IGameEngineAPI, playerId: string): void {
    if (playerId !== this.playerId) return;
    this.usedThisTurn = false;
  }

  /**
   * 咏唱阶段：掷命运骰子
   */
  public rollFateDice(engine: IGameEngineAPI): ICard | null {
    if (this.usedThisTurn) return null;
    this.usedThisTurn = true;

    const roll = Math.floor(Math.random() * 6) + 1;
    const rankMap: Record<number, CardRank> = {
      1: CardRank.F,
      2: CardRank.E,
      3: CardRank.D,
      4: CardRank.C,
      5: CardRank.B,
      6: CardRank.A,
    };

    const phantomCard: ICard = {
      id: uuid(),
      rank: rankMap[roll],
      baseScore: rankMap[roll],
      isPhantom: true,
    };

    engine.mutateState(state => {
      state.players[this.playerId].hand.push(phantomCard);
    });

    engine.pushAction({
      type: 'FATE_DICE',
      payload: { roll, card: phantomCard, playerId: this.playerId },
      durationMs: 2200,
    });

    engine.emit('HERO_ABILITY_USED', {
      playerId: this.playerId,
      hero: this.heroType,
      ability: 'RollFateDice',
      result: phantomCard,
    });

    return phantomCard;
  }
}
