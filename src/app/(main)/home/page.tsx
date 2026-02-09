'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

import { FamilyMemberStatus, DailyCheckIn, User, TimestampOrDate, Goal, EmojiBadge } from '@/types';

// Helper to convert Firestore timestamp to milliseconds
const getTimeInMs = (timestamp: TimestampOrDate): number => {
  if (!timestamp) return 0;
  if (typeof timestamp === 'object' && 'seconds' in timestamp) {
    return timestamp.seconds * 1000;
  }
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }
  return 0;
};



// Helper: Get date key in YYYY-MM-DD format
const getDateKey = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Helper: Get the Monday of the week for a given date
const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
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

// Helper: Get the Sunday-based week start for a given date (for last week comparison)
const getSundayWeekStart = (date: Date): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
};

// Helper: Get consecutive streak of "all goals complete" days ending at a given date
function getStreak(
  memberId: string,
  memberGoals: Goal[],
  checkIns: DailyCheckIn[],
  endDateKey: string,
): number {
  if (memberGoals.length === 0) return 0;
  let streak = 0;
  const [y, m, d] = endDateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);

  for (let i = 0; i < 365; i++) {
    const dateKey = getDateKey(date);
    const dayCheckIns = checkIns.filter(
      c => c.date === dateKey && c.userId === memberId && c.completed
    );
    const allDone = memberGoals.every(g => dayCheckIns.some(c => c.goalId === g.id));
    if (allDone) {
      streak++;
    } else {
      break;
    }
    date.setDate(date.getDate() - 1);
  }
  return streak;
}

// Helper: count total complete days for a member in the year so far
function getTotalCompleteDays(
  memberId: string,
  memberGoals: Goal[],
  checkIns: DailyCheckIn[],
  todayKey: string,
): number {
  if (memberGoals.length === 0) return 0;
  let count = 0;
  const year = new Date().getFullYear();
  const date = new Date(year, 0, 1);

  while (getDateKey(date) <= todayKey) {
    const dateKey = getDateKey(date);
    const dayCheckIns = checkIns.filter(
      c => c.date === dateKey && c.userId === memberId && c.completed
    );
    if (memberGoals.every(g => dayCheckIns.some(c => c.goalId === g.id))) {
      count++;
    }
    date.setDate(date.getDate() + 1);
  }
  return count;
}

// Helper: compute completion rate for a member during a specific date range
function getCompletionRateForRange(
  memberId: string,
  memberGoals: Goal[],
  checkIns: DailyCheckIn[],
  startKey: string,
  endKey: string,
): number {
  if (memberGoals.length === 0) return 0;
  let completeDays = 0;
  let totalDays = 0;
  const [sy, sm, sd] = startKey.split('-').map(Number);
  const date = new Date(sy, sm - 1, sd);

  while (getDateKey(date) <= endKey) {
    totalDays++;
    const dateKey = getDateKey(date);
    const dayCheckIns = checkIns.filter(
      c => c.date === dateKey && c.userId === memberId && c.completed
    );
    if (memberGoals.every(g => dayCheckIns.some(c => c.goalId === g.id))) {
      completeDays++;
    }
    date.setDate(date.getDate() + 1);
  }
  return totalDays > 0 ? completeDays / totalDays : 0;
}

