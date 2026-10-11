import { useEffect, useState } from 'react';
import { Activity, Play, Pause, Square, TrendingUp, Clock, Target, Zap, Loader2, Bot as BotIcon } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { type Bot } from '@cortex/shared/lib/supabase';
import { useAuth } from '@cortex/shared/context/AuthContext';

const API_BASE = import.meta.env.VITE_ENGINE_URL || '';

const statusConfig = {
  running: { color: 'text-neon-green', bg: 'bg-neon-green/10', border: 'border-neon-green/30', label: 'RUNNING' },
  paused: { color: 'text-neon-amber', bg: 'bg-neon-amber/10', border: 'border-neon-amber/30', label: 'PAUSED' },
  idle: { color: 'text-slate-500', bg: 'bg-white/[0.03]', border: 'border-white/[0.06]', label: 'IDLE' },
};

export default function TradingStatusView() {
  const { formatCurrency, tradingMode } = useApp();
  const { user } = useAuth();
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const url = user?.id
      ? `${API_BASE}/api/user/bots?user_id=${user.id}${tradingMode ? `&trading_mode=${tradingMode}` : ''}`
      : `${API_BASE}/api/user/bots${tradingMode ? `?trading_mode=${tradingMode}` : ''}`;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (!mounted) return;
        setBots((data.bots as Bot[]) ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setBots([]);
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [tradingMode, user?.id]);

  const totalPnl = bots.reduce((sum, b) => sum + Number(b.profit_loss), 0);
  const activeCount = bots.filter(b => b.status === 'running').length;

  const updateStatus = async (id: string, status: Bot['status']) => {
    setBots(prev => prev.map(b => b.id === id ? { ...b, status } : b));
    await fetch(`${API_BASE}/api/user/bots/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-neon-cyan animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-slide-up">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-neon-cyan" />
          Trading Status
        </h2>
        <p className="text-sm text-slate-400">Monitor all active and idle trading bots in real-time</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat label="Active Bots" value={`${activeCount}/${bots.length}`} icon={Zap} color="text-neon-green" />
        <MiniStat label="Total P&L" value={formatCurrency(totalPnl)} icon={TrendingUp} color={totalPnl >= 0 ? 'text-neon-green' : 'text-neon-red'} />
        <MiniStat label="Total Bots" value={bots.length.toString()} icon={Target} color="text-neon-cyan" />
        <MiniStat label="System Load" value="34%" icon={Clock} color="text-neon-amber" />
      </div>

      {bots.length === 0 ? (
        <div className="glass-card p-12 flex flex-col items-center justify-center text-center">
          <BotIcon className="w-12 h-12 text-slate-600 mb-3" />
          <p className="text-sm font-semibold text-slate-300">No bots deployed yet</p>
          <p className="text-xs text-slate-500 mt-1">Head to the AI Smart Bot builder to create your first trading bot.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bots.map((bot) => {
            const sc = statusConfig[bot.status];
            return (
              <div key={bot.id} className={`glass-card p-5 relative overflow-hidden ${bot.status === 'running' ? sc.border : ''}`}>
                {bot.status === 'running' && <div className="absolute -top-10 -right-10 w-28 h-28 bg-neon-green/5 rounded-full blur-3xl" />}
                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white">{bot.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{bot.coin}/USDT · {bot.market_type.toUpperCase()}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${sc.bg} ${sc.color} ${sc.border} border flex items-center gap-1.5`}>
                      {bot.status === 'running' && (
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-neon-green" />
                        </span>
                      )}
                      {sc.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-3 mb-4">
                    <BotStat label="Strategy" value={bot.strategy.charAt(0).toUpperCase() + bot.strategy.slice(1)} />
                    <BotStat label="P&L" value={formatCurrency(Number(bot.profit_loss))} accent={Number(bot.profit_loss) > 0 ? 'text-neon-green' : Number(bot.profit_loss) < 0 ? 'text-neon-red' : 'text-slate-400'} />
                    <BotStat label="Market" value={bot.market_type.toUpperCase()} />
                    <BotStat label="Coin" value={bot.coin} />
                  </div>

                  {/* Controls */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateStatus(bot.id, 'running')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${bot.status === 'running' ? 'glass text-slate-400 cursor-default' : 'bg-neon-green/10 text-neon-green border border-neon-green/30 hover:neon-glow-green'}`}
                    >
                      <Play className="w-3.5 h-3.5" /> Start
                    </button>
                    <button
                      onClick={() => updateStatus(bot.id, 'paused')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${bot.status === 'paused' ? 'glass text-slate-400 cursor-default' : 'bg-neon-amber/10 text-neon-amber border border-neon-amber/30 hover:bg-neon-amber/20'}`}
                    >
                      <Pause className="w-3.5 h-3.5" /> Pause
                    </button>
                    <button
                      onClick={() => updateStatus(bot.id, 'idle')}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-neon-red/10 text-neon-red border border-neon-red/30 hover:bg-neon-red/20 transition-all"
                    >
                      <Square className="w-3.5 h-3.5" /> Stop
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof Activity; color: string }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className="text-lg font-bold text-white font-mono">{value}</p>
    </div>
  );
}

function BotStat({ label, value, accent = 'text-slate-200' }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className="text-[9px] text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-xs font-bold font-mono ${accent}`}>{value}</p>
    </div>
  );
}
