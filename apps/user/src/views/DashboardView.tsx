import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Rocket, Brain, Zap, Activity, DollarSign, Target, AlertCircle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { coins } from '@cortex/shared/data/mockData';
import Sparkline from '@cortex/shared/components/Sparkline';
import { supabase, type Bot, type TradeHistory, type Signal } from '@cortex/shared/lib/supabase';
import { useAuth } from '@cortex/shared/context/AuthContext';

const API_BASE = import.meta.env.VITE_ENGINE_URL || '';

const accentMap = {
  green: { text: 'text-neon-green', border: 'border-neon-green/30', bg: 'bg-neon-green/10', glow: 'neon-glow-green', hex: '#00ff9d' },
  cyan: { text: 'text-neon-cyan', border: 'border-neon-cyan/30', bg: 'bg-neon-cyan/10', glow: 'neon-glow-cyan', hex: '#00e5ff' },
  amber: { text: 'text-neon-amber', border: 'border-neon-amber/30', bg: 'bg-neon-amber/10', glow: '', hex: '#ffb020' },
};

export default function DashboardView({ onDeploy }: { onDeploy?: () => void }) {
  const { formatCurrency, formatCompact, formatPrice, livePrices, liveConnected, tradingMode } = useApp();
  const { user } = useAuth();
  const [bots, setBots] = useState<Bot[]>([]);
  const [trades, setTrades] = useState<TradeHistory[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [strategies, setStrategies] = useState<{ id: string; name: string; description: string | null; risk_level: string; strategy_type: string; is_public: boolean; total_copies: number }[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    fetch(`${API_BASE}/api/user/bots?user_id=${user.id}${tradingMode ? `&trading_mode=${tradingMode}` : ''}`).then(r => r.json()).then(data => {
      setBots((data.bots as Bot[]) ?? []);
    }).catch(() => setBots([]));
    supabase.from('trade_history').select('*').eq('user_id', user.id).order('timestamp', { ascending: false }).limit(20).then(({ data }) => {
      setTrades((data as TradeHistory[]) ?? []);
    });
    supabase.from('signals').select('*').order('created_at', { ascending: false }).limit(5).then(({ data }) => {
      setSignals((data as Signal[]) ?? []);
    });
    supabase.from('bot_templates').select('id,name,description,risk_level,strategy_type,is_public,total_copies').eq('is_public', true).order('total_copies', { ascending: false }).limit(3).then(({ data }) => {
      setStrategies(data ?? []);
    });
  }, [user?.id, tradingMode]);

  const totalPnl = trades.reduce((sum, t) => sum + Number(t.pnl), 0);
  const activeCount = bots.filter(b => b.status === 'running').length;
  const winCount = trades.filter(t => Number(t.pnl) > 0).length;
  const winRate = trades.length > 0 ? ((winCount / trades.length) * 100).toFixed(1) : '0.0';

  const liveCoins = coins.map(c => {
    const lp = livePrices[c.symbol];
    return lp
      ? { ...c, price: lp.price, change24h: lp.change24h, volume24h: lp.volume24h, sparkline: lp.sparkline }
      : null;
  }).filter((c): c is NonNullable<typeof c> => c !== null);

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Stat Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Portfolio Value" value={formatCurrency(Math.max(totalPnl, 0) + 50000)} icon={DollarSign} accent="cyan" sub="Estimated" />
        <StatCard label="Total P&L" value={formatCurrency(totalPnl)} icon={TrendingUp} accent="green" sub={`${trades.length} trades`} />
        <StatCard label="Active Bots" value={`${activeCount} / ${bots.length}`} icon={Activity} accent="amber" sub={bots.length > 0 ? `${bots.length} total` : 'No bots yet'} />
        <StatCard label="Win Rate" value={`${winRate}%`} icon={Target} accent="green" sub={`${winCount} wins`} />
      </div>

      {/* AI Market Sentiment & Fear/Greed Meter */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card p-5 sm:p-6 relative overflow-hidden">
          <div className="absolute -top-16 -right-16 w-48 h-48 bg-neon-green/5 rounded-full blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-green" />
              </span>
              <h2 className="text-xs font-bold text-white tracking-wide">FEAR & GREED METER</h2>
            </div>
            <p className="text-[10px] text-slate-500 mb-4">Cortex Neural Engine v3 · Live</p>
            <div className="flex flex-col items-center">
              <div className="relative w-[200px] h-[110px]">
                <svg width="200" height="110" viewBox="0 0 200 110" className="overflow-visible">
                  <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#141828" strokeWidth="14" strokeLinecap="round" />
                  <path d="M 20 100 A 80 80 0 0 1 53 36" fill="none" stroke="#ff3b5c" strokeWidth="14" strokeLinecap="round" opacity="0.7" />
                  <path d="M 53 36 A 80 80 0 0 1 100 20" fill="none" stroke="#ffb020" strokeWidth="14" strokeLinecap="round" opacity="0.7" />
                  <path d="M 100 20 A 80 80 0 0 1 147 36" fill="none" stroke="#00e5ff" strokeWidth="14" strokeLinecap="round" opacity="0.7" />
                  <path d="M 147 36 A 80 80 0 0 1 180 100" fill="none" stroke="#00ff9d" strokeWidth="14" strokeLinecap="round" opacity="0.7" />
                  <path d="M 20 100 A 80 80 0 0 1 137 27" fill="none" stroke="#00ff9d" strokeWidth="14" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 8px rgba(0, 255, 157, 0.6))' }} />
                  <line x1="100" y1="100" x2={100 + 78 * Math.cos(Math.PI * (1 - 72 / 100))} y2={100 - 78 * Math.sin(Math.PI * (1 - 72 / 100))} stroke="#00ff9d" strokeWidth="2.5" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 6px rgba(0, 255, 157, 0.8))' }} />
                  <circle cx="100" cy="100" r="6" fill="#0b0e18" stroke="#00ff9d" strokeWidth="2" style={{ filter: 'drop-shadow(0 0 4px rgba(0, 255, 157, 0.6))' }} />
                </svg>
              </div>
              <div className="text-center -mt-2">
                <p className="text-3xl font-bold text-neon-green neon-text-green font-mono">72</p>
                <p className="text-sm font-bold text-neon-green">Greed</p>
              </div>
            </div>
            <div className="flex justify-between mt-3 text-[9px] text-slate-600">
              <span className="text-neon-red">Extreme Fear</span>
              <span className="text-neon-amber">Fear</span>
              <span className="text-neon-cyan">Neutral</span>
              <span className="text-neon-green font-bold">Greed</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-5 sm:p-6 relative overflow-hidden lg:col-span-2">
          <div className="absolute -top-20 -right-20 w-60 h-60 bg-neon-cyan/5 rounded-full blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-1">
              <Brain className="w-4 h-4 text-neon-cyan animate-pulse-glow" />
              <h2 className="text-xs font-bold text-white tracking-wide">LIVE AI MARKET ANALYSIS</h2>
              <span className="ml-auto text-[10px] text-slate-500">Updated 8s ago</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-white mt-3 mb-3 leading-snug">
              <span className="text-neon-green neon-text-green">AI detects high volatility. Smart Money is accumulating BTC.</span>
            </p>
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] mb-4">
              <div className="flex items-start gap-2.5">
                <Brain className="w-4 h-4 text-neon-cyan flex-shrink-0 mt-0.5 animate-pulse-glow" />
                <p className="text-xs text-slate-300 leading-relaxed">
                  On-chain data shows <span className="text-neon-green font-semibold">net BTC inflows</span> into cold storage across major exchanges. Social sentiment is <span className="text-neon-green font-semibold">+18% bullish</span> on BTC and ETH. The Fear & Greed index reads <span className="text-neon-green font-semibold">72 (Greed)</span>, indicating strong market confidence. Cortex AI recommends <span className="text-neon-cyan font-semibold">DCA accumulation</span> for spot positions and <span className="text-neon-amber font-semibold">caution on high-leverage futures</span> due to elevated volatility.
                </p>
              </div>
            </div>
            <div className="relative">
              <div className="flex justify-between text-[10px] text-slate-500 mb-1.5">
                <span>Bearish</span><span>Neutral</span><span className="text-neon-green font-semibold">Bullish 78%</span>
              </div>
              <div className="h-3 rounded-full bg-base-700 overflow-hidden relative">
                <div className="h-full rounded-full bg-gradient-to-r from-neon-red via-neon-amber to-neon-green transition-all duration-1000 relative" style={{ width: '78%' }}>
                  <div className="absolute inset-0 rounded-full" style={{ boxShadow: '0 0 20px rgba(0, 255, 157, 0.5)' }} />
                  <div className="absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-white/30 to-transparent" />
                </div>
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-slate-600"><span>0%</span><span>50%</span><span>100%</span></div>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {[
                { label: 'Fear & Greed', value: '72 — Greed', color: 'green' },
                { label: 'Social Buzz', value: '+18% BTC', color: 'cyan' },
                { label: 'On-Chain Flow', value: 'Net Inflow', color: 'green' },
                { label: 'Volatility', value: 'Moderate', color: 'amber' },
              ].map((chip) => (
                <div key={chip.label} className={`px-3 py-1.5 rounded-lg text-xs ${accentMap[chip.color as keyof typeof accentMap].bg} ${accentMap[chip.color as keyof typeof accentMap].border} border`}>
                  <span className="text-slate-400">{chip.label}: </span>
                  <span className={accentMap[chip.color as keyof typeof accentMap].text + ' font-semibold'}>{chip.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* AI Strategies from bot_templates */}
      {strategies.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-neon-cyan" />
              Fully Automatic AI Strategies
            </h3>
            <span className="text-xs text-slate-500">{strategies.length} strategies available</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {strategies.map((s, i) => {
              const accent = i === 0 ? 'green' : i === 1 ? 'cyan' : 'amber';
              const a = accentMap[accent];
              const riskColor = s.risk_level === 'Low' ? 'green' : s.risk_level === 'Medium' ? 'amber' : 'red';
              return (
                <div key={s.id} className={`glass-card p-5 relative overflow-hidden group hover:border-white/[0.12] transition-all duration-300 ${a.border}`}>
                  <div className={`absolute -top-12 -right-12 w-32 h-32 ${a.bg} rounded-full blur-3xl opacity-40 group-hover:opacity-70 transition-opacity`} />
                  <div className="relative">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-11 h-11 rounded-xl ${a.bg} ${a.border} border flex items-center justify-center`}>
                        <Rocket className={`w-6 h-6 ${a.text}`} />
                      </div>
                      <span className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wide bg-${riskColor === 'green' ? 'neon-green' : riskColor === 'amber' ? 'neon-amber' : 'neon-red'}/10 ${riskColor === 'green' ? 'text-neon-green' : riskColor === 'amber' ? 'text-neon-amber' : 'text-neon-red'} border border-${riskColor === 'green' ? 'neon-green' : riskColor === 'amber' ? 'neon-amber' : 'neon-red'}/20`}>
                        {s.risk_level} Risk
                      </span>
                    </div>
                    <h4 className="text-base font-bold text-white mb-1">{s.name}</h4>
                    <p className="text-xs text-slate-400 leading-relaxed mb-3 line-clamp-2">{s.description}</p>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <div className="text-center py-2 rounded-lg bg-white/[0.03]">
                        <p className="text-[9px] text-slate-500 uppercase tracking-wide mb-0.5">Strategy</p>
                        <p className="text-xs font-bold text-neon-cyan">{s.strategy_type}</p>
                      </div>
                      <div className="text-center py-2 rounded-lg bg-white/[0.03]">
                        <p className="text-[9px] text-slate-500 uppercase tracking-wide mb-0.5">Copies</p>
                        <p className="text-xs font-bold text-slate-300">{formatCompact(s.total_copies)}</p>
                      </div>
                    </div>
                    <button onClick={onDeploy} className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 btn-neon-${accent === 'amber' ? 'cyan' : accent} hover:scale-[1.02]`}>
                      <Rocket className="w-4 h-4" /> Deploy on Autopilot
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent signals + Top movers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-neon-green" />
            Latest AI Signals
          </h3>
          {signals.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">No signals yet. Signals will appear when the AI engine generates them.</p>
          ) : (
            <div className="space-y-2">
              {signals.map((sig) => (
                <div key={sig.id} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-white/[0.03] transition-colors">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${sig.signal_type === 'BUY' ? 'bg-neon-green/15 text-neon-green' : 'bg-neon-red/15 text-neon-red'}`}>
                      {sig.signal_type}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{sig.coin}</p>
                      <p className="text-[10px] text-slate-500">{new Date(sig.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-slate-200">{sig.entry_price ? formatPrice(Number(sig.entry_price)) : '—'}</p>
                    <p className="text-[10px] text-neon-cyan">{sig.confidence}% conf.</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-neon-cyan" />
            Top Movers (24h)
            <span className={`ml-auto flex items-center gap-1 text-[10px] font-semibold ${liveConnected ? 'text-neon-green' : 'text-neon-amber'}`}>
              <span className={`relative flex h-1.5 w-1.5 ${liveConnected ? '' : 'animate-pulse'}`}>
                <span className={`absolute inline-flex h-full w-full rounded-full ${liveConnected ? 'bg-neon-green' : 'bg-neon-amber'} opacity-75`} />
              </span>
              {liveConnected ? 'LIVE' : 'CONNECTING'}
            </span>
          </h3>
          {liveCoins.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">Connecting to live price feed...</p>
          ) : (
            <div className="space-y-2">
              {[...liveCoins].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h)).slice(0, 5).map((c) => (
                <div key={c.symbol} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-white/[0.03] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.06] flex items-center justify-center text-[10px] font-bold text-slate-300">
                      {c.symbol.slice(0, 3)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{c.symbol}</p>
                      <p className="text-[10px] text-slate-500">{formatCompact(c.volume24h)} vol</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Sparkline data={c.sparkline} color={c.change24h >= 0 ? '#00ff9d' : '#ff3b5c'} width={60} height={24} />
                    <div className="text-right">
                      <p className="text-sm font-mono text-slate-200">{formatPrice(c.price)}</p>
                      <p className={`text-[10px] font-semibold ${c.change24h >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                        {c.change24h >= 0 ? '+' : ''}{c.change24h.toFixed(2)}%
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent, sub }: { label: string; value: string; icon: typeof DollarSign; accent: keyof typeof accentMap; sub: string }) {
  const a = accentMap[accent];
  return (
    <div className="glass-card p-4 relative overflow-hidden group hover:border-white/[0.12] transition-all duration-300">
      <div className={`absolute -top-8 -right-8 w-24 h-24 ${a.bg} rounded-full blur-2xl opacity-50 group-hover:opacity-100 transition-opacity`} />
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">{label}</span>
          <Icon className={`w-4 h-4 ${a.text}`} />
        </div>
        <p className="text-lg sm:text-xl font-bold text-white font-mono">{value}</p>
        <p className={`text-[10px] mt-0.5 ${a.text}`}>{sub}</p>
      </div>
    </div>
  );
}
