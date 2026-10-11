import { useEffect, useState } from 'react';
import {
  Crown, Mail, Lock, User as UserIcon, Loader2,
  CircleAlert as AlertCircle, CircleCheck as CheckCircle2,
  Shield, LogOut, LogIn, UserPlus, Zap,
} from 'lucide-react';
import { AuthProvider, useAuth } from '@cortex/shared/context/AuthContext';
import { clearAuthCache } from '@cortex/shared/lib/supabase';
import { supabase } from '@cortex/shared/lib/supabase';

// ─── Initialize Master Account Screen ───────────────────────────────
function InitializeMasterScreen() {
  const { signIn, initializeMaster } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'register' | 'promote'>('register');

  // Clear all cache on mount — no stale tokens
  useEffect(() => {
    clearAuthCache();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    // Step 1: Sign up the auth user (trigger auto-creates profile as 'client')
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      // If user already exists, try signing in instead
      if (signUpError.message.includes('already registered') || signUpError.message.includes('already been registered')) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError(signInError.message);
          setLoading(false);
          return;
        }
      } else {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
    }

    // Step 2: If we got a session (either from signUp or signIn), promote to master_admin
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user?.id) {
      // signUp succeeded but no auto-session — sign in explicitly
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError('Account created but could not sign in automatically. Please reload and use the Sign In tab.');
        setLoading(false);
        return;
      }
    }

    setSuccess('Account created. Promoting to Master Admin...');
    setStep('promote');

    // Step 3: Call the initialize_master_admin RPC
    const { error: initError } = await initializeMaster(displayName || undefined);
    if (initError) {
      setError(`Failed to promote to Master Admin: ${initError}`);
      setLoading(false);
      return;
    }

    setSuccess('Master Admin account initialized successfully!');
    setLoading(false);
    // The auth state change will trigger re-render and show the dashboard
  };

  const handleSignInAndPromote = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    // Sign in first
    const { error: signInError } = await signIn(email, password);
    if (signInError) {
      setError(signInError);
      setLoading(false);
      return;
    }

    // Now promote
    setSuccess('Signed in. Promoting to Master Admin...');
    const { error: initError } = await initializeMaster(displayName || undefined);
    if (initError) {
      setError(`Failed to promote: ${initError}`);
      setLoading(false);
      return;
    }

    setSuccess('Master Admin initialized successfully!');
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-neon-amber/10 rounded-full blur-3xl animate-pulse-slow" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-neon-cyan/10 rounded-full blur-3xl animate-pulse-slow" />

      <div className="relative w-full max-w-md animate-scale-in">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-neon-amber/20 to-neon-cyan/20 border border-neon-amber/30 flex items-center justify-center neon-glow-amber mb-4">
            <Crown className="w-9 h-9 text-neon-amber" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="text-neon-amber neon-text-amber">One</span>{' '}
            <span className="text-neon-cyan neon-text-cyan">Palace</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">Master Admin Initialization</p>
        </div>

        <div className="glass-strong neon-glow-amber p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6 p-3 rounded-xl bg-neon-amber/10 border border-neon-amber/20">
            <Shield className="w-5 h-5 text-neon-amber flex-shrink-0" />
            <p className="text-xs text-neon-amber font-semibold">
              This panel sets up the first Master Admin account for your OnePalace platform.
            </p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${step === 'register' ? 'text-neon-amber' : 'text-neon-green'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 'register' ? 'bg-neon-amber/20 text-neon-amber' : 'bg-neon-green/20 text-neon-green'}`}>
                {step === 'promote' ? <CheckCircle2 className="w-3 h-3" /> : '1'}
              </div>
              Register
            </div>
            <div className="flex-1 h-px bg-white/10" />
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${step === 'promote' ? 'text-neon-amber' : 'text-slate-600'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 'promote' ? 'bg-neon-amber/20 text-neon-amber' : 'bg-white/5 text-slate-600'}`}>
                2
              </div>
              Promote
            </div>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Display Name (optional)</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Vinod Sharma"
                  className="w-full pl-10 pr-4 py-3 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-amber/40 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="admin@onepalace.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-amber/40 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-amber/40 transition-colors"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-neon-red/10 border border-neon-red/20 text-xs text-neon-red animate-slide-up">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-neon-green/10 border border-neon-green/20 text-xs text-neon-green animate-slide-up">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{success}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all duration-300 bg-gradient-to-r from-neon-amber/20 to-neon-cyan/20 text-white border border-neon-amber/40 hover:from-neon-amber/30 hover:to-neon-cyan/30 neon-glow-amber hover:scale-[1.02] disabled:opacity-50 disabled:cursor-wait disabled:hover:scale-100"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Initializing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Initialize Master Account
                </>
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-[11px] text-slate-500">
            Already have a master account?{' '}
            <button
              onClick={() => setStep('promote')}
              className="text-neon-cyan hover:text-neon-green transition-colors font-semibold"
            >
              Sign in & promote
            </button>
          </p>
        </div>

        <p className="mt-4 text-center text-[10px] text-slate-600">
          This creates the supreme admin with full platform control.
        </p>
      </div>
    </div>
  );
}

