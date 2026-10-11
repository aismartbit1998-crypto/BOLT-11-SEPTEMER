import { createContext, useContext, useState, type ReactNode } from 'react';

export type AdminCurrency = 'USD' | 'INR';

const USD_TO_INR = 83;

interface AdminCurrencyValue {
  currency: AdminCurrency;
  setCurrency: (c: AdminCurrency) => void;
  toggleCurrency: () => void;
  convert: (usd: number) => number;
  formatCurrency: (usd: number) => string;
  formatCompact: (usd: number) => string;
  formatPrice: (usd: number) => string;
  symbol: string;
}

const AdminCurrencyContext = createContext<AdminCurrencyValue | null>(null);

export function AdminCurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<AdminCurrency>('USD');

  const toggleCurrency = () => setCurrency(prev => prev === 'USD' ? 'INR' : 'USD');
  const convert = (usd: number) => (currency === 'INR' ? usd * USD_TO_INR : usd);
  const symbol = currency === 'INR' ? '₹' : '$';

  const formatCurrency = (usd: number) => {
    const val = convert(usd);
    if (currency === 'INR') {
      return '₹' + val.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    }
    return '$' + val.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  const formatPrice = (usd: number) => {
    const val = convert(usd);
    if (currency === 'INR') {
      return '₹' + val.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
    }
    return '$' + val.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  };

  const formatCompact = (usd: number) => {
    const val = convert(usd);
    if (currency === 'INR') {
      if (val >= 10000000) return '₹' + (val / 10000000).toFixed(2) + 'Cr';
      if (val >= 100000) return '₹' + (val / 100000).toFixed(2) + 'L';
      if (val >= 1000) return '₹' + (val / 1000).toFixed(1) + 'K';
      return '₹' + val.toFixed(0);
    }
    if (val >= 1_000_000) return '$' + (val / 1_000_000).toFixed(2) + 'M';
    if (val >= 1000) return '$' + (val / 1000).toFixed(1) + 'K';
    return '$' + val.toFixed(0);
  };

  return (
    <AdminCurrencyContext.Provider value={{ currency, setCurrency, toggleCurrency, convert, formatCurrency, formatCompact, formatPrice, symbol }}>
      {children}
    </AdminCurrencyContext.Provider>
  );
}

export function useAdminCurrency() {
  const ctx = useContext(AdminCurrencyContext);
  if (!ctx) throw new Error('useAdminCurrency must be used within AdminCurrencyProvider');
  return ctx;
}
