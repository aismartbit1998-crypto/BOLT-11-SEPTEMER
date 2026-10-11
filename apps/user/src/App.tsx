import { useState, useEffect } from 'react';
import { Menu, X, Loader2, Shield, Eye } from 'lucide-react';
import { AppProvider } from '@/context/AppContext';
import { AuthProvider, useAuth } from '@cortex/shared/context/AuthContext';
import AuthScreen from '@cortex/shared/components/AuthScreen';
import RiskDisclaimerModal from '@/components/RiskDisclaimerModal';
import TopNav from '@/components/TopNav';
import Sidebar, { type ViewId } from '@/components/Sidebar';
import Footer from '@/components/Footer';
import PanicModal from '@/components/PanicModal';
import DashboardView from '@/views/DashboardView';
import AISmartBotView from '@/views/AISmartBotView';
import TradingStatusView from '@/views/TradingStatusView';
import SignalsView from '@/views/SignalsView';
import CryptoView from '@/views/CryptoView';
import CopyTradingView from '@/views/CopyTradingView';
import TradeHistoryView from '@/views/TradeHistoryView';
import WalletView from '@/views/WalletView';
import MySubscriptionView from '@/views/MySubscriptionView';
import ConnectBrokerView from '@/views/ConnectBrokerView';
import BrokerResponseView from '@/views/BrokerResponseView';
import TutorialsView from '@/views/TutorialsView';
import FAQView from '@/views/FAQView';
import HelpCenterView from '@/views/HelpCenterView';
import ReportBugView from '@/views/ReportBugView';
import RealtimeToast from '@/components/RealtimeToast';
import { supabase } from '@cortex/shared/lib/supabase';

const viewTitles: Record<ViewId, string> = {
  'dashboard': 'Dashboard',
  'ai-smart-bot': 'AI Smart Bot',
  'trading-status': 'Trading Status',
  'signals': 'Signals',
  'crypto': 'Crypto',
  'copy-trading': 'Copy Trading Marketplace',
  'trade-history': 'Trade History',
  'wallet': 'Wallet & Calculation',
  'my-subscription': 'My Subscription',
  'connect-broker': 'Connect Your Broker',
  'broker-response': 'Broker Response',
  'tutorials': 'Tutorials & Guides',
  'faq': 'FAQ',
  'help-center': 'Help Center',
  'report-bug': 'Report Bug',
};

interface ImpersonationState {
  client_id: string;
  client_email: string;
  expires_at: number;
}