// ─── Master Admin Sign In (for returning master admins) ─────────────
function MasterSignInScreen() {
  const { signIn, authError, clearAuthError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    clearAuthCache();
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    clearAuthError();
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      setError(error);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-neon-amber/10 rounded-full blur-3xl animate-pulse-slow" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-neon-cyan/10 rounded-full blur-3xl animate-pulse-slow" />

      <div className="relative w-full max-w-md animate-scale-in">
        <div className="flex flex-col items-center mb-8">
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-neon-amber/20 to-neon-cyan/20 border border-neon-amber/30 flex items-center justify-center neon-glow-amber mb-4">
            <Crown className="w-9 h-9 text-neon-amber" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="text-neon-amber neon-text-amber">One</span>{' '}
            <span className="text-neon-cyan neon-text-cyan">Palace</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">Master Admin Panel</p>
        </div>

        <div className="glass-strong neon-glow-amber p-6 sm:p-8">
          <h2 className="text-lg font-bold text-white mb-1">Master Admin Sign In</h2>
          <p className="text-xs text-slate-400 mb-5">Access the supreme admin control panel</p>

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="admin@onepalace.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-amber/40 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-amber/40 transition-colors"
                />
              </div>
            </div>

            {(error ?? authError) && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-neon-red/10 border border-neon-red/20 text-xs text-neon-red animate-slide-up">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error ?? authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all duration-300 bg-gradient-to-r from-neon-amber/20 to-neon-cyan/20 text-white border border-neon-amber/40 hover:from-neon-amber/30 hover:to-neon-cyan/30 neon-glow-amber hover:scale-[1.02] disabled:opacity-50 disabled:cursor-wait"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-[10px] text-slate-600">
          OnePalace Master Admin — Supreme Platform Control
        </p>
      </div>
    </div>
  );
}

// ─── Master Admin Dashboard (post-login) ────────────────────────────
function MasterDashboard() {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="border-b border-white/[0.06] bg-base-850/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-neon-amber/20 to-neon-cyan/20 border border-neon-amber/30 flex items-center justify-center">
              <Crown className="w-5 h-5 text-neon-amber" />
            </div>
            <div>
              <span className="text-sm font-bold text-white">OnePalace</span>
              <span className="text-[10px] text-neon-amber ml-2 font-semibold">MASTER ADMIN</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 hidden sm:block">{profile?.email}</span>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[0.08] transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto scrollbar-thin p-4 sm:p-6 max-w-7xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">Master Admin Dashboard</h1>
          <p className="text-xs text-slate-500 mt-1">
            Welcome, {profile?.email}. Full platform control is active.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-neon-cyan/15 border border-neon-cyan/30 flex items-center justify-center">
                <Shield className="w-5 h-5 text-neon-cyan" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Role</p>
                <p className="text-sm font-bold text-white">Master Admin</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">Full access to all platform features and settings.</p>
          </div>

          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-neon-green/15 border border-neon-green/30 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-neon-green" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Account Status</p>
                <p className="text-sm font-bold text-white capitalize">{profile?.status ?? 'active'}</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">Your account is in good standing.</p>
          </div>

          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-neon-amber/15 border border-neon-amber/30 flex items-center justify-center">
                <Crown className="w-5 h-5 text-neon-amber" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Permissions</p>
                <p className="text-sm font-bold text-white">All Access</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">Unrestricted control over the entire platform.</p>
          </div>
        </div>

        <div className="mt-6 glass-card p-5">
          <h2 className="text-sm font-bold text-white mb-4">Platform Management</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <a
              href="http://localhost:5174"
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-neon-amber/30 hover:bg-neon-amber/5 transition-all group"
            >
              <Shield className="w-6 h-6 text-slate-400 group-hover:text-neon-amber transition-colors" />
              <span className="text-xs text-slate-400 group-hover:text-white transition-colors">Admin Panel</span>
              <span className="text-[10px] text-slate-600">Port 5174</span>
            </a>
            <a
              href="http://localhost:5173"
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-neon-cyan/30 hover:bg-neon-cyan/5 transition-all group"
            >
              <UserIcon className="w-6 h-6 text-slate-400 group-hover:text-neon-cyan transition-colors" />
              <span className="text-xs text-slate-400 group-hover:text-white transition-colors">User Panel</span>
              <span className="text-[10px] text-slate-600">Port 5173</span>
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Main App Component ─────────────────────────────────────────────
function MasterApp() {
  const { session, profile, loading, isMasterAdmin } = useAuth();
  const [showInit, setShowInit] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-neon-amber animate-spin" />
          <p className="text-sm text-slate-400">Loading Master Panel...</p>
        </div>
      </div>
    );
  }

  // Authenticated master admin → dashboard
  if (session && profile && isMasterAdmin) {
    return <MasterDashboard />;
  }

  // Authenticated but not master_admin → show init or sign-in
  if (session && profile && !isMasterAdmin) {
    return <InitializeMasterScreen />;
  }

  // Not authenticated → show sign-in or init toggle
  if (showInit) {
    return <InitializeMasterScreen />;
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <MasterSignInScreen />
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        <button
          onClick={() => setShowInit(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neon-amber/10 border border-neon-amber/20 text-xs text-neon-amber font-semibold hover:bg-neon-amber/20 transition-all"
        >
          <Zap className="w-3.5 h-3.5" />
          Initialize New Master Account
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MasterApp />
    </AuthProvider>
  );
}
