import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, clearAuthCache, type Profile, type UserRole } from '../lib/supabase';

export type AppTarget = 'user' | 'admin' | 'master';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  initializeMaster: (displayName?: string) => Promise<{ error: string | null }>;
  isAdmin: boolean;
  isMasterAdmin: boolean;
  isSubAdmin: boolean;
  isClient: boolean;
  appTarget: AppTarget;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const signInInProgress = useRef(false);

  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    try {
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_profile_by_id', { p_user_id: userId });

      if (rpcError) {
        // Fallback: direct table query (RLS allows reading own row)
        const { data: rowData, error: rowError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (rowError) return null;
        const p = rowData as Profile | null;
        setProfile(p);
        return p;
      }

      let parsed: Profile | null = null;
      if (rpcData === null || rpcData === 'null') {
        parsed = null;
      } else if (typeof rpcData === 'string') {
        try { parsed = JSON.parse(rpcData) as Profile; } catch { parsed = null; }
      } else if (typeof rpcData === 'object') {
        parsed = rpcData as Profile;
      }

      if (!parsed) {
        // Retry with direct query as fallback
        const { data: rowData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        parsed = (rowData as Profile | null) ?? null;
      }

      setProfile(parsed);
      return parsed;
    } catch {
      return null;
    }
  };

  const refreshProfile = async () => {
    if (session?.user?.id) {
      await fetchProfile(session.user.id);
    }
  };

  const clearAuthError = () => setAuthError(null);

  useEffect(() => {
    let mounted = true;

    const timeout = setTimeout(() => {
      if (mounted && loading) setLoading(false);
    }, 10000);

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      clearTimeout(timeout);
      if (!s || !s.user?.id || !s.access_token) {
        if (s) supabase.auth.signOut().catch(() => {});
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      setSession(s);
      fetchProfile(s.user.id).then(async (p) => {
        if (!mounted) return;
        if (!p) {
          await new Promise(r => setTimeout(r, 800));
          if (mounted) await fetchProfile(s.user.id);
        }
        if (mounted) setLoading(false);
      }).catch(() => {
        if (mounted) setLoading(false);
      });
    }).catch(() => {
      if (mounted) {
        clearTimeout(timeout);
        setSession(null);
        setProfile(null);
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (signInInProgress.current) return;

      setSession(newSession);

      if (!newSession?.user?.id) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      let resolved = false;
      const profileTimeout = setTimeout(() => {
        if (mounted && !resolved) {
          resolved = true;
          if (mounted) setLoading(false);
        }
      }, 8000);

      (async () => {
        try {
          let p = await fetchProfile(newSession.user.id);
          resolved = true;
          clearTimeout(profileTimeout);
          if (!p) {
            await new Promise(r => setTimeout(r, 800));
            if (mounted) p = await fetchProfile(newSession.user.id);
          }
          if (p && (p.status === 'suspended' || p.status === 'banned')) {
            await supabase.auth.signOut();
            setSession(null);
            setProfile(null);
            setAuthError(
              p.status === 'suspended'
                ? 'Your account has been suspended. Please contact support.'
                : 'Your account has been banned. Please contact support.'
            );
          }
        } catch {
          resolved = true;
          clearTimeout(profileTimeout);
        }
        if (mounted) setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Realtime watcher — signs out banned/suspended users mid-session
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    const channel = supabase
      .channel(`profile-status-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => {
          const updated = payload.new as Profile;
          if (updated.status === 'suspended' || updated.status === 'banned') {
            setProfile(updated);
            supabase.auth.signOut();
            setSession(null);
            setProfile(null);
            setAuthError(
              updated.status === 'suspended'
                ? 'Your account has been suspended. Please contact support.'
                : 'Your account has been banned. Please contact support.'
            );
          } else {
            setProfile(updated);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  // ─── signUp: creates auth user. Profile is auto-created by DB trigger. ──
  const signUp = async (email: string, password: string) => {
    clearAuthCache();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };

    // The on_auth_user_created trigger inserts the profile automatically.
    // Do NOT manually insert here — that caused duplicate entries.
    // Sign out so the user can log in deliberately.
    if (data.user) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setProfile(null);
    return { error: null };
  };

  // ─── signIn: clears cache, authenticates, fetches profile ───────────────
  const signIn = async (email: string, password: string) => {
    setAuthError(null);
    clearAuthCache();
    setLoading(true);
    signInInProgress.current = true;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        signInInProgress.current = false;
        setLoading(false);
        return { error: error.message };
      }

      if (data.user && data.session) {
        setSession(data.session);

        let p = await fetchProfile(data.user.id);
        if (!p) {
          await new Promise(r => setTimeout(r, 1000));
          p = await fetchProfile(data.user.id);
        }

        if (p && (p.status === 'suspended' || p.status === 'banned')) {
          await supabase.auth.signOut();
          setSession(null);
          setProfile(null);
          const msg = p.status === 'suspended'
            ? 'Your account has been suspended. Please contact support.'
            : 'Your account has been banned. Please contact support.';
          setAuthError(msg);
          signInInProgress.current = false;
          setLoading(false);
          return { error: msg };
        }
      }

      signInInProgress.current = false;
      setLoading(false);
      return { error: null };
    } catch {
      signInInProgress.current = false;
      setLoading(false);
      return { error: 'Network error during sign in. Please try again.' };
    }
  };

  // ─── initializeMaster: registers + promotes to master_admin + logs in ──
  const initializeMaster = async (displayName?: string) => {
    setAuthError(null);
    clearAuthCache();
    setLoading(true);
    signInInProgress.current = true;
    try {
      // Step 1: Sign up the auth user
      // The caller provides email+password via a separate signUp call first,
      // then this function is called when authenticated.
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('initialize_master_admin', {
          p_display_name: displayName ?? null,
        });

      if (rpcError) {
        signInInProgress.current = false;
        setLoading(false);
        return { error: rpcError.message };
      }

      // Refresh profile from the RPC result
      let result = rpcData;
      if (typeof result === 'string') {
        try { result = JSON.parse(result); } catch { /* keep as string */ }
      }

      if (result && typeof result === 'object' && result.profile) {
        setProfile(result.profile as Profile);
      } else {
        // Fallback: refetch profile
        if (session?.user?.id) {
          await fetchProfile(session.user.id);
        }
      }

      signInInProgress.current = false;
      setLoading(false);
      return { error: null };
    } catch (err) {
      signInInProgress.current = false;
      setLoading(false);
      const msg = err instanceof Error ? err.message : 'Initialization failed';
      return { error: msg };
    }
  };

  const signOut = async () => {
    clearAuthCache();
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    setProfile(null);
    setSession(null);
  };

  const role: UserRole = profile?.role ?? 'client';
  const isMasterAdmin = profile !== null && role === 'master_admin';
  const isSubAdmin = profile !== null && role === 'sub_admin';
  const isAdmin = isMasterAdmin || isSubAdmin;
  const isClient = profile !== null && role === 'client';
  const appTarget: AppTarget = isMasterAdmin ? 'master' : isAdmin ? 'admin' : 'user';

  return (
    <AuthContext.Provider
      value={{
        session, user: session?.user ?? null, profile, loading, authError,
        clearAuthError, signUp, signIn, signOut, refreshProfile, initializeMaster,
        isAdmin, isMasterAdmin, isSubAdmin, isClient, appTarget,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
