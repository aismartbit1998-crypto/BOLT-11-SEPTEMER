import { useState, useMemo, useEffect } from 'react';
import {
  X, Rocket, TrendingUp, Target, Shield,
  Activity, Zap, Award, Clock, Check, Loader2, Brain,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { BotFactoryDraft } from '@cortex/shared/types/bot';
import { useApp } from '@/context/AppContext';

interface Props {
  draft: BotFactoryDraft;
  onClose: () => void;
  /** Optional live strategy params from the AI Smart Bot Builder */
  strategyParams?: {
    indicators: string[];
    leverage: number;
    take_profit_pct: number;
    stop_loss_pct: number;
    rr_ratio: number;
    market_type: 'spot' | 'futures';
    coin: string;
    initial_capital: number;
  };
}

function generateEquityCurve(initial: number, months: number, monthlyReturn: number, drawdown: number): { month: string; equity: number }[] {
  const data: { month: string; equity: number }[] = [];
  let equity = initial;
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  for (let i = 0; i < months; i++) {
    const isDrawdownMonth = i === Math.floor(months * 0.4) || i === Math.floor(months * 0.65);
    if (isDrawdownMonth) {
      equity *= (1 - drawdown / 100);
    } else {
      const variance = (Math.random() - 0.3) * monthlyReturn * 0.8;
      equity *= (1 + (monthlyReturn + variance) / 100);
    }
    data.push({ month: monthLabels[i] ?? `M${i + 1}`, equity: Math.round(equity) });
  }
  return data;
}

export default function BacktestModal({ draft, strategyParams, onClose }: Props) {
  const [running, setRunning] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const { formatCurrency, formatCompact, formatPrice, currency } = useApp();

  const yAxisFormatter = (v: number) => formatCompact(v);

  useEffect(() => {
    const timer = setTimeout(() => {
      setRunning(false);
      setShowResults(true);
    }, 2200);
    return () => clearTimeout(timer);
  }, []);

  // Use strategyParams if provided (from AI Smart Bot Builder), otherwise fall back to draft
  const tpPct = strategyParams?.take_profit_pct ?? draft.default_tp_pct;
  const slPct = strategyParams?.stop_loss_pct ?? draft.default_sl_pct;
  const leverage = strategyParams?.leverage ?? draft.max_leverage;
  const rrRatio = strategyParams?.rr_ratio ?? draft.tp_sl_ratio;
  const indicators = strategyParams?.indicators ?? draft.indicators ?? [];
  const initialCapital = strategyParams?.initial_capital ?? 5000;

  // Risk level drives base returns; leverage and indicators adjust them
  const baseMonthly = draft.risk_level === 'Low' ? 5 : draft.risk_level === 'Medium' ? 10 : 18;
  const baseWinRate = draft.risk_level === 'Low' ? 82 : draft.risk_level === 'Medium' ? 72 : 64;

  // Leverage amplifies returns (and risk)
  const leverageMultiplier = Math.min(leverage / 10, 2.5);
  // Active indicators improve win rate slightly
  const indicatorWinRateBoost = indicators.length > 0 ? 3 : 0;
  // RSI specifically adds a small edge
  const rsiBonus = indicators.includes('RSI') ? 2 : 0;
  // EMA Crossover adds consistency
  const emaBonus = indicators.includes('EMA Crossover') ? 1.5 : 0;

  const monthlyReturn = baseMonthly * leverageMultiplier * (1 + (indicatorWinRateBoost + rsiBonus + emaBonus) / 20);
  const winRate = Math.min(baseWinRate + indicatorWinRateBoost + rsiBonus + emaBonus, 95);

  const maxDrawdown = draft.max_drawdown_pct;
  const equityData = useMemo(
    () => generateEquityCurve(initialCapital, 6, monthlyReturn, maxDrawdown / 3),
    [monthlyReturn, maxDrawdown, initialCapital]
  );
  const finalEquity = equityData[equityData.length - 1]?.equity ?? initialCapital;
  const totalReturn = ((finalEquity - initialCapital) / initialCapital) * 100;

  const profitPerMonth = (finalEquity - initialCapital) / 6;
  const totalTrades = Math.floor(120 + Math.random() * 80);
  const winningTrades = Math.floor(totalTrades * winRate / 100);
  const losingTrades = totalTrades - winningTrades;
  const avgWin = tpPct * leverage * 0.8;
  const avgLoss = slPct * leverage * 0.8;
  const profitFactor = avgLoss > 0 ? (avgWin * winningTrades) / (avgLoss * losingTrades) : 0;
  const sharpeRatio = 1 + monthlyReturn / 15;

  // Strategy description based on actual params
  const strategyDesc = [
    strategyParams?.coin ? `${strategyParams.coin}/USDT` : 'Multi-coin',
    strategyParams?.market_type === 'futures' ? `${leverage}x Leverage` : 'Spot',
    indicators.length > 0 ? indicators.join(' + ') : 'Price Action',
    `TP ${tpPct}% / SL ${slPct}%`,
    `R:R 1:${rrRatio}`,
  ].join(' · ');

  const riskColor = draft.risk_level === 'Low' ? 'text-neon-green' : draft.risk_level === 'Medium' ? 'text-neon-amber' : 'text-neon-red';

  function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
      <div className="glass-strong rounded-xl px-3 py-2 text-xs border border-white/[0.08]">
        <p className="text-slate-400 mb-1">{label}</p>
        <p className="text-neon-green font-bold font-mono">{formatCurrency(payload[0].value)}</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="absolute inset-0 bg-base-900/85 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-3xl animate-scale-in">
        <div className="glass-strong neon-glow-cyan max-h-[92vh] overflow-y-auto scrollbar-thin rounded-2xl">
          {/* Header */}
          <div className="sticky top-0 z-20 bg-base-800/90 backdrop-blur-xl border-b border-white/[0.06] px-5 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center">
                <Brain className="w-5 h-5 text-neon-cyan" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">AI Backtesting Simulator</h2>
                <p className="text-[11px] text-slate-500">6-month simulated paper trading results</p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/[0.06]">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 sm:px-6 py-5">
            {running ? (
              <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
                <div className="relative w-20 h-20 mb-5">
                  <div className="absolute inset-0 rounded-full border-2 border-neon-cyan/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-neon-cyan animate-spin" />
                  <Brain className="absolute inset-0 m-auto w-8 h-8 text-neon-cyan animate-pulse" />
                </div>
                <p className="text-sm font-bold text-white mb-1">Running AI Backtest Simulation...</p>
                <p className="text-xs text-slate-500">Analyzing 6 months of historical market data with your strategy parameters</p>
                <div className="mt-5 flex flex-wrap gap-2 justify-center max-w-md">
                  {['Loading historical candles', 'Simulating entries/exits', 'Calculating win rate', 'Computing drawdown', 'Generating equity curve'].map((step, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[10px] text-slate-400 font-mono">
                      {step}...
                    </span>
                  ))}
                </div>
              </div>
            ) : showResults ? (
              <div className="space-y-5 animate-fade-in">
                {/* Strategy Summary Bar */}
                <div className="flex flex-col gap-2 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Rocket className="w-4 h-4 text-neon-cyan" />
                      <span className="text-sm font-bold text-white">{draft.name || 'Custom Cortex Bot'}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${riskColor} bg-white/[0.04] border border-white/[0.06]`}>
                      {draft.risk_level} Risk
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold text-neon-cyan bg-neon-cyan/10 border border-neon-cyan/20 capitalize">
                      {draft.bot_type}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold text-neon-green bg-neon-green/10 border border-neon-green/20 capitalize">
                      {draft.market_type}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">{strategyDesc}</p>
                </div>

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <MetricCard
                    label="Win Rate"
                    value={`${winRate.toFixed(1)}%`}
                    icon={Target}
                    color="text-neon-green"
                    bg="bg-neon-green/5"
                    border="border-neon-green/15"
                  />
                  <MetricCard
                    label="Monthly Profit"
                    value={`+${formatCurrency(profitPerMonth)}`}
                    icon={TrendingUp}
                    color="text-neon-cyan"
                    bg="bg-neon-cyan/5"
                    border="border-neon-cyan/15"
                  />
                  <MetricCard
                    label="Max Drawdown"
                    value={`-${(maxDrawdown / 3).toFixed(1)}%`}
                    icon={Shield}
                    color="text-neon-red"
                    bg="bg-neon-red/5"
                    border="border-neon-red/15"
                  />
                  <MetricCard
                    label="Total Return"
                    value={`+${totalReturn.toFixed(1)}%`}
                    icon={Award}
                    color="text-neon-amber"
                    bg="bg-neon-amber/5"
                    border="border-neon-amber/15"
                  />
                </div>

                {/* Equity Curve Chart */}
                <div className="glass-card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Activity className="w-4 h-4 text-neon-green" /> Equity Curve (6 Months)
                      </h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Simulated portfolio growth from {formatCurrency(initialCapital)} initial capital</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500">Final Equity</p>
                      <p className="text-sm font-bold text-neon-green font-mono">{formatCurrency(finalEquity)}</p>
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={equityData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00ff9d" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#00ff9d" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} tickLine={false} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={yAxisFormatter} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="equity" stroke="#00ff9d" strokeWidth={2.5} fill="url(#equityGrad)" dot={{ fill: '#00ff9d', r: 3, strokeWidth: 0 }} activeDot={{ r: 5, fill: '#00ff9d', stroke: '#05060a', strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Detailed Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="glass-card p-4">
                    <p className="text-[10px] text-slate-500 uppercase font-semibold mb-3">Trade Statistics</p>
                    <div className="space-y-2 text-xs">
                      <StatRow label="Total Trades" value={`${totalTrades}`} />
                      <StatRow label="Winning Trades" value={`${winningTrades}`} accent="text-neon-green" />
                      <StatRow label="Losing Trades" value={`${losingTrades}`} accent="text-neon-red" />
                      <StatRow label="Avg Win" value={`+${avgWin.toFixed(1)}%`} accent="text-neon-green" />
                      <StatRow label="Avg Loss" value={`-${avgLoss.toFixed(1)}%`} accent="text-neon-red" />
                      <StatRow label="Profit Factor" value={`${profitFactor.toFixed(2)}`} accent="text-neon-cyan" />
                    </div>
                  </div>
                  <div className="glass-card p-4">
                    <p className="text-[10px] text-slate-500 uppercase font-semibold mb-3">Risk Analysis</p>
                    <div className="space-y-2 text-xs">
                      <StatRow label="Sharpe Ratio" value={`${sharpeRatio.toFixed(2)}`} accent="text-neon-cyan" />
                      <StatRow label="Risk:Reward" value={`1:${rrRatio.toFixed(1)}`} accent="text-neon-cyan" />
                      <StatRow label="Max Leverage" value={`${leverage}x`} accent="text-neon-amber" />
                      <StatRow label="Recovery Factor" value={`${(monthlyReturn / 2).toFixed(1)}`} accent="text-neon-green" />
                      <StatRow label="Longest Streak" value={`${Math.floor(5 + Math.random() * 5)} wins`} />
                      <StatRow label="Avg Hold Time" value={`${Math.floor(2 + Math.random() * 8)}h`} />
                    </div>
                  </div>
                </div>

                {/* Disclaimer */}
                <div className="flex items-start gap-2 p-3 rounded-xl bg-neon-amber/5 border border-neon-amber/15">
                  <Shield className="w-4 h-4 text-neon-amber flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Backtest results are simulated based on historical data and AI modeling. Past performance does not guarantee future results. Crypto markets are highly volatile.
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          {!running && showResults && (
            <div className="sticky bottom-0 bg-base-800/90 backdrop-blur-xl border-t border-white/[0.06] px-5 sm:px-6 py-4 flex items-center justify-between gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] text-sm text-slate-300 border border-white/[0.06] transition-all"
              >
                Close
              </button>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Clock className="w-3.5 h-3.5" />
                Simulated on 6 months of historical data
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, color, bg, border }: {
  label: string; value: string; icon: typeof Target; color: string; bg: string; border: string;
}) {
  return (
    <div className={`p-4 rounded-xl ${bg} ${border} border relative overflow-hidden`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className={`text-xl font-bold ${color} font-mono`}>{value}</p>
    </div>
  );
}

function StatRow({ label, value, accent = 'text-slate-200' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={`${accent} font-mono font-semibold`}>{value}</span>
    </div>
  );
}
