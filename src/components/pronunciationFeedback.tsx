"use client";

import styled from 'styled-components';
import type { PronunciationWordResult, SpeechEvaluationResult } from '@/lib/types';

type PronunciationFeedbackProps = {
  result: SpeechEvaluationResult | null;
  isLoading?: boolean;
  error?: string | null;
};

const Panel = styled.div`
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(251, 191, 36, 0.25);
  border-radius: 12px;
  padding: 14px 16px;
  color: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(14px);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
`;

const Title = styled.div`
  color: #fbbf24;
  font-weight: 700;
  font-size: 0.95rem;
`;

const Score = styled.div<{ $tone: 'good' | 'fair' | 'weak' }>`
  min-width: 58px;
  text-align: center;
  padding: 6px 10px;
  border-radius: 8px;
  font-weight: 800;
  color: ${(props) => props.$tone === 'good' ? '#86efac' : props.$tone === 'fair' ? '#fde68a' : '#fca5a5'};
  background: ${(props) => props.$tone === 'good' ? 'rgba(22, 163, 74, 0.18)' : props.$tone === 'fair' ? 'rgba(217, 119, 6, 0.2)' : 'rgba(220, 38, 38, 0.2)'};
  border: 1px solid ${(props) => props.$tone === 'good' ? 'rgba(134, 239, 172, 0.3)' : props.$tone === 'fair' ? 'rgba(253, 230, 138, 0.35)' : 'rgba(252, 165, 165, 0.35)'};
`;

const Transcript = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  line-height: 1.8;
  font-size: 0.92rem;
`;

const Word = styled.span<{ $tone: 'good' | 'fair' | 'weak' }>`
  position: relative;
  border-radius: 6px;
  padding: 1px 5px;
  color: ${(props) => props.$tone === 'good' ? '#dcfce7' : props.$tone === 'fair' ? '#fef3c7' : '#fecaca'};
  background: ${(props) => props.$tone === 'good' ? 'rgba(22, 163, 74, 0.12)' : props.$tone === 'fair' ? 'rgba(217, 119, 6, 0.16)' : 'rgba(220, 38, 38, 0.22)'};
  text-decoration: ${(props) => props.$tone === 'weak' ? 'underline' : 'none'};
  text-decoration-color: #f87171;
  text-underline-offset: 3px;
  cursor: help;
`;

const Detail = styled.div`
  margin-top: 8px;
  color: rgba(255,255,255,0.68);
  font-size: 0.78rem;
`;

function scoreTone(score: number | null | undefined): 'good' | 'fair' | 'weak' {
  if (typeof score !== 'number') return 'fair';
  if (score >= 80) return 'good';
  if (score >= 60) return 'fair';
  return 'weak';
}

export function PronunciationFeedback({
  result,
  isLoading = false,
  error,
}: PronunciationFeedbackProps) {
  if (isLoading) {
    return (
      <Panel>
        <Header>
          <Title>Pronunciation Assessment</Title>
          <Score $tone="fair">...</Score>
        </Header>
        <Detail>Evaluating your pronunciation...</Detail>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel>
        <Header>
          <Title>Pronunciation Assessment</Title>
          <Score $tone="weak">--</Score>
        </Header>
        <Detail>{error}</Detail>
      </Panel>
    );
  }

  if (!result) return null;

  const score = result.overallScore;
  const fallbackWords: PronunciationWordResult[] = result.recognizedText.split(/\s+/).filter(Boolean).map((text) => ({
    text,
    score: null,
  }));
  const words = result.words.length > 0 ? result.words : fallbackWords;

  return (
    <Panel>
      <Header>
        <Title>Pronunciation Assessment</Title>
        <Score $tone={scoreTone(score)}>{typeof score === 'number' ? Math.round(score) : '--'}</Score>
      </Header>

      <Transcript>
        {words.map((word, index) => (
          <Word
            key={`${word.text}-${index}`}
            $tone={scoreTone(word.score)}
            title={[
              typeof word.score === 'number' ? `Score: ${Math.round(word.score)}` : 'Score unavailable',
              word.phonetic ? `Phonetic: ${word.phonetic}` : '',
              word.errorType ? `Tip: check this pronunciation (${word.errorType})` : '',
            ].filter(Boolean).join('\n')}
          >
            {word.text || '?'}
          </Word>
        ))}
      </Transcript>

      <Detail>
        Accuracy {result.scores.accuracy ?? '--'} · Fluency {result.scores.fluency ?? '--'} ·
        Standard {result.scores.standard ?? '--'} · Integrity {result.scores.integrity ?? '--'}
      </Detail>
    </Panel>
  );
}
