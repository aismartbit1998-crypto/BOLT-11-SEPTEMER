import { useEffect, useState } from 'react';
import { Menu, X, Loader2, AlertCircle } from 'lucide-react';
import { AuthProvider, useAuth } from '@cortex/shared/context/AuthContext';
import { supabase, type RiskSettings } from '@cortex/shared/lib/supabase';
import { AdminCurrencyProvider } from '@/context/AdminCurrencyContext';
import { AdminRbacProvider } from '@/context/AdminRbacContext';
import AuthScreen from '@cortex/shared/components/AuthScreen';
import AdminSidebar, { type AdminViewId } from '@/components/admin/AdminSidebar';
import AdminTopNav from '@/components/admin/AdminTopNav';
import AdminDashboard from '@/views/admin/AdminDashboard';
import AdminBots from '@/views/admin/AdminBots';
import AdminClients from '@/views/admin/AdminClients';
import AdminLicenses from '@/views/admin/AdminLicenses';
import AdminAdmins from '@/views/admin/AdminAdmins';
import AdminRiskControl from '@/views/admin/AdminRiskControl';
import AdminSystemSettings from '@/views/admin/AdminSystemSettings';
import AdminPaymentAnalytics from '@/views/admin/AdminPaymentAnalytics';
import AdminApiControl from '@/views/admin/AdminApiControl';
import AdminBroadcast from '@/views/admin/AdminBroadcast';

const viewTitles: Record<AdminViewId, string> = {
  'dashboard': 'Dashboard',
  'bots': 'AI Smart Bots',
  'clients': 'Clients',
  'licenses': 'Licenses',
  'admins': 'Admins',
  'risk-control': 'Risk Control',
  'system-settings': 'System Settings',
  'payment-analytics': 'Payment & Revenue',
  'api-control': 'Master API Control',
  'broadcast': 'Promotions & Broadcasts',
};

