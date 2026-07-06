'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { Session, User, AuthChangeEvent } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/lib/types';
import { api } from '@/lib/api';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();
  const focusCB = useRef<(() => void) | null>(null);

  // ─── เปลี่ยนเป็น useCallback + ใช้ API route แทน Supabase ตรงๆ ──
  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const res = await fetch(api('/api/profile'), {
        headers: { 'x-user-id': userId },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.profile) setProfile(data.profile);
    } catch (e) {
      console.error('[AuthProvider] fetchProfile error:', e);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then((result: { data: { session: Session | null } }) => {
      if (cancelled) return;
      const s = result.data.session;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchProfile(s.user.id);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, s: Session | null) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchProfile(s.user.id);
      else setProfile(null);
    });

    // ─── ใช้ throttle ป้องกันเรียกซ้ำถี่เกินไปตอน focus ──
    let focusTimer: ReturnType<typeof setTimeout> | null = null;
    const onFocus = () => {
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        supabase.auth.getSession().then((result: { data: { session: Session | null } }) => {
          if (result.data.session?.user) fetchProfile(result.data.session.user.id);
        });
      }, 1000); // ← throttle 1 วินาที
    };
    focusCB.current = onFocus;
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.removeEventListener('focus', onFocus);
      if (focusTimer) clearTimeout(focusTimer);
    };
  }, [fetchProfile]);

  const signOut = async () => {
    try {
      window.__subzeed_signout_initiated = true;
    } catch {}
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, isLoading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
