import { useEffect, useState, useCallback } from 'react';
import { Users, DollarSign, Bot, TrendingUp, TrendingDown, Activity, Server, Zap, ShieldCheck, AlertTriangle, ArrowUpRight, ArrowDownRight, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useAdminCurrency } from '@/context/AdminCurrencyContext';

interface DashboardStats {
  total_users: number;
  total_bots: number;
  running_bots: number;
  paused_bots: number;
  total_trades: number;
  total_volume: number;
  global_realized_pnl: number;
  global_unrealized_pnl: number;
  total_aum: number;
  active_licenses: number;
  worker_active: boolean;
  worker_interval_ms: number;
  timestamp: string;
}

interface ActivityItem {
  id: string;
  type: 'trade' | 'bot_launch' | 'admin_action';
  severity: 'info' | 'success' | 'warning' | 'critical';
  message: string;
  actor: string;
  created_at: string;
}

const defaultStats: DashboardStats = {
  total_users: 0,
  total_bots: 0,
  running_bots: 0,
  paused_bots: 0,
  total_trades: 0,
  total_volume: 0,
  global_realized_pnl: 0,
  global_unrealized_pnl: 0,
  total_aum: 0,
  active_licenses: 0,
  worker_active: false,
  worker_interval_ms: 2000,
  timestamp: '',
};

const severityConfig: Record<string, string> = {
  info: 'text-slate-400',
  warning: 'text-neon-amber',
  critical: 'text-neon-red',
  success: 'text-neon-green',
};

const typeIcon: Record<string, typeof Users> = {
  trade: TrendingUp,
  bot_launch: Bot,
  admin_action: ShieldCheck,
};

const API_BASE = import.meta.env.VITE_ENGINE_URL || '';
const POLL_INTERVAL_MS = 6000;

