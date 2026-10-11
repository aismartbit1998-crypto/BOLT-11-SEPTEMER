import { useEffect, useState } from 'react';
import {
  Bot, Rocket, Plus, Loader2, Zap, Layers, TrendingUp, Copy,
  Edit3, Trash2, Pause, Play, Search, Users, ChevronDown, ChevronUp,
  AlertOctagon, Power, CircuitBoard
} from 'lucide-react';
import { supabase, type BotTemplate } from '@cortex/shared/lib/supabase';
import { useAdminCurrency } from '@/context/AdminCurrencyContext';
import BotFactoryModal from '@/components/admin/BotFactoryModal';
import type { BotFactoryDraft } from '@cortex/shared/types/bot';
import AdminSmartBoards from '@/views/admin/AdminSmartBoards';

const botTypeMeta: Record<string, { icon: typeof Zap; label: string; accent: string }> = {
  scalper: { icon: Zap, label: 'Scalper', accent: 'cyan' },
  dca: { icon: TrendingUp, label: 'DCA', accent: 'green' },
  grid: { icon: Layers, label: 'Grid', accent: 'amber' },
  copier: { icon: Copy, label: 'Copier', accent: 'cyan' },
};

const accentClasses: Record<string, { text: string; bg: string; border: string }> = {
  cyan: { text: 'text-neon-cyan', bg: 'bg-neon-cyan/10', border: 'border-neon-cyan/25' },
  green: { text: 'text-neon-green', bg: 'bg-neon-green/10', border: 'border-neon-green/25' },
  amber: { text: 'text-neon-amber', bg: 'bg-neon-amber/10', border: 'border-neon-amber/25' },
  red: { text: 'text-neon-red', bg: 'bg-neon-red/10', border: 'border-neon-red/25' },
};

type SortKey = 'name' | 'bot_type' | 'overall_pnl' | 'active_users' | 'status';