function AppContent() {
  const { session, profile, loading, refreshProfile, isAdmin, isMasterAdmin } = useAuth();
  const [activeView, setActiveView] = useState<ViewId>('dashboard');
  const [panicOpen, setPanicOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [impersonation, setImpersonation] = useState<ImpersonationState | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [disclaimerDismissed, setDisclaimerDismissed] = useState(false);
  const [pendingTradeCoin, setPendingTradeCoin] = useState<string | null>(null);
  const [appName, setAppName] = useState('OnePalace');
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const handlePanicConfirm = async () => {
    const userId = session?.user?.id || impersonation?.client_id;
    if (!userId) return;
    try {
      await supabase
        .from('bots')
        .update({ status: 'stopped' })
        .eq('user_id', userId)
        .in('status', ['running', 'paused']);
      await supabase.from('client_updates').insert({
        client_id: userId,
        update_type: 'risk_action',
        title: 'Panic Liquidation Triggered',
        message: 'All running bots have been emergency-stopped by the user via Panic Liquidation.',
        severity: 'critical',
        executed_by: 'User (Self)',
      });
    } catch (e) {
      console.error('Panic liquidation failed:', e);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('impersonate') || localStorage.getItem('impersonate_token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token));
        if (payload.expires_at > Date.now()) {
          setImpersonation(payload);
        } else {
          localStorage.removeItem('impersonate_token');
          localStorage.removeItem('impersonate_client_id');
          localStorage.removeItem('impersonate_client_email');
        }
      } catch { /* invalid token */ }
    }
  }, []);

  // Route guard: redirect admin users to their correct panel
  // master_admin -> 5175, sub_admin -> 5174
  useEffect(() => {
    if (!loading && session && profile && isAdmin && !impersonation) {
      setRedirecting(true);
      const targetPort = isMasterAdmin ? '5175' : '5174';
      const targetUrl = window.location.origin.replace(':5173', targetPort);
      window.location.href = targetUrl;
    }
  }, [loading, session, profile, isAdmin, isMasterAdmin, impersonation]);

  // Load system settings (branding + maintenance mode)
  useEffect(() => {
    supabase
      .from('system_settings')
      .select('app_name, maintenance_mode')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setAppName(data.app_name || 'OnePalace');
          setMaintenanceMode(data.maintenance_mode || false);
        }
      });
  }, []);

  const showDisclaimer = session?.user && !disclaimerDismissed && (!profile || !profile.disclaimer_accepted);

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardView onDeploy={() => setActiveView('ai-smart-bot')} />;
      case 'ai-smart-bot': return <AISmartBotView preselectedCoin={pendingTradeCoin} onCoinConsumed={() => setPendingTradeCoin(null)} />;
      case 'trading-status': return <TradingStatusView />;
      case 'signals': return <SignalsView />;
      case 'crypto': return <CryptoView onTrade={(symbol) => { setPendingTradeCoin(symbol); setActiveView('ai-smart-bot'); }} />;
      case 'copy-trading': return <CopyTradingView />;
      case 'trade-history': return <TradeHistoryView />;
      case 'wallet': return <WalletView />;
      case 'my-subscription': return <MySubscriptionView />;
      case 'connect-broker': return <ConnectBrokerView />;
      case 'broker-response': return <BrokerResponseView />;
      case 'tutorials': return <TutorialsView />;
      case 'faq': return <FAQView />;
      case 'help-center': return <HelpCenterView onNavigate={(v) => setActiveView(v as any)} />;
      case 'report-bug': return <ReportBugView />;
      default: return <DashboardView onDeploy={() => setActiveView('ai-smart-bot')} />;
    }
  };

  if (loading || redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-neon-cyan animate-spin" />
          <p className="text-sm text-slate-400">{redirecting ? 'Redirecting...' : `Loading ${appName}...`}</p>
        </div>
      </div>
    );
  }

  if (!session && !impersonation) {
    return <AuthScreen />;
  }

  if (maintenanceMode && !impersonation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-900">
        <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
          <Shield className="w-12 h-12 text-neon-amber" />
          <h1 className="text-2xl font-bold text-white">{appName} is under maintenance</h1>
          <p className="text-sm text-slate-400">We're performing scheduled upgrades to improve your trading experience. Please check back shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {impersonation && (
        <div className="bg-neon-amber/15 border-b border-neon-amber/30 px-4 py-2 flex items-center justify-between gap-2 sticky top-0 z-50">
          <div className="flex items-center gap-2 text-neon-amber text-xs font-semibold">
            <Eye className="w-4 h-4" />
            <span>ADMIN IMPERSONATION MODE — Viewing as {impersonation.client_email}</span>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('impersonate_token');
              localStorage.removeItem('impersonate_client_id');
              localStorage.removeItem('impersonate_client_email');
              setImpersonation(null);
              window.location.search = '';
            }}
            className="text-[10px] text-slate-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Exit
          </button>
        </div>
      )}
      {showDisclaimer && (
        <RiskDisclaimerModal onProceed={async () => {
          setDisclaimerDismissed(true);
          try { await refreshProfile(); } catch (e) { console.error('Profile refresh failed after disclaimer:', e); }
        }} />
      )}

      <TopNav onPanic={() => setPanicOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden lg:block w-64 flex-shrink-0 border-r border-white/[0.06] bg-base-850/50 backdrop-blur-sm">
          <Sidebar active={activeView} onSelect={setActiveView} />
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
              <Sidebar active={activeView} onSelect={setActiveView} onClose={() => setSidebarOpen(false)} />
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
              <span className="text-slate-500">{appName}</span>
              <span className="text-slate-700">/</span>
              <span className="text-neon-cyan font-semibold">{viewTitles[activeView]}</span>
            </div>
            {renderView()}
          </div>
          <Footer />
        </main>
      </div>

      <PanicModal open={panicOpen} onClose={() => setPanicOpen(false)} onConfirm={handlePanicConfirm} />
      <RealtimeToast />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </AuthProvider>
  );
}
