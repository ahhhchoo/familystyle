'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, arrayRemove, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Family, User } from '@/types';
import ProfilePictureUpload from '@/components/ProfilePictureUpload';

interface MemberInfo {
  uid: string;
  displayName: string;
  photoURL: string | null;
  customPhotoURL?: string | null;
  email: string;
}

export default function SettingsPage() {
  const { user, signOut, loading: authLoading } = useAuth();
  const router = useRouter();
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<MemberInfo | null>(null);
  const [removingMember, setRemovingMember] = useState(false);
  const [currentUserCustomPhoto, setCurrentUserCustomPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    
    if (!user?.familyId) {
      router.push('/');
      return;
    }

    const fetchFamilyAndMembers = async () => {
      try {
        const familyRef = doc(db, 'families', user.familyId!);
        const familySnap = await getDoc(familyRef);
        
        if (familySnap.exists()) {
          const familyData = { id: familySnap.id, ...familySnap.data() } as Family;
          setFamily(familyData);

          // Fetch member details
          const memberPromises = familyData.members.map(async (memberId) => {
            const memberRef = doc(db, 'users', memberId);
            const memberSnap = await getDoc(memberRef);
            if (memberSnap.exists()) {
              const data = memberSnap.data() as User;
              // Set current user's custom photo
              if (memberId === user.uid) {
                setCurrentUserCustomPhoto(data.customPhotoURL || null);
              }
              return {
                uid: memberId,
                displayName: data.displayName,
                photoURL: data.photoURL,
                customPhotoURL: data.customPhotoURL || null,
                email: data.email,
              } as MemberInfo;
            }
            return null;
          });

          const memberResults = await Promise.all(memberPromises);
          setMembers(memberResults.filter((m): m is MemberInfo => m !== null));
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching family:', error);
        setLoading(false);
      }
    };

    fetchFamilyAndMembers();
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
      const batch = writeBatch(db);

      // Remove user from family members array
      batch.update(doc(db, 'families', user.familyId), {
        members: arrayRemove(user.uid),
      });

      // Remove familyId from user document
      batch.update(doc(db, 'users', user.uid), {
        familyId: null,
      });

      // Deactivate all of the user's goals (so they don't affect family stats)
      const goalsQuery = query(
        collection(db, 'goals'),
        where('userId', '==', user.uid),
        where('familyId', '==', user.familyId)
      );
      const goalsSnapshot = await getDocs(goalsQuery);
      goalsSnapshot.docs.forEach(goalDoc => {
        batch.update(goalDoc.ref, { isActive: false });
      });

      await batch.commit();

      router.push('/join-family');
    } catch (error) {
      console.error('Error leaving family:', error);
    }
  };

  const handleRemoveMember = async () => {
    if (!user?.familyId || !family || !memberToRemove) return;

    setRemovingMember(true);
    try {
      const batch = writeBatch(db);

      // Remove member from family members array
      batch.update(doc(db, 'families', user.familyId), {
        members: arrayRemove(memberToRemove.uid),
      });

      // Remove familyId from the removed user's document
      batch.update(doc(db, 'users', memberToRemove.uid), {
        familyId: null,
      });

      // Deactivate all of the removed member's goals (so they don't affect family stats)
      const goalsQuery = query(
        collection(db, 'goals'),
        where('userId', '==', memberToRemove.uid),
        where('familyId', '==', user.familyId)
      );
      const goalsSnapshot = await getDocs(goalsQuery);
      goalsSnapshot.docs.forEach(goalDoc => {
        batch.update(goalDoc.ref, { isActive: false });
      });

      await batch.commit();

      // Update local state
      setMembers(members.filter(m => m.uid !== memberToRemove.uid));
      setFamily({
        ...family,
        members: family.members.filter(id => id !== memberToRemove.uid),
      });
      setMemberToRemove(null);
    } catch (error) {
      console.error('Error removing member:', error);
    } finally {
      setRemovingMember(false);
    }
  };

  const isManager = user?.uid === family?.createdBy;

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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-semibold text-lg mb-1">{family?.name}</p>
              <p className="text-[var(--gray-text)] text-sm">
                {family?.members.length} {family?.members.length === 1 ? 'member' : 'members'}
              </p>
            </div>
            {isManager && (
              <span className="px-3 py-1 bg-[var(--orange)]/20 text-[var(--orange)] text-xs font-medium rounded-full">
                Manager
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Manage Members Section - Only visible to manager */}
      {isManager && (
        <section className="mb-8">
          <h2 className="text-[var(--gray-text)] text-sm uppercase tracking-wide mb-3">
            Manage Members
          </h2>
          <div className="bg-[var(--gray-dark)] rounded-2xl overflow-hidden">
            {members.map((member, index) => (
              <div 
                key={member.uid}
                className={`flex items-center justify-between p-4 ${
                  index < members.length - 1 ? 'border-b border-[var(--gray-card)]' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  {(member.customPhotoURL || member.photoURL) ? (
                    <img 
                      src={member.customPhotoURL || member.photoURL || ''} 
                      alt={member.displayName}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[var(--gray-card)] flex items-center justify-center">
                      <span className="text-white font-medium">
                        {member.displayName.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="text-white font-medium">
                      {member.displayName}
                      {member.uid === user?.uid && (
                        <span className="text-[var(--gray-text)]"> (You)</span>
                      )}
                    </p>
                    <p className="text-[var(--gray-text)] text-sm">{member.email}</p>
                  </div>
                </div>
                {member.uid !== user?.uid && (
                  <button
                    onClick={() => setMemberToRemove(member)}
                    className="p-2 text-red-400 hover:bg-red-400/10 rounded-full transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

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

      {/* Profile Picture Section */}
      <section className="mb-8">
        <h2 className="text-[var(--gray-text)] text-sm uppercase tracking-wide mb-3">
          Profile Picture
        </h2>
        <div className="bg-[var(--gray-dark)] rounded-2xl p-5">
          {user && (
            <ProfilePictureUpload
              userId={user.uid}
              currentPhotoURL={user.photoURL}
              customPhotoURL={currentUserCustomPhoto}
              displayName={user.displayName}
              onUploadComplete={(newPhotoURL) => {
                setCurrentUserCustomPhoto(newPhotoURL || null);
                // Update the member in the list too
                setMembers(members.map(m => 
                  m.uid === user.uid 
                    ? { ...m, customPhotoURL: newPhotoURL || null }
                    : m
                ));
              }}
            />
          )}
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

      {/* Remove Member Confirmation Modal */}
      {memberToRemove && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50">
          <div className="bg-[var(--gray-dark)] rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-white text-xl font-bold mb-2">Remove Member?</h3>
            <p className="text-[var(--gray-text)] mb-6">
              Are you sure you want to remove {memberToRemove.displayName} from {family?.name}? They&apos;ll need an invite code to rejoin.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setMemberToRemove(null)}
                disabled={removingMember}
                className="flex-1 py-3 bg-[var(--gray-card)] text-white font-medium rounded-full disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveMember}
                disabled={removingMember}
                className="flex-1 py-3 bg-red-500 text-white font-medium rounded-full disabled:opacity-50"
              >
                {removingMember ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
