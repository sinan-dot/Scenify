"use client";

import styled from 'styled-components';
import { HintPanel } from '@/components/HintPanel';
import type { LevelHints } from '@/config/levelsConfig';

type AudioRecorderProps = {
  hints: LevelHints;
  inputMode: 'text' | 'voice';
  inputText: string;
  isRecording: boolean;
  completionSummary?: string;
  onInputModeChange: (mode: 'text' | 'voice') => void;
  onInputTextChange: (text: string) => void;
  onSendText: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPlayFinalVideo?: () => void;
};

const BottomPanel = styled.div`
  background: rgba(255, 255, 255, 0.15); 
  backdrop-filter: blur(20px); 
  border-radius: 20px;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.3); 
  display: flex;
  flex-direction: column;
  gap: 15px;
  position: relative; 
`;

const InputGroup = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
`;

const SwitchModeBtn = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.3);
  background: rgba(255,255,255,0.1);
  color: white;
  font-size: 1.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover { background: rgba(255,255,255,0.2); }
`;

const TextInput = styled.input`
  flex: 1;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(0, 0, 0, 0.3);
  color: white;
  font-size: 1rem;
  outline: none;
  &:focus { border-color: #fbbf24; }
`;

const VoiceHoldBtn = styled.button<{ $recording: boolean }>`
  flex: 1;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.3);
  background: ${props => props.$recording ? '#ef4444' : 'rgba(255,255,255,0.2)'};
  color: white;
  font-weight: bold;
  cursor: pointer;
  user-select: none;
  &:active { filter: brightness(0.8); }
`;

const SendButton = styled.button`
  padding: 0 25px;
  height: 45px;
  border-radius: 8px;
  background: #b45309;
  color: white;
  font-weight: bold;
  border: none;
  cursor: pointer;
  &:hover { background: #d97706; }
`;

const CompletionSummary = styled.div`
  color: rgba(255,255,255,0.92);
  line-height: 1.85;
  font-size: 1rem;
  text-align: left;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(251, 191, 36, 0.22);
  border-radius: 12px;
  padding: 16px 18px;
`;

const CompletionActions = styled.div`
  display: flex;
  justify-content: center;
  padding-top: 2px;
`;

const CompletionButton = styled.button`
  min-height: 44px;
  padding: 0 24px;
  border-radius: 8px;
  border: 1px solid rgba(251, 191, 36, 0.45);
  background: linear-gradient(135deg, #b45309, #d97706);
  color: #fff;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
  transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;

  &:hover {
    filter: brightness(1.08);
    transform: translateY(-1px);
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.34);
  }

  &:active {
    transform: translateY(0);
  }
`;

export function AudioRecorder({
  hints,
  inputMode,
  inputText,
  isRecording,
  completionSummary,
  onInputModeChange,
  onInputTextChange,
  onSendText,
  onStartRecording,
  onStopRecording,
  onPlayFinalVideo,
}: AudioRecorderProps) {
  if (completionSummary) {
    return (
      <BottomPanel>
        <CompletionSummary>{completionSummary}</CompletionSummary>
        <CompletionActions>
          <CompletionButton onClick={onPlayFinalVideo}>
            播放结局视频 / 进入下一关
          </CompletionButton>
        </CompletionActions>
      </BottomPanel>
    );
  }

  return (
    <BottomPanel>
      <HintPanel hints={hints} />

      <InputGroup>
        <SwitchModeBtn onClick={() => onInputModeChange(inputMode === 'text' ? 'voice' : 'text')}>
          {inputMode === 'text' ? '🎙️' : '⌨️'}
        </SwitchModeBtn>

        {inputMode === 'text' ? (
          <TextInput
            placeholder="Type 'test' to finish..."
            value={inputText}
            onChange={(event) => onInputTextChange(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && onSendText()}
          />
        ) : (
          <VoiceHoldBtn
            $recording={isRecording}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              onStartRecording();
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              onStopRecording();
            }}
            onPointerCancel={onStopRecording}
          >
            {isRecording ? 'Listening...' : 'Hold to Speak'}
          </VoiceHoldBtn>
        )}

        {inputMode === 'text' && (
          <SendButton onClick={onSendText}>Send</SendButton>
        )}
      </InputGroup>
    </BottomPanel>
  );
}
