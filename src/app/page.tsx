"use client";
import React, { useState, useRef, useEffect } from 'react';
import styled, { css } from 'styled-components';
// --- 新增引用 ---
import levelsData from '../data/levels.json'; // 引入剧本数据
import IntroVideoPlayer from '../components/IntroVideoPlayer';// 引入视频组件
import LevelCompleteModal from '../components/LevelCompleteModal';// 引入弹窗组件
// ----------------

// ================= 1. 样式定义 (保持不变) =================

const Page = styled.div`
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  color: #fff;
  font-family: 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', serif;
  background-color: #000;
  position: relative;
  * { box-sizing: border-box; }
`;

const BackgroundLayer = styled.div<{ $blur: boolean }>`
  position: absolute;
  inset: 0;
  background-image: url('/assets/level-1/bg.png');
  background-size: cover;
  background-position: center;
  transition: filter 1s ease;
  filter: ${props => props.$blur ? 'blur(15px) brightness(0.6)' : 'none'};
  z-index: 0;
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle, transparent 60%, rgba(0,0,0,0.6) 100%);
    pointer-events: none;
  }
`;

const LeftSection = styled.div`
  width: 70%;
  height: 100%;
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 40px;
  gap: 20px;
`;

const ChatWindow = styled.div`
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

// 报告卡片 (玻璃磨砂风格)
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

const RightSection = styled.div`
  width: 30%;
  height: 100%;
  background-color: rgba(255, 255, 255, 0.25); 
  backdrop-filter: blur(16px); 
  padding: 150px 30px 60px 30px; 
  display: flex;
  flex-direction: column;
  z-index: 10;
  border-left: 1px solid rgba(255, 255, 255, 0.4);
  color: #000;
  box-sizing: border-box;
`;

const Header = styled.h1`
  font-size: 2.2rem;
  margin-bottom: 40px;
  font-weight: bold; 
  color: #000000;
  border-bottom: 2px solid rgba(0, 0, 0, 0.8);
  padding-bottom: 20px;
`;

const TaskList = styled.ul`
  list-style: none;
  padding: 0;
`;

const TaskItem = styled.li<{ $done: boolean }>`
  margin-bottom: 25px;
  font-size: 1.2rem;
  color: ${props => props.$done ? '#b45309' : '#1e293b'}; 
  font-weight: ${props => props.$done ? 'bold' : 'normal'};
  cursor: pointer;
  transition: all 0.5s ease;
  display: flex;
  align-items: center;
  &:hover { color: #b45309; transform: translateX(10px); }
  &::before { 
    content: '${props => props.$done ? '✔' : '◈'}'; 
    color: #b45309; 
    margin-right: 12px; 
  }
`;

const IntroOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 50; 
  background: rgba(0, 0, 0, 0.7); 
  text-align: center;
  padding: 0 10%;
`;

const IntroText = styled.p`
  color: #fbbf24; 
  font-family: 'Times New Roman', serif; 
  font-style: italic; 
  font-size: 1.5rem;
  line-height: 2;
  margin-bottom: 80px;
  max-width: 800px;
`;

const StartButton = styled.button`
  padding: 15px 50px;
  font-size: 1rem;
  background: #b45309; 
  color: #000; 
  font-weight: bold;
  border: none;
  cursor: pointer;
  font-family: 'Times New Roman', serif;
  text-transform: uppercase; 
  letter-spacing: 2px;
  transition: all 0.3s;
  &:hover { background: #fbbf24; transform: scale(1.05); }
`;

const VideoOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: black;
  z-index: 30;
`;

const FullScreenVideo = styled.video`
  width: 100%;
  height: 100%;
  object-fit: contain;
`;

const HintKeywords = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 0.9rem;
  color: #e2e8f0;
`;
const Keyword = styled.span`
  color: #fbbf24; font-weight: 600; background: rgba(0,0,0,0.4); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(251,191,36,0.2);
`;

// ================= 2. 逻辑组件 =================

type Message = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  isAudio: boolean; 
  audioUrl?: string;
  duration?: number;
  showTranscript: boolean;
};

