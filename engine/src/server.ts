import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Load .env — try the project root (../../.env from engine/) first,
// then the current working directory, so it works regardless of cwd.
const envPaths = [
  join(process.cwd(), '..', '..', '.env'),
  join(process.cwd(), '.env'),
];
for (const p of envPaths) {
  if (existsSync(p)) {
    config({ path: p });
    console.log(`[ENGINE] Loaded env from ${p}`);
    break;
  }
}

import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  sendWelcomeNotification,
  sendLicenseAllocationNotification,
  sendLicenseExpiryNotification,
  sendBroadcastNotification,
  type NotificationRecipient,
} from './services/notifications';
import { startDcaRunner } from './services/dcaRunner';

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ─── Supabase client (server-side) ──────────────────────────────────────────
// Prefers the service role key (bypasses RLS). Falls back to the anon key
// (which works with our SECURITY DEFINER RPC functions) when the service
// role key is not available in the environment.
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

function getSupabaseAdmin() {
  const key = supabaseServiceKey || supabaseAnonKey;
  if (!supabaseUrl || !key) return null;
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false },
  });
}

// Startup diagnostic — log connection status so we can see if env vars loaded
const _adminCheck = getSupabaseAdmin();
console.log(`[ENGINE] Supabase URL: ${supabaseUrl ? 'OK' : 'MISSING'}`);
console.log(`[ENGINE] Service role key: ${supabaseServiceKey ? 'OK' : 'MISSING (using anon key fallback)'}`);
console.log(`[ENGINE] Anon key: ${supabaseAnonKey ? 'OK' : 'MISSING'}`);
console.log(`[ENGINE] DB client initialized: ${_adminCheck ? 'YES' : 'NO'}`);

// ─── AES-256-GCM encryption for broker API keys ─────────────────────────────
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'cortex-ai-32-byte-encryption-key!';

function encrypt(plaintext: string): { encrypted: string; iv: string } {
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: Buffer.concat([encrypted, tag]).toString('base64'),
    iv: iv.toString('base64'),
  };
}

