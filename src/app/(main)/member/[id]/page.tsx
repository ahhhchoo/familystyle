'use client';

import { useState, useEffect, useMemo, use } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, onSnapshot, updateDoc, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import GoalItem from '@/components/GoalItem';

import { User, Goal, DailyCheckIn, Family } from '@/types';

// Helper: ordinal suffix (1st, 2nd, 3rd, 4th, ...)
function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Helper to get Monday of the current week
const getMondayOfWeek = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
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
  const dayOfWeek = date.getDay();
  const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return 7 - adjustedDay;
};

// Helper: Get date key in YYYY-MM-DD format
const getDateKey = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Helper: Get the date key a goal was created on
const getGoalCreatedDateKey = (goal: Goal): string => {
  if (!goal.createdAt) return '2000-01-01';
  if (typeof goal.createdAt === 'object' && 'seconds' in goal.createdAt) {
    return getDateKey(new Date(goal.createdAt.seconds * 1000));
  }
  if (goal.createdAt instanceof Date) {
    return getDateKey(goal.createdAt);
  }
  return '2000-01-01';
};

// Day names starting from Sunday
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

type DayStatus = 'complete' | 'partial' | 'none' | 'future';

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
  const [familyMemberIds, setFamilyMemberIds] = useState<string[]>([]);
  const [familyGoals, setFamilyGoals] = useState<Goal[]>([]);
  const [familyCheckIns, setFamilyCheckIns] = useState<DailyCheckIn[]>([]);
  const [loading, setLoading] = useState(true);

  const isCurrentUser = currentUser?.uid === memberId;
  const today = new Date();
  const todayKey = getDateKey(today);
  const weekDates = getWeekDates(today);

  useEffect(() => {
    if (authLoading) return;

    if (!currentUser) {
      router.push('/');
      return;
    }

    const fetchMemberData = async () => {
      try {
        const memberRef = doc(db, 'users', memberId);
        const memberSnap = await getDoc(memberRef);

        if (!memberSnap.exists()) {
          router.push('/home');
          return;
        }

        setMember(memberSnap.data() as User);

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
          goalsData.sort((a, b) => {
            const orderA = a.order ?? 999;
            const orderB = b.order ?? 999;
            if (orderA !== orderB) return orderA - orderB;
            const timeA = a.createdAt ? (typeof a.createdAt === 'object' && 'seconds' in a.createdAt ? a.createdAt.seconds : 0) : 0;
            const timeB = b.createdAt ? (typeof b.createdAt === 'object' && 'seconds' in b.createdAt ? b.createdAt.seconds : 0) : 0;
            return timeA - timeB;
          });
          setGoals(goalsData);
        });

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

        // Fetch family data for ranking
        let unsubscribeFamilyGoals: (() => void) | null = null;
        let unsubscribeFamilyCheckIns: (() => void) | null = null;

        if (currentUser?.familyId) {
          const familyRef = doc(db, 'families', currentUser.familyId);
          const familySnap = await getDoc(familyRef);
          if (familySnap.exists()) {
            const familyData = familySnap.data() as Family;
            setFamilyMemberIds(familyData.members || []);

            const familyGoalsQuery = query(
              collection(db, 'goals'),
              where('familyId', '==', currentUser.familyId),
              where('isActive', '==', true)
            );
            unsubscribeFamilyGoals = onSnapshot(familyGoalsQuery, (snapshot) => {
              setFamilyGoals(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Goal[]);
            });

            const familyCheckInsQuery = query(
              collection(db, 'checkIns'),
              where('familyId', '==', currentUser.familyId)
            );
            unsubscribeFamilyCheckIns = onSnapshot(familyCheckInsQuery, (snapshot) => {
              setFamilyCheckIns(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as DailyCheckIn[]);
            });
          }
        }

        return () => {
          unsubscribeGoals();
          unsubscribeTodayCheckIns();
          unsubscribeWeekCheckIns();
          unsubscribeAllCheckIns();
          if (unsubscribeFamilyGoals) unsubscribeFamilyGoals();
          if (unsubscribeFamilyCheckIns) unsubscribeFamilyCheckIns();
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
        const checkInRef = doc(db, 'checkIns', existingCheckIn.id);
        await updateDoc(checkInRef, {
          completed: !existingCheckIn.completed,
          completedAt: !existingCheckIn.completed ? serverTimestamp() : null,
        });
      } else {
        await addDoc(collection(db, 'checkIns'), {
          goalId,
          goalTitle: goal?.title || '',
          userId: currentUser.uid,
          userName: currentUser.displayName,
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

  const getWeeklyProgress = (goalId: string): number => {
    return weekCheckIns.filter(c => c.goalId === goalId && c.completed).length;
  };

  const isGoalComplete = (goal: Goal): boolean => {
    if (goal.frequency === 'daily') {
      return todayCheckIns.some(c => c.goalId === goal.id && c.completed);
    } else {
      const weekCount = getWeeklyProgress(goal.id);
      const target = goal.weeklyTarget || 1;
      const stillNeeded = target - weekCount;
      const daysRemaining = getDaysRemainingInWeek(today);
      return weekCount >= target || stillNeeded <= daysRemaining;
    }
  };

  const completedCount = goals.filter(isGoalComplete).length;

  // Calculate day statuses for the entire year
  const year = today.getFullYear();
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const totalDays = isLeapYear ? 366 : 365;

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
      // Only count daily goals that existed on this day
      const dailyGoals = goals
        .filter(g => (g.frequency || 'daily') === 'daily')
        .filter(g => getGoalCreatedDateKey(g) <= dateKey);
      const totalDailyGoals = dailyGoals.length;

      if (totalDailyGoals === 0) {
        if (completedCheckIns.length > 0) {
          statuses.set(dateKey, 'complete');
        } else {
          statuses.set(dateKey, 'none');
        }
        continue;
      }

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

  // Calculate total completion rate for this member
  const startOfYear = new Date(year, 0, 1);
  const dayOfYear = Math.floor((today.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const completedDays = Array.from(dayStatuses.values()).filter(s => s === 'complete').length;
  const totalCompletionRate = dayOfYear > 0 ? Math.round((completedDays / dayOfYear) * 100) : 0;

  // Calculate ranking among family members
  const familyRanking = useMemo(() => {
    if (familyMemberIds.length === 0) return { rank: 0, total: 0 };

    const memberRates: { uid: string; rate: number }[] = familyMemberIds.map(mid => {
      const memberGoals = familyGoals.filter(g => g.userId === mid);
      if (memberGoals.length === 0) return { uid: mid, rate: 0 };

      let memberCompleteDays = 0;
      let memberTotalDays = 0;

      for (let i = 0; i < totalDays; i++) {
        const date = new Date(year, 0, i + 1);
        const dateKey = getDateKey(date);
        if (dateKey > todayKey) break;

        const activeGoals = memberGoals.filter(g => getGoalCreatedDateKey(g) <= dateKey);
        if (activeGoals.length === 0) continue;

        memberTotalDays++;
        const dayCheckIns = familyCheckIns.filter(c => c.date === dateKey && c.userId === mid && c.completed);
        const allGoalsComplete = activeGoals.every(g => dayCheckIns.some(c => c.goalId === g.id));
        if (allGoalsComplete) memberCompleteDays++;
      }

      return { uid: mid, rate: memberTotalDays > 0 ? memberCompleteDays / memberTotalDays : 0 };
    });

    memberRates.sort((a, b) => b.rate - a.rate);
    const rank = memberRates.findIndex(m => m.uid === memberId) + 1;
    return { rank, total: familyMemberIds.length };
  }, [familyMemberIds, familyGoals, familyCheckIns, totalDays, todayKey, year, memberId]);

  // Build weekly breakdown data for the "Your stats" view
  const weeksData = useMemo(() => {
    const weeks: WeekData[] = [];
    const startOfYear = new Date(year, 0, 1);

    // Find the first Sunday on or before Jan 1
    // We use Sun-Sat weeks to match the Figma design (starts with Sun)
    let currentSunday = new Date(startOfYear);
    const startDayOfWeek = currentSunday.getDay(); // 0=Sun
    if (startDayOfWeek !== 0) {
      // Go back to previous Sunday
      currentSunday.setDate(currentSunday.getDate() - startDayOfWeek);
    }

    let weekNum = 1;

    while (true) {
      const weekStart = new Date(currentSunday);
      const weekEnd = new Date(currentSunday);
      weekEnd.setDate(weekEnd.getDate() + 6); // Saturday

      // If the entire week is past the current date, stop
      if (getDateKey(weekStart) > todayKey) break;

      const days: WeekData['days'] = [];
      let completeDays = 0;
      let totalCountedDays = 0;

      for (let d = 0; d < 7; d++) {
        const dayDate = new Date(weekStart);
        dayDate.setDate(weekStart.getDate() + d);
        const dateKey = getDateKey(dayDate);
        const dayName = DAY_NAMES[d];

        // Only include days that are in the current year
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

    // Return in reverse order (most recent week first)
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
            <span className="text-xs mb-1">{isCurrentUser ? 'Your Stats' : 'Stats'}</span>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        </div>
      </section>

      {/* Second Section - Weekly Stats (new Figma design) */}
      <section id="stats-section" className="min-h-screen snap-start px-4 pt-16 pb-8">
        {/* Header */}
        <h1 className="text-[32px] font-[800] text-white leading-none mb-2">
          {isCurrentUser ? 'Your stats' : `${member?.displayName}'s stats`}
        </h1>
        <p className="text-base text-white/60 leading-snug">
          Total completion rate: {totalCompletionRate}%
        </p>
        {familyRanking.rank > 0 && (
          <p className="text-base text-white/60 leading-snug mb-6">
            <span className="font-bold text-white">{getOrdinal(familyRanking.rank)}</span> place in your family
          </p>
        )}

        {/* Weeks */}
        <div className="space-y-6">
          {weeksData.map((week) => (
            <div key={week.weekNumber}>
              {/* Week label row */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-base font-bold text-white tracking-[-0.4px]">
                  Week {week.weekNumber} - {week.completionRate}%
                </p>
                <p className="text-base font-bold text-white/60 tracking-[-0.4px]">
                  {formatDateRange(week.startDate, week.endDate)}
                </p>
              </div>

              {/* Day cards row - horizontally scrollable */}
              <div className="flex gap-[4px] overflow-x-auto no-scrollbar -mx-4 px-4">
                {week.days.map((day) => {
                  const isFuture = day.status === 'future';
                  const isComplete = day.status === 'complete';

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
