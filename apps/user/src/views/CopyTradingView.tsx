import { useState, useEffect } from 'react';
import { Copy, Search, Shield, Check, Activity, Layers, ChevronDown, Users, AlertCircle, Loader2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@cortex/shared/context/AuthContext';
import { supabase, type CopyTradingBot } from '@cortex/shared/lib/supabase';
import Sparkline from '@cortex/shared/components/Sparkline';

const accentMap = {
  cyan: { text: 'text-neon-cyan', bg: 'bg-neon-cyan/10', border: 'border-neon-cyan/30', hex: '#00e5ff' },
  green: { text: 'text-neon-green', bg: 'bg-neon-green/10', border: 'border-neon-green/30', hex: '#00ff9d' },
  amber: { text: 'text-neon-amber', bg: 'bg-neon-amber/10', border: 'border-neon-amber/30', hex: '#ffb020' },
};
const accents = ['cyan', 'green', 'amber'] as const;

const riskConfig: Record<string, { color: string; bg: string; border: string }> = {
  Low: { color: 'text-neon-green', bg: 'bg-neon-green/10', border: 'border-neon-green/20' },
  Medium: { color: 'text-neon-amber', bg: 'bg-neon-amber/10', border: 'border-neon-amber/20' },
  High: { color: 'text-neon-red', bg: 'bg-neon-red/10', border: 'border-neon-red/20' },
};

type SortKey = 'monthlyReturn' | 'totalCopiers' | 'winRate' | 'followers';

export default function CopyTradingView() {
  const { formatCompact } = useApp();
  const { user } = useAuth();
  const [bots, setBots] = useState<CopyTradingBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('monthlyReturn');
  const [copied, setCopied] = useState<Set<string>>(new Set());
  const [sortOpen, setSortOpen] = useState(false);
  const [copyLoading, setCopyLoading] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [masterTraders, setMasterTraders] = useState<{ id: string; name: string; exchange_name: string; commission_pct: number; status: string; followers_count: number }[]>([]);

  const sortLabels: Record<SortKey, string> = {
    monthlyReturn: 'Monthly Return',
    totalCopiers: 'Total Copiers',
    winRate: 'Win Rate',
    followers: 'Followers',
  };

  useEffect(() => {
    const fetchBots = async () => {
      const { data, error } = await supabase
        .from('copy_trading_bots')
        .select('*')
        .eq('is_active', true)
        .order('monthly_return_pct', { ascending: false });
      if (error) {
        setError(error.message);
      } else {
        setBots((data as CopyTradingBot[]) ?? []);
      }
      setLoading(false);

      const { data: mtData } = await supabase
        .from('master_traders_public')
        .select('*')
        .eq('status', 'active')
        .order('followers_count', { ascending: false });
      setMasterTraders((mtData as any[]) ?? []);
    };
    fetchBots();

    const channel = supabase
      .channel('copy-trading-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'copy_trading_bots', filter: 'is_active=eq.true' }, () => {
        fetchBots();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = [...bots]
    .filter(b => {
      const matchesSearch = b.name.toLowerCase().includes(search.toLowerCase()) ||
        b.description?.toLowerCase().includes(search.toLowerCase()) ||
        b.strategy_type.toLowerCase().includes(search.toLowerCase());
      const matchesRisk = riskFilter === 'all' || b.risk_level.toLowerCase() === riskFilter;
      return matchesSearch && matchesRisk;
    })
    .sort((a, b) => {
      if (sortKey === 'monthlyReturn') return b.monthly_return_pct - a.monthly_return_pct;
      if (sortKey === 'totalCopiers') return b.copiers_count - a.copiers_count;
      if (sortKey === 'winRate') return b.win_rate - a.win_rate;
      return b.followers_count - a.followers_count;
    });

  const handleCopy = async (bot: CopyTradingBot) => {
    if (copied.has(bot.id) || copyLoading) return;
    setCopyLoading(bot.id);
    setCopyError(null);
    try {
      const { error: rpcError } = await supabase
        .from('copy_trading_bots')
        .update({ copiers_count: bot.copiers_count + 1 })
        .eq('id', bot.id);
      if (rpcError) throw rpcError;
      setBots(prev => prev.map(b => b.id === bot.id ? { ...b, copiers_count: b.copiers_count + 1 } : b));
      setCopied(prev => new Set(prev).add(bot.id));
    } catch (e: any) {
      setCopyError(e.message || 'Failed to copy strategy. Please try again.');
    } finally {
      setCopyLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5 animate-slide-up">
        <h2 className="text-xl font-bold text-white flex items-center gap-2"><Copy className="w-5 h-5 text-neon-cyan" /> Copy Trading Marketplace</h2>
        <div className="glass-card p-12 text-center"><Loader2 className="w-6 h-6 text-neon-cyan animate-spin mx-auto" /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5 animate-slide-up">
        <h2 className="text-xl font-bold text-white flex items-center gap-2"><Copy className="w-5 h-5 text-neon-cyan" /> Copy Trading Marketplace</h2>
        <div className="glass-card p-8 text-center border-neon-red/20">
          <AlertCircle className="w-8 h-8 text-neon-red mx-auto mb-3" />
          <p className="text-sm font-semibold text-white">Failed to load marketplace</p>
          <p className="text-xs text-slate-500 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2"><Copy className="w-5 h-5 text-neon-cyan" /> Copy Trading Marketplace</h2>
          <p className="text-sm text-slate-400">Copy strategies from top-performing master bots verified by Cortex AI</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-neon-green/5 border border-neon-green/15">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-green" />
          </span>
          <span className="text-xs font-semibold text-neon-green">{bots.reduce((s, b) => s + b.copiers_count, 0).toLocaleString()} active copiers</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass-card p-4"><p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Master Bots</p><p className="text-xl font-bold text-white font-mono mt-1">{bots.length}</p></div>
        <div className="glass-card p-4"><p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Avg Monthly Return</p><p className="text-xl font-bold text-neon-green font-mono mt-1">{bots.length > 0 ? `+${(bots.reduce((s, b) => s + b.monthly_return_pct, 0) / bots.length).toFixed(1)}%` : '—'}</p></div>
        <div className="glass-card p-4"><p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Top Performer</p><p className="text-xl font-bold text-neon-amber font-mono mt-1">{bots.length > 0 ? `+${Math.max(...bots.map(b => b.monthly_return_pct)).toFixed(1)}%` : '—'}</p></div>
        <div className="glass-card p-4"><p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Total Followers</p><p className="text-xl font-bold text-white font-mono mt-1">{formatCompact(bots.reduce((s, b) => s + b.followers_count, 0))}</p></div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by bot name or strategy..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-white focus:outline-none focus:border-neon-cyan/30 transition-colors" />
        </div>
        <div className="flex gap-2">
          {['all', 'low', 'medium', 'high'].map(r => (
            <button key={r} onClick={() => setRiskFilter(r)} className={`px-3 py-2.5 rounded-xl text-xs font-semibold capitalize transition-all ${riskFilter === r ? r === 'low' ? 'bg-neon-green/15 text-neon-green border border-neon-green/30' : r === 'medium' ? 'bg-neon-amber/15 text-neon-amber border border-neon-amber/30' : r === 'high' ? 'bg-neon-red/15 text-neon-red border border-neon-red/30' : 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30' : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:border-white/[0.12]'}`}>{r === 'all' ? 'All Risk' : r}</button>
          ))}
        </div>
        <div className="relative">
          <button onClick={() => setSortOpen(!sortOpen)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-slate-300 hover:border-white/[0.12] transition-all">
            <span className="text-xs text-slate-500">Sort:</span><span className="text-xs font-semibold text-neon-cyan">{sortLabels[sortKey]}</span><ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          {sortOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 glass-strong rounded-xl p-1.5 min-w-[160px] animate-scale-in">
              {(Object.keys(sortLabels) as SortKey[]).map(key => (
                <button key={key} onClick={() => { setSortKey(key); setSortOpen(false); }} className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${sortKey === key ? 'bg-neon-cyan/10 text-neon-cyan' : 'text-slate-400 hover:bg-white/[0.04]'}`}>{sortLabels[key]}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card p-12 flex flex-col items-center justify-center text-center">
          <Copy className="w-12 h-12 text-slate-600 mb-3" />
          <p className="text-sm font-semibold text-slate-300">{bots.length === 0 ? 'No bots in marketplace yet' : 'No bots match your filters'}</p>
          <p className="text-xs text-slate-500 mt-1">{bots.length === 0 ? 'Master bots will appear here once they are listed.' : 'Try adjusting your search or risk level filter.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((bot, idx) => {
            const accent = accents[idx % accents.length];
            const a = accentMap[accent];
            const rc = riskConfig[bot.risk_level] ?? riskConfig.Medium;
            const isTopEarner = bot.monthly_return_pct > 20;
            const isHighRisk = bot.risk_level === 'High';
            return (
              <div key={bot.id} className={`glass-card p-5 relative overflow-hidden group hover:border-white/[0.12] transition-all duration-300 ${copied.has(bot.id) ? a.border : ''}`}>
                <div className={`absolute -top-12 -right-12 w-32 h-32 ${a.bg} rounded-full blur-3xl opacity-40 group-hover:opacity-70 transition-opacity`} />
                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-xl ${a.bg} ${a.border} border flex items-center justify-center`}><Copy className={`w-6 h-6 ${a.text}`} /></div>
                      <div><h3 className="text-sm font-bold text-white">{bot.name}</h3></div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4 line-clamp-2">{bot.description}</p>
                  <div className="flex items-center justify-between mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                    <div><p className="text-[9px] text-slate-500 uppercase font-semibold">Monthly Return</p><p className={`text-2xl font-bold font-mono ${isTopEarner ? 'text-neon-green' : a.text}`}>+{bot.monthly_return_pct.toFixed(1)}%</p></div>
                    <Sparkline data={bot.sparkline_data ?? []} color={a.hex} width={100} height={40} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="text-center py-2 rounded-lg bg-white/[0.03]"><p className="text-[9px] text-slate-500 uppercase mb-0.5">Win Rate</p><p className="text-xs font-bold text-neon-green font-mono">{bot.win_rate}%</p></div>
                    <div className="text-center py-2 rounded-lg bg-white/[0.03]"><p className="text-[9px] text-slate-500 uppercase mb-0.5">Copiers</p><p className="text-xs font-bold text-neon-cyan font-mono">{bot.copiers_count.toLocaleString()}</p></div>
                    <div className="text-center py-2 rounded-lg bg-white/[0.03]"><p className="text-[9px] text-slate-500 uppercase mb-0.5">Max DD</p><p className="text-xs font-bold text-neon-red font-mono">{bot.max_drawdown_pct}%</p></div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <span className={`px-2 py-1 rounded-md text-[10px] font-semibold ${rc.bg} ${rc.color} ${rc.border} border flex items-center gap-1`}><Shield className="w-3 h-3" /> {bot.risk_level} Risk</span>
                    <span className="px-2 py-1 rounded-md bg-white/[0.04] text-[10px] text-slate-400 flex items-center gap-1"><Layers className="w-3 h-3" /> {bot.strategy_type}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500"><Users className="w-3.5 h-3.5" />{bot.followers_count.toLocaleString()} followers</div>
                    <button onClick={() => handleCopy(bot)} disabled={copied.has(bot.id) || copyLoading === bot.id} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all duration-300 ${copied.has(bot.id) ? 'bg-neon-green/15 text-neon-green border border-neon-green/40 neon-glow-green cursor-default' : 'bg-gradient-to-r from-neon-cyan/20 to-neon-green/20 text-white border border-neon-cyan/40 hover:scale-[1.02]}'}`}>
                      {copied.has(bot.id) ? <><Check className="w-3.5 h-3.5" /> Copied!</> : copyLoading === bot.id ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Copying...</> : <><Copy className="w-3.5 h-3.5" /> Copy Strategy</>}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {masterTraders.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-neon-cyan" />
            <h3 className="text-sm font-bold text-white">Verified Master Traders</h3>
            <span className="text-[10px] text-slate-500">Admin-registered professionals available for copy trading</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {masterTraders.map((mt) => (
              <div key={mt.id} className="glass-card p-4 flex items-center justify-between gap-3 hover:border-white/[0.12] transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
                    <Users className="w-5 h-5 text-neon-cyan" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{mt.name}</p>
                    <p className="text-[10px] text-slate-500">{mt.exchange_name} · {mt.followers_count.toLocaleString()} followers</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-slate-500 uppercase font-semibold">Commission</p>
                  <p className="text-xs font-bold text-neon-amber font-mono">{Number(mt.commission_pct).toFixed(1)}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {copyError && (
        <div className="glass-card p-4 border-neon-red/20 flex items-start gap-3 animate-fade-in">
          <AlertCircle className="w-5 h-5 text-neon-red flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-white">Copy Failed</p>
            <p className="text-xs text-slate-400 mt-1">{copyError}</p>
          </div>
        </div>
      )}
    </div>
  );
}
