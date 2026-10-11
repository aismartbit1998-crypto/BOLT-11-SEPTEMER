import {
  LayoutDashboard, Bot, Users, KeyRound, ShieldCheck,
  AlertTriangle, Settings, ChevronRight, Wallet, SlidersHorizontal,
  Megaphone,
} from 'lucide-react';
import { useAdminRbac } from '@/context/AdminRbacContext';

export type AdminViewId =
  | 'dashboard' | 'bots' | 'clients' | 'licenses'
  | 'admins' | 'risk-control' | 'system-settings' | 'payment-analytics' | 'api-control' | 'broadcast';

interface NavItem {
  id: AdminViewId;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string;
  permission?: string;
  masterOnly?: boolean;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'bots', label: 'AI Smart Bots', icon: Bot, permission: 'can_edit_bots' },
  { id: 'clients', label: 'Clients', icon: Users, permission: 'can_manage_clients' },
  { id: 'licenses', label: 'Licenses', icon: KeyRound, permission: 'can_manage_licenses' },
  { id: 'payment-analytics', label: 'Payment & Revenue', icon: Wallet, badge: 'NEW', permission: 'can_view_client_pnl' },
  { id: 'admins', label: 'Admins', icon: ShieldCheck, masterOnly: true },
  { id: 'risk-control', label: 'Risk Control', icon: AlertTriangle, permission: 'can_manage_risk' },
  { id: 'api-control', label: 'Master API Control', icon: SlidersHorizontal, badge: 'NEW', masterOnly: true },
  { id: 'broadcast', label: 'Promotions & Broadcasts', icon: Megaphone, badge: 'NEW' },
  { id: 'system-settings', label: 'System Settings', icon: Settings, permission: 'can_manage_settings' },
];

interface Props {
  active: AdminViewId;
  onSelect: (id: AdminViewId) => void;
  onClose?: () => void;
}

export default function AdminSidebar({ active, onSelect, onClose }: Props) {
  const { isMasterAdmin, hasPermission } = useAdminRbac();

  const visibleItems = navItems.filter(item => {
    if (item.masterOnly) return isMasterAdmin;
    if (!item.permission) return true;
    return hasPermission(item.permission);
  });

  return (
    <nav className="h-full flex flex-col py-4 px-3 overflow-y-auto scrollbar-thin">
      {/* Admin label */}
      <div className="px-3 mb-4">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
          isMasterAdmin
            ? 'bg-neon-amber/5 border-neon-amber/15'
            : 'bg-neon-cyan/5 border-neon-cyan/15'
        }`}>
          <ShieldCheck className={`w-4 h-4 ${isMasterAdmin ? 'text-neon-amber' : 'text-neon-cyan'}`} />
          <span className={`text-xs font-bold tracking-wide ${isMasterAdmin ? 'text-neon-amber' : 'text-neon-cyan'}`}>
            {isMasterAdmin ? 'MASTER ADMIN' : 'SUB-ADMIN'}
          </span>
        </div>
      </div>

      <div className="space-y-1">
        {visibleItems.map((item) => {
          const isActive = active === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => {
                onSelect(item.id);
                onClose?.();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative ${
                isActive
                  ? 'bg-gradient-to-r from-neon-amber/10 to-transparent text-white border border-neon-amber/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-neon-amber" style={{ boxShadow: '0 0 10px rgba(255, 176, 32, 0.5)' }} />
              )}
              <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${isActive ? 'text-neon-amber' : 'text-slate-500 group-hover:text-slate-300'}`} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge && (
                <span className="px-1.5 py-0.5 rounded-md bg-neon-green/15 text-neon-green text-[9px] font-bold tracking-wide neon-glow-green">
                  {item.badge}
                </span>
              )}
              {isActive && <ChevronRight className="w-4 h-4 text-neon-amber/50" />}
            </button>
          );
        })}
      </div>

      {/* Back to client app */}
      <div className="mt-auto px-3 pt-4 border-t border-white/[0.04]">
        <button
          onClick={() => { window.location.hash = ''; window.location.reload(); }}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs text-slate-500 hover:text-slate-300 hover:bg-white/[0.03] transition-all"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Back to Cortex AI
        </button>
        <p className="text-[10px] text-slate-600 mt-2">Admin Panel v2.0</p>
      </div>
    </nav>
  );
}
