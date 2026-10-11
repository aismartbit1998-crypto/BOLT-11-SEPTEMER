import { useState, useEffect, useRef, useCallback } from 'react';

export interface LivePrice {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  sparkline: number[];
}

const BINANCE_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT', 'MATICUSDT',
];

const SYMBOL_MAP: Record<string, string> = {
  BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', BNB: 'BNBUSDT',
  XRP: 'XRPUSDT', ADA: 'ADAUSDT', AVAX: 'AVAXUSDT', DOT: 'DOTUSDT',
  LINK: 'LINKUSDT', MATIC: 'MATICUSDT',
};

const REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k])
);

const sparklineCache: Record<string, number[]> = {};

export function useLivePrices() {
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sparklineTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch24hStats = useCallback(async () => {
    try {
      const symbolsParam = encodeURIComponent(JSON.stringify(BINANCE_SYMBOLS));
      const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${symbolsParam}`);
      if (!res.ok) return;
      const data: Array<{
        symbol: string; lastPrice: string; priceChangePercent: string;
        quoteVolume: string; highPrice: string; lowPrice: string;
      }> = await res.json();

      setPrices(prev => {
        const next = { ...prev };
        for (const item of data) {
          const symbol = REVERSE_MAP[item.symbol] || item.symbol;
          const price = parseFloat(item.lastPrice);
          const sparkline = sparklineCache[symbol] ?? prev[symbol]?.sparkline ?? [];
          next[symbol] = {
            symbol,
            price,
            change24h: parseFloat(item.priceChangePercent),
            volume24h: parseFloat(item.quoteVolume),
            high24h: parseFloat(item.highPrice),
            low24h: parseFloat(item.lowPrice),
            sparkline,
          };
        }
        return next;
      });
    } catch {
      // 24hr stats fetch is supplementary; WS is primary
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket('wss://stream.binance.com:9443/ws/!ticker@arr');
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        fetch24hStats();
      };

      ws.onmessage = (event) => {
        try {
          const raw: Array<{
            s: string; c: string; P: string; q: string; h: string; l: string;
          }> = JSON.parse(event.data);

          setPrices(prev => {
            const next = { ...prev };
            for (const item of raw) {
              if (!REVERSE_MAP[item.s]) continue;
              const symbol = REVERSE_MAP[item.s];
              const price = parseFloat(item.c);
              const sl = sparklineCache[symbol] ?? prev[symbol]?.sparkline ?? [];
              next[symbol] = {
                symbol,
                price,
                change24h: parseFloat(item.P),
                volume24h: parseFloat(item.q),
                high24h: parseFloat(item.h),
                low24h: parseFloat(item.l),
                sparkline: sl,
              };
            }
            return next;
          });
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        setConnected(false);
      };

      ws.onclose = () => {
        setConnected(false);
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        reconnectTimer.current = setTimeout(() => connect(), 3000);
      };
    } catch {
      setConnected(false);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => connect(), 3000);
    }
  }, [fetch24hStats]);

  useEffect(() => {
    connect();

    sparklineTimer.current = setInterval(() => {
      setPrices(prev => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          const p = next[key];
          const arr = [...(sparklineCache[key] ?? p.sparkline ?? [])];
          arr.push(p.price);
          if (arr.length > 40) arr.shift();
          sparklineCache[key] = arr;
          next[key] = { ...p, sparkline: arr };
        }
        return next;
      });
    }, 5000);

    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (sparklineTimer.current) clearInterval(sparklineTimer.current);
    };
  }, [connect]);

  return { prices, connected };
}

export function getBinanceSymbol(coinSymbol: string): string {
  return SYMBOL_MAP[coinSymbol] || `${coinSymbol}USDT`;
}