// Compute the emoji badge for a family member (priority order)
function computeEmojiBadge(
  memberId: string,
  memberGoals: Goal[],
  allCheckIns: DailyCheckIn[],
  allGoals: Goal[],
  memberIds: string[],
  todayKey: string,
  isCompleteToday: boolean,
): EmojiBadge {
  // --- 1. Crown: #1 in family by total complete days ---
  const memberCompleteDays = memberIds.map(mid => ({
    uid: mid,
    days: getTotalCompleteDays(mid, allGoals.filter(g => g.userId === mid), allCheckIns, todayKey),
  }));
  memberCompleteDays.sort((a, b) => b.days - a.days);
  if (memberCompleteDays[0]?.uid === memberId && memberCompleteDays[0]?.days > 0) {
    // Make sure it's not a tie with everyone
    const topDays = memberCompleteDays[0].days;
    const tiedCount = memberCompleteDays.filter(m => m.days === topDays).length;
    if (tiedCount < memberIds.length) {
      return '👑';
    }
  }

  // --- 2. Lightning: 7+ day streak ---
  const streak = getStreak(memberId, memberGoals, allCheckIns, todayKey);
  if (streak >= 7) return '⚡';

  // --- 3. Fire: 3+ day streak ---
  if (streak >= 3) return '🔥';

  // --- 4. Rank up: moved up vs last week ---
  const thisWeekStart = getSundayWeekStart(new Date());
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);

  const lastWeekStartKey = getDateKey(lastWeekStart);
  const lastWeekEndKey = getDateKey(lastWeekEnd);
  const thisWeekStartKey = getDateKey(thisWeekStart);

  // Only check rank-up if we have at least 1 day of data this week
  if (thisWeekStartKey <= todayKey) {
    const lastWeekRanks = memberIds.map(mid => ({
      uid: mid,
      rate: getCompletionRateForRange(mid, allGoals.filter(g => g.userId === mid), allCheckIns, lastWeekStartKey, lastWeekEndKey),
    }));
    lastWeekRanks.sort((a, b) => b.rate - a.rate);
    const lastWeekRank = lastWeekRanks.findIndex(m => m.uid === memberId) + 1;

    const thisWeekRanks = memberIds.map(mid => ({
      uid: mid,
      rate: getCompletionRateForRange(mid, allGoals.filter(g => g.userId === mid), allCheckIns, thisWeekStartKey, todayKey),
    }));
    thisWeekRanks.sort((a, b) => b.rate - a.rate);
    const thisWeekRank = thisWeekRanks.findIndex(m => m.uid === memberId) + 1;

    if (thisWeekRank < lastWeekRank) return '📈';
  }

  // --- 5. Trophy: 30+ total complete days ---
  const totalComplete = memberCompleteDays.find(m => m.uid === memberId)?.days || 0;
  if (totalComplete >= 30) return '🏆';

  // --- 6. Star: perfect week so far (all days complete this week) ---
  if (thisWeekStartKey <= todayKey) {
    const [sy, sm, sd] = thisWeekStartKey.split('-').map(Number);
    const weekDate = new Date(sy, sm - 1, sd);
    let perfectWeek = true;
    let hasDays = false;

    while (getDateKey(weekDate) <= todayKey) {
      hasDays = true;
      const dateKey = getDateKey(weekDate);
      const dayCheckIns = allCheckIns.filter(
        c => c.date === dateKey && c.userId === memberId && c.completed
      );
      if (!memberGoals.every(g => dayCheckIns.some(c => c.goalId === g.id))) {
        perfectWeek = false;
        break;
      }
      weekDate.setDate(weekDate.getDate() + 1);
    }

    if (perfectWeek && hasDays && memberGoals.length > 0) return '🌟';
  }

  // --- 7. Bullseye: just completed all goals today ---
  if (isCompleteToday) return '🎯';

  // --- 8. Zzz: inactive 2+ days ---
  if (memberGoals.length > 0) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dayBefore = new Date();
    dayBefore.setDate(dayBefore.getDate() - 2);

    const yesterdayCheckIns = allCheckIns.filter(
      c => c.date === getDateKey(yesterday) && c.userId === memberId && c.completed
    );
    const dayBeforeCheckIns = allCheckIns.filter(
      c => c.date === getDateKey(dayBefore) && c.userId === memberId && c.completed
    );

    if (yesterdayCheckIns.length === 0 && dayBeforeCheckIns.length === 0 && !isCompleteToday) {
      return '💤';
    }
  }

  return null;
}



