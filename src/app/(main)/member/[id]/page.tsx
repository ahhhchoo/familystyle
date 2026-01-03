'use client';

import { useState, useEffect, useMemo, use } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, onSnapshot, updateDoc, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import GoalItem from '@/components/GoalItem';
import AnimatedNumber from '@/components/AnimatedNumber';

import { User, Goal, DailyCheckIn } from '@/types';

type DayStatus = 'complete' | 'partial' | 'none' | 'future';

// Helper to get Monday of the current week
const getMondayOfWeek = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
};

// Helper to get all dates in current week (Mon-Sun)
const getWeekDates = (date: Date): string[] => {
  const monday = getMondayOfWeek(date);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return dates;
};

// Helper: Get remaining days in the week (including today)
const getDaysRemainingInWeek = (date: Date): number => {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return 7 - adjustedDay;
};

// Helper: Get date key in YYYY-MM-DD format
const getDateKey = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function MemberPage({ params }: PageProps) {
  const { id: memberId } = use(params);
  const { user: currentUser, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [member, setMember] = useState<User | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [todayCheckIns, setTodayCheckIns] = useState<DailyCheckIn[]>([]);
  const [weekCheckIns, setWeekCheckIns] = useState<DailyCheckIn[]>([]);
  const [allCheckIns, setAllCheckIns] = useState<DailyCheckIn[]>([]);
  const [loading, setLoading] = useState(true);

  const isCurrentUser = currentUser?.uid === memberId;
  // Use local timezone for date key
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const weekDates = getWeekDates(today);

  useEffect(() => {
    if (authLoading) return;
    
    if (!currentUser) {
      router.push('/');
      return;
    }

    const fetchMemberData = async () => {
      try {
        // Fetch member info
        const memberRef = doc(db, 'users', memberId);
        const memberSnap = await getDoc(memberRef);
        
        if (!memberSnap.exists()) {
          router.push('/home');
          return;
        }
        
        setMember(memberSnap.data() as User);

        // Listen to goals
        const goalsQuery = query(
          collection(db, 'goals'),
          where('userId', '==', memberId),
          where('isActive', '==', true)
        );

        const unsubscribeGoals = onSnapshot(goalsQuery, (snapshot) => {
          const goalsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Goal[];
          setGoals(goalsData);
        });

        // Listen to today's check-ins
        const todayCheckInsQuery = query(
          collection(db, 'checkIns'),
          where('userId', '==', memberId),
          where('date', '==', todayKey)
        );

        const unsubscribeTodayCheckIns = onSnapshot(todayCheckInsQuery, (snapshot) => {
          const checkInsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as DailyCheckIn[];
          setTodayCheckIns(checkInsData);
        });

        // Fetch week's check-ins for weekly goals
        const weekCheckInsQuery = query(
          collection(db, 'checkIns'),
          where('userId', '==', memberId),
          where('date', '>=', weekDates[0]),
          where('date', '<=', weekDates[6])
        );

        const unsubscribeWeekCheckIns = onSnapshot(weekCheckInsQuery, (snapshot) => {
          const checkInsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as DailyCheckIn[];
          setWeekCheckIns(checkInsData);
        });

        // Fetch all check-ins for this user (for the year grid)
        const allCheckInsQuery = query(
          collection(db, 'checkIns'),
          where('userId', '==', memberId)
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
          unsubscribeTodayCheckIns();
          unsubscribeWeekCheckIns();
          unsubscribeAllCheckIns();
        };
      } catch (error) {
        console.error('Error fetching member data:', error);
        setLoading(false);
      }
    };

    fetchMemberData();
  }, [memberId, currentUser, authLoading, router, todayKey, weekDates[0], weekDates[6]]);

  const handleToggleGoal = async (goalId: string) => {
    if (!isCurrentUser || !currentUser?.familyId) return;

    const existingCheckIn = todayCheckIns.find(c => c.goalId === goalId);
    const goal = goals.find(g => g.id === goalId);

    try {
      if (existingCheckIn) {
        // Toggle existing check-in
        const checkInRef = doc(db, 'checkIns', existingCheckIn.id);
        await updateDoc(checkInRef, {
          completed: !existingCheckIn.completed,
          completedAt: !existingCheckIn.completed ? serverTimestamp() : null,
        });
      } else {
        // Create new check-in with human-readable fields for easier debugging
        await addDoc(collection(db, 'checkIns'), {
          goalId,
          goalTitle: goal?.title || '', // Human-readable goal name
          userId: currentUser.uid,
          userName: currentUser.displayName, // Human-readable user name
          familyId: currentUser.familyId,
          date: todayKey,
          completed: true,
          completedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error('Error toggling goal:', error);
    }
  };

  // Calculate weekly progress for a goal
  const getWeeklyProgress = (goalId: string): number => {
    return weekCheckIns.filter(c => c.goalId === goalId && c.completed).length;
  };

  // Check if a goal is "complete" (daily: done today, weekly: hit target OR still achievable)
  const isGoalComplete = (goal: Goal): boolean => {
    if (goal.frequency === 'daily') {
      return todayCheckIns.some(c => c.goalId === goal.id && c.completed);
    } else {
      // Weekly goal
      const weekCount = getWeeklyProgress(goal.id);
      const target = goal.weeklyTarget || 1;
      const stillNeeded = target - weekCount;
      const daysRemaining = getDaysRemainingInWeek(today);
      // Complete if already hit target OR still achievable
      return weekCount >= target || stillNeeded <= daysRemaining;
    }
  };

  const completedCount = goals.filter(isGoalComplete).length;

  // Calculate year stats for personal grid
  const year = today.getFullYear();
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const totalDays = isLeapYear ? 366 : 365;
  const startOfYear = new Date(year, 0, 1);
  const diffTime = today.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

  // Calculate day statuses for the year grid
  const dayStatuses = useMemo(() => {
    const statuses: Map<string, DayStatus> = new Map();
    
    for (let i = 0; i < totalDays; i++) {
      const date = new Date(year, 0, i + 1);
      const dateKey = getDateKey(date);
      
      if (dateKey > todayKey) {
        statuses.set(dateKey, 'future');
        continue;
      }
      
      // Get check-ins for this day
      const dayCheckIns = allCheckIns.filter(c => c.date === dateKey);
      const completedCheckIns = dayCheckIns.filter(c => c.completed);
      
      // Get goals that existed (we'll assume current goals for simplicity)
      const dailyGoals = goals.filter(g => (g.frequency || 'daily') === 'daily');
      const totalDailyGoals = dailyGoals.length;
      
      if (totalDailyGoals === 0) {
        // No daily goals - check if any check-ins exist
        if (completedCheckIns.length > 0) {
          statuses.set(dateKey, 'complete');
        } else {
          statuses.set(dateKey, 'none');
        }
        continue;
      }
      
      // Count how many daily goals were completed
      const completedDailyGoals = dailyGoals.filter(goal => 
        completedCheckIns.some(c => c.goalId === goal.id)
      ).length;
      
      if (completedDailyGoals === totalDailyGoals) {
        statuses.set(dateKey, 'complete');
      } else if (completedDailyGoals > 0) {
        statuses.set(dateKey, 'partial');
      } else {
        statuses.set(dateKey, 'none');
      }
    }
    
    return statuses;
  }, [allCheckIns, goals, totalDays, todayKey, year]);

  // Calculate personal success rate
  const completedDays = Array.from(dayStatuses.values()).filter(s => s === 'complete').length;
  const successRate = dayOfYear > 0 ? Math.round((completedDays / dayOfYear) * 100) : 0;

  const columns = 20;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-pulse text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto snap-y snap-mandatory bg-black">
      {/* First Section - Goals */}
      <section id="goals-section" className="min-h-screen snap-start px-4 pt-16 pb-8">
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

          {isCurrentUser && (
            <button
              onClick={() => router.push('/goals/edit')}
              className="w-12 h-12 rounded-full bg-[var(--gray-dark)] flex items-center justify-center"
            >
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
        </header>

        {/* Member Name */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-white">
            {member?.displayName}
            {isCurrentUser && <span className="text-[var(--gray-text)]"> (You)</span>}
          </h1>
          <p className="text-[var(--gray-text)] mt-1">
            {completedCount}/{goals.length} Complete today
          </p>
        </div>

        {/* Goals List */}
        <div className="flex flex-col gap-3">
          {goals.map((goal) => {
            const checkIn = todayCheckIns.find(c => c.goalId === goal.id);
            const isCompleted = checkIn?.completed ?? false;
            const weeklyProgress = goal.frequency === 'weekly' ? getWeeklyProgress(goal.id) : undefined;
            
            return (
              <GoalItem
                key={goal.id}
                title={goal.title}
                completed={isCompleted}
                onToggle={isCurrentUser ? () => handleToggleGoal(goal.id) : undefined}
                disabled={!isCurrentUser}
                frequency={goal.frequency || 'daily'}
                weeklyTarget={goal.weeklyTarget}
                weeklyProgress={weeklyProgress}
              />
            );
          })}

          {goals.length === 0 && (
            <div className="text-center py-12">
              <p className="text-[var(--gray-text)]">
                {isCurrentUser 
                  ? "You haven't added any goals yet." 
                  : `${member?.displayName} hasn't added any goals yet.`}
              </p>
              {isCurrentUser && (
                <button
                  onClick={() => router.push('/goals/edit')}
                  className="mt-4 px-6 py-3 bg-[var(--orange)] text-white rounded-full font-medium"
                >
                  Add Goals
                </button>
              )}
            </div>
          )}
        </div>

        {/* Scroll indicator */}
        <div className="flex justify-center mt-8">
          <button 
            onClick={() => {
              document.getElementById('stats-section')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex flex-col items-center text-[var(--gray-text)] animate-bounce"
          >
            <span className="text-xs mb-1">Your Stats</span>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        </div>
      </section>

      {/* Second Section - Personal Stats */}
      <section id="stats-section" className="min-h-screen snap-start px-5 pt-24 pb-8">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-5xl font-bold text-white">
            <AnimatedNumber value={successRate} suffix="%" />
          </h1>
          <div className="flex items-center justify-between mt-1">
            <p className="text-[var(--gray-text)] text-sm">your success rate</p>
            <p className="text-white font-medium">
              <AnimatedNumber value={completedDays} /> days complete
            </p>
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
            const dateKey = getDateKey(date);
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

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-8">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[var(--green)]" />
            <span className="text-[var(--gray-text)] text-xs">Complete</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[var(--orange)]" />
            <span className="text-[var(--gray-text)] text-xs">Partial</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[var(--gray-card)]" />
            <span className="text-[var(--gray-text)] text-xs">None</span>
          </div>
        </div>

        {/* Scroll up indicator */}
        <div className="flex justify-center mt-8">
          <button 
            onClick={() => {
              document.getElementById('goals-section')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex flex-col items-center text-[var(--gray-text)]"
          >
            <svg className="w-5 h-5 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            <span className="text-xs mt-1">Back to goals</span>
          </button>
        </div>
      </section>
    </div>
  );
}
