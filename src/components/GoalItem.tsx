'use client';

import { useState, useEffect, useRef } from 'react';
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
  const [isAnimatingCheck, setIsAnimatingCheck] = useState(false);
  const prevCompletedRef = useRef(completed);

  // Trigger animations when completed changes to true
  useEffect(() => {
    if (completed && !prevCompletedRef.current) {
      setIsPulsing(true);
      setIsAnimatingCheck(true);
      const pulseTimer = setTimeout(() => setIsPulsing(false), 400);
      // Small delay to let the initial state render, then animate the smiley in
      const animTimer = setTimeout(() => {
        setIsAnimatingCheck(false);
      }, 50);
      return () => {
        clearTimeout(pulseTimer);
        clearTimeout(animTimer);
      };
    }
    prevCompletedRef.current = completed;
  }, [completed]);

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
          /* Animated smiley face - from Figma */
          <svg 
            className="w-6 h-6"
            viewBox="0 0 21.5 21.5" 
            fill="none"
            stroke="white" 
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              opacity: isAnimatingCheck ? 0 : 1,
              transform: isAnimatingCheck ? 'scale(0.5)' : 'scale(1)',
              transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
            }}
          >
            <path d="M8.25 8.75C8.25 9.02614 8.02614 9.25 7.75 9.25C7.47386 9.25 7.25 9.02614 7.25 8.75M8.25 8.75C8.25 8.47386 8.02614 8.25 7.75 8.25C7.47386 8.25 7.25 8.47386 7.25 8.75M8.25 8.75H7.25M14.25 8.75C14.25 9.02614 14.0261 9.25 13.75 9.25C13.4739 9.25 13.25 9.02614 13.25 8.75M14.25 8.75C14.25 8.47386 14.0261 8.25 13.75 8.25C13.4739 8.25 13.25 8.47386 13.25 8.75M14.25 8.75H13.25M14.7502 13.75C13.838 14.9644 12.3857 15.75 10.7499 15.75C9.11406 15.75 7.66172 14.9644 6.74951 13.75M10.75 20.75C5.22715 20.75 0.75 16.2728 0.75 10.75C0.75 5.22715 5.22715 0.75 10.75 0.75C16.2728 0.75 20.75 5.22715 20.75 10.75C20.75 16.2728 16.2728 20.75 10.75 20.75Z" />
          </svg>
        ) : (
          /* Neutral face icon when not completed - exact SVG from Figma */
          <svg 
            className="w-6 h-6"
            fill="none" 
            viewBox="0 0 21.5 21.5"
            stroke="white"
            strokeOpacity={0.6}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8.25 8.75C8.25 9.02614 8.02614 9.25 7.75 9.25C7.47386 9.25 7.25 9.02614 7.25 8.75M8.25 8.75C8.25 8.47386 8.02614 8.25 7.75 8.25C7.47386 8.25 7.25 8.47386 7.25 8.75M8.25 8.75H7.25M14.25 8.75C14.25 9.02614 14.0261 9.25 13.75 9.25C13.4739 9.25 13.25 9.02614 13.25 8.75M14.25 8.75C14.25 8.47386 14.0261 8.25 13.75 8.25C13.4739 8.25 13.25 8.47386 13.25 8.75M14.25 8.75H13.25M13.75 13.75H7.75M10.75 20.75C5.22715 20.75 0.75 16.2728 0.75 10.75C0.75 5.22715 5.22715 0.75 10.75 0.75C16.2728 0.75 20.75 5.22715 20.75 10.75C20.75 16.2728 16.2728 20.75 10.75 20.75Z" />
          </svg>
        )}
      </div>
    </button>
  );
}
