"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { useMediaPlayback } from '@/context/mediaPlaybackManager';

type FinalEpilogueProps = {
  onRestart?: () => void;
  onReturnHome?: () => void;
};

type EpiloguePhase = 'video' | 'text';

const FINAL_SUMMARY_PARAGRAPHS = [
  '当《中国》纪录片的镜头缓缓掠过春秋战国的古道、宫殿与河畔，那些沉睡千年的历史人物与思想光芒，便在我们的口语情景中，缓缓苏醒。从关卡1儒道交锋的洛阳凉亭，到关卡6韩非狱中绝言的咸阳牢狱；从孔子的坚守本心、老子的顺应自然，到墨子的非攻兼爱、荀子的礼法并治，再到庄子的自然本心、韩非的法家抱负，我们走过的每一关，都是《中国》纪录片中一段鲜活的历史切片，都是一次跨越千年的对话。',
  '这不仅仅是一场英语口语的练习，更是一场沉浸式的历史文化之旅。我们在模拟孔子与老子的对话中，读懂了儒道思想的渊源与碰撞；在演绎墨子劝楚时，体会了“以理止战”的和平初心；在参与儒家标准之争时，见证了“坚守本心”的信念力量；在荀况入秦的辩论中，感悟了“礼法并治”的治国智慧；在濠梁之辩中，领略了道家“顺应自然”的生命哲学；在韩非狱中的绝言里，动容于法家先贤“理想未竟”的悲壮与赤诚。',
  '就像《中国》纪录片所传递的那样，春秋战国不是乱世的代名词，更是中华文明的“黄金时代”——百家争鸣的思想碰撞，铸就了中国传统文化的根基；思想者的坚守与赤诚，凝聚了中华民族的精神底色。我们在练习英语句式、纠正发音的同时，更在与历史对话、与文化同行，读懂了古人的坚守与智慧，明白了中华文明绵延千年、生生不息的密码。',
  '当纪录片的画面再次定格，那些历史人物的身影已然清晰，那些思想的光芒已然照亮前路。这场跨越千年的口语之旅，终会落幕，但春秋战国的历史底蕴、中华传统文化的深厚渊源，会永远留在我们心中，指引我们在传承中前行，在坚守中成长，让千年文明的光芒，在新时代绽放新的光彩。',
] as const;

const ROLL_PIXELS_PER_SECOND = 34;

const fadeIn = keyframes`
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
`;

const Root = styled.div`
  position: absolute;
  inset: 0;
  z-index: 90;
  background-image: url('/assets/map3.png');
  background-size: cover;
  background-position: center;
  overflow: hidden;
`;

const VideoStage = styled.div<{ $hidden: boolean }>`
  position: absolute;
  inset: 0;
  background: #000;
  opacity: ${props => props.$hidden ? 0 : 1};
  transition: opacity 0.9s ease;
`;

const FullScreenVideo = styled.video`
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
`;

const TextStage = styled.div<{ $visible: boolean }>`
  position: absolute;
  inset: 0;
  opacity: ${props => props.$visible ? 1 : 0};
  pointer-events: ${props => props.$visible ? 'auto' : 'none'};
  transition: opacity 1.2s ease;
  overflow: hidden;
`;

const BackgroundReveal = styled.div`
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 50% 16%, rgba(244, 213, 137, 0.28), rgba(0, 0, 0, 0) 30%),
    radial-gradient(circle at 50% 28%, rgba(255, 247, 220, 0.14), rgba(0, 0, 0, 0) 42%),
    linear-gradient(180deg, rgba(0, 0, 0, 0.02), rgba(0, 0, 0, 0.24));
`;

const FrostedOverlay = styled.div`
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.12) 0%, rgba(0, 0, 0, 0.26) 42%, rgba(0, 0, 0, 0.44) 100%);
  backdrop-filter: blur(8px);
`;

const ContentShell = styled.div`
  position: absolute;
  inset: 5vh 6vw 5vh;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(8, 8, 10, 0.14);
  backdrop-filter: blur(10px);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 22px 70px rgba(0, 0, 0, 0.34);
  border-radius: 28px;
`;

const CreditsViewport = styled.div`
  position: absolute;
  inset: 7vh 8vw 14vh;
  overflow: hidden;
  mask-image: linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.96) 10%, rgba(0, 0, 0, 0.96) 90%, transparent 100%);
`;

const CreditsRoll = styled.div<{ $offset: number; $durationSeconds: number }>`
  position: absolute;
  left: 50%;
  width: min(56rem, 100%);
  max-width: 56rem;
  top: 100%;
  transform: translateX(-50%) translateY(${props => props.$offset}px);
  animation: rollCredits ${props => props.$durationSeconds}s linear forwards;

  @media (max-width: 900px) {
    width: min(42rem, 100%);
  }

  @media (max-width: 640px) {
    width: min(100%, 34rem);
  }

  @keyframes rollCredits {
    from {
      transform: translateX(-50%) translateY(${props => props.$offset}px);
    }

    to {
      transform: translateX(-50%) translateY(calc(-100% - 18vh));
    }
  }
`;

