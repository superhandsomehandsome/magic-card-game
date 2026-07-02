/**
 * 《坠典》叙事对话组件 — 序章/章节引言/Boss对话/结局
 * 打字机效果逐行播放，点击推进
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { IPendingStory } from '../../types/roguelike';

interface StoryDialogProps {
  story: IPendingStory;
  onComplete: () => void;
}

const TYPE_SPEED_MS = 28;

export function StoryDialog({ story, onComplete }: StoryDialogProps) {
  const [lineIdx, setLineIdx] = useState(0);
  const [charCount, setCharCount] = useState(0);

  const line = story.lines[lineIdx];
  const fullText = line?.text ?? '';
  const isTyping = charCount < fullText.length;
  const isLastLine = lineIdx >= story.lines.length - 1;

  // 打字机效果
  useEffect(() => {
    if (!isTyping) return;
    const t = setInterval(() => {
      setCharCount(c => Math.min(c + 1, fullText.length));
    }, TYPE_SPEED_MS);
    return () => clearInterval(t);
  }, [lineIdx, isTyping, fullText.length]);

  const advance = useCallback(() => {
    if (isTyping) {
      // 打字中点击 → 直接显示整行
      setCharCount(fullText.length);
      return;
    }
    if (isLastLine) {
      onComplete();
      return;
    }
    setLineIdx(i => i + 1);
    setCharCount(0);
  }, [isTyping, isLastLine, fullText.length, onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={advance}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        background: 'radial-gradient(ellipse at 50% 40%, rgba(26,11,46,0.97), rgba(5,0,10,0.99))',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', padding: 24,
        userSelect: 'none',
      }}
    >
      {/* 标题 */}
      {story.title && (
        <motion.h2
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            color: '#b8860b',
            fontFamily: '"Cinzel", "Noto Serif SC", serif',
            fontSize: 26, letterSpacing: 6,
            margin: '0 0 36px',
            textShadow: '0 0 24px rgba(184,134,11,0.5)',
          }}
        >
          {story.title}
        </motion.h2>
      )}

      {/* 已播放的行（保留在屏幕上，逐渐变暗） */}
      <div style={{
        maxWidth: 640, width: '100%',
        display: 'flex', flexDirection: 'column', gap: 18,
        minHeight: 200, justifyContent: 'flex-end',
      }}>
        <AnimatePresence>
          {story.lines.slice(Math.max(0, lineIdx - 2), lineIdx).map((prev, i) => (
            <motion.div
              key={`prev-${lineIdx}-${i}`}
              initial={{ opacity: 0.7 }}
              animate={{ opacity: 0.35 }}
              style={{ pointerEvents: 'none' }}
            >
              <StoryLineView speaker={prev.speaker} text={prev.text} />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* 当前行 */}
        {line && (
          <motion.div
            key={`line-${lineIdx}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <StoryLineView speaker={line.speaker} text={fullText.slice(0, charCount)} />
          </motion.div>
        )}
      </div>

      {/* 推进提示 */}
      <motion.div
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.8, repeat: Infinity }}
        style={{
          marginTop: 40, color: '#665577', fontSize: 12, letterSpacing: 3,
        }}
      >
        {isTyping ? '点击 显示全部' : isLastLine ? '点击 继续 ▸' : '点击 下一句 ▸'}
      </motion.div>
    </motion.div>
  );
}

function StoryLineView({ speaker, text }: { speaker?: string; text: string }) {
  if (speaker) {
    return (
      <div>
        <div style={{
          color: '#ffd700', fontSize: 13, fontWeight: 700,
          letterSpacing: 2, marginBottom: 6,
          fontFamily: '"Cinzel", "Noto Serif SC", serif',
        }}>
          {speaker}
        </div>
        <div style={{
          color: '#ddd', fontSize: 16, lineHeight: 1.9,
          borderLeft: '2px solid #b8860b55', paddingLeft: 14,
        }}>
          {text}
        </div>
      </div>
    );
  }
  return (
    <div style={{
      color: '#998fae', fontSize: 15, lineHeight: 1.9,
      fontStyle: 'italic', textAlign: 'center',
    }}>
      {text}
    </div>
  );
}
