import { useState, useEffect, useCallback } from 'react';
import {
  Users, Search, TrendingUp, TrendingDown,
  DollarSign, Bot, Pencil, Trash2, LogIn, X, Zap, Shield,
  Calendar, ChevronDown, ChevronUp, Crown, Sparkles, AlertTriangle, UserCog,
  KeyRound, Rocket, Clock, Plus, Minus, ArrowUpRight, ArrowDownRight, History,
  Loader2, ExternalLink, Eye, Copy, Check
} from 'lucide-react';
import {
  type AdminClient, type ConnectedExchange,
  licenseCycleConfig, type LicenseCycle,
} from '@/data/adminMockData';

import { useAdminCurrency } from '@/context/AdminCurrencyContext';
import { useAuth } from '@cortex/shared/context/AuthContext';
import { useAdminRbac } from '@/context/AdminRbacContext';
import { coins } from '@cortex/shared/data/mockData';
import { supabase } from '@cortex/shared/lib/supabase';
import StrategyBuilderForm, { type StrategyPayload } from '@/components/admin/StrategyBuilderForm';

const API_BASE = import.meta.env.VITE_ENGINE_URL || '';

const statusConfig = {
  active: 'text-neon-green bg-neon-green/10 border-neon-green/20',
  suspended: 'text-neon-amber bg-neon-amber/10 border-neon-amber/20',
  banned: 'text-neon-red bg-neon-red/10 border-neon-red/20',
};

const planConfig: Record<string, { color: string; icon: typeof Crown }> = {
  Enterprise: { color: 'text-neon-amber', icon: Crown },
  Pro: { color: 'text-neon-green', icon: Sparkles },
  Starter: { color: 'text-neon-cyan', icon: Zap },
};

type ModalMode = 'edit' | 'license' | 'impersonate' | 'remove' | 'trade' | 'history' | 'brokerKeys' | null;

interface ClientTrade {
  id: string;
  coin: string;
  market_type: string;
  direction: string;
  entry_price: number;
  quantity: number;
  leverage: number;
  status: string;
  created_at: string;
  executed_by: string;
}

interface ClientStats {
  total: number;
  active: number;
  suspended: number;
  banned: number;
  starter: number;
  pro: number;
  enterprise: number;
}

interface DecryptedBrokerKey {
  id: string;
  exchange_name: string;
  exchange_id?: string | null;
  api_key: string;
  api_secret: string;
  is_connected: boolean;
  created_at: string;
}

