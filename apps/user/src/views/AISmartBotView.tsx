import { useState, useEffect, useCallback } from 'react';
import {
  Bot, Layers, Crosshair, Shield, Rocket, Zap,
  TrendingUp, TrendingDown, Check, Loader2, Target, Gauge,
  Activity, Clock, Flame, ArrowRightLeft, CircuitBoard,
  Copy, Grid3x3, PiggyBank, ArrowDownRight, ArrowUpRight, Power,
  TestTube2, KeyRound, Crown, Lock, Trash2, Edit3, Settings,
  Radio, Send, Coins, DollarSign,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { coins } from '@cortex/shared/data/mockData';
import { supabase } from '@cortex/shared/lib/supabase';
import { useAuth } from '@cortex/shared/context/AuthContext';
import BacktestModal from '@/components/BacktestModal';
import type { BotFactoryDraft } from '@cortex/shared/types/bot';
import { getBinanceSymbol } from '@/hooks/useLivePrices';

type MarketType = 'spot' | 'futures';
type OrderType = 'market' | 'limit';
type TradeDirection = 'long' | 'short';
type BotType = 'scalper' | 'dca' | 'grid' | 'copier';
type IndicatorTrigger = 'RSI' | 'MACD' | 'EMA Crossover' | 'SMC Order Blocks' | 'None';
type TpSlMode = 'percentage' | 'fixed';
type ExecutionMode = 'auto' | 'manual';
type SizeMode = 'quantity' | 'inr';

function stripNumber(raw: string): number {
  if (raw === '' || raw === '-') return 0;
  const cleaned = raw.replace(/^0+(?=\d)/, '');
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

const indicatorOptions: IndicatorTrigger[] = ['RSI', 'MACD', 'EMA Crossover', 'SMC Order Blocks', 'None'];

interface AssignedBoard {
  id: string;
  license_id: string;
  name: string;
  description: string | null;
  strategy_type: string;
  coin: string;
  market_type: string;
  leverage: number;
  take_profit_pct: number | null;
  stop_loss_pct: number | null;
  indicators: string[] | null;
  risk_level: string;
  max_trades_per_day: number;
  max_daily_loss: number | null;
  max_daily_profit: number | null;
  direction: string | null;
  is_active: boolean;
  is_universal_default?: boolean;
}

const API_BASE = import.meta.env.VITE_ENGINE_URL || '';

const botTypeCards: { id: BotType; label: string; desc: string; icon: typeof Zap }[] = [
  { id: 'scalper', label: 'Scalper', desc: 'Quick in/out trades on micro price movements', icon: Zap },
  { id: 'dca', label: 'DCA', desc: 'Dollar-cost average into positions over time', icon: PiggyBank },
  { id: 'grid', label: 'Grid', desc: 'Place buy/sell orders at set price intervals', icon: Grid3x3 },
  { id: 'copier', label: 'Copier', desc: 'Mirror trades from a signal or master account', icon: Copy },
];

export default function AISmartBotView({ preselectedCoin, onCoinConsumed }: { preselectedCoin?: string | null; onCoinConsumed?: () => void }) {
  const { formatCurrency, formatPrice, currency, tradingMode, livePrices } = useApp();
  const { user } = useAuth();

  // Assigned boards from admin
  const [assignedBoards, setAssignedBoards] = useState<AssignedBoard[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [loadingBoards, setLoadingBoards] = useState(true);

  const fetchAssignedBoards = useCallback(async () => {
    if (!user?.id) { setLoadingBoards(false); return; }
    try {
      const res = await fetch(`${API_BASE}/api/user/assigned-boards?user_id=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.boards) {
          setAssignedBoards(data.boards as AssignedBoard[]);
        }
      }
    } catch {
      // Engine not running
    }
    setLoadingBoards(false);
  }, [user?.id]);

  useEffect(() => {
    fetchAssignedBoards();
  }, [fetchAssignedBoards]);

  // ─── Determine if selected board is universal default (locked) ─────────────
  const selectedBoard = assignedBoards.find(b => b.id === selectedBoardId);
  const isLockedUniversal = selectedBoard?.is_universal_default === true;

  const applyBoard = (board: AssignedBoard) => {
    setSelectedBoardId(board.id);
    const mappedType: BotType = board.strategy_type === 'scalping' ? 'scalper'
      : board.strategy_type === 'grid' ? 'grid'
      : board.strategy_type === 'dca' ? 'dca'
      : 'copier';
    setBotType(mappedType);
    setSelectedCoin(board.coin);
    setMarketType(board.market_type as MarketType);
    setLeverage(board.leverage || 1);
    if (board.take_profit_pct != null) { setTpSlMode('percentage'); setTakeProfit(Number(board.take_profit_pct)); }
    if (board.stop_loss_pct != null) { setStopLoss(Number(board.stop_loss_pct)); }
    if (board.direction) { setTradeDirection(board.direction as TradeDirection); }
    if (board.indicators && board.indicators.length > 0) {
      setIndicatorsEnabled(true);
      const matchInd = indicatorOptions.find(i => board.indicators!.includes(i));
      if (matchInd) setIndicator(matchInd);
    }
    if (board.max_trades_per_day) { setMaxTradesPerDay(board.max_trades_per_day); }
    if (board.max_daily_loss != null) { setMaxDailyLoss(Number(board.max_daily_loss)); }
    if (board.max_daily_profit != null) { setMaxDailyProfit(Number(board.max_daily_profit)); }
  };

  // Market & Asset
  const [marketType, setMarketType] = useState<MarketType>('spot');
  const [leverage, setLeverage] = useState(10);
  const [selectedCoin, setSelectedCoin] = useState('BTC');

  useEffect(() => {
    if (preselectedCoin) {
      setSelectedCoin(preselectedCoin);
      onCoinConsumed?.();
    }
  }, [preselectedCoin, onCoinConsumed]);
  const [botType, setBotType] = useState<BotType>('scalper');
  const [tradeDirection, setTradeDirection] = useState<TradeDirection>('long');
  const [launched, setLaunched] = useState(false);
  const [launching, setLaunching] = useState(false);

  // Entry Logic
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [indicatorsEnabled, setIndicatorsEnabled] = useState(false);
  const [indicator, setIndicator] = useState<IndicatorTrigger>('RSI');

  // Position & Execution — fractional quantity + INR amount
  const [sizeMode, setSizeMode] = useState<SizeMode>('quantity');
  const [tradeQuantity, setTradeQuantity] = useState<number>(0.1);
  const [investmentAmountInr, setInvestmentAmountInr] = useState<number>(5000);
  const [maxTradesPerDay, setMaxTradesPerDay] = useState(20);
  const [rrRatio, setRrRatio] = useState(2);

  // Execution Mode
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('auto');

  // Bot-type-specific config
  // DCA
  const [dcaDropPct, setDcaDropPct] = useState(5);
  const [dcaBuyInterval, setDcaBuyInterval] = useState(100);
  // Grid
  const [gridUpperPrice, setGridUpperPrice] = useState<number>(0);
  const [gridLowerPrice, setGridLowerPrice] = useState<number>(0);
  const [gridLevels, setGridLevels] = useState(10);
  // Copier
  const [copierSource, setCopierSource] = useState('');

  // Advanced Exit & SL/TP
  const [tpSlMode, setTpSlMode] = useState<TpSlMode>('percentage');
  const [takeProfit, setTakeProfit] = useState(5);
  const [stopLoss, setStopLoss] = useState(2);
  const [tpFixed, setTpFixed] = useState(100);
  const [slFixed, setSlFixed] = useState(50);
  const [trailingEnabled, setTrailingEnabled] = useState(false);
  const [trailingDistance, setTrailingDistance] = useState(1.5);

  // Daily Safety Limits
  const [maxDailyLoss, setMaxDailyLoss] = useState(500);
  const [maxDailyProfit, setMaxDailyProfit] = useState(1000);
  const [cooldownMinutes, setCooldownMinutes] = useState(15);

  // Backtest modal
  const [showBacktest, setShowBacktest] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const staticCoinData = coins.find(c => c.symbol === selectedCoin) || coins[0];
  const livePrice = livePrices[selectedCoin]?.price;
  const selectedCoinData = livePrice
    ? { ...staticCoinData, price: livePrice }
    : staticCoinData;

  // Position size computed from either fractional quantity or INR amount
  const usdFromInr = investmentAmountInr / (currency === 'INR' ? 83.5 : 1);
  const effectiveQuantity = sizeMode === 'inr' ? usdFromInr / selectedCoinData.price : tradeQuantity;
  const positionSize = effectiveQuantity * selectedCoinData.price * (marketType === 'futures' ? leverage : 1);
  const effectiveCapital = effectiveQuantity * selectedCoinData.price;
  const coinAmount = effectiveQuantity;

  const tpDisplay = tpSlMode === 'percentage' ? `+${takeProfit}%` : `+${formatCurrency(tpFixed)}`;
  const slDisplay = tpSlMode === 'percentage' ? `-${stopLoss}%` : `-${formatCurrency(slFixed)}`;

  // License enforcement state
  const [userLicense, setUserLicense] = useState<{ bot_limit: number; allotted_strategies: string[] | null; plan_name: string } | null>(null);
  const [runningBotCount, setRunningBotCount] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data: licenseData } = await supabase
        .from('licenses')
        .select('bot_limit, allotted_strategies, plan_name, is_active, valid_until')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (licenseData) {
        const allotted = licenseData.allotted_strategies as string[] | null;
        setUserLicense({
          bot_limit: licenseData.bot_limit,
          allotted_strategies: Array.isArray(allotted) ? allotted : null,
          plan_name: licenseData.plan_name,
        });
      }

      try {
        const countRes = await fetch(`${API_BASE}/api/user/bot-count?user_id=${user.id}`);
        if (countRes.ok) {
          const countData = await countRes.json();
          setRunningBotCount(countData.count ?? 0);
        } else {
          setRunningBotCount(0);
        }
      } catch {
        setRunningBotCount(0);
      }
    })();
  }, [user?.id, launched]);

  // ─── Initialize grid prices when coin changes ──────────────────────────────
  useEffect(() => {
    if (gridUpperPrice === 0 && gridLowerPrice === 0) {
      setGridUpperPrice(Math.round(selectedCoinData.price * 1.1));
      setGridLowerPrice(Math.round(selectedCoinData.price * 0.9));
    }
  }, [selectedCoinData.price]);

  const handleLaunch = async () => {
    setLaunching(true);
    setLaunchError(null);

    // ─── LICENSE ENFORCEMENT ───────────────────────────────────────────────
    if (userLicense) {
      if (runningBotCount >= userLicense.bot_limit) {
        setLaunchError('License limit reached. Please upgrade your plan.');
        setLaunching(false);
        return;
      }

      if (userLicense.allotted_strategies && userLicense.allotted_strategies.length > 0) {
        const currentStrategyName = botType.charAt(0).toUpperCase() + botType.slice(1);
        const strategyAllowed = userLicense.allotted_strategies.some(s =>
          s.toLowerCase().includes(botType.toLowerCase()) ||
          s.toLowerCase().includes(currentStrategyName.toLowerCase())
        );
        if (!strategyAllowed) {
          setLaunchError(`Your license does not include the "${currentStrategyName}" strategy. Available: ${userLicense.allotted_strategies.join(', ')}`);
          setLaunching(false);
          return;
        }
      }
    }

    // Universal default bot cannot be launched/modified by user
    if (isLockedUniversal) {
      setLaunchError('This is a universal default bot managed by the core engine. You cannot modify or launch it.');
      setLaunching(false);
      return;
    }

    const botName = `Custom Cortex Bot — ${selectedCoin} ${botType.charAt(0).toUpperCase() + botType.slice(1)}`;

    const tradePayload = {
      bot_name: botName,
      bot_type: botType,
      execution_mode: executionMode,
      market_type: marketType,
      trading_mode: tradingMode,
      coin: selectedCoin,
      pair: `${selectedCoin}/USDT`,
      binance_symbol: getBinanceSymbol(selectedCoin),
      direction: tradeDirection,
      order_type: orderType,
      entry_price: selectedCoinData.price,
      quantity: effectiveQuantity,
      position_size: positionSize,
      investment_amount_inr: sizeMode === 'inr' ? investmentAmountInr : null,
      leverage: marketType === 'futures' ? leverage : 1,
      take_profit_pct: tpSlMode === 'percentage' ? takeProfit : null,
      stop_loss_pct: tpSlMode === 'percentage' ? stopLoss : null,
      take_profit_fixed: tpSlMode === 'fixed' ? tpFixed : null,
      stop_loss_fixed: tpSlMode === 'fixed' ? slFixed : null,
      trailing_stop: trailingEnabled,
      trailing_distance_pct: trailingEnabled ? trailingDistance : null,
      rr_ratio: rrRatio,
      max_trades_per_day: maxTradesPerDay,
      max_daily_loss: maxDailyLoss,
      max_daily_profit: maxDailyProfit,
      cooldown_minutes: cooldownMinutes,
      indicators: indicatorsEnabled ? [indicator] : [],
      user_email: user?.email ?? null,
      // Bot-type-specific params
      dca_drop_pct: botType === 'dca' ? dcaDropPct : null,
      dca_buy_interval: botType === 'dca' ? dcaBuyInterval : null,
      grid_upper_price: botType === 'grid' ? gridUpperPrice : null,
      grid_lower_price: botType === 'grid' ? gridLowerPrice : null,
      grid_levels: botType === 'grid' ? gridLevels : null,
      copier_source: botType === 'copier' ? copierSource : null,
    };

    let engineSuccess = false;
    let engineResponse: any = null;

    let brokerApiKey: string | undefined;
    let brokerApiSecret: string | undefined;
    let brokerExchange: string | undefined;

    if (tradingMode === 'live') {
      try {
        const { data: brokerData } = await supabase
          .from('broker_keys')
          .select('*')
          .eq('is_connected', true)
          .maybeSingle();

        if (brokerData) {
          if (brokerData.encrypted_api_key && brokerData.encrypted_api_secret && brokerData.encryption_iv) {
            try {
              const decRes = await fetch(`${API_BASE}/api/decrypt-broker-keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  exchange_name: brokerData.exchange_name,
                  encrypted_api_key: brokerData.encrypted_api_key,
                  encrypted_api_secret: brokerData.encrypted_api_secret,
                  encryption_iv: brokerData.encryption_iv,
                }),
              });
              if (decRes.ok) {
                const decData = await decRes.json();
                if (decData.success) {
                  brokerApiKey = decData.api_key;
                  brokerApiSecret = decData.api_secret;
                  brokerExchange = brokerData.exchange_name;
                }
              }
            } catch {
              // Engine not running
            }
          }
        }
      } catch {
        // Supabase query failed
      }

      if (!brokerApiKey || !brokerApiSecret) {
        setLaunchError('Live trading requires a connected broker. Please connect your exchange API keys first.');
        setLaunching(false);
        return;
      }
    }

    try {
      const res = await fetch(`${API_BASE}/api/place-trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...tradePayload,
          user_id: user?.id,
          api_key: brokerApiKey,
          api_secret: brokerApiSecret,
          exchange: brokerExchange,
        }),
      });
      if (res.ok) {
        engineSuccess = true;
        engineResponse = await res.json();
      } else {
        const errText = await res.text();
        let errMsg: string;
        try { errMsg = JSON.parse(errText)?.error || errText; } catch { errMsg = errText; }
        console.warn('Engine place-trade returned error (non-fatal, continuing to bot save):', errMsg);
      }
    } catch (err) {
      console.warn('Engine server not reachable, falling back to DB-only save:', err);
    }

    const tpPctVal = tpSlMode === 'percentage' ? takeProfit : null;
    const slPctVal = tpSlMode === 'percentage' ? stopLoss : null;
    const tpPrice = tpPctVal != null
      ? tradeDirection === 'long'
        ? selectedCoinData.price * (1 + tpPctVal / 100)
        : selectedCoinData.price * (1 - tpPctVal / 100)
      : null;
    const slPrice = slPctVal != null
      ? tradeDirection === 'long'
        ? selectedCoinData.price * (1 - slPctVal / 100)
        : selectedCoinData.price * (1 + slPctVal / 100)
      : null;

    let botSaved = false;
    try {
      const botRes = await fetch(`${API_BASE}/api/launch-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          name: botName,
          market_type: marketType,
          coin: selectedCoin,
          strategy: botType,
          trading_mode: tradingMode,
          direction: tradeDirection,
          entry_price: selectedCoinData.price,
          quantity: effectiveQuantity,
          position_size: positionSize,
          investment_amount_inr: sizeMode === 'inr' ? investmentAmountInr : null,
          leverage: marketType === 'futures' ? leverage : 1,
          take_profit_pct: tpPctVal,
          stop_loss_pct: slPctVal,
          take_profit_price: tpPrice,
          stop_loss_price: slPrice,
          max_daily_loss: maxDailyLoss,
          max_daily_profit: maxDailyProfit,
          indicators: indicatorsEnabled ? [indicator] : [],
        }),
      });
      if (botRes.ok) {
        botSaved = true;
      } else {
        const errText = await botRes.text();
        let errMsg: string;
        try {
          const parsed = JSON.parse(errText);
          errMsg = parsed?.error || parsed?.message || parsed?.msg || errText;
        } catch { errMsg = errText; }
        if (!errMsg || errMsg.trim() === '') errMsg = `Engine returned HTTP ${botRes.status}`;
        setLaunchError(`Failed to save bot: ${errMsg}`);
        setLaunching(false);
        return;
      }
    } catch (err: any) {
      console.error('Failed to save bot via engine:', err.message);
      setLaunchError(`Failed to save bot: ${err.message}`);
      setLaunching(false);
      return;
    }

    setLaunching(false);

    if (botSaved) {
      setLaunched(true);
      setTimeout(() => setLaunched(false), 4000);
    }
  };

  // ─── Manual deploy trade handler ───────────────────────────────────────────
  const handleManualDeploy = async () => {
    if (executionMode !== 'manual') return;
    await handleLaunch();
  };

  // ─── Delete custom bot ─────────────────────────────────────────────────────
  const handleDeleteBoard = async (board: AssignedBoard) => {
    if (board.is_universal_default) return;
    try {
      await supabase.from('user_board_licenses').delete().eq('id', board.license_id);
      setAssignedBoards(prev => prev.filter(b => b.id !== board.id));
      if (selectedBoardId === board.id) setSelectedBoardId(null);
    } catch {
      // Error deleting
    }
  };

  return (
    <div className="space-y-5 animate-slide-up max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center neon-glow-cyan">
          <Bot className="w-6 h-6 text-neon-cyan" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white">AI Smart Bot Builder</h2>
            <span className="px-2 py-0.5 rounded-md bg-neon-green/15 text-neon-green text-[10px] font-bold neon-glow-green">ULTIMATE</span>
          </div>
          <p className="text-sm text-slate-400">Design and launch your custom AI-powered algorithmic trading bot</p>
        </div>
      </div>

      {/* Assigned Smart Boards from Admin */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-neon-green" />
            Your Licensed Smart Bots
          </h3>
          {selectedBoardId && (
            <button
              onClick={() => { setSelectedBoardId(null); }}
              className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear selection
            </button>
          )}
        </div>

        {loadingBoards ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-neon-cyan animate-spin" />
          </div>
        ) : assignedBoards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Crown className="w-8 h-8 text-slate-600 mb-3" />
            <p className="text-sm text-slate-400 font-semibold">No Smart Bots allocated to your account yet.</p>
            <p className="text-xs text-slate-500 mt-1">Your trading bots are assigned by your license provider.</p>
            <button
              onClick={() => window.location.hash = 'my-subscription'}
              className="mt-3 px-4 py-2 rounded-xl bg-neon-green/15 text-neon-green border border-neon-green/30 hover:bg-neon-green/20 text-xs font-bold transition-all"
            >
              Upgrade Plan
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {assignedBoards.map((board) => {
              const isActive = selectedBoardId === board.id;
              const isUniversal = board.is_universal_default === true;
              return (
                <div
                  key={board.id}
                  className={`p-4 rounded-xl text-left transition-all duration-200 relative overflow-hidden group ${
                    isActive
                      ? 'bg-neon-green/10 text-white border border-neon-green/40 shadow-[0_0_12px_rgba(0,255,157,0.15)]'
                      : 'glass text-slate-400 hover:text-slate-200 hover:border-white/[0.12]'
                  } ${isUniversal ? 'ring-1 ring-neon-amber/20' : ''}`}
                >
                  {isActive && <div className="absolute -top-6 -right-6 w-20 h-20 bg-neon-green/10 rounded-full blur-2xl" />}
                  <div className="relative">
                    {/* Universal default badge + lock */}
                    {isUniversal && (
                      <div className="flex items-center justify-between mb-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neon-amber/10 text-neon-amber text-[9px] font-bold border border-neon-amber/20">
                          <Lock className="w-2.5 h-2.5" /> Managed by Core Engine
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-bold truncate flex items-center gap-1.5">
                        {isUniversal && <Lock className="w-3 h-3 text-neon-amber flex-shrink-0" />}
                        {board.name}
                      </p>
                      {isActive && <Check className="w-4 h-4 text-neon-green flex-shrink-0" />}
                    </div>
                    <p className="text-[10px] text-slate-500 mb-2 line-clamp-1">{board.description || `${board.strategy_type} . ${board.coin}`}</p>
                    <div className="flex flex-wrap gap-1 mb-2">
                      <span className="px-1.5 py-0.5 rounded bg-white/[0.05] text-[9px] text-slate-300">{board.coin}</span>
                      <span className="px-1.5 py-0.5 rounded bg-neon-amber/10 text-neon-amber text-[9px] font-medium">{board.leverage}x</span>
                      {board.take_profit_pct != null && <span className="px-1.5 py-0.5 rounded bg-neon-green/10 text-neon-green text-[9px] font-medium">TP {board.take_profit_pct}%</span>}
                      {board.stop_loss_pct != null && <span className="px-1.5 py-0.5 rounded bg-neon-red/10 text-neon-red text-[9px] font-medium">SL {board.stop_loss_pct}%</span>}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => applyBoard(board)}
                        disabled={isUniversal && isActive}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                          isUniversal
                            ? 'bg-white/[0.03] text-slate-500 border border-white/[0.06] cursor-not-allowed'
                            : isActive
                            ? 'bg-neon-green/15 text-neon-green border border-neon-green/30'
                            : 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]'
                        }`}
                      >
                        {isUniversal ? <span className="flex items-center justify-center gap-1"><Lock className="w-2.5 h-2.5" /> View Only</span> : isActive ? 'Selected' : 'Select'}
                      </button>

                      {!isUniversal && (
                        <>
                          <button
                            onClick={() => applyBoard(board)}
                            className="px-2 py-1.5 rounded-lg bg-white/[0.05] text-slate-300 hover:bg-neon-cyan/15 hover:text-neon-cyan text-[10px] font-bold transition-all"
                            title="Configure"
                          >
                            <Settings className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteBoard(board)}
                            className="px-2 py-1.5 rounded-lg bg-white/[0.05] text-slate-300 hover:bg-neon-red/15 hover:text-neon-red text-[10px] font-bold transition-all"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Execution Mode Toggle (only for custom allotted bots) */}
      {!isLockedUniversal && (
        <div className="glass-card p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${executionMode === 'auto' ? 'bg-neon-green/10 text-neon-green' : 'bg-neon-amber/10 text-neon-amber'}`}>
              {executionMode === 'auto' ? <Radio className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            </div>
            <div>
              <p className="text-sm font-bold text-white">Execution Mode</p>
              <p className="text-[11px] text-slate-500">
                {executionMode === 'auto' ? 'Engine will trade automatically based on your strategy' : 'You manually trigger each trade deployment'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold ${executionMode === 'auto' ? 'text-neon-green' : 'text-slate-500'}`}>Auto</span>
            <button
              onClick={() => setExecutionMode(executionMode === 'auto' ? 'manual' : 'auto')}
              className={`relative w-12 h-6 rounded-full transition-all duration-200 ${executionMode === 'auto' ? 'bg-neon-green/30' : 'bg-neon-amber/30'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-all duration-200 ${executionMode === 'auto' ? 'translate-x-6 bg-neon-green neon-glow-green' : 'bg-neon-amber'}`} />
            </button>
            <span className={`text-xs font-bold ${executionMode === 'manual' ? 'text-neon-amber' : 'text-slate-500'}`}>Manual</span>
          </div>
        </div>
      )}

      {/* Universal default — Engine Active indicator */}
      {isLockedUniversal && (
        <div className="glass-card p-4 flex items-center justify-between border-neon-amber/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-neon-green/10 text-neon-green flex items-center justify-center">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Engine Active</p>
              <p className="text-[11px] text-slate-500">This universal bot is managed by the core engine and runs automatically.</p>
            </div>
          </div>
          <span className="px-3 py-1.5 rounded-lg bg-neon-green/10 text-neon-green text-[10px] font-bold border border-neon-green/20 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" /> RUNNING
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Form - 2 cols */}
        <div className="lg:col-span-2 space-y-4">

          {/* 1. Bot Type Selection */}
          <Section icon={CircuitBoard} title="Bot Type Selection" badge="01">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {botTypeCards.map((bt) => {
                const Icon = bt.icon;
                const active = botType === bt.id;
                return (
                  <button
                    key={bt.id}
                    onClick={() => !isLockedUniversal && setBotType(bt.id)}
                    disabled={isLockedUniversal}
                    className={`p-4 rounded-xl text-left transition-all duration-200 relative overflow-hidden group ${
                      active
                        ? 'bg-neon-cyan/10 text-white border border-neon-cyan/40 neon-glow-cyan'
                        : 'glass text-slate-400 hover:text-slate-200 hover:border-white/[0.12]'
                    } ${isLockedUniversal ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    {active && <div className="absolute -top-6 -right-6 w-20 h-20 bg-neon-cyan/10 rounded-full blur-2xl" />}
                    <div className="relative">
                      <Icon className={`w-5 h-5 mb-2 ${active ? 'text-neon-cyan' : 'text-slate-500'}`} />
                      <p className="text-sm font-bold">{bt.label}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{bt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* 2. Trade Direction & Market */}
          <Section icon={Layers} title="Trade Direction & Market" badge="02">
            {/* Trade Direction Toggle */}
            <div className="mb-5">
              <label className="text-xs text-slate-400 mb-2 block font-semibold">Trade Direction</label>
              <div className="flex gap-2 p-1 rounded-xl bg-base-800/50">
                <button
                  onClick={() => !isLockedUniversal && setTradeDirection('long')}
                  disabled={isLockedUniversal}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-bold transition-all ${
                    tradeDirection === 'long'
                      ? 'bg-neon-green/15 text-neon-green border border-neon-green/30 shadow-[0_0_12px_rgba(0,255,157,0.2)]'
                      : 'text-slate-400 hover:text-slate-200'
                  } ${isLockedUniversal ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <ArrowUpRight className="w-4 h-4" /> Long (Buy)
                </button>
                <button
                  onClick={() => !isLockedUniversal && setTradeDirection('short')}
                  disabled={isLockedUniversal}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-bold transition-all ${
                    tradeDirection === 'short'
                      ? 'bg-neon-red/15 text-neon-red border border-neon-red/30 shadow-[0_0_12px_rgba(255,68,68,0.2)]'
                      : 'text-slate-400 hover:text-slate-200'
                  } ${isLockedUniversal ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <ArrowDownRight className="w-4 h-4" /> Short (Sell)
                </button>
              </div>
            </div>

            {/* Market Type Toggle */}
            <div className="mb-4">
              <label className="text-xs text-slate-400 mb-2 block font-semibold">Market Type</label>
              <div className="grid grid-cols-2 gap-3">
                {(['spot', 'futures'] as MarketType[]).map((mt) => (
                  <button
                    key={mt}
                    onClick={() => !isLockedUniversal && setMarketType(mt)}
                    disabled={isLockedUniversal}
                    className={`px-4 py-3 rounded-xl text-sm font-semibold capitalize transition-all duration-200 ${
                      marketType === mt
                        ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/40'
                        : 'glass text-slate-400 hover:text-slate-200'
                    } ${isLockedUniversal ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    {mt}
                    {mt === 'futures' && <span className="block text-[10px] mt-0.5 opacity-70">Up to 100x leverage</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Leverage Slider */}
            {marketType === 'futures' && (
              <div className="mb-4 animate-slide-up">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400">Leverage</span>
                  <span className="text-sm font-bold text-neon-amber font-mono">{leverage}x</span>
                </div>
                <input
                  type="range" min="1" max="100" value={leverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  disabled={isLockedUniversal}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer slider-neon disabled:opacity-50"
                  style={{ background: `linear-gradient(to right, #00ff9d 0%, #00e5ff ${leverage}%, #1a1f33 ${leverage}%)` }}
                />
                <div className="flex justify-between mt-1.5 text-[9px] text-slate-600">
                  <span>1x</span><span>25x</span><span>50x</span><span>75x</span>
                  <span className={leverage >= 80 ? 'text-neon-red font-bold' : ''}>100x MAX</span>
                </div>
                {leverage >= 50 && (
                  <p className="mt-2 text-[11px] text-neon-red/80 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    High leverage significantly increases liquidation risk.
                  </p>
                )}
              </div>
            )}

            {/* Coin Selector */}
            <div>
              <label className="text-xs text-slate-400 mb-2 block font-semibold">Coin Selector</label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {coins.slice(0, 10).map((c) => (
                  <button
                    key={c.symbol}
                    onClick={() => !isLockedUniversal && setSelectedCoin(c.symbol)}
                    disabled={isLockedUniversal}
                    className={`px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                      selectedCoin === c.symbol
                        ? 'bg-neon-green/15 text-neon-green border border-neon-green/40'
                        : 'glass text-slate-400 hover:text-slate-200'
                    } ${isLockedUniversal ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    {c.symbol}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-400">{selectedCoinData.name}</span>
                <span className="font-mono text-slate-200">{formatPrice(selectedCoinData.price)}</span>
                {livePrice && <span className="text-[10px] text-neon-green ml-1">. LIVE</span>}
              </div>
            </div>
          </Section>

          {/* 3. Entry Logic */}
          <Section icon={Crosshair} title="Entry Logic" badge="03">
            {/* Order Type */}
            <div className="mb-5">
              <label className="text-xs text-slate-400 mb-2 block font-semibold">Order Type</label>
              <div className="flex gap-2 p-1 rounded-xl bg-base-800/50">
                <button
                  onClick={() => !isLockedUniversal && setOrderType('market')}
                  disabled={isLockedUniversal}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    orderType === 'market' ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30' : 'text-slate-400 hover:text-slate-200'
                  } ${isLockedUniversal ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <Zap className="w-4 h-4" /> Market
                </button>
                <button
                  onClick={() => !isLockedUniversal && setOrderType('limit')}
                  disabled={isLockedUniversal}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    orderType === 'limit' ? 'bg-neon-amber/15 text-neon-amber border border-neon-amber/30' : 'text-slate-400 hover:text-slate-200'
                  } ${isLockedUniversal ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <Target className="w-4 h-4" /> Limit
                </button>
              </div>
            </div>

            {/* Technical Indicators Toggle */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CircuitBoard className="w-4 h-4 text-neon-cyan" />
                  <div>
                    <p className="text-sm font-semibold text-white">Use Technical Indicators</p>
                    <p className="text-[10px] text-slate-500">Trigger entries based on TA signals</p>
                  </div>
                </div>
                <button
                  onClick={() => !isLockedUniversal && setIndicatorsEnabled(!indicatorsEnabled)}
                  disabled={isLockedUniversal}
                  className={`relative w-12 h-6 rounded-full transition-all duration-200 ${indicatorsEnabled ? 'bg-neon-cyan/30' : 'bg-white/[0.08]'} ${isLockedUniversal ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-all duration-200 ${indicatorsEnabled ? 'translate-x-6 bg-neon-cyan neon-glow-cyan' : 'bg-slate-500'}`} />
                </button>
              </div>

              {indicatorsEnabled ? (
                <div className="animate-slide-up">
                  <label className="text-xs text-slate-400 mb-2 block font-semibold">Select Indicator Trigger</label>
                  <div className="flex flex-wrap gap-2">
                    {indicatorOptions.map((ind) => (
                      <button
                        key={ind}
                        onClick={() => !isLockedUniversal && setIndicator(ind)}
                        disabled={isLockedUniversal}
                        className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                          indicator === ind
                            ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/40 shadow-[0_0_12px_rgba(0,229,255,0.2)]'
                            : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:border-white/[0.14] hover:text-slate-200'
                        } ${isLockedUniversal ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        <span className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full transition-all ${indicator === ind ? 'bg-neon-cyan shadow-[0_0_6px_rgba(0,229,255,0.8)]' : 'bg-slate-600'}`} />
                          {ind}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="animate-fade-in flex items-center gap-2 py-2">
                  <Power className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                  <p className="text-xs text-slate-500 italic">
                    Bot will execute based on selected strategy, pure price action, or manual triggers.
                  </p>
                </div>
              )}
            </div>
          </Section>

          {/* 4. Position & Execution — Quantity vs INR Amount */}
          <Section icon={Gauge} title="Position & Execution" badge="04">
            {/* Size Mode Toggle */}
            <div className="mb-4">
              <label className="text-xs text-slate-400 mb-2 block font-semibold">Trade Size Mode</label>
              <div className="flex gap-2 p-1 rounded-xl bg-base-800/50 mb-3">
                <button
                  onClick={() => !isLockedUniversal && setSizeMode('quantity')}
                  disabled={isLockedUniversal}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    sizeMode === 'quantity' ? 'bg-neon-green/15 text-neon-green border border-neon-green/30' : 'text-slate-400 hover:text-slate-200'
                  } ${isLockedUniversal ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <Coins className="w-3.5 h-3.5" /> Quantity
                </button>
                <button
                  onClick={() => !isLockedUniversal && setSizeMode('inr')}
                  disabled={isLockedUniversal}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    sizeMode === 'inr' ? 'bg-neon-green/15 text-neon-green border border-neon-green/30' : 'text-slate-400 hover:text-slate-200'
                  } ${isLockedUniversal ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <DollarSign className="w-3.5 h-3.5" /> Amount in INR
                </button>
              </div>

              {/* Quantity Input */}
              {sizeMode === 'quantity' ? (
                <div className="relative">
                  <input
                    type="number"
                    value={tradeQuantity}
                    onChange={(e) => !isLockedUniversal && setTradeQuantity(Math.max(0, stripNumber(e.target.value)))}
                    disabled={isLockedUniversal}
                    className="w-full px-4 py-3 rounded-xl glass text-lg text-white font-mono focus:outline-none focus:border-neon-green/40 transition-colors disabled:opacity-60"
                    step="0.0001"
                    min="0"
                    placeholder="e.g. 0.1, 0.01, 0.001"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-neon-green font-bold">
                    {selectedCoin}
                  </span>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="number"
                    value={investmentAmountInr}
                    onChange={(e) => !isLockedUniversal && setInvestmentAmountInr(Math.max(0, stripNumber(e.target.value)))}
                    disabled={isLockedUniversal}
                    className="w-full px-4 py-3 rounded-xl glass text-lg text-white font-mono focus:outline-none focus:border-neon-green/40 transition-colors disabled:opacity-60"
                    step="100"
                    min="0"
                    placeholder="e.g. 5000, 10000"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-neon-green font-bold">
                    INR
                  </span>
                </div>
              )}
              <p className="text-[10px] text-slate-500 mt-1.5">
                {sizeMode === 'quantity'
                  ? 'Enter the exact coin amount. Supports micro-lots (e.g. 0.001 BTC, 0.01 ETH) for precise position sizing.'
                  : `Enter a round INR amount. The system will auto-calculate the exact crypto quantity at current market price. Approx: ${effectiveQuantity.toFixed(6)} ${selectedCoin}`}
              </p>
            </div>

            {/* R:R Ratio & Max Trades Per Day */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 mb-2 block font-semibold flex items-center gap-1.5">
                  <ArrowRightLeft className="w-3 h-3" /> Risk : Reward Ratio
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-slate-500 font-mono text-center font-bold">
                    1
                  </div>
                  <span className="text-slate-500 font-bold">:</span>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      value={rrRatio}
                      onChange={(e) => setRrRatio(Math.max(0, stripNumber(e.target.value)))}
                      disabled={isLockedUniversal}
                      className="w-full px-4 py-2.5 rounded-xl glass text-sm text-white font-mono focus:outline-none focus:border-neon-cyan/40 transition-colors text-center disabled:opacity-60"
                      step="0.5"
                      min="0"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-2 block font-semibold flex items-center gap-1.5">
                  <Activity className="w-3 h-3" /> Max Trades / Day
                </label>
                <input
                  type="number"
                  value={maxTradesPerDay}
                  onChange={(e) => setMaxTradesPerDay(Math.max(0, stripNumber(e.target.value)))}
                  disabled={isLockedUniversal}
                  className="w-full px-4 py-2.5 rounded-xl glass text-sm text-white font-mono focus:outline-none focus:border-neon-cyan/40 transition-colors disabled:opacity-60"
                  min="0"
                />
              </div>
            </div>
          </Section>

          {/* Bot-Type-Specific Configuration */}
          {botType === 'dca' && (
            <Section icon={PiggyBank} title="DCA Configuration" badge="DCA">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-2 block font-semibold">Buy Drop Percentage (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={dcaDropPct}
                      onChange={(e) => setDcaDropPct(Math.max(0, stripNumber(e.target.value)))}
                      disabled={isLockedUniversal}
                      className="w-full px-4 py-2.5 rounded-xl glass text-sm text-white font-mono focus:outline-none focus:border-neon-cyan/40 transition-colors disabled:opacity-60"
                      step="0.5"
                      min="0"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neon-cyan text-sm font-bold">%</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Buy more when price drops by this percentage</p>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-2 block font-semibold">Buy Interval ({currency})</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={dcaBuyInterval}
                      onChange={(e) => setDcaBuyInterval(Math.max(0, stripNumber(e.target.value)))}
                      disabled={isLockedUniversal}
                      className="w-full px-4 py-2.5 rounded-xl glass text-sm text-white font-mono focus:outline-none focus:border-neon-cyan/40 transition-colors disabled:opacity-60"
                      step="50"
                      min="0"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neon-cyan text-sm font-bold">{currency}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Amount to buy at each DCA interval</p>
                </div>
              </div>
            </Section>
          )}

          {botType === 'grid' && (
            <Section icon={Grid3x3} title="Grid Configuration" badge="GRID">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-2 block font-semibold">Upper Price Limit</label>
                  <input
                    type="number"
                    value={gridUpperPrice}
                    onChange={(e) => setGridUpperPrice(Math.max(0, stripNumber(e.target.value)))}
                    disabled={isLockedUniversal}
                    className="w-full px-4 py-2.5 rounded-xl glass text-sm text-white font-mono focus:outline-none focus:border-neon-cyan/40 transition-colors disabled:opacity-60"
                    step="0.01"
                    min="0"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Top of grid range</p>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-2 block font-semibold">Lower Price Limit</label>
                  <input
                    type="number"
                    value={gridLowerPrice}
                    onChange={(e) => setGridLowerPrice(Math.max(0, stripNumber(e.target.value)))}
                    disabled={isLockedUniversal}
                    className="w-full px-4 py-2.5 rounded-xl glass text-sm text-white font-mono focus:outline-none focus:border-neon-cyan/40 transition-colors disabled:opacity-60"
                    step="0.01"
                    min="0"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Bottom of grid range</p>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-2 block font-semibold">Grid Levels</label>
                  <input
                    type="number"
                    value={gridLevels}
                    onChange={(e) => setGridLevels(Math.max(2, Math.floor(stripNumber(e.target.value))))}
                    disabled={isLockedUniversal}
                    className="w-full px-4 py-2.5 rounded-xl glass text-sm text-white font-mono focus:outline-none focus:border-neon-cyan/40 transition-colors disabled:opacity-60"
                    step="1"
                    min="2"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Number of grid orders</p>
                </div>
              </div>
            </Section>
          )}

          {botType === 'copier' && (
            <Section icon={Copy} title="Copier Configuration" badge="COPY">
              <div>
                <label className="text-xs text-slate-400 mb-2 block font-semibold">Source Signal / Master Account</label>
                <input
                  type="text"
                  value={copierSource}
                  onChange={(e) => setCopierSource(e.target.value)}
                  disabled={isLockedUniversal}
                  className="w-full px-4 py-2.5 rounded-xl glass text-sm text-white font-mono focus:outline-none focus:border-neon-cyan/40 transition-colors disabled:opacity-60"
                  placeholder="e.g. @master_trader or signal channel ID"
                />
                <p className="text-[10px] text-slate-500 mt-1">The bot will mirror trades from this source</p>
              </div>
            </Section>
          )}

          {/* 5. Advanced Exit & SL/TP */}
          <Section icon={Shield} title="Advanced Exit & Stop Loss" badge="05">
            {/* TP/SL Mode Toggle */}
            <div className="mb-4">
              <label className="text-xs text-slate-400 mb-2 block font-semibold">TP / SL Definition Mode</label>
              <div className="flex gap-2 p-1 rounded-xl bg-base-800/50">
                <button
                  onClick={() => !isLockedUniversal && setTpSlMode('percentage')}
                  disabled={isLockedUniversal}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    tpSlMode === 'percentage' ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30' : 'text-slate-400 hover:text-slate-200'
                  } ${isLockedUniversal ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  Percentage / Points
                </button>
                <button
                  onClick={() => !isLockedUniversal && setTpSlMode('fixed')}
                  disabled={isLockedUniversal}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    tpSlMode === 'fixed' ? 'bg-neon-amber/15 text-neon-amber border border-neon-amber/30' : 'text-slate-400 hover:text-slate-200'
                  } ${isLockedUniversal ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  Fixed PnL Amount
                </button>
              </div>
            </div>

            {/* TP & SL Inputs */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-slate-400 mb-2 block font-semibold flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3 text-neon-green" /> Take Profit
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={tpSlMode === 'percentage' ? takeProfit : tpFixed}
                    onChange={(e) => tpSlMode === 'percentage' ? setTakeProfit(Math.max(0, stripNumber(e.target.value))) : setTpFixed(Math.max(0, stripNumber(e.target.value)))}
                    disabled={isLockedUniversal}
                    className="w-full px-4 py-2.5 rounded-xl glass text-sm text-white font-mono focus:outline-none focus:border-neon-green/40 transition-colors disabled:opacity-60"
                    step={tpSlMode === 'percentage' ? '0.5' : '10'}
                    min="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neon-green text-sm font-bold">
                    {tpSlMode === 'percentage' ? '%' : currency}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Auto-sell at profit target</p>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-2 block font-semibold flex items-center gap-1.5">
                  <TrendingDown className="w-3 h-3 text-neon-red" /> Stop Loss
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={tpSlMode === 'percentage' ? stopLoss : slFixed}
                    onChange={(e) => tpSlMode === 'percentage' ? setStopLoss(Math.max(0, stripNumber(e.target.value))) : setSlFixed(Math.max(0, stripNumber(e.target.value)))}
                    disabled={isLockedUniversal}
                    className="w-full px-4 py-2.5 rounded-xl glass text-sm text-white font-mono focus:outline-none focus:border-neon-red/40 transition-colors disabled:opacity-60"
                    step={tpSlMode === 'percentage' ? '0.5' : '10'}
                    min="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neon-red text-sm font-bold">
                    {tpSlMode === 'percentage' ? '%' : currency}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Auto-sell at loss limit</p>
              </div>
            </div>

            {/* Trailing Stop Loss */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-neon-cyan" />
                  <div>
                    <p className="text-sm font-semibold text-white">Trailing Stop Loss</p>
                    <p className="text-[10px] text-slate-500">Dynamically follows price upward</p>
                  </div>
                </div>
                <button
                  onClick={() => !isLockedUniversal && setTrailingEnabled(!trailingEnabled)}
                  disabled={isLockedUniversal}
                  className={`relative w-12 h-6 rounded-full transition-all duration-200 ${trailingEnabled ? 'bg-neon-cyan/30' : 'bg-white/[0.08]'} ${isLockedUniversal ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-all duration-200 ${trailingEnabled ? 'translate-x-6 bg-neon-cyan neon-glow-cyan' : 'bg-slate-500'}`} />
                </button>
              </div>
              {trailingEnabled && (
                <div className="animate-slide-up">
                  <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Trailing Distance (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={trailingDistance}
                      onChange={(e) => setTrailingDistance(Math.max(0, stripNumber(e.target.value)))}
                      disabled={isLockedUniversal}
                      className="w-full px-4 py-2.5 rounded-xl glass text-sm text-white font-mono focus:outline-none focus:border-neon-cyan/40 transition-colors disabled:opacity-60"
                      step="0.1"
                      min="0"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neon-cyan text-sm font-bold">%</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1.5">Stop loss trails price by {trailingDistance}% . locks in profit while limiting downside.</p>
                </div>
              )}
            </div>
          </Section>

          {/* 6. Daily Safety Limits */}
          <Section icon={Shield} title="Daily Safety Limits" badge="06">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-slate-400 mb-2 block font-semibold flex items-center gap-1.5">
                  <Flame className="w-3 h-3 text-neon-red" /> Max Daily Loss
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={maxDailyLoss}
                    onChange={(e) => setMaxDailyLoss(Math.max(0, stripNumber(e.target.value)))}
                    disabled={isLockedUniversal}
                    className="w-full px-4 py-2.5 rounded-xl glass text-sm text-white font-mono focus:outline-none focus:border-neon-red/40 transition-colors disabled:opacity-60"
                    step="50"
                    min="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neon-red text-sm font-bold">{currency}</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Bot auto-pauses if daily loss hits this</p>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-2 block font-semibold flex items-center gap-1.5">
                  <Target className="w-3 h-3 text-neon-green" /> Max Daily Profit
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={maxDailyProfit}
                    onChange={(e) => setMaxDailyProfit(Math.max(0, stripNumber(e.target.value)))}
                    disabled={isLockedUniversal}
                    className="w-full px-4 py-2.5 rounded-xl glass text-sm text-white font-mono focus:outline-none focus:border-neon-green/40 transition-colors disabled:opacity-60"
                    step="50"
                    min="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neon-green text-sm font-bold">{currency}</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Bot auto-pauses if daily profit hits this</p>
              </div>
            </div>

            {/* Cooldown Timer */}
            <div>
              <label className="text-xs text-slate-400 mb-2 block font-semibold flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-neon-amber" /> Cooldown Timer (after SL hit)
              </label>
              <div className="relative max-w-[200px]">
                <input
                  type="number"
                  value={cooldownMinutes}
                  onChange={(e) => setCooldownMinutes(Math.max(0, stripNumber(e.target.value)))}
                  disabled={isLockedUniversal}
                  className="w-full px-4 py-2.5 rounded-xl glass text-sm text-white font-mono focus:outline-none focus:border-neon-amber/40 transition-colors disabled:opacity-60"
                  min="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neon-amber text-sm font-bold">min</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">Bot pauses for {cooldownMinutes} minute{cooldownMinutes !== 1 ? 's' : ''} after a stop-loss trigger before resuming.</p>
            </div>
          </Section>
        </div>

        {/* Summary Panel - 1 col */}
        <div className="lg:col-span-1">
          <div className="glass-card p-5 sticky top-20">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Rocket className="w-4 h-4 text-neon-green" />
              Bot Summary
            </h3>

            <div className="space-y-3 text-sm">
              <SummaryGroup label="Bot Type" />
              <SummaryRow label="Strategy" value={botType.charAt(0).toUpperCase() + botType.slice(1)} accent="cyan" />
              <SummaryRow label="Execution" value={executionMode === 'auto' ? 'Auto' : 'Manual'} accent={executionMode === 'auto' ? 'green' : 'amber'} />

              <SummaryGroup label="Direction & Market" />
              <SummaryRow label="Direction" value={tradeDirection === 'long' ? 'Long (Buy)' : 'Short (Sell)'} accent={tradeDirection === 'long' ? 'green' : 'red'} />
              <SummaryRow label="Market" value={marketType.toUpperCase()} />
              {marketType === 'futures' && (
                <SummaryRow label="Leverage" value={`${leverage}x`} accent="amber" />
              )}
              <SummaryRow label="Coin" value={selectedCoin} />

              <SummaryGroup label="Entry Logic" />
              <SummaryRow label="Order Type" value={orderType.charAt(0).toUpperCase() + orderType.slice(1)} accent={orderType === 'market' ? 'cyan' : 'amber'} />
              <SummaryRow label="Indicators" value={indicatorsEnabled ? indicator : 'Price Action'} accent={indicatorsEnabled ? 'cyan' : undefined} />

              <SummaryGroup label="Position & Execution" />
              <SummaryRow label="Quantity" value={`${effectiveQuantity.toFixed(4)} ${selectedCoin}`} accent="green" />
              <SummaryRow label="R:R Ratio" value={`1:${rrRatio}`} accent="cyan" />
              <SummaryRow label="Max Trades/Day" value={`${maxTradesPerDay}`} />

              {/* Bot-type-specific summary */}
              {botType === 'dca' && (
                <>
                  <SummaryGroup label="DCA Config" />
                  <SummaryRow label="Drop Trigger" value={`${dcaDropPct}%`} accent="cyan" />
                  <SummaryRow label="Buy Interval" value={formatCurrency(dcaBuyInterval)} />
                </>
              )}
              {botType === 'grid' && (
                <>
                  <SummaryGroup label="Grid Config" />
                  <SummaryRow label="Upper Limit" value={formatPrice(gridUpperPrice)} accent="cyan" />
                  <SummaryRow label="Lower Limit" value={formatPrice(gridLowerPrice)} accent="cyan" />
                  <SummaryRow label="Grid Levels" value={`${gridLevels}`} />
                </>
              )}
              {botType === 'copier' && copierSource && (
                <>
                  <SummaryGroup label="Copier Config" />
                  <SummaryRow label="Source" value={copierSource} accent="cyan" />
                </>
              )}

              <SummaryGroup label="Exit & SL/TP" />
              <SummaryRow label="Take Profit" value={tpDisplay} accent="green" />
              <SummaryRow label="Stop Loss" value={slDisplay} accent="red" />
              <SummaryRow label="Trailing SL" value={trailingEnabled ? `ON . ${trailingDistance}%` : 'OFF'} accent={trailingEnabled ? 'cyan' : undefined} />

              <SummaryGroup label="Daily Safety" />
              <SummaryRow label="Max Daily Loss" value={formatCurrency(maxDailyLoss)} accent="red" />
              <SummaryRow label="Max Daily Profit" value={formatCurrency(maxDailyProfit)} accent="green" />
              <SummaryRow label="Cooldown" value={`${cooldownMinutes}m`} accent="amber" />

              <div className="h-px bg-white/[0.06] my-3" />
              <SummaryRow label="Trade Capital" value={formatCurrency(effectiveCapital)} />
              <SummaryRow label="Position Size" value={formatCurrency(positionSize)} accent="cyan" bold />
              <SummaryRow label="Coin Amount" value={`${coinAmount.toFixed(6)} ${selectedCoin}`} />
            </div>

            {/* Backtest + Launch buttons */}
            <button
              onClick={() => setShowBacktest(true)}
              disabled={effectiveCapital <= 0 || isLockedUniversal}
              className={`mt-5 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${
                effectiveCapital <= 0 || isLockedUniversal
                  ? 'bg-white/[0.03] text-slate-500 border border-white/[0.06] cursor-not-allowed'
                  : 'bg-neon-amber/15 text-neon-amber border border-neon-amber/40 hover:bg-neon-amber/25 neon-glow-amber hover:scale-[1.02]'
              }`}
            >
              <TestTube2 className="w-4 h-4" /> Test Strategy (AI Backtest)
            </button>

            {/* Auto mode: Launch button. Manual mode: Deploy Trade button. */}
            {executionMode === 'auto' ? (
              <button
                onClick={handleLaunch}
                disabled={effectiveCapital <= 0 || launching || isLockedUniversal}
                className={`mt-3 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${
                  launched
                    ? 'bg-neon-green/20 text-neon-green border border-neon-green/50 neon-glow-green'
                    : effectiveCapital <= 0 || launching || isLockedUniversal
                    ? 'bg-white/[0.03] text-slate-500 border border-white/[0.06] cursor-not-allowed'
                    : 'bg-gradient-to-r from-neon-cyan/20 to-neon-green/20 text-white border border-neon-cyan/40 hover:from-neon-cyan/30 hover:to-neon-green/30 neon-glow-cyan hover:scale-[1.02]'
                }`}
              >
                {launching ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Launching...</>
                ) : launched ? (
                  <><Check className="w-4 h-4" /> Bot Launched!</>
                ) : (
                  <><Rocket className="w-4 h-4" /> Launch Auto Bot</>
                )}
              </button>
            ) : (
              <button
                onClick={handleManualDeploy}
                disabled={effectiveCapital <= 0 || launching || isLockedUniversal}
                className={`mt-3 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${
                  launched
                    ? 'bg-neon-green/20 text-neon-green border border-neon-green/50 neon-glow-green'
                    : effectiveCapital <= 0 || launching || isLockedUniversal
                    ? 'bg-white/[0.03] text-slate-500 border border-white/[0.06] cursor-not-allowed'
                    : 'bg-gradient-to-r from-neon-amber/20 to-neon-red/20 text-white border border-neon-amber/40 hover:from-neon-amber/30 hover:to-neon-red/30 neon-glow-amber hover:scale-[1.02]'
                }`}
              >
                {launching ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Deploying...</>
                ) : launched ? (
                  <><Check className="w-4 h-4" /> Trade Deployed!</>
                ) : (
                  <><Send className="w-4 h-4" /> Deploy Trade</>
                )}
              </button>
            )}

            {launched && (
              <p className="mt-3 text-center text-[11px] text-neon-green animate-fade-in">
                {executionMode === 'auto' ? 'Your bot is now live and scanning the market...' : 'Trade has been deployed to the market.'}
              </p>
            )}
            {launchError && (
              <p className="mt-3 text-center text-[11px] text-neon-red animate-fade-in">
                {launchError}
              </p>
            )}
          </div>
        </div>
      </div>

      {showBacktest && (
        <BacktestModal
          draft={{
            name: `Custom Cortex Bot . ${selectedCoin} ${botType.charAt(0).toUpperCase() + botType.slice(1)}`,
            description: '',
            bot_type: botType,
            execution_mode: executionMode,
            market_type: marketType,
            strategies: [],
            indicators: indicatorsEnabled ? [indicator] : [],
            max_drawdown_pct: effectiveCapital > 0 ? (maxDailyLoss / effectiveCapital) * 100 : 0,
            default_tp_pct: tpSlMode === 'percentage' ? takeProfit : 5,
            default_sl_pct: tpSlMode === 'percentage' ? stopLoss : 2,
            tp_sl_ratio: rrRatio,
            max_leverage: leverage,
            risk_level: leverage > 30 ? 'High' : leverage > 10 ? 'Medium' : 'Low',
            source_exchanges: [],
          } as BotFactoryDraft}
          strategyParams={{
            indicators: indicatorsEnabled ? [indicator] : [],
            leverage: marketType === 'futures' ? leverage : 1,
            take_profit_pct: tpSlMode === 'percentage' ? takeProfit : 5,
            stop_loss_pct: tpSlMode === 'percentage' ? stopLoss : 2,
            rr_ratio: rrRatio,
            market_type: marketType,
            coin: selectedCoin,
            initial_capital: effectiveCapital,
          }}
          onClose={() => setShowBacktest(false)}
        />
      )}
    </div>
  );
}

function Section({ icon: Icon, title, children, badge }: { icon: typeof Layers; title: string; children: React.ReactNode; badge?: string }) {
  return (
    <div className="glass-card p-5 relative">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Icon className="w-4 h-4 text-neon-cyan" />
          {title}
        </h3>
        {badge && (
          <span className="px-2 py-0.5 rounded-md bg-neon-cyan/10 text-neon-cyan text-[9px] font-bold border border-neon-cyan/20">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function SummaryGroup({ label }: { label: string }) {
  return (
    <div className="pt-2">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600">{label}</p>
    </div>
  );
}

function SummaryRow({ label, value, accent, bold }: { label: string; value: string; accent?: string; bold?: boolean }) {
  const color = accent === 'green' ? 'text-neon-green' : accent === 'red' ? 'text-neon-red' : accent === 'amber' ? 'text-neon-amber' : accent === 'cyan' ? 'text-neon-cyan' : 'text-slate-200';
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400 text-xs">{label}</span>
      <span className={`${color} ${bold ? 'font-bold' : 'font-medium'} font-mono text-xs`}>{value}</span>
    </div>
  );
}
