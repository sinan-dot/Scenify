"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import type { LevelMapData, LevelMapHighlight } from '@/config/levelsConfig';

type MapTransitionProps = {
  mapData: LevelMapData;
  onComplete: () => void;
};

const HIGHLIGHT_REVEAL_DELAY_MS = 1500;
const TRANSITION_COMPLETE_DELAY_MS = 5000;

const breathe = keyframes`
  0%, 100% {
    opacity: 0.55;
    transform: translate(-50%, -50%) scale(0.96) rotate(-4deg);
  }

  50% {
    opacity: 0.9;
    transform: translate(-50%, -50%) scale(1.08) rotate(3deg);
  }
`;

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 40;
  overflow: hidden;
  background: #050302;
`;

const MapStage = styled.div`
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 1;
  width: max(100vw, calc(100vh * 1.786));
  height: max(100vh, calc(100vw / 1.786));
  transform: translate(-50%, -50%);
`;

const MapImage = styled.img`
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: sepia(0.18) contrast(1.05) brightness(0.82);
  transform: scale(1.012);
`;

const MapFallback = styled.div`
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(circle at 48% 44%, rgba(146, 64, 14, 0.34), rgba(32, 15, 8, 0.2) 38%, rgba(5, 3, 2, 0.96) 76%),
    linear-gradient(135deg, rgba(120, 53, 15, 0.42), rgba(39, 20, 10, 0.84));
`;

const Vignette = styled.div`
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  background:
    radial-gradient(circle at center, rgba(0, 0, 0, 0) 42%, rgba(0, 0, 0, 0.52) 100%),
    linear-gradient(180deg, rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.36));
`;

const Glow = styled.div<{
  $show: boolean;
  $x: number;
  $y: number;
  $width: string;
  $height: string;
  $delay: number;
}>`
  position: absolute;
  z-index: 2;
  left: ${props => props.$x}%;
  top: ${props => props.$y}%;
  width: ${props => props.$width};
  height: ${props => props.$height};
  border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
  background:
    radial-gradient(circle at 42% 42%, rgba(251, 191, 36, 0.72), rgba(180, 83, 9, 0.48) 46%, rgba(127, 29, 29, 0.18) 72%, rgba(127, 29, 29, 0) 100%);
  filter: blur(28px);
  mix-blend-mode: screen;
  opacity: ${props => props.$show ? 0.78 : 0};
  transform: translate(-50%, -50%) scale(0.92) rotate(-4deg);
  transition: opacity 800ms ease;
  animation: ${props => props.$show ? breathe : 'none'} 1.85s ease-in-out infinite;
  animation-delay: ${props => props.$delay}ms;
`;

const GlowCore = styled.div<{
  $show: boolean;
  $x: number;
  $y: number;
  $width: string;
  $height: string;
}>`
  position: absolute;
  z-index: 3;
  left: ${props => props.$x}%;
  top: ${props => props.$y}%;
  width: ${props => props.$width};
  height: ${props => props.$height};
  border-radius: 45% 55% 62% 38% / 56% 45% 55% 44%;
  border: 1px solid rgba(253, 230, 138, 0.38);
  background: rgba(251, 191, 36, 0.16);
  box-shadow: 0 0 42px rgba(251, 191, 36, 0.38);
  opacity: ${props => props.$show ? 1 : 0};
  transform: translate(-50%, -50%) rotate(2deg) scale(0.58, 0.52);
  transition: opacity 700ms ease 80ms;
`;

const Label = styled.div<{ $show: boolean; $x: number; $y: number }>`
  position: absolute;
  z-index: 5;
  left: ${props => props.$x}%;
  top: calc(${props => props.$y}% - 4.8rem);
  transform: translate(-50%, 8px);
  opacity: ${props => props.$show ? 1 : 0};
  min-width: 74px;
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid rgba(253, 230, 138, 0.38);
  background: rgba(25, 18, 10, 0.44);
  backdrop-filter: blur(14px);
  color: #fef3c7;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-align: center;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.78);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.36);
  transition: opacity 700ms ease 140ms, transform 700ms ease 140ms;

  ${props => props.$show && `
    transform: translate(-50%, 0);
  `}
`;

function parseGlowSize(glowSize: string | undefined) {
  const fallback = { width: '5rem', height: '5rem' };
  if (!glowSize) return fallback;

  const widthMatch = glowSize.match(/\bw-\[(.+?)\]|\bw-(\d+)/);
  const heightMatch = glowSize.match(/\bh-\[(.+?)\]|\bh-(\d+)/);

  const toCssSize = (arbitrary: string | undefined, scale: string | undefined) => {
    if (arbitrary) return arbitrary;
    if (scale) return `${Number(scale) * 0.25}rem`;
    return undefined;
  };

  return {
    width: toCssSize(widthMatch?.[1], widthMatch?.[2]) ?? fallback.width,
    height: toCssSize(heightMatch?.[1], heightMatch?.[2]) ?? fallback.height,
  };
}

function getMapHighlights(mapData: LevelMapData): LevelMapHighlight[] {
  return mapData.highlights && mapData.highlights.length > 0
    ? mapData.highlights
    : [mapData];
}

export function MapTransition({ mapData, onComplete }: MapTransitionProps) {
  const [showHighlight, setShowHighlight] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const highlights = useMemo(() => getMapHighlights(mapData), [mapData]);
  const transitionKey = useMemo(() => (
    [
      mapData.mapImage,
      ...highlights.map((highlight) => [
        highlight.blinkArea,
        highlight.coordinates.x,
        highlight.coordinates.y,
        highlight.glowSize,
      ].join(':')),
    ].join('|')
  ), [mapData.mapImage, highlights]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    setShowHighlight(false);
    setImageFailed(false);

    const highlightTimer = window.setTimeout(() => {
      setShowHighlight(true);
    }, HIGHLIGHT_REVEAL_DELAY_MS);

    const completeTimer = window.setTimeout(() => {
      onCompleteRef.current();
    }, TRANSITION_COMPLETE_DELAY_MS);

    return () => {
      window.clearTimeout(highlightTimer);
      window.clearTimeout(completeTimer);
    };
  }, [transitionKey]);

  return (
    <Overlay>
      <MapFallback />
      <MapStage>
        {!imageFailed && (
          <MapImage
            src={mapData.mapImage}
            alt={`${mapData.blinkArea} historical map`}
            onError={() => setImageFailed(true)}
          />
        )}
        {highlights.map((highlight, index) => {
          const { width, height } = parseGlowSize(highlight.glowSize);
          const animationDelay = index * 420;

          return (
            <div key={`${highlight.blinkArea}-${highlight.coordinates.x}-${highlight.coordinates.y}`}>
              <Glow
                $show={showHighlight}
                $x={highlight.coordinates.x}
                $y={highlight.coordinates.y}
                $width={width}
                $height={height}
                $delay={animationDelay}
              />
              <GlowCore
                $show={showHighlight}
                $x={highlight.coordinates.x}
                $y={highlight.coordinates.y}
                $width={width}
                $height={height}
              />
              <Label
                $show={showHighlight}
                $x={highlight.coordinates.x}
                $y={highlight.coordinates.y}
              >
                {highlight.blinkArea}
              </Label>
            </div>
          );
        })}
      </MapStage>
      <Vignette />
    </Overlay>
  );
}
