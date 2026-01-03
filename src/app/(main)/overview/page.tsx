'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSwipeable } from 'react-swipeable';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { DailyCheckIn, Goal } from '@/types';

type DayStatus = 'complete' | 'partial' | 'none' | 'future';

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
  const dayStatuses = useMemo(() => {
    const statuses: Map<string, DayStatus> = new Map();
    
    // Group goals by user
    const goalsByUser = new Map<string, Goal[]>();
    goals.forEach(goal => {
      const userGoals = goalsByUser.get(goal.userId) || [];
      userGoals.push(goal);
      goalsByUser.set(goal.userId, userGoals);
    });
    
    for (let i = 0; i < totalDays; i++) {
      const date = new Date(year, 0, i + 1);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      
      if (dateKey > todayKey) {
        statuses.set(dateKey, 'future');
      } else {
        const dayCheckIns = checkIns.filter(c => c.date === dateKey);
        const completedCheckIns = dayCheckIns.filter(c => c.completed === true);
        
        if (completedCheckIns.length === 0) {
          // No one completed anything
          statuses.set(dateKey, 'none');
        } else {
          // Check if everyone completed all their goals
          let allComplete = true;
          
          // For each user with goals, check if all their goals are completed
          goalsByUser.forEach((userGoals, userId) => {
            const userCompletedGoalIds = completedCheckIns
              .filter(c => c.userId === userId)
              .map(c => c.goalId);
            
            const userCompletedAll = userGoals.every(goal => 
              userCompletedGoalIds.includes(goal.id)
            );
            
            if (!userCompletedAll) {
              allComplete = false;
            }
          });
          
          // If no goals exist yet, consider partial if any check-in exists
          if (goals.length === 0) {
            allComplete = false;
          }
          
          statuses.set(dateKey, allComplete ? 'complete' : 'partial');
        }
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
        <h1 className="text-5xl font-bold text-white">{successRate}%</h1>
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
              className={`aspect-square rounded-full transition-colors ${bgColor}
                ${isToday ? 'ring-2 ring-white/50 ring-offset-1 ring-offset-black' : ''}
              `}
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
