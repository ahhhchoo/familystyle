'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, arrayRemove } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Family } from '@/types';

export default function SettingsPage() {
  const { user, signOut, loading: authLoading } = useAuth();
  const router = useRouter();
  const [family, setFamily] = useState<Family | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    
    if (!user?.familyId) {
      router.push('/');
      return;
    }

    const fetchFamily = async () => {
      try {
        const familyRef = doc(db, 'families', user.familyId!);
        const familySnap = await getDoc(familyRef);
        
        if (familySnap.exists()) {
          setFamily({ id: familySnap.id, ...familySnap.data() } as Family);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching family:', error);
        setLoading(false);
      }
    };

    fetchFamily();
  }, [user, authLoading, router]);

  const handleCopyInviteCode = async () => {
    if (!family?.inviteCode) return;
    
    try {
      await navigator.clipboard.writeText(family.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleShareInvite = async () => {
    if (!family?.inviteCode) return;
    
    const shareData = {
      title: 'Join my family on Family Style!',
      text: `Join our family habit tracker! Use invite code: ${family.inviteCode}`,
      url: window.location.origin,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        handleCopyInviteCode();
      }
    } catch (error) {
      // User cancelled share
      console.log('Share cancelled');
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const handleLeaveFamily = async () => {
    if (!user?.familyId || !family) return;

    try {
      // Remove user from family members array
      await updateDoc(doc(db, 'families', user.familyId), {
        members: arrayRemove(user.uid),
      });

      // Remove familyId from user document
      await updateDoc(doc(db, 'users', user.uid), {
        familyId: null,
      });

      router.push('/join-family');
    } catch (error) {
      console.error('Error leaving family:', error);
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
      <header className="flex items-center mb-8">
        <button
          onClick={() => router.back()}
          className="w-12 h-12 rounded-full bg-[var(--gray-dark)] flex items-center justify-center"
        >
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold text-white ml-4">Settings</h1>
      </header>

      {/* Family Section */}
      <section className="mb-8">
        <h2 className="text-[var(--gray-text)] text-sm uppercase tracking-wide mb-3">
          Family
        </h2>
        <div className="bg-[var(--gray-dark)] rounded-2xl p-5">
          <p className="text-white font-semibold text-lg mb-1">{family?.name}</p>
          <p className="text-[var(--gray-text)] text-sm">
            {family?.members.length} {family?.members.length === 1 ? 'member' : 'members'}
          </p>
        </div>
      </section>

      {/* Invite Section */}
      <section className="mb-8">
        <h2 className="text-[var(--gray-text)] text-sm uppercase tracking-wide mb-3">
          Invite Family Members
        </h2>
        <div className="bg-[var(--gray-dark)] rounded-2xl p-5">
          <p className="text-[var(--gray-text)] text-sm mb-3">
            Share this code with family members so they can join:
          </p>
          
          {/* Invite Code Display */}
          <div className="flex items-center justify-between bg-[var(--gray-card)] rounded-xl p-4 mb-4">
            <span className="text-white text-2xl font-mono tracking-[0.3em]">
              {family?.inviteCode}
            </span>
            <button
              onClick={handleCopyInviteCode}
              className="text-[var(--orange)] font-medium"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Share Button */}
          <button
            onClick={handleShareInvite}
            className="w-full py-4 bg-[var(--orange)] text-white font-semibold rounded-full"
          >
            Share Invite
          </button>
        </div>
      </section>

      {/* Account Section */}
      <section className="mb-8">
        <h2 className="text-[var(--gray-text)] text-sm uppercase tracking-wide mb-3">
          Account
        </h2>
        <div className="bg-[var(--gray-dark)] rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-[var(--gray-card)]">
            <p className="text-white font-medium">{user?.displayName}</p>
            <p className="text-[var(--gray-text)] text-sm">{user?.email}</p>
          </div>
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="w-full p-5 text-left text-red-400 font-medium border-b border-[var(--gray-card)]"
          >
            Leave Family
          </button>
          <button
            onClick={handleSignOut}
            className="w-full p-5 text-left text-red-400 font-medium"
          >
            Sign Out
          </button>
        </div>
      </section>

      {/* Leave Family Confirmation Modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50">
          <div className="bg-[var(--gray-dark)] rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-white text-xl font-bold mb-2">Leave Family?</h3>
            <p className="text-[var(--gray-text)] mb-6">
              Are you sure you want to leave {family?.name}? You&apos;ll need an invite code to rejoin.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 py-3 bg-[var(--gray-card)] text-white font-medium rounded-full"
              >
                Cancel
              </button>
              <button
                onClick={handleLeaveFamily}
                className="flex-1 py-3 bg-red-500 text-white font-medium rounded-full"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
