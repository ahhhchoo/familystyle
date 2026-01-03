'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
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
    let isMounted = true;
    let hasProcessedRedirect = false;

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
        // Only set loading false if we've checked for redirect
        if (hasProcessedRedirect) {
          setLoading(false);
        }
      }
    };

    const init = async () => {
      // Check for redirect result first (handles redirect sign-in fallback)
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          console.log('Redirect sign-in successful:', result.user.email);
        }
      } catch (err) {
        console.error('Redirect result error:', err);
      }
      
      hasProcessedRedirect = true;

      // Set up auth state listener
      const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
        console.log('Auth state changed:', fbUser?.email || 'no user');
        await handleUser(fbUser);
      });

      return unsubscribeAuth;
    };

    let unsubscribeAuth: (() => void) | undefined;
    init().then((unsub) => {
      unsubscribeAuth = unsub;
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
      
      // Try popup first, fall back to redirect if it fails
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (popupError: unknown) {
        console.log('Popup failed, trying redirect:', popupError);
        // If popup fails (blocked, or "missing initial state" error), use redirect
        const errorMessage = popupError instanceof Error ? popupError.message : '';
        if (
          errorMessage.includes('popup') || 
          errorMessage.includes('initial state') ||
          errorMessage.includes('blocked') ||
          errorMessage.includes('closed')
        ) {
          await signInWithRedirect(auth, googleProvider);
        } else {
          throw popupError;
        }
      }
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
