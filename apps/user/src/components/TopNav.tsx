import { BrainCircuit, Radio, ToggleLeft, ToggleRight, DollarSign, IndianRupee, AlertTriangle, LogOut, User } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@cortex/shared/context/AuthContext';
import { useMemo } from 'react';

interface Props {
  onPanic: () => void;
}

export default function TopNav({ onPanic }: Props) {
  const { currency, setCurrency, tradingMode, setTradingMode, livePrices, liveConnected, formatPrice } = useApp();
  const { user, signOut } = useAuth();

  const userEmail = user?.email ?? '';
  const emailPrefix = userEmail.split('@')[0];

  const liveTicker = useMemo(() => {
    const keys = Object.keys(livePrices);
    if (keys.length > 0) {
      return keys.map(k => ({
        symbol: k,
        price: livePrices[k].price,
        change: livePrices[k].change24h,
      }));
    }
    return [];
  }, [livePrices]);

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-base-900/70 backdrop-blur-2xl">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 gap-3">
        {/* Brand */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-neon-cyan/20 to-neon-green/20 border border-neon-cyan/30 flex items-center justify-center neon-glow-cyan">
            <BrainCircuit className="w-5 h-5 text-neon-cyan" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-base font-bold tracking-tight">
              <span className="text-neon-cyan neon-text-cyan">Cortex</span>{' '}
              <span className="text-neon-green neon-text-green">AI</span>
            </h1>
            <p className="text-[10px] text-slate-500 -mt-0.5">Next-Gen Trading Intelligence</p>
          </div>
        </div>

        {/* Ticker - hidden on small screens */}
        <div className="hidden lg:flex flex-1 overflow-hidden mx-2">
          <div className="flex gap-6 animate-ticker whitespace-nowrap text-xs">
            {[...liveTicker, ...liveTicker].map((t, i) => (
              <span key={i} className="flex items-center gap-1.5 font-mono">
                <span className="text-slate-400">{t.symbol}</span>
                <span className="text-slate-200">{formatPrice(t.price)}</span>
                <span className={t.change >= 0 ? 'text-neon-green' : 'text-neon-red'}>
                  {t.change >= 0 ? '+' : ''}{t.change.toFixed(2)}%
                </span>
              </span>
            ))}
          </div>
          <span className={`ml-2 flex items-center gap-1 text-[10px] font-semibold flex-shrink-0 ${liveConnected ? 'text-neon-green' : 'text-neon-amber'}`}>
            <span className={`relative flex h-1.5 w-1.5 ${liveConnected ? '' : 'animate-pulse'}`}>
              <span className={`absolute inline-flex h-full w-full rounded-full ${liveConnected ? 'bg-neon-green' : 'bg-neon-amber'} opacity-75`} />
            </span>
            {liveConnected ? 'LIVE' : 'CONNECTING'}
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Live / Paper Toggle */}
          <button
            onClick={() => setTradingMode(tradingMode === 'live' ? 'paper' : 'live')}
            className="flex items-center gap-2 px-3 py-2 rounded-xl glass hover:bg-white/[0.06] transition-all duration-200"
            title={`Currently in ${tradingMode.toUpperCase()} mode`}
          >
            <Radio className={`w-4 h-4 ${tradingMode === 'live' ? 'text-neon-red animate-pulse' : 'text-neon-cyan'}`} />
            <span className={`text-xs font-semibold ${tradingMode === 'live' ? 'text-neon-red neon-text-red' : 'text-neon-cyan'}`}>
              {tradingMode === 'live' ? 'LIVE' : 'PAPER'}
            </span>
            {tradingMode === 'live' ? (
              <ToggleRight className="w-5 h-5 text-neon-red" />
            ) : (
              <ToggleLeft className="w-5 h-5 text-neon-cyan" />
            )}
          </button>

          {/* Currency Switcher */}
          <button
            onClick={() => setCurrency(currency === 'USD' ? 'INR' : 'USD')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass hover:bg-white/[0.06] transition-all duration-200"
          >
            {currency === 'USD' ? <DollarSign className="w-4 h-4 text-neon-green" /> : <IndianRupee className="w-4 h-4 text-neon-green" />}
            <span className="text-xs font-semibold text-neon-green">{currency}</span>
          </button>

          {/* Panic Button */}
          <button
            onClick={onPanic}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-neon-red/15 border border-neon-red/40 text-neon-red font-bold text-xs hover:bg-neon-red/25 neon-glow-red transition-all duration-200 active:scale-95 group"
          >
            <AlertTriangle className="w-4 h-4 group-hover:animate-pulse" />
            <span className="hidden sm:inline">PANIC</span>
            <span className="hidden md:inline">Liquidate All</span>
          </button>

          {/* User + Sign Out */}
          <div className="flex items-center gap-2">
            <div className="hidden xl:flex items-center gap-2 px-3 py-2 rounded-xl glass">
              <User className="w-4 h-4 text-neon-cyan" />
              <span className="text-xs text-slate-300 max-w-[120px] truncate">{emailPrefix}</span>
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass hover:bg-neon-red/15 hover:border-neon-red/30 transition-all duration-200"
              title="Sign out"
            >
              <LogOut className="w-4 h-4 text-slate-400 hover:text-neon-red" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
