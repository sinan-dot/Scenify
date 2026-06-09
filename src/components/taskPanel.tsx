"use client";

import styled from 'styled-components';
import type { LevelTask } from '@/lib/types';

type TaskPanelProps = {
  title: string;
  tasks: LevelTask[];
  taskStatus: boolean[];
};

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

const Header = styled.div`
  margin-bottom: 40px;
  border-bottom: 2px solid rgba(0, 0, 0, 0.8);
  padding-bottom: 20px;
`;

const LevelNumber = styled.div`
  font-size: 0.96rem;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.82);
  margin-bottom: 10px;
`;

const LevelName = styled.h1`
  margin: 0;
  font-size: 2.18rem;
  line-height: 1.16;
  font-weight: 800;
  color: #000;
  text-wrap: balance;
`;

const TaskList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const TaskItem = styled.li<{ $done: boolean }>`
  margin-bottom: 25px;
  font-size: 1.2rem;
  color: ${props => props.$done ? '#b45309' : '#1e293b'};
  font-weight: ${props => props.$done ? 'bold' : 'normal'};
  cursor: pointer;
  transition: all 0.5s ease;
  display: flex;
  align-items: flex-start;

  &:hover {
    color: #b45309;
    transform: translateX(10px);
  }

  &::before {
    content: '${props => props.$done ? '✔' : '◈'}';
    color: #b45309;
    margin-right: 12px;
    margin-top: 2px;
    flex-shrink: 0;
  }
`;

const TaskText = styled.span`
  display: block;
  line-height: 1.55;
  text-wrap: pretty;
`;

function splitLevelTitle(title: string) {
  const match = title.match(/^(Level\s+\d+)\s*[·•-]\s*(.+)$/i);
  if (!match) {
    return {
      levelNumber: title,
      levelName: '',
    };
  }

  return {
    levelNumber: match[1].toUpperCase(),
    levelName: match[2],
  };
}

export function TaskPanel({ title, tasks, taskStatus }: TaskPanelProps) {
  const { levelNumber, levelName } = splitLevelTitle(title);

  return (
    <RightSection>
      <Header>
        <LevelNumber>{levelNumber}</LevelNumber>
        {levelName ? <LevelName>{levelName}</LevelName> : <LevelName>{title}</LevelName>}
      </Header>
      <TaskList>
        {tasks.map((task, index) => (
          <TaskItem key={task.id} $done={taskStatus[index]}>
            <TaskText>{task.title}</TaskText>
          </TaskItem>
        ))}
      </TaskList>
    </RightSection>
  );
}
