import { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck, Loader2, Plus, Trash2, Crown, User as UserIcon, Check, X,
  Search, ChevronDown, Activity, Bot, KeyRound, AlertTriangle, Zap,
  Power, Settings, TrendingUp, Users, Lock, Clock, Filter,
} from 'lucide-react';
import { supabase, type AdminRole, type AdminActivityLog } from '@cortex/shared/lib/supabase';
import { useAuth } from '@cortex/shared/context/AuthContext';
import { useAdminRbac } from '@/context/AdminRbacContext';

const API_BASE = import.meta.env.VITE_ENGINE_URL || '';

const permissionsList = [
  { key: 'can_edit_bots', label: 'Can Edit Bots', icon: Bot },
  { key: 'can_view_client_pnl', label: 'Can View Client P&L', icon: TrendingUp },
  { key: 'can_manage_licenses', label: 'Can Manage Licenses', icon: KeyRound },
  { key: 'can_use_kill_switch', label: 'Can Use Kill Switch', icon: Power },
  { key: 'can_manage_clients', label: 'Can Manage Clients', icon: Users },
  { key: 'can_manage_risk', label: 'Can Manage Risk', icon: AlertTriangle },
  { key: 'can_manage_settings', label: 'Can Manage Settings', icon: Settings },
  { key: 'can_manage_admins', label: 'Can Manage Admins', icon: ShieldCheck },
];

const roleConfig = {
  super_admin: { label: 'Super Admin', icon: Crown, color: 'text-neon-amber', bg: 'bg-neon-amber/10', border: 'border-neon-amber/30' },
  sub_admin: { label: 'Sub-Admin', icon: UserIcon, color: 'text-neon-cyan', bg: 'bg-neon-cyan/10', border: 'border-neon-cyan/30' },
};

const severityConfig: Record<string, { color: string; bg: string; border: string; glow: string }> = {
  info: { color: 'text-neon-cyan', bg: 'bg-neon-cyan/10', border: 'border-neon-cyan/25', glow: 'shadow-[0_0_8px_rgba(0,229,255,0.3)]' },
  success: { color: 'text-neon-green', bg: 'bg-neon-green/10', border: 'border-neon-green/25', glow: 'shadow-[0_0_8px_rgba(0,255,157,0.3)]' },
  warning: { color: 'text-neon-amber', bg: 'bg-neon-amber/10', border: 'border-neon-amber/25', glow: 'shadow-[0_0_8px_rgba(255,176,32,0.3)]' },
  critical: { color: 'text-neon-red', bg: 'bg-neon-red/10', border: 'border-neon-red/25', glow: 'shadow-[0_0_8px_rgba(255,59,92,0.3)]' },
};

