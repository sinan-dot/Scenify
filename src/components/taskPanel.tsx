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

export function TaskPanel({ title, tasks, taskStatus }: TaskPanelProps) {
  return (
    <RightSection>
      <Header>{title}</Header>
      <TaskList>
        {tasks.map((task, index) => (
          <TaskItem key={task.id} $done={taskStatus[index]}>
            {task.title}
          </TaskItem>
        ))}
      </TaskList>
    </RightSection>
  );
}
