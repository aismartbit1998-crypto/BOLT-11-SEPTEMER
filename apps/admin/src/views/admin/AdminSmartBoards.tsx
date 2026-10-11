import { useState, useEffect, useCallback } from 'react';
import {
  Bot, Plus, Trash2, Loader2, Search, Users, Check, X,
  Zap, Layers, TrendingUp, Grid3x3, PiggyBank,
  KeyRound, CheckSquare, Square, Crown,
} from 'lucide-react';
import { supabase } from '@cortex/shared/lib/supabase';
import { useAuth } from '@cortex/shared/context/AuthContext';
import { coins } from '@cortex/shared/data/mockData';

const API_BASE = import.meta.env.VITE_ENGINE_URL || '';

interface SmartBoard {
  id: string;
  name: string;
  description: string | null;
  strategy_type: string;
  coin: string;
  market_type: string;
  leverage: number;
  take_profit_pct: number | null;
  stop_loss_pct: number | null;
  indicators: string[] | null;
  risk_level: string;
  max_trades_per_day: number;
  max_daily_loss: number | null;
  max_daily_profit: number | null;
  direction: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

interface Allotment {
  id: string;
  user_id: string;
  board_template_id: string;
  is_active: boolean;
  allotted_by: string | null;
  created_at: string;
  smart_board_templates?: { name: string; strategy_type: string; coin: string };
}

interface Client {
  id: string;
  email: string;
}

const strategyMeta: Record<string, { icon: typeof Zap; label: string }> = {
  scalping: { icon: Zap, label: 'Scalper' },
  grid: { icon: Grid3x3, label: 'Grid' },
  dca: { icon: PiggyBank, label: 'DCA' },
  trailing: { icon: TrendingUp, label: 'Trailing' },
};

const indicatorOptions = ['RSI', 'MACD', 'EMA Crossover', 'SMC Order Blocks'];

export default function AdminSmartBoards() {
  const { user } = useAuth();
  const [boards, setBoards] = useState<SmartBoard[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [allotments, setAllotments] = useState<Allotment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showAllot, setShowAllot] = useState(false);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formStrategy, setFormStrategy] = useState('scalping');
  const [formCoin, setFormCoin] = useState('BTC');
  const [formMarket, setFormMarket] = useState('spot');
  const [formLeverage, setFormLeverage] = useState(1);
  const [formTP, setFormTP] = useState(5);
  const [formSL, setFormSL] = useState(2);
  const [formRisk, setFormRisk] = useState('Medium');
  const [formDirection, setFormDirection] = useState('long');
  const [formIndicators, setFormIndicators] = useState<string[]>([]);
  const [formMaxTrades, setFormMaxTrades] = useState(20);
  const [formMaxLoss, setFormMaxLoss] = useState(500);
  const [formMaxProfit, setFormMaxProfit] = useState(1000);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Multi-select allotment state
  const [allotClient, setAllotClient] = useState('');
  const [selectedBoardIds, setSelectedBoardIds] = useState<Set<string>>(new Set());
  const [allotting, setAllotting] = useState(false);
  const [allotError, setAllotError] = useState<string | null>(null);
  const [allotSuccess, setAllotSuccess] = useState<string | null>(null);