const actionIcons: Record<string, typeof Activity> = {
  bot_create: Bot,
  bot_pause: Bot,
  bot_delete: Trash2,
  license_update: KeyRound,
  client_suspend: Users,
  kill_switch: Power,
  login: ShieldCheck,
  permission_change: Lock,
  risk_update: AlertTriangle,
  settings_change: Settings,
  admin_create: Plus,
  admin_delete: Trash2,
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function defaultPermissions(): Record<string, boolean> {
  const obj: Record<string, boolean> = {};
  permissionsList.forEach(p => { obj[p.key] = false; });
  obj.can_edit_bots = true;
  obj.can_view_client_pnl = true;
  return obj;
}

export default function AdminAdmins() {
  const { user } = useAuth();
  const { isMasterAdmin } = useAdminRbac();
  const [admins, setAdmins] = useState<AdminRole[]>([]);
  const [logs, setLogs] = useState<AdminActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [logFilter, setLogFilter] = useState<string>('all');
  const [logFilterOpen, setLogFilterOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create modal state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [licenseQuota, setLicenseQuota] = useState<number>(10);
  const [role, setRole] = useState<'super_admin' | 'sub_admin'>('sub_admin');
  const [permissions, setPermissions] = useState<Record<string, boolean>>(defaultPermissions);
  const [saving, setSaving] = useState(false);

  // Per-plan quota state
  const quotaPlanOptions = [
    { key: 'demo_1day', label: 'Demo 1-Day', group: 'Demo' },
    { key: 'demo_3day', label: 'Demo 3-Day', group: 'Demo' },
    { key: 'demo_7day', label: 'Demo 7-Day', group: 'Demo' },
    { key: 'regular_1month', label: 'Regular 1-Month', group: 'Regular' },
    { key: 'regular_1year', label: 'Regular 1-Year', group: 'Regular' },
  ];
  const [quotaLedger, setQuotaLedger] = useState<Record<string, number>>({
    demo_1day: 0, demo_3day: 0, demo_7day: 0, regular_1month: 0, regular_1year: 0,
  });

  const setQuotaForPlan = (key: string, val: number) => {
    setQuotaLedger(prev => ({ ...prev, [key]: Math.max(0, val) }));
  };
  const totalQuotaAllocated = Object.values(quotaLedger).reduce((a, b) => a + b, 0);

  const fetchAdmins = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_all_admin_roles');
    if (!error && data) setAdmins(data as AdminRole[]);
  }, []);

  const fetchLogs = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_admin_activity_logs', { p_limit: 50 });
    if (!error && data) setLogs(data as AdminActivityLog[]);
  }, []);

  useEffect(() => {
    Promise.all([fetchAdmins(), fetchLogs()]).then(() => setLoading(false));
  }, [fetchAdmins, fetchLogs]);

  // Realtime: refresh when admin_roles or activity logs change
  useEffect(() => {
    const channel = supabase
      .channel('admin-admins-management')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_roles' }, () => fetchAdmins())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_activity_log' }, () => fetchLogs())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAdmins, fetchLogs]);

  const logAction = async (actionType: string, message: string, severity: 'info' | 'warning' | 'critical' | 'success') => {
    await supabase.rpc('insert_admin_activity_log', {
      p_admin_email: user?.email ?? 'system',
      p_admin_name: user?.email?.split('@')[0] ?? 'System',
      p_action_type: actionType,
      p_message: message,
      p_severity: severity,
    });
    await fetchLogs();
  };

  const togglePermission = (key: string) => {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCreate = async () => {
    if (!email.trim() || !name.trim() || !password.trim()) return;
    setSaving(true);

    // Convert permission booleans to array of allowed keys
    const permissionKeys = Object.entries(permissions)
      .filter(([, v]) => v)
      .map(([k]) => k);

    // Build quota ledger JSONB for the backend
    const ledgerObj: Record<string, { total: number; used: number }> = {};
    for (const [key, val] of Object.entries(quotaLedger)) {
      if (val > 0) ledgerObj[key] = { total: val, used: 0 };
    }

    try {
      const res = await fetch(`${API_BASE}/api/admin/sub-admins/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password: password.trim(),
          license_quota: totalQuotaAllocated || licenseQuota,
          permissions: permissionKeys,
          created_by: user?.id,
          quota_ledger: ledgerObj,
        }),
      });

      const data = await res.json();
      if (data.success) {
        await logAction('admin_create', `${name.trim()} was added as Sub-Admin with ${totalQuotaAllocated} license quota`, 'success');
        await fetchAdmins();
      } else {
        alert(`Failed to create sub-admin: ${data.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      alert(`Failed to create sub-admin: ${e.message || 'Network error'}`);
    }

    setSaving(false);
    setShowCreate(false);
    setName('');
    setEmail('');
    setPassword('');
    setLicenseQuota(10);
    setRole('sub_admin');
    setPermissions(defaultPermissions());
    setQuotaLedger({ demo_1day: 0, demo_3day: 0, demo_7day: 0, regular_1month: 0, regular_1year: 0 });
  };

  const handleDelete = async (admin: AdminRole) => {
    setActionLoading(admin.id);
    await supabase.rpc('delete_admin_role', { p_id: admin.id });
    setAdmins(prev => prev.filter(a => a.id !== admin.id));
    await logAction('admin_delete', `${admin.name ?? admin.email} was removed from admin team`, 'warning');
    setActionLoading(null);
  };

  const toggleActive = async (admin: AdminRole) => {
    const newVal = !admin.is_active;
    setAdmins(prev => prev.map(a => a.id === admin.id ? { ...a, is_active: newVal } : a));
    await supabase.rpc('toggle_admin_role_active', { p_id: admin.id, p_is_active: newVal });
    await logAction('permission_change', `${admin.name ?? admin.email} was ${newVal ? 'activated' : 'deactivated'}`, newVal ? 'success' : 'warning');
  };

  const filteredAdmins = admins.filter(a => {
    const q = search.toLowerCase();
    return a.email.toLowerCase().includes(q) || (a.name ?? '').toLowerCase().includes(q);
  });

  const filteredLogs = logs.filter(l => logFilter === 'all' || l.severity === logFilter);

  const activeAdmins = admins.filter(a => a.is_active).length;
  const superAdmins = admins.filter(a => a.role === 'super_admin').length;
  const subAdmins = admins.filter(a => a.role === 'sub_admin').length;

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-neon-amber animate-spin" /></div>;
  }

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-neon-amber" /> Admin & Role Management
          </h2>
          <p className="text-sm text-slate-400">Sub-admin accounts, granular permissions, and system activity audit trail</p>
        </div>
        {isMasterAdmin && (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neon-amber/15 text-neon-amber border border-neon-amber/30 hover:bg-neon-amber/25 text-sm font-semibold transition-all"
        >
          <Plus className="w-4 h-4" /> Create Sub-Admin
        </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass-card p-4 relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-24 h-24 bg-neon-amber/10 rounded-full blur-2xl opacity-50" />
          <div className="relative">
            <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Total Admins</p>
            <p className="text-xl font-bold text-white font-mono mt-1">{admins.length}</p>
            <p className="text-[10px] text-neon-amber mt-0.5">{activeAdmins} active</p>
          </div>
        </div>
        <div className="glass-card p-4 relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-24 h-24 bg-neon-amber/10 rounded-full blur-2xl opacity-50" />
          <div className="relative">
            <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Super Admins</p>
            <p className="text-xl font-bold text-neon-amber font-mono mt-1">{superAdmins}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Full access</p>
          </div>
        </div>
        <div className="glass-card p-4 relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-24 h-24 bg-neon-cyan/10 rounded-full blur-2xl opacity-50" />
          <div className="relative">
            <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Sub-Admins</p>
            <p className="text-xl font-bold text-neon-cyan font-mono mt-1">{subAdmins}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Scoped access</p>
          </div>
        </div>
        <div className="glass-card p-4 relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-24 h-24 bg-neon-green/10 rounded-full blur-2xl opacity-50" />
          <div className="relative">
            <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Activity Events</p>
            <p className="text-xl font-bold text-white font-mono mt-1">{logs.length}</p>
            <p className="text-[10px] text-neon-green mt-0.5">Logged actions</p>
          </div>
        </div>
      </div>

      {/* Main grid: Admin table + Activity log */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Section 1: Sub-Admin Management Table */}
        <div className="xl:col-span-2 space-y-4">
          <div className="glass-card overflow-hidden">
            {/* Table header with search */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.06]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-neon-amber" /> Sub-Admin Management
              </h3>
              <div className="relative w-40 sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search admins..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white focus:outline-none focus:border-neon-amber/30 transition-colors"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="text-left px-4 py-3 font-semibold">Name</th>
                    <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell">Role</th>
                    <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Last Login</th>
                    <th className="text-center px-4 py-3 font-semibold">Status</th>
                    <th className="text-right px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdmins.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-slate-500">
                        <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-slate-700" />
                        <p className="text-sm">No admins found.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredAdmins.map(admin => {
                      const rc = roleConfig[admin.role];
                      const RIcon = rc.icon;
                      const perms = admin.permissions ?? {};
                      const activePerms = permissionsList.filter(p => perms[p.key]).length;
                      return (
                        <tr key={admin.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          {/* Name + Email */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-lg ${rc.bg} ${rc.border} border flex items-center justify-center flex-shrink-0`}>
                                <RIcon className={`w-4.5 h-4.5 ${rc.color}`} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-white truncate">{admin.name ?? admin.email.split('@')[0]}</p>
                                <p className="text-[10px] text-slate-500 truncate">{admin.email}</p>
                              </div>
                            </div>
                          </td>
                          {/* Role */}
                          <td className="px-4 py-3.5 hidden sm:table-cell">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md ${rc.bg} ${rc.border} border text-[11px] font-semibold ${rc.color}`}>
                              <RIcon className="w-3 h-3" /> {rc.label}
                            </span>
                            <p className="text-[10px] text-slate-500 mt-1">{activePerms}/{permissionsList.length} permissions</p>
                            {admin.role === 'sub_admin' && (admin as any).quota_ledger && Object.keys((admin as any).quota_ledger).length > 0 && (
                              <p className="text-[10px] text-neon-cyan mt-0.5 font-mono">
                                {Object.entries((admin as any).quota_ledger).reduce((sum, [, v]: any) => sum + (v.total - (v.used || 0)), 0)} licenses left
                              </p>
                            )}
                          </td>
                          {/* Last Login */}
                          <td className="px-4 py-3.5 hidden md:table-cell">
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                              <Clock className="w-3 h-3 text-slate-500" />
                              {admin.last_login ? formatRelativeTime(admin.last_login) : 'Never'}
                            </div>
                          </td>
                          {/* Status */}
                          <td className="px-4 py-3.5 text-center">
                            <button
                              onClick={() => toggleActive(admin)}
                              disabled={actionLoading === admin.id}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all ${
                                admin.is_active
                                  ? 'text-neon-green bg-neon-green/10 border-neon-green/25 hover:bg-neon-green/20'
                                  : 'text-slate-500 bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]'
                              }`}
                            >
                              <div className={`w-1.5 h-1.5 rounded-full ${admin.is_active ? 'bg-neon-green animate-pulse' : 'bg-slate-600'}`} />
                              {admin.is_active ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                          {/* Actions */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center justify-end gap-1.5">
                              {admin.user_id !== user?.id && isMasterAdmin && (
                                <button
                                  onClick={() => handleDelete(admin)}
                                  disabled={actionLoading === admin.id}
                                  className="w-8 h-8 rounded-lg bg-neon-red/10 text-neon-red border border-neon-red/20 hover:bg-neon-red/20 transition-all flex items-center justify-center"
                                  title="Remove Admin"
                                >
                                  {actionLoading === admin.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                              )}
                              {admin.user_id === user?.id && (
                                <span className="text-[10px] text-slate-600 italic px-2">You</span>
                              )}
                              {!isMasterAdmin && admin.user_id !== user?.id && (
                                <span className="text-[10px] text-slate-600 italic px-2">View only</span>
                              )}
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

          {/* Permissions legend for selected admin */}
          {filteredAdmins.length > 0 && (
            <div className="glass-card p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-3">Permission Breakdown</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {permissionsList.map(p => {
                  const PIcon = p.icon;
                  const grantedCount = admins.filter(a => a.permissions?.[p.key]).length;
                  return (
                    <div key={p.key} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <PIcon className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-400 truncate">{p.label}</p>
                        <p className="text-[10px] font-mono text-slate-600">{grantedCount} admin{grantedCount !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Section 2: System Activity Log Timeline */}
        <div className="xl:col-span-1">
          <div className="glass-card overflow-hidden h-full flex flex-col">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.06]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-neon-cyan" /> Activity Log
              </h3>
              {/* Severity filter */}
              <div className="relative">
                <button
                  onClick={() => setLogFilterOpen(!logFilterOpen)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[11px] text-slate-400 hover:text-slate-200 transition-all"
                >
                  <Filter className="w-3 h-3" />
                  {logFilter === 'all' ? 'All' : logFilter}
                  <ChevronDown className="w-3 h-3" />
                </button>
                {logFilterOpen && (
                  <div className="absolute right-0 top-full mt-1 z-30 glass-strong rounded-xl p-1.5 min-w-[120px] animate-scale-in">
                    {['all', 'info', 'success', 'warning', 'critical'].map(f => (
                      <button
                        key={f}
                        onClick={() => { setLogFilter(f); setLogFilterOpen(false); }}
                        className={`w-full text-left px-3 py-1.5 rounded-lg text-[11px] capitalize transition-all ${
                          logFilter === f ? 'bg-neon-cyan/10 text-neon-cyan' : 'text-slate-400 hover:bg-white/[0.04]'
                        }`}
                      >
                        {f === 'all' ? 'All Events' : f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Timeline */}
            <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3 max-h-[600px]">
              {filteredLogs.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <Activity className="w-8 h-8 mx-auto mb-2 text-slate-700" />
                  <p className="text-sm">No activity logged yet.</p>
                </div>
              ) : (
                filteredLogs.map((log, idx) => {
                  const sev = severityConfig[log.severity] ?? severityConfig.info;
                  const LIcon = actionIcons[log.action_type] ?? Activity;
                  return (
                    <div key={log.id} className="relative flex gap-3 group">
                      {/* Timeline line */}
                      {idx < filteredLogs.length - 1 && (
                        <div className="absolute left-[15px] top-8 bottom-[-12px] w-px bg-white/[0.06]" />
                      )}
                      {/* Icon node */}
                      <div className={`relative z-10 w-8 h-8 rounded-lg ${sev.bg} ${sev.border} border flex items-center justify-center flex-shrink-0 ${sev.glow} group-hover:scale-110 transition-transform`}>
                        <LIcon className={`w-4 h-4 ${sev.color}`} />
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0 pb-1">
                        <p className="text-xs text-slate-200 leading-relaxed">{log.message}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10px] text-slate-500">{log.admin_name ?? log.admin_email}</span>
                          <span className="text-[10px] text-slate-600">·</span>
                          <span className="text-[10px] text-slate-500">{formatRelativeTime(log.created_at)}</span>
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${sev.bg} ${sev.color} border ${sev.border}`}>
                            {log.severity}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create Sub-Admin Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="absolute inset-0 bg-base-900/85 backdrop-blur-md" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-xl animate-scale-in">
            <div className="glass-strong neon-glow-amber max-h-[92vh] overflow-y-auto scrollbar-thin rounded-2xl">
              {/* Header */}
              <div className="sticky top-0 bg-base-800/90 backdrop-blur-xl border-b border-white/[0.06] px-5 sm:px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-neon-amber/10 border border-neon-amber/30 flex items-center justify-center">
                    <Plus className="w-5 h-5 text-neon-amber" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">Create Sub-Admin</h2>
                    <p className="text-[11px] text-slate-500">Assign access rights and role</p>
                  </div>
                </div>
                <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/[0.06]">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 sm:px-6 py-5 space-y-5">
                {/* Name + Email + Password */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Full Name</label>
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g. Vinod Sharma"
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-neon-amber/40 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Email</label>
                    <input
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="admin@cortex.ai"
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-neon-amber/40 transition-colors"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Set a secure password"
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-neon-amber/40 transition-colors"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-slate-400 mb-1.5 block font-semibold flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5" /> License Quota — Per Plan Allocation
                    </label>
                    <div className="space-y-2.5">
                      {/* Demo plans */}
                      <div>
                        <p className="text-[10px] text-neon-cyan font-semibold mb-1.5 uppercase tracking-wider">Demo Licenses</p>
                        <div className="grid grid-cols-3 gap-2">
                          {quotaPlanOptions.filter(p => p.group === 'Demo').map(p => (
                            <div key={p.key}>
                              <label className="text-[9px] text-slate-500 mb-1 block">{p.label.replace('Demo ', '')}</label>
                              <input
                                type="number"
                                min="0"
                                max="1000"
                                value={quotaLedger[p.key]}
                                onChange={e => setQuotaForPlan(p.key, Number(e.target.value))}
                                className="w-full px-2.5 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white font-mono text-center focus:outline-none focus:border-neon-amber/40 transition-colors"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Regular plans */}
                      <div>
                        <p className="text-[10px] text-neon-green font-semibold mb-1.5 uppercase tracking-wider">Regular Licenses</p>
                        <div className="grid grid-cols-2 gap-2">
                          {quotaPlanOptions.filter(p => p.group === 'Regular').map(p => (
                            <div key={p.key}>
                              <label className="text-[9px] text-slate-500 mb-1 block">{p.label.replace('Regular ', '')}</label>
                              <input
                                type="number"
                                min="0"
                                max="1000"
                                value={quotaLedger[p.key]}
                                onChange={e => setQuotaForPlan(p.key, Number(e.target.value))}
                                className="w-full px-2.5 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white font-mono text-center focus:outline-none focus:border-neon-amber/40 transition-colors"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Total summary */}
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-neon-amber/5 border border-neon-amber/15">
                        <span className="text-[10px] text-slate-400 font-semibold">Total Licenses Allocated</span>
                        <span className="text-sm font-bold text-neon-amber font-mono">{totalQuotaAllocated}</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1.5">Sub-admins can only allot licenses from their assigned quota. They cannot generate new licenses beyond these limits.</p>
                  </div>
                </div>

                {/* Role Selection */}
                <div>
                  <label className="text-xs text-slate-400 mb-2 block font-semibold">Role</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(['super_admin', 'sub_admin'] as const).map(r => {
                      const rc = roleConfig[r];
                      const RIcon = rc.icon;
                      return (
                        <button
                          key={r}
                          onClick={() => setRole(r)}
                          className={`relative p-3 rounded-xl border text-left transition-all overflow-hidden ${
                            role === r
                              ? `${rc.bg} ${rc.border}`
                              : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${role === r ? rc.bg : 'bg-white/[0.05]'}`}>
                              <RIcon className={`w-4 h-4 ${role === r ? rc.color : 'text-slate-400'}`} />
                            </div>
                            <span className={`text-sm font-bold ${role === r ? rc.color : 'text-slate-300'}`}>{rc.label}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1.5">
                            {r === 'super_admin' ? 'Full unrestricted access to all panels' : 'Scoped access based on permissions below'}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Permissions Checkbox Grid */}
                <div>
                  <label className="text-xs text-slate-400 mb-3 block font-semibold flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" /> Permissions Grid
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {permissionsList.map(p => {
                      const PIcon = p.icon;
                      const granted = permissions[p.key];
                      return (
                        <button
                          key={p.key}
                          onClick={() => togglePermission(p.key)}
                          className={`relative flex items-center gap-3 p-3 rounded-xl border text-left transition-all overflow-hidden ${
                            granted
                              ? 'bg-neon-green/8 border-neon-green/25'
                              : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12]'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                            granted ? 'bg-neon-green/15' : 'bg-white/[0.05]'
                          }`}>
                            <PIcon className={`w-4 h-4 transition-colors ${granted ? 'text-neon-green' : 'text-slate-400'}`} />
                          </div>
                          <span className={`text-xs font-medium flex-1 ${granted ? 'text-white' : 'text-slate-400'}`}>{p.label}</span>
                          {/* Checkbox visual */}
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-all ${
                            granted
                              ? 'bg-neon-green/20 border-neon-green/50 shadow-[0_0_8px_rgba(0,255,157,0.3)]'
                              : 'bg-white/[0.03] border-white/[0.1]'
                          }`}>
                            {granted && <Check className="w-3.5 h-3.5 text-neon-green" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {/* Select all / none */}
                  <div className="flex gap-3 mt-3">
                    <button
                      onClick={() => {
                        const all: Record<string, boolean> = {};
                        permissionsList.forEach(p => { all[p.key] = true; });
                        setPermissions(all);
                      }}
                      className="text-[11px] text-neon-cyan hover:text-neon-cyan/80 font-semibold transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => {
                        const none: Record<string, boolean> = {};
                        permissionsList.forEach(p => { none[p.key] = false; });
                        setPermissions(none);
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-300 font-semibold transition-colors"
                    >
                      Clear All
                    </button>
                    <span className="ml-auto text-[11px] text-slate-500 font-mono">
                      {permissionsList.filter(p => permissions[p.key]).length}/{permissionsList.length} selected
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 bg-base-800/90 backdrop-blur-xl border-t border-white/[0.06] px-5 sm:px-6 py-4 flex items-center justify-between gap-3">
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] text-sm text-slate-300 border border-white/[0.06] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!email.trim() || !name.trim() || !password.trim() || saving}
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                    email.trim() && name.trim() && password.trim() && !saving
                      ? 'bg-neon-amber/15 text-neon-amber border border-neon-amber/40 hover:bg-neon-amber/25'
                      : 'bg-white/[0.03] text-slate-500 border border-white/[0.06] cursor-not-allowed'
                  }`}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create Admin
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
