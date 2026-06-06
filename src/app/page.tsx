"use client";

import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { AudioRecorder } from '@/components/audioRecorder';
import { ChatWindow, type ChatWindowMessage } from '@/components/chatWindow';
import { MapTransition } from '@/components/MapTransition';
import { PronunciationFeedback } from '@/components/pronunciationFeedback';
import { TaskPanel } from '@/components/taskPanel';
import { LevelManagerProvider, useLevelManager } from '@/context/levelManager';
import { MediaPlaybackProvider, useMediaPlayback } from '@/context/mediaPlaybackManager';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import type { SpeechEvaluationResult, TaskValidationResult } from '@/lib/types';

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

const BackgroundLayer = styled.div<{ $blur: boolean; $image: string }>`
  position: absolute;
  inset: 0;
  background-image: url('${props => props.$image}');
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

function ManagedFullScreenVideo({
  src,
  onEnded,
}: {
  src: string;
  onEnded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { notifyVideoPlay, notifyVideoEnd, notifyVideoUnmount } = useMediaPlayback();

  useEffect(() => {
    const video = videoRef.current;
    return () => notifyVideoUnmount(video);
  }, [notifyVideoUnmount]);

  return (
    <FullScreenVideo
      ref={videoRef}
      autoPlay
      src={src}
      onPlay={(event) => notifyVideoPlay(event.currentTarget)}
      onEnded={(event) => {
        notifyVideoEnd(event.currentTarget);
        onEnded();
      }}
    />
  );
}

type Message = ChatWindowMessage;

const BGM_IDLE_VOLUME = 0.15;
const BGM_DUCK_VOLUME = 0.05;
const BGM_RECORDING_VOLUME = 0;
const NPC_VOICE_VOLUME = 1.0;
const BGM_FADE_DURATION_MS = 500;
const BGM_RESTORE_FADE_DURATION_MS = 2500;
const MIC_RELEASE_COOLDOWN_MS = 900;

function clampVolume(volume: number) {
  return Math.max(0, Math.min(1, volume));
}

function renderNarrative(text: string) {
  return text.split('\n').map((line, index) => (
    <React.Fragment key={`${line}-${index}`}>
      {line}
      {index < text.split('\n').length - 1 && <br />}
    </React.Fragment>
  ));
}

function cleanSpeechText(text: string) {
  return text.replace(/\*.*?\*/g, '').replace(/\(.*?\)/g, '').trim();
}

function hasEnglishSpeechText(text: string) {
  return /[A-Za-z]/.test(text.trim());
}

function scoreConfuciusVoice(voice: SpeechSynthesisVoice) {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();
  let score = 0;

  if (lang.startsWith('en')) score += 30;
  if (lang.includes('gb') || lang.includes('uk')) score += 10;
  if (lang.includes('us')) score += 6;
  if (voice.localService) score += 5;

  const olderOrDeeperVoiceNames = [
    'daniel',
    'george',
    'david',
    'james',
    'arthur',
    'oliver',
    'rishi',
    'google uk english male',
    'microsoft george',
    'microsoft david',
  ];
  const olderButLessNaturalVoiceNames = [
    'grandpa',
    'fred',
    'ralph',
    'albert',
  ];

  const youngOrBrightVoiceNames = [
    'alex',
    'junior',
    'child',
    'kid',
    'young',
    'samantha',
    'zira',
    'susan',
    'karen',
    'victoria',
    'tessa',
    'female',
  ];

  if (olderOrDeeperVoiceNames.some((keyword) => name.includes(keyword))) {
    score += 70;
  }

  if (olderButLessNaturalVoiceNames.some((keyword) => name.includes(keyword))) {
    score += 35;
  }

  if (name.includes('male')) score += 25;
  if (youngOrBrightVoiceNames.some((keyword) => name.includes(keyword))) score -= 45;
  if (!lang.startsWith('en')) score -= 50;

  return score;
}

function isYoungOrBrightVoice(voice: SpeechSynthesisVoice) {
  const name = voice.name.toLowerCase();
  return [
    'alex',
    'junior',
    'child',
    'kid',
    'young',
    'samantha',
    'zira',
    'susan',
    'karen',
    'victoria',
    'tessa',
    'female',
  ].some((keyword) => name.includes(keyword));
}

function selectConfuciusVoice(voices: SpeechSynthesisVoice[]) {
  const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  const matureVoices = englishVoices.filter((voice) => !isYoungOrBrightVoice(voice));
  const candidateVoices = matureVoices.length > 0 ? matureVoices : englishVoices;

  return candidateVoices
    .sort((a, b) => scoreConfuciusVoice(b) - scoreConfuciusVoice(a))[0];
}

function loadSpeechVoices() {
  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();

    if (voices.length > 0) {
      resolve(voices);
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener('voiceschanged', finish);
      resolve(synth.getVoices());
    };

    synth.addEventListener('voiceschanged', finish);
    window.setTimeout(finish, 500);
  });
}

const Main: React.FC = () => {
  const {
    currentLevel,
    currentLevelIndex,
    gameState,
    taskStatus,
    setGameState,
    applyTaskValidation,
    completeAllTasks,
    goToNextLevel,
  } = useLevelManager();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
  const [inputText, setInputText] = useState('');
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [displayedNarrative, setDisplayedNarrative] = useState(currentLevel.narrative);
  const [isNarrativeComplete, setIsNarrativeComplete] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [isAwaitingNpc, setIsAwaitingNpc] = useState(false);
  const [isLevelCleared, setIsLevelCleared] = useState(false);
  const [pronunciationResult, setPronunciationResult] = useState<SpeechEvaluationResult | null>(null);
  const [isEvaluatingSpeech, setIsEvaluatingSpeech] = useState(false);
  const [pronunciationError, setPronunciationError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const openingTimerRef = useRef<number | null>(null);
  const fallbackSpeechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const pendingOpeningTextRef = useRef<string | null>(null);
  const audioElementsByUrlRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const preloadedAudioElementsRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  const bgmFadeFrameRef = useRef<number | null>(null);
  const bgmRestoreTimerRef = useRef<number | null>(null);
  const bgmWasPlayingBeforeRecordingRef = useRef(false);
  const isNpcSpeakingRef = useRef(false);
  const isRecordingRef = useRef(false);
  const outputBlockedUntilRef = useRef(0);
  const activeSpeechAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeSpeechTokenRef = useRef<symbol | null>(null);
  const levelSessionRef = useRef(0);
  const activeRecordingSessionRef = useRef(0);
  const isLevelClearedRef = useRef(false);

  const getOutputBlockDelay = () => Math.max(0, outputBlockedUntilRef.current - Date.now());
  const isCurrentLevelSession = (sessionId: number) => sessionId === levelSessionRef.current;

  const waitForOutputReady = async () => {
    while (isRecordingRef.current || getOutputBlockDelay() > 0) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, Math.max(50, getOutputBlockDelay()));
      });
    }
  };

  const stopActiveSpeech = () => {
    activeSpeechTokenRef.current = null;
    isNpcSpeakingRef.current = false;

    const fallbackSpeech = fallbackSpeechRef.current;
    if (fallbackSpeech) {
      fallbackSpeech.onend = null;
      fallbackSpeech.onerror = null;
      fallbackSpeechRef.current = null;
    }

    window.speechSynthesis.cancel();

    const activeAudio = activeSpeechAudioRef.current;
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.onended = null;
      activeAudio.onerror = null;
      try {
        activeAudio.currentTime = 0;
      } catch {}
      activeSpeechAudioRef.current = null;
      ttsAudioRef.current = null;
    }
  };

  const stopNonBgmOutputs = () => {
    stopActiveSpeech();
    preloadedAudioElementsRef.current.forEach((audio) => {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {}
    });
    audioElementsByUrlRef.current.forEach((audio) => {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {}
    });
  };

  const duckBgmForRecording = () => {
    cancelBgmRestore();
    const bgm = audioRef.current;
    if (!bgm) return;

    bgmWasPlayingBeforeRecordingRef.current = !bgm.paused;
    fadeBgmVolume(BGM_RECORDING_VOLUME, 180);
  };

  const scheduleBgmRestore = () => {
    const bgm = audioRef.current;
    if (!bgm || !audioUnlockedRef.current || !bgmWasPlayingBeforeRecordingRef.current) return;

    cancelBgmRestore();
    bgmRestoreTimerRef.current = window.setTimeout(() => {
      bgmRestoreTimerRef.current = null;

      const remainingDelay = getOutputBlockDelay();
      if (isRecordingRef.current) return;
      if (remainingDelay > 0) {
        scheduleBgmRestore();
        return;
      }

      const targetVolume = isNpcSpeakingRef.current ? BGM_DUCK_VOLUME : BGM_IDLE_VOLUME;
      if (bgm.paused) {
        bgm.volume = clampVolume(Math.min(bgm.volume || BGM_RECORDING_VOLUME, targetVolume));
        bgm.play().then(() => {
          fadeBgmVolume(targetVolume, BGM_RESTORE_FADE_DURATION_MS);
        }).catch(() => {});
        return;
      }

      fadeBgmVolume(targetVolume, BGM_RESTORE_FADE_DURATION_MS);
    }, getOutputBlockDelay());
  };

  const blockAudioOutput = (duration = MIC_RELEASE_COOLDOWN_MS) => {
    outputBlockedUntilRef.current = Math.max(outputBlockedUntilRef.current, Date.now() + duration);
  };

  const getAudioElementForUrl = (audioUrl: string) => {
    const cachedAudio = audioElementsByUrlRef.current.get(audioUrl);
    if (cachedAudio) return cachedAudio;

    const audio = new Audio(audioUrl);
    audio.preload = 'auto';
    audio.volume = NPC_VOICE_VOLUME;
    audio.load();
    audioElementsByUrlRef.current.set(audioUrl, audio);
    return audio;
  };

  const fallbackSpeakText = (text: string, sessionId = levelSessionRef.current) => {
    return new Promise<void>((resolve) => {
      const cleanText = cleanSpeechText(text);
      if (
        !cleanText ||
        !isCurrentLevelSession(sessionId) ||
        typeof window === 'undefined' ||
        !window.speechSynthesis
      ) {
        resolve();
        return;
      }

      void waitForOutputReady().then(async () => {
        if (!isCurrentLevelSession(sessionId)) {
          resolve();
          return;
        }

        stopActiveSpeech();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        const selectedVoice = selectConfuciusVoice(await loadSpeechVoices());

        if (!isCurrentLevelSession(sessionId)) {
          resolve();
          return;
        }

        if (selectedVoice) {
          utterance.voice = selectedVoice;
          utterance.lang = selectedVoice.lang;
        } else {
          utterance.lang = 'en-US';
        }

        utterance.rate = 0.92;
        utterance.pitch = 0.48;
        utterance.volume = NPC_VOICE_VOLUME;
        isNpcSpeakingRef.current = true;
        fadeBgmVolume(BGM_DUCK_VOLUME);
        utterance.onend = () => {
          isNpcSpeakingRef.current = false;
          if (!isRecordingRef.current && getOutputBlockDelay() === 0) fadeBgmVolume(BGM_IDLE_VOLUME);
          resolve();
        };
        utterance.onerror = () => {
          isNpcSpeakingRef.current = false;
          if (!isRecordingRef.current && getOutputBlockDelay() === 0) fadeBgmVolume(BGM_IDLE_VOLUME);
          resolve();
        };

        fallbackSpeechRef.current = utterance;
        window.speechSynthesis.resume();
        window.speechSynthesis.speak(utterance);
      });
    });
  };

  const playAudioElement = async (audio: HTMLAudioElement, shouldWaitForOutput = true) => {
    if (shouldWaitForOutput) {
      await waitForOutputReady();
    } else if (isRecordingRef.current || getOutputBlockDelay() > 0) {
      return;
    }

    stopActiveSpeech();
    const token = Symbol('speech-playback');
    activeSpeechTokenRef.current = token;

    audio.pause();
    audio.currentTime = 0;
    audio.preload = 'auto';
    audio.volume = NPC_VOICE_VOLUME;
    ttsAudioRef.current = audio;
    activeSpeechAudioRef.current = audio;
    isNpcSpeakingRef.current = true;
    fadeBgmVolume(BGM_DUCK_VOLUME);

    await new Promise<void>((resolve) => {
      const finishPlayback = () => {
        if (activeSpeechTokenRef.current === token) {
          activeSpeechTokenRef.current = null;
          activeSpeechAudioRef.current = null;
          ttsAudioRef.current = null;
        }
        isNpcSpeakingRef.current = false;
        if (!isRecordingRef.current && getOutputBlockDelay() === 0) fadeBgmVolume(BGM_IDLE_VOLUME);
        resolve();
      };

      audio.onended = finishPlayback;
      audio.onerror = finishPlayback;
      audio.play().catch(finishPlayback);
    });
  };

  const speakText = async (text: string, sessionId = levelSessionRef.current) => {
    const cleanText = cleanSpeechText(text);
    if (!cleanText || !isCurrentLevelSession(sessionId)) return;

    await fallbackSpeakText(cleanText, sessionId);
  };

  const addMessage = (
    role: 'user' | 'assistant',
    text: string,
    isAudio: boolean,
    audioUrl?: string,
    sessionId = levelSessionRef.current,
    options?: { isReport?: boolean },
  ) => {
    if (!isCurrentLevelSession(sessionId)) {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      return null;
    }

    const newMsg: Message = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      role,
      text,
      isAudio,
      audioUrl,
      duration: Math.min(Math.ceil(text.length / 5), 10) || 3,
      showTranscript: false,
      isReport: options?.isReport,
    };

    if (audioUrl) {
      preloadedAudioElementsRef.current.set(newMsg.id, getAudioElementForUrl(audioUrl));
    }

    setMessages((prev) => [...prev, newMsg]);
    return newMsg;
  };

  const cancelBgmFade = () => {
    if (bgmFadeFrameRef.current) {
      window.cancelAnimationFrame(bgmFadeFrameRef.current);
      bgmFadeFrameRef.current = null;
    }
  };

  const cancelBgmRestore = () => {
    if (bgmRestoreTimerRef.current) {
      window.clearTimeout(bgmRestoreTimerRef.current);
      bgmRestoreTimerRef.current = null;
    }
  };

  const fadeBgmVolume = (
    targetVolume: number,
    duration = BGM_FADE_DURATION_MS,
    onComplete?: () => void,
  ) => {
    const audio = audioRef.current;
    if (!audio) return;

    cancelBgmFade();

    const startVolume = audio.volume;
    const startedAt = performance.now();

    const step = (timestamp: number) => {
      const progress = Math.min((timestamp - startedAt) / duration, 1);
      const easedProgress = progress * progress * (3 - 2 * progress);
      const calculatedVolume = startVolume + (targetVolume - startVolume) * easedProgress;
      audio.volume = clampVolume(calculatedVolume);

      if (progress >= 1) {
        bgmFadeFrameRef.current = null;
        audio.volume = clampVolume(targetVolume);
        onComplete?.();
        return;
      }

      bgmFadeFrameRef.current = window.requestAnimationFrame(step);
    };

    bgmFadeFrameRef.current = window.requestAnimationFrame(step);
  };

  const unlockAudio = async () => {
    audioUnlockedRef.current = true;
    setAudioUnlocked(true);
    window.speechSynthesis.resume();

    const AudioContextConstructor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (AudioContextConstructor && !audioContextRef.current) {
      audioContextRef.current = new AudioContextConstructor();
    }

    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume().catch(() => {});
    }

    if (audioRef.current) {
      audioRef.current.volume = BGM_IDLE_VOLUME;
      await audioRef.current.play().catch(() => {});
    }

    const pendingOpeningText = pendingOpeningTextRef.current;
    if (pendingOpeningText) {
      pendingOpeningTextRef.current = null;
      void speakText(pendingOpeningText, levelSessionRef.current);
    }
  };

  const evaluateRecordedSpeech = async (
    audioBlob: Blob,
    referenceText: string,
    sessionId = levelSessionRef.current,
  ) => {
    const cleanReferenceText = referenceText.trim();
    if (!hasEnglishSpeechText(cleanReferenceText)) {
      throw new Error('No English speech text was recognized for pronunciation assessment.');
    }

    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    formData.append('referenceText', cleanReferenceText);

    const response = await fetch('/api/evaluate-speech', {
      method: 'POST',
      body: formData,
    });

    if (!isCurrentLevelSession(sessionId)) return null;

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Xunfei evaluation failed: ${response.status}`);
    }

    return payload as SpeechEvaluationResult;
  };

  const { isRecording, startRecording, stopRecording } = useAudioRecorder({
    releaseDelayMs: MIC_RELEASE_COOLDOWN_MS,
    onRecorded: async ({ text, audioUrl, evaluationBlob }) => {
      const sessionId = activeRecordingSessionRef.current;
      if (!isCurrentLevelSession(sessionId)) {
        URL.revokeObjectURL(audioUrl);
        return;
      }

      setPronunciationError(null);
      setPronunciationResult(null);

      let spokenText = text.trim();
      if (!hasEnglishSpeechText(spokenText)) {
        setPronunciationError('No English speech was recognized. Please hold the button and speak a full English sentence.');
        URL.revokeObjectURL(audioUrl);
        return;
      }

      setIsEvaluatingSpeech(true);
      try {
        const evaluation = await evaluateRecordedSpeech(evaluationBlob, spokenText, sessionId);
        if (!isCurrentLevelSession(sessionId)) {
          URL.revokeObjectURL(audioUrl);
          return;
        }

        if (evaluation) {
          setPronunciationResult(evaluation);
          if (hasEnglishSpeechText(evaluation.recognizedText)) {
            spokenText = evaluation.recognizedText.trim();
          }
        }
      } catch (error) {
        console.warn('Xunfei speech evaluation failed:', error);
        if (isCurrentLevelSession(sessionId)) {
          setPronunciationError(error instanceof Error ? error.message : 'Speech evaluation failed.');
        }
      } finally {
        if (isCurrentLevelSession(sessionId)) {
          setIsEvaluatingSpeech(false);
        }
      }

      if (!isCurrentLevelSession(sessionId)) {
        URL.revokeObjectURL(audioUrl);
        return;
      }

      if (isLevelClearedRef.current) {
        URL.revokeObjectURL(audioUrl);
        return;
      }

      void handleSend(spokenText, true, audioUrl, sessionId);
    },
  });

  const handleStartRecording = () => {
    if (isLevelClearedRef.current) return;

    activeRecordingSessionRef.current = levelSessionRef.current;
    isRecordingRef.current = true;
    outputBlockedUntilRef.current = 0;
    stopNonBgmOutputs();
    duckBgmForRecording();
    setPlayingId(null);
    void startRecording();
  };

  const handleStopRecording = () => {
    if (isLevelClearedRef.current) return;

    blockAudioOutput(MIC_RELEASE_COOLDOWN_MS);
    stopRecording();
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    levelSessionRef.current += 1;
    activeRecordingSessionRef.current = -1;
    setMessages([]);
    setInputText('');
    setInputMode('text');
    setPlayingId(null);
    setAudioUnlocked(false);
    isLevelClearedRef.current = false;
    setIsAwaitingNpc(false);
    setIsLevelCleared(false);
    setPronunciationResult(null);
    setIsEvaluatingSpeech(false);
    setPronunciationError(null);
    audioUnlockedRef.current = false;
    pendingOpeningTextRef.current = null;
    stopActiveSpeech();
    preloadedAudioElementsRef.current.forEach((audio) => audio.pause());
    preloadedAudioElementsRef.current.clear();
    audioElementsByUrlRef.current.forEach((audio) => {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
    });
    audioElementsByUrlRef.current.clear();
    if (openingTimerRef.current) {
      window.clearTimeout(openingTimerRef.current);
      openingTimerRef.current = null;
    }
    cancelBgmFade();
    cancelBgmRestore();
  }, [currentLevel.id]);

  useEffect(() => {
    if (gameState !== 'start') return;

    if (currentLevelIndex === 0) {
      setDisplayedNarrative(currentLevel.narrative);
      setIsNarrativeComplete(true);
      return;
    }

    let index = 0;
    setDisplayedNarrative('');
    setIsNarrativeComplete(false);

    const timer = window.setInterval(() => {
      index += 1;
      setDisplayedNarrative(currentLevel.narrative.slice(0, index));

      if (index >= currentLevel.narrative.length) {
        window.clearInterval(timer);
        setIsNarrativeComplete(true);
      }
    }, 70);

    return () => window.clearInterval(timer);
  }, [currentLevel.id, currentLevel.narrative, currentLevelIndex, gameState]);

  useEffect(() => {
    if (gameState !== 'start' || currentLevelIndex === 0 || !isNarrativeComplete) return;

    const timer = window.setTimeout(() => {
      handleStart(false);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [currentLevelIndex, gameState, isNarrativeComplete]);

  useEffect(() => {
    if (
      gameState === 'game' &&
      taskStatus.length > 0 &&
      taskStatus.every(Boolean) &&
      !isAwaitingNpc
    ) {
      isLevelClearedRef.current = true;
      setIsLevelCleared(true);
    }
  }, [gameState, isAwaitingNpc, taskStatus]);

  useEffect(() => {
    return () => {
      stopActiveSpeech();
      preloadedAudioElementsRef.current.forEach((audio) => audio.pause());
      audioElementsByUrlRef.current.forEach((audio) => audio.pause());
      if (openingTimerRef.current) window.clearTimeout(openingTimerRef.current);
      cancelBgmFade();
      cancelBgmRestore();
    };
  }, []);

  useEffect(() => {
    isRecordingRef.current = isRecording;
    const bgm = audioRef.current;
    if (!bgm) return;

    if (isRecording) {
      duckBgmForRecording();
      return;
    }

    scheduleBgmRestore();
  }, [isRecording]);

  const handleStart = (shouldUnlockAudio = false) => {
    if (shouldUnlockAudio) {
      void unlockAudio();
    }

    setGameState('map-transition');
    if (audioRef.current) {
      audioRef.current.volume = BGM_IDLE_VOLUME;
      audioRef.current.play().catch(() => {});
    }
  };

  const handleMapTransitionComplete = () => {
    setGameState('intro-video');
  };

  const handleVideoEnd = () => {
    if (gameState === 'intro-video') {
      setGameState('game');
      const introText = currentLevel.initialGreeting;
      const sessionId = levelSessionRef.current;

      openingTimerRef.current = window.setTimeout(() => {
        if (!isCurrentLevelSession(sessionId)) {
          openingTimerRef.current = null;
          return;
        }

        addMessage('assistant', introText, true, undefined, sessionId);
        if (audioUnlockedRef.current) {
          void speakText(introText, sessionId);
        } else {
          pendingOpeningTextRef.current = introText;
        }
        openingTimerRef.current = null;
      }, 1000);
    } else if (gameState === 'end-video') {
      levelSessionRef.current += 1;
      goToNextLevel();
    }
  };

  const handlePlayFinalVideo = () => {
    if (!isLevelClearedRef.current) return;

    stopNonBgmOutputs();
    setInputText('');
    setInputMode('text');
    setPlayingId(null);
    setGameState('end-video');
  };

  const playBubble = (msg: Message) => {
    setPlayingId(msg.id);

    if (msg.role === 'user' && msg.audioUrl) {
      const userAudio = preloadedAudioElementsRef.current.get(msg.id) || getAudioElementForUrl(msg.audioUrl);
      void playAudioElement(userAudio, false).finally(() => setPlayingId(null));
      return;
    }

    if (msg.audioUrl) {
      const npcAudio = preloadedAudioElementsRef.current.get(msg.id) || getAudioElementForUrl(msg.audioUrl);
      void playAudioElement(npcAudio, false).finally(() => setPlayingId(null));
      return;
    }

    void fallbackSpeakText(msg.text).finally(() => setPlayingId(null));
  };

  const generateReport = async (sessionId = levelSessionRef.current) => {
    if (!isCurrentLevelSession(sessionId)) return;

    const userText = messages.filter((message) => message.role === 'user').map((message) => message.text).join('\n');
    addMessage('assistant', '📝 正在生成您的口语纠正报告...', false, undefined, sessionId);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `[SYSTEM_REPORT_MODE] ${userText}`, history: [] }),
      });
      if (!res.ok) {
        throw new Error(`Report request failed: ${res.status}`);
      }
      const data = await res.json();
      if (!isCurrentLevelSession(sessionId)) return;
      addMessage('assistant', data.reply, false, undefined, sessionId, { isReport: true });
    } catch (error) {
      console.error('Report generation failed:', error);
      addMessage('assistant', '报告生成失败 (API Error)', false, undefined, sessionId);
    }
  };

  const handleSend = async (
    text: string,
    asAudio: boolean,
    audioUrl?: string,
    sessionId = levelSessionRef.current,
  ) => {
    if (isLevelClearedRef.current || !text.trim() || !isCurrentLevelSession(sessionId)) {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      return;
    }

    setInputText('');

    if (text.trim().toLowerCase() === 'test') {
      completeAllTasks();
      await generateReport(sessionId);
      return;
    }

    const userMessage = addMessage('user', text, asAudio, audioUrl, sessionId);
    if (!userMessage) return;

    setIsAwaitingNpc(true);
    const nextHistory = [...messages, userMessage];

    try {
      void fetch('/api/validate-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ levelId: currentLevel.id, history: nextHistory }),
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Task validator request failed: ${response.status}`);
          }

          const validation = await response.json() as TaskValidationResult;
          if (isCurrentLevelSession(sessionId)) {
            applyTaskValidation(validation);
          }
        })
        .catch((error) => {
          console.warn('Task validator request failed:', error);
        });

      const chatResponse = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history: messages, levelId: currentLevel.id }),
      });

      if (!isCurrentLevelSession(sessionId)) return;

      if (!chatResponse.ok) {
        throw new Error(`Chat request failed: ${chatResponse.status}`);
      }

      const data = await chatResponse.json();
      const reply = data.reply || '';

      if (reply) {
        addMessage('assistant', reply, true, undefined, sessionId);
        void speakText(reply, sessionId);
      }
    } catch (error) {
      console.error('API 请求失败:', error);
      if (!isCurrentLevelSession(sessionId)) return;
      const fallbackText = 'The connection is unstable, like ripples in a pond... (API Error)';
      addMessage('assistant', fallbackText, true, undefined, sessionId);
      void speakText(fallbackText, sessionId);
    } finally {
      if (isCurrentLevelSession(sessionId)) {
        setIsAwaitingNpc(false);
      }
    }
  };

  return (
    <MediaPlaybackProvider bgmRef={audioRef}>
      <Page>
        <audio ref={audioRef} loop src={currentLevel.media.bgm} />
        <BackgroundLayer $blur={gameState === 'start'} $image={currentLevel.media.background} />

        {gameState === 'start' && (
          <IntroOverlay>
            <IntroText>{renderNarrative(displayedNarrative)}</IntroText>
            <StartButton onClick={() => handleStart(true)}>BEGIN JOURNEY</StartButton>
          </IntroOverlay>
        )}

        {gameState === 'map-transition' && (
          <MapTransition
            mapData={currentLevel.mapData}
            onComplete={handleMapTransitionComplete}
          />
        )}

        {(gameState === 'intro-video' || gameState === 'end-video') && (
          <VideoOverlay>
            <ManagedFullScreenVideo
              src={gameState === 'intro-video' ? currentLevel.media.video : currentLevel.media.outroVideo}
              onEnded={handleVideoEnd}
            />
            <button
              onClick={handleVideoEnd}
              style={{
                position: 'absolute',
                top: 30,
                right: 30,
                zIndex: 31,
                background: 'transparent',
                color: '#fbbf24',
                border: '1px solid #fbbf24',
                padding: '5px 15px',
              }}
            >
              Skip
            </button>
          </VideoOverlay>
        )}

        {gameState === 'game' && (
          <>
            <LeftSection>
              <ChatWindow
                messages={messages}
                npcAvatarLabel={currentLevel.npcAvatarLabel}
                playingId={playingId}
                chatEndRef={chatEndRef}
                onPlayMessage={playBubble}
                onToggleTranscript={(messageId) => {
                  setMessages((prev) => prev.map((message) => (
                    message.id === messageId
                      ? { ...message, showTranscript: !message.showTranscript }
                      : message
                  )));
                }}
              />

              <PronunciationFeedback
                result={pronunciationResult}
                isLoading={isEvaluatingSpeech}
                error={pronunciationError}
              />

              <AudioRecorder
                hints={currentLevel.hints}
                inputMode={inputMode}
                inputText={inputText}
                isRecording={isRecording}
                completionSummary={isLevelCleared ? currentLevel.completionSummary : undefined}
                onInputModeChange={setInputMode}
                onInputTextChange={setInputText}
                onSendText={() => void handleSend(inputText, false)}
                onStartRecording={handleStartRecording}
                onStopRecording={handleStopRecording}
                onPlayFinalVideo={handlePlayFinalVideo}
              />
            </LeftSection>

            <TaskPanel
              title={currentLevel.displayTitle}
              tasks={currentLevel.tasks}
              taskStatus={taskStatus}
            />

            {!audioUnlocked && (
              <IntroOverlay>
                <IntroText>Click to start this level.</IntroText>
                <StartButton onClick={() => void unlockAudio()}>CLICK TO START</StartButton>
              </IntroOverlay>
            )}
          </>
        )}
      </Page>
    </MediaPlaybackProvider>
  );
};

export default function PageRoot() {
  return (
    <LevelManagerProvider>
      <Main />
    </LevelManagerProvider>
  );
}
