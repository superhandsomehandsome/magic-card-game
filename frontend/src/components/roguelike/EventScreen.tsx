/**
 * 随机事件界面
 */
import { motion } from 'framer-motion';
import { useRoguelikeStore } from '../../store/roguelikeStore';

export function EventScreen() {
  const run = useRoguelikeStore(s => s.run);
  const resolveEvent = useRoguelikeStore(s => s.resolveEvent);

  if (!run || !run.currentEvent) return null;

  const event = run.currentEvent;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 24,
        padding: 32,
      }}
    >
      <span style={{ fontSize: 48 }}>❓</span>

      <h2 style={{
        color: '#9b59b6', fontFamily: '"Cinzel", serif',
        margin: 0, fontSize: 22,
      }}>
        {event.title}
      </h2>

      <p style={{
        color: '#aaa', fontSize: 14, maxWidth: 420, textAlign: 'center',
        lineHeight: 1.8,
      }}>
        {event.description}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360 }}>
        {event.choices.map((choice, i) => (
          <motion.button
            key={i}
            onClick={() => resolveEvent(i)}
            style={{
              padding: '14px 20px', borderRadius: 10,
              border: '2px solid #9b59b640',
              background: 'linear-gradient(180deg, rgba(155,89,182,0.08), rgba(155,89,182,0.02))',
              color: '#ddd', fontSize: 13, cursor: 'pointer',
              textAlign: 'left',
            }}
            whileHover={{
              borderColor: '#9b59b6',
              boxShadow: '0 0 15px rgba(155,89,182,0.3)',
              scale: 1.02,
            }}
            whileTap={{ scale: 0.98 }}
          >
            {choice.label}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
