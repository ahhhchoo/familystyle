'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSwipeable } from 'react-swipeable';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { DailyCheckIn, Goal } from '@/types';
import AnimatedNumber from '@/components/AnimatedNumber';

type DayStatus = 'complete' | 'partial' | 'none' | 'future';

// Helper: Get the Monday of the week for a given date
const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  // Adjust so Monday = 0, Sunday = 6
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Helper: Get the Sunday of the week for a given date
const getWeekEnd = (date: Date): Date => {
  const weekStart = getWeekStart(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return weekEnd;
};

// Helper: Get date key in YYYY-MM-DD format
const getDateKey = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Helper: Get all dates in a week (Mon-Sun) as date keys
const getWeekDates = (anyDateInWeek: Date): string[] => {
  const weekStart = getWeekStart(anyDateInWeek);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    dates.push(getDateKey(d));
  }
  return dates;
};

// Helper: Get remaining days in the week from a given date (including that date)
// Monday = 7 days left, Sunday = 1 day left
const getDaysRemainingInWeek = (date: Date): number => {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return 7 - adjustedDay;
};

export default function OverviewPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [checkIns, setCheckIns] = useState<DailyCheckIn[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [familyMemberCount, setFamilyMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Calculate days in year
  const year = new Date().getFullYear();
  const today = new Date();
  
  // Check if it's a leap year
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const totalDays = isLeapYear ? 366 : 365;
  
  // Calculate day of year (Jan 1 = day 1, Jan 2 = day 2, etc.)
  const startOfYear = new Date(year, 0, 1);
  const diffTime = today.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  const daysRemaining = totalDays - dayOfYear;

  // Swipe handlers for navigation
  const swipeHandlers = useSwipeable({
    onSwipedRight: () => router.push('/home'),
    preventScrollOnSwipe: true,
    trackMouse: false,
  });

  useEffect(() => {
    if (authLoading) return;
    
    if (!user?.familyId) {
      router.push('/');
      return;
    }

    const fetchData = async () => {
      try {
        // Fetch family to get member count
        const familyRef = doc(db, 'families', user.familyId!);
        const familySnap = await getDoc(familyRef);
        if (familySnap.exists()) {
          const familyData = familySnap.data();

          setFamilyMemberCount(familyData.members?.length || 0);
        }

        // Fetch all goals for the family
        const goalsQuery = query(
          collection(db, 'goals'),
          where('familyId', '==', user.familyId),
          where('isActive', '==', true)
        );
        const goalsSnapshot = await getDocs(goalsQuery);
        const goalsData = goalsSnapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as Goal[];

        setGoals(goalsData);

        // Fetch all check-ins for the family (no date filter for debugging)
        const checkInsQuery = query(
          collection(db, 'checkIns'),
          where('familyId', '==', user.familyId)
        );

        const snapshot = await getDocs(checkInsQuery);
        const checkInsData = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as DailyCheckIn[];
        


        setCheckIns(checkInsData);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };

    fetchData();
  }, [user, authLoading, router, year]);

  // Get today's date key in YYYY-MM-DD format (using local timezone)
  const getTodayKey = () => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  };
  const todayKey = getTodayKey();

  // Calculate completion data for each day
  // - 'complete' (green): Everyone completed all their goals
  // - 'partial' (orange): At least someone completed something
  // - 'none' (gray): No one completed anything
  // - 'future' (dark gray): Future date
  //
  // For weekly goals:
  // - Only evaluate on Sunday (end of week) or today if mid-week
  // - Count completed check-ins for the week and compare to weeklyTarget
  // - For days before the week ends, show as "in progress" (partial if any activity)
  const dayStatuses = useMemo(() => {
    const statuses: Map<string, DayStatus> = new Map();
    
    // Group goals by user
    const goalsByUser = new Map<string, Goal[]>();
    goals.forEach(goal => {
      const userGoals = goalsByUser.get(goal.userId) || [];
      userGoals.push(goal);
      goalsByUser.set(goal.userId, userGoals);
    });

    // Pre-compute weekly check-in counts for each goal per week
    // Key: `${goalId}-${weekStartKey}`, Value: count of completed check-ins
    const weeklyCheckInCounts = new Map<string, number>();
    checkIns.forEach(checkIn => {
      if (!checkIn.completed) return;
      const goal = goals.find(g => g.id === checkIn.goalId);
      if (!goal || goal.frequency !== 'weekly') return;
      
      // Parse the date from check-in
      const [y, m, d] = checkIn.date.split('-').map(Number);
      const checkInDate = new Date(y, m - 1, d);
      const weekStartKey = getDateKey(getWeekStart(checkInDate));
      const key = `${checkIn.goalId}-${weekStartKey}`;
      weeklyCheckInCounts.set(key, (weeklyCheckInCounts.get(key) || 0) + 1);
    });
    
    for (let i = 0; i < totalDays; i++) {
      const date = new Date(year, 0, i + 1);
      const dateKey = getDateKey(date);
      
      if (dateKey > todayKey) {
        statuses.set(dateKey, 'future');
        continue;
      }
      
      const dayCheckIns = checkIns.filter(c => c.date === dateKey);
      const completedCheckIns = dayCheckIns.filter(c => c.completed === true);
      

      
      // Determine if everyone completed all their goals for this day
      let allComplete = true;
      let anyActivity = completedCheckIns.length > 0;
      
      // For each user with goals, check if all their goals are satisfied
      goalsByUser.forEach((userGoals, userId) => {
        userGoals.forEach(goal => {
          if (goal.frequency === 'daily') {
            // Daily goal: must be completed on this specific day
            const isCompleted = completedCheckIns.some(
              c => c.userId === userId && c.goalId === goal.id
            );
            if (!isCompleted) {
              allComplete = false;
            }
          } else if (goal.frequency === 'weekly') {
            // Weekly goal: check if target is met OR still achievable
            const weekStartKey = getDateKey(getWeekStart(date));
            const key = `${goal.id}-${weekStartKey}`;
            const weekCount = weeklyCheckInCounts.get(key) || 0;
            const target = goal.weeklyTarget || 1;
            const stillNeeded = target - weekCount;
            const daysRemaining = getDaysRemainingInWeek(date);
            
            // Complete if: already hit target OR still achievable (enough days left)
            const isAchievable = weekCount >= target || stillNeeded <= daysRemaining;
            
            if (!isAchievable) {
              // Mathematically impossible to reach target
              allComplete = false;
            }
            // If achievable (either already met or still possible), count as complete
            
            // Track if there's any weekly goal activity
            if (weekCount > 0) {
              anyActivity = true;
            }
          }
        });
      });
      
      // If no goals exist yet, consider partial if any check-in exists
      if (goals.length === 0) {
        allComplete = false;
      }
      
      // Determine final status
      if (allComplete && goals.length > 0) {
        statuses.set(dateKey, 'complete');
      } else if (anyActivity) {
        statuses.set(dateKey, 'partial');
      } else {
        statuses.set(dateKey, 'none');
      }
    }
    
    return statuses;
  }, [checkIns, goals, totalDays, todayKey, year]);

  // Calculate success rate (only count fully complete days)
  const completedDays = Array.from(dayStatuses.values()).filter(s => s === 'complete').length;
  const successRate = dayOfYear > 0 ? Math.round((completedDays / dayOfYear) * 100) : 0;

  // Generate grid of days (20 columns)
  const columns = 20;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-pulse text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div {...swipeHandlers} className="min-h-screen bg-black px-5 pt-24 pb-8">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-5xl font-bold text-white">
          <AnimatedNumber value={successRate} suffix="%" />
        </h1>
        <div className="flex items-center justify-between mt-1">
          <p className="text-[var(--gray-text)] text-sm">family success rate</p>
          <p className="text-white font-medium">{daysRemaining} more days</p>
        </div>
      </header>

      {/* Year Grid */}
      <div 
        className="grid gap-[6px]"
        style={{ 
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
        }}
      >
        {Array.from({ length: totalDays }).map((_, index) => {
          const date = new Date(year, 0, index + 1);
          const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          const status = dayStatuses.get(dateKey) || 'future';
          
          const isToday = dateKey === todayKey;
          
          // Color based on status
          const bgColor = status === 'complete' 
            ? 'bg-[var(--green)]' 
            : status === 'partial'
              ? 'bg-[var(--orange)]'
              : status === 'none'
                ? 'bg-[var(--gray-card)]'
                : 'bg-[var(--gray-dark)]';
          
          return (
            <div
              key={dateKey}
              className={`aspect-square rounded-full ${bgColor}`}
              style={isToday ? {
                animation: 'pulse-dot 1.8s ease-in-out infinite',
              } : undefined}
              title={`${dateKey}: ${status}`}
            />
          );
        })}
      </div>

      {/* Home Button - Fixed at bottom left */}
      <div className="fixed bottom-8 left-4">
        <button 
          onClick={() => router.push('/home')}
          className="flex items-center gap-2 px-5 py-3 border border-white/20 rounded-full 
                     text-white font-medium hover:bg-white/10 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l-4-4m0 0l4-4m-4 4h18" />
          </svg>
          Home
        </button>
      </div>
    </div>
  );
}
