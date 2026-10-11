export interface BotFactoryDraft {
  name: string;
  description: string;
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
