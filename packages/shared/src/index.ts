export { supabase, clearAuthCache } from './lib/supabase';
export type {
  Profile,
  AdminRole,
  UserRole,
  UserStatus,
  Bot,
  TradeHistory,
  BrokerKey,
  License,
  AdminActivityLog,
  UserFund,
  RiskSettings,
  BotTemplate,
  ApiSettings,
  Transaction,
  Trade,
  ClientUpdate,
} from './lib/supabase';

export { AuthProvider, useAuth } from './context/AuthContext';
export type { AppTarget } from './context/AuthContext';

export { default as AuthScreen } from './components/AuthScreen';
export { default as Sparkline } from './components/Sparkline';

export {
  coins, signals, strategies, trades, botStatuses, tickerItems,
} from './data/mockData';

export type {
  Coin, Signal, Strategy, BotStatus,
} from './data/mockData';

export type { BotFactoryDraft } from './types/bot';
