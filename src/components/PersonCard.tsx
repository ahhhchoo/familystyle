'use client';

import Image from 'next/image';
import { FamilyMemberStatus } from '@/types';

interface PersonCardProps {
  member: FamilyMemberStatus;
  isCurrentUser?: boolean;
  onClick?: () => void;
}

export default function PersonCard({ member, isCurrentUser = false, onClick }: PersonCardProps) {
  const isComplete = member.goalsCompleted === member.totalGoals && member.totalGoals > 0;
  
  const formatTime = (date: Date | null | { seconds: number; nanoseconds: number }) => {
    if (!date) return 'waiting';
    
    try {
      // Handle Firestore Timestamp objects
      let dateObj: Date;
      if (typeof date === 'object' && 'seconds' in date) {
        dateObj = new Date(date.seconds * 1000);
      } else if (date instanceof Date) {
        dateObj = date;
      } else {
        dateObj = new Date(date);
      }
      
      // Check if valid date
      if (isNaN(dateObj.getTime())) {
        return 'waiting';
      }
      
      return dateObj.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return 'waiting';
    }
  };

  return (
    <button
      onClick={onClick}
      className={`w-full bg-[var(--gray-dark)] rounded-3xl p-4 flex flex-col 
                 transition-transform active:scale-[0.98] text-left
                 ${isCurrentUser ? 'border border-white/10' : ''}`}
    >
      {/* Name */}
      <h3 className="text-white font-semibold text-base mb-3">
        {member.displayName}
        {isCurrentUser && <span className="text-[var(--gray-text)]"> (You)</span>}
      </h3>

      {/* Profile Photo */}
      <div className="flex-1 flex items-center justify-center py-4">
        <div className="relative w-24 h-24 rounded-full overflow-hidden bg-[var(--gray-card)]">
          {member.photoURL ? (
            <Image
              src={member.photoURL}
              alt={member.displayName}
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl text-white">
              {member.displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* Status Row */}
      <div className="flex items-center justify-between mt-3">
        <div>
          <p className="text-white text-sm font-medium">
            {isComplete ? 'Complete' : 'Incomplete'}
          </p>
          <p className="text-[var(--gray-text)] text-xs">
            {isComplete ? formatTime(member.completedAt) : 'waiting'}
          </p>
        </div>

        {/* Status Icon */}
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center border border-white/[0.08]
            ${isComplete ? 'bg-[var(--green)]' : 'bg-[var(--gray-card)]'}`}
        >
          {isComplete ? (
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-6 h-6 text-[var(--gray-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
            </svg>
          )}
        </div>
      </div>
    </button>
  );
}
