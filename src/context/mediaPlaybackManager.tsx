"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type MediaPlaybackValue = {
  isPlayingVideo: boolean;
  notifyVideoPlay: (video: HTMLVideoElement) => void;
  notifyVideoEnd: (video: HTMLVideoElement) => void;
  notifyVideoUnmount: (video: HTMLVideoElement | null) => void;
};

type MediaPlaybackProviderProps = {
  children: React.ReactNode;
  bgmRef: React.RefObject<HTMLAudioElement | null>;
  currentLevelId: number;
  currentBgmSrc: string;
};

const MediaPlaybackContext = createContext<MediaPlaybackValue | null>(null);
const BGM_SWITCH_FADE_OUT_MS = 360;
const BGM_SWITCH_FADE_IN_MS = 900;

function collectRemovedVideos(node: Node, videos: HTMLVideoElement[]) {
  if (node instanceof HTMLVideoElement) {
    videos.push(node);
    return;
  }

  if (node instanceof Element) {
    node.querySelectorAll('video').forEach((video) => videos.push(video));
  }
}

function clampVolume(volume: number) {
  return Math.max(0, Math.min(1, volume));
}

export function MediaPlaybackProvider({
  children,
  bgmRef,
  currentLevelId,
  currentBgmSrc,
}: MediaPlaybackProviderProps) {
  const activeVideosRef = useRef<Set<HTMLVideoElement>>(new Set());
  const bgmWasPlayingBeforeVideoRef = useRef(false);
  const bgmSourceRef = useRef<string>('');
  const fadeFrameRef = useRef<number | null>(null);
  const switchTokenRef = useRef<symbol | null>(null);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);

  const cancelFade = useCallback(() => {
    if (fadeFrameRef.current !== null) {
      window.cancelAnimationFrame(fadeFrameRef.current);
      fadeFrameRef.current = null;
    }
  }, []);

  const fadeAudioVolume = useCallback((
    audio: HTMLAudioElement,
    targetVolume: number,
    duration: number,
    onComplete?: () => void,
  ) => {
    cancelFade();

    const startVolume = audio.volume;
    const startedAt = performance.now();

    const step = (timestamp: number) => {
      const progress = Math.min((timestamp - startedAt) / duration, 1);
      const easedProgress = progress * progress * (3 - 2 * progress);
      audio.volume = clampVolume(startVolume + (targetVolume - startVolume) * easedProgress);

      if (progress >= 1) {
        fadeFrameRef.current = null;
        audio.volume = clampVolume(targetVolume);
        onComplete?.();
        return;
      }

      fadeFrameRef.current = window.requestAnimationFrame(step);
    };

    fadeFrameRef.current = window.requestAnimationFrame(step);
  }, [cancelFade]);

  const refreshVideoState = useCallback(() => {
    activeVideosRef.current.forEach((video) => {
      if (!video.isConnected || video.ended) {
        activeVideosRef.current.delete(video);
      }
    });
    setIsPlayingVideo(activeVideosRef.current.size > 0);
  }, []);

  const pauseBgmForVideo = useCallback(() => {
    const bgm = bgmRef.current;
    if (!bgm || bgm.paused) return;

    bgmWasPlayingBeforeVideoRef.current = true;
    bgm.pause();
  }, [bgmRef]);

  const notifyVideoPlay = useCallback((video: HTMLVideoElement) => {
    activeVideosRef.current.add(video);
    setIsPlayingVideo(true);
    pauseBgmForVideo();
  }, [pauseBgmForVideo]);

  const restoreBgmIfReady = useCallback(() => {
    refreshVideoState();

    if (activeVideosRef.current.size > 0 || !bgmWasPlayingBeforeVideoRef.current) return;

    const bgm = bgmRef.current;
    bgmWasPlayingBeforeVideoRef.current = false;
    bgm?.play().catch(() => {});
  }, [bgmRef, refreshVideoState]);

  const notifyVideoEnd = useCallback((video: HTMLVideoElement) => {
    activeVideosRef.current.delete(video);
    restoreBgmIfReady();
  }, [restoreBgmIfReady]);

  const notifyVideoUnmount = useCallback((video: HTMLVideoElement | null) => {
    if (video) {
      activeVideosRef.current.delete(video);
    }
    restoreBgmIfReady();
  }, [restoreBgmIfReady]);

  useEffect(() => {
    const bgm = bgmRef.current;
    if (!bgm) return;

    const nextSource = currentBgmSrc.trim();
    if (!nextSource || bgmSourceRef.current === nextSource) return;

    const previousVolume = clampVolume(bgm.volume || 0.15);
    const shouldResumePlayback = !bgm.paused;
    const switchToken = Symbol(`bgm-switch-${currentLevelId}`);
    switchTokenRef.current = switchToken;

    const finishSourceSwap = () => {
      if (switchTokenRef.current !== switchToken) return;

      bgm.pause();
      bgm.src = nextSource;
      bgm.load();
      bgmSourceRef.current = nextSource;

      if (activeVideosRef.current.size > 0) {
        bgm.volume = previousVolume;
        return;
      }

      if (!shouldResumePlayback) {
        bgm.volume = previousVolume;
        return;
      }

      bgm.volume = 0;
      bgm.play()
        .then(() => {
          if (switchTokenRef.current !== switchToken) return;
          fadeAudioVolume(bgm, previousVolume, BGM_SWITCH_FADE_IN_MS);
        })
        .catch(() => {
          if (switchTokenRef.current !== switchToken) return;
          bgm.volume = previousVolume;
        });
    };

    if (shouldResumePlayback) {
      fadeAudioVolume(bgm, 0, BGM_SWITCH_FADE_OUT_MS, finishSourceSwap);
      return;
    }

    cancelFade();
    finishSourceSwap();
  }, [bgmRef, cancelFade, currentBgmSrc, currentLevelId, fadeAudioVolume]);

  useEffect(() => {
    const handleVideoPlay = (event: Event) => {
      if (event.target instanceof HTMLVideoElement) {
        notifyVideoPlay(event.target);
      }
    };

    const handleVideoEnded = (event: Event) => {
      if (event.target instanceof HTMLVideoElement) {
        notifyVideoEnd(event.target);
      }
    };

    document.addEventListener('play', handleVideoPlay, true);
    document.addEventListener('ended', handleVideoEnded, true);

    const bgm = bgmRef.current;
    if (bgm && currentBgmSrc && bgmSourceRef.current !== currentBgmSrc) {
      bgm.src = currentBgmSrc;
      bgm.load();
      bgmSourceRef.current = currentBgmSrc;
    }

    const handleBgmPlay = () => {
      if (activeVideosRef.current.size === 0 || !bgm) return;

      bgmWasPlayingBeforeVideoRef.current = true;
      bgm.pause();
    };

    bgm?.addEventListener('play', handleBgmPlay);

    const observer = new MutationObserver((mutations) => {
      let sawRemovedVideo = false;

      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
          const videos: HTMLVideoElement[] = [];
          collectRemovedVideos(node, videos);

          videos.forEach((video) => {
            if (activeVideosRef.current.delete(video)) {
              sawRemovedVideo = true;
            }
          });
        });
      });

      if (sawRemovedVideo) {
        restoreBgmIfReady();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      document.removeEventListener('play', handleVideoPlay, true);
      document.removeEventListener('ended', handleVideoEnded, true);
      bgm?.removeEventListener('play', handleBgmPlay);
      observer.disconnect();
      cancelFade();
      switchTokenRef.current = null;
      activeVideosRef.current.clear();
      setIsPlayingVideo(false);
      if (bgmWasPlayingBeforeVideoRef.current) {
        bgmWasPlayingBeforeVideoRef.current = false;
        bgmRef.current?.play().catch(() => {});
      }
    };
  }, [bgmRef, cancelFade, currentBgmSrc, notifyVideoEnd, notifyVideoPlay, restoreBgmIfReady]);

  const value = useMemo<MediaPlaybackValue>(() => ({
    isPlayingVideo,
    notifyVideoPlay,
    notifyVideoEnd,
    notifyVideoUnmount,
  }), [isPlayingVideo, notifyVideoEnd, notifyVideoPlay, notifyVideoUnmount]);

  return (
    <MediaPlaybackContext.Provider value={value}>
      {children}
    </MediaPlaybackContext.Provider>
  );
}

export function useMediaPlayback() {
  const context = useContext(MediaPlaybackContext);
  if (!context) {
    throw new Error('useMediaPlayback must be used inside MediaPlaybackProvider');
  }
  return context;
}