function decrypt(encryptedB64: string, ivB64: string): string {
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const data = Buffer.from(encryptedB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(0, data.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// ─── Request body types ─────────────────────────────────────────────────────
interface PlaceTradeBody {
  bot_name: string;
  bot_type: 'scalper' | 'dca' | 'grid' | 'copier';
  execution_mode: 'auto' | 'manual';
  market_type: 'spot' | 'futures';
  trading_mode: 'live' | 'paper';
  coin: string;
  pair: string;
  binance_symbol: string;
  direction: 'long' | 'short';
  order_type: 'market' | 'limit';
  entry_price: number;
  quantity: number;
  position_size: number;
  leverage: number;
  take_profit_pct: number | null;
  stop_loss_pct: number | null;
  take_profit_fixed: number | null;
  stop_loss_fixed: number | null;
  trailing_stop: boolean;
  trailing_distance_pct: number | null;
  rr_ratio: number;
  max_trades_per_day: number;
  max_daily_loss: number;
  max_daily_profit: number;
  cooldown_minutes: number;
  indicators: string[];
  user_email: string | null;
  user_id?: string;
  api_key?: string;
  api_secret?: string;
  exchange?: string;
  investment_amount_inr?: number | null;
}

interface SaveBrokerKeysBody {
  exchange_name: string;
  exchange_id?: string;
  api_key: string;
  api_secret: string;
  user_id?: string;
  user_email?: string;
}

interface BacktestBody {
  symbol: string;
  bot_type: 'scalper' | 'dca' | 'grid' | 'copier';
  market_type: 'spot' | 'futures';
  leverage: number;
  take_profit_pct: number;
  stop_loss_pct: number;
  rr_ratio: number;
  indicators: string[];
  initial_capital: number;
  max_trades_per_day: number;
  risk_level: 'Low' | 'Medium' | 'High';
}

// ─── CCXT exchange factory ──────────────────────────────────────────────────
async function createExchange(exchangeId: string, apiKey: string, apiSecret: string, isLive: boolean) {
  const ccxt = await import('ccxt');
  const ExchangeClass = (ccxt as any)[exchangeId.toLowerCase().replace(/\s+/g, '')];
  if (!ExchangeClass) throw new Error(`Unsupported exchange: ${exchangeId}`);
  const exchange = new ExchangeClass({
    apiKey,
    secret: apiSecret,
    enableRateLimit: true,
    options: { defaultType: 'spot' },
  });
  if (!isLive) {
    if (typeof exchange.setSandboxMode === 'function') {
      exchange.setSandboxMode(true);
    }
  }
  return exchange;
}

function mapExchangeName(name: string): string {
  const lower = name.toLowerCase().replace(/\s+/g, '');
  if (lower.includes('binance')) return 'binance';
  if (lower.includes('coindcx')) return 'coindcx';
  if (lower.includes('delta')) return 'delta';
  if (lower.includes('wazirx')) return 'wazirx';
  if (lower.includes('pi42')) return 'pi42';
  if (lower.includes('kucoin')) return 'kucoin';
  if (lower.includes('zebpay')) return 'zebpay';
  if (lower.includes('kraken')) return 'kraken';
  if (lower.includes('bybit')) return 'bybit';
  return 'binance';
}

// ─── Bulk price cache (single Binance request for all symbols) ─────────────
// In-memory price map updated by the worker. One HTTP call per tick covers
// every active bot, avoiding per-bot rate-limit risk (HTTP 429 / IP ban).
let priceCache: Record<string, number> = {};
let priceCacheTimestamp = 0;

async function fetchAllBinancePrices(coins: string[]): Promise<Record<string, number>> {
  if (coins.length === 0) return {};
  const symbols = coins.map(c => `${c.toUpperCase()}USDT`);
  const symbolsParam = encodeURIComponent(JSON.stringify(symbols));
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=${symbolsParam}`);
    if (!res.ok) return {};
    const data = await res.json() as Array<{ symbol: string; price: string }>;
    const map: Record<string, number> = {};
    for (const item of data) {
      const coin = item.symbol.replace('USDT', '');
      map[coin] = parseFloat(item.price);
    }
    return map;
  } catch {
    return {};
  }
}

// Legacy single-symbol fetch (still used by /api/place-trade if needed)
async function fetchBinancePrice(symbol: string): Promise<number | null> {
  const coin = symbol.includes('/') ? symbol.split('/')[0] : symbol.replace('USDT', '');
  if (priceCache[coin.toUpperCase()] != null && Date.now() - priceCacheTimestamp < 5000) {
    return priceCache[coin.toUpperCase()];
  }
  try {
    const binanceSymbol = symbol.includes('/') ? symbol.replace('/', '').toUpperCase() : `${symbol.toUpperCase()}USDT`;
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`);
    if (!res.ok) return null;
    const data = await res.json() as { price: string };
    return parseFloat(data.price);
  } catch {
    return null;
  }
}

// ─── Risk settings helper ───────────────────────────────────────────────────
async function fetchRiskSettings(admin: ReturnType<typeof getSupabaseAdmin>) {
  if (!admin) return null;
  const { data, error } = await admin.rpc('get_risk_settings');
  if (error) {
    console.error('[RISK] Failed to fetch risk_settings:', error.message);
    return null;
  }
  return data as {
    global_kill_switch: boolean;
    auto_disable_on_breach: boolean;
    max_slippage_pct: number;
    ai_circuit_breaker: boolean;
  } | null;
}

// ─── /api/place-trade ───────────────────────────────────────────────────────
app.post('/api/place-trade', async (req, res) => {
  const body = req.body as PlaceTradeBody;

  if (!body || !body.coin || !body.pair) {
    return res.status(400).json({ success: false, error: 'Missing required fields: coin, pair' });
  }

  // ─── Risk settings gate: check global kill switch and circuit breaker ──────
  const adminClient = getSupabaseAdmin();
  const riskSettings = await fetchRiskSettings(adminClient);
  if (riskSettings?.global_kill_switch) {
    return res.status(403).json({ success: false, error: 'Global kill switch is active. All trading is paused.' });
  }
  if (riskSettings?.ai_circuit_breaker) {
    // Check for flash-crash: if entry price deviates >15% from cached price, reject
    const cachedPrice = priceCache[body.coin.toUpperCase()];
    if (cachedPrice && body.entry_price > 0) {
      const deviation = Math.abs(body.entry_price - cachedPrice) / cachedPrice * 100;
      if (deviation > 15) {
        return res.status(403).json({ success: false, error: `AI circuit breaker triggered: price deviation of ${deviation.toFixed(1)}% detected. Trade rejected for safety.` });
      }
    }
  }

  const isLive = body.trading_mode === 'live';
  const symbol = body.binance_symbol || `${body.coin}/USDT`;
  const side = body.direction === 'long' ? 'buy' : 'sell';

  // ─── If investment_amount_inr is provided, dynamically calculate quantity ──
  let amount = body.quantity;
  let entryPrice = body.entry_price;

  if (body.investment_amount_inr && body.investment_amount_inr > 0) {
    // Fetch live price from Binance if we don't have a fresh one
    const livePrice = await fetchBinancePrice(symbol);
    if (livePrice && livePrice > 0) {
      entryPrice = livePrice;
    }
    // Fetch live USD/INR rate
    let usdToInrRate = 83.5; // fallback
    try {
      const rateRes = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      if (rateRes.ok) {
        const rateData = await rateRes.json() as { rates?: Record<string, number> };
        if (rateData.rates?.INR && rateData.rates.INR > 0) {
          usdToInrRate = rateData.rates.INR;
        }
      }
    } catch {
      // Keep fallback rate
    }
    const usdAmount = body.investment_amount_inr / usdToInrRate;
    amount = usdAmount / entryPrice;
    console.log(`[INR TRADE] ₹${body.investment_amount_inr} → ${usdAmount.toFixed(2)} → ${amount.toFixed(6)} ${body.coin} (rate: ₹${usdToInrRate}, price: ${entryPrice})`);
  }

  // Compute TP/SL prices for storage
  const tpPct = body.take_profit_pct;
  const slPct = body.stop_loss_pct;
  const tpPrice = tpPct != null
    ? body.direction === 'long'
      ? body.entry_price * (1 + tpPct / 100)
      : body.entry_price * (1 - tpPct / 100)
    : null;
  const slPrice = slPct != null
    ? body.direction === 'long'
      ? body.entry_price * (1 - slPct / 100)
      : body.entry_price * (1 + slPct / 100)
    : null;

  // ─── Paper trading: simulate the order ────────────────────────────────────
  if (!isLive) {
    console.log(`[PAPER TRADE] ${side.toUpperCase()} ${amount} ${symbol} @ ${entryPrice} (${body.order_type})`);
    const orderId = `paper-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    // Save trade to trade_history via RPC (bypasses RLS)
    const admin = getSupabaseAdmin();
    if (admin) {
      try {
        await admin.rpc('log_trade', {
          p_user_id: body.user_id || null,
          p_pair: body.pair,
          p_side: side === 'buy' ? 'BUY' : 'SELL',
          p_amount: amount,
          p_price: entryPrice,
          p_pnl: 0,
          p_strategy: body.bot_type,
        });
      } catch (e) {
        // Non-fatal: trade history is supplementary
      }
    }

    return res.json({
      success: true,
      order_id: orderId,
      mode: 'paper',
      coin: body.coin,
      pair: body.pair,
      direction: body.direction,
      entry_price: entryPrice,
      quantity: amount,
      position_size: amount * entryPrice,
      leverage: body.leverage,
      take_profit_price: tpPrice,
      stop_loss_price: slPrice,
      message: 'Paper trade simulated successfully (no real funds used)',
      timestamp: new Date().toISOString(),
    });
  }

  // ─── Live trading: use CCXT with provided credentials ─────────────────────
  if (!body.api_key || !body.api_secret) {
    return res.status(400).json({
      success: false,
      error: 'Live trading requires API credentials. Please connect your broker first.',
    });
  }

  const exchangeId = mapExchangeName(body.exchange || 'Binance');

  try {
    const exchange = await createExchange(exchangeId, body.api_key, body.api_secret, true);

    // Validate credentials by fetching ticker
    try {
      await exchange.fetchTicker(symbol);
    } catch (tickerErr: any) {
      if (tickerErr?.message?.includes('apikey') || tickerErr?.message?.includes('Invalid API')) {
        return res.status(401).json({ success: false, error: 'Invalid API key or secret. Please check your broker credentials.' });
      }
    }

    // Set leverage for futures before placing order
    if (body.market_type === 'futures' && body.leverage > 1) {
      try {
        if (typeof exchange.setLeverage === 'function') {
          await exchange.setLeverage(body.leverage, symbol);
        }
      } catch {
        // Best-effort; some exchanges handle leverage per-position
      }
    }

    // Place the order via CCXT
    let order;
    try {
      order = await exchange.createOrder(
        symbol,
        body.order_type,
        side,
        amount,
        body.order_type === 'limit' ? body.entry_price : undefined
      );
    } catch (orderErr: any) {
      const msg = orderErr?.message || '';

      if (msg.includes('insufficient') || msg.includes('balance') || msg.includes('funds')) {
        return res.status(400).json({ success: false, error: 'Insufficient funds in your exchange account for this trade.' });
      }
      if (msg.includes('rate limit') || msg.includes('429') || msg.includes('ETIMEDOUT')) {
        return res.status(429).json({ success: false, error: 'Exchange rate limit reached. Please retry in a few seconds.' });
      }
      if (msg.includes('apikey') || msg.includes('signature') || msg.includes('Unauthorized')) {
        return res.status(401).json({ success: false, error: 'Invalid or unauthorized API credentials. Please reconnect your broker.' });
      }
      if (msg.includes('MIN_NOTIONAL') || msg.includes('minimum')) {
        return res.status(400).json({ success: false, error: 'Order amount too small for this trading pair. Increase your position size.' });
      }
      throw orderErr;
    }

    console.log(`[LIVE TRADE] ${side.toUpperCase()} ${amount} ${symbol} — Order ID: ${order?.id}`);

    // Save trade to trade_history via RPC (bypasses RLS)
    const admin = getSupabaseAdmin();
    if (admin) {
      try {
        await admin.rpc('log_trade', {
          p_user_id: body.user_id || null,
          p_pair: body.pair,
          p_side: side === 'buy' ? 'BUY' : 'SELL',
          p_amount: amount,
          p_price: entryPrice,
          p_pnl: 0,
          p_strategy: body.bot_type,
        });
      } catch {
        // Non-fatal
      }
    }

    return res.json({
      success: true,
      order_id: order?.id || `live-${Date.now()}`,
      mode: 'live',
      coin: body.coin,
      pair: body.pair,
      direction: body.direction,
      entry_price: entryPrice,
      quantity: amount,
      position_size: amount * entryPrice,
      leverage: body.leverage,
      take_profit_price: tpPrice,
      stop_loss_price: slPrice,
      message: 'Live trade order submitted to broker API successfully',
      exchange_response: order,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[LIVE TRADE ERROR]', err.message);
    return res.status(500).json({
      success: false,
      error: `Exchange error: ${err.message || 'Unknown error placing trade'}`,
    });
  }
});

// ─── /api/connect-broker (alias for /api/save-broker-keys) ──────────────────
app.post('/api/connect-broker', async (req, res) => {
  const body = req.body as SaveBrokerKeysBody;

  if (!body || !body.exchange_name || !body.api_key || !body.api_secret) {
    return res.status(400).json({ success: false, error: 'Missing required fields: exchange_name, api_key, api_secret' });
  }

  try {
    const { encrypted: encKey, iv } = encrypt(body.api_key);
    const { encrypted: encSecret } = encrypt(body.api_secret);
    const maskedKey = body.api_key.slice(0, 8) + '***';
    const maskedSecret = body.api_secret.slice(0, 8) + '***';

    const admin = getSupabaseAdmin();
    if (!admin) {
      return res.json({
        success: true,
        encrypted_api_key: encKey,
        encrypted_api_secret: encSecret,
        encryption_iv: iv,
        message: 'API keys encrypted. Save these to your broker_keys table.',
      });
    }

    // Upsert via RPC (bypasses RLS)
    const { error: upsertError } = await admin.rpc('upsert_broker_keys', {
      p_user_id: body.user_id || null,
      p_exchange_name: body.exchange_name,
      p_exchange_id: body.exchange_id || null,
      p_encrypted_api_key: encKey,
      p_encrypted_api_secret: encSecret,
      p_encryption_iv: iv,
      p_api_key_masked: maskedKey,
      p_api_secret_masked: maskedSecret,
    });
    if (upsertError) throw upsertError;

    return res.json({
      success: true,
      message: 'Broker connected securely. API keys encrypted with AES-256-GCM.',
    });
  } catch (err: any) {
    console.error('[CONNECT BROKER ERROR]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to encrypt and store API keys.' });
  }
});

// Keep the original endpoint as an alias
app.post('/api/save-broker-keys', async (req, res) => {
  // Forward to /api/connect-broker logic by re-processing
  const body = req.body as SaveBrokerKeysBody;

  if (!body || !body.exchange_name || !body.api_key || !body.api_secret) {
    return res.status(400).json({ success: false, error: 'Missing required fields: exchange_name, api_key, api_secret' });
  }

  try {
    const { encrypted: encKey, iv } = encrypt(body.api_key);
    const { encrypted: encSecret } = encrypt(body.api_secret);

    const admin = getSupabaseAdmin();
    if (!admin) {
      return res.json({
        success: true,
        encrypted_api_key: encKey,
        encrypted_api_secret: encSecret,
        encryption_iv: iv,
        message: 'API keys encrypted. Save these to your broker_keys table.',
      });
    }

    const { error: upsertError } = await admin.rpc('upsert_broker_keys', {
      p_user_id: body.user_id || null,
      p_exchange_name: body.exchange_name,
      p_exchange_id: body.exchange_id || null,
      p_encrypted_api_key: encKey,
      p_encrypted_api_secret: encSecret,
      p_encryption_iv: iv,
      p_api_key_masked: body.api_key.slice(0, 8) + '***',
      p_api_secret_masked: body.api_secret.slice(0, 8) + '***',
    });
    if (upsertError) throw upsertError;

    return res.json({
      success: true,
      message: 'API keys encrypted and stored securely.',
    });
  } catch (err: any) {
    console.error('[SAVE BROKER KEYS ERROR]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to encrypt and store API keys.' });
  }
});

// ─── /api/decrypt-broker-keys — retrieve decrypted keys for bot launch ──────
app.post('/api/decrypt-broker-keys', async (req, res) => {
  const { encrypted_api_key, encrypted_api_secret, encryption_iv } = req.body;

  if (!encrypted_api_key || !encrypted_api_secret || !encryption_iv) {
    return res.status(400).json({ success: false, error: 'Missing encrypted key data' });
  }

  try {
    const apiKey = decrypt(encrypted_api_key, encryption_iv);
    const apiSecret = decrypt(encrypted_api_secret, encryption_iv);
    return res.json({ success: true, api_key: apiKey, api_secret: apiSecret });
  } catch (err: any) {
    console.error('[DECRYPT ERROR]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to decrypt API keys.' });
  }
});

// ─── /api/backtest — realistic simulated backtest ───────────────────────────
app.post('/api/backtest', (req, res) => {
  const body = req.body as BacktestBody;

  if (!body || !body.symbol) {
    return res.status(400).json({ success: false, error: 'Missing required field: symbol' });
  }

  const initial = body.initial_capital || 5000;
  const months = 6;
  const tpPct = body.take_profit_pct || 5;
  const slPct = body.stop_loss_pct || 2;
  const leverage = body.leverage || 1;
  const rrRatio = body.rr_ratio || 2;

  const baseMonthly = body.risk_level === 'Low' ? 5 : body.risk_level === 'Medium' ? 10 : 18;
  const baseWinRate = body.risk_level === 'Low' ? 82 : body.risk_level === 'Medium' ? 72 : 64;

  const leverageMultiplier = Math.min(leverage / 10, 2);
  const indicatorBoost = body.indicators.length > 0 ? 1.15 : 1.0;
  const monthlyReturn = baseMonthly * leverageMultiplier * indicatorBoost;

  const equityCurve: { month: string; equity: number }[] = [];
  let equity = initial;
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  let wins = 0;
  let losses = 0;
  let maxDrawdown = 0;
  let peak = initial;

  for (let i = 0; i < months; i++) {
    const isDrawdownMonth = i === Math.floor(months * 0.4) || i === Math.floor(months * 0.65);
    if (isDrawdownMonth) {
      const dd = (slPct * leverage) / 3;
      equity *= (1 - dd / 100);
      losses += Math.floor(15 + Math.random() * 10);
      maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100);
    } else {
      const variance = (Math.random() - 0.35) * monthlyReturn * 0.7;
      equity *= (1 + (monthlyReturn + variance) / 100);
      wins += Math.floor(15 + Math.random() * 10);
      peak = Math.max(peak, equity);
    }
    equityCurve.push({ month: monthLabels[i] || `M${i + 1}`, equity: Math.round(equity) });
  }

  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : baseWinRate;
  const finalEquity = equityCurve[equityCurve.length - 1]?.equity || initial;
  const totalReturn = ((finalEquity - initial) / initial) * 100;
  const profitPerMonth = (finalEquity - initial) / months;
  const sharpe = 1 + monthlyReturn / 15;
  const profitFactor = 1 + (monthlyReturn * rrRatio) / (slPct * 20);

  return res.json({
    success: true,
    equity_curve: equityCurve,
    metrics: {
      win_rate: winRate,
      total_trades: totalTrades,
      winning_trades: wins,
      losing_trades: losses,
      monthly_profit: profitPerMonth,
      total_return: totalReturn,
      max_drawdown: maxDrawdown,
      final_equity: finalEquity,
      sharpe_ratio: sharpe,
      profit_factor: profitFactor,
      avg_win: monthlyReturn * 3,
      avg_loss: -(slPct * leverage * 0.8),
      risk_reward: `1:${rrRatio}`,
      max_leverage: leverage,
    },
    timestamp: new Date().toISOString(),
  });
});

// ─── /api/admin/dashboard-stats — aggregated platform metrics ───────────────
app.get('/api/admin/dashboard-stats', async (_req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return res.json({ success: false, error: 'Database not configured', stats: null });
  }

  try {
    const { data: raw, error } = await admin.rpc('get_admin_dashboard_stats');
    if (error) throw error;
    const d = raw as any;

    const trades = d.trades ?? [];
    const totalVolume = trades.reduce((sum: number, t: any) => sum + (Number(t.amount) * Number(t.price)), 0);
    const totalRealizedPnl = trades.reduce((sum: number, t: any) => sum + Number(t.pnl || 0), 0);

    const bots = d.bots ?? [];
    const totalUnrealizedPnl = bots
      .filter((b: any) => b.status === 'running')
      .reduce((sum: number, b: any) => sum + Number(b.profit_loss || 0), 0);

    const funds = d.funds ?? [];
    const totalAum = funds.reduce((s: number, f: any) => s + Number(f.balance || 0), 0);
    const fundsUnrealized = funds.reduce((s: number, f: any) => s + Number(f.unrealized_pnl || 0), 0);
    const fundsRealized = funds.reduce((s: number, f: any) => s + Number(f.realized_pnl || 0), 0);

    const licenses = d.licenses ?? [];
    const activeLicenses = licenses.filter((l: any) => l.is_active).length;

    const stats = {
      total_users: d.total_users || 0,
      total_bots: d.total_bots || 0,
      running_bots: d.running_bots || 0,
      paused_bots: d.paused_bots || 0,
      total_trades: trades.length,
      total_volume: totalVolume,
      global_realized_pnl: totalRealizedPnl + fundsRealized,
      global_unrealized_pnl: totalUnrealizedPnl + fundsUnrealized,
      total_aum: totalAum,
      active_licenses: activeLicenses,
      worker_active: botWorkerRunning,
      worker_interval_ms: BOT_WORKER_INTERVAL_MS,
      timestamp: new Date().toISOString(),
    };

    return res.json({ success: true, stats });
  } catch (err: any) {
    console.error('[ADMIN DASHBOARD STATS ERROR]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats', stats: null });
  }
});

// ─── /api/admin/recent-activity — latest trades + bot events for audit log ──
app.get('/api/admin/recent-activity', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return res.json({ success: false, error: 'Database not configured', activity: [] });
  }

  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

  try {
    const { data: raw, error } = await admin.rpc('get_admin_recent_activity', { p_limit: limit });
    if (error) throw error;
    const d = raw as any;
    const recentTrades = d.trades ?? [];
    const recentBots = d.bots ?? [];
    const adminLogs = d.admin_logs ?? [];

    type ActivityItem = {
      id: string;
      type: 'trade' | 'bot_launch' | 'admin_action';
      severity: 'info' | 'success' | 'warning' | 'critical';
      message: string;
      actor: string;
      created_at: string;
    };

    const activity: ActivityItem[] = [];

    // Normalize trades into activity items
    for (const t of recentTrades) {
      activity.push({
        id: `trade-${t.id}`,
        type: 'trade',
        severity: Number(t.pnl) >= 0 ? 'success' : 'warning',
        message: `${t.side} ${t.amount} ${t.pair} @ ${Number(t.price).toFixed(2)} — PnL: ${Number(t.pnl || 0).toFixed(2)} USD (${t.strategy || 'manual'})`,
        actor: (t.user_id as string)?.slice(0, 8) || 'system',
        created_at: t.created_at,
      });
    }

    // Normalize bot launches
    for (const b of recentBots ?? []) {
      activity.push({
        id: `bot-${b.id}`,
        type: 'bot_launch',
        severity: b.status === 'running' ? 'success' : 'info',
        message: `Bot "${b.name}" launched — ${b.coin} ${b.strategy} (${b.trading_mode || 'paper'}, ${b.status})`,
        actor: (b.user_id as string)?.slice(0, 8) || 'system',
        created_at: b.created_at,
      });
    }

    // Normalize admin activity log
    for (const a of adminLogs ?? []) {
      activity.push({
        id: `admin-${a.id}`,
        type: 'admin_action',
        severity: a.severity || 'info',
        message: a.message,
        actor: a.admin_email || a.admin_name || 'admin',
        created_at: a.created_at,
      });
    }

    // Sort all activity by created_at desc and take the top N
    activity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const topActivity = activity.slice(0, limit);

    return res.json({ success: true, activity: topActivity });
  } catch (err: any) {
    console.error('[ADMIN RECENT ACTIVITY ERROR]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch activity', activity: [] });
  }
});

// ─── /api/user/bot-count — get running bot count for a user (via RPC) ───────
app.get('/api/user/bot-count', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.json({ success: true, count: 0 });
  const userId = req.query.user_id as string;
  if (!userId) return res.json({ success: true, count: 0 });
  try {
    const { data, error } = await admin.rpc('get_running_bot_count', { p_user_id: userId });
    if (error) throw error;
    return res.json({ success: true, count: data ?? 0 });
  } catch (err: any) {
    console.error('[BOT COUNT ERROR]', err.message);
    return res.json({ success: true, count: 0 });
  }
});

// ─── /api/user/bots — list bots for a user (via RPC) ────────────────────────
app.get('/api/user/bots', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.json({ success: false, bots: [] });
  const userId = req.query.user_id as string | undefined;
  const tradingMode = req.query.trading_mode as string | undefined;
  try {
    const { data, error } = await admin.rpc('get_user_bots', {
      p_user_id: userId || null,
      p_trading_mode: tradingMode || null,
    });
    if (error) throw error;
    return res.json({ success: true, bots: data || [] });
  } catch (err: any) {
    console.error('[USER BOTS ERROR]', err.message);
    return res.json({ success: false, bots: [] });
  }
});

// ─── /api/user/bots/:id/status — update bot status (via RPC) ────────────────
app.patch('/api/user/bots/:id/status', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ success: false, error: 'DB not configured' });
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ success: false, error: 'Missing status' });
  try {
    const { error } = await admin.rpc('update_bot_status', { p_bot_id: id, p_status: status });
    if (error) throw error;
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[BOT STATUS UPDATE ERROR]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── /api/launch-bot — save bot to DB via RPC (bypasses browser schema cache) ─
app.post('/api/launch-bot', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ success: false, error: 'Database not configured' });

  const b = req.body;
  if (!b.name || !b.coin || !b.strategy) {
    return res.status(400).json({ success: false, error: 'Missing required fields: name, coin, strategy' });
  }

  try {
    const { data, error } = await admin.rpc('launch_bot', {
      p_user_id: b.user_id || null,
      p_name: b.name,
      p_market_type: b.market_type,
      p_coin: b.coin,
      p_strategy: b.strategy,
      p_trading_mode: b.trading_mode || null,
      p_direction: b.direction || null,
      p_entry_price: b.entry_price ?? null,
      p_quantity: b.quantity ?? null,
      p_position_size: b.position_size ?? null,
      p_investment_amount_inr: b.investment_amount_inr ?? null,
      p_leverage: b.leverage ?? 1,
      p_take_profit_pct: b.take_profit_pct ?? null,
      p_stop_loss_pct: b.stop_loss_pct ?? null,
      p_take_profit_price: b.take_profit_price ?? null,
      p_stop_loss_price: b.stop_loss_price ?? null,
      p_max_daily_loss: b.max_daily_loss ?? null,
      p_max_daily_profit: b.max_daily_profit ?? null,
      p_indicators: b.indicators || [],
    });

    if (error) throw error;

    return res.json({ success: true, bot: data });
  } catch (err: any) {
    console.error('[LAUNCH BOT ERROR] Full error:', err);
    const errMsg = err?.message || err?.details || err?.hint || JSON.stringify(err) || 'Unknown backend error';
    console.error('[LAUNCH BOT ERROR] Message:', errMsg);
    return res.status(500).json({ success: false, error: errMsg });
  }
});

// ─── /api/bot-status — get worker monitoring status ─────────────────────────
app.get('/api/bot-status', async (_req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return res.json({ success: true, worker_active: botWorkerRunning, monitored_bots: 0 });
  }

  try {
    const { data, error } = await admin.rpc('get_bot_status_list');
    if (error) throw error;
    const runningBots = data || [];

    return res.json({
      success: true,
      worker_active: botWorkerRunning,
      monitored_bots: runningBots.length,
      bots: runningBots,
    });
  } catch {
    return res.json({ success: true, worker_active: botWorkerRunning, monitored_bots: 0 });
  }
});

// ─── /api/admin/clients — unified client list + aggregated stats ─────────────
app.get('/api/admin/clients', async (_req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.json({ success: false, clients: [], stats: null });

  try {
    const { data: raw, error } = await admin.rpc('get_admin_clients');
    if (error) throw error;
    const d = raw as any;
    const profiles = d.profiles ?? [];
    const funds = d.funds ?? [];
    const bots = d.bots ?? [];
    const licenses = d.licenses ?? [];
    const brokerKeys = d.broker_keys ?? [];

    const fundsMap = new Map((funds as any[] ?? []).map((f: any) => [f.user_id, f]));
    const licensesMap = new Map((licenses as any[] ?? []).filter((l: any) => l.is_active).map((l: any) => [l.user_id, l]));
    const brokerMap = new Map<string, any[]>();
    for (const bk of brokerKeys ?? []) {
      const arr = brokerMap.get(bk.user_id) ?? [];
      arr.push(bk);
      brokerMap.set(bk.user_id, arr);
    }

    const clients = (profiles ?? []).map((p: any) => {
      const fund = fundsMap.get(p.id) as any;
      const license = licensesMap.get(p.id) as any;
      const userBots = (bots ?? []).filter((b: any) => b.user_id === p.id);
      const userBrokers = brokerMap.get(p.id) ?? [];
      const connectedExchanges = userBrokers
        .filter((b: any) => b.is_connected)
        .map((b: any) => ({ name: b.exchange_name, status: 'connected' as const }));

      return {
        id: p.id,
        email: p.email,
        name: p.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        status: p.status || 'active',
        country: p.country || '—',
        totalFunds: Number(fund?.balance ?? 0),
        unrealizedPnl: Number(fund?.unrealized_pnl ?? 0),
        realizedPnl: Number(fund?.realized_pnl ?? 0),
        activeBots: userBots.filter((b: any) => b.status === 'running').length,
        manualTrading: Boolean(fund?.manual_trading_enabled),
        joinedDate: p.created_at?.split('T')[0] ?? '',
        plan: license?.plan_name ?? 'Starter',
        licenseValidUntil: license?.valid_until ?? new Date(Date.now() + 30 * 86400000).toISOString(),
        botLimit: Number(license?.bot_limit ?? 2),
        connectedExchanges,
      };
    });

    const stats = {
      total: clients.length,
      active: clients.filter((c: any) => c.status === 'active').length,
      suspended: clients.filter((c: any) => c.status === 'suspended').length,
      banned: clients.filter((c: any) => c.status === 'banned').length,
      starter: clients.filter((c: any) => c.plan === 'Starter').length,
      pro: clients.filter((c: any) => c.plan === 'Pro').length,
      enterprise: clients.filter((c: any) => c.plan === 'Enterprise').length,
    };

    return res.json({ success: true, clients, stats });
  } catch (err: any) {
    console.error('[ADMIN CLIENTS ERROR]', err.message);
    return res.status(500).json({ success: false, error: err.message, clients: [], stats: null });
  }
});

// ─── /api/admin/clients/:id — update client profile + plan ──────────────────
app.patch('/api/admin/clients/:id', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ success: false, error: 'DB not configured' });
  const { id } = req.params;
  const { name, country, status, plan, valid_until, bot_limit } = req.body;

  try {
    const messages: string[] = [];
    if (plan) messages.push(`Plan changed to ${plan}`);
    if (status) messages.push(`Account status set to ${status}`);
    if (valid_until) messages.push(`License valid until ${valid_until.split('T')[0]}`);

    const { error: rpcError } = await admin.rpc('admin_update_client', {
      p_client_id: id,
      p_country: country ?? null,
      p_status: status ?? null,
      p_plan_name: plan ?? null,
      p_valid_until: valid_until ?? null,
      p_bot_limit: bot_limit ?? null,
      p_update_title: messages.length > 0 ? messages.join(', ') : null,
      p_update_message: messages.length > 0 ? messages.join('. ') + '.' : null,
      p_update_type: plan ? 'plan_change' : 'status_change',
      p_severity: status === 'banned' ? 'critical' : 'info',
      p_executed_by: 'Master Admin',
    });
    if (rpcError) throw rpcError;

    return res.json({ success: true, message: 'Client updated successfully' });
  } catch (err: any) {
    console.error('[ADMIN UPDATE CLIENT ERROR]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── /api/admin/clients/:id/trades — fetch trade history for a client ────────
app.get('/api/admin/clients/:id/trades', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.json({ success: false, trades: [] });
  try {
    const { data, error } = await admin.rpc('get_client_trades', { p_client_id: req.params.id });
    if (error) throw error;
    return res.json({ success: true, trades: data || [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, trades: [] });
  }
});

// ─── /api/admin/execute-trade — admin places a trade on behalf of a client ──
app.post('/api/admin/execute-trade', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ success: false, error: 'DB not configured' });
  const { client_id, client_name, coin, market_type, direction, entry_price, amount, quantity, leverage, position_size, tp_pct, sl_pct, executed_by } = req.body;
  if (!client_id || !coin || !direction) {
    return res.status(400).json({ success: false, error: 'Missing required fields: client_id, coin, direction' });
  }

  try {
    // Insert the trade record via RPC
    const { data: trade, error: tradeError } = await admin.rpc('admin_execute_trade', {
      p_client_id: client_id,
      p_client_name: client_name || 'Unknown',
      p_coin: coin,
      p_market_type: market_type || 'spot',
      p_direction: direction,
      p_entry_price: Number(entry_price),
      p_amount: Number(amount),
      p_quantity: Number(quantity),
      p_leverage: Number(leverage) || 1,
      p_position_size: Number(position_size),
      p_tp_pct: tp_pct != null ? Number(tp_pct) : null,
      p_sl_pct: sl_pct != null ? Number(sl_pct) : null,
      p_executed_by: executed_by || 'Master Admin',
    });

    if (tradeError) throw tradeError;

    // Attempt live order via CCXT if broker keys exist
    let liveOrderPlaced = false;
    let liveOrderError: string | null = null;

    try {
      const { data: brokerDataArr } = await admin.rpc('get_user_broker_keys', { p_user_id: client_id });
      const brokerData = (brokerDataArr as any[])?.[0];

      if (brokerData?.encrypted_api_key && brokerData?.encrypted_api_secret && brokerData?.encryption_iv) {
        const apiKey = decrypt(brokerData.encrypted_api_key, brokerData.encryption_iv);
        const apiSecret = decrypt(brokerData.encrypted_api_secret, brokerData.encryption_iv);
        const exchangeId = mapExchangeName(brokerData.exchange_name);
        const exchange = await createExchange(exchangeId, apiKey, apiSecret, true);

        const orderSide = direction === 'long' ? 'buy' : 'sell';
        const symbol = `${coin}/USDT`;
        await exchange.createOrder(symbol, 'market', orderSide, Number(quantity));
        liveOrderPlaced = true;
        console.log(`[ADMIN TRADE] Live order placed for client ${client_id}: ${orderSide} ${quantity} ${symbol}`);
      }
    } catch (liveErr: any) {
      liveOrderError = liveErr.message;
      console.error(`[ADMIN TRADE] Live order failed for client ${client_id}:`, liveErr.message);
    }

    return res.json({
      success: true,
      trade,
      live_order_placed: liveOrderPlaced,
      live_order_error: liveOrderError,
    });
  } catch (err: any) {
    console.error('[ADMIN EXECUTE TRADE ERROR]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── /api/admin/impersonate — generate impersonation token for a client ─────
app.post('/api/admin/impersonate', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ success: false, error: 'DB not configured' });
  const { client_id } = req.body;
  if (!client_id) return res.status(400).json({ success: false, error: 'Missing client_id' });

  try {
    const { data: profile } = await admin.rpc('get_profile_by_id', { p_user_id: client_id });

    if (!profile) return res.status(404).json({ success: false, error: 'Client not found' });

    // Generate a short-lived impersonation token (base64-encoded JSON, expires in 5 min)
    const expiresAt = Date.now() + 5 * 60 * 1000;
    const payload = {
      client_id: profile.id,
      client_email: profile.email,
      expires_at: expiresAt,
    };
    const token = Buffer.from(JSON.stringify(payload)).toString('base64url');

    // Log the impersonation action via RPC
    await admin.rpc('admin_insert_client_update', {
      p_client_id: profile.id,
      p_update_type: 'status_change',
      p_title: 'Admin Access Granted',
      p_message: 'An admin accessed your panel in impersonation mode for support purposes.',
      p_severity: 'warning',
      p_executed_by: 'Master Admin',
    });

    return res.json({
      success: true,
      token,
      profile,
      expires_at: expiresAt,
      redirect_url: `/impersonate?token=${token}`,
    });
  } catch (err: any) {
    console.error('[ADMIN IMPERSONATE ERROR]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── RBAC Helper — fetch admin profile and check permissions ────────────────
async function getAdminContext(adminUserId: string | undefined) {
  const admin = getSupabaseAdmin();
  if (!admin || !adminUserId) return null;
  const { data } = await admin.rpc('get_profile_by_id', { p_user_id: adminUserId });
  if (!data) return null;
  return {
    id: data.id,
    email: data.email,
    role: data.role as 'master_admin' | 'sub_admin' | 'client',
    permissions: (data.permissions as string[] | null) ?? [],
    parent_admin_id: data.parent_admin_id as string | null,
    license_quota: data.license_quota as number,
    quota_ledger: (data.quota_ledger as Record<string, { total: number; used: number }> | null) ?? null,
  };
}

function hasPermission(ctx: { role: string; permissions: string[] } | null, perm: string): boolean {
  if (!ctx) return false;
  if (ctx.role === 'master_admin') return true;
  return ctx.permissions.includes(perm);
}

// ─── /api/user/broker/connect — save broker keys with CCXT connection test ───
app.post('/api/user/broker/connect', async (req, res) => {
  const admin = getSupabaseAdmin();
  const body = req.body as SaveBrokerKeysBody & { test_connection?: boolean };

  if (!body || !body.exchange_name || !body.api_key || !body.api_secret) {
    return res.status(400).json({ success: false, error: 'Missing required fields: exchange_name, api_key, api_secret' });
  }

  // Use explicit exchange_id if provided, otherwise map from name
  const ccxtExchangeId = body.exchange_id || mapExchangeName(body.exchange_name);

  // Step 1: Test the exchange connection via CCXT before saving
  if (body.test_connection !== false) {
    try {
      const exchange = await createExchange(ccxtExchangeId, body.api_key, body.api_secret, true);
      // Lightweight validation: fetchBalance or fetchTicker to verify credentials
      try {
        await exchange.fetchBalance();
      } catch (balErr: any) {
        // Some exchanges restrict balance API; fall back to ticker test
        try {
          await exchange.fetchTicker('BTC/USDT');
        } catch (tickErr: any) {
          const msg = tickErr?.message || balErr?.message || 'Connection failed';
          if (msg.includes('apikey') || msg.includes('Invalid API') || msg.includes('signature') || msg.includes('Unauthorized')) {
            return res.status(401).json({ success: false, error: 'Invalid API key or secret. Please verify your credentials.' });
          }
          return res.status(400).json({ success: false, error: `Exchange connection test failed: ${msg}` });
        }
      }
    } catch (err: any) {
      return res.status(400).json({ success: false, error: `Failed to connect to ${body.exchange_name}: ${err.message}` });
    }
  }

  // Step 2: Encrypt and store
  try {
    const { encrypted: encKey, iv } = encrypt(body.api_key);
    const { encrypted: encSecret } = encrypt(body.api_secret);
    const maskedKey = body.api_key.slice(0, 8) + '***';
    const maskedSecret = body.api_secret.slice(0, 8) + '***';

    if (!admin) {
      return res.json({ success: true, message: 'Connection test passed, but database not configured for storage.' });
    }

    const { error: upsertError } = await admin.rpc('upsert_broker_keys', {
      p_user_id: body.user_id || null,
      p_exchange_name: body.exchange_name,
      p_exchange_id: ccxtExchangeId,
      p_encrypted_api_key: encKey,
      p_encrypted_api_secret: encSecret,
      p_encryption_iv: iv,
      p_api_key_masked: maskedKey,
      p_api_secret_masked: maskedSecret,
    });
    if (upsertError) throw upsertError;

    return res.json({ success: true, message: `${body.exchange_name} connected successfully. API keys encrypted with AES-256-GCM.` });
  } catch (err: any) {
    console.error('[USER BROKER CONNECT ERROR]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to encrypt and store API keys.' });
  }
});

// ─── /api/admin/clients/:id/broker-keys — decrypted keys for authorized admins ─
app.get('/api/admin/clients/:id/broker-keys', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ success: false, error: 'DB not configured' });

  const { id } = req.params;
  const adminUserId = req.query.admin_id as string | undefined;

  // RBAC: verify the requesting admin has permission
  const ctx = await getAdminContext(adminUserId);
  if (!ctx) {
    return res.status(403).json({ success: false, error: 'Unauthorized: admin identity required' });
  }

  const allowed = ctx.role === 'master_admin' || (ctx.role === 'sub_admin' && ctx.permissions.includes('view_api_keys'));
  if (!allowed) {
    return res.status(403).json({ success: false, error: 'You do not have permission to view broker API keys' });
  }

  try {
    // For sub_admins, verify the client belongs to them
    if (ctx.role === 'sub_admin') {
      const { data: clientProfile } = await admin.rpc('get_profile_by_id', { p_user_id: id });
      if (!clientProfile || clientProfile.parent_admin_id !== ctx.id) {
        return res.status(403).json({ success: false, error: 'You can only view broker keys for your own clients' });
      }
    }

    const { data: brokerKeysRaw, error } = await admin.rpc('get_client_broker_keys_raw', { p_user_id: id });

    if (error) throw error;
    const brokerKeys = brokerKeysRaw || [];

    const decrypted = (brokerKeys ?? []).map((bk: any) => {
      let plainApiKey = '';
      let plainApiSecret = '';
      if (bk.encrypted_api_key && bk.encrypted_api_secret && bk.encryption_iv) {
        try {
          plainApiKey = decrypt(bk.encrypted_api_key, bk.encryption_iv);
          plainApiSecret = decrypt(bk.encrypted_api_secret, bk.encryption_iv);
        } catch (e: any) {
          console.error('[ADMIN BROKER KEYS] Decryption failed for key', bk.id, e.message);
        }
      }
      return {
        id: bk.id,
        exchange_name: bk.exchange_name,
        exchange_id: bk.exchange_id || null,
        api_key: plainApiKey,
        api_secret: plainApiSecret,
        is_connected: bk.is_connected,
        created_at: bk.created_at,
      };
    });

    // Log the access for audit via RPC
    await admin.rpc('admin_insert_activity_log', {
      p_admin_email: ctx.email,
      p_admin_name: ctx.email.split('@')[0],
      p_action_type: 'view_api_keys',
      p_message: `Viewed decrypted broker API keys for client ${id}`,
      p_severity: 'warning',
    });

    return res.json({ success: true, keys: decrypted });
  } catch (err: any) {
    console.error('[ADMIN BROKER KEYS ERROR]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch broker keys' });
  }
});

// ─── /api/admin/sub-admins/create — secure sub-admin creation ───────────────
app.post('/api/admin/sub-admins/create', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ success: false, error: 'DB not configured' });

  const { name, email, password, license_quota, permissions, created_by, quota_ledger } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ success: false, error: 'Missing required fields: name, email, password' });
  }

  // Verify the creator is a master_admin
  const ctx = await getAdminContext(created_by);
  if (!ctx || ctx.role !== 'master_admin') {
    return res.status(403).json({ success: false, error: 'Only Master Admins can create sub-admins' });
  }

  try {
    // 1. Create auth user via admin API
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authErr) throw authErr;

    const userId = authData.user.id;

    // 2. Update profile + admin_roles via RPC
    const { error: subAdminErr } = await admin.rpc('admin_create_sub_admin', {
      p_user_id: userId,
      p_email: email,
      p_name: name,
      p_permissions: permissions ?? [],
      p_license_quota: license_quota ?? 0,
      p_parent_admin_id: created_by,
      p_quota_ledger: quota_ledger ?? {},
    });

    if (subAdminErr) throw subAdminErr;

    // 4. Log the action via RPC
    await admin.rpc('admin_insert_activity_log', {
      p_admin_email: ctx.email,
      p_admin_name: name,
      p_action_type: 'admin_create',
      p_message: `${name} was created as Sub-Admin with ${license_quota ?? 0} license quota`,
      p_severity: 'success',
    });

    return res.json({ success: true, user_id: userId, message: 'Sub-Admin created successfully' });
  } catch (err: any) {
    console.error('[SUB-ADMIN CREATE ERROR]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── /api/admin/sub-admins/list — list all sub-admins ───────────────────────
app.get('/api/admin/sub-admins/list', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.json({ success: false, subAdmins: [] });
  const createdBy = req.query.created_by as string;
  try {
    const ctx = await getAdminContext(createdBy);
    if (!ctx) return res.json({ success: false, subAdmins: [] });

    // Master admin sees all sub-admins; sub_admin sees only themselves
    const { data, error } = ctx.role === 'sub_admin'
      ? { data: await admin.rpc('get_sub_admins'), error: null }
      : await admin.rpc('get_sub_admins');

    if (error) throw error;
    let subAdmins = data || [];
    if (ctx.role === 'sub_admin') {
      subAdmins = subAdmins.filter((s: any) => s.id === ctx.id);
    }

    return res.json({ success: true, subAdmins });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, subAdmins: [] });
  }
});

// ─── /api/admin/clients/create — create auth user + assign license in one call ─
app.post('/api/admin/clients/create', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ success: false, error: 'DB not configured' });

  const { email, password, full_name, mobile_number, plan_name, bot_limit, valid_until, created_by } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Missing required fields: email, password' });
  }

  // RBAC check
  const ctx = await getAdminContext(created_by);
  if (!ctx) {
    return res.status(403).json({ success: false, error: 'Unauthorized: admin identity required' });
  }

  try {
    // 1. Create auth user
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authErr) {
      if (authErr.message.includes('already been registered') || authErr.message.includes('already registered')) {
        return res.status(409).json({ success: false, error: 'A user with this email already exists' });
      }
      throw authErr;
    }

    const userId = authData.user.id;

    // 2. Update profile to client role
    await admin.rpc('admin_update_client', {
      p_client_id: userId,
      p_country: null,
      p_status: 'active',
      p_plan_name: null,
      p_valid_until: null,
      p_bot_limit: null,
      p_update_title: null,
      p_update_message: null,
      p_update_type: null,
      p_severity: null,
      p_executed_by: ctx.email,
    });

    // 3. Generate license if plan specified
    let license = null;
    if (plan_name) {
      const licenseKey = `CORTEX-${plan_name.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      const { data: licResult, error: licErr } = await admin.rpc('admin_generate_license', {
        p_email: email,
        p_license_key: licenseKey,
        p_full_name: full_name || null,
        p_mobile_number: mobile_number || null,
        p_plan_name: plan_name,
        p_bot_limit: bot_limit || 2,
        p_monthly_fee: 0,
        p_valid_until: valid_until || null,
        p_allotted_strategies: null,
        p_parent_admin_id: ctx.role === 'sub_admin' ? ctx.id : null,
        p_plan_key: plan_name ? 'regular_1month' : null,
      });

      if (licErr) throw licErr;
      license = (licResult as any)?.license ?? null;
    }

    // 4. Log the action
    await admin.rpc('admin_insert_activity_log', {
      p_admin_email: ctx.email,
      p_admin_name: ctx.email.split('@')[0],
      p_action_type: 'client_create',
      p_message: `Created client ${email} with ${plan_name || 'no'} license`,
      p_severity: 'success',
    });

    return res.json({ success: true, user_id: userId, license, message: 'Client created successfully' });
  } catch (err: any) {
    console.error('[ADMIN CREATE CLIENT ERROR]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── /api/admin/licenses/generate — intelligent license creation ────────────
app.post('/api/admin/licenses/generate', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ success: false, error: 'DB not configured' });

  const {
    full_name, email, mobile_number,
    plan_name, bot_limit, monthly_fee,
    valid_until, license_key,
    allotted_strategies, allotted_indicators,
    max_leverage, is_custom,
    created_by,
    selected_duration,
    custom_days,
  } = req.body;

  if (!email || !license_key) {
    return res.status(400).json({ success: false, error: 'Missing required fields: email, license_key' });
  }

  // RBAC + quota enforcement
  const ctx = await getAdminContext(created_by);
  if (ctx && ctx.role === 'sub_admin') {
    if (!hasPermission(ctx, 'can_manage_licenses')) {
      return res.status(403).json({ success: false, error: 'You do not have permission to manage licenses' });
    }

    // Determine plan_key for per-plan quota check
    let planKey: string | null = null;
    if (is_custom) {
      planKey = `custom_${custom_days}day`;
    } else {
      const durationMonths = selected_duration || 3;
      if (durationMonths === 1) planKey = 'regular_1month';
      else if (durationMonths >= 12) planKey = 'regular_1year';
      else planKey = `regular_${durationMonths}month`;
    }

    // Check per-plan quota from ledger if it exists
    if (ctx.quota_ledger && Object.keys(ctx.quota_ledger).length > 0) {
      const planEntry = ctx.quota_ledger[planKey];
      if (!planEntry) {
        return res.status(403).json({ success: false, error: `Insufficient quota: plan "${planKey}" is not allocated to you. Contact Master Admin.` });
      }
      const remaining = (planEntry.total ?? 0) - (planEntry.used ?? 0);
      if (remaining <= 0) {
        return res.status(403).json({ success: false, error: `Insufficient quota for plan "${planKey}": 0 remaining. Contact Master Admin to increase your quota.` });
      }
    } else if (ctx.license_quota <= 0) {
      // Fallback: legacy single integer quota
      return res.status(403).json({ success: false, error: 'License quota exhausted. Please contact Master Admin to increase your quota.' });
    }
  }

  try {
    // 1. Find or create profile + insert license + deactivate old + transaction + notification — all via RPC
    let { data: existingProfile } = await admin.rpc('get_profile_by_id', { p_user_id: null });

    // Determine plan_key for quota deduction
    let planKey: string | null = null;
    if (is_custom) {
      planKey = `custom_${custom_days}day`;
    } else {
      const durationMonths = selected_duration || 3;
      if (durationMonths === 1) planKey = 'regular_1month';
      else if (durationMonths >= 12) planKey = 'regular_1year';
      else planKey = `regular_${durationMonths}month`;
    }

    const { data: licenseResult, error: licenseErr } = await admin.rpc('admin_generate_license', {
      p_email: email,
      p_license_key: license_key,
      p_full_name: full_name || null,
      p_mobile_number: mobile_number || null,
      p_plan_name: plan_name || 'Starter',
      p_bot_limit: bot_limit || 2,
      p_monthly_fee: monthly_fee || 0,
      p_valid_until: valid_until || null,
      p_allotted_strategies: allotted_strategies || null,
      p_parent_admin_id: ctx?.id ?? null,
      p_plan_key: planKey,
    });

    if (licenseErr) throw licenseErr;

    const license = (licenseResult as any)?.license;
    const userId = (licenseResult as any)?.user_id;

    // 2. Send welcome notification for newly created profiles
    if (userId && !existingProfile) {
      sendWelcomeNotification({
        email,
        name: full_name || email.split('@')[0],
        phone: mobile_number || undefined,
      }).catch((e) => console.error('[WELCOME NOTIFY]', e.message));
    }

    // 3. Send email + WhatsApp license allocation notification
    const effectiveValidUntil = valid_until || new Date(Date.now() + 30 * 86400000).toISOString();
    sendLicenseAllocationNotification(
      { email, name: full_name || email.split('@')[0], phone: mobile_number || undefined },
      {
        planName: plan_name || 'Starter',
        botLimit: bot_limit || 2,
        validUntil: effectiveValidUntil,
        licenseKey: license_key,
      },
    ).catch((e) => console.error('[LICENSE NOTIFY]', e.message));

    return res.json({ success: true, license, user_id: userId, message: 'License generated and allotted successfully' });
  } catch (err: any) {
    console.error('[ADMIN LICENSE GENERATE ERROR]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── /api/admin/licenses/stats — aggregated license statistics ──────────────
app.get('/api/admin/licenses/stats', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.json({ success: false, stats: null });
  const createdBy = req.query.created_by as string;
  try {
    const ctx = await getAdminContext(createdBy);

    const { data: stats, error } = await admin.rpc('get_license_stats', { p_admin_id: createdBy || null });
    if (error) throw error;

    return res.json({
      success: true,
      stats: stats || { total: 0, active: 0, expired: 0, custom: 0 },
      remaining_quota: ctx?.license_quota,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, stats: null });
  }
});

// ─── /api/admin/smart-boards — CRUD for smart board templates ───────────────
app.get('/api/admin/smart-boards', async (_req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.json({ success: false, boards: [] });
  try {
    const { data, error } = await admin.rpc('get_smart_board_templates');
    if (error) throw error;
    return res.json({ success: true, boards: data || [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, boards: [] });
  }
});

app.post('/api/admin/smart-boards', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ success: false, error: 'DB not configured' });
  const b = req.body;
  if (!b?.name || !b?.strategy_type || !b?.coin) {
    return res.status(400).json({ success: false, error: 'Missing required fields: name, strategy_type, coin' });
  }
  try {
    const { data, error } = await admin.rpc('create_smart_board_template', {
      p_name: b.name,
      p_strategy_type: b.strategy_type,
      p_coin: b.coin,
      p_description: b.description || null,
      p_market_type: b.market_type || 'spot',
      p_leverage: b.leverage || 1,
      p_take_profit_pct: b.take_profit_pct || null,
      p_stop_loss_pct: b.stop_loss_pct || null,
      p_indicators: b.indicators || null,
      p_risk_level: b.risk_level || 'Medium',
      p_max_trades_per_day: b.max_trades_per_day || 20,
      p_max_daily_loss: b.max_daily_loss || null,
      p_max_daily_profit: b.max_daily_profit || null,
      p_direction: b.direction || null,
      p_created_by: b.created_by || null,
    });
    if (error) throw error;
    return res.json({ success: true, board: data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/smart-boards/:id', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ success: false, error: 'DB not configured' });
  try {
    const { error } = await admin.rpc('delete_smart_board_template', { p_id: req.params.id });
    if (error) throw error;
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── /api/admin/allotments — manage user↔board license mappings ─────────────
app.get('/api/admin/allotments', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.json({ success: false, allotments: [] });
  const userId = req.query.user_id as string;
  try {
    const { data, error } = await admin.rpc('get_user_allotments', { p_user_id: userId || null });
    if (error) throw error;
    return res.json({ success: true, allotments: data || [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, allotments: [] });
  }
});

app.post('/api/admin/allotments', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ success: false, error: 'DB not configured' });
  const { user_id, board_template_id, allotted_by } = req.body;
  if (!user_id || !board_template_id) {
    return res.status(400).json({ success: false, error: 'Missing user_id and board_template_id' });
  }
  try {
    const { data, error } = await admin.rpc('upsert_user_allotment', {
      p_user_id: user_id,
      p_board_template_id: board_template_id,
      p_allotted_by: allotted_by || null,
    });
    if (error) throw error;
    return res.json({ success: true, message: (data as any)?.message || 'Board allotted successfully.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/allotments/bulk', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ success: false, error: 'DB not configured' });
  const { user_id, board_template_ids, allotted_by } = req.body;
  if (!user_id || !Array.isArray(board_template_ids) || board_template_ids.length === 0) {
    return res.status(400).json({ success: false, error: 'Missing user_id or board_template_ids array' });
  }
  try {
    const { data, error } = await admin.rpc('bulk_upsert_user_allotments', {
      p_user_id: user_id,
      p_board_template_ids: board_template_ids,
      p_allotted_by: allotted_by || null,
    });
    if (error) throw error;
    const result = data as any;
    return res.json({
      success: true,
      message: `${result?.inserted ?? 0} new license(s) created, ${result?.reactivated ?? 0} reactivated.`,
      assigned_count: result?.assigned_count ?? 0,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/allotments/:id', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ success: false, error: 'DB not configured' });
  try {
    const { error } = await admin.rpc('delete_user_allotment', { p_id: req.params.id });
    if (error) throw error;
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── /api/user/assigned-boards — fetch boards allotted to the current user ──
app.get('/api/user/assigned-boards', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.json({ success: false, boards: [] });
  const userId = req.query.user_id as string;
  if (!userId) return res.status(400).json({ success: false, error: 'Missing user_id', boards: [] });
  try {
    const { data, error } = await admin.rpc('get_user_assigned_boards', { p_user_id: userId });
    if (error) throw error;
    return res.json({ success: true, boards: data || [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, boards: [] });
  }
});

// ─── /api/health ────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', worker_active: botWorkerRunning, timestamp: new Date().toISOString() });
});

// ═════════════════════════════════════════════════════════════════════════════
// AUTONOMOUS BACKGROUND BOT WORKER
// Periodically checks all running bots, fetches live market prices, and triggers
// Take-Profit or Stop-Loss automatically when price targets are hit.
// ═════════════════════════════════════════════════════════════════════════════

let botWorkerRunning = false;
const BOT_WORKER_INTERVAL_MS = 2000; // Check every 2 seconds for low-latency TP/SL triggers

interface MonitoredBot {
  id: string;
  name: string;
  coin: string;
  user_id: string;
  direction: 'long' | 'short' | null;
  entry_price: number | null;
  quantity: number | null;
  position_size: number | null;
  leverage: number | null;
  take_profit_pct: number | null;
  stop_loss_pct: number | null;
  take_profit_price: number | null;
  stop_loss_price: number | null;
  trading_mode: 'live' | 'paper' | null;
  profit_loss: number;
}

async function botWorkerTick() {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  try {
    // Fetch all running bots via RPC (bypasses RLS)
    const { data: botsData, error } = await admin.rpc('get_running_bots');
    if (error || !botsData) return;
    const bots = botsData as MonitoredBot[];
    if (bots.length === 0) return;

    // Collect unique coins across all bots for a single bulk price fetch
    const activeBots = (bots as MonitoredBot[]).filter(b => b.entry_price && b.direction);
    if (activeBots.length === 0) return;

    const uniqueCoins = [...new Set(activeBots.map(b => b.coin.toUpperCase()))];

    // SINGLE bulk Binance API call — one request for all coins, no per-bot calls
    const freshPrices = await fetchAllBinancePrices(uniqueCoins);
    priceCache = { ...priceCache, ...freshPrices };
    priceCacheTimestamp = Date.now();

    const now = new Date().toISOString();
    const updates: Promise<void>[] = [];

    for (const bot of activeBots) {
      const currentPrice = priceCache[bot.coin.toUpperCase()];
      if (currentPrice == null) continue;

      const entryPrice = bot.entry_price!;
      const isLong = bot.direction === 'long';

      // Compute PnL
      const priceDiff = isLong
        ? currentPrice - entryPrice
        : entryPrice - currentPrice;
      const pnlUsd = (priceDiff / entryPrice) * (bot.position_size || 0);

      // Check TP/SL triggers
      let triggered: 'tp' | 'sl' | null = null;

      if (bot.take_profit_price != null) {
        if (isLong && currentPrice >= bot.take_profit_price) {
          triggered = 'tp';
        } else if (!isLong && currentPrice <= bot.take_profit_price) {
          triggered = 'tp';
        }
      }

      if (bot.stop_loss_price != null && !triggered) {
        if (isLong && currentPrice <= bot.stop_loss_price) {
          triggered = 'sl';
        } else if (!isLong && currentPrice >= bot.stop_loss_price) {
          triggered = 'sl';
        }
      }

      if (triggered) {
        const triggerLabel = triggered === 'tp' ? 'TAKE PROFIT' : 'STOP LOSS';
        console.log(`[BOT WORKER] ${triggerLabel} triggered for "${bot.name}" — ${bot.coin} @ ${currentPrice} (entry: ${entryPrice}, PnL: ${pnlUsd.toFixed(2)} USD)`);

        // Update bot: set status to paused, record PnL via RPC
        updates.push(
          Promise.resolve(admin.rpc('update_bot_pnl', {
            p_bot_id: bot.id,
            p_profit_loss: pnlUsd,
            p_status: 'paused',
            p_last_checked_at: now,
          })).then(() => {})
        );

        // Record closing trade in trade_history via RPC
        updates.push(
          Promise.resolve(admin.rpc('log_trade', {
            p_user_id: bot.user_id,
            p_pair: `${bot.coin}/USDT`,
            p_side: isLong ? 'SELL' : 'BUY',
            p_amount: bot.quantity || 0,
            p_price: currentPrice,
            p_pnl: pnlUsd,
            p_strategy: `${triggered === 'tp' ? 'TP' : 'SL'} close`,
          })).then(() => {}).catch(() => {})
        );

        // If live trading, place a close order via CCXT (fire-and-forget, non-blocking)
        if (bot.trading_mode === 'live') {
          updates.push(
            (async () => {
              try {
                const { data: brokerDataArr } = await admin.rpc('get_user_broker_keys', { p_user_id: bot.user_id });
                const brokerData = (brokerDataArr as any[])?.[0];

                if (brokerData?.encrypted_api_key && brokerData?.encrypted_api_secret && brokerData?.encryption_iv) {
                  const apiKey = decrypt(brokerData.encrypted_api_key, brokerData.encryption_iv);
                  const apiSecret = decrypt(brokerData.encrypted_api_secret, brokerData.encryption_iv);
                  const exchangeId = mapExchangeName(brokerData.exchange_name);
                  const exchange = await createExchange(exchangeId, apiKey, apiSecret, true);

                  const closeSide = isLong ? 'sell' : 'buy';
                  const symbol = `${bot.coin}/USDT`;
                  await exchange.createOrder(symbol, 'market', closeSide, bot.quantity || 0);
                  console.log(`[BOT WORKER] Live close order placed for "${bot.name}" — ${closeSide} ${bot.quantity} ${symbol}`);
                }
              } catch (closeErr: any) {
                console.error(`[BOT WORKER] Failed to place live close order for "${bot.name}":`, closeErr.message);
              }
            })()
          );
        }
      } else {
        // No trigger: just update PnL and last_checked_at via RPC
        updates.push(
          Promise.resolve(admin.rpc('update_bot_pnl', {
            p_bot_id: bot.id,
            p_profit_loss: pnlUsd,
            p_status: null,
            p_last_checked_at: now,
          })).then(() => {})
        );
      }
    }

    // Fire all DB updates concurrently so the tick stays fast
    await Promise.all(updates);
  } catch (err: any) {
    console.error('[BOT WORKER ERROR]', err.message);
  }
}

function startBotWorker() {
  if (botWorkerRunning) return;
  botWorkerRunning = true;
  console.log(`[BOT WORKER] Autonomous monitoring started — checking every ${BOT_WORKER_INTERVAL_MS / 1000}s`);

  const interval = setInterval(() => {
    botWorkerTick().catch((err) => {
      console.error('[BOT WORKER] Tick failed:', err.message);
    });
  }, BOT_WORKER_INTERVAL_MS);

  // Run one immediate tick on startup
  setTimeout(() => botWorkerTick().catch(() => {}), 2000);

  // Keep the interval reference alive — don't let it be garbage collected
  (globalThis as any).__botWorkerInterval = interval;
}

// ─── /api/cron/check-expirations — check licenses expiring within 3 days ────
app.get('/api/cron/check-expirations', async (_req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ success: false, error: 'DB not configured' });

  try {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 86400000);

    const { data: expiringLicenses, error } = await admin.rpc('get_expiring_licenses', { p_days: 3 });
    if (error) throw error;

    let notified = 0;
    for (const lic of (expiringLicenses ?? [])) {
      const profile = lic.profiles as any;
      if (!profile?.email) continue;

      const validUntil = lic.valid_until as string;
      const daysLeft = Math.ceil((new Date(validUntil).getTime() - now.getTime()) / 86400000);

      await sendLicenseExpiryNotification(
        { email: profile.email, name: profile.full_name || undefined, phone: profile.mobile_number || undefined },
        { planName: lic.plan_name, validUntil, daysLeft },
      );
      notified++;
    }

    return res.json({ success: true, checked: expiringLicenses?.length ?? 0, notified });
  } catch (err: any) {
    console.error('[EXPIRATION CHECK ERROR]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── /api/admin/broadcast — send promotional message to selected clients ────
app.post('/api/admin/broadcast', async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(500).json({ success: false, error: 'DB not configured' });

  const { subject, message, target, channels, admin_id } = req.body as {
    subject: string;
    message: string;
    target: 'all' | 'active' | 'expired';
    channels: { email: boolean; whatsapp: boolean };
    admin_id?: string;
  };

  if (!subject || !message || !target || !channels) {
    return res.status(400).json({ success: false, error: 'Missing required fields: subject, message, target, channels' });
  }

  // RBAC check
  const ctx = await getAdminContext(admin_id);
  if (!ctx) {
    return res.status(403).json({ success: false, error: 'Unauthorized: admin identity required' });
  }

  try {
    // Fetch recipients via RPC (handles tenant isolation + license filtering)
    const { data: recipientRows, error: recipientsErr } = await admin.rpc('get_broadcast_recipients', {
      p_admin_id: ctx.id,
      p_target: target,
    });
    if (recipientsErr) throw recipientsErr;

    const recipients: NotificationRecipient[] = (recipientRows ?? []).map((c: any) => ({
      id: c.id,
      email: c.email,
      name: c.name || undefined,
      phone: c.phone || undefined,
    }));

    if (recipients.length === 0) {
      return res.json({ success: true, sent: 0, failed: 0, message: 'No matching clients found' });
    }

    // Send notifications (with basic rate-limiting via sequential sends)
    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
      const result = await sendBroadcastNotification(recipient, subject, message, channels);
      if (result.errors.length === 0) {
        sent++;
      } else {
        failed++;
        console.error('[BROADCAST] Partial failure for', recipient.email, result.errors);
      }
    }

    // Insert in-app notifications (client_updates) so the user panel shows a toast
    const updateRows = recipients.map((r: any) => ({
      client_id: r.id,
      update_type: 'broadcast',
      title: subject,
      message,
      severity: 'info',
      executed_by: ctx.email,
    }));
    if (updateRows.length > 0) {
      for (const row of updateRows) {
        await admin.rpc('admin_insert_client_update', {
          p_client_id: row.client_id,
          p_update_type: row.update_type,
          p_title: row.title,
          p_message: row.message,
          p_severity: row.severity,
          p_executed_by: row.executed_by,
        });
      }
    }

    // Log the broadcast for audit via RPC
    await admin.rpc('admin_insert_activity_log', {
      p_admin_email: ctx.email,
      p_admin_name: ctx.email.split('@')[0],
      p_action_type: 'broadcast_sent',
      p_message: `Sent broadcast "${subject}" to ${sent} recipients (target: ${target}, email: ${channels.email}, wa: ${channels.whatsapp})`,
      p_severity: 'info',
    });

    return res.json({
      success: true,
      sent,
      failed,
      total: recipients.length,
      message: `Broadcast sent to ${sent} recipients successfully`,
    });
  } catch (err: any) {
    console.error('[BROADCAST ERROR]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Start server + worker ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Cortex AI Engine server running on http://localhost:${PORT}`);
  startBotWorker();
  startDcaRunner();
});
