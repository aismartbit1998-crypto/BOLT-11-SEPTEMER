import { useEffect, useState } from 'react';
import { History, ArrowUpRight, ArrowDownRight, Loader2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@cortex/shared/context/AuthContext';
import { supabase, type Trade } from '@cortex/shared/lib/supabase';
import { BrainCircuit } from 'lucide-react';

export default function TradeHistoryView() {
  const { formatCurrency, formatPrice, tradingMode } = useApp();
  const { session } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const userId = session?.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }

    supabase
      .from('trades')
      .select('*')
      .eq('client_id', userId)
      .eq('trading_mode', tradingMode)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!mounted) return;
        setTrades((data as Trade[]) ?? []);
        setLoading(false);
      });

    const channel = supabase
      .channel(`client-trade-history-${tradingMode}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trades', filter: `client_id=eq.${userId}` },
        (payload) => {
          const newTrade = payload.new as Trade;
          if (newTrade.trading_mode !== tradingMode) return;
          setTrades((prev) => [newTrade, ...prev]);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trades', filter: `client_id=eq.${userId}` },
        (payload) => {
          const updated = payload.new as Trade;
          if (updated.trading_mode !== tradingMode) return;
          setTrades((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [tradingMode, session?.user?.id]);

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
          <History className="w-5 h-5 text-neon-cyan" />
          Trade History
        </h2>
        <p className="text-sm text-slate-400">Complete log of all your executed trades</p>
      </div>

      {trades.length === 0 ? (
        <div className="glass-card p-12 flex flex-col items-center justify-center text-center">
          <History className="w-12 h-12 text-slate-600 mb-3" />
          <p className="text-sm font-semibold text-slate-300">No trades yet</p>
          <p className="text-xs text-slate-500 mt-1">Your executed trades will appear here once your bots start trading.</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left py-3 px-4 font-semibold">Time</th>
                  <th className="text-left py-3 px-4 font-semibold">Asset</th>
                  <th className="text-center py-3 px-4 font-semibold">Side</th>
                  <th className="text-center py-3 px-4 font-semibold hidden sm:table-cell">Market</th>
                  <th className="text-right py-3 px-4 font-semibold">Entry Price</th>
                  <th className="text-right py-3 px-4 font-semibold hidden sm:table-cell">Qty</th>
                  <th className="text-center py-3 px-4 font-semibold hidden md:table-cell">Lev</th>
                  <th className="text-center py-3 px-4 font-semibold hidden lg:table-cell">Source</th>
                  <th className="text-center py-3 px-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 text-xs text-slate-500 font-mono">
                      {new Date(t.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="py-3 px-4 font-semibold text-white">{t.coin}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold ${t.direction === 'long' ? 'text-neon-green bg-neon-green/10' : 'text-neon-red bg-neon-red/10'}`}>
                        {t.direction === 'long' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {t.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-xs text-slate-400 hidden sm:table-cell capitalize">{t.market_type}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-200">{formatPrice(Number(t.entry_price))}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-300 hidden sm:table-cell">{Number(t.quantity).toFixed(4)}</td>
                    <td className="py-3 px-4 text-center font-mono text-slate-400 hidden md:table-cell">{t.leverage}x</td>
                    <td className="py-3 px-4 text-center hidden lg:table-cell">
                      {(t as any).executed_by && (t as any).executed_by !== (t as any).user_id ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20">
                          <BrainCircuit className="w-3 h-3" /> AI Generated
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-500">User</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-[10px] font-bold capitalize ${t.status === 'open' ? 'text-neon-cyan' : t.status === 'closed_tp' ? 'text-neon-green' : t.status === 'closed_sl' ? 'text-neon-red' : 'text-slate-500'}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
