import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, type Profile, type UserRole } from '../lib/supabase';

export type AppTarget = 'user' | 'admin';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  authError: string | null;
  profileError: string | null;
  clearAuthError: () => void;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isAdmin: boolean;
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

  const [profileError, setProfileError] = useState<string | null>(null);

  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    setProfileError(null);
    try {
      // Primary path: RPC function (SECURITY DEFINER, bypasses RLS)
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_profile_by_id', { p_user_id: userId });

      if (rpcError) {
        console.error('RPC get_profile_by_id error:', rpcError.message);
        // Fallback: direct table query (RLS policy select_own_profile allows auth.uid() = id)
        const { data: rowData, error: rowError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (rowError) {
          const msg = `RPC: ${rpcError.message} | Table: ${rowError.message}`;
          console.error('Both profile fetch paths failed:', msg);
          setProfileError(msg);
          return null;
        }

        if (rowData) {
          const p = rowData as Profile;
          setProfile(p);
          return p;
        }
        setProfileError('Profile row not found for this user ID');
        return null;
      }

      // The RPC returns json — Supabase JS may deliver it as a parsed object
      // or as a raw JSON string depending on the PostgREST version. Handle both.
      let parsed: Profile | null = null;
      if (rpcData === null || rpcData === 'null') {
        parsed = null;
      } else if (typeof rpcData === 'string') {
        try { parsed = JSON.parse(rpcData) as Profile; } catch { parsed = null; }
      } else if (typeof rpcData === 'object') {
        parsed = rpcData as Profile;
      }

      if (!parsed) {
        // Fallback: direct table query
        const { data: rowData, error: rowError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (rowError) {
          setProfileError(`RPC returned null. Table fallback error: ${rowError.message}`);
          return null;
        }
        if (rowData) {
          parsed = rowData as Profile;
        }
      }

      setProfile(parsed);
      return parsed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Profile fetch threw (network/timeout):', msg);
      setProfileError(msg);
      return null;
    }
  };

  const refreshProfile = async () => {
    if (session?.user?.id) {
      await fetchProfile(session.user.id);
    }
  };

  const clearAuthError = () => { setAuthError(null); setProfileError(null); };

  useEffect(() => {
    let mounted = true;

    const sessionTimeout = setTimeout(() => {
      if (mounted && loading) {
        console.error('Auth session check timed out after 10s — forcing loading to false');
        setLoading(false);
      }
    }, 10000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      clearTimeout(sessionTimeout);
      if (!session) {
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      // Validate session has the expected shape — corrupted sessions can crash downstream
      if (!session.user?.id || !session.access_token) {
        console.error('getSession returned a corrupted/invalid session — signing out');
        supabase.auth.signOut().catch(() => {});
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      setSession(session);
      // Retry profile fetch once if first attempt returns null (JWT propagation delay)
      fetchProfile(session.user.id).then(async (p) => {
        if (!mounted) return;
        if (!p) {
          console.warn('Profile fetch returned null on first attempt — retrying once');
          await new Promise(r => setTimeout(r, 800));
          if (!mounted) return;
          await fetchProfile(session.user.id);
        }
        if (mounted) setLoading(false);
      }).catch((err) => {
        console.error('Profile fetch threw:', err);
        if (mounted) setLoading(false);
      });
    }).catch((err) => {
      console.error('getSession threw:', err);
      if (mounted) {
        clearTimeout(sessionTimeout);
        // Fail-safe: sign out and reset so the login screen renders
        supabase.auth.signOut().catch(() => {});
        setSession(null);
        setProfile(null);
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // If signIn() is handling everything, don't interfere at all —
      // not even setSession, which would cause a redundant re-render.
      if (signInInProgress.current) {
        return;
      }

      setSession(newSession);

      if (!newSession?.user?.id) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      let profileResolved = false;
      const profileTimeout = setTimeout(() => {
        if (mounted && !profileResolved) {
          console.error('Profile fetch timed out after 8s during auth state change');
          profileResolved = true;
          if (mounted) setLoading(false);
        }
      }, 8000);
      (async () => {
        try {
          let p = await fetchProfile(newSession.user.id);
          profileResolved = true;
          clearTimeout(profileTimeout);
          if (!p) {
            await new Promise(r => setTimeout(r, 800));
            if (!mounted) return;
            p = await fetchProfile(newSession.user.id);
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
        } catch (err) {
          profileResolved = true;
          clearTimeout(profileTimeout);
          console.error('Profile fetch threw during auth state change:', err);
        }
        if (mounted) setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Realtime profile watcher — signs out banned/suspended users mid-session
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

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };

    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({ id: data.user.id, email: data.user.email });
      if (profileError) {
        console.error('Failed to create profile:', profileError.message);
      }
    }

    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    setAuthError(null);
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
    } catch (err) {
      console.error('Sign in threw:', err);
      signInInProgress.current = false;
      setLoading(false);
      return { error: 'Network error during sign in. Please try again.' };
    }
  };

  const signOut = async () => {
    try { await supabase.auth.signOut(); } catch (err) { console.error('Sign out error:', err); }
    setProfile(null);
    setSession(null);
  };

  const role: UserRole = profile?.role ?? 'client';
  const isAdmin = profile !== null && (role === 'master_admin' || role === 'sub_admin');
  const isClient = profile !== null && role === 'client';
  const appTarget: AppTarget = isAdmin ? 'admin' : 'user';

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, profile, loading, authError, profileError, clearAuthError, signUp, signIn, signOut, refreshProfile, isAdmin, isClient, appTarget }}
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
