'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

import { Goal, DailyCheckIn } from '@/types';

type DayStatus = 'complete' | 'partial' | 'none' | 'future';

// Helper: Get date key in YYYY-MM-DD format
const getDateKey = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Day names starting from Sunday
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface WeekData {
  weekNumber: number;
  startDate: Date;
  endDate: Date;
  days: {
    dateKey: string;
    dayName: string;
    status: DayStatus;
  }[];
  completionRate: number;
}

// Format a date range label like "Feb 2-8" or "Jan 26-Feb 1"
function formatDateRange(start: Date, end: Date): string {
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const endDay = end.getDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}\u2013${endDay}`;
  }
  return `${startMonth} ${startDay}\u2013${endMonth} ${endDay}`;
}

// Status icon matching Figma exactly: green check (complete) / gray dash (incomplete)
function StatusIcon({ status, size = 48 }: { status: 'complete' | 'incomplete'; size?: number }) {
  if (status === 'complete') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="22.5" fill="#15B347" stroke="#15B347" strokeWidth="3" />
        <path d="M15 24L21 30L33 18" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22.5" fill="#3A3A3C" stroke="#3A3A3C" strokeWidth="3" />
      <line x1="16" y1="24" x2="32" y2="24" stroke="white" strokeOpacity="0.6" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [allCheckIns, setAllCheckIns] = useState<DailyCheckIn[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const todayKey = getDateKey(today);
  const year = today.getFullYear();
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const totalDays = isLeapYear ? 366 : 365;

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/');
      return;
    }

    // Listen to current user's goals
    const goalsQuery = query(
      collection(db, 'goals'),
      where('userId', '==', user.uid),
      where('isActive', '==', true)
    );

    const unsubscribeGoals = onSnapshot(goalsQuery, (snapshot) => {
      const goalsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Goal[];
      goalsData.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      setGoals(goalsData);
    });

    // Listen to all check-ins for this user
    const allCheckInsQuery = query(
      collection(db, 'checkIns'),
      where('userId', '==', user.uid)
    );

    const unsubscribeAllCheckIns = onSnapshot(allCheckInsQuery, (snapshot) => {
      const checkInsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as DailyCheckIn[];
      setAllCheckIns(checkInsData);
      setLoading(false);
    });

    return () => {
      unsubscribeGoals();
      unsubscribeAllCheckIns();
    };
  }, [user, authLoading, router]);

  // Calculate day statuses for the year
  const dayStatuses = useMemo(() => {
    const statuses: Map<string, DayStatus> = new Map();

    for (let i = 0; i < totalDays; i++) {
      const date = new Date(year, 0, i + 1);
      const dateKey = getDateKey(date);

      if (dateKey > todayKey) {
        statuses.set(dateKey, 'future');
        continue;
      }

      const dayCheckIns = allCheckIns.filter(c => c.date === dateKey);
      const completedCheckIns = dayCheckIns.filter(c => c.completed);

      // For the profile stats, count all goals uniformly:
      // a day is "complete" if every goal has a check-in that day
      const totalGoals = goals.length;

      if (totalGoals === 0) {
        if (completedCheckIns.length > 0) {
          statuses.set(dateKey, 'complete');
        } else {
          statuses.set(dateKey, 'none');
        }
        continue;
      }

      const completedGoalCount = goals.filter(goal =>
        completedCheckIns.some(c => c.goalId === goal.id)
      ).length;

      if (completedGoalCount === totalGoals) {
        statuses.set(dateKey, 'complete');
      } else if (completedGoalCount > 0) {
        statuses.set(dateKey, 'partial');
      } else {
        statuses.set(dateKey, 'none');
      }
    }

    return statuses;
  }, [allCheckIns, goals, totalDays, todayKey, year]);

  // Build weekly breakdown data (Sun-Sat weeks, most recent first)
  const weeksData = useMemo(() => {
    const weeks: WeekData[] = [];

    // Find the first Sunday on or before Jan 1
    let currentSunday = new Date(year, 0, 1);
    const startDayOfWeek = currentSunday.getDay();
    if (startDayOfWeek !== 0) {
      currentSunday.setDate(currentSunday.getDate() - startDayOfWeek);
    }

    let weekNum = 1;

    while (true) {
      const weekStart = new Date(currentSunday);
      const weekEnd = new Date(currentSunday);
      weekEnd.setDate(weekEnd.getDate() + 6);

      if (getDateKey(weekStart) > todayKey) break;

      const days: WeekData['days'] = [];
      let completeDays = 0;
      let totalCountedDays = 0;

      for (let d = 0; d < 7; d++) {
        const dayDate = new Date(weekStart);
        dayDate.setDate(weekStart.getDate() + d);
        const dateKey = getDateKey(dayDate);
        const dayName = DAY_NAMES[d];

        if (dayDate.getFullYear() !== year) {
          days.push({ dateKey, dayName, status: 'future' });
          continue;
        }

        const status = dayStatuses.get(dateKey) || 'future';
        days.push({ dateKey, dayName, status });

        if (status !== 'future') {
          totalCountedDays++;
          if (status === 'complete') completeDays++;
        }
      }

      const completionRate = totalCountedDays > 0
        ? Math.round((completeDays / totalCountedDays) * 100)
        : 0;

      weeks.push({
        weekNumber: weekNum,
        startDate: weekStart,
        endDate: weekEnd,
        days,
        completionRate,
      });

      weekNum++;
      currentSunday = new Date(currentSunday);
      currentSunday.setDate(currentSunday.getDate() + 7);
    }

    return weeks.reverse();
  }, [dayStatuses, todayKey, year]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-pulse text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black px-4 pt-16 pb-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-4">
        <button
          onClick={() => router.back()}
          className="w-12 h-12 rounded-full bg-[var(--gray-dark)] flex items-center justify-center"
        >
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => router.push('/settings')}
          className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center"
        >
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </header>

      <h1 className="text-[32px] font-[800] text-white leading-none mb-6">
        Your stats
      </h1>

      {/* Weeks */}
      <div className="space-y-6">
        {weeksData.map((week) => (
          <div key={week.weekNumber}>
            {/* Week label row */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-base font-bold italic text-white tracking-[-0.4px]">
                Week {week.weekNumber} - {week.completionRate}%
              </p>
              <p className="text-base font-bold italic text-white/60 tracking-[-0.4px]">
                {formatDateRange(week.startDate, week.endDate)}
              </p>
            </div>

            {/* Day cards row - horizontally scrollable */}
            <div className="flex gap-[4px] overflow-x-auto no-scrollbar -mx-4 px-4">
              {week.days.map((day) => {
                const isFuture = day.status === 'future';
                const isComplete = day.status === 'complete';
                const isToday = day.dateKey === todayKey;

                return (
                  <div
                    key={day.dateKey}
                    className={`shrink-0 w-[120px] h-[179px] bg-[#1e1d1d] first:rounded-l-xl last:rounded-r-xl overflow-hidden flex flex-col items-center justify-between py-6 px-3
                      ${isFuture ? 'opacity-40' : ''}`}
                  >
                    <StatusIcon
                      status={isComplete ? 'complete' : 'incomplete'}
                      size={48}
                    />
                    <p className="text-white text-sm font-medium tracking-[-0.4px] text-center mt-auto">
                      {day.dayName}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