const Main: React.FC = () => {
  const [gameState, setGameState] = useState('start');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
  const [isRecording, setIsRecording] = useState(false);
  const [inputText, setInputText] = useState("");
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [taskStatus, setTaskStatus] = useState([false, false, false]);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      // @ts-ignore
      const recognition = new window.webkitSpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (e: any) => {
        let final = "";
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) final += e.results[i][0].transcript;
        }
        if (final) transcriptRef.current += final + " ";
      };
      recognitionRef.current = recognition;
    }
  }, []);

  const handleStart = () => {
    setGameState('intro-video');
    if (audioRef.current) {
        audioRef.current.volume = 0.05; 
        audioRef.current.play().catch(() => {});
    }
  };

  const handleVideoEnd = () => {
    if (gameState === 'intro-video') {
      setGameState('game');
      // ★★★ 核心修复：直接在前端伪造第一句，不调用API，确保100%成功 ★★★
      const introText = "Welcome, traveler. Is it the chaos of the world that drives you here?";
      setTimeout(() => {
          addMessage('assistant', introText, true, undefined);
          // 顺便让它自动朗读一下，增加真实感
          speakText(introText);
      }, 1000);
    } else if (gameState === 'end-video') {
      setGameState('level-2');
    }
  };

  const addMessage = (role: 'user' | 'assistant', text: string, isAudio: boolean, audioUrl?: string) => {
    const newMsg: Message = {
        id: Date.now(),
        role,
        text,
        isAudio,
        audioUrl,
        duration: Math.min(Math.ceil(text.length / 5), 10) || 3,
        showTranscript: false
    };
    setMessages(prev => [...prev, newMsg]);
    
    // 如果是NPC回复（非第一句，因为第一句在handleVideoEnd里手动读了），自动朗读
    if (role === 'assistant' && isAudio && !text.includes("###") && messages.length > 0) { 
        speakText(text);
    }
    return newMsg;
  };

  const speakText = (text: string) => {
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/\*.*?\*/g, '').replace(/\(.*?\)/g, '').trim();
    if (!cleanText) return;

    const u = new SpeechSynthesisUtterance(cleanText);
    u.lang = 'en-US';
    u.rate = 0.65; 
    u.pitch = 0.5; 
    
    const voices = window.speechSynthesis.getVoices();
    const maleVoice = voices.find(v => v.name.includes('Google US English') || v.name.includes('David'));
    if (maleVoice) u.voice = maleVoice;
    
    window.speechSynthesis.speak(u);
  };

  const playBubble = (msg: Message) => {
    setPlayingId(msg.id);
    if (msg.role === 'user' && msg.audioUrl) {
        const userAudio = new Audio(msg.audioUrl);
        userAudio.play();
        userAudio.onended = () => setPlayingId(null);
    } else {
        speakText(msg.text);
        setTimeout(() => setPlayingId(null), (msg.duration || 3) * 1000);
    }
  };

  const startRec = async () => {
    transcriptRef.current = "";
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
        recorder.start();
        recognitionRef.current?.start();
        setIsRecording(true);
    } catch (e) {
        console.warn("Mic busy, forcing reset");
        setIsRecording(true); // 假装成功防止红屏
    }
  };
  
  const stopRec = () => {
    if (!isRecording) return;
    try {
        recognitionRef.current?.stop();
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
        
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp3' });
                const audioUrl = URL.createObjectURL(audioBlob);
                setTimeout(() => {
                    const text = transcriptRef.current.trim() || "(Sound recorded)";
                    handleSend(text, true, audioUrl);
                }, 500);
            };
        }
    } catch(e) { console.warn(e); setIsRecording(false); }
  };

  const generateReport = async () => {
    const userText = messages.filter(m => m.role === 'user').map(m => m.text).join("\n");
    addMessage('assistant', "📝 正在生成您的口语纠正报告...", false, undefined);

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ message: "[SYSTEM_REPORT_MODE] " + userText, history: [] })
        });
        const data = await res.json();
        addMessage('assistant', data.reply, false, undefined);
    } catch(e) {
        addMessage('assistant', "报告生成失败 (API Error)", false, undefined);
    }
  };
  const handleSend = async (text: string, asAudio: boolean, audioUrl?: string) => {
    if (!text) return;
    setInputText("");

    if (text.trim().toLowerCase() === 'test') {
        setTaskStatus([true, true, true]);
        await generateReport();
        return;
    }

    addMessage('user', text, asAudio, audioUrl);

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ message: text, history: messages }) 
        });
        
        // 1. 接收后端传来的 JSON 结构化数据包
        const data = await res.json();
        
        // 解析数据（对应我们在 route.ts 里定义的字段）
        const reply = data.reply || "";
        const isCompleted = data.isTaskCompleted;
        const emotion = data.emotion;

        // 2. 将 NPC 的回复显示在聊天框并自动朗读
        if (reply) {
            addMessage('assistant', reply, true, undefined);
        }

        // 3. 【核心机制】任务顺序解锁逻辑
        if (isCompleted) {
            setTaskStatus(prev => {
                const newStatus = [...prev];
                // 找到当前 taskStatus 数组里第一个为 false（未完成）的任务下标
                const nextUnfinishedIndex = newStatus.indexOf(false); 
                
                if (nextUnfinishedIndex !== -1) {
                    newStatus[nextUnfinishedIndex] = true; // 勾选该任务
                    
                    // 可以在浏览器控制台看看 AI 的情绪反馈
                    console.log(`🎉 任务 ${nextUnfinishedIndex + 1} 完成！老子当前情绪：${emotion}`);
                    
                    // 如果发现刚刚完成的是最后一个任务（索引为 2），则触发关卡结束逻辑
                    if (nextUnfinishedIndex === 2) {
                        // 延迟 5 秒让玩家看完最后一句对话，然后播放结尾视频
                        setTimeout(() => setGameState('end-video'), 5000); 
                    }
                }
                return newStatus;
            });
        }

    } catch (e) {
        console.error("API 请求失败:", e);
        addMessage('assistant', "The connection is unstable, like ripples in a pond... (API Error)", true, undefined);
    }
  };
  return (
    <Page>
      <audio ref={audioRef} loop src="/assets/level-1/music-theme.mp3" />
      <BackgroundLayer $blur={gameState === 'start'} />

      {gameState === 'start' && (
        <IntroOverlay>
            <IntroText>
              In the middle of the Spring and Autumn Period, rituals collapsed. <br/><br/>
              Confucius, with the ambition of benevolent governance, traveled to Luoyang...
            </IntroText>
            <StartButton onClick={handleStart}>BEGIN JOURNEY</StartButton>
        </IntroOverlay>
      )}

      {(gameState === 'intro-video' || gameState === 'end-video') && (
        <VideoOverlay>
            <FullScreenVideo 
                autoPlay 
                src={gameState === 'intro-video' ? "/assets/level-1/video-intro.mp4" : "/assets/level-1/video-end.mp4"}
                onEnded={handleVideoEnd}
            />
            <button onClick={handleVideoEnd} style={{position:'absolute', top:30, right:30, zIndex:31, background:'transparent', color:'#fbbf24', border:'1px solid #fbbf24', padding:'5px 15px'}}>Skip</button>
        </VideoOverlay>
      )}

      {gameState === 'game' && (
        <>
            <LeftSection>
                <ChatWindow>
                    {messages.map(msg => (
                        <MessageRow key={msg.id} $isUser={msg.role === 'user'}>
                            {msg.role === 'assistant' && <Avatar $isUser={false}>L</Avatar>}
                            
                            <MessageContent style={{alignItems: msg.role==='user'?'flex-end':'flex-start'}}>
                                <div style={{display:'flex', gap:'5px', alignItems:'center'}}>
                                    
                                    {msg.isAudio ? (
                                        <>
                                            <AudioBubble 
                                                $isUser={msg.role === 'user'}
                                                $playing={playingId === msg.id}
                                                onClick={() => playBubble(msg)}
                                            >
                                                <span className="wave-icon">
                                                    {msg.role === 'user' ? '((•))' : '🔊'}
                                                </span>
                                                <span>{msg.duration}"</span>
                                            </AudioBubble>
                                            
                                            <ConvertBtn onClick={() => {
                                                setMessages(prev => prev.map(m => m.id===msg.id ? {...m, showTranscript:!m.showTranscript} : m));
                                            }}>
                                                {msg.showTranscript ? 'Hide' : 'A→文'}
                                            </ConvertBtn>
                                        </>
                                    ) : (
                                        <TextBubble dangerouslySetInnerHTML={{ 
                                            __html: msg.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
                                        }} />
                                    )}
                                </div>
                                {msg.showTranscript && <TranscriptText>{msg.text}</TranscriptText>}
                            </MessageContent>

                            {msg.role === 'user' && <Avatar $isUser={true}>Me</Avatar>}
                        </MessageRow>
                    ))}
                    <div ref={chatEndRef} />
                </ChatWindow>

                <BottomPanel>
                    <HintKeywords>
                        <span>🔑 Keywords:</span>
                        <Keyword>Tao</Keyword>
                        <Keyword>Benevolence</Keyword>
                    </HintKeywords>

                    <InputGroup>
                        <SwitchModeBtn onClick={() => setInputMode(prev => prev === 'text' ? 'voice' : 'text')}>
                            {inputMode === 'text' ? '🎙️' : '⌨️'}
                        </SwitchModeBtn>

                        {inputMode === 'text' ? (
                            <TextInput 
                                placeholder="Type 'test' to finish..." 
                                value={inputText}
                                onChange={e => setInputText(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSend(inputText, false)}
                            />
                        ) : (
                            <VoiceHoldBtn 
                                $recording={isRecording}
                                onMouseDown={startRec}
                                onMouseUp={stopRec}
                                onMouseLeave={stopRec}
                            >
                                {isRecording ? "Listening..." : "Hold to Speak"}
                            </VoiceHoldBtn>
                        )}

                        {inputMode === 'text' && (
                            <SendButton onClick={() => handleSend(inputText, false)}>Send</SendButton>
                        )}
                    </InputGroup>
                </BottomPanel>
            </LeftSection>

            <RightSection>
                <Header>The Way of Tao</Header>
                <TaskList>
                    <TaskItem $done={taskStatus[0]}>Greeting the Master</TaskItem>
                    <TaskItem $done={taskStatus[1]}>Discussing Benevolence</TaskItem>
                    <TaskItem $done={taskStatus[2]}>Farewell to Lu</TaskItem>
                </TaskList>
            </RightSection>
        </>
      )}
    </Page>
  );
};

export default Main;