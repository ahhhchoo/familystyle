'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase';
import { User } from '@/types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribeUser: (() => void) | null = null;
    let unsubscribeAuth: (() => void) | null = null;
    let isMounted = true;

    const handleUser = async (fbUser: FirebaseUser | null) => {
      if (!isMounted) return;

      // Clean up previous user listener
      if (unsubscribeUser) {
        unsubscribeUser();
        unsubscribeUser = null;
      }

      if (fbUser) {
        setFirebaseUser(fbUser);
        const userRef = doc(db, 'users', fbUser.uid);
        
        // Check if user exists first
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          // Create new user document
          console.log('Creating new user document for:', fbUser.email);
          const newUser: User = {
            uid: fbUser.uid,
            email: fbUser.email || '',
            displayName: fbUser.displayName || '',
            photoURL: fbUser.photoURL,
            familyId: null,
            createdAt: new Date(),
          };
          await setDoc(userRef, {
            ...newUser,
            createdAt: serverTimestamp(),
          });
        }

        if (!isMounted) return;

        // Listen to user document for real-time updates (including familyId changes)
        unsubscribeUser = onSnapshot(userRef, (snapshot) => {
          if (!isMounted) return;
          if (snapshot.exists()) {
            const userData = snapshot.data() as User;
            console.log('User data loaded, familyId:', userData.familyId);
            setUser({ ...userData, uid: fbUser.uid });
          }
          setLoading(false);
        });
      } else {
        setFirebaseUser(null);
        setUser(null);
        setLoading(false);
      }
    };

    // Set up auth state listener immediately
    unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      console.log('Auth state changed:', fbUser?.email || 'no user');
      await handleUser(fbUser);
    });



    return () => {
      isMounted = false;
      if (unsubscribeAuth) {
        unsubscribeAuth();
      }
      if (unsubscribeUser) {
        unsubscribeUser();
      }
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign out');
    }
  }, []);

  return {
    user,
    firebaseUser,
    loading,
    error,
    signInWithGoogle,
    signOut,
  };
}
