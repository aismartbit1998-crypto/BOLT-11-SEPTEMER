import { useState } from 'react';
import {
  ArrowUpRight, ArrowDownRight, TrendingUp, Shield, Target,
  Gauge, Activity, Clock, Flame, Zap, Coins, DollarSign,
} from 'lucide-react';
import { coins } from '@cortex/shared/data/mockData';

function stripNumber(raw: string): number {
  if (raw === '' || raw === '-') return 0;
  const cleaned = raw.replace(/^0+(?=\d)/, '');
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

export interface StrategyPayload {
  coin: string;
  market_type: 'spot' | 'futures';
  direction: 'long' | 'short';
  order_type: 'market' | 'limit';
  limit_price: number | null;
  use_indicator: boolean;
  indicator: string;
  quantity: number;
  investment_amount_inr: number | null;
  rr_ratio: number;
  max_trades_per_day: number;
  tp_sl_mode: 'percentage' | 'points';
  take_profit: number;
  stop_loss: number;
  trailing_stop: boolean;
  trailing_distance: number;
  max_daily_loss: number;
  max_daily_profit: number;
  leverage: number;
}

interface Props {
  onExecute: (payload: StrategyPayload) => void;
  loading: boolean;
  clientName: string;
}

const indicatorOptions = ['RSI', 'MACD', 'EMA Crossover', 'SMC Order Blocks', 'Bollinger Bands'];

export default function StrategyBuilderForm({ onExecute, loading, clientName }: Props) {
  const [coin, setCoin] = useState('BTC');
  const [marketType, setMarketType] = useState<'spot' | 'futures'>('futures');
  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [limitPrice, setLimitPrice] = useState<number | ''>('');
  const [useIndicator, setUseIndicator] = useState(false);
  const [indicator, setIndicator] = useState('RSI');
  const [sizeMode, setSizeMode] = useState<'quantity' | 'inr'>('quantity');
  const [quantity, setQuantity] = useState<number>(0.1);
  const [investmentAmountInr, setInvestmentAmountInr] = useState<number>(5000);
  const [rrRatio, setRrRatio] = useState<number>(2);
  const [maxTradesPerDay, setMaxTradesPerDay] = useState<number>(20);
  const [tpSlMode, setTpSlMode] = useState<'percentage' | 'points'>('percentage');
  const [takeProfit, setTakeProfit] = useState<number>(5);
  const [stopLoss, setStopLoss] = useState<number>(2);
  const [trailingStop, setTrailingStop] = useState(false);
  const [trailingDistance, setTrailingDistance] = useState<number>(1.5);
  const [maxDailyLoss, setMaxDailyLoss] = useState<number>(500);
  const [maxDailyProfit, setMaxDailyProfit] = useState<number>(1000);
  const [leverage, setLeverage] = useState<number>(10);

  const selectedCoinData = coins.find(c => c.symbol === coin) || coins[0];
  const livePrice = selectedCoinData?.price || 64200;
  const usdFromInr = investmentAmountInr / 83.5;
  const effectiveQuantity = sizeMode === 'inr' ? usdFromInr / livePrice : quantity;
  const notionalValue = effectiveQuantity * livePrice;
  const requiredMargin = marketType === 'futures' ? notionalValue / (leverage || 1) : notionalValue;

  const handleExecute = () => {
    onExecute({
      coin,
      market_type: marketType,
      direction,
      order_type: orderType,
      limit_price: orderType === 'limit' && limitPrice !== '' ? Number(limitPrice) : null,
      use_indicator: useIndicator,
      indicator: useIndicator ? indicator : 'None',
      quantity: effectiveQuantity,
      investment_amount_inr: sizeMode === 'inr' ? investmentAmountInr : null,
      rr_ratio: rrRatio,
      max_trades_per_day: maxTradesPerDay,
      tp_sl_mode: tpSlMode,
      take_profit: takeProfit,
      stop_loss: stopLoss,
      trailing_stop: trailingStop,
      trailing_distance: trailingStop ? trailingDistance : 0,
      max_daily_loss: maxDailyLoss,
      max_daily_profit: maxDailyProfit,
      leverage: marketType === 'futures' ? leverage : 1,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
        <div>
          <p className="text-xs text-slate-400">Strategy Builder for: <span className="text-neon-cyan font-semibold">{clientName}</span></p>
          <p className="text-[10px] text-slate-500 mt-0.5">Source: AI Generated</p>
        </div>
        <span className="px-2.5 py-1 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 text-[10px] font-bold text-neon-cyan flex items-center gap-1">
          <Zap className="w-3 h-3" /> MANUAL OVERRIDE
        </span>
      </div>

      {/* Row 1: Direction + Market Type */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Trade Direction</label>
          <div className="flex gap-2">
            <button
              onClick={() => setDirection('long')}
              className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                direction === 'long' ? 'bg-neon-green/15 text-neon-green border border-neon-green/30' : 'bg-white/[0.03] text-slate-400 border border-white/[0.06]'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" /> Long
            </button>
            <button
              onClick={() => setDirection('short')}
              className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                direction === 'short' ? 'bg-neon-red/15 text-neon-red border border-neon-red/30' : 'bg-white/[0.03] text-slate-400 border border-white/[0.06]'
              }`}
            >
              <ArrowDownRight className="w-3.5 h-3.5" /> Short
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Market Type</label>
          <div className="flex gap-2">
            {(['spot', 'futures'] as const).map(mt => (
              <button
                key={mt}
                onClick={() => setMarketType(mt)}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold capitalize transition-all ${
                  marketType === mt ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30' : 'bg-white/[0.03] text-slate-400 border border-white/[0.06]'
                }`}
              >
                {mt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Coin Selector + Order Type */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Coin / Asset</label>
          <select
            value={coin}
            onChange={e => setCoin(e.target.value)}
            className="modal-input capitalize"
          >
            {coins.map(c => (
              <option key={c.symbol} value={c.symbol} className="bg-base-850">
                {c.symbol} — {c.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 mt-1.5">
            Live Price: <span className="text-white font-mono font-bold">${livePrice.toLocaleString()}</span>
          </p>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Order Type</label>
          <div className="flex gap-2">
            {(['market', 'limit'] as const).map(ot => (
              <button
                key={ot}
                onClick={() => setOrderType(ot)}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold capitalize transition-all ${
                  orderType === ot ? 'bg-neon-amber/15 text-neon-amber border border-neon-amber/30' : 'bg-white/[0.03] text-slate-400 border border-white/[0.06]'
                }`}
              >
                {ot}
              </button>
            ))}
          </div>
          {orderType === 'limit' && (
            <input
              type="number"
              step="0.01"
              value={limitPrice}
              onChange={e => setLimitPrice(e.target.value === '' ? '' : Number(e.target.value))}
              className="modal-input font-mono mt-2"
              placeholder="Limit price (USD)"
            />
          )}
        </div>
      </div>

      {/* Row 3: Technical Indicator */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-slate-400 font-semibold">Use Technical Indicator</label>
          <button
            onClick={() => setUseIndicator(!useIndicator)}
            className={`relative w-10 h-5.5 rounded-full transition-all ${useIndicator ? 'bg-neon-cyan/30' : 'bg-white/[0.06]'}`}
            style={{ height: '22px' }}
          >
            <span
              className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
              style={{
                left: useIndicator ? '22px' : '2px',
                background: useIndicator ? '#00e5ff' : '#64748b',
              }}
            />
          </button>
        </div>
        {useIndicator && (
          <div className="flex flex-wrap gap-2">
            {indicatorOptions.map(ind => (
              <button
                key={ind}
                onClick={() => setIndicator(ind)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  indicator === ind
                    ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30'
                    : 'bg-white/[0.03] text-slate-400 border border-white/[0.06]'
                }`}
              >
                {ind}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Row 4: Trade Size (Quantity vs INR) + Leverage */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Trade Size</label>
          <div className="flex gap-1 p-0.5 rounded-lg bg-white/[0.03] mb-2">
            <button
              onClick={() => setSizeMode('quantity')}
              className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-all ${sizeMode === 'quantity' ? 'bg-neon-green/20 text-neon-green' : 'text-slate-400'}`}
            >
              <Coins className="w-3 h-3 inline mr-1" />Quantity
            </button>
            <button
              onClick={() => setSizeMode('inr')}
              className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-all ${sizeMode === 'inr' ? 'bg-neon-green/20 text-neon-green' : 'text-slate-400'}`}
            >
              <DollarSign className="w-3 h-3 inline mr-1" />INR Amount
            </button>
          </div>
          {sizeMode === 'quantity' ? (
            <input
              type="number"
              step="0.0001"
              min="0"
              value={quantity}
              onChange={e => setQuantity(Math.max(0, stripNumber(e.target.value)))}
              className="modal-input font-mono"
              placeholder="e.g. 0.1, 0.01, 1.5"
            />
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-sm text-neon-green font-mono font-bold">₹</span>
              <input
                type="number"
                step="100"
                min="0"
                value={investmentAmountInr}
                onChange={e => setInvestmentAmountInr(Math.max(0, stripNumber(e.target.value)))}
                className="modal-input font-mono"
                placeholder="e.g. 5000, 10000"
              />
            </div>
          )}
          <p className="text-[10px] text-slate-500 mt-1">
            {sizeMode === 'quantity'
              ? 'Supports fractional values for expensive assets (BTC, ETH)'
              : `Auto-calculates: ${effectiveQuantity.toFixed(6)} ${coin}`}
          </p>
        </div>
        {marketType === 'futures' && (
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Leverage ({leverage}x)</label>
            <input
              type="range"
              min="1"
              max="100"
              value={leverage}
              onChange={e => setLeverage(Number(e.target.value))}
              className="w-full accent-neon-cyan cursor-pointer"
            />
          </div>
        )}
      </div>

      {/* Row 5: Risk & Reward + Max Trades */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block font-semibold flex items-center gap-1">
            <Target className="w-3 h-3" /> Risk : Reward Ratio
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-mono">1 :</span>
            <input
              type="number"
              step="0.5"
              min="0.5"
              value={rrRatio}
              onChange={e => setRrRatio(Math.max(0.5, stripNumber(e.target.value)) || 1)}
              className="modal-input font-mono"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block font-semibold flex items-center gap-1">
            <Activity className="w-3 h-3" /> Max Trades Per Day
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={maxTradesPerDay}
            onChange={e => setMaxTradesPerDay(Math.max(1, Math.floor(stripNumber(e.target.value) || 1)))}
            className="modal-input font-mono"
          />
        </div>
      </div>

      {/* Row 6: TP/SL Mode Toggle + Values */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-slate-400 font-semibold">Advanced Exit / Stop Loss</label>
          <div className="flex gap-1 p-0.5 rounded-lg bg-white/[0.03]">
            <button
              onClick={() => setTpSlMode('percentage')}
              className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${tpSlMode === 'percentage' ? 'bg-neon-cyan/25 text-neon-cyan' : 'text-slate-400'}`}
            >
              Percentage (%)
            </button>
            <button
              onClick={() => setTpSlMode('points')}
              className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${tpSlMode === 'points' ? 'bg-neon-cyan/25 text-neon-cyan' : 'text-slate-400'}`}
            >
              Points
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">Take Profit {tpSlMode === 'percentage' ? '(%)' : '(pts)'}</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={takeProfit}
              onChange={e => setTakeProfit(Math.max(0, stripNumber(e.target.value)))}
              className="modal-input font-mono text-neon-green"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">Stop Loss {tpSlMode === 'percentage' ? '(%)' : '(pts)'}</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={stopLoss}
              onChange={e => setStopLoss(Math.max(0, stripNumber(e.target.value)))}
              className="modal-input font-mono text-neon-red"
            />
          </div>
        </div>
      </div>

      {/* Row 7: Trailing Stop Loss */}
      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-slate-400 font-semibold flex items-center gap-1">
            <Gauge className="w-3 h-3" /> Trailing Stop Loss
          </label>
          <button
            onClick={() => setTrailingStop(!trailingStop)}
            className={`relative rounded-full transition-all ${trailingStop ? 'bg-neon-cyan/30' : 'bg-white/[0.06]'}`}
            style={{ width: '40px', height: '22px' }}
          >
            <span
              className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
              style={{
                left: trailingStop ? '22px' : '2px',
                background: trailingStop ? '#00e5ff' : '#64748b',
              }}
            />
          </button>
        </div>
        {trailingStop && (
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">Trailing Distance (%)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={trailingDistance}
              onChange={e => setTrailingDistance(Math.max(0, stripNumber(e.target.value)))}
              className="modal-input font-mono"
            />
          </div>
        )}
      </div>

      {/* Row 8: Daily Sub-Limits */}
      <div className="p-3.5 rounded-xl bg-neon-red/5 border border-neon-red/15">
        <label className="text-xs font-bold text-neon-red mb-3 block flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" /> Daily Sub-Limits (Strict)
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">Max Daily Loss</label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-neon-red font-mono font-bold">$</span>
              <input
                type="number"
                min="0"
                step="50"
                value={maxDailyLoss}
                onChange={e => setMaxDailyLoss(Math.max(0, stripNumber(e.target.value)))}
                className="modal-input font-mono text-neon-red"
                placeholder="e.g. 500"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">Max Daily Profit</label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-neon-green font-mono font-bold">$</span>
              <input
                type="number"
                min="0"
                step="50"
                value={maxDailyProfit}
                onChange={e => setMaxDailyProfit(Math.max(0, stripNumber(e.target.value)))}
                className="modal-input font-mono text-neon-green"
                placeholder="e.g. 1000"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Summary Panel */}
      <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2 text-xs font-mono">
        <div className="flex justify-between text-slate-400">
          <span>Calculated Quantity:</span>
          <span className="text-white font-bold">{effectiveQuantity.toFixed(4)} {coin}</span>
        </div>
        <div className="flex justify-between text-slate-400">
          <span>Notional Value:</span>
          <span className="text-neon-cyan font-bold">${notionalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between text-slate-400 pt-2 border-t border-white/[0.06]">
          <span>Required Margin:</span>
          <span className="text-neon-green font-bold">${requiredMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* Execute Button */}
      <button
        onClick={handleExecute}
        disabled={loading || effectiveQuantity <= 0}
        className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${
          loading || effectiveQuantity <= 0
            ? 'bg-white/[0.03] text-slate-500 border border-white/[0.06] cursor-not-allowed'
            : 'bg-gradient-to-r from-neon-cyan/20 to-neon-green/20 text-white border border-neon-cyan/40 hover:from-neon-cyan/30 hover:to-neon-green/30 neon-glow-cyan hover:scale-[1.02]'
        }`}
      >
        {loading ? (
          <><span className="w-4 h-4 border-2 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin" /> Executing Strategy...</>
        ) : (
          <><Zap className="w-4 h-4" /> Execute Strategy Position</>
        )}
      </button>
    </div>
  );
}
