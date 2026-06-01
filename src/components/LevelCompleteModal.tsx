// src/components/LevelCompleteModal.tsx
import React from 'react';

interface Props {
  levelTitle: string;
  nextLevelTitle: string;
  onNext: () => void;
  analysis?: string; // AI给的建议
}

export default function LevelCompleteModal({ levelTitle, nextLevelTitle, onNext, analysis }: Props) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in">
      <div className="w-[600px] bg-[#1a1a1a] border-2 border-amber-600 rounded-lg p-8 text-center shadow-2xl relative overflow-hidden">
        {/* 装饰背景纹理 */}
        <div className="absolute inset-0 opacity-10 bg-[url('/assets/common/noise.png')]"></div>
        
        <h2 className="text-4xl font-bold text-amber-500 mb-2 font-serif tracking-widest">
          通关成功
        </h2>
        <p className="text-gray-400 mb-6 text-sm">{levelTitle} 挑战完成</p>

        {/* 口语建议展示区 */}
        <div className="bg-black/40 p-6 rounded mb-8 text-left border border-white/10">
          <h3 className="text-amber-400 text-lg mb-2">📜 夫子点评 (AI Analysis)</h3>
          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
            {analysis || "你的口语逻辑清晰，发音准确，成功说服了对方。建议在下一关尝试使用更复杂的从句。"}
          </p>
        </div>

        <button 
          onClick={onNext}
          className="px-10 py-3 bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 text-white font-bold rounded shadow-lg transform transition hover:scale-105"
        >
          前往下一章：{nextLevelTitle} →
        </button>
      </div>
    </div>
  );
}