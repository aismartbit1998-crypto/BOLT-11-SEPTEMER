export interface Coin {
  symbol: string;
  name: string;
  marketCap: number;
}

export const coins: Coin[] = [
  { symbol: 'BTC', name: 'Bitcoin', marketCap: 1_300_000_000_000 },
  { symbol: 'ETH', name: 'Ethereum', marketCap: 380_000_000_000 },
  { symbol: 'SOL', name: 'Solana', marketCap: 80_000_000_000 },
  { symbol: 'BNB', name: 'BNB', marketCap: 90_000_000_000 },
  { symbol: 'XRP', name: 'Ripple', marketCap: 60_000_000_000 },
  { symbol: 'ADA', name: 'Cardano', marketCap: 25_000_000_000 },
  { symbol: 'AVAX', name: 'Avalanche', marketCap: 12_000_000_000 },
  { symbol: 'DOT', name: 'Polkadot', marketCap: 10_000_000_000 },
  { symbol: 'LINK', name: 'Chainlink', marketCap: 9_000_000_000 },
  { symbol: 'MATIC', name: 'Polygon', marketCap: 8_000_000_000 },
];
