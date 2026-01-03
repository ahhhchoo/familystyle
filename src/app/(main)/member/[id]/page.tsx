'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, onSnapshot, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import GoalItem from '@/components/GoalItem';
import { User, Goal, DailyCheckIn } from '@/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function MemberPage({ params }: PageProps) {
  const { id: memberId } = use(params);
  const { user: currentUser, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [member, setMember] = useState<User | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [checkIns, setCheckIns] = useState<DailyCheckIn[]>([]);
  const [loading, setLoading] = useState(true);

  const isCurrentUser = currentUser?.uid === memberId;
  // Use local timezone for date key
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

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
        const checkInsQuery = query(
          collection(db, 'checkIns'),
          where('userId', '==', memberId),
          where('date', '==', todayKey)
        );

        const unsubscribeCheckIns = onSnapshot(checkInsQuery, (snapshot) => {
          const checkInsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as DailyCheckIn[];
          setCheckIns(checkInsData);
          setLoading(false);
        });

        return () => {
          unsubscribeGoals();
          unsubscribeCheckIns();
        };
      } catch (error) {
        console.error('Error fetching member data:', error);
        setLoading(false);
      }
    };

    fetchMemberData();
  }, [memberId, currentUser, authLoading, router, todayKey]);

  const handleToggleGoal = async (goalId: string) => {
    if (!isCurrentUser || !currentUser?.familyId) return;

    const existingCheckIn = checkIns.find(c => c.goalId === goalId);

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

  const completedCount = goals.filter(goal => 
    checkIns.some(c => c.goalId === goal.id && c.completed)
  ).length;

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
          {completedCount}/{goals.length} Complete
        </p>
      </div>

      {/* Goals List */}
      <div className="flex flex-col gap-3">
        {goals.map((goal) => {
          const checkIn = checkIns.find(c => c.goalId === goal.id);
          const isCompleted = checkIn?.completed ?? false;
          
          return (
            <GoalItem
              key={goal.id}
              title={goal.title}
              completed={isCompleted}
              onToggle={isCurrentUser ? () => handleToggleGoal(goal.id) : undefined}
              disabled={!isCurrentUser}
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
