/**
 * 战后奖励 — 3选1 卡牌
 */
import { motion } from 'framer-motion';
import { useRoguelikeStore } from '../../store/roguelikeStore';
import { Card } from '../board/Card';

export function RewardScreen() {
  const run = useRoguelikeStore(s => s.run);
  const pickRewardCard = useRoguelikeStore(s => s.pickRewardCard);
  const skipReward = useRoguelikeStore(s => s.skipReward);

  if (!run || !run.rewardCards) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 24,
      }}
    >
      <h2 style={{
        color: '#ffd700', fontFamily: '"Cinzel", serif',
        margin: 0, fontSize: 22,
      }}>
        战斗胜利！
      </h2>
      <p style={{ color: '#888', fontSize: 13 }}>
        选择一张卡牌加入牌组，或跳过
      </p>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
        {run.rewardCards.map((card) => (
          <motion.div
            key={card.id}
            whileHover={{ scale: 1.1, y: -8 }}
            whileTap={{ scale: 0.95 }}
            style={{ cursor: 'pointer' }}
            onClick={() => pickRewardCard(card.id)}
          >
            <Card card={card} size="lg" />
          </motion.div>
        ))}
      </div>

      <motion.button
        onClick={skipReward}
        style={{
          padding: '10px 28px', borderRadius: 8, marginTop: 8,
          border: '1px solid #444', background: 'transparent',
          color: '#888', cursor: 'pointer', fontSize: 13,
        }}
        whileHover={{ borderColor: '#888', color: '#aaa' }}
      >
        跳过奖励
      </motion.button>

      {/* Gold earned */}
      <div style={{ color: '#ffd700', fontSize: 13 }}>
        +{run.currentEnemy?.goldReward ?? 20} 金币
      </div>
    </motion.div>
  );
}
