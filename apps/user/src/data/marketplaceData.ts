export interface MasterBot {
  id: string;
  name: string;
  description: string | null;
  monthly_return_pct: number;
  copiers_count: number;
  risk_level: 'Low' | 'Medium' | 'High';
  win_rate: number;
  strategy_type: string;
  max_drawdown_pct: number;
  followers_count: number;
  sparkline_data: number[];
  is_active: boolean;
}
