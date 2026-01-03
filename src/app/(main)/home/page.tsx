'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSwipeable } from 'react-swipeable';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import PersonCard from '@/components/PersonCard';
import { FamilyMemberStatus, DailyCheckIn, User, TimestampOrDate } from '@/types';

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

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const dateString = today.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  // Get today's date in YYYY-MM-DD format (local timezone)
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Swipe handlers for navigation
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => router.push('/overview'),
    preventScrollOnSwipe: true,
    trackMouse: false,
  });

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      router.push('/');
      return;
    }

    if (!user.familyId) {
      router.push('/join-family');
      return;
    }

    // Listen to family members and their check-ins
    const fetchFamilyData = async () => {
      try {
        // Get family document
        const familyRef = doc(db, 'families', user.familyId!);
        const familySnap = await getDoc(familyRef);
        
        if (!familySnap.exists()) {
          setLoading(false);
          return;
        }

        const familyData = familySnap.data();
        const memberIds = familyData.members as string[];

        // Listen to check-ins for today
        const checkInsQuery = query(
          collection(db, 'checkIns'),
          where('familyId', '==', user.familyId),
          where('date', '==', todayKey)
        );

        const unsubscribeCheckIns = onSnapshot(checkInsQuery, async (checkInsSnap) => {
          const checkIns = checkInsSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as DailyCheckIn[];
          


          // Fetch all member data
          const membersData: FamilyMemberStatus[] = [];

          for (const memberId of memberIds) {
            const memberRef = doc(db, 'users', memberId);
            const memberSnap = await getDoc(memberRef);
            
            if (memberSnap.exists()) {
              const memberData = memberSnap.data() as User;
              
              // For now, calculate from check-ins
              const memberCheckIns = checkIns.filter(c => c.userId === memberId);
              const completedCount = memberCheckIns.filter(c => c.completed).length;
              const totalGoals = memberCheckIns.length || 0;

              // Find latest completion time
              const completedCheckIns = memberCheckIns.filter(c => c.completed && c.completedAt);
              const latestCompletion = completedCheckIns.length > 0
                ? completedCheckIns.reduce((latest, current) => {
                    const currentTime = getTimeInMs(current.completedAt);
                    const latestTime = getTimeInMs(latest.completedAt);
                    return currentTime > latestTime ? current : latest;
                  })
                : null;

              membersData.push({
                uid: memberId,
                displayName: memberData.displayName,
                photoURL: memberData.photoURL,
                isComplete: totalGoals > 0 && completedCount === totalGoals,
                completedAt: latestCompletion?.completedAt || null,
                goalsCompleted: completedCount,
                totalGoals: totalGoals,
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
        });

        return () => unsubscribeCheckIns();
      } catch (error) {
        console.error('Error fetching family data:', error);
        setLoading(false);
      }
    };

    fetchFamilyData();
  }, [user, authLoading, router, todayKey]);

  const incompleteCount = familyMembers.filter(m => !m.isComplete).length;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-pulse text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div {...swipeHandlers} className="min-h-screen bg-black px-4 pt-16 pb-8">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white">{dateString}</h1>
            <p className="text-[var(--gray-text)] mt-1">
              {incompleteCount === 0 
                ? 'Everyone is complete!' 
                : `${incompleteCount} ${incompleteCount === 1 ? 'person' : 'people'} left`}
            </p>
          </div>
          
          {/* Menu Button */}
          <button
            onClick={() => router.push('/settings')}
            className="w-12 h-12 rounded-full bg-[var(--gray-dark)] flex items-center justify-center"
          >
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </div>
      </header>

      {/* Family Member Grid */}
      <div className="grid grid-cols-2 gap-3">
        {familyMembers.map((member) => (
          <PersonCard
            key={member.uid}
            member={member}
            isCurrentUser={member.uid === user?.uid}
            onClick={() => router.push(`/member/${member.uid}`)}
          />
        ))}
      </div>

      {/* Overview Button - Fixed at bottom right */}
      <div className="fixed bottom-8 right-4">
        <button 
          onClick={() => router.push('/overview')}
          className="flex items-center gap-2 px-5 py-3 border border-white/20 rounded-full 
                     text-white font-medium hover:bg-white/10 transition-colors"
        >
          Overview
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
