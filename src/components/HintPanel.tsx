"use client";

import { useMemo, useState } from 'react';
import styled from 'styled-components';
import type { LevelHints } from '@/config/levelsConfig';

type HintPanelProps = {
  hints: LevelHints;
};

const HintShell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const LevelOneRow = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 0.9rem;
  color: #e2e8f0;
`;

const HintLabel = styled.span`
  flex-shrink: 0;
`;

const Keyword = styled.span`
  color: #fbbf24;
  font-weight: 600;
  background: rgba(0, 0, 0, 0.4);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(251, 191, 36, 0.2);
`;

const ToggleButton = styled.button<{ $open: boolean }>`
  margin-left: auto;
  border: 1px solid rgba(251, 191, 36, 0.34);
  border-radius: 8px;
  background: ${props => props.$open ? 'rgba(180, 83, 9, 0.42)' : 'rgba(0, 0, 0, 0.28)'};
  color: #fde68a;
  min-height: 32px;
  padding: 0 12px;
  font-size: 0.86rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;

  &:hover {
    background: rgba(180, 83, 9, 0.5);
    border-color: rgba(251, 191, 36, 0.52);
    transform: translateY(-1px);
  }
`;

const LevelTwoOuter = styled.div<{ $open: boolean }>`
  max-height: ${props => props.$open ? '168px' : '0'};
  opacity: ${props => props.$open ? '1' : '0'};
  transform: translateY(${props => props.$open ? '0' : '8px'});
  overflow: hidden;
  transition: max-height 0.28s ease, opacity 0.22s ease, transform 0.28s ease;
`;

const LevelTwoList = styled.ul`
  max-height: 148px;
  overflow-y: auto;
  margin: 0;
  padding: 12px 14px 12px 32px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(12px);
  color: rgba(255, 255, 255, 0.86);
  line-height: 1.58;
  font-size: 0.9rem;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(251, 191, 36, 0.32);
    border-radius: 2px;
  }

  li + li {
    margin-top: 8px;
  }
`;

const EnglishText = styled.strong`
  color: #fff7ed;
  font-weight: 800;
`;

const ChineseText = styled.span`
  color: #cbd5e1;
`;

function splitHintSentence(sentence: string) {
  const match = sentence.match(/^(.*?)(\s*(?:\([^()]*[\u4e00-\u9fff][^()]*\)|（[^（）]*[\u4e00-\u9fff][^（）]*）))$/);
  if (!match) {
    return { english: sentence, chinese: '' };
  }

  return {
    english: match[1].trim(),
    chinese: match[2].trim(),
  };
}

export function HintPanel({ hints }: HintPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const parsedSentences = useMemo(
    () => hints.level2.map((sentence) => splitHintSentence(sentence)),
    [hints.level2],
  );

  return (
    <HintShell>
      <LevelOneRow>
        <HintLabel>🔑 Keywords:</HintLabel>
        {hints.level1.map((hint) => (
          <Keyword key={hint.word}>
            {hint.word} ({hint.translation} {hint.phonetics})
          </Keyword>
        ))}
        {hints.level2.length > 0 && (
          <ToggleButton
            $open={isOpen}
            type="button"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((current) => !current)}
          >
            💡 句式提示 / Hints
          </ToggleButton>
        )}
      </LevelOneRow>

      <LevelTwoOuter $open={isOpen}>
        <LevelTwoList>
          {parsedSentences.map(({ english, chinese }, index) => (
            <li key={`${english}-${index}`}>
              <EnglishText>{english}</EnglishText>
              {chinese && <> <ChineseText>{chinese}</ChineseText></>}
            </li>
          ))}
        </LevelTwoList>
      </LevelTwoOuter>
    </HintShell>
  );
}
