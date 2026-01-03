'use client';

import { useMemo } from 'react';

// Wager colors in rotation order (using hex values directly for reliability)
const WAGER_COLORS = [
  '#2B9CFF', // blue
  '#15B347', // green
  '#FF3939', // red
  '#FBFF28', // yellow
];

const INCOMPLETE_COLOR = '#202020';

interface DayData {
  date: string; // YYYY-MM-DD
  status: 'complete' | 'partial' | 'none' | 'future';
  isLastDay: boolean;
}

interface MonthlyWagerCardProps {
  month: string; // YYYY-MM format
  completionRate: number;
  assignedUser: {
    displayName: string;
    photoURL: string | null;
  };
  dayStatuses: Map<string, 'complete' | 'partial' | 'none' | 'future'>;
  colorIndex: number; // 0-3 for blue, green, red, yellow
  isCurrentMonth?: boolean;
}

export default function MonthlyWagerCard({
  month,
  completionRate,
  assignedUser,
  dayStatuses,
  colorIndex,
  isCurrentMonth = false,
}: MonthlyWagerCardProps) {
  const color = WAGER_COLORS[colorIndex % 4];
  
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
        isLastDay: day === daysInMonth,
      });
    }
    
    return result;
  }, [month, dayStatuses]);

  // Format month for display (e.g., "January 2026")
  const displayMonth = useMemo(() => {
    const [year, monthNum] = month.split('-').map(Number);
    const date = new Date(year, monthNum - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [month]);

  // Get shape for a day (alternating circle/square based on index)
  const getShapeStyle = (index: number, status: DayData['status']): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {};

    // Color based on status
    if (status === 'complete') {
      baseStyle.backgroundColor = color;
    } else if (status === 'partial') {
      baseStyle.backgroundColor = color;
      baseStyle.opacity = 0.5;
    } else {
      baseStyle.backgroundColor = INCOMPLETE_COLOR;
    }

    // Shape: alternate between circle (even) and square (odd)
    if (index % 2 === 0) {
      baseStyle.borderRadius = '50%';
    } else {
      baseStyle.borderRadius = '0';
    }

    return baseStyle;
  };

  // SVG Star component for last day (8-pointed starburst)
  const StarShape = ({ status }: { status: DayData['status'] }) => {
    let fillColor = INCOMPLETE_COLOR;
    let opacity = 1;
    
    if (status === 'complete') {
      fillColor = color;
    } else if (status === 'partial') {
      fillColor = color;
      opacity = 0.5;
    }

    // 8-pointed starburst shape
    return (
      <svg 
        width="25.5" 
        height="25.5" 
        viewBox="0 0 26 26" 
        fill="none"
        style={{ opacity }}
      >
        <path
          d="M13 0L14.5 8.5L21.5 4.5L17.5 11.5L26 13L17.5 14.5L21.5 21.5L14.5 17.5L13 26L11.5 17.5L4.5 21.5L8.5 14.5L0 13L8.5 11.5L4.5 4.5L11.5 8.5L13 0Z"
          fill={fillColor}
        />
      </svg>
    );
  };

  return (
    <div className="flex gap-4 items-start">
      {/* Left side - Stats */}
      <div className="flex flex-col min-w-[100px]">
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
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={{ backgroundColor: color }}
            >
              {assignedUser.displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* Right side - Grid */}
      <div 
        className="grid gap-[5px]"
        style={{ gridTemplateColumns: 'repeat(7, 25.5px)' }}
      >
        {days.map((day, index) => (
          <div 
            key={day.date} 
            className="w-[25.5px] h-[25.5px]"
          >
            {day.isLastDay ? (
              <StarShape status={day.status} />
            ) : (
              <div 
                className="w-full h-full"
                style={getShapeStyle(index, day.status)} 
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
