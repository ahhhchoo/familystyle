'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import SignInScreen from '@/components/SignInScreen';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      console.log('User logged in, familyId:', user.familyId);
      if (user.familyId) {
        router.replace('/home');
      } else {
        router.replace('/join-family');
      }
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[var(--orange)]">
        <div className="animate-pulse text-white text-2xl font-bold">
          Loading...
        </div>
      </div>
    );
  }

  if (!user) {
    return <SignInScreen />;
  }

  return null;
}
