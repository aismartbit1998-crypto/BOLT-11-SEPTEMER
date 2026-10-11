import { Bitcoin, Search, Star } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { coins } from '@cortex/shared/data/mockData';
import Sparkline from '@cortex/shared/components/Sparkline';

export default function CryptoView({ onTrade }: { onTrade?: (symbol: string) => void }) {
  const { formatCompact, formatPrice, livePrices, liveConnected } = useApp();
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(new Set(['BTC', 'ETH']));

  const liveCoins = coins.map(c => {
    const lp = livePrices[c.symbol];
    return lp
      ? { ...c, price: lp.price, change24h: lp.change24h, volume24h: lp.volume24h, sparkline: lp.sparkline }
      : { ...c, price: 0, change24h: 0, volume24h: 0, sparkline: [] };
  }).filter(c => c.price > 0);

  const filtered = liveCoins.filter(c =>
    c.symbol.toLowerCase().includes(search.toLowerCase()) ||
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleFav = (sym: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(sym)) {
        next.delete(sym);
      } else {
        next.add(sym);
      }
      return next;
    });
  };

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Bitcoin className="w-5 h-5 text-neon-amber" />
            Crypto Markets
            <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md ${liveConnected ? 'bg-neon-green/10 text-neon-green' : 'bg-neon-amber/10 text-neon-amber'}`}>
              <span className={`relative flex h-1.5 w-1.5 ${liveConnected ? '' : 'animate-pulse'}`}>
                <span className={`absolute inline-flex h-full w-full rounded-full ${liveConnected ? 'bg-neon-green' : 'bg-neon-amber'} opacity-75`} />
              </span>
              {liveConnected ? 'LIVE' : 'CONNECTING'}
            </span>
          </h2>
          <p className="text-sm text-slate-400">Live prices and market data for top cryptocurrencies</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search coins..."
            className="pl-9 pr-4 py-2.5 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-cyan/40 transition-colors w-full sm:w-64"
          />
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-slate-500">
                <th className="text-left py-3 px-4 font-semibold"></th>
                <th className="text-left py-3 px-4 font-semibold">Asset</th>
                <th className="text-right py-3 px-4 font-semibold">Price</th>
                <th className="text-right py-3 px-4 font-semibold hidden sm:table-cell">24h Change</th>
                <th className="text-right py-3 px-4 font-semibold hidden md:table-cell">Volume (24h)</th>
                <th className="text-right py-3 px-4 font-semibold hidden lg:table-cell">Market Cap</th>
                <th className="text-center py-3 px-4 font-semibold hidden sm:table-cell">Chart (7d)</th>
                <th className="text-right py-3 px-4 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.symbol} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-4">
                    <button onClick={() => toggleFav(c.symbol)} className="text-slate-600 hover:text-neon-amber transition-colors">
                      <Star className={`w-4 h-4 ${favorites.has(c.symbol) ? 'fill-neon-amber text-neon-amber' : ''}`} />
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/[0.06] flex items-center justify-center text-[10px] font-bold text-slate-300">
                        {c.symbol.slice(0, 3)}
                      </div>
                      <div>
                        <p className="font-semibold text-white">{c.symbol}</p>
                        <p className="text-[10px] text-slate-500">{c.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-200 font-semibold">
                    {formatPrice(c.price)}
                  </td>
                  <td className="py-3 px-4 text-right hidden sm:table-cell">
                    <span className={`font-semibold ${c.change24h >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                      {c.change24h >= 0 ? '+' : ''}{c.change24h.toFixed(2)}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right hidden md:table-cell font-mono text-slate-400">
                    {formatCompact(c.volume24h)}
                  </td>
                  <td className="py-3 px-4 text-right hidden lg:table-cell font-mono text-slate-400">
                    {formatCompact(c.marketCap)}
                  </td>
                  <td className="py-3 px-4 hidden sm:table-cell">
                    <div className="flex justify-center">
                      <Sparkline data={c.sparkline} color={c.change24h >= 0 ? '#00ff9d' : '#ff3b5c'} width={100} height={32} />
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => onTrade?.(c.symbol)}
                      className="px-3 py-1.5 rounded-lg bg-neon-cyan/10 text-neon-cyan text-xs font-semibold border border-neon-cyan/20 hover:bg-neon-cyan/20 transition-all"
                    >
                      Trade
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
