// src/components/IntroVideoPlayer.tsx
import React, { useRef, useState } from 'react';

interface Props {
  videoSrc: string;
  narrative: string;
  onFinished: () => void;
}

export default function IntroVideoPlayer({ videoSrc, narrative, onFinished }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center">
      <div className="relative w-full h-full max-w-6xl max-h-[80vh] aspect-video">
        <video 
          ref={videoRef}
          src={videoSrc}
          className="w-full h-full object-contain"
          autoPlay 
          // onEnded={onFinished} // 如果想播完自动进游戏，把这行注释去掉
        />
        
        {/* 字幕层 - 显示你配置的剧情文案 */}
        <div className="absolute bottom-10 left-0 right-0 text-center px-20">
          <p className="text-2xl text-white/90 font-serif drop-shadow-md bg-black/50 p-4 rounded-xl inline-block">
            {narrative}
          </p>
        </div>

        {/* 跳过按钮 */}
        <button 
          onClick={onFinished}
          className="absolute top-4 right-4 text-white/70 hover:text-white border border-white/30 px-4 py-1 rounded hover:bg-white/10 text-sm"
        >
          跳过剧情 (Skip)
        </button>
      </div>
    </div>
  );
}