const Paragraph = styled.p`
  margin: 0;
  color: #f2ecdf;
  font-family: 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
  font-size: clamp(1.05rem, 0.72vw + 0.88rem, 1.3rem);
  line-height: 2.42;
  letter-spacing: 0.11em;
  text-align: center;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.42), 0 8px 30px rgba(0, 0, 0, 0.52);
  padding: 0 1rem;

  & + & {
    margin-top: 2.5rem;
  }
`;

const Actions = styled.div<{ $visible: boolean }>`
  position: absolute;
  left: 50%;
  bottom: 7vh;
  transform: translateX(-50%) translateY(${props => props.$visible ? '0' : '16px'});
  display: flex;
  justify-content: center;
  gap: 18px;
  flex-wrap: wrap;
  opacity: ${props => props.$visible ? 1 : 0};
  transition: opacity 0.9s ease, transform 0.9s ease;
  ${props => props.$visible && css`
    animation: ${fadeIn} 1s ease;
  `}
`;

const ActionButton = styled.button`
  min-width: 170px;
  min-height: 48px;
  padding: 0 22px;
  border-radius: 10px;
  border: 1px solid rgba(251, 191, 36, 0.42);
  background: linear-gradient(135deg, rgba(180, 83, 9, 0.94), rgba(217, 119, 6, 0.94));
  color: #fff;
  font-size: 0.98rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: transform 0.2s ease, filter 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.34);

  &:hover {
    filter: brightness(1.08);
    transform: translateY(-1px);
  }
`;

const SkipButton = styled.button`
  position: absolute;
  top: 30px;
  right: 30px;
  z-index: 4;
  border: 1px solid rgba(251, 191, 36, 0.42);
  background: transparent;
  color: #fbbf24;
  padding: 5px 15px;
  cursor: pointer;
`;

export function FinalEpilogue({
  onRestart,
  onReturnHome,
}: FinalEpilogueProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const rollRef = useRef<HTMLDivElement>(null);
  const { notifyVideoPlay, notifyVideoEnd, notifyVideoUnmount } = useMediaPlayback();
  const [phase, setPhase] = useState<EpiloguePhase>('video');
  const [showActions, setShowActions] = useState(false);
  const [rollOffset, setRollOffset] = useState(0);
  const [rollDurationSeconds, setRollDurationSeconds] = useState(22);

  const summaryParagraphs = useMemo(() => [...FINAL_SUMMARY_PARAGRAPHS], []);

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      notifyVideoUnmount(video);
    };
  }, [notifyVideoUnmount]);

  useEffect(() => {
    if (phase !== 'text') {
      return;
    }

    const viewport = viewportRef.current;
    const roll = rollRef.current;
    if (!viewport || !roll) {
      return;
    }

    const updateMetrics = () => {
      const viewportHeight = viewport.clientHeight;
      const contentHeight = roll.scrollHeight;
      setRollOffset(Math.max(viewportHeight * 0.2, 28));
      setRollDurationSeconds(Math.max((viewportHeight + contentHeight + viewportHeight * 0.18) / ROLL_PIXELS_PER_SECOND, 18));
    };

    updateMetrics();
    const resizeObserver = new ResizeObserver(updateMetrics);
    resizeObserver.observe(viewport);
    resizeObserver.observe(roll);

    setShowActions(false);

    return () => {
      resizeObserver.disconnect();
    };
  }, [phase, summaryParagraphs]);

  const handleVideoEnd = () => {
    const video = videoRef.current;
    if (video) {
      notifyVideoEnd(video);
    }
    setPhase('text');
  };

  const handleSkipVideo = () => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      notifyVideoEnd(video);
    }
    setPhase('text');
  };

  return (
    <Root>
      <VideoStage $hidden={phase !== 'video'}>
        <FullScreenVideo
          ref={videoRef}
          autoPlay
          src="/assets/qin-unification.mp4"
          onPlay={(event) => notifyVideoPlay(event.currentTarget)}
          onEnded={handleVideoEnd}
        />
        {phase === 'video' && (
          <SkipButton onClick={handleSkipVideo}>Skip</SkipButton>
        )}
      </VideoStage>

      <TextStage $visible={phase === 'text'}>
        <BackgroundReveal />
        <FrostedOverlay />
        <ContentShell />

        <CreditsViewport ref={viewportRef}>
          <CreditsRoll
            ref={rollRef}
            $offset={rollOffset}
            $durationSeconds={rollDurationSeconds}
            onAnimationEnd={() => setShowActions(true)}
          >
            {summaryParagraphs.map((paragraph) => (
              <Paragraph key={paragraph}>{paragraph}</Paragraph>
            ))}
          </CreditsRoll>
        </CreditsViewport>

        <Actions $visible={showActions}>
          <ActionButton onClick={onReturnHome}>返回主页</ActionButton>
          <ActionButton onClick={onRestart}>重新开始</ActionButton>
        </Actions>
      </TextStage>
    </Root>
  );
}

export default FinalEpilogue;
