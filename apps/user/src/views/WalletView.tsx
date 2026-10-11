import { useState, useEffect } from 'react';
import { Wallet, TrendingUp, ArrowDownLeft, ArrowUpRight, Calculator, PieChart, AlertCircle, Loader2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase, type UserFund } from '@cortex/shared/lib/supabase';
import { useAuth } from '@cortex/shared/context/AuthContext';

export default function WalletView() {
  const { formatCurrency, formatPrice, currency } = useApp();
  const { user } = useAuth();
  const [funds, setFunds] = useState<UserFund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calculator inputs
  const [entryPrice, setEntryPrice] = useState(67000);
  const [stopPrice, setStopPrice] = useState(65000);
  const [riskAmount, setRiskAmount] = useState(1000);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    const fetchFunds = async () => {
      const { data, error } = await supabase
        .from('user_funds')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) {
        setError(error.message);
      } else {
        setFunds((data as UserFund[]) ?? []);
      }
      setLoading(false);
    };
    fetchFunds();
    const channel = supabase
      .channel('user-funds-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_funds', filter: `user_id=eq.${user.id}` }, () => fetchFunds())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const totalBalance = funds.reduce((s, f) => s + Number(f.balance), 0);
  const totalUnrealized = funds.reduce((s, f) => s + Number(f.unrealized_pnl), 0);
  const totalRealized = funds.reduce((s, f) => s + Number(f.realized_pnl), 0);
  const totalValue = totalBalance + totalUnrealized;

  const riskPerUnit = entryPrice - stopPrice;
  const positionSize = riskPerUnit > 0 ? riskAmount / riskPerUnit : 0;
  const positionValue = positionSize * entryPrice;

  const currencySymbol = currency === 'INR' ? '\u20B9' : '$';

  if (loading) {
    return (
      <div className="space-y-5 animate-slide-up">
        <h2 className="text-xl font-bold text-white flex items-center gap-2"><Wallet className="w-5 h-5 text-neon-green" /> Wallet & Calculation</h2>
        <div className="glass-card p-12 text-center"><Loader2 className="w-6 h-6 text-neon-green animate-spin mx-auto" /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5 animate-slide-up">
        <h2 className="text-xl font-bold text-white flex items-center gap-2"><Wallet className="w-5 h-5 text-neon-green" /> Wallet & Calculation</h2>
        <div className="glass-card p-8 text-center border-neon-red/20">
          <AlertCircle className="w-8 h-8 text-neon-red mx-auto mb-3" />
          <p className="text-sm font-semibold text-white">Failed to load wallet data</p>
          <p className="text-xs text-slate-500 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-slide-up">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2"><Wallet className="w-5 h-5 text-neon-green" /> Wallet & Calculation</h2>
        <p className="text-sm text-slate-400">Portfolio overview and trading calculators</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white">Total Portfolio Value</h3>
            <PieChart className="w-4 h-4 text-neon-cyan" />
          </div>
          <p className="text-3xl font-bold text-white font-mono">{formatCurrency(totalValue)}</p>
          <div className="flex items-center gap-3 mt-2">
            <span className={`text-sm font-semibold ${totalUnrealized >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
              {totalUnrealized >= 0 ? '+' : ''}{formatCurrency(totalUnrealized)} unrealized
            </span>
            <span className="text-xs text-slate-500">across {funds.length} exchanges</span>
          </div>
          {funds.length > 0 && (
            <div className="mt-5 space-y-3">
              {funds.map((f) => {
                const pct = totalValue > 0 ? (Number(f.balance) / totalValue) * 100 : 0;
                return (
                  <div key={f.id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-300 font-semibold">{f.exchange_name}</span>
                      <span className="text-slate-400 font-mono">{formatCurrency(Number(f.balance))} · {pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-base-700 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-neon-cyan/60 to-neon-green/60 transition-all duration-1000" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Available Balance</span>
              <Wallet className="w-4 h-4 text-neon-green" />
            </div>
            <p className="text-xl font-bold text-white font-mono">{formatCurrency(totalBalance)}</p>
          </div>
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Realized P&L</span>
              <TrendingUp className="w-4 h-4 text-neon-green" />
            </div>
            <p className={`text-xl font-bold font-mono ${totalRealized >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>{totalRealized >= 0 ? '+' : ''}{formatCurrency(totalRealized)}</p>
          </div>
          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-2"><ArrowDownLeft className="w-4 h-4 text-neon-green" /><span className="text-xs text-slate-400">Deposit</span></div>
            <div className="flex items-center gap-3 mb-2"><ArrowUpRight className="w-4 h-4 text-neon-red" /><span className="text-xs text-slate-400">Withdraw</span></div>
          </div>
        </div>
      </div>

      <div className="glass-card p-5">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Calculator className="w-4 h-4 text-neon-amber" /> Position Size Calculator</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CalcInputField
            label="Entry Price"
            value={entryPrice}
            onChange={setEntryPrice}
            prefix={currencySymbol}
          />
          <CalcInputField
            label="Stop Loss Price"
            value={stopPrice}
            onChange={setStopPrice}
            prefix={currencySymbol}
          />
          <CalcInputField
            label={`Risk Amount (${currency})`}
            value={riskAmount}
            onChange={setRiskAmount}
            prefix={currencySymbol}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <CalcOutput label="Risk Per Unit" value={formatPrice(riskPerUnit > 0 ? riskPerUnit : 0)} />
          <CalcOutput label="Position Size" value={`${positionSize.toFixed(6)} units`} accent="text-neon-cyan" />
          <CalcOutput label="Position Value" value={formatCurrency(positionValue)} accent="text-neon-green" />
          <CalcOutput label="Risk % of Balance" value={totalBalance > 0 ? `${((riskAmount / totalBalance) * 100).toFixed(1)}%` : '—'} />
        </div>
        {riskPerUnit <= 0 && entryPrice > 0 && stopPrice > 0 && (
          <div className="mt-3 text-xs text-neon-amber">
            Stop loss must be below entry price for a long position.
          </div>
        )}
      </div>

      {funds.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.06]"><h3 className="text-sm font-bold text-white">Holdings by Exchange</h3></div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.04] text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left py-2.5 px-5 font-semibold">Exchange</th>
                  <th className="text-right py-2.5 px-5 font-semibold">Balance</th>
                  <th className="text-right py-2.5 px-5 font-semibold hidden sm:table-cell">Unrealized P&L</th>
                  <th className="text-right py-2.5 px-5 font-semibold hidden sm:table-cell">Realized P&L</th>
                  <th className="text-center py-2.5 px-5 font-semibold hidden md:table-cell">Manual Trading</th>
                </tr>
              </thead>
              <tbody>
                {funds.map((f) => (
                  <tr key={f.id} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-5 font-semibold text-white">{f.exchange_name}</td>
                    <td className="py-3 px-5 text-right font-mono text-slate-200">{formatCurrency(Number(f.balance))}</td>
                    <td className="py-3 px-5 text-right font-mono hidden sm:table-cell"><span className={Number(f.unrealized_pnl) >= 0 ? 'text-neon-green' : 'text-neon-red'}>{Number(f.unrealized_pnl) >= 0 ? '+' : ''}{formatCurrency(Number(f.unrealized_pnl))}</span></td>
                    <td className="py-3 px-5 text-right font-mono hidden sm:table-cell"><span className={Number(f.realized_pnl) >= 0 ? 'text-neon-green' : 'text-neon-red'}>{Number(f.realized_pnl) >= 0 ? '+' : ''}{formatCurrency(Number(f.realized_pnl))}</span></td>
                    <td className="py-3 px-5 text-center hidden md:table-cell"><span className={`px-2 py-1 rounded-md text-[10px] font-bold ${f.manual_trading_enabled ? 'bg-neon-green/10 text-neon-green' : 'bg-white/[0.05] text-slate-500'}`}>{f.manual_trading_enabled ? 'ENABLED' : 'DISABLED'}</span></td>
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

function CalcInputField({ label, value, onChange, prefix }: { label: string; value: number; onChange: (v: number) => void; prefix?: string }) {
  return (
    <div className="p-3 rounded-xl glass">
      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-sm text-slate-400 font-mono">{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={e => onChange(Number(e.target.value) || 0)}
          className="w-full bg-transparent text-sm font-bold text-white font-mono focus:outline-none focus:ring-0"
        />
      </div>
    </div>
  );
}

function CalcOutput({ label, value, accent = 'text-white' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-sm font-bold font-mono ${accent}`}>{value}</p>
    </div>
  );
}