  const fetchBoards = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/smart-boards`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) setBoards(data.boards as SmartBoard[]);
        return;
      }
    } catch { /* engine not running */ }
    // Fallback: direct RPC
    const { data, error } = await supabase.rpc('get_smart_board_templates');
    if (!error && data) setBoards(data as SmartBoard[]);
  }, []);

  const fetchClients = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_all_client_profiles');
    if (!error && data) setClients(data as Client[]);
  }, []);

  const fetchAllotments = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/allotments`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) setAllotments(data.allotments as Allotment[]);
        return;
      }
    } catch { /* engine not running */ }
    // Fallback: direct RPC
    const { data, error } = await supabase.rpc('get_user_allotments', { p_user_id: null });
    if (!error && data) setAllotments(data as Allotment[]);
  }, []);

  useEffect(() => {
    Promise.all([fetchBoards(), fetchClients(), fetchAllotments()]).then(() => setLoading(false));
  }, [fetchBoards, fetchClients, fetchAllotments]);

  // Realtime: refresh when boards or allotments change
  useEffect(() => {
    const channel = supabase
      .channel('admin-smart-boards')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'smart_board_templates' }, () => { fetchBoards(); fetchAllotments(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_allotments' }, () => fetchAllotments())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchBoards, fetchAllotments]);

  const handleCreate = async () => {
    if (!formName.trim()) { setCreateError('Bot name is required'); return; }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/smart-boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          description: formDesc || null,
          strategy_type: formStrategy,
          coin: formCoin,
          market_type: formMarket,
          leverage: Number(formLeverage),
          take_profit_pct: Number(formTP) || null,
          stop_loss_pct: Number(formSL) || null,
          indicators: formIndicators.length > 0 ? formIndicators : null,
          risk_level: formRisk,
          max_trades_per_day: Number(formMaxTrades),
          max_daily_loss: Number(formMaxLoss) || null,
          max_daily_profit: Number(formMaxProfit) || null,
          direction: formDirection,
          created_by: user?.email ?? null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          await fetchBoards();
          setShowCreate(false);
          resetForm();
        } else {
          setCreateError(data.error || 'Failed to create bot');
        }
      } else {
        setCreateError('Server error creating bot');
      }
    } catch {
      setCreateError('Engine server not reachable');
    }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this smart bot? All user allotments will also be removed.')) return;
    setActionLoading(id);
    try {
      await fetch(`${API_BASE}/api/admin/smart-boards/${id}`, { method: 'DELETE' });
      setBoards(prev => prev.filter(b => b.id !== id));
      setAllotments(prev => prev.filter(a => a.board_template_id !== id));
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  const toggleBoardSelection = (boardId: string) => {
    setSelectedBoardIds(prev => {
      const next = new Set(prev);
      if (next.has(boardId)) next.delete(boardId);
      else next.add(boardId);
      return next;
    });
  };

  const selectAllBoards = () => {
    if (selectedBoardIds.size === boards.length) {
      setSelectedBoardIds(new Set());
    } else {
      setSelectedBoardIds(new Set(boards.map(b => b.id)));
    }
  };

  const handleBulkAllot = async () => {
    if (!allotClient) { setAllotError('Select a client first'); return; }
    if (selectedBoardIds.size === 0) { setAllotError('Select at least one bot to assign'); return; }
    setAllotting(true);
    setAllotError(null);
    setAllotSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/allotments/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: allotClient,
          board_template_ids: [...selectedBoardIds],
          allotted_by: user?.email ?? null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAllotSuccess(`${data.assigned_count} bot(s) assigned successfully!`);
          await fetchAllotments();
          setTimeout(() => {
            setShowAllot(false);
            setAllotSuccess(null);
            setSelectedBoardIds(new Set());
            setAllotClient('');
          }, 1500);
        } else {
          setAllotError(data.error || 'Failed to allot bots');
        }
      }
    } catch {
      setAllotError('Engine server not reachable');
    }
    setAllotting(false);
  };

  const handleRevoke = async (id: string) => {
    setActionLoading(`revoke-${id}`);
    try {
      await fetch(`${API_BASE}/api/admin/allotments/${id}`, { method: 'DELETE' });
      setAllotments(prev => prev.filter(a => a.id !== id));
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  const resetForm = () => {
    setFormName(''); setFormDesc(''); setFormStrategy('scalping'); setFormCoin('BTC');
    setFormMarket('spot'); setFormLeverage(1); setFormTP(5); setFormSL(2);
    setFormRisk('Medium'); setFormDirection('long'); setFormIndicators([]);
    setFormMaxTrades(20); setFormMaxLoss(500); setFormMaxProfit(1000);
    setCreateError(null);
  };

  const toggleIndicator = (ind: string) => {
    setFormIndicators(prev => prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind]);
  };

  const openAllotModal = (presetBoardId?: string) => {
    setShowAllot(true);
    setAllotError(null);
    setAllotSuccess(null);
    setAllotClient('');
    if (presetBoardId) {
      setSelectedBoardIds(new Set([presetBoardId]));
    } else {
      setSelectedBoardIds(new Set());
    }
  };

  const filteredBoards = boards.filter(b => b.name.toLowerCase().includes(search.toLowerCase()));
  const clientEmailMap = new Map(clients.map(c => [c.id, c.email]));

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-neon-cyan animate-spin" /></div>;
  }

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-neon-cyan" /> Smart Bot Management
          </h2>
          <p className="text-sm text-slate-400">Create AI trading bots and assign them to licensed clients</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openAllotModal()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neon-green/15 text-neon-green border border-neon-green/30 hover:bg-neon-green/20 text-sm font-semibold transition-all"
          >
            <Users className="w-4 h-4" /> Allot Bots
          </button>
          <button
            onClick={() => { setShowCreate(true); resetForm(); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30 hover:neon-glow-cyan text-sm font-semibold transition-all"
          >
            <Plus className="w-4 h-4" /> Create Bot
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-neon-cyan/10 rounded-lg"><Bot className="w-5 h-5 text-neon-cyan" /></div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase">Total Bots</p>
              <p className="text-xl font-bold text-white">{boards.length}</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-neon-green/10 rounded-lg"><KeyRound className="w-5 h-5 text-neon-green" /></div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase">Active Allotments</p>
              <p className="text-xl font-bold text-white">{allotments.filter(a => a.is_active).length}</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-neon-amber/10 rounded-lg"><Users className="w-5 h-5 text-neon-amber" /></div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase">Licensed Clients</p>
              <p className="text-xl font-bold text-white">{new Set(allotments.filter(a => a.is_active).map(a => a.user_id)).size}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search bots by name..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-white focus:outline-none focus:border-neon-cyan/30 transition-colors"
        />
      </div>

      {/* Board Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredBoards.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
            <Bot className="w-10 h-10 text-slate-700 mb-3" />
            <p className="text-sm text-slate-500">No smart bots yet. Create your first bot to get started.</p>
          </div>
        ) : filteredBoards.map(board => {
          const meta = strategyMeta[board.strategy_type] || strategyMeta.scalping;
          const Icon = meta.icon;
          const boardAllotments = allotments.filter(a => a.board_template_id === board.id && a.is_active);
          return (
            <div key={board.id} className="glass-card p-5 hover:border-white/[0.12] transition-all duration-300 group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-neon-cyan/10 border border-neon-cyan/25 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-neon-cyan" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{board.name}</p>
                    <p className="text-[10px] text-slate-500">{meta.label} · {board.coin}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(board.id)}
                  disabled={actionLoading === board.id}
                  className="w-7 h-7 rounded-lg bg-neon-red/10 text-neon-red border border-neon-red/20 hover:bg-neon-red/20 transition-all flex items-center justify-center"
                >
                  {actionLoading === board.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>

              {board.description && <p className="text-xs text-slate-400 mb-3 line-clamp-2">{board.description}</p>}

              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className="px-2 py-0.5 rounded-md bg-white/[0.05] text-[10px] text-slate-300 border border-white/[0.06]">{board.market_type}</span>
                <span className="px-2 py-0.5 rounded-md bg-neon-amber/10 text-neon-amber text-[10px] font-medium border border-neon-amber/20">{board.leverage}x</span>
                {board.take_profit_pct != null && <span className="px-2 py-0.5 rounded-md bg-neon-green/10 text-neon-green text-[10px] font-medium border border-neon-green/20">TP {board.take_profit_pct}%</span>}
                {board.stop_loss_pct != null && <span className="px-2 py-0.5 rounded-md bg-neon-red/10 text-neon-red text-[10px] font-medium border border-neon-red/20">SL {board.stop_loss_pct}%</span>}
                {board.direction && <span className="px-2 py-0.5 rounded-md bg-white/[0.05] text-[10px] text-slate-300 border border-white/[0.06] capitalize">{board.direction}</span>}
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                  board.risk_level === 'Low' ? 'bg-neon-green/10 text-neon-green border-neon-green/20' :
                  board.risk_level === 'High' ? 'bg-neon-red/10 text-neon-red border-neon-red/20' :
                  'bg-neon-amber/10 text-neon-amber border-neon-amber/20'
                }`}>{board.risk_level}</span>
              </div>

              {board.indicators && board.indicators.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {board.indicators.map(ind => (
                    <span key={ind} className="px-1.5 py-0.5 rounded bg-neon-cyan/10 text-neon-cyan text-[9px] font-medium border border-neon-cyan/20">{ind}</span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[11px] text-slate-400">{boardAllotments.length} client{boardAllotments.length !== 1 ? 's' : ''}</span>
                </div>
                <button
                  onClick={() => openAllotModal(board.id)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-neon-cyan hover:text-white transition-colors"
                >
                  <Plus className="w-3 h-3" /> Assign
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Allotments Table */}
      {allotments.length > 0 && (
        <div className="glass-card overflow-hidden">
          <h3 className="text-sm font-bold text-white px-5 py-4 flex items-center gap-2 border-b border-white/[0.04]">
            <KeyRound className="w-4 h-4 text-neon-green" /> Active Bot Licenses
          </h3>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left px-4 py-3 font-semibold">Client</th>
                  <th className="text-left px-4 py-3 font-semibold">Bot</th>
                  <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Strategy</th>
                  <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Allotted By</th>
                  <th className="text-right px-4 py-3 font-semibold">Revoke</th>
                </tr>
              </thead>
              <tbody>
                {allotments.filter(a => a.is_active).map(a => (
                  <tr key={a.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-slate-200 font-mono text-xs">{clientEmailMap.get(a.user_id) || a.user_id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-white font-medium">{a.smart_board_templates?.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 capitalize hidden md:table-cell">{a.smart_board_templates?.strategy_type || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 hidden lg:table-cell">{a.allotted_by || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRevoke(a.id)}
                        disabled={actionLoading === `revoke-${a.id}`}
                        className="w-7 h-7 rounded-lg bg-neon-red/10 text-neon-red border border-neon-red/20 hover:bg-neon-red/20 transition-all inline-flex items-center justify-center"
                      >
                        {actionLoading === `revoke-${a.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Board Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-base-900/80 backdrop-blur-md" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin animate-scale-in">
            <div className="glass-strong neon-glow-cyan p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-neon-cyan" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Create Smart Bot</h2>
                  <p className="text-xs text-slate-400">Define a new AI trading strategy template</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Bot Name</label>
                  <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Aggressive BTC Scalper"
                    className="w-full px-4 py-2.5 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-cyan/40 transition-colors" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Description</label>
                  <input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Brief strategy description"
                    className="w-full px-4 py-2.5 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-cyan/40 transition-colors" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Strategy</label>
                    <select value={formStrategy} onChange={e => setFormStrategy(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-cyan/40 cursor-pointer">
                      <option value="scalping">Scalper</option>
                      <option value="grid">Grid</option>
                      <option value="dca">DCA</option>
                      <option value="trailing">Trailing</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Coin</label>
                    <select value={formCoin} onChange={e => setFormCoin(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-cyan/40 cursor-pointer">
                      {coins.slice(0, 10).map(c => <option key={c.symbol} value={c.symbol}>{c.symbol}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Market Type</label>
                    <select value={formMarket} onChange={e => setFormMarket(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-cyan/40 cursor-pointer">
                      <option value="spot">Spot</option>
                      <option value="futures">Futures</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Direction</label>
                    <select value={formDirection} onChange={e => setFormDirection(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-cyan/40 cursor-pointer">
                      <option value="long">Long</option>
                      <option value="short">Short</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Leverage</label>
                    <input type="number" min={1} max={100} value={formLeverage} onChange={e => setFormLeverage(Number(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-cyan/40" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block font-semibold">TP %</label>
                    <input type="number" step="0.1" value={formTP} onChange={e => setFormTP(Number(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-cyan/40" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block font-semibold">SL %</label>
                    <input type="number" step="0.1" value={formSL} onChange={e => setFormSL(Number(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-cyan/40" />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-2 block font-semibold">Indicators</label>
                  <div className="flex flex-wrap gap-2">
                    {indicatorOptions.map(ind => (
                      <button key={ind} onClick={() => toggleIndicator(ind)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          formIndicators.includes(ind)
                            ? 'bg-neon-cyan/15 text-neon-cyan border-neon-cyan/40'
                            : 'glass text-slate-400 border-white/[0.06] hover:text-slate-200'
                        }`}>
                        {ind}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Max Trades/Day</label>
                    <input type="number" value={formMaxTrades} onChange={e => setFormMaxTrades(Number(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-cyan/40" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Max Daily Loss</label>
                    <input type="number" value={formMaxLoss} onChange={e => setFormMaxLoss(Number(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-cyan/40" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Max Daily Profit</label>
                    <input type="number" value={formMaxProfit} onChange={e => setFormMaxProfit(Number(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-cyan/40" />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Risk Level</label>
                  <div className="flex gap-2">
                    {['Low', 'Medium', 'High'].map(r => (
                      <button key={r} onClick={() => setFormRisk(r)}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                          formRisk === r
                            ? r === 'Low' ? 'bg-neon-green/15 text-neon-green border-neon-green/40'
                              : r === 'High' ? 'bg-neon-red/15 text-neon-red border-neon-red/40'
                              : 'bg-neon-amber/15 text-neon-amber border-neon-amber/40'
                            : 'glass text-slate-400 border-white/[0.06]'
                        }`}>{r}</button>
                    ))}
                  </div>
                </div>

                {createError && <p className="text-xs text-neon-red">{createError}</p>}

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowCreate(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl glass hover:bg-white/[0.07] text-sm text-slate-300 transition-all">Cancel</button>
                  <button onClick={handleCreate} disabled={creating}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/40 hover:neon-glow-cyan text-sm font-bold transition-all disabled:opacity-50">
                    {creating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Bot'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Select Allotment Modal */}
      {showAllot && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-base-900/80 backdrop-blur-md" onClick={() => setShowAllot(false)} />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin animate-scale-in">
            <div className="glass-strong neon-glow-green p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-neon-green/10 border border-neon-green/30 flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-neon-green" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">License Generation & Allotment</h2>
                  <p className="text-xs text-slate-400">Select a client and bundle multiple bots into their license</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Client Selector */}
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Select Client</label>
                  <select value={allotClient} onChange={e => setAllotClient(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-green/40 cursor-pointer">
                    <option value="">Choose a client...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.email}</option>)}
                  </select>
                </div>

                {/* Multi-Select Board List */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-slate-400 font-semibold">Select Bots to License</label>
                    <button
                      onClick={selectAllBoards}
                      className="text-[10px] font-semibold text-neon-cyan hover:text-white transition-colors flex items-center gap-1"
                    >
                      {selectedBoardIds.size === boards.length && boards.length > 0 ? (
                        <><X className="w-3 h-3" /> Clear all</>
                      ) : (
                        <><CheckSquare className="w-3 h-3" /> Select all</>
                      )}
                    </button>
                  </div>

                  {boards.length === 0 ? (
                    <div className="p-4 rounded-xl glass text-center">
                      <Crown className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                      <p className="text-xs text-slate-500">No bots available. Create bots first.</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[280px] overflow-y-auto scrollbar-thin pr-1">
                      {boards.map(board => {
                        const isSelected = selectedBoardIds.has(board.id);
                        const meta = strategyMeta[board.strategy_type] || strategyMeta.scalping;
                        const Icon = meta.icon;
                        return (
                          <button
                            key={board.id}
                            onClick={() => toggleBoardSelection(board.id)}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 text-left ${
                              isSelected
                                ? 'bg-neon-green/10 border-neon-green/40 shadow-[0_0_8px_rgba(0,255,157,0.1)]'
                                : 'glass border-white/[0.06] hover:border-white/[0.14]'
                            }`}
                          >
                            <div className={`flex-shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                              isSelected ? 'bg-neon-green/20 border-neon-green/50' : 'border-white/[0.1]'
                            }`}>
                              {isSelected && <Check className="w-3.5 h-3.5 text-neon-green" />}
                            </div>
                            <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                              isSelected ? 'bg-neon-green/10' : 'bg-white/[0.04]'
                            }`}>
                              <Icon className={`w-4 h-4 ${isSelected ? 'text-neon-green' : 'text-slate-400'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>{board.name}</p>
                              <p className="text-[10px] text-slate-500">{meta.label} · {board.coin} · {board.leverage}x</p>
                            </div>
                            <div className="flex flex-shrink-0 gap-1">
                              {board.take_profit_pct != null && (
                                <span className="px-1.5 py-0.5 rounded bg-neon-green/10 text-neon-green text-[9px] font-medium border border-neon-green/20">TP {board.take_profit_pct}%</span>
                              )}
                              {board.stop_loss_pct != null && (
                                <span className="px-1.5 py-0.5 rounded bg-neon-red/10 text-neon-red text-[9px] font-medium border border-neon-red/20">SL {board.stop_loss_pct}%</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Selection Counter */}
                  {boards.length > 0 && (
                    <div className="mt-2 flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-[10px] text-slate-500">
                        <span className="text-neon-green font-bold">{selectedBoardIds.size}</span> bot{selectedBoardIds.size !== 1 ? 's' : ''} selected
                      </span>
                      {selectedBoardIds.size > 0 && (
                        <button
                          onClick={() => setSelectedBoardIds(new Set())}
                          className="text-[10px] text-slate-500 hover:text-neon-red transition-colors"
                        >
                          Clear selection
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {allotError && <p className="text-xs text-neon-red">{allotError}</p>}
                {allotSuccess && (
                  <p className="text-xs text-neon-green flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" /> {allotSuccess}
                  </p>
                )}

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowAllot(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl glass hover:bg-white/[0.07] text-sm text-slate-300 transition-all">Cancel</button>
                  <button onClick={handleBulkAllot} disabled={allotting || !allotClient || selectedBoardIds.size === 0}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-neon-green/15 text-neon-green border border-neon-green/40 hover:bg-neon-green/20 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    {allotting ? (
                      <><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Assigning...</>
                    ) : (
                      <>Assign {selectedBoardIds.size > 0 ? `${selectedBoardIds.size} Bot${selectedBoardIds.size !== 1 ? 's' : ''}` : 'Bots'}</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
