"use client";

import React from 'react';
import styled, { css } from 'styled-components';

export type ChatWindowMessage = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  isAudio: boolean;
  audioUrl?: string;
  duration?: number;
  showTranscript: boolean;
  isReport?: boolean;
};

type ChatWindowProps = {
  messages: ChatWindowMessage[];
  npcAvatarLabel: string;
  playingId: number | null;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  onPlayMessage: (message: ChatWindowMessage) => void;
  onToggleTranscript: (messageId: number) => void;
  onEnterNextLevel?: (messageId: number) => void;
};

const ChatWindowFrame = styled.div`
  height: 55%; 
  margin-top: auto; 
  background: rgba(255, 255, 255, 0.1); 
  backdrop-filter: blur(10px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 15px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
`;

const MessageRow = styled.div<{ $isUser: boolean }>`
  display: flex;
  justify-content: ${props => props.$isUser ? 'flex-end' : 'flex-start'};
  align-items: flex-start;
  gap: 10px;
  width: 100%;
`;

const Avatar = styled.div<{ $isUser: boolean }>`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background-color: ${props => props.$isUser ? '#b45309' : '#e2e8f0'};
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  color: ${props => props.$isUser ? '#fff' : '#333'};
  border: 2px solid rgba(255,255,255,0.4);
  font-size: 0.8rem;
  flex-shrink: 0;
`;

const MessageContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 85%;
`;

const AudioBubble = styled.div<{ $isUser: boolean; $playing: boolean }>`
  padding: 10px 16px;
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 80px;
  transition: all 0.2s;
  ${props => props.$isUser && css`
    background: rgba(180, 83, 9, 0.7); 
    border: 1px solid rgba(251, 191, 36, 0.3);
    color: #fff;
    justify-content: flex-end;
  `}
  ${props => !props.$isUser && css`
    background: rgba(255, 255, 255, 0.2); 
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: #fff;
    justify-content: flex-start;
  `}
  &:hover { filter: brightness(1.1); }
  .wave-icon {
    font-size: 1rem;
    animation: ${props => props.$playing ? 'pulse 1s infinite' : 'none'};
  }
  @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
`;

const TextBubble = styled.div`
  background: rgba(255, 255, 255, 0.15); 
  backdrop-filter: blur(15px);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.2);
  padding: 20px;
  border-radius: 12px;
  line-height: 1.8;
  font-size: 1rem;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
  white-space: pre-wrap; 
  h3 { color: #fbbf24; margin-top: 15px; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 5px; }
  strong { color: #86efac; }
`;

const ReportAction = styled.button`
  width: 100%;
  margin-top: 20px;
  padding: 12px 18px;
  border-radius: 8px;
  border: 1px solid rgba(251, 191, 36, 0.35);
  background: linear-gradient(135deg, #b45309, #d97706);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;

  &:hover {
    filter: brightness(1.08);
    transform: translateY(-1px);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.32);
  }
`;

const TranscriptText = styled.div`
  font-size: 0.9rem;
  color: #cbd5e1;
  background: rgba(0,0,0,0.4);
  padding: 8px 12px;
  border-radius: 8px;
  margin-top: 2px;
`;

const ConvertBtn = styled.span`
  font-size: 0.75rem;
  color: rgba(255,255,255,0.6);
  cursor: pointer;
  align-self: flex-end;
  &:hover { color: #fbbf24; }
`;

function renderMarkdownStrong(text: string) {
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

export function ChatWindow({
  messages,
  npcAvatarLabel,
  playingId,
  chatEndRef,
  onPlayMessage,
  onToggleTranscript,
  onEnterNextLevel,
}: ChatWindowProps) {
  return (
    <ChatWindowFrame>
      {messages.map((msg) => (
        <MessageRow key={msg.id} $isUser={msg.role === 'user'}>
          {msg.role === 'assistant' && <Avatar $isUser={false}>{npcAvatarLabel}</Avatar>}

          <MessageContent style={{ alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              {msg.isAudio ? (
                <>
                  <AudioBubble
                    $isUser={msg.role === 'user'}
                    $playing={playingId === msg.id}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      onPlayMessage(msg);
                    }}
                  >
                    <span className="wave-icon">{msg.role === 'user' ? '((•))' : '🔊'}</span>
                    <span>{msg.duration}"</span>
                  </AudioBubble>

                  <ConvertBtn onClick={() => onToggleTranscript(msg.id)}>
                    {msg.showTranscript ? 'Hide' : 'A→文'}
                  </ConvertBtn>
                </>
              ) : (
                <TextBubble>
                  <div
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdownStrong(msg.text),
                    }}
                  />
                  {msg.isReport && onEnterNextLevel && (
                    <ReportAction onClick={() => onEnterNextLevel(msg.id)}>
                      进入下一关
                    </ReportAction>
                  )}
                </TextBubble>
              )}
            </div>
            {msg.showTranscript && <TranscriptText>{msg.text}</TranscriptText>}
          </MessageContent>

          {msg.role === 'user' && <Avatar $isUser={true}>Me</Avatar>}
        </MessageRow>
      ))}
      <div ref={chatEndRef} />
    </ChatWindowFrame>
  );
}
