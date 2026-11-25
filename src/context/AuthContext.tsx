import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { createUserProfile, getUserProfile } from '../lib/db';
import type { UserProfile, UserRole } from '../types';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  refreshProfile: () => Promise<void>;
  registerWithEmail: (params: {
    name: string;
    email: string;
    password: string;
    phone: string;
    city: string;
    role: UserRole;
  }) => Promise<UserProfile>;
  loginWithEmail: (params: { email: string; password: string; expectedRole: UserRole }) => Promise<UserProfile>;
  loginWithGoogle: (expectedRole: UserRole, createIfMissing?: boolean) => Promise<UserProfile>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function formatAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  const message = err instanceof Error ? err.message : String(err);

  if (code === 'auth/operation-not-allowed') {
    return 'Email/Password sign-in is not yet enabled in your Firebase Console (Authentication -> Sign-in method -> Email/Password). Please enable it in Firebase Console or continue with Google Sign-In.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists. Please sign in instead.';
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Invalid email or password. Please check your credentials and try again.';
  }
  if (code === 'auth/weak-password') {
    return 'Password should be at least 6 characters long.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Google sign-in popup was closed before completing.';
  }
  return message;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadProfile = useCallback(async (user: User | null) => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      const p = await getUserProfile(user.uid);
      setProfile(p);
    } catch (err) {
      console.error('Failed to load user profile:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      void loadProfile(user);
    });
    return () => unsub();
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (auth.currentUser) {
      const p = await getUserProfile(auth.currentUser.uid);
      setProfile(p);
    }
  }, []);

  const registerWithEmail: AuthContextValue['registerWithEmail'] = async ({
    name,
    email,
    password,
    phone,
    city,
    role,
  }) => {
    setAuthError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: name.trim() });
      try {
        await sendEmailVerification(cred.user);
      } catch {
        // Non-blocking verification email trigger
      }

      const newProfile: Omit<UserProfile, 'createdAt' | 'updatedAt'> = {
        uid: cred.user.uid,
        role,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        city: city.trim(),
        avatarUrl: cred.user.photoURL || '',
        emailNotifications: true,
        pushNotifications: false,
        fcmToken: '',
      };

      await createUserProfile(newProfile);
      const saved = await getUserProfile(cred.user.uid);
      const finalProfile = saved || newProfile;
      setProfile(finalProfile);
      return finalProfile;
    } catch (err) {
      const msg = formatAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const loginWithEmail: AuthContextValue['loginWithEmail'] = async ({
    email,
    password,
    expectedRole,
  }) => {
    setAuthError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const existing = await getUserProfile(cred.user.uid);
      if (!existing) {
        await signOut(auth);
        throw new Error('Account profile not found. Please register first.');
      }
      if (existing.role !== expectedRole) {
        await signOut(auth);
        const portalName = existing.role === 'owner' ? 'Business Owner Login' : 'Customer Login';
        throw new Error(
          `This email is registered as a ${
            existing.role === 'owner' ? 'Business Owner' : 'Customer'
          }. Please sign in through the ${portalName} portal.`
        );
      }
      setProfile(existing);
      return existing;
    } catch (err) {
      const msg = formatAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const loginWithGoogle: AuthContextValue['loginWithGoogle'] = async (
    expectedRole,
    createIfMissing = true
  ) => {
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const existing = await getUserProfile(cred.user.uid);
      if (existing) {
        if (existing.role !== expectedRole) {
          await signOut(auth);
          const portalName = existing.role === 'owner' ? 'Business Owner Login' : 'Customer Login';
          throw new Error(
            `This Google account is registered as a ${
              existing.role === 'owner' ? 'Business Owner' : 'Customer'
            }. Please use the ${portalName} portal.`
          );
        }
        setProfile(existing);
        return existing;
      }

      if (!createIfMissing) {
        await signOut(auth);
        throw new Error('No account found for this Google user. Please complete registration first.');
      }

      const newProfile: Omit<UserProfile, 'createdAt' | 'updatedAt'> = {
        uid: cred.user.uid,
        role: expectedRole,
        name: cred.user.displayName || 'LocalConnect User',
        email: cred.user.email || '',
        phone: cred.user.phoneNumber || '',
        city: '',
        avatarUrl: cred.user.photoURL || '',
        emailNotifications: true,
        pushNotifications: false,
        fcmToken: '',
      };

      await createUserProfile(newProfile);
      const saved = await getUserProfile(cred.user.uid);
      const finalProfile = saved || newProfile;
      setProfile(finalProfile);
      return finalProfile;
    } catch (err) {
      const msg = formatAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const logout = async () => {
    setAuthError(null);
    await signOut(auth);
    setProfile(null);
  };

  const getIdToken = async () => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        authError,
        clearAuthError: () => setAuthError(null),
        refreshProfile,
        registerWithEmail,
        loginWithEmail,
        loginWithGoogle,
        logout,
        getIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
