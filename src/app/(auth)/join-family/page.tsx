'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, collection, addDoc, query, where, getDocs, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default function JoinFamilyPage() {
  const { user, signOut, loading: authLoading } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateFamily = async () => {
    if (!user || !familyName.trim()) return;
    
    setLoading(true);
    setError(null);

    try {
      const code = generateInviteCode();
      
      // Create family document
      const familyRef = await addDoc(collection(db, 'families'), {
        name: familyName.trim(),
        inviteCode: code,
        members: [user.uid],
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });

      // Update user with family ID
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        familyId: familyRef.id,
      });

      router.push('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create family');
      setLoading(false);
    }
  };

  const handleJoinFamily = async () => {
    if (!user || !inviteCode.trim()) return;
    
    setLoading(true);
    setError(null);

    try {
      // Find family by invite code
      const familiesQuery = query(
        collection(db, 'families'),
        where('inviteCode', '==', inviteCode.trim().toUpperCase())
      );
      
      const snapshot = await getDocs(familiesQuery);
      
      if (snapshot.empty) {
        setError('Invalid invite code. Please check and try again.');
        setLoading(false);
        return;
      }

      const familyDoc = snapshot.docs[0];
      const familyId = familyDoc.id;

      // Add user to family members
      await updateDoc(doc(db, 'families', familyId), {
        members: arrayUnion(user.uid),
      });

      // Update user with family ID
      await updateDoc(doc(db, 'users', user.uid), {
        familyId: familyId,
      });

      router.push('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join family');
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-pulse text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    router.push('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-black px-6 pt-16 pb-8 flex flex-col">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white">
          Welcome, {user.displayName?.split(' ')[0]}!
        </h1>
        <p className="text-[var(--gray-text)] mt-2">
          {mode === 'choose' 
            ? "Let's get you connected with your family."
            : mode === 'create'
              ? 'Create a new family group.'
              : 'Enter your family invite code.'}
        </p>
      </header>

      {/* Content */}
      <div className="flex-1 flex flex-col">
        {mode === 'choose' && (
          <div className="flex flex-col gap-4">
            <button
              onClick={() => setMode('create')}
              className="w-full py-5 px-6 bg-[var(--gray-dark)] rounded-2xl text-left"
            >
              <h3 className="text-white font-semibold text-lg">Create a Family</h3>
              <p className="text-[var(--gray-text)] text-sm mt-1">
                Start a new family group and invite others
              </p>
            </button>

            <button
              onClick={() => setMode('join')}
              className="w-full py-5 px-6 bg-[var(--gray-dark)] rounded-2xl text-left"
            >
              <h3 className="text-white font-semibold text-lg">Join a Family</h3>
              <p className="text-[var(--gray-text)] text-sm mt-1">
                Enter an invite code to join an existing family
              </p>
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="flex flex-col gap-6">
            <div>
              <label className="text-[var(--gray-text)] text-sm mb-2 block">
                Family Name
              </label>
              <input
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="The Smith Family"
                className="w-full py-4 px-5 bg-[var(--gray-dark)] rounded-2xl text-white 
                         placeholder:text-[var(--gray-text)] outline-none
                         focus:ring-2 focus:ring-[var(--orange)]"
              />
            </div>

            <button
              onClick={handleCreateFamily}
              disabled={!familyName.trim() || loading}
              className="w-full py-4 bg-[var(--orange)] text-white font-semibold rounded-full
                       disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Family'}
            </button>

            <button
              onClick={() => setMode('choose')}
              className="text-[var(--gray-text)] text-center"
            >
              Back
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="flex flex-col gap-6">
            <div>
              <label className="text-[var(--gray-text)] text-sm mb-2 block">
                Invite Code
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                className="w-full py-4 px-5 bg-[var(--gray-dark)] rounded-2xl text-white text-center
                         text-2xl tracking-[0.5em] font-mono
                         placeholder:text-[var(--gray-text)] placeholder:tracking-normal placeholder:text-base
                         outline-none focus:ring-2 focus:ring-[var(--orange)]"
              />
            </div>

            <button
              onClick={handleJoinFamily}
              disabled={inviteCode.length !== 6 || loading}
              className="w-full py-4 bg-[var(--orange)] text-white font-semibold rounded-full
                       disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Joining...' : 'Join Family'}
            </button>

            <button
              onClick={() => setMode('choose')}
              className="text-[var(--gray-text)] text-center"
            >
              Back
            </button>
          </div>
        )}

        {error && (
          <p className="mt-4 text-red-400 text-sm text-center">{error}</p>
        )}
      </div>

      {/* Sign Out */}
      <button
        onClick={signOut}
        className="text-[var(--gray-text)] text-sm text-center mt-8"
      >
        Sign out
      </button>
    </div>
  );
}
