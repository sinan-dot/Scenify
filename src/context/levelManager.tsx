"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { LEVELS, getLevelById, levels } from '@/config/levels';
import type { LevelConfig, TaskValidationResult } from '@/lib/types';

type GameState = 'start' | 'map-transition' | 'intro-video' | 'game' | 'end-video' | 'level-complete';

type LevelManagerValue = {
  currentLevel: LevelConfig;
  currentLevelId: number;
  currentLevelIndex: number;
  gameState: GameState;
  taskStatus: boolean[];
  setCurrentLevelId: React.Dispatch<React.SetStateAction<number>>;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  setTaskStatus: React.Dispatch<React.SetStateAction<boolean[]>>;
  applyTaskValidation: (result: Partial<TaskValidationResult>) => void;
  completeAllTasks: () => void;
  goToNextLevel: () => void;
};

const LevelManagerContext = createContext<LevelManagerValue | null>(null);

function createEmptyTaskStatus(level: LevelConfig) {
  return level.tasks.map(() => false);
}

export function LevelManagerProvider({ children }: { children: React.ReactNode }) {
  const [currentLevelId, setCurrentLevelId] = useState(levels[0].id);
  const [gameState, setGameState] = useState<GameState>('start');
  const currentLevel = getLevelById(currentLevelId);
  const currentLevelIndex = levels.findIndex((level) => level.id === currentLevel.id);
  const [taskStatus, setTaskStatus] = useState<boolean[]>(() => createEmptyTaskStatus(currentLevel));

  useEffect(() => {
    setTaskStatus(createEmptyTaskStatus(currentLevel));
  }, [currentLevel.id]);

  const value = useMemo<LevelManagerValue>(() => {
    const applyTaskValidation = (result: Partial<TaskValidationResult>) => {
      setTaskStatus((prev) => {
        return currentLevel.tasks.map((task, index) => {
          const validatorValue = result[task.id];
          return prev[index] || validatorValue === true;
        });
      });
    };

    const completeAllTasks = () => {
      setTaskStatus(currentLevel.tasks.map(() => true));
    };

    const startNextLevelIntro = () => {
      if (!LEVELS[currentLevelId + 1]) return;

      setCurrentLevelId((previousLevelId) => previousLevelId + 1);
      setGameState('start');
    };

    return {
      currentLevel,
      currentLevelId,
      currentLevelIndex,
      gameState,
      taskStatus,
      setCurrentLevelId,
      setGameState,
      setTaskStatus,
      applyTaskValidation,
      completeAllTasks,
      goToNextLevel: startNextLevelIntro,
    };
  }, [currentLevel, currentLevelId, currentLevelIndex, gameState, taskStatus]);

  return <LevelManagerContext.Provider value={value}>{children}</LevelManagerContext.Provider>;
}

export function useLevelManager() {
  const context = useContext(LevelManagerContext);
  if (!context) {
    throw new Error('useLevelManager must be used inside LevelManagerProvider');
  }
  return context;
}