// Goal card icon - uses same smiley/neutral face from GoalItem with pulse animation
function GoalCardIcon({ completed, isPulsing, isAnimatingCheck, size = 48 }: { 
  completed: boolean; 
  isPulsing: boolean;
  isAnimatingCheck: boolean;
  size?: number;
}) {
  const iconSize = size * 0.55; // scale the face SVG relative to circle
  return (
    <div
      className={`rounded-full flex items-center justify-center transition-all duration-300
        ${completed ? 'bg-[var(--orange)]' : 'bg-[var(--gray-card)]'}
        ${isPulsing ? 'scale-125' : 'scale-100'}`}
      style={{
        width: size,
        height: size,
        boxShadow: isPulsing ? '0 0 20px rgba(245, 165, 36, 0.5)' : 'none',
      }}
    >
      {completed ? (
        <svg 
          style={{
            width: iconSize, height: iconSize,
            opacity: isAnimatingCheck ? 0 : 1,
            transform: isAnimatingCheck ? 'scale(0.5)' : 'scale(1)',
            transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
          }}
          viewBox="0 0 21.5 21.5" 
          fill="none"
          stroke="white" 
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8.25 8.75C8.25 9.02614 8.02614 9.25 7.75 9.25C7.47386 9.25 7.25 9.02614 7.25 8.75M8.25 8.75C8.25 8.47386 8.02614 8.25 7.75 8.25C7.47386 8.25 7.25 8.47386 7.25 8.75M8.25 8.75H7.25M14.25 8.75C14.25 9.02614 14.0261 9.25 13.75 9.25C13.4739 9.25 13.25 9.02614 13.25 8.75M14.25 8.75C14.25 8.47386 14.0261 8.25 13.75 8.25C13.4739 8.25 13.25 8.47386 13.25 8.75M14.25 8.75H13.25M14.7502 13.75C13.838 14.9644 12.3857 15.75 10.7499 15.75C9.11406 15.75 7.66172 14.9644 6.74951 13.75M10.75 20.75C5.22715 20.75 0.75 16.2728 0.75 10.75C0.75 5.22715 5.22715 0.75 10.75 0.75C16.2728 0.75 20.75 5.22715 20.75 10.75C20.75 16.2728 16.2728 20.75 10.75 20.75Z" />
        </svg>
      ) : (
        <svg 
          style={{ width: iconSize, height: iconSize }}
          fill="none" 
          viewBox="0 0 21.5 21.5"
          stroke="white"
          strokeOpacity={0.6}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8.25 8.75C8.25 9.02614 8.02614 9.25 7.75 9.25C7.47386 9.25 7.25 9.02614 7.25 8.75M8.25 8.75C8.25 8.47386 8.02614 8.25 7.75 8.25C7.47386 8.25 7.25 8.47386 7.25 8.75M8.25 8.75H7.25M14.25 8.75C14.25 9.02614 14.0261 9.25 13.75 9.25C13.4739 9.25 13.25 9.02614 13.25 8.75M14.25 8.75C14.25 8.47386 14.0261 8.25 13.75 8.25C13.4739 8.25 13.25 8.47386 13.25 8.75M14.25 8.75H13.25M13.75 13.75H7.75M10.75 20.75C5.22715 20.75 0.75 16.2728 0.75 10.75C0.75 5.22715 5.22715 0.75 10.75 0.75C16.2728 0.75 20.75 5.22715 20.75 10.75C20.75 16.2728 16.2728 20.75 10.75 20.75Z" />
        </svg>
      )}
    </div>
  );
}

