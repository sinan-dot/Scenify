"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type MediaPlaybackValue = {
  isPlayingVideo: boolean;
  notifyVideoPlay: (video: HTMLVideoElement) => void;
  notifyVideoEnd: (video: HTMLVideoElement) => void;
  notifyVideoUnmount: (video: HTMLVideoElement | null) => void;
};

const MediaPlaybackContext = createContext<MediaPlaybackValue | null>(null);

function collectRemovedVideos(node: Node, videos: HTMLVideoElement[]) {
  if (node instanceof HTMLVideoElement) {
    videos.push(node);
    return;
  }

  if (node instanceof Element) {
    node.querySelectorAll('video').forEach((video) => videos.push(video));
  }
}

export function MediaPlaybackProvider({
  children,
  bgmRef,
}: {
  children: React.ReactNode;
  bgmRef: React.RefObject<HTMLAudioElement | null>;
}) {
  const activeVideosRef = useRef<Set<HTMLVideoElement>>(new Set());
  const bgmWasPlayingBeforeVideoRef = useRef(false);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);

  const refreshVideoState = useCallback(() => {
    activeVideosRef.current.forEach((video) => {
      if (!video.isConnected || video.ended) {
        activeVideosRef.current.delete(video);
      }
    });
    setIsPlayingVideo(activeVideosRef.current.size > 0);
  }, []);

  const notifyVideoPlay = useCallback((video: HTMLVideoElement) => {
    const bgm = bgmRef.current;

    activeVideosRef.current.add(video);
    setIsPlayingVideo(true);

    if (bgm && !bgm.paused) {
      bgmWasPlayingBeforeVideoRef.current = true;
      bgm.pause();
    }
  }, [bgmRef]);

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
      activeVideosRef.current.clear();
      setIsPlayingVideo(false);
      if (bgmWasPlayingBeforeVideoRef.current) {
        bgmWasPlayingBeforeVideoRef.current = false;
        bgmRef.current?.play().catch(() => {});
      }
    };
  }, [bgmRef, notifyVideoEnd, notifyVideoPlay, restoreBgmIfReady]);

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