function AdminApp() {
  const { session, loading, profile, isClient, isMasterAdmin, signOut, refreshProfile, profileError } = useAuth();
  const [activeView, setActiveView] = useState<AdminViewId>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [riskSettings, setRiskSettings] = useState<RiskSettings | null>(null);
  const [riskLoading, setRiskLoading] = useState(true);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!session) {
      setRiskLoading(false);
      return;
    }

    let mounted = true;
    const timeout = setTimeout(() => {
      if (mounted && riskLoading) {
        console.error('risk_settings query timed out after 8s — proceeding without risk settings');
        setRiskError('Could not load risk settings — the table may not exist yet. Some features may be unavailable.');
        setRiskLoading(false);
      }
    }, 8000);

    supabase
      .from('risk_settings')
      .select('*')
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!mounted) return;
        clearTimeout(timeout);
        if (error) {
          console.error('Failed to load risk_settings:', error.message);
          setRiskError(`Risk settings unavailable: ${error.message}`);
        }
        setRiskSettings(data as RiskSettings | null);
        setRiskLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        clearTimeout(timeout);
        console.error('risk_settings query threw:', err);
        setRiskError('Could not reach the database for risk settings.');
        setRiskLoading(false);
      });

    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, [session]);

  // Route guard: redirect client users to user panel (5173),
  // and master_admin users to master panel (5175).
  useEffect(() => {
    if (!loading && session && profile) {
      if (isClient) {
        setRedirecting(true);
        const userUrl = window.location.origin.replace(':5174', ':5173');
        window.location.href = userUrl;
      } else if (isMasterAdmin) {
        setRedirecting(true);
        const masterUrl = window.location.origin.replace(':5174', ':5175');
        window.location.href = masterUrl;
      }
    }
  }, [loading, session, profile, isClient, isMasterAdmin]);

  const toggleKillSwitch = async () => {
    if (!riskSettings) return;
    const newVal = !riskSettings.global_kill_switch;
    setRiskSettings({ ...riskSettings, global_kill_switch: newVal });
    await supabase
      .from('risk_settings')
      .update({ global_kill_switch: newVal, updated_at: new Date().toISOString() })
      .eq('id', riskSettings.id);
  };

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <AdminDashboard />;
      case 'bots': return <AdminBots />;
      case 'clients': return <AdminClients />;
      case 'licenses': return <AdminLicenses />;
      case 'admins': return <AdminAdmins />;
      case 'risk-control': return <AdminRiskControl />;
      case 'system-settings': return <AdminSystemSettings />;
      case 'payment-analytics': return <AdminPaymentAnalytics />;
      case 'api-control': return <AdminApiControl />;
      case 'broadcast': return <AdminBroadcast />;
      default: return <AdminDashboard />;
    }
  };

  if (loading || redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-neon-amber animate-spin" />
          <p className="text-sm text-slate-400">{redirecting ? 'Redirecting...' : 'Loading Admin Panel...'}</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  // Client or master_admin users get redirected
  if (profile && (isClient || isMasterAdmin)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-neon-amber animate-spin" />
          <p className="text-sm text-slate-400">Redirecting...</p>
        </div>
      </div>
    );
  }

  // Profile still loading after auth completed — show retry instead of infinite spinner.
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-lg text-center px-6">
          <Loader2 className="w-8 h-8 text-neon-amber animate-spin" />
          <p className="text-sm text-slate-400">Loading your profile...</p>
          {profileError && (
            <div className="w-full p-3 rounded-xl bg-neon-red/10 border border-neon-red/20 text-xs text-neon-red text-left break-words">
              <span className="font-semibold block mb-1">Profile fetch error:</span>
              <span className="font-mono">{profileError}</span>
            </div>
          )}
          <p className="text-xs text-slate-600">If this persists, your session token may not have propagated yet.</p>
          <div className="flex gap-2">
            <button
              onClick={() => refreshProfile()}
              className="px-4 py-2 rounded-xl bg-neon-amber/15 text-neon-amber border border-neon-amber/30 hover:bg-neon-amber/20 text-xs font-semibold transition-all"
            >
              Retry
            </button>
            <button
              onClick={async () => {
                try { await supabase.auth.signOut(); } catch {}
                try { localStorage.clear(); } catch {}
                try { sessionStorage.clear(); } catch {}
                window.location.reload();
              }}
              className="px-4 py-2 rounded-xl bg-neon-red/15 text-neon-red border border-neon-red/30 hover:bg-neon-red/20 text-xs font-semibold transition-all"
            >
              Sign Out & Clear Cache
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AdminCurrencyProvider>
      <AdminRbacProvider>
        {riskError && (
          <div className="fixed top-0 left-0 right-0 z-[200] bg-neon-amber/15 border-b border-neon-amber/30 px-4 py-2 text-xs text-neon-amber font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{riskError}</span>
            <button onClick={() => setRiskError(null)} className="ml-auto text-neon-amber/70 hover:text-neon-amber">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="min-h-screen flex flex-col">
          <AdminTopNav
            killSwitchActive={riskSettings?.global_kill_switch ?? false}
            onToggleKill={toggleKillSwitch}
          />

          <div className="flex flex-1 overflow-hidden">
            <aside className="hidden lg:block w-64 flex-shrink-0 border-r border-white/[0.06] bg-base-850/50 backdrop-blur-sm">
              <AdminSidebar active={activeView} onSelect={setActiveView} />
            </aside>

            {sidebarOpen && (
              <div className="lg:hidden fixed inset-0 z-[90] flex">
                <div className="absolute inset-0 bg-base-900/70 backdrop-blur-md" onClick={() => setSidebarOpen(false)} />
                <div className="relative w-64 h-full bg-base-850 border-r border-white/[0.06] animate-slide-up">
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="absolute top-3 right-3 z-10 text-slate-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <AdminSidebar active={activeView} onSelect={setActiveView} onClose={() => setSidebarOpen(false)} />
                </div>
              </div>
            )}

            <main className="flex-1 overflow-y-auto scrollbar-thin">
              <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-base-850/50 backdrop-blur-sm sticky top-0 z-30">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"
                >
                  <Menu className="w-5 h-5" />
                  Menu
                </button>
                <span className="text-sm font-semibold text-white">{viewTitles[activeView]}</span>
              </div>

              <div className="p-4 sm:p-6 max-w-7xl mx-auto">
                <div className="hidden lg:flex items-center gap-2 mb-5 text-xs">
                  <span className="text-neon-amber/70">OnePalace Admin</span>
                  <span className="text-slate-700">/</span>
                  <span className="text-neon-amber font-semibold">{viewTitles[activeView]}</span>
                </div>
                {renderView()}
              </div>
            </main>
          </div>
        </div>
      </AdminRbacProvider>
    </AdminCurrencyProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AdminApp />
    </AuthProvider>
  );
}