// Wrapper component that manages per-goal pulse animation state
function GoalCard({ 
  goal, 
  isCompleted, 
  onToggle,
  weeklyProgress,
}: { 
  goal: Goal; 
  isCompleted: boolean; 
  onToggle: () => void;
  weeklyProgress?: number;
}) {
  const [isPulsing, setIsPulsing] = useState(false);
  const [isAnimatingCheck, setIsAnimatingCheck] = useState(false);
  const prevCompletedRef = useRef(isCompleted);

  const isWeekly = goal.frequency === 'weekly' && goal.weeklyTarget;

  useEffect(() => {
    if (isCompleted && !prevCompletedRef.current) {
      setIsPulsing(true);
      setIsAnimatingCheck(true);
      const pulseTimer = setTimeout(() => setIsPulsing(false), 400);
      const animTimer = setTimeout(() => setIsAnimatingCheck(false), 50);
      return () => {
        clearTimeout(pulseTimer);
        clearTimeout(animTimer);
      };
    }
    prevCompletedRef.current = isCompleted;
  }, [isCompleted]);

  return (
    <button
      onClick={onToggle}
      className="shrink-0 w-[120px] h-[179px] bg-[#1e1d1d] first:rounded-l-xl last:rounded-r-xl overflow-hidden flex flex-col items-center justify-between py-6 px-3 transition-transform active:scale-[0.97] relative"
    >
      {/* Weekly progress label */}
      {isWeekly && (
        <span className="absolute top-2 right-2 text-white/60 text-xs font-medium">
          {weeklyProgress ?? 0}/{goal.weeklyTarget}
        </span>
      )}
      <GoalCardIcon 
        completed={isCompleted} 
        isPulsing={isPulsing} 
        isAnimatingCheck={isAnimatingCheck} 
        size={48} 
      />
      <p className="text-white text-sm font-medium tracking-[-0.4px] text-center leading-tight mt-auto">
        {goal.title}
      </p>
    </button>
  );
}