export default function AdminClients() {
  const { formatCurrency } = useAdminCurrency();
  const { user } = useAuth();
  const { hasPermission } = useAdminRbac();
  const canViewApiKeys = hasPermission('view_api_keys');
  const [search, setSearch] = useState('');
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [stats, setStats] = useState<ClientStats>({ total: 0, active: 0, suspended: 0, banned: 0, starter: 0, pro: 0, enterprise: 0 });
  const [clientTrades, setClientTrades] = useState<ClientTrade[]>([]);
  const [loadingTrades, setLoadingTrades] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<AdminClient | null>(null);
  const [sortField, setSortField] = useState<'totalFunds' | 'unrealizedPnl' | 'activeBots' | 'licenseValidUntil'>('totalFunds');
  const [sortAsc, setSortAsc] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // License editor state
  const [editCycle, setEditCycle] = useState<LicenseCycle>('monthly');
  const [editBotLimit, setEditBotLimit] = useState(1);
  const [editStrategies, setEditStrategies] = useState<string[]>([]);
  const [editIndicators, setEditIndicators] = useState<string[]>([]);
  const [editValidUntil, setEditValidUntil] = useState('');

  // Edit modal state
  const [editPlan, setEditPlan] = useState<string>('Starter');
  const [editExpiry, setEditExpiry] = useState('');
  const [extendMonths, setExtendMonths] = useState(0);
  const [editStatus, setEditStatus] = useState<string>('active');
  const [editCountry, setEditCountry] = useState<string>('');

  // Strategy builder trade state
  const [executingTrade, setExecutingTrade] = useState(false);
  const [tradeSuccessMsg, setTradeSuccessMsg] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);

  // Impersonation state
  const [impersonateUrl, setImpersonateUrl] = useState<string | null>(null);

  // Broker keys state
  const [brokerKeys, setBrokerKeys] = useState<DecryptedBrokerKey[]>([]);
  const [loadingBrokerKeys, setLoadingBrokerKeys] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Add Client modal state
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientPassword, setNewClientPassword] = useState('');
  const [newClientPlan, setNewClientPlan] = useState('Starter');
  const [newClientBotLimit, setNewClientBotLimit] = useState(2);
  const [newClientValidUntil, setNewClientValidUntil] = useState('');
  const [addingClient, setAddingClient] = useState(false);
  const [addClientError, setAddClientError] = useState<string | null>(null);

  // ─── Fetch all clients from unified endpoint ───────────────────────────────
  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/clients`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setClients(data.clients as AdminClient[]);
          setStats(data.stats as ClientStats);
        }
      }
    } catch { /* engine not running */ }
    setLoadingClients(false);
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // ─── Supabase Realtime: refresh client list on any profile/license change ──
  useEffect(() => {
    const channel = supabase
      .channel('admin-client-management')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchClients())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'licenses' }, () => fetchClients())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_funds' }, () => fetchClients())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bots' }, () => fetchClients())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, () => {
        // If history modal is open for the affected client, refresh trades
        if (selected && modalMode === 'history') {
          fetchClientTrades(selected.id);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_updates' }, () => fetchClients())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchClients, selected, modalMode]);

  const fetchClientTrades = async (clientId: string) => {
    setLoadingTrades(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/clients/${clientId}/trades`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) setClientTrades(data.trades as ClientTrade[]);
      }
    } catch { /* engine not running */ }
    // Fallback: query via RPC
    if (clientTrades.length === 0) {
      const { data: rpcData } = await supabase.rpc('get_client_trades', { p_client_id: clientId });
      if (rpcData) setClientTrades(rpcData as ClientTrade[]);
    }
    setLoadingTrades(false);
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const filtered = [...clients]
    .filter(c =>
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.plan.toLowerCase().includes(search.toLowerCase()) ||
      c.country.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      if (sortField === 'licenseValidUntil') {
        return (new Date(a.licenseValidUntil).getTime() - new Date(b.licenseValidUntil).getTime()) * dir;
      }
      return (a[sortField] - b[sortField]) * dir;
    });

  const openEdit = (client: AdminClient) => {
    setSelected(client);
    setEditPlan(client.plan);
    setEditExpiry(client.licenseValidUntil.split('T')[0]);
    setExtendMonths(0);
    setEditStatus(client.status);
    setEditCountry(client.country);
    setModalMode('edit');
  };

  const openLicense = (client: AdminClient) => {
    setSelected(client);
    setEditCycle(client.licenseCycle);
    setEditBotLimit(client.botLimit);
    setEditStrategies([...client.unlockedStrategies]);
    setEditIndicators([...client.unlockedIndicators]);
    setEditValidUntil(client.licenseValidUntil.split('T')[0]);
    setModalMode('license');
  };

  const openImpersonate = (client: AdminClient) => {
    setSelected(client);
    setImpersonateUrl(null);
    setModalMode('impersonate');
  };

  const openRemove = (client: AdminClient) => {
    setSelected(client);
    setModalMode('remove');
  };

  const openTrade = (client: AdminClient) => {
    setSelected(client);
    setTradeSuccessMsg(false);
    setModalMode('trade');
  };

  const openHistory = useCallback(async (client: AdminClient) => {
    setSelected(client);
    setModalMode('history');
    setClientTrades([]);
    await fetchClientTrades(client.id);
  }, []);

  const openBrokerKeys = async (client: AdminClient) => {
    setSelected(client);
    setModalMode('brokerKeys');
    setBrokerKeys([]);
    setLoadingBrokerKeys(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/clients/${client.id}/broker-keys?admin_id=${user?.id ?? ''}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) setBrokerKeys(data.keys as DecryptedBrokerKey[]);
      }
    } catch { /* engine not running */ }
    setLoadingBrokerKeys(false);
  };

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const disconnectBrokerKey = async (keyId: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/broker-keys/${keyId}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('engine unreachable');
    } catch {
      // Fallback: disconnect via RPC
      await supabase.rpc('disconnect_broker_key', { p_key_id: keyId });
    }
    setBrokerKeys(prev => prev.map(k => k.id === keyId ? { ...k, is_connected: false } : k));
    setActionLoading(false);
  };

  const closeModal = () => {
    setModalMode(null);
    setSelected(null);
    setImpersonateUrl(null);
    setBrokerKeys([]);
  };

  // ─── Add Client: create auth user + assign license in one call ──────────────
  const handleAddClient = async () => {
    if (!newClientEmail.trim() || !newClientPassword.trim()) {
      setAddClientError('Email and password are required');
      return;
    }
    setAddingClient(true);
    setAddClientError(null);

    const validUntilISO = newClientValidUntil
      ? new Date(newClientValidUntil).toISOString()
      : new Date(Date.now() + 30 * 86400000).toISOString();

    try {
      const res = await fetch(`${API_BASE}/api/admin/clients/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newClientEmail.trim(),
          password: newClientPassword.trim(),
          full_name: newClientName.trim() || undefined,
          plan_name: newClientPlan,
          bot_limit: newClientBotLimit,
          valid_until: validUntilISO,
          created_by: user?.id,
        }),
      });

      const data = await res.json();
      if (data.success) {
        await fetchClients();
        setShowAddClient(false);
        setNewClientName('');
        setNewClientEmail('');
        setNewClientPassword('');
        setNewClientPlan('Starter');
        setNewClientBotLimit(2);
        setNewClientValidUntil('');
      } else {
        setAddClientError(data.error || 'Failed to create client');
      }
    } catch {
      setAddClientError('Engine server not reachable. Please try again.');
    }

    setAddingClient(false);
  };

  // ─── Save License (updates licenses table + client_updates notification) ────
  const saveLicense = async () => {
    if (!selected) return;
    setActionLoading(true);

    const validUntilISO = editValidUntil
      ? new Date(editValidUntil).toISOString()
      : selected.licenseValidUntil;

    try {
      const res = await fetch(`${API_BASE}/api/admin/clients/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valid_until: validUntilISO,
          bot_limit: editBotLimit,
        }),
      });

      if (!res.ok) throw new Error('engine unreachable');
    } catch {
      // Fallback: update licenses via RPC
      await supabase.rpc('update_client_license', { p_user_id: selected.id, p_valid_until: validUntilISO, p_bot_limit: editBotLimit });
    }

    // Send client notification via RPC
    await supabase.rpc('insert_client_update', {
      p_client_id: selected.id,
      p_update_type: 'license_update',
      p_title: 'License Updated by Admin',
      p_message: `Your license has been updated: ${editCycle} cycle, ${editBotLimit} bots max, valid until ${editValidUntil || selected.licenseValidUntil.split('T')[0]}.`,
      p_severity: 'success',
      p_executed_by: 'Master Admin',
    });

    // Update local state
    setClients(prev => prev.map(c => c.id === selected.id ? {
      ...c,
      licenseCycle: editCycle,
      botLimit: editBotLimit,
      unlockedStrategies: editStrategies,
      unlockedIndicators: editIndicators,
      licenseValidUntil: validUntilISO,
    } : c));

    setActionLoading(false);
    closeModal();
  };

  // ─── Save Edit (updates profile + license) ─────────────────────────────────
  const saveEdit = async () => {
    if (!selected) return;
    setActionLoading(true);

    let newExpiry = editExpiry;
    if (extendMonths > 0) {
      const base = new Date(editExpiry);
      base.setMonth(base.getMonth() + extendMonths);
      newExpiry = base.toISOString().split('T')[0];
    }
    const planBotLimits: Record<string, number> = { Starter: 2, Pro: 10, Enterprise: 25 };
    const validUntilISO = new Date(newExpiry).toISOString();

    try {
      const res = await fetch(`${API_BASE}/api/admin/clients/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country: editCountry,
          status: editStatus,
          plan: editPlan,
          valid_until: validUntilISO,
          bot_limit: planBotLimits[editPlan] ?? selected.botLimit,
        }),
      });

      if (!res.ok) throw new Error('engine unreachable');
    } catch {
      // Fallback: update profiles + licenses via RPC
      await supabase.rpc('admin_update_client', {
        p_client_id: selected.id,
        p_country: editCountry,
        p_status: editStatus,
        p_plan_name: editPlan,
        p_valid_until: validUntilISO,
        p_bot_limit: planBotLimits[editPlan] ?? selected.botLimit,
        p_update_title: `Plan Changed to ${editPlan}`,
        p_update_message: `Your subscription plan has been updated to ${editPlan}${extendMonths > 0 ? ` and extended by ${extendMonths} month${extendMonths !== 1 ? 's' : ''}` : ''}. New expiry: ${newExpiry}.`,
        p_update_type: 'plan_change',
        p_severity: 'info',
        p_executed_by: 'Master Admin',
      });
    }

    // Send client notification via RPC
    await supabase.rpc('insert_client_update', {
      p_client_id: selected.id,
      p_update_type: 'plan_change',
      p_title: `Plan Changed to ${editPlan}`,
      p_message: `Your subscription plan has been updated to ${editPlan}${extendMonths > 0 ? ` and extended by ${extendMonths} month${extendMonths !== 1 ? 's' : ''}` : ''}. New expiry: ${newExpiry}.`,
      p_severity: 'info',
      p_executed_by: 'Master Admin',
    });

    // Update local state immediately
    setClients(prev => prev.map(c => c.id === selected.id ? {
      ...c,
      plan: editPlan,
      status: editStatus as AdminClient['status'],
      country: editCountry,
      licenseValidUntil: newExpiry,
      botLimit: planBotLimits[editPlan] ?? c.botLimit,
    } : c));

    setActionLoading(false);
    closeModal();
  };

  // ─── Soft-delete: set status to 'banned' ───────────────────────────────────
  const removeClient = async () => {
    if (!selected) return;
    setActionLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/admin/clients/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'banned' }),
      });

      if (!res.ok) throw new Error('engine unreachable');
    } catch {
      // Fallback: update profiles via RPC
      await supabase.rpc('update_client_status', { p_client_id: selected.id, p_status: 'banned' });
    }

    await supabase.rpc('insert_client_update', {
      p_client_id: selected.id,
      p_update_type: 'status_change',
      p_title: 'Account Banned',
      p_message: 'Your account has been banned by an administrator.',
      p_severity: 'critical',
      p_executed_by: 'Master Admin',
    });

    setClients(prev => prev.map(c => c.id === selected.id ? { ...c, status: 'banned' as const } : c));

    setActionLoading(false);
    closeModal();
  };

  // ─── Execute Strategy Trade via engine ─────────────────────────────────────
  const handleExecuteStrategyTrade = async (payload: StrategyPayload) => {
    if (!selected) return;
    setExecutingTrade(true);

    const selectedCoinData = coins.find(c => c.symbol === payload.coin) || coins[0];
    const livePrice = selectedCoinData?.price || 64200;
    const notionalValue = payload.quantity * livePrice;
    const requiredMargin = payload.market_type === 'futures' ? notionalValue / (payload.leverage || 1) : notionalValue;

    try {
      const res = await fetch(`${API_BASE}/api/admin/execute-trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: selected.id,
          client_name: selected.name,
          coin: payload.coin,
          market_type: payload.market_type,
          direction: payload.direction,
          order_type: payload.order_type,
          limit_price: payload.limit_price,
          entry_price: livePrice,
          amount: requiredMargin,
          quantity: payload.quantity,
          investment_amount_inr: payload.investment_amount_inr ?? null,
          leverage: payload.market_type === 'futures' ? payload.leverage : 1,
          position_size: notionalValue,
          tp_pct: payload.tp_sl_mode === 'percentage' ? payload.take_profit : null,
          tp_points: payload.tp_sl_mode === 'points' ? payload.take_profit : null,
          sl_pct: payload.tp_sl_mode === 'percentage' ? payload.stop_loss : null,
          sl_points: payload.tp_sl_mode === 'points' ? payload.stop_loss : null,
          trailing_stop: payload.trailing_stop,
          trailing_distance_pct: payload.trailing_stop ? payload.trailing_distance : null,
          rr_ratio: payload.rr_ratio,
          max_trades_per_day: payload.max_trades_per_day,
          max_daily_loss: payload.max_daily_loss,
          max_daily_profit: payload.max_daily_profit,
          use_indicator: payload.use_indicator,
          indicator: payload.indicator,
          source: 'AI Generated',
          executed_by: user?.email ?? 'Master Admin',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          console.log('[Admin] Strategy trade executed for client:', selected.name, data.live_order_placed ? '(LIVE)' : '(PAPER)');
        }
      }
    } catch (e) {
      console.error('Trade execution error:', e);
    }

    setExecutingTrade(false);
    setTradeSuccessMsg(true);
    setTimeout(() => {
      closeModal();
      setTradeSuccessMsg(false);
    }, 2000);
  };

  // ─── Impersonate: generate token and open user panel ───────────────────────
  const handleImpersonate = async () => {
    if (!selected) return;
    setActionLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/admin/impersonate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: selected.id }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.redirect_url) {
          // Store impersonation token in localStorage for the user panel to pick up
          localStorage.setItem('impersonate_token', data.token);
          localStorage.setItem('impersonate_client_id', selected.id);
          localStorage.setItem('impersonate_client_email', selected.email);

          // Open user panel in a new tab
          const userPanelUrl = `${window.location.origin.replace(':5174', ':5173').replace(':5175', ':5173')}/?impersonate=${data.token}`;
          setImpersonateUrl(userPanelUrl);
          window.open(userPanelUrl, '_blank');
        }
      }
    } catch (e) {
      console.error('Impersonate error:', e);
    }

    setActionLoading(false);
  };

  const toggleStrategy = (s: string) => {
    setEditStrategies(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const toggleIndicator = (ind: string) => {
    setEditIndicators(prev => prev.includes(ind) ? prev.filter(x => x !== ind) : [...prev, ind]);
  };

  const licenseExpired = (date: string) => new Date(date) < new Date();
  const daysUntilExpiry = (date: string) => Math.ceil((new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Section 1: Client Database */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-neon-cyan" />
            <h2 className="text-xl font-bold text-white">Client Management</h2>
          </div>
          <p className="text-sm text-slate-400">Full client database — funds, PnL, running trades, license validity, and impersonation access</p>
        </div>
        <button
          onClick={() => { setShowAddClient(true); setAddClientError(null); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30 hover:neon-glow-cyan text-sm font-semibold transition-all whitespace-nowrap"
        >
          <Plus className="w-4 h-4" /> Add Client
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat label="Total Clients" value={stats.total.toString()} icon={Users} color="text-neon-cyan" />
        <MiniStat label="Active" value={stats.active.toString()} icon={Check} color="text-neon-green" />
        <MiniStat label="Suspended" value={stats.suspended.toString()} icon={AlertTriangle} color="text-neon-amber" />
        <MiniStat label="Banned" value={stats.banned.toString()} icon={Shield} color="text-neon-red" />
      </div>

      {/* Search + sort */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, plan, or country..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-cyan/40 transition-colors" />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 px-3 py-2 rounded-xl glass whitespace-nowrap">
          <span>Sort:</span>
          <span className="text-neon-cyan font-semibold capitalize">{sortField.replace(/([A-Z])/g, ' $1').trim()}</span>
          <button onClick={() => toggleSort(sortField)} className="text-slate-400 hover:text-white">
            {sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Client Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-slate-500">
                <th className="text-left py-3 px-4 font-semibold">Client Name</th>
                <th className="text-right py-3 px-4 font-semibold cursor-pointer select-none hover:text-slate-300" onClick={() => toggleSort('totalFunds')}>
                  <span className="inline-flex items-center gap-1">Total Funds {sortField === 'totalFunds' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</span>
                </th>
                <th className="text-right py-3 px-4 font-semibold cursor-pointer select-none hover:text-slate-300" onClick={() => toggleSort('unrealizedPnl')}>
                  <span className="inline-flex items-center gap-1">Current PnL {sortField === 'unrealizedPnl' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</span>
                </th>
                <th className="text-center py-3 px-4 font-semibold cursor-pointer select-none hover:text-slate-300" onClick={() => toggleSort('activeBots')}>
                  <span className="inline-flex items-center gap-1">Active Trades {sortField === 'activeBots' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</span>
                </th>
                <th className="text-center py-3 px-4 font-semibold cursor-pointer select-none hover:text-slate-300" onClick={() => toggleSort('licenseValidUntil')}>
                  <span className="inline-flex items-center gap-1">License Validity {sortField === 'licenseValidUntil' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</span>
                </th>
                <th className="text-center py-3 px-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingClients ? (
                <tr>
                  <td colSpan={6} className="py-12">
                    <div className="flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-neon-cyan animate-spin" />
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12">
                    <div className="flex flex-col items-center justify-center text-center">
                      <Users className="w-10 h-10 text-slate-600 mb-2" />
                      <p className="text-sm text-slate-500">No clients found.</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(c => {
                const expired = licenseExpired(c.licenseValidUntil);
                const days = daysUntilExpiry(c.licenseValidUntil);
                const PlanIcon = planConfig[c.plan]?.icon ?? Zap;
                return (
                  <tr key={c.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group">
                    {/* Client Name */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.06] flex items-center justify-center text-[10px] font-bold text-slate-300 flex-shrink-0">
                          {c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white text-sm truncate">{c.name}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] text-slate-500 truncate">{c.email}</p>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <PlanIcon className={`w-3 h-3 ${planConfig[c.plan]?.color ?? 'text-slate-400'}`} />
                            <span className={`text-[10px] font-semibold ${planConfig[c.plan]?.color ?? 'text-slate-400'}`}>{c.plan}</span>
                            <span className="text-slate-700">·</span>
                            <span className="text-[10px] text-slate-600">{c.country}</span>
                            <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-bold border ${statusConfig[c.status]} capitalize`}>{c.status}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* Total Funds */}
                    <td className="py-3.5 px-4 text-right font-mono text-slate-200 text-sm">{formatCurrency(c.totalFunds)}</td>
                    {/* Current PnL */}
                    <td className="py-3.5 px-4 text-right">
                      <span className={`font-mono font-semibold text-sm ${c.unrealizedPnl >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                        <span className="inline-flex items-center gap-1 justify-end">
                          {c.unrealizedPnl >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                          {c.unrealizedPnl >= 0 ? '+' : ''}{formatCurrency(c.unrealizedPnl)}
                        </span>
                      </span>
                    </td>
                    {/* Active Trades */}
                    <td className="py-3.5 px-4 text-center">
                      <span className={`font-mono font-semibold ${c.activeBots > 0 ? 'text-neon-cyan' : 'text-slate-600'}`}>
                        {c.activeBots}
                      </span>
                      <span className="text-[10px] text-slate-600 ml-1">/ {c.botLimit}</span>
                    </td>
                    {/* License Validity */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex flex-col items-center">
                        <span className={`text-xs font-mono ${expired ? 'text-neon-red' : days <= 30 ? 'text-neon-amber' : 'text-slate-300'}`}>
                          {new Date(c.licenseValidUntil).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-bold ${licenseCycleConfig[c.licenseCycle].badge} mt-0.5`}>
                          {licenseCycleConfig[c.licenseCycle].label}
                        </span>
                        {expired && <span className="text-[8px] text-neon-red font-bold mt-0.5">EXPIRED</span>}
                        {!expired && days <= 30 && <span className="text-[8px] text-neon-amber font-bold mt-0.5">{days}d left</span>}
                      </div>
                    </td>
                    {/* Actions */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <ActionButton icon={History} label="Trade History" color="text-neon-amber hover:bg-neon-amber/10" onClick={() => openHistory(c)} />
                        <ActionButton icon={Zap} label="Execute Trade" color="text-neon-cyan hover:bg-neon-cyan/10" onClick={() => openTrade(c)} />
                        <ActionButton icon={Pencil} label="Edit Client" color="text-neon-cyan hover:bg-neon-cyan/10" onClick={() => openEdit(c)} />
                        <ActionButton icon={KeyRound} label="License" color="text-neon-amber hover:bg-neon-amber/10" onClick={() => openLicense(c)} />
                        {canViewApiKeys && (
                          <ActionButton icon={Eye} label="View Broker Keys" color="text-neon-cyan hover:bg-neon-cyan/10" onClick={() => openBrokerKeys(c)} />
                        )}
                        <ActionButton icon={Trash2} label="Remove" color="text-neon-red hover:bg-neon-red/10" onClick={() => openRemove(c)} />
                        <ActionButton icon={LogIn} label="Access Panel" color="text-neon-green hover:bg-neon-green/10" onClick={() => openImpersonate(c)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Section 2: License & Subscription Manager ===== */}
      <div className="pt-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-5 h-5 text-neon-amber" />
          <h2 className="text-xl font-bold text-white">License & Subscription Manager</h2>
        </div>
        <p className="text-sm text-slate-400">Assign subscription cycles, bot limits, and unlock premium strategies & indicators per client</p>
      </div>

      {/* Plan tier cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { tier: 'Starter', botLimit: 2, color: 'text-neon-cyan', border: 'border-neon-cyan/30', bg: 'bg-neon-cyan/10', strategies: 2, indicators: 2, count: stats.starter },
          { tier: 'Pro', botLimit: 10, color: 'text-neon-green', border: 'border-neon-green/30', bg: 'bg-neon-green/10', strategies: 5, indicators: 4, count: stats.pro },
          { tier: 'Enterprise', botLimit: 25, color: 'text-neon-amber', border: 'border-neon-amber/30', bg: 'bg-neon-amber/10', strategies: 7, indicators: 8, count: stats.enterprise },
        ].map(plan => (
          <div key={plan.tier} className={`glass-card p-5 relative overflow-hidden ${plan.border}`}>
            <div className={`absolute -top-10 -right-10 w-28 h-28 ${plan.bg} rounded-full blur-3xl opacity-40`} />
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-base font-bold ${plan.color}`}>{plan.tier}</h3>
                <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${plan.bg} ${plan.color}`}>
                  {plan.count} users
                </span>
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 flex items-center gap-1.5"><Bot className="w-3.5 h-3.5" /> Bot Limit</span>
                  <span className={`font-mono font-bold ${plan.color}`}>{plan.botLimit}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Strategies</span>
                  <span className={`font-mono font-bold ${plan.color}`}>{plan.strategies} unlocked</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Indicators</span>
                  <span className={`font-mono font-bold ${plan.color}`}>{plan.indicators} unlocked</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ===== MODALS ===== */}

      {/* Client Trade History Modal */}
      {modalMode === 'history' && selected && (
        <ModalShell onClose={closeModal} title={`Trade History — ${selected.name}`} icon={History} accent="amber" wide>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] text-xs">
              <div>
                <span className="text-slate-400">Client Email:</span> <strong className="text-white">{selected.email}</strong>
              </div>
              <div>
                <span className="text-slate-400">Wallet Balance:</span> <strong className="text-neon-cyan">{formatCurrency(selected.totalFunds)}</strong>
              </div>
            </div>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
              {loadingTrades ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-neon-cyan animate-spin" />
                </div>
              ) : clientTrades.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <History className="w-8 h-8 text-slate-600 mb-2" />
                  <p className="text-xs text-slate-500">No trades found for this client.</p>
                </div>
              ) : clientTrades.map(trade => (
                <div key={trade.id} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${trade.direction === 'long' ? 'bg-neon-green/15 text-neon-green' : 'bg-neon-red/15 text-neon-red'}`}>
                      {trade.direction} {trade.coin}
                    </span>
                    <div>
                      <p className="text-white font-semibold">{trade.market_type.toUpperCase()} · {trade.leverage}x</p>
                      <p className="text-[10px] text-slate-500">Entry: ${Number(trade.entry_price).toLocaleString()} · Qty: {Number(trade.quantity).toFixed(4)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold capitalize text-slate-300">{trade.status.replace('_', ' ')}</p>
                    <p className="text-[10px] text-slate-400">{new Date(trade.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-white/[0.06]">
              <button
                onClick={closeModal}
                className="w-full py-2.5 rounded-xl glass hover:bg-white/[0.07] text-sm text-slate-300 font-semibold transition-all"
              >
                Close History
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Edit Client Modal */}
      {modalMode === 'edit' && selected && (
        <ModalShell onClose={closeModal} title="Edit Client" icon={UserCog} accent="cyan" wide>
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03]">
              <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.06] flex items-center justify-center text-xs font-bold text-slate-300">
                {selected.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">{selected.name}</p>
                <p className="text-[10px] text-slate-500">{selected.email}</p>
              </div>
              <span className={`px-2 py-1 rounded-md text-[10px] font-bold border ${statusConfig[selected.status]} capitalize`}>{selected.status}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Client Name">
                <input defaultValue={selected.name} className="modal-input" readOnly />
              </Field>
              <Field label="Email">
                <input defaultValue={selected.email} className="modal-input" readOnly />
              </Field>
              <Field label="Country">
                <input value={editCountry} onChange={e => setEditCountry(e.target.value)} className="modal-input" />
              </Field>
              <Field label="Status">
                <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className="modal-input">
                  <option value="active" className="bg-base-850">Active</option>
                  <option value="suspended" className="bg-base-850">Suspended</option>
                  <option value="banned" className="bg-base-850">Banned</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <InfoBox label="Total Funds" value={formatCurrency(selected.totalFunds)} icon={DollarSign} color="text-neon-cyan" />
              <InfoBox label="Active Bots" value={`${selected.activeBots}/${selected.botLimit}`} icon={Bot} color="text-neon-amber" />
            </div>

            <div className="pt-2 border-t border-white/[0.06]">
              <div className="flex items-center gap-2 mb-1">
                <KeyRound className="w-4 h-4 text-neon-amber" />
                <h3 className="text-sm font-bold text-white">Subscription Management</h3>
              </div>
              <p className="text-[11px] text-slate-500 mb-4">Instantly change the client's plan tier and extend their subscription validity</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Current Plan</p>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const PCIcon = planConfig[selected.plan]?.icon ?? Zap;
                      return <PCIcon className={`w-4 h-4 ${planConfig[selected.plan]?.color ?? 'text-slate-400'}`} />;
                    })()}
                    <span className={`text-sm font-bold ${planConfig[selected.plan]?.color ?? 'text-slate-300'}`}>{selected.plan}</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-neon-amber/5 border border-neon-amber/15">
                  <p className="text-[10px] text-neon-amber/70 uppercase mb-1">Current Expiry</p>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-neon-amber" />
                    <span className="text-sm font-mono text-slate-200">
                      {new Date(selected.licenseValidUntil).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-2 block">Change Plan Tier</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { tier: 'Starter', icon: Zap, color: 'text-neon-cyan', bg: 'bg-neon-cyan/10', border: 'border-neon-cyan/40', desc: '2 bots' },
                    { tier: 'Pro', icon: Rocket, color: 'text-neon-green', bg: 'bg-neon-green/10', border: 'border-neon-green/40', desc: '8 bots' },
                    { tier: 'Enterprise', icon: Crown, color: 'text-neon-amber', bg: 'bg-neon-amber/10', border: 'border-neon-amber/40', desc: '25 bots' },
                  ].map(plan => {
                    const PIcon = plan.icon;
                    const isSelected = editPlan === plan.tier;
                    return (
                      <button
                        key={plan.tier}
                        onClick={() => setEditPlan(plan.tier)}
                        className={`relative p-3 rounded-xl border text-center transition-all overflow-hidden ${
                          isSelected ? `${plan.bg} ${plan.border}` : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12]'
                        }`}
                      >
                        <PIcon className={`w-5 h-5 mx-auto mb-1.5 ${isSelected ? plan.color : 'text-slate-400'}`} />
                        <p className={`text-xs font-bold ${isSelected ? plan.color : 'text-slate-300'}`}>{plan.tier}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5">{plan.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4">
                <label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-2 block flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Extend Subscription
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => setExtendMonths(Math.max(0, extendMonths - 1))}
                    className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-300 hover:bg-white/[0.07] flex items-center justify-center transition-all active:scale-90"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <div className="flex-1 h-9 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                    <span className="text-sm font-bold text-neon-amber font-mono">+{extendMonths} month{extendMonths !== 1 ? 's' : ''}</span>
                  </div>
                  <button
                    onClick={() => setExtendMonths(Math.min(36, extendMonths + 1))}
                    className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-300 hover:bg-white/[0.07] flex items-center justify-center transition-all active:scale-90"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <ModalButtons
              onCancel={closeModal}
              onConfirm={saveEdit}
              confirmLabel={actionLoading ? 'Saving...' : 'Save Changes'}
              confirmAccent="cyan"
            />
          </div>
        </ModalShell>
      )}

      {/* License Manager Modal */}
      {modalMode === 'license' && selected && (
        <ModalShell onClose={closeModal} title="License & Subscription Manager" icon={KeyRound} accent="amber" wide>
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-neon-amber/5 border border-neon-amber/15">
              <div className="w-10 h-10 rounded-xl bg-neon-amber/10 border border-neon-amber/20 flex items-center justify-center text-xs font-bold text-neon-amber">
                {selected.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">{selected.name}</p>
                <p className="text-[10px] text-slate-500">{selected.email} · {selected.plan}</p>
              </div>
              <span className={`px-2 py-1 rounded-md text-[10px] font-bold border ${statusConfig[selected.status]} capitalize`}>{selected.status}</span>
            </div>

            <div>
              <label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-2 block">Subscription Cycle</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(licenseCycleConfig) as LicenseCycle[]).map(cycle => (
                  <button
                    key={cycle}
                    onClick={() => setEditCycle(cycle)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      editCycle === cycle
                        ? `${licenseCycleConfig[cycle].badge} border border-current`
                        : 'glass text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    {licenseCycleConfig[cycle].label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-2 block">
                Bot Limit: <span className="text-neon-amber">{editBotLimit}</span> bots max
              </label>
              <div className="flex items-center gap-3">
                <button onClick={() => setEditBotLimit(Math.max(1, editBotLimit - 1))} className="w-9 h-9 rounded-xl glass hover:bg-white/[0.08] text-slate-300 flex items-center justify-center transition-all active:scale-90">
                  <ChevronDown className="w-4 h-4" />
                </button>
                <div className="flex-1 h-9 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                  <span className="text-lg font-bold text-neon-amber font-mono">{editBotLimit}</span>
                </div>
                <button onClick={() => setEditBotLimit(Math.min(50, editBotLimit + 1))} className="w-9 h-9 rounded-xl glass hover:bg-white/[0.08] text-slate-300 flex items-center justify-center transition-all active:scale-90">
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-2 block">License Valid Until</label>
              <input
                type="date"
                value={editValidUntil}
                onChange={e => setEditValidUntil(e.target.value)}
                className="modal-input"
              />
            </div>

            {/* Smart Bot Allotment Link */}
            <div className="p-3 rounded-xl bg-neon-cyan/5 border border-neon-cyan/15 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center flex-shrink-0">
                <KeyRound className="w-4 h-4 text-neon-cyan" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-white">Smart Bot License Allotment</p>
                <p className="text-[10px] text-slate-500">Assign specific AI trading bots to this client</p>
              </div>
              <button
                onClick={() => {
                  closeModal();
                  // Navigate to Smart Bots page with this client pre-selected
                  window.location.hash = `#allot-${selected.id}`;
                }}
                className="flex items-center gap-1 text-[11px] font-semibold text-neon-cyan hover:text-white transition-colors flex-shrink-0"
              >
                Open <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            <ModalButtons
              onCancel={closeModal}
              onConfirm={saveLicense}
              confirmLabel={actionLoading ? 'Saving...' : 'Save License'}
              confirmAccent="amber"
            />
          </div>
        </ModalShell>
      )}

      {/* Impersonate Modal */}
      {modalMode === 'impersonate' && selected && (
        <ModalShell onClose={closeModal} title="Access Client Panel" icon={LogIn} accent="green">
          <div className="space-y-4">
            <div className="flex items-center justify-center p-4 rounded-xl bg-neon-amber/5 border border-neon-amber/20">
              <div className="flex items-center gap-2 text-neon-amber">
                <Shield className="w-5 h-5" />
                <span className="text-xs font-bold">ADMIN IMPERSONATION MODE</span>
              </div>
            </div>
            <p className="text-sm text-slate-300 text-center">
              You are about to log in as <span className="font-bold text-white">{selected.name}</span> and access their full trading panel.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <InfoBox label="Current Funds" value={formatCurrency(selected.totalFunds)} icon={DollarSign} color="text-neon-cyan" />
              <InfoBox label="Active Bots" value={`${selected.activeBots}/${selected.botLimit}`} icon={Bot} color="text-neon-amber" />
              <InfoBox label="Unrealized PnL" value={`${selected.unrealizedPnl >= 0 ? '+' : ''}${formatCurrency(selected.unrealizedPnl)}`} icon={selected.unrealizedPnl >= 0 ? TrendingUp : TrendingDown} color={selected.unrealizedPnl >= 0 ? 'text-neon-green' : 'text-neon-red'} />
              <InfoBox label="License" value={licenseCycleConfig[selected.licenseCycle].label} icon={Calendar} color="text-neon-amber" />
            </div>

            {impersonateUrl && (
              <div className="p-3 rounded-xl bg-neon-green/5 border border-neon-green/20 flex items-center gap-2">
                <Check className="w-4 h-4 text-neon-green flex-shrink-0" />
                <p className="text-xs text-neon-green font-semibold">Panel opened in a new tab.</p>
              </div>
            )}

            <ModalButtons
              onCancel={closeModal}
              onConfirm={handleImpersonate}
              confirmLabel={actionLoading ? 'Generating Access...' : 'Access Panel'}
              confirmAccent="green"
            />
          </div>
        </ModalShell>
      )}

      {/* Remove Client Modal */}
      {modalMode === 'remove' && selected && (
        <ModalShell onClose={closeModal} title="Remove Client" icon={Trash2} accent="red">
          <div className="space-y-4">
            <div className="flex items-center justify-center p-4 rounded-xl bg-neon-red/5 border border-neon-red/20">
              <div className="flex items-center gap-2 text-neon-red">
                <AlertTriangle className="w-5 h-5" />
                <span className="text-xs font-bold">DANGER ZONE</span>
              </div>
            </div>
            <p className="text-sm text-slate-300 text-center">
              Are you sure you want to permanently remove <span className="font-bold text-white">{selected.name}</span> from the platform?
            </p>
            <p className="text-[10px] text-slate-500 text-center">This will set their account status to "Banned". Their data is preserved but access is revoked.</p>
            <ModalButtons
              onCancel={closeModal}
              onConfirm={removeClient}
              confirmLabel={actionLoading ? 'Removing...' : 'Remove Permanently'}
              confirmAccent="red"
            />
          </div>
        </ModalShell>
      )}

      {/* ===== BROKER KEYS MODAL ===== */}
      {modalMode === 'brokerKeys' && selected && (
        <ModalShell onClose={closeModal} title={`Broker API Keys — ${selected.name}`} icon={Eye} accent="cyan" wide>
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-neon-amber/5 border border-neon-amber/15">
              <Shield className="w-4 h-4 text-neon-amber flex-shrink-0" />
              <p className="text-[11px] text-neon-amber font-semibold">
                These are decrypted API keys. Handle with care — do not share or store outside this panel.
              </p>
            </div>

            {loadingBrokerKeys ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-neon-cyan animate-spin" />
              </div>
            ) : brokerKeys.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <KeyRound className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-xs text-slate-500">No broker connections found for this client.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[55vh] overflow-y-auto scrollbar-thin">
                {brokerKeys.map((bk) => (
                  <div key={bk.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.06] flex items-center justify-center text-[10px] font-bold text-slate-300">
                          {bk.exchange_name.slice(0, 3).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">{bk.exchange_name}</p>
                          <p className="text-[10px] text-slate-500">Connected {new Date(bk.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {bk.is_connected && (
                          <button
                            onClick={() => disconnectBrokerKey(bk.id)}
                            disabled={actionLoading}
                            className="px-2.5 py-1 rounded-md text-[10px] font-bold border bg-neon-red/10 text-neon-red border-neon-red/20 hover:bg-neon-red/20 transition-all flex items-center gap-1"
                          >
                            {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            Disconnect
                          </button>
                        )}
                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold border ${bk.is_connected ? 'text-neon-green bg-neon-green/10 border-neon-green/20' : 'text-slate-500 bg-slate-500/10 border-slate-500/20'}`}>
                          {bk.is_connected ? 'Connected' : 'Disconnected'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neon-cyan/5 border border-neon-cyan/15">
                      <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">Exchange:</span>
                      <span className="text-sm font-bold text-neon-cyan">{bk.exchange_name}</span>
                      {bk.exchange_id && (
                        <span className="text-[10px] text-slate-500 font-mono">({bk.exchange_id})</span>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1.5 block">API Key</label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 px-3 py-2.5 rounded-lg bg-base-900/50 border border-white/[0.06] text-xs text-white font-mono break-all">
                          {bk.api_key || '—'}
                        </div>
                        {bk.api_key && (
                          <button
                            onClick={() => copyToClipboard(bk.api_key, `key-${bk.id}`)}
                            className="p-2.5 rounded-lg glass hover:bg-neon-cyan/10 text-slate-400 hover:text-neon-cyan transition-all flex-shrink-0"
                            title="Copy API Key"
                          >
                            {copiedField === `key-${bk.id}` ? <Check className="w-4 h-4 text-neon-green" /> : <Copy className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1.5 block">API Secret</label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 px-3 py-2.5 rounded-lg bg-base-900/50 border border-white/[0.06] text-xs text-white font-mono break-all">
                          {bk.api_secret || '—'}
                        </div>
                        {bk.api_secret && (
                          <button
                            onClick={() => copyToClipboard(bk.api_secret, `secret-${bk.id}`)}
                            className="p-2.5 rounded-lg glass hover:bg-neon-cyan/10 text-slate-400 hover:text-neon-cyan transition-all flex-shrink-0"
                            title="Copy API Secret"
                          >
                            {copiedField === `secret-${bk.id}` ? <Check className="w-4 h-4 text-neon-green" /> : <Copy className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-white/[0.06]">
              <button
                onClick={closeModal}
                className="w-full py-2.5 rounded-xl glass hover:bg-white/[0.07] text-sm text-slate-300 font-semibold transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* ===== STRATEGY BUILDER TRADE MODAL ===== */}
      {modalMode === 'trade' && selected && (
        <ModalShell onClose={closeModal} title="Strategy Builder — Execute Trade" icon={Zap} accent="cyan" wide>
          {tradeSuccessMsg ? (
            <div className="py-12 text-center space-y-3 animate-fade-in">
              <div className="w-12 h-12 rounded-full bg-neon-green/20 border border-neon-green/40 text-neon-green flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-white">Strategy Executed Successfully!</h4>
              <p className="text-xs text-slate-400">Position has been opened on {selected.name}'s account.</p>
              <p className="text-[10px] text-neon-cyan font-semibold">Source: AI Generated</p>
            </div>
          ) : (
            <StrategyBuilderForm
              onExecute={handleExecuteStrategyTrade}
              loading={executingTrade}
              clientName={selected.name}
            />
          )}
        </ModalShell>
      )}

      {/* ===== ADD CLIENT MODAL ===== */}
      {showAddClient && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-base-900/80 backdrop-blur-md" onClick={() => setShowAddClient(false)} />
          <div className="relative w-full max-w-lg animate-scale-in max-h-[90vh] overflow-y-auto scrollbar-thin">
            <div className="glass-strong neon-glow-cyan p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-neon-cyan" />
                  <h2 className="text-base font-bold text-white">Add New Client</h2>
                </div>
                <button onClick={() => setShowAddClient(false)} className="text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Account credentials */}
                <div className="space-y-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex items-center gap-2 pb-2 border-b border-white/[0.04]">
                    <Users className="w-3.5 h-3.5 text-neon-cyan" />
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Account Credentials</h3>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold mb-1 block">Full Name (optional)</label>
                    <input
                      type="text"
                      value={newClientName}
                      onChange={e => setNewClientName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-neon-cyan/40 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold mb-1 block">Email Address</label>
                    <input
                      type="email"
                      value={newClientEmail}
                      onChange={e => setNewClientEmail(e.target.value)}
                      placeholder="client@email.com"
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-neon-cyan/40 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-semibold mb-1 block">Password</label>
                    <input
                      type="password"
                      value={newClientPassword}
                      onChange={e => setNewClientPassword(e.target.value)}
                      placeholder="Set a secure password"
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-neon-cyan/40 transition-colors"
                    />
                  </div>
                </div>

                {/* License assignment */}
                <div className="space-y-3 p-4 rounded-xl bg-neon-amber/5 border border-neon-amber/15">
                  <div className="flex items-center gap-2 pb-2 border-b border-white/[0.04]">
                    <KeyRound className="w-3.5 h-3.5 text-neon-amber" />
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">License Assignment</h3>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-2 block">Select Plan</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { tier: 'Starter', icon: Zap, color: 'text-neon-cyan', bg: 'bg-neon-cyan/10', border: 'border-neon-cyan/40', desc: '2 bots' },
                        { tier: 'Pro', icon: Rocket, color: 'text-neon-green', bg: 'bg-neon-green/10', border: 'border-neon-green/40', desc: '10 bots' },
                        { tier: 'Enterprise', icon: Crown, color: 'text-neon-amber', bg: 'bg-neon-amber/10', border: 'border-neon-amber/40', desc: '25 bots' },
                      ].map(plan => {
                        const PIcon = plan.icon;
                        const isSelected = newClientPlan === plan.tier;
                        return (
                          <button
                            key={plan.tier}
                            onClick={() => {
                              setNewClientPlan(plan.tier);
                              const limits: Record<string, number> = { Starter: 2, Pro: 10, Enterprise: 25 };
                              setNewClientBotLimit(limits[plan.tier]);
                            }}
                            className={`relative p-3 rounded-xl border text-center transition-all ${
                              isSelected ? `${plan.bg} ${plan.border}` : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12]'
                            }`}
                          >
                            <PIcon className={`w-5 h-5 mx-auto mb-1.5 ${isSelected ? plan.color : 'text-slate-400'}`} />
                            <p className={`text-xs font-bold ${isSelected ? plan.color : 'text-slate-300'}`}>{plan.tier}</p>
                            <p className="text-[9px] text-slate-500 mt-0.5">{plan.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-slate-500 font-semibold mb-1 block">Bot Limit</label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={newClientBotLimit}
                        onChange={e => setNewClientBotLimit(Number(e.target.value))}
                        className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white font-mono focus:outline-none focus:border-neon-amber/40 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 font-semibold mb-1 block">Valid Until</label>
                      <input
                        type="date"
                        value={newClientValidUntil}
                        onChange={e => setNewClientValidUntil(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-neon-amber/40 transition-colors"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">If left blank, validity defaults to 30 days from today.</p>
                </div>

                {addClientError && (
                  <div className="p-3 rounded-xl bg-neon-red/5 border border-neon-red/20 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-neon-red flex-shrink-0" />
                    <p className="text-xs text-neon-red">{addClientError}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowAddClient(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl glass hover:bg-white/[0.07] text-sm text-slate-300 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddClient}
                    disabled={!newClientEmail.trim() || !newClientPassword.trim() || addingClient}
                    className={`flex-1 px-4 py-2.5 rounded-xl border font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                      newClientEmail.trim() && newClientPassword.trim() && !addingClient
                        ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/40 hover:neon-glow-cyan'
                        : 'bg-white/[0.03] text-slate-500 border border-white/[0.06] cursor-not-allowed'
                    }`}
                  >
                    {addingClient ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Create Client
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

// ===== Helper Components =====

function MiniStat({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof Users; color: string }) {
  return (
    <div className="glass-card p-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div>
        <p className="text-lg font-bold text-white font-mono leading-none">{value}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, color, onClick }: { icon: typeof Pencil; label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`p-2 rounded-lg glass transition-all active:scale-90 ${color}`}
      title={label}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

function ModalShell({ children, onClose, title, icon: Icon, accent, wide }: {
  children: React.ReactNode; onClose: () => void; title: string; icon: typeof Pencil; accent: 'cyan' | 'amber' | 'green' | 'red'; wide?: boolean;
}) {
  const accentColors = {
    cyan: 'neon-glow-cyan',
    amber: 'neon-glow-amber',
    green: 'neon-glow-green',
    red: 'neon-glow-red',
  };
  const iconColors = {
    cyan: 'text-neon-cyan',
    amber: 'text-neon-amber',
    green: 'text-neon-green',
    red: 'text-neon-red',
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-base-900/80 backdrop-blur-md" onClick={onClose} />
      <div className={`relative w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} animate-scale-in max-h-[90vh] overflow-y-auto scrollbar-thin`}>
        <div className={`glass-strong ${accentColors[accent]} p-6`}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Icon className={`w-5 h-5 ${iconColors[accent]}`} />
              <h2 className="text-base font-bold text-white">{title}</h2>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-2 block">{label}</label>
      {children}
    </div>
  );
}

function InfoBox({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof DollarSign; color: string }) {
  return (
    <div className="p-3 rounded-xl glass">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-slate-500 uppercase">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className={`text-sm font-bold font-mono ${color}`}>{value}</p>
    </div>
  );
}

function ModalButtons({ onCancel, onConfirm, confirmLabel, confirmAccent }: {
  onCancel: () => void; onConfirm: () => void; confirmLabel: string; confirmAccent: 'cyan' | 'amber' | 'green' | 'red';
}) {
  const accents = {
    cyan: 'bg-neon-cyan/20 border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan/30',
    amber: 'bg-neon-amber/20 border-neon-amber/40 text-neon-amber hover:bg-neon-amber/30',
    green: 'bg-neon-green/20 border-neon-green/40 text-neon-green hover:bg-neon-green/30',
    red: 'bg-neon-red/20 border-neon-red/40 text-neon-red hover:bg-neon-red/30',
  };
  return (
    <div className="flex gap-3 pt-2">
      <button onClick={onCancel} className="flex-1 px-4 py-2.5 rounded-xl glass hover:bg-white/[0.07] text-sm text-slate-300 transition-all">
        Cancel
      </button>
      <button onClick={onConfirm} className={`flex-1 px-4 py-2.5 rounded-xl border font-semibold text-sm transition-all active:scale-95 ${accents[confirmAccent]}`}>
        {confirmLabel}
      </button>
    </div>
  );
}
