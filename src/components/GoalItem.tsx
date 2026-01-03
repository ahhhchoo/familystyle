'use client';

interface GoalItemProps {
  title: string;
  completed: boolean;
  onToggle?: () => void;
  disabled?: boolean;
}

export default function GoalItem({ title, completed, onToggle, disabled = false }: GoalItemProps) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`w-full bg-[var(--gray-dark)] rounded-2xl px-5 py-5 
                 flex items-center justify-between
                 transition-all duration-200
                 ${disabled ? 'cursor-default' : 'active:scale-[0.98]'}`}
    >
      <span className="text-white font-medium text-base">{title}</span>
      
      {/* Status Icon */}
      <div
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors
          ${completed ? 'bg-[var(--orange)]' : 'bg-[var(--gray-card)]'}`}
      >
        {/* Smiley face icon */}
        <svg 
          className={`w-6 h-6 ${completed ? 'text-white' : 'text-[var(--gray-text)]'}`} 
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
      </div>
    </button>
  );
}
