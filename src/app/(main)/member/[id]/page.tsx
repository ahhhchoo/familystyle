'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, onSnapshot, updateDoc, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import GoalItem from '@/components/GoalItem';
import { User, Goal, DailyCheckIn } from '@/types';

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
          setLoading(false);
        });

        return () => {
          unsubscribeGoals();
          unsubscribeTodayCheckIns();
          unsubscribeWeekCheckIns();
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

    try {
      if (existingCheckIn) {
        // Toggle existing check-in
        const checkInRef = doc(db, 'checkIns', existingCheckIn.id);
        await updateDoc(checkInRef, {
          completed: !existingCheckIn.completed,
          completedAt: !existingCheckIn.completed ? serverTimestamp() : null,
        });
      } else {
        // Create new check-in
        await addDoc(collection(db, 'checkIns'), {
          goalId,
          userId: currentUser.uid,
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
    </div>
  );
}