export default function AdminDashboard() {
  const { formatCompact, formatCurrency } = useAdminCurrency();
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/dashboard-stats`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stats) {
          setStats(data.stats as DashboardStats);
        }
      }
    } catch {
      // Engine not running — keep last known stats
    }
  }, []);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/recent-activity?limit=15`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.activity) {
          setActivity(data.activity as ActivityItem[]);
        }
      }
    } catch {
      // Engine not running
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadAll = async () => {
      await Promise.all([fetchStats(), fetchActivity()]);
      if (mounted) {
        setLoading(false);
        setLastUpdated(new Date());
      }
    };

    loadAll();

    const interval = setInterval(loadAll, POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [fetchStats, fetchActivity]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-neon-cyan animate-spin" />
      </div>
    );
  }

  const globalPnl = stats.global_unrealized_pnl + stats.global_realized_pnl;

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Auto-refresh indicator */}
      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-green" />
          </span>
          Live data · auto-refresh every {POLL_INTERVAL_MS / 1000}s
        </span>
        {lastUpdated && <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total AUM" value={formatCompact(stats.total_aum)} icon={DollarSign} accent="cyan" sub="Under Management" />
        <StatCard label="Total Users" value={stats.total_users.toString()} icon={Users} accent="green" sub={`${stats.active_licenses} active licenses`} />
        <StatCard label="Running Bots" value={stats.running_bots.toString()} icon={Bot} accent="amber" sub={`${stats.paused_bots} paused · ${stats.total_bots} total`} />
        <StatCard label="Total Trades" value={stats.total_trades.toString()} icon={Activity} accent="cyan" sub={`${formatCompact(stats.total_volume)} volume`} />
      </div>

      {/* PnL overview + system health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* PnL */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-neon-green" />
            Platform P&L Overview
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-neon-green/5 border border-neon-green/10">
              <div>
                <p className="text-[10px] text-slate-500 uppercase">Unrealized P&L</p>
                <p className="text-xl font-bold text-neon-green font-mono">{stats.global_unrealized_pnl >= 0 ? '+' : ''}{formatCurrency(stats.global_unrealized_pnl)}</p>
              </div>
              {stats.global_unrealized_pnl >= 0 ? <ArrowUpRight className="w-6 h-6 text-neon-green/50" /> : <ArrowDownRight className="w-6 h-6 text-neon-red/50" />}
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-neon-cyan/5 border border-neon-cyan/10">
              <div>
                <p className="text-[10px] text-slate-500 uppercase">Realized P&L</p>
                <p className="text-xl font-bold text-neon-cyan font-mono">{stats.global_realized_pnl >= 0 ? '+' : ''}{formatCurrency(stats.global_realized_pnl)}</p>
              </div>
              <TrendingUp className="w-6 h-6 text-neon-cyan/50" />
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
              <div>
                <p className="text-[10px] text-slate-500 uppercase">Total Platform P&L</p>
                <p className="text-xl font-bold text-white font-mono">{globalPnl >= 0 ? '+' : ''}{formatCurrency(globalPnl)}</p>
              </div>
              <Zap className="w-6 h-6 text-neon-amber/50" />
            </div>
          </div>
        </div>

        {/* System Activity Feed */}
        <div className="glass-card p-5 lg:col-span-2">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-neon-cyan" />
            System Activity Feed
          </h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-thin">
            {activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Activity className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-xs text-slate-500">No activity recorded yet. Trades and bot launches will appear here in real time.</p>
              </div>
            ) : activity.map((a) => {
              const Icon = typeIcon[a.type] || Activity;
              return (
                <div key={a.id} className="flex items-start gap-3 py-2.5 px-3 rounded-xl hover:bg-white/[0.03] transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
                    <Icon className={`w-4 h-4 ${severityConfig[a.severity]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{a.message}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-500 font-mono">{a.actor}</span>
                      <span className="text-[10px] text-slate-600">·</span>
                      <span className="text-[10px] text-slate-500">{new Date(a.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                  <span className={`text-[9px] font-bold uppercase ${severityConfig[a.severity]}`}>{a.severity}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* System Health + Bot Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* System Health */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Server className="w-4 h-4 text-neon-cyan" />
            System Health
          </h3>
          <div className="space-y-3">
            <HealthRow
              label="Background Bot Worker"
              status={stats.worker_active}
              detail={stats.worker_active ? `Polling every ${stats.worker_interval_ms / 1000}s` : 'Inactive'}
            />
            <HealthRow
              label="Database Connection"
              status={stats.total_users > 0 || stats.total_bots > 0}
              detail={`${stats.total_users} users · ${stats.total_bots} bots`}
            />
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-neon-amber/10 border border-neon-amber/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-neon-amber" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Bot Distribution</p>
                  <p className="text-[10px] text-slate-500">Running vs Paused bots</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm font-mono">
                <span className="text-neon-green">{stats.running_bots} running</span>
                <span className="text-slate-600">/</span>
                <span className="text-neon-red">{stats.paused_bots} paused</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-neon-cyan" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Total Trade Volume</p>
                  <p className="text-[10px] text-slate-500">Across all executed orders</p>
                </div>
              </div>
              <span className="text-sm font-mono text-slate-200">{formatCompact(stats.total_volume)}</span>
            </div>
          </div>
        </div>

        {/* Worker Status Detail */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-neon-green" />
            Worker Monitoring Status
          </h3>
          <div className="space-y-3">
            <div className={`p-4 rounded-xl border ${stats.worker_active ? 'bg-neon-green/5 border-neon-green/20' : 'bg-neon-red/5 border-neon-red/20'}`}>
              <div className="flex items-center gap-3">
                {stats.worker_active ? (
                  <CheckCircle2 className="w-5 h-5 text-neon-green" />
                ) : (
                  <XCircle className="w-5 h-5 text-neon-red" />
                )}
                <div>
                  <p className="text-sm font-bold text-white">
                    {stats.worker_active ? 'Autonomous Worker Active' : 'Worker Offline'}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {stats.worker_active
                      ? `Monitoring running bots every ${stats.worker_interval_ms / 1000} seconds with bulk price fetches.`
                      : 'Start the engine server to enable automatic TP/SL monitoring.'}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-white/[0.03] text-center">
                <p className="text-[10px] text-slate-500 uppercase">Running Bots Monitored</p>
                <p className="text-2xl font-bold text-neon-green font-mono mt-1">{stats.running_bots}</p>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] text-center">
                <p className="text-[10px] text-slate-500 uppercase">Total Platform Bots</p>
                <p className="text-2xl font-bold text-neon-cyan font-mono mt-1">{stats.total_bots}</p>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-slate-500 uppercase">Active Bot Ratio</span>
                <span className="text-xs font-mono text-slate-300">
                  {stats.total_bots > 0 ? Math.round((stats.running_bots / stats.total_bots) * 100) : 0}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-base-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-neon-green to-neon-cyan transition-all duration-500"
                  style={{ width: `${stats.total_bots > 0 ? (stats.running_bots / stats.total_bots) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent, sub }: { label: string; value: string; icon: typeof DollarSign; accent: 'cyan' | 'green' | 'amber' | 'red'; sub: string }) {
  const colors = {
    cyan: { text: 'text-neon-cyan', bg: 'bg-neon-cyan/10' },
    green: { text: 'text-neon-green', bg: 'bg-neon-green/10' },
    amber: { text: 'text-neon-amber', bg: 'bg-neon-amber/10' },
    red: { text: 'text-neon-red', bg: 'bg-neon-red/10' },
  };
  const a = colors[accent];
  return (
    <div className="glass-card p-4 relative overflow-hidden group hover:border-white/[0.12] transition-all duration-300">
      <div className={`absolute -top-8 -right-8 w-24 h-24 ${a.bg} rounded-full blur-2xl opacity-50 group-hover:opacity-100 transition-opacity`} />
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">{label}</span>
          <Icon className={`w-4 h-4 ${a.text}`} />
        </div>
        <p className="text-lg sm:text-xl font-bold text-white font-mono">{value}</p>
        <p className={`text-[10px] mt-0.5 ${a.text}`}>{sub}</p>
      </div>
    </div>
  );
}

function HealthRow({ label, status, detail }: { label: string; status: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${status ? 'bg-neon-green/10 border border-neon-green/20' : 'bg-neon-red/10 border border-neon-red/20'}`}>
          {status ? <CheckCircle2 className="w-4 h-4 text-neon-green" /> : <XCircle className="w-4 h-4 text-neon-red" />}
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="text-[10px] text-slate-500">{detail}</p>
        </div>
      </div>
    </div>
  );
}
