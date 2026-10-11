export interface BotConfig {
  id: string;
  name: string;
  bot_type: 'scalper' | 'dca' | 'grid' | 'copier';
  execution_mode: 'auto' | 'manual';
  market_type: 'spot' | 'futures';
  strategies: string[];
  indicators: string[];
  max_drawdown_pct: number;
  default_tp_pct: number;
  default_sl_pct: number;
  tp_sl_ratio: number;
  max_leverage: number;
  risk_level: 'Low' | 'Medium' | 'High';
  source_exchanges: string[];
}

export interface TradeSignal {
  pair: string;
  side: 'BUY' | 'SELL';
  price: number;
  confidence: number;
  strategy: string;
  timestamp: string;
}

export interface ExecutionResult {
  success: boolean;
  orderId?: string;
  error?: string;
  timestamp: string;
}
