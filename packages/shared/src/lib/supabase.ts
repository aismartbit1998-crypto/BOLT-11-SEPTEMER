import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://kzqwsdjmbxpnoptctvvb.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_qUz_QOAy1WzvT5ZA_pkAyg_KK4DEryK';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'X-Client-Info': 'cortex-ai-web',
    },
  },
});

export type UserRole = 'master_admin' | 'sub_admin' | 'client';

export type UserStatus = 'active' | 'suspended' | 'banned';

export interface Profile {
  id: string;
  email: string;
  disclaimer_accepted: boolean;
  disclaimer_accepted_at: string | null;
  created_at: string;
  role: UserRole;
  status: UserStatus;
  permissions: string[] | null;
  parent_admin_id: string | null;
  license_quota: number;
  quota_ledger: Record<string, { used: number; total: number }> | null;
  country: string | null;
}

export interface Bot {
  id: string;
  user_id: string;
  name: string;
  market_type: 'spot' | 'futures';
  coin: string;
  strategy: 'scalping' | 'grid' | 'trailing';
  status: 'running' | 'paused' | 'idle';
  profit_loss: number;
  created_at: string;
  trading_mode: 'live' | 'paper' | null;
}

export interface TradeHistory {
  id: string;
  user_id: string;
  timestamp: string;
  pair: string;
  side: 'BUY' | 'SELL';
  amount: number;
  price: number;
  pnl: number;
  strategy: string | null;
}

export interface BrokerKey {
  id: string;
  user_id: string;
  exchange_name: string;
  api_key: string;
  api_secret: string;
  encrypted_api_key: string | null;
  encrypted_api_secret: string | null;
  encryption_iv: string | null;
  is_connected: boolean;
  created_at: string;
}

// Admin panel types

export interface License {
  id: string;
  user_id: string | null;
  plan_name: string;
  bot_limit: number;
  is_active: boolean;
  valid_from: string;
  valid_until: string | null;
  monthly_fee: number;
  license_key: string | null;
  created_at: string;
  mobile_number?: string | null;
  allotted_strategies?: string[] | null;
  parent_admin_id?: string | null;
}

export interface AdminRole {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  role: 'super_admin' | 'sub_admin';
  permissions: Record<string, boolean>;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  license_quota?: number;
}

export interface AdminActivityLog {
  id: string;
  admin_email: string;
  admin_name: string | null;
  action_type: string;
  message: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  created_at: string;
}

export interface UserFund {
  id: string;
  user_id: string;
  exchange_name: string;
  balance: number;
  unrealized_pnl: number;
  realized_pnl: number;
  manual_trading_enabled: boolean;
  last_synced_at: string | null;
  created_at: string;
}

export interface RiskSettings {
  id: string;
  global_kill_switch: boolean;
  max_leverage: number;
  max_daily_loss_pct: number;
  api_health_alerts: boolean;
  auto_disable_on_breach: boolean;
  max_slippage_pct: number;
  ai_circuit_breaker: boolean;
  updated_at: string;
}

export interface BotTemplate {
  id: string;
  name: string;
  description: string | null;
  strategy_type: 'scalping' | 'grid' | 'trailing' | 'dca';
  market_type: 'spot' | 'futures';
  default_tp_pct: number;
  default_sl_pct: number;
  risk_level: 'Low' | 'Medium' | 'High';
  is_public: boolean;
  total_copies: number;
  created_at: string;
  bot_type: 'scalper' | 'dca' | 'grid' | 'copier' | null;
  execution_mode: 'auto' | 'manual' | null;
  strategies: string[] | null;
  indicators: string[] | null;
  max_drawdown_pct: number | null;
  tp_sl_ratio: number | null;
  max_leverage: number | null;
  source_exchanges: string[] | null;
  overall_pnl: number | null;
  active_users: number | null;
  status: 'active' | 'paused' | null;
}

export interface ApiSettings {
  id: string;
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  deepseek_api_key: string | null;
  coingecko_api_key: string | null;
  coinmarketcap_api_key: string | null;
  tradingview_license_key: string | null;
  binance_api_key: string | null;
  binance_api_secret: string | null;
  coindcx_api_key: string | null;
  coindcx_api_secret: string | null;
  delta_api_key: string | null;
  delta_api_secret: string | null;
  wazirx_api_key: string | null;
  wazirx_api_secret: string | null;
  pi42_api_key: string | null;
  pi42_api_secret: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  client_name: string;
  client_email: string | null;
  plan_name: string;
  amount: number;
  currency: string;
  status: 'completed' | 'pending' | 'failed' | 'refunded';
  payment_method: string | null;
  created_at: string;
}

export interface Trade {
  id: string;
  client_id: string | null;
  client_name: string | null;
  coin: string;
  market_type: 'spot' | 'futures';
  direction: 'long' | 'short';
  entry_price: number;
  amount: number;
  quantity: number;
  leverage: number;
  position_size: number;
  tp_pct: number | null;
  sl_pct: number | null;
  status: 'open' | 'closed_tp' | 'closed_sl' | 'cancelled';
  executed_by: string;
  created_at: string;
  trading_mode: 'live' | 'paper' | null;
}

export interface ClientUpdate {
  id: string;
  client_id: string | null;
  update_type: 'plan_change' | 'status_change' | 'license_update' | 'risk_action';
  title: string;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
  executed_by: string;
  created_at: string;
}

export interface Signal {
  id: string;
  user_id: string | null;
  coin: string;
  signal_type: 'BUY' | 'SELL';
  confidence: number;
  entry_price: number | null;
  target_price: number | null;
  stop_loss: number | null;
  source: string;
  created_at: string;
}

export interface CopyTradingBot {
  id: string;
  name: string;
  description: string | null;
  strategy_type: string;
  risk_level: 'Low' | 'Medium' | 'High';
  monthly_return_pct: number;
  win_rate: number;
  max_drawdown_pct: number;
  copiers_count: number;
  followers_count: number;
  sparkline_data: number[];
  is_active: boolean;
  created_at: string;
}

export interface BrokerResponse {
  id: string;
  user_id: string;
  exchange_name: string;
  endpoint: string | null;
  status: 'success' | 'error';
  latency_ms: number;
  message: string | null;
  created_at: string;
}

export interface BugReport {
  id: string;
  user_id: string;
  category: string;
  severity: string;
  description: string;
  ticket_number: string;
  status: string;
  created_at: string;
}

export interface SystemSettings {
  id: string;
  app_name: string;
  tagline: string;
  primary_color: string;
  accent_color: string;
  support_email: string;
  maintenance_mode: boolean;
  email_alerts: boolean;
  two_factor: boolean;
  updated_at: string;
}

export interface ApiHealthLog {
  id: string;
  exchange_name: string;
  status: 'healthy' | 'degraded' | 'down';
  latency_ms: number;
  last_checked_at: string;
  error_rate_pct: number;
  message: string | null;
}

export type StrategyType = 'AI Smart DCA' | 'Auto-Grid' | 'Momentum Scalper';
export type RiskLevel = 'Low' | 'Medium' | 'High';
export type BotStatus = 'active' | 'paused' | 'stopped';
