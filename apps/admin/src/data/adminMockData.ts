export interface ConnectedExchange {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  apiKeyMasked?: string;
}

export interface AdminClient {
  id: string;
  email: string;
  name: string;
  plan: string;
  status: 'active' | 'suspended' | 'banned';
  totalFunds: number;
  unrealizedPnl: number;
  realizedPnl: number;
  activeBots: number;
  manualTrading: boolean;
  joinedDate: string;
  lastActive: string;
  country: string;
  licenseValidUntil: string;
  licenseCycle: 'monthly' | 'quarterly' | 'half-yearly' | 'yearly';
  botLimit: number;
  unlockedStrategies: string[];
  unlockedIndicators: string[];
  connectedExchanges: ConnectedExchange[];
}

export const indianExchanges = ['Binance', 'CoinDCX', 'Delta Exchange', 'WazirX', 'Pi42'] as const;
export type IndianExchange = typeof indianExchanges[number];

export interface AdminLicense {
  id: string;
  planName: string;
  price: number;
  botLimit: number;
  activeUsers: number;
  maxLeverage: number;
  features: string[];
  color: 'green' | 'cyan' | 'amber';
}

export interface SaaSFeature {
  label: string;
  starter: boolean;
  pro: boolean;
  enterprise: boolean;
}

export const saasFeatureMatrix: SaaSFeature[] = [
  { label: 'AI Bots', starter: true, pro: true, enterprise: true },
  { label: '2 Bots Max', starter: true, pro: false, enterprise: false },
  { label: '10 Bots Max', starter: false, pro: true, enterprise: false },
  { label: 'Unlimited Bots', starter: false, pro: false, enterprise: true },
  { label: '10x Max Leverage', starter: true, pro: false, enterprise: false },
  { label: '50x Max Leverage', starter: false, pro: true, enterprise: false },
  { label: '125x Max Leverage', starter: false, pro: false, enterprise: true },
  { label: 'Spot Trading', starter: true, pro: true, enterprise: true },
  { label: 'Futures Trading', starter: false, pro: true, enterprise: true },
  { label: 'Email Support', starter: true, pro: true, enterprise: true },
  { label: 'Basic Signals', starter: true, pro: true, enterprise: true },
  { label: 'Advanced Signals', starter: false, pro: true, enterprise: true },
  { label: 'Copy Trading', starter: false, pro: true, enterprise: true },
  { label: 'Custom Strategies', starter: false, pro: true, enterprise: true },
  { label: 'API Access', starter: false, pro: false, enterprise: true },
  { label: 'Custom Risk Rules', starter: false, pro: false, enterprise: true },
  { label: 'Dedicated Manager', starter: false, pro: false, enterprise: true },
  { label: 'White-label', starter: false, pro: false, enterprise: true },
];

export const allStrategies = [
  'Scalping', 'Grid', 'DCA', 'Arbitrage', 'Mean Reversion',
  'Momentum Breakout', 'Trend Following', 'Breakout Reversal',
  'Order Block Sniper', 'Smart Money Concept', 'Volume Weighted',
];

export const allIndicators = [
  'RSI Pro', 'MACD Divergence', 'Bollinger Bands Pro', 'Volume Profile',
  'Ichimoku Cloud', 'Fibonacci Auto', 'Order Blocks', 'Liquidity Zones',
  'VWAP Anchored', 'Market Structure', 'Smart Money Index', 'CVD Pro',
];

export type LicenseCycle = 'monthly' | 'quarterly' | 'half-yearly' | 'yearly';

export const licenseCycleConfig: Record<LicenseCycle, { label: string; multiplier: number; badge: string }> = {
  monthly: { label: 'Monthly', multiplier: 1, badge: 'bg-neon-cyan/15 text-neon-cyan' },
  quarterly: { label: 'Quarterly', multiplier: 2.7, badge: 'bg-neon-green/15 text-neon-green' },
  'half-yearly': { label: 'Half-Yearly', multiplier: 5.2, badge: 'bg-neon-amber/15 text-neon-amber' },
  yearly: { label: 'Yearly', multiplier: 9.6, badge: 'bg-neon-amber/20 text-neon-amber' },
};

export interface LicensePlanConfig {
  id: 'Starter' | 'Pro' | 'Enterprise';
  label: string;
  monthlyPrice: number;
  botLimit: number;
  maxLeverage: number;
  features: string[];
  color: 'cyan' | 'green' | 'amber';
}

export const licensePlanConfigs: LicensePlanConfig[] = [
  { id: 'Starter', label: 'Starter', monthlyPrice: 29, botLimit: 2, maxLeverage: 10, features: ['2 AI Bots', '10x Max Leverage', 'Spot Trading', 'Email Support', 'Basic Signals'], color: 'cyan' },
  { id: 'Pro', label: 'Pro', monthlyPrice: 99, botLimit: 10, maxLeverage: 50, features: ['10 AI Bots', '50x Max Leverage', 'Spot & Futures', 'Priority Support', 'Advanced Signals', 'Copy Trading', 'Custom Strategies'], color: 'green' },
  { id: 'Enterprise', label: 'Enterprise', monthlyPrice: 499, botLimit: 25, maxLeverage: 125, features: ['Unlimited AI Bots', '125x Max Leverage', 'Unlimited Markets', 'Dedicated Manager', 'API Access', 'Custom Risk Rules', 'White-label', 'Priority Features'], color: 'amber' },
];

export const adminLicensePlans: AdminLicense[] = [
  { id: 'l1', planName: 'Starter', price: 29, botLimit: 2, activeUsers: 0, maxLeverage: 10, features: ['2 AI Bots', '10x Max Leverage', 'Spot Trading', 'Email Support', 'Basic Signals'], color: 'cyan' },
  { id: 'l2', planName: 'Pro', price: 99, botLimit: 10, activeUsers: 0, maxLeverage: 50, features: ['10 AI Bots', '50x Max Leverage', 'Spot & Futures', 'Priority Support', 'Advanced Signals', 'Copy Trading', 'Custom Strategies'], color: 'green' },
  { id: 'l3', planName: 'Enterprise', price: 499, botLimit: 25, activeUsers: 0, maxLeverage: 125, features: ['Unlimited AI Bots', '125x Max Leverage', 'Unlimited Markets', 'Dedicated Manager', 'API Access', 'Custom Risk Rules', 'White-label', 'Priority Features'], color: 'amber' },
];

export const licenseDurationOptions = [
  { months: 1, label: '1 Month' },
  { months: 2, label: '2 Months' },
  { months: 3, label: '3 Months' },
  { months: 6, label: '6 Months' },
  { months: 12, label: '1 Year' },
];