function BotManagementTab() {
  const { formatCurrency } = useAdminCurrency();
  const [bots, setBots] = useState<BotTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFactory, setShowFactory] = useState(false);
  const [editingBot, setEditingBot] = useState<BotTemplate | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('overall_pnl');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchBots = async () => {
    const { data } = await supabase.from('bot_templates').select('*').order('created_at', { ascending: false });
    setBots((data as BotTemplate[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchBots();
  }, []);

  const handleSave = async (draft: BotFactoryDraft) => {
    const payload = {
      name: draft.name,
      description: draft.description || null,
      bot_type: draft.bot_type,
      execution_mode: draft.execution_mode,
      market_type: draft.market_type,
      strategies: draft.strategies,
      indicators: draft.indicators,
      max_drawdown_pct: draft.max_drawdown_pct,
      default_tp_pct: draft.default_tp_pct,
      default_sl_pct: draft.default_sl_pct,
      tp_sl_ratio: draft.tp_sl_ratio,
      max_leverage: draft.max_leverage,
      risk_level: draft.risk_level,
      source_exchanges: draft.source_exchanges,
      strategy_type: draft.bot_type === 'scalper' ? 'scalping' : draft.bot_type === 'dca' ? 'dca' : draft.bot_type === 'grid' ? 'grid' : 'trailing',
      is_public: true,
    };

    if (editingBot) {
      await supabase.from('bot_templates').update(payload).eq('id', editingBot.id);
    } else {
      await supabase.from('bot_templates').insert({ ...payload, total_copies: 0, overall_pnl: 0, active_users: 0, status: 'active' });
    }

    await fetchBots();
    setShowFactory(false);
    setEditingBot(null);
  };

  const handleTogglePause = async (bot: BotTemplate) => {
    setActionLoading(bot.id);
    const newStatus = bot.status === 'paused' ? 'active' : 'paused';
    await supabase.from('bot_templates').update({ status: newStatus }).eq('id', bot.id);
    setBots(prev => prev.map(b => b.id === bot.id ? { ...b, status: newStatus } : b));
    setActionLoading(null);
  };

  // God Mode Smart Global Toggle Button Function (Pause All / Resume All)
  const handleGlobalToggle = async () => {
    const activeCountForToggle = bots.filter(b => b.status !== 'paused').length;
    const isPausing = activeCountForToggle > 0; // If even 1 bot is active, button acts as Pause All
    
    const confirmMsg = isPausing 
      ? "WARNING: Are you sure you want to pause ALL active bots immediately?"
      : "Are you sure you want to RESUME all paused bots?";
      
    if(!window.confirm(confirmMsg)) return;
    
    setActionLoading('global_toggle');
    
    if (isPausing) {
      // Pause all active bots
      const activeIds = bots.filter(b => b.status !== 'paused').map(b => b.id);
      if (activeIds.length > 0) {
        await supabase.from('bot_templates').update({ status: 'paused' }).in('id', activeIds);
        setBots(prev => prev.map(b => b.status !== 'paused' ? { ...b, status: 'paused' } : b));
      }
    } else {
      // Resume all paused bots
      const pausedIds = bots.filter(b => b.status === 'paused').map(b => b.id);
      if (pausedIds.length > 0) {
        await supabase.from('bot_templates').update({ status: 'active' }).in('id', pausedIds);
        setBots(prev => prev.map(b => b.status === 'paused' ? { ...b, status: 'active' } : b));
      }
    }
    
    setActionLoading(null);
  };

  const handleDelete = async (id: string) => {
    if(!window.confirm("Are you sure you want to delete this bot?")) return;
    setActionLoading(id);
    await supabase.from('bot_templates').delete().eq('id', id);
    setBots(prev => prev.filter(b => b.id !== id));
    setActionLoading(null);
  };

  const handleEdit = (bot: BotTemplate) => {
    setEditingBot(bot);
    setShowFactory(true);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const filteredBots = bots
    .filter(b => {
      const matchesSearch = b.name.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === 'all' || b.bot_type === typeFilter;
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'bot_type') cmp = (a.bot_type ?? '').localeCompare(b.bot_type ?? '');
      else if (sortKey === 'overall_pnl') cmp = (a.overall_pnl ?? 0) - (b.overall_pnl ?? 0);
      else if (sortKey === 'active_users') cmp = (a.active_users ?? 0) - (b.active_users ?? 0);
      else if (sortKey === 'status') cmp = (a.status ?? '').localeCompare(b.status ?? '');
      return sortDir === 'desc' ? -cmp : cmp;
    });

  const totalPnl = bots.reduce((s, b) => s + (b.overall_pnl ?? 0), 0);
  const activeCount = bots.filter(b => b.status !== 'paused').length;
  const highRiskCount = bots.filter(b => b.risk_level === 'High').length;
  
  // Determine Global Button State
  const isPausingMode = activeCount > 0;
  const isGlobalLoading = actionLoading === 'global_toggle';

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-neon-cyan animate-spin" /></div>;
  }

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-neon-cyan" /> Master Bot Command Center
          </h2>
          <p className="text-sm text-slate-400">Master bot factory, strategy injection, and global execution control</p>
        </div>
        <button
          onClick={() => { setEditingBot(null); setShowFactory(true); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30 hover:neon-glow-cyan text-sm font-semibold transition-all"
        >
          <Plus className="w-4 h-4" /> Build New Bot
        </button>
      </div>

      {/* God Mode Stats & Smart Toggle Button */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass p-5 rounded-2xl border border-white/[0.06] relative overflow-hidden">
            <div className="absolute -top-8 -right-8 w-24 h-24 bg-neon-cyan/10 rounded-full blur-2xl opacity-50" />
            <div className="flex items-center gap-3 mb-2 relative">
              <div className="p-2 bg-neon-cyan/10 rounded-lg"><Bot className="w-5 h-5 text-neon-cyan" /></div>
              <h3 className="text-slate-400 text-sm font-semibold">Total Active Bots</h3>
            </div>
            <p className="text-2xl font-bold text-white relative">{activeCount} <span className="text-sm font-normal text-slate-500">/ {bots.length} total</span></p>
          </div>
          
          <div className="glass p-5 rounded-2xl border border-white/[0.06] relative overflow-hidden">
            <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-50 ${totalPnl >= 0 ? 'bg-neon-green/10' : 'bg-neon-red/10'}`} />
            <div className="flex items-center gap-3 mb-2 relative">
              <div className={`p-2 rounded-lg ${totalPnl >= 0 ? 'bg-neon-green/10' : 'bg-neon-red/10'}`}>
                <TrendingUp className={`w-5 h-5 ${totalPnl >= 0 ? 'text-neon-green' : 'text-neon-red'}`} />
              </div>
              <h3 className="text-slate-400 text-sm font-semibold">Global Platform P&L</h3>
            </div>
            <p className={`text-2xl font-bold font-mono relative ${totalPnl >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
              {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)}
            </p>
          </div>

          <div className="glass p-5 rounded-2xl border border-white/[0.06] relative overflow-hidden">
             <div className="absolute -top-8 -right-8 w-24 h-24 bg-neon-amber/10 rounded-full blur-2xl opacity-50" />
            <div className="flex items-center gap-3 mb-2 relative">
              <div className="p-2 bg-neon-amber/10 rounded-lg"><AlertOctagon className="w-5 h-5 text-neon-amber" /></div>
              <h3 className="text-slate-400 text-sm font-semibold">High Risk Bots</h3>
            </div>
            <p className="text-2xl font-bold text-white relative">{highRiskCount} <span className="text-sm font-normal text-slate-500">running</span></p>
          </div>
        </div>

        {/* Global Smart Toggle Button (Pause/Resume) */}
        <div className={`glass p-5 rounded-2xl border flex flex-col items-center justify-center text-center relative overflow-hidden group transition-colors duration-500 ${
          isPausingMode ? 'border-neon-red/30 bg-neon-red/5' : 'border-neon-green/30 bg-neon-green/5'
        }`}>
          <div className={`absolute inset-0 blur-xl transition-all duration-500 ${
            isPausingMode ? 'bg-neon-red/10 group-hover:bg-neon-red/20' : 'bg-neon-green/10 group-hover:bg-neon-green/20'
          }`}></div>
          <button 
            onClick={handleGlobalToggle}
            disabled={isGlobalLoading || bots.length === 0}
            className={`relative z-10 flex flex-col items-center gap-2 transition-transform ${
              bots.length > 0 
                ? (isPausingMode ? 'text-neon-red hover:scale-105' : 'text-neon-green hover:scale-105') 
                : 'text-slate-500 opacity-50 cursor-not-allowed'
            }`}
          >
            <div className={`p-4 rounded-full border shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all duration-500 ${
              bots.length > 0 
                ? (isPausingMode 
                    ? 'bg-neon-red/20 border-neon-red/50 shadow-[0_0_15px_rgba(255,59,92,0.5)]' 
                    : 'bg-neon-green/20 border-neon-green/50 shadow-[0_0_15px_rgba(0,255,157,0.5)]') 
                : 'bg-slate-800 border-slate-600 shadow-none'
            }`}>
              {isGlobalLoading ? (
                <Loader2 className="w-8 h-8 animate-spin" />
              ) : isPausingMode ? (
                <Pause className="w-8 h-8" />
              ) : (
                <Play className="w-8 h-8" />
              )}
            </div>
            <span className="font-bold text-sm tracking-wider">
              {isPausingMode ? 'PAUSE ALL BOTS' : 'RESUME ALL BOTS'}
            </span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search bots by name..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-white focus:outline-none focus:border-neon-cyan/30 transition-colors"
          />
        </div>
        <div className="relative">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="appearance-none pl-4 pr-10 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-white focus:outline-none focus:border-neon-cyan/30 transition-colors cursor-pointer"
          >
            <option value="all">All Types</option>
            <option value="scalper">Scalper</option>
            <option value="dca">DCA</option>
            <option value="grid">Grid</option>
            <option value="copier">Copier</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Bot Template Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredBots.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-10 text-center">
            <Bot className="w-8 h-8 text-slate-700 mb-2" />
            <p className="text-sm text-slate-500">No bot templates found.</p>
          </div>
        ) : filteredBots.slice(0, 8).map(bot => {
          const meta = botTypeMeta[bot.bot_type ?? 'scalper'] ?? botTypeMeta.scalper;
          const BIcon = meta.icon;
          const a = accentClasses[meta.accent];
          const pnl = bot.overall_pnl ?? 0;
          const isPaused = bot.status === 'paused';
          const strategies = bot.strategies ?? [];
          const indicators = bot.indicators ?? [];

          return (
            <div key={bot.id} className="glass-card p-5 hover:border-white/[0.12] transition-all duration-300 group relative overflow-hidden">
              <div className={`absolute -top-8 -right-8 w-20 h-20 ${a.bg} rounded-full blur-2xl opacity-40 group-hover:opacity-80 transition-opacity`} />

              <div className="relative">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${a.bg} border ${a.border} flex items-center justify-center flex-shrink-0`}>
                      <BIcon className={`w-5 h-5 ${a.text}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{bot.name}</p>
                      <p className="text-[10px] text-slate-500">{meta.label}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold border flex-shrink-0 ${
                    isPaused
                      ? 'bg-neon-amber/10 text-neon-amber border-neon-amber/25'
                      : 'bg-neon-green/10 text-neon-green border-neon-green/25'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-neon-amber' : 'bg-neon-green animate-pulse'}`} />
                    {isPaused ? 'Paused' : 'Active'}
                  </span>
                </div>

                {bot.description && (
                  <p className="text-[11px] text-slate-400 mb-3 line-clamp-2">{bot.description}</p>
                )}

                {/* Execution + Risk badges */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                    bot.execution_mode === 'auto'
                      ? 'bg-neon-green/10 text-neon-green border-neon-green/20'
                      : 'bg-neon-amber/10 text-neon-amber border-neon-amber/20'
                  }`}>
                    {bot.execution_mode === 'auto' ? 'Auto-Trade' : 'Manual'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                    bot.risk_level === 'High' ? 'bg-neon-red/10 text-neon-red border-neon-red/20' :
                    bot.risk_level === 'Low' ? 'bg-neon-green/10 text-neon-green border-neon-green/20' :
                    'bg-neon-amber/10 text-neon-amber border-neon-amber/20'
                  }`}>{bot.risk_level} Risk</span>
                  {bot.max_leverage && (
                    <span className="px-2 py-0.5 rounded-md bg-white/[0.05] text-[10px] text-slate-300 border border-white/[0.06]">{bot.max_leverage}x Max</span>
                  )}
                </div>

                {/* Strategy/Indicator tags */}
                {(strategies.length > 0 || indicators.length > 0) && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {strategies.slice(0, 2).map(s => (
                      <span key={s} className="px-1.5 py-0.5 rounded bg-neon-cyan/10 text-neon-cyan text-[9px] font-medium border border-neon-cyan/20">{s}</span>
                    ))}
                    {indicators.slice(0, 2).map(i => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-neon-amber/10 text-neon-amber text-[9px] font-medium border border-neon-amber/20">{i}</span>
                    ))}
                    {(strategies.length + indicators.length) > 4 && (
                      <span className="px-1.5 py-0.5 rounded bg-white/[0.05] text-slate-400 text-[9px] font-medium">
                        +{strategies.length + indicators.length - 4}
                      </span>
                    )}
                  </div>
                )}

                {/* Footer stats */}
                <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3 text-slate-500" />
                      <span className="text-[10px] text-slate-400">{(bot.active_users ?? 0).toLocaleString()}</span>
                    </div>
                    <span className={`text-[10px] font-mono font-bold ${pnl >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                      {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleEdit(bot)}
                    disabled={actionLoading === bot.id}
                    className="text-[10px] font-semibold text-slate-400 hover:text-neon-cyan transition-colors flex items-center gap-0.5"
                  >
                    Edit <Layers className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Master Bot Dashboard Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-slate-500">
                <th className="text-left px-4 py-3 font-semibold cursor-pointer hover:text-slate-300 transition-colors" onClick={() => toggleSort('name')}>
                  <span className="flex items-center gap-1">Bot Name {sortKey === 'name' && <span className="text-neon-cyan">{sortDir === 'asc' ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}</span>}</span>
                </th>
                <th className="text-left px-4 py-3 font-semibold cursor-pointer hover:text-slate-300 transition-colors" onClick={() => toggleSort('bot_type')}>
                  <span className="flex items-center gap-1">Type {sortKey === 'bot_type' && <span className="text-neon-cyan">{sortDir === 'asc' ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}</span>}</span>
                </th>
                <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Execution</th>
                <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Strategies / Indicators</th>
                <th className="text-right px-4 py-3 font-semibold cursor-pointer hover:text-slate-300 transition-colors" onClick={() => toggleSort('overall_pnl')}>
                  <span className="flex items-center gap-1 justify-end">Global P&L {sortKey === 'overall_pnl' && <span className="text-neon-cyan">{sortDir === 'asc' ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}</span>}</span>
                </th>
                <th className="text-right px-4 py-3 font-semibold cursor-pointer hover:text-slate-300 transition-colors" onClick={() => toggleSort('active_users')}>
                  <span className="flex items-center gap-1 justify-end">Users {sortKey === 'active_users' && <span className="text-neon-cyan">{sortDir === 'asc' ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}</span>}</span>
                </th>
                <th className="text-center px-4 py-3 font-semibold cursor-pointer hover:text-slate-300 transition-colors" onClick={() => toggleSort('status')}>
                  <span className="flex items-center gap-1 justify-center">Status {sortKey === 'status' && <span className="text-neon-cyan">{sortDir === 'asc' ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}</span>}</span>
                </th>
                <th className="text-right px-4 py-3 font-semibold">Master Override</th>
              </tr>
            </thead>
            <tbody>
              {filteredBots.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-500">
                    <Bot className="w-8 h-8 mx-auto mb-2 text-slate-700" />
                    <p className="text-sm">No bots found. Build your first bot to get started.</p>
                  </td>
                </tr>
              ) : (
                filteredBots.map(bot => {
                  const meta = botTypeMeta[bot.bot_type ?? 'scalper'] ?? botTypeMeta.scalper;
                  const BIcon = meta.icon;
                  const a = accentClasses[meta.accent];
                  const pnl = bot.overall_pnl ?? 0;
                  const isPaused = bot.status === 'paused';
                  const strategies = bot.strategies ?? [];
                  const indicators = bot.indicators ?? [];

                  return (
                    <tr key={bot.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group">
                      {/* Name */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg ${a.bg} border ${a.border} flex items-center justify-center flex-shrink-0`}>
                            <BIcon className={`w-4.5 h-4.5 ${a.text}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{bot.name}</p>
                            <p className="text-[10px] text-slate-500 truncate max-w-[180px]">{bot.description ?? 'No description'}</p>
                          </div>
                        </div>
                      </td>
                      {/* Type */}
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md ${a.bg} ${a.border} border text-[11px] font-semibold ${a.text}`}>
                          <BIcon className="w-3 h-3" /> {meta.label}
                        </span>
                      </td>
                      {/* Execution */}
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <span className={`text-[11px] font-medium ${bot.execution_mode === 'auto' ? 'text-neon-green' : 'text-neon-amber'}`}>
                          {bot.execution_mode === 'auto' ? 'Auto-Trade' : 'Manual Approval'}
                        </span>
                      </td>
                      {/* Strategies & Indicators */}
                      <td className="px-4 py-3.5 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {strategies.slice(0, 2).map(s => (
                            <span key={s} className="px-1.5 py-0.5 rounded bg-neon-cyan/10 text-neon-cyan text-[9px] font-medium border border-neon-cyan/20">{s}</span>
                          ))}
                          {indicators.slice(0, 2).map(i => (
                            <span key={i} className="px-1.5 py-0.5 rounded bg-neon-amber/10 text-neon-amber text-[9px] font-medium border border-neon-amber/20">{i}</span>
                          ))}
                          {(strategies.length + indicators.length) > 4 && (
                            <span className="px-1.5 py-0.5 rounded bg-white/[0.05] text-slate-400 text-[9px] font-medium">
                              +{strategies.length + indicators.length - 4}
                            </span>
                          )}
                          {strategies.length === 0 && indicators.length === 0 && (
                            <span className="text-[10px] text-slate-600 italic">No strategies set</span>
                          )}
                        </div>
                      </td>
                      {/* PnL */}
                      <td className="px-4 py-3.5 text-right">
                        <span className={`text-sm font-mono font-bold ${pnl >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                          {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                        </span>
                      </td>
                      {/* Active Users */}
                      <td className="px-4 py-3.5 text-right">
                        <span className="text-sm font-mono text-slate-200 flex items-center justify-end gap-1">
                          <Users className="w-3.5 h-3.5 text-slate-500" />
                          {(bot.active_users ?? 0).toLocaleString()}
                        </span>
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold border ${
                          isPaused
                            ? 'bg-neon-amber/10 text-neon-amber border-neon-amber/25'
                            : 'bg-neon-green/10 text-neon-green border-neon-green/25'
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-neon-amber' : 'bg-neon-green animate-pulse'}`} />
                          {isPaused ? 'Paused' : 'Active'}
                        </span>
                      </td>
                      {/* Actions (God Mode Override) */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleEdit(bot)}
                            disabled={actionLoading === bot.id}
                            className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] text-slate-400 hover:text-neon-cyan hover:border-neon-cyan/30 transition-all flex items-center justify-center"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleTogglePause(bot)}
                            disabled={actionLoading === bot.id}
                            className={`w-8 h-8 rounded-lg border transition-all flex items-center justify-center ${
                              isPaused
                                ? 'bg-neon-green/10 text-neon-green border-neon-green/20 hover:bg-neon-green/20'
                                : 'bg-neon-amber/10 text-neon-amber border-neon-amber/20 hover:bg-neon-amber/20'
                            }`}
                            title={isPaused ? 'Force Resume' : 'Force Pause'}
                          >
                            {actionLoading === bot.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleDelete(bot.id)}
                            disabled={actionLoading === bot.id}
                            className="w-8 h-8 rounded-lg bg-neon-red/10 text-neon-red border border-neon-red/20 hover:bg-neon-red/20 transition-all flex items-center justify-center"
                            title="Kill/Delete Bot"
                          >
                            {actionLoading === bot.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bot Factory Modal */}
      {showFactory && (
        <BotFactoryModal
          onClose={() => { setShowFactory(false); setEditingBot(null); }}
          onSave={handleSave}
          editing={editingBot}
        />
      )}
    </div>
  );
}

type BotTab = 'templates' | 'allotments';

export default function AdminBots() {
  const [activeTab, setActiveTab] = useState<BotTab>('templates');

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] w-fit">
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'templates'
              ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          <Bot className="w-4 h-4" /> Bot Templates & Management
        </button>
        <button
          onClick={() => setActiveTab('allotments')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'allotments'
              ? 'bg-neon-green/15 text-neon-green border border-neon-green/30'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          <CircuitBoard className="w-4 h-4" /> Smart Bot Allotment
        </button>
      </div>

      {activeTab === 'templates' ? <BotManagementTab /> : <AdminSmartBoards />}
    </div>
  );
}