import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useLivePrices, type LivePrice } from '@/hooks/useLivePrices';

export type Currency = 'USD' | 'INR';
export type TradingMode = 'live' | 'paper';

interface AppContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  tradingMode: TradingMode;
  setTradingMode: (m: TradingMode) => void;
  formatCurrency: (usd: number) => string;
  formatCompact: (usd: number) => string;
  formatPrice: (usd: number) => string;
  convert: (usd: number) => number;
  usdToInrRate: number;
  livePrices: Record<string, LivePrice>;
  liveConnected: boolean;
}

const FALLBACK_USD_TO_INR = 83.5;
const RATE_CACHE_KEY = 'cortex_usd_inr_rate';
const RATE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('cortex_currency') : null;
    return saved === 'INR' || saved === 'USD' ? saved : 'INR';
  });
  const [tradingMode, setTradingModeState] = useState<TradingMode>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('cortex_trading_mode') : null;
    return saved === 'live' || saved === 'paper' ? saved : 'paper';
  });
  const [usdToInrRate, setUsdToInrRate] = useState<number>(FALLBACK_USD_TO_INR);

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    try { localStorage.setItem('cortex_currency', c); } catch {}
  };

  const setTradingMode = (m: TradingMode) => {
    setTradingModeState(m);
    try { localStorage.setItem('cortex_trading_mode', m); } catch {}
  };

  useEffect(() => {
    try { localStorage.setItem('cortex_currency', currency); } catch {}
  }, [currency]);

  useEffect(() => {
    try { localStorage.setItem('cortex_trading_mode', tradingMode); } catch {}
  }, [tradingMode]);

  // Fetch live USD/INR exchange rate (cached for 5 minutes)
  useEffect(() => {
    const fetchRate = async () => {
      try {
        const cached = typeof window !== 'undefined' ? localStorage.getItem(RATE_CACHE_KEY) : null;
        const cachedTime = typeof window !== 'undefined' ? localStorage.getItem(RATE_CACHE_KEY + '_ts') : null;
        if (cached && cachedTime) {
          const age = Date.now() - Number(cachedTime);
          if (age < RATE_CACHE_TTL) {
            setUsdToInrRate(Number(cached));
            return;
          }
        }
        const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        if (res.ok) {
          const data = await res.json();
          const rate = data.rates?.INR;
          if (rate && rate > 0) {
            setUsdToInrRate(rate);
            try {
              localStorage.setItem(RATE_CACHE_KEY, String(rate));
              localStorage.setItem(RATE_CACHE_KEY + '_ts', String(Date.now()));
            } catch {}
          }
        }
      } catch {
        // Keep fallback rate if fetch fails
      }
    };
    fetchRate();
    const interval = setInterval(fetchRate, RATE_CACHE_TTL);
    return () => clearInterval(interval);
  }, []);

  const { prices: livePrices, connected: liveConnected } = useLivePrices();

  const convert = (usd: number) => (currency === 'INR' ? usd * usdToInrRate : usd);

  const formatCurrency = (usd: number) => {
    const val = convert(usd);
    if (currency === 'INR') {
      return '\u20B9' + val.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
    }
    return '$' + val.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  };

  const formatCompact = (usd: number) => {
    const val = convert(usd);
    if (currency === 'INR') {
      if (val >= 10000000) return '\u20B9' + (val / 10000000).toFixed(2) + 'Cr';
      if (val >= 100000) return '\u20B9' + (val / 100000).toFixed(2) + 'L';
      if (val >= 1000) return '\u20B9' + (val / 1000).toFixed(1) + 'K';
      return '\u20B9' + val.toFixed(0);
    }
    if (val >= 1_000_000) return '$' + (val / 1_000_000).toFixed(2) + 'M';
    if (val >= 1000) return '$' + (val / 1000).toFixed(1) + 'K';
    return '$' + val.toFixed(0);
  };

  const formatPrice = (usd: number) => {
    const val = convert(usd);
    if (currency === 'INR') {
      return '\u20B9' + val.toLocaleString('en-IN', { maximumFractionDigits: val < 100 ? 2 : 0 });
    }
    return '$' + val.toLocaleString('en-US', { maximumFractionDigits: val < 1 ? 4 : val < 100 ? 2 : 0 });
  };

  return (
    <AppContext.Provider value={{ currency, setCurrency, tradingMode, setTradingMode, formatCurrency, formatCompact, formatPrice, convert, usdToInrRate, livePrices, liveConnected }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