// Animated progress ring component
function ProgressRing({ 
  progress, 
  size = 48, 
  strokeWidth = 3 
}: { 
  progress: number; 
  size?: number; 
  strokeWidth?: number;
}) {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (animatedProgress / 100) * circumference;

  useEffect(() => {
    const duration = 500;
    const startProgress = animatedProgress;
    const endProgress = progress;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = startProgress + (endProgress - startProgress) * eased;
      
      setAnimatedProgress(current);
      
      if (t < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [progress]);
  
  return (
    <svg
      width={size}
      height={size}
      className="absolute -rotate-90"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={strokeWidth}
      />
      {animatedProgress > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--green)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

// Format Firestore timestamp to time string
const formatTime = (date: TimestampOrDate): string => {
  if (!date) return 'waiting';
  try {
    let dateObj: Date;
    if (typeof date === 'object' && 'seconds' in date) {
      dateObj = new Date(date.seconds * 1000);
    } else if (date instanceof Date) {
      dateObj = date;
    } else {
      dateObj = new Date(date);
    }
    if (isNaN(dateObj.getTime())) return 'waiting';
    return dateObj.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return 'waiting';
  }
};

// Family member row component
function FamilyMemberRow({
  member,
  isCurrentUser,
  onClick,
}: {
  member: FamilyMemberStatus;
  isCurrentUser: boolean;
  onClick: () => void;
}) {
  const isComplete = member.goalsCompleted === member.totalGoals && member.totalGoals > 0;
  const isPartial = member.goalsCompleted > 0 && !isComplete;
  const progress = member.totalGoals > 0 
    ? Math.round((member.goalsCompleted / member.totalGoals) * 100) 
    : 0;

  return (
    <button
      onClick={onClick}
      className="w-full bg-[#1e1d1d] rounded-xl p-4 flex items-center gap-4 transition-transform active:scale-[0.98]"
    >
      {/* Avatar with emoji badge */}
      <div className="relative w-12 h-12 shrink-0">
        <div className="w-12 h-12 rounded-full overflow-hidden bg-[var(--gray-card)]">
          {(member.customPhotoURL || member.photoURL) ? (
            <Image
              src={member.customPhotoURL || member.photoURL || ''}
              alt={member.displayName}
              width={48}
              height={48}
              className="object-cover w-full h-full"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg text-white font-medium">
              {member.displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        {member.emojiBadge && (
          <span className="absolute -bottom-1 -right-1 text-sm leading-none">
            {member.emojiBadge}
          </span>
        )}
      </div>

      {/* Name */}
      <span className="text-white font-bold text-base flex-1 text-left tracking-[-0.4px]">
        {member.displayName}
        {isCurrentUser && <span className="text-[var(--gray-text)] font-normal"> (You)</span>}
      </span>

      {/* Completion text */}
      <div className="text-right shrink-0 mr-1">
        <p className="text-white text-sm font-medium tracking-[-0.4px]">
          {isComplete ? 'Complete' : 'Incomplete'}
        </p>
        <p className="text-[var(--gray-text)] text-sm italic tracking-[-0.4px]">
          {isComplete ? formatTime(member.completedAt) : 'waiting'}
        </p>
      </div>

      {/* Status Icon with Progress Ring */}
      <div className="relative w-12 h-12 shrink-0">
        {/* Progress ring - only show when partial */}
        {isPartial && (
          <ProgressRing progress={progress} size={48} strokeWidth={3} />
        )}
        
        {/* Inner circle with icon */}
        <div
          className={`absolute inset-[3px] rounded-full flex items-center justify-center
            ${isComplete ? 'bg-[var(--green)]' : 'bg-[var(--gray-card)]'}`}
        >
          {isComplete ? (
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-[var(--gray-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
            </svg>
          )}
        </div>
      </div>
    </button>
  );
}

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberStatus[]>([]);
  const [currentUserGoals, setCurrentUserGoals] = useState<Goal[]>([]);
  const [todayCheckIns, setTodayCheckIns] = useState<DailyCheckIn[]>([]);
  const [weekCheckIns, setWeekCheckIns] = useState<DailyCheckIn[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  const diffTime = today.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

  // Get today's date key
  const todayKey = getDateKey(today);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.replace('/');
      return;
    }

    if (!user.familyId) {
      router.replace('/join-family');
      return;
    }

    let unsubscribeCheckIns: (() => void) | null = null;
    let unsubscribeFamilyGoals: (() => void) | null = null;
    let unsubscribeUserCheckIns: (() => void) | null = null;
    const userUnsubscribes: (() => void)[] = [];

    const fetchFamilyData = async () => {
      try {
        const familyRef = doc(db, 'families', user.familyId!);
        const familySnap = await getDoc(familyRef);

        if (!familySnap.exists()) {
          setLoading(false);
          return;
        }

        const familyData = familySnap.data();
        const memberIds = familyData.members as string[];

        const memberDataMap = new Map<string, User>();
        let latestCheckIns: DailyCheckIn[] = [];
        let allGoals: Goal[] = [];

        const rebuildMembersData = () => {
          const todayCheckInsData = latestCheckIns.filter(c => c.date === todayKey);
          const membersData: FamilyMemberStatus[] = [];

          for (const memberId of memberIds) {
            const memberData = memberDataMap.get(memberId);

            if (memberData) {
              const memberGoals = allGoals.filter(g => g.userId === memberId);

              // For the home page, family progress is based on today:
              // count a goal as "done" if it has a completed check-in today,
              // regardless of daily vs weekly frequency.
              let goalsCompletedToday = 0;

              memberGoals.forEach(goal => {
                const isCompletedToday = todayCheckInsData.some(
                  c => c.userId === memberId && c.goalId === goal.id && c.completed
                );
                if (isCompletedToday) goalsCompletedToday++;
              });

              const totalGoals = memberGoals.length;
              const completedGoals = goalsCompletedToday;
              const isComplete = totalGoals > 0 && completedGoals === totalGoals;


              const memberTodayCompletedCheckIns = todayCheckInsData.filter(
                c => c.userId === memberId && c.completed && c.completedAt
              );
              const latestCompletion = memberTodayCompletedCheckIns.length > 0
                ? memberTodayCompletedCheckIns.reduce((latest, current) => {
                    const currentTime = getTimeInMs(current.completedAt);
                    const latestTime = getTimeInMs(latest.completedAt);
                    return currentTime > latestTime ? current : latest;
                  })
                : null;

              const emojiBadge = computeEmojiBadge(
                memberId,
                memberGoals,
                latestCheckIns,
                allGoals,
                memberIds,
                todayKey,
                isComplete,
              );

              membersData.push({
                uid: memberId,
                displayName: memberData.displayName,
                photoURL: memberData.photoURL,
                customPhotoURL: memberData.customPhotoURL || null,
                isComplete,
                completedAt: latestCompletion?.completedAt || null,
                goalsCompleted: completedGoals,
                totalGoals: totalGoals,
                emojiBadge,
              });
            }
          }

          // Sort: current user first, then by completion status
          membersData.sort((a, b) => {
            if (a.uid === user.uid) return -1;
            if (b.uid === user.uid) return 1;
            if (a.isComplete && !b.isComplete) return 1;
            if (!a.isComplete && b.isComplete) return -1;
            return 0;
          });

          setFamilyMembers(membersData);
          setLoading(false);
        };

        // Set up listeners for each family member's user document
        for (const memberId of memberIds) {
          const memberRef = doc(db, 'users', memberId);
          const unsubscribe = onSnapshot(memberRef, (memberSnap) => {
            if (memberSnap.exists()) {
              memberDataMap.set(memberId, { uid: memberId, ...memberSnap.data() } as User);
              if (memberDataMap.size === memberIds.length) {
                rebuildMembersData();
              }
            }
          });
          userUnsubscribes.push(unsubscribe);
        }

        // Listen to ALL family goals (real-time so family progress stays in sync)
        const goalsQuery = query(
          collection(db, 'goals'),
          where('familyId', '==', user.familyId),
          where('isActive', '==', true)
        );

        unsubscribeFamilyGoals = onSnapshot(goalsQuery, (goalsSnap) => {
          allGoals = goalsSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
          })) as Goal[];

          // Also update currentUserGoals from the same source
          const userGoals = allGoals
            .filter(g => g.userId === user.uid)
            .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
          setCurrentUserGoals(userGoals);

          if (memberDataMap.size === memberIds.length) {
            rebuildMembersData();
          }
        });

        // Listen to check-ins
        const checkInsQuery = query(
          collection(db, 'checkIns'),
          where('familyId', '==', user.familyId)
        );

        unsubscribeCheckIns = onSnapshot(checkInsQuery, (checkInsSnap) => {
          latestCheckIns = checkInsSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
          })) as DailyCheckIn[];

          // Also update todayCheckIns and weekCheckIns for current user's goal cards
          const userTodayCheckIns = latestCheckIns.filter(
            c => c.userId === user.uid && c.date === todayKey
          );
          setTodayCheckIns(userTodayCheckIns);

          const weekDates = getWeekDates(today);
          const userWeekCheckIns = latestCheckIns.filter(
            c => c.userId === user.uid && weekDates.includes(c.date) && c.completed
          );
          setWeekCheckIns(userWeekCheckIns);

          if (memberDataMap.size === memberIds.length) {
            rebuildMembersData();
          }
        });

      } catch (error) {
        console.error('Error fetching family data:', error);
        setLoading(false);
      }
    };

    fetchFamilyData();

    return () => {
      if (unsubscribeCheckIns) unsubscribeCheckIns();
      if (unsubscribeFamilyGoals) unsubscribeFamilyGoals();
      userUnsubscribes.forEach(unsub => unsub());
    };
  }, [user, authLoading, router, todayKey]);

  const handleToggleGoal = async (goalId: string) => {
    if (!user?.familyId) return;

    const existingCheckIn = todayCheckIns.find(c => c.goalId === goalId);
    const goal = currentUserGoals.find(g => g.id === goalId);

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
          userId: user.uid,
          userName: user.displayName,
          familyId: user.familyId,
          date: todayKey,
          completed: true,
          completedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error('Error toggling goal:', error);
    }
  };

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
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-[32px] font-[800] text-white leading-none">
          Day {dayOfYear}
        </h1>
        <div className="flex items-center gap-3">
          {/* Profile icon - navigates to your stats (exact Figma SVG) */}
          <button
            onClick={() => router.push('/profile')}
            className="w-6 h-6 flex items-center justify-center"
          >
            <svg width="20" height="22" viewBox="0 0 17.5 21.5" fill="none">
              <path d="M0.75 17.55C0.75 14.899 2.89903 12.75 5.55 12.75H11.95C14.601 12.75 16.75 14.899 16.75 17.55C16.75 19.3173 15.3173 20.75 13.55 20.75H3.95C2.18269 20.75 0.75 19.3173 0.75 17.55Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12.75 4.75C12.75 6.95914 10.9591 8.75 8.75 8.75C6.54086 8.75 4.75 6.95914 4.75 4.75C4.75 2.54086 6.54086 0.75 8.75 0.75C10.9591 0.75 12.75 2.54086 12.75 4.75Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {/* Bar chart icon - navigates to overview (exact Figma SVG) */}
          <button
            onClick={() => router.push('/overview')}
            className="w-6 h-6 flex items-center justify-center"
          >
            <svg width="22" height="22" viewBox="0 0 21.5 21.5" fill="none">
              <path d="M5.75 6.75V14.75M10.75 9.75V14.75M15.75 7.75L15.75 14.75M10.35 20.75H11.15C14.5103 20.75 16.1905 20.75 17.4739 20.096C18.6029 19.5208 19.5208 18.6029 20.096 17.4739C20.75 16.1905 20.75 14.5103 20.75 11.15V10.35C20.75 6.98969 20.75 5.30953 20.096 4.02606C19.5208 2.89708 18.6029 1.9792 17.4739 1.40396C16.1905 0.75 14.5103 0.75 11.15 0.75H10.35C6.98969 0.75 5.30953 0.75 4.02606 1.40396C2.89708 1.9792 1.9792 2.89708 1.40396 4.02606C0.75 5.30953 0.75 6.98969 0.75 10.35V11.15C0.75 14.5103 0.75 16.1905 1.40396 17.4739C1.9792 18.6029 2.89708 19.5208 4.02606 20.096C5.30953 20.75 6.98969 20.75 10.35 20.75Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Your Goals Section */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-white/80 tracking-[-0.4px]">Your Goals</h2>
          <button
            onClick={() => router.push('/goals/edit')}
            className="w-6 h-6 flex items-center justify-center"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <circle cx="6" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="18" cy="12" r="2" />
            </svg>
          </button>
        </div>

        {/* Horizontally scrollable goal cards */}
        <div className="flex gap-[5px] overflow-x-auto no-scrollbar -mx-4 px-4">
          {currentUserGoals.length > 0 ? (
            currentUserGoals.map((goal) => {
              const isCompleted = todayCheckIns.some(c => c.goalId === goal.id && c.completed);
              const weeklyProgress = goal.frequency === 'weekly'
                ? weekCheckIns.filter(c => c.goalId === goal.id).length
                : undefined;
              return (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  isCompleted={isCompleted}
                  onToggle={() => handleToggleGoal(goal.id)}
                  weeklyProgress={weeklyProgress}
                />
              );
            })
          ) : (
            <button
              onClick={() => router.push('/goals/edit')}
              className="shrink-0 w-[120px] h-[179px] bg-[#1e1d1d] rounded-xl overflow-hidden flex flex-col items-center justify-center px-3"
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <p className="text-white/40 text-sm font-medium mt-2">Add goals</p>
            </button>
          )}
        </div>
      </section>

      {/* Family Progress Section */}
      <section>
        <h2 className="text-base font-bold text-white/80 tracking-[-0.4px] mb-3">Family Progress</h2>
        <div className="flex flex-col gap-4">
          {familyMembers.map((member) => (
            <FamilyMemberRow
              key={member.uid}
              member={member}
              isCurrentUser={member.uid === user?.uid}
              onClick={() => router.push(`/member/${member.uid}`)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
