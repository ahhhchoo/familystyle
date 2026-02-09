'use client';

import { useMemo } from 'react';

const COMPLETE_COLOR = '#15B347';
const INCOMPLETE_COLOR = '#333';
const FUTURE_COLOR = 'rgba(255, 255, 255, 0.2)';

// Get today's date key
const getTodayKey = (): string => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

interface DayData {
  date: string; // YYYY-MM-DD
  status: 'complete' | 'partial' | 'none' | 'future';
  isToday: boolean;
}

interface MonthlyWagerCardProps {
  month: string; // YYYY-MM format
  completionRate: number;
  assignedUser: {
    displayName: string;
    photoURL: string | null;
  };
  dayStatuses: Map<string, 'complete' | 'partial' | 'none' | 'future'>;
  colorIndex: number; // kept for API compat, unused now
  isCurrentMonth?: boolean;
}

export default function MonthlyWagerCard({
  month,
  completionRate,
  assignedUser,
  dayStatuses,
}: MonthlyWagerCardProps) {
  const todayKey = getTodayKey();

  // Parse month to get days
  const days = useMemo(() => {
    const [year, monthNum] = month.split('-').map(Number);
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const result: DayData[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const status = dayStatuses.get(dateKey) || 'future';
      result.push({
        date: dateKey,
        status,
        isToday: dateKey === todayKey,
      });
    }

    return result;
  }, [month, dayStatuses, todayKey]);

  // Format month for display (e.g., "January 2026")
  const displayMonth = useMemo(() => {
    const [year, monthNum] = month.split('-').map(Number);
    const date = new Date(year, monthNum - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [month]);

  // Get dot color based on status
  const getDotColor = (status: DayData['status']): string => {
    if (status === 'complete') return COMPLETE_COLOR;
    if (status === 'future') return FUTURE_COLOR;
    // partial and none are both "past incomplete"
    return INCOMPLETE_COLOR;
  };

  return (
    <div className="flex items-start justify-between pr-4">
      {/* Left side - Stats */}
      <div className="flex flex-col shrink-0">
        <p
          className="text-[30px] font-bold tracking-[-0.4px]"
          style={{ color: 'rgba(255, 255, 255, 0.8)' }}
        >
          {completionRate}%
        </p>
        <p
          className="text-[16px] font-semibold tracking-[-0.4px]"
          style={{ color: 'rgba(255, 255, 255, 0.6)' }}
        >
          {displayMonth}
        </p>
        {/* Avatar */}
        <div className="mt-2">
          {assignedUser.photoURL ? (
            <img
              src={assignedUser.photoURL}
              alt={assignedUser.displayName}
              className="w-6 h-6 rounded-full object-cover"
            />
          ) : (
            <div
              className="w-6 h-6 rounded-full bg-[#333] flex items-center justify-center text-xs font-medium text-white"
            >
              {assignedUser.displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* Right side - Dot Grid (7 columns, all circles) */}
      <div
        className="grid gap-[5px]"
        style={{ gridTemplateColumns: 'repeat(7, 14px)' }}
      >
        {days.map((day) => (
          <div
            key={day.date}
            className="w-[14px] h-[14px] rounded-full"
            style={{
              backgroundColor: getDotColor(day.status),
              animation: day.isToday && day.status === 'complete'
                ? 'pulse-dot 1.8s ease-in-out infinite'
                : day.isToday
                  ? 'pulse-dot 1.8s ease-in-out infinite'
                  : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}
