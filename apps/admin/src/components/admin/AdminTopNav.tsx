import { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Activity, Server, LogOut, User, Bell, DollarSign, IndianRupee, ArrowLeftRight, X } from 'lucide-react';
import { useAuth } from '@cortex/shared/context/AuthContext';
import { useAdminCurrency } from '@/context/AdminCurrencyContext';
import { supabase, type ClientUpdate } from '@cortex/shared/lib/supabase';

interface Props {
  killSwitchActive: boolean;
  onToggleKill: () => void;
}

export default function AdminTopNav({ killSwitchActive, onToggleKill }: Props) {
  const { user, signOut } = useAuth();
  const { currency, toggleCurrency, symbol } = useAdminCurrency();
  const emailPrefix = user?.email?.split('@')[0] ?? 'admin';

  const [notifOpen, setNotifOpen] = useState(false);
  const [updates, setUpdates] = useState<ClientUpdate[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from('client_updates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setUpdates((data as ClientUpdate[]) ?? []);
      });

    const channel = supabase
      .channel('admin-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'client_updates' }, (payload) => {
        setUpdates(prev => [payload.new as ClientUpdate, ...prev].slice(0, 10));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unreadCount = updates.length;

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-base-900/70 backdrop-blur-2xl">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 gap-3">
        {/* Brand */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-neon-amber/20 to-neon-red/20 border border-neon-amber/30 flex items-center justify-center" style={{ boxShadow: '0 0 15px rgba(255, 176, 32, 0.15)' }}>
            <ShieldCheck className="w-5 h-5 text-neon-amber" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-base font-bold tracking-tight">
              <span className="text-neon-amber" style={{ textShadow: '0 0 10px rgba(255, 176, 32, 0.5)' }}>Cortex</span>{' '}
              <span className="text-white">Admin</span>
            </h1>
            <p className="text-[10px] text-slate-500 -mt-0.5">Master Control Panel</p>
          </div>
        </div>

        {/* Status indicators - hidden on small screens */}
        <div className="hidden md:flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-green" />
            </span>
            <span className="text-xs text-slate-300 font-semibold">System Online</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass">
            <Server className="w-4 h-4 text-neon-cyan" />
            <span className="text-xs text-slate-300 font-semibold">5 APIs</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass">
            <Activity className="w-4 h-4 text-neon-green" />
            <span className="text-xs text-slate-300 font-semibold">654 Users</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Currency Toggle */}
          <button
            onClick={toggleCurrency}
            className="flex items-center gap-2 px-3 py-2 rounded-xl glass hover:bg-white/[0.06] transition-all duration-300 group"
            title={`Switch to ${currency === 'USD' ? 'INR' : 'USD'}`}
          >
            <div className="relative flex items-center gap-1.5">
              <DollarSign className={`w-4 h-4 transition-all ${currency === 'USD' ? 'text-neon-green scale-110' : 'text-slate-600'}`} style={currency === 'USD' ? { filter: 'drop-shadow(0 0 4px rgba(0,255,157,0.8))' } : {}} />
              <ArrowLeftRight className="w-3 h-3 text-slate-500 group-hover:text-slate-300 transition-colors" />
              <IndianRupee className={`w-4 h-4 transition-all ${currency === 'INR' ? 'text-neon-green scale-110' : 'text-slate-600'}`} style={currency === 'INR' ? { filter: 'drop-shadow(0 0 4px rgba(0,255,157,0.8))' } : {}} />
            </div>
            <span className="text-xs font-bold text-neon-amber" style={{ textShadow: '0 0 8px rgba(255,176,32,0.5)' }}>
              {currency === 'USD' ? symbol + 'USD' : symbol + 'INR'}
            </span>
          </button>

          {/* Kill Switch */}
          <button
            onClick={onToggleKill}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl font-bold text-xs transition-all duration-200 active:scale-95 ${
              killSwitchActive
                ? 'bg-neon-red/25 border border-neon-red/50 text-neon-red neon-glow-red'
                : 'bg-neon-red/10 border border-neon-red/30 text-neon-red/70 hover:bg-neon-red/20'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span className="hidden sm:inline">KILL SWITCH</span>
          </button>

          {/* Notifications */}
          <div ref={notifRef} className="relative">
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative flex items-center px-3 py-2 rounded-xl glass hover:bg-white/[0.06] transition-all"
            >
              <Bell className="w-4 h-4 text-slate-300" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-neon-red text-[9px] font-bold text-white">{unreadCount}</span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] glass-strong rounded-2xl border border-white/[0.08] overflow-hidden animate-scale-in z-[60]">
                <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                  <span className="text-sm font-bold text-white">Notifications</span>
                  <button onClick={() => setNotifOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto scrollbar-thin">
                  {updates.length === 0 ? (
                    <div className="p-8 text-center">
                      <Bell className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-xs text-slate-500">No notifications yet</p>
                    </div>
                  ) : (
                    updates.map((u) => (
                      <div key={u.id} className="px-4 py-3 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-start gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${u.severity === 'critical' ? 'bg-neon-red' : u.severity === 'warning' ? 'bg-neon-amber' : u.severity === 'success' ? 'bg-neon-green' : 'bg-neon-cyan'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-white truncate">{u.title}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{u.message}</p>
                            <p className="text-[10px] text-slate-600 mt-1">{new Date(u.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User + Sign Out */}
          <div className="flex items-center gap-2">
            <div className="hidden xl:flex items-center gap-2 px-3 py-2 rounded-xl glass">
              <User className="w-4 h-4 text-neon-amber" />
              <span className="text-xs text-slate-300 max-w-[100px] truncate">{emailPrefix}</span>
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass hover:bg-neon-red/15 hover:border-neon-red/30 transition-all duration-200"
              title="Sign out"
            >
              <LogOut className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
