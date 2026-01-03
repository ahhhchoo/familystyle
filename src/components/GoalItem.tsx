'use client';

import { useState, useEffect } from 'react';
import { GoalFrequency } from '@/types';

interface GoalItemProps {
  title: string;
  completed: boolean;
  onToggle?: () => void;
  disabled?: boolean;
  frequency?: GoalFrequency;
  weeklyTarget?: number;
  weeklyProgress?: number; // How many times completed this week
}

export default function GoalItem({ 
  title, 
  completed, 
  onToggle, 
  disabled = false,
  frequency = 'daily',
  weeklyTarget,
  weeklyProgress = 0,
}: GoalItemProps) {
  const isWeekly = frequency === 'weekly';
  const weeklyComplete = isWeekly && weeklyTarget && weeklyProgress >= weeklyTarget;
  const [isPulsing, setIsPulsing] = useState(false);
  const [prevCompleted, setPrevCompleted] = useState(completed);

  // Trigger pulse animation when completed changes to true
  useEffect(() => {
    if (completed && !prevCompleted) {
      setIsPulsing(true);
      const timer = setTimeout(() => setIsPulsing(false), 400);
      return () => clearTimeout(timer);
    }
    setPrevCompleted(completed);
  }, [completed, prevCompleted]);

  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`w-full bg-[var(--gray-dark)] rounded-2xl px-5 py-5 
                 flex items-center justify-between
                 transition-all duration-200
                 ${disabled ? 'cursor-default' : 'active:scale-[0.98]'}`}
    >
      <div className="flex flex-col items-start">
        <span className="text-white font-medium text-base">{title}</span>
        {isWeekly && weeklyTarget && (
          <span className="text-[var(--gray-text)] text-sm mt-1">
            {weeklyProgress}/{weeklyTarget} this week
          </span>
        )}
      </div>
      
      {/* Status Icon with pulse animation */}
      <div
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300
          ${completed ? 'bg-[var(--orange)]' : 'bg-[var(--gray-card)]'}
          ${isWeekly && weeklyComplete ? 'ring-2 ring-[var(--green)]' : ''}
          ${isPulsing ? 'scale-125' : 'scale-100'}`}
        style={{
          boxShadow: isPulsing ? '0 0 20px rgba(245, 165, 36, 0.5)' : 'none',
        }}
      >
        {completed ? (
          /* Animated checkmark */
          <svg 
            className="w-6 h-6 text-white"
            viewBox="0 0 24 24" 
            fill="none"
            stroke="currentColor" 
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path 
              d="M5 13l4 4L19 7"
              className={completed ? 'animate-draw-check' : ''}
              style={{
                strokeDasharray: 24,
                strokeDashoffset: completed ? 0 : 24,
                transition: 'stroke-dashoffset 0.3s ease-out',
              }}
            />
          </svg>
        ) : (
          /* Smiley face icon when not completed */
          <svg 
            className="w-6 h-6 text-[var(--gray-text)]"
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor" 
            strokeWidth={2}
          >
            <circle cx="12" cy="12" r="10" />
            <circle cx="9" cy="10" r="1" fill="currentColor" />
            <circle cx="15" cy="10" r="1" fill="currentColor" />
            <path strokeLinecap="round" d="M8 14s1.5 2 4 2 4-2 4-2" />
          </svg>
        )}
      </div>
    </button>
  );
}
