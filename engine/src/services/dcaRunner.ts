import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DcaBot {
  id: string;
  name: string;
  user_id: string;
  coin: string;
  strategy: string;
  market_type: 'spot' | 'futures';
  trading_mode: 'live' | 'paper' | null;
  direction: 'long' | 'short' | null;
  quantity: number | null;
  position_size: number | null;
  dca_base_order_usdt: number;
  dca_safety_order_step_pct: number;
  dca_max_safety_orders: number;
  dca_safety_order_multiplier: number;
  dca_orders_executed: number;
  dca_avg_entry_price: number | null;
  dca_last_buy_price: number | null;
  take_profit_pct: number | null;
  stop_loss_pct: number | null;
  entry_price: number | null;
}

interface BrokerKeyRow {
  exchange_id: string | null;
  exchange_name: string;
  encrypted_api_key: string | null;
  encrypted_api_secret: string | null;
  encryption_iv: string | null;
}

// ─── Encryption helpers (mirrors server.ts) ─────────────────────────────────

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'cortex-ai-32-byte-encryption-key!';

function deriveKey(): Buffer {
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
}

function decrypt(encryptedB64: string, ivB64: string): string {
  const key = deriveKey();
  const data = Buffer.from(encryptedB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(0, data.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// ─── CCXT exchange factory ───────────────────────────────────────────────────

async function createExchange(exchangeId: string, apiKey: string, apiSecret: string) {
  const ccxt = await import('ccxt');
  const ExchangeClass = (ccxt as any)[exchangeId.toLowerCase().replace(/\s+/g, '')];
  if (!ExchangeClass) throw new Error(`Unsupported exchange: ${exchangeId}`);
  const exchange = new ExchangeClass({
    apiKey,
    secret: apiSecret,
    enableRateLimit: true,
    options: { defaultType: 'spot' },
  });
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

// ─── Price fetching (bulk Binance public API) ────────────────────────────────

async function fetchPrices(coins: string[]): Promise<Record<string, number>> {
  if (coins.length === 0) return {};
  const symbols = coins.map(c => `${c.toUpperCase()}USDT`);
  const symbolsParam = encodeURIComponent(JSON.stringify(symbols));
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=${symbolsParam}`);
    if (!res.ok) return {};
    const data = await res.json() as Array<{ symbol: string; price: string }>;
    const map: Record<string, number> = {};
    for (const item of data) {
      map[item.symbol.replace('USDT', '')] = parseFloat(item.price);
    }
    return map;
  } catch {
    return {};
  }
}

// ─── Trade logging ───────────────────────────────────────────────────────────

async function logTrade(
  admin: SupabaseClient,
  params: {
    bot_id: string;
    user_id: string;
    side: 'BUY' | 'SELL';
    pair: string;
    amount: number;
    price: number;
    trade_type: string;
    exchange_order_id?: string;
    trade_mode: 'live' | 'paper';
    error?: string;
  },
): Promise<void> {
  try {
    await admin.rpc('log_dca_trade', {
      p_bot_id: params.bot_id,
      p_user_id: params.user_id,
      p_side: params.side,
      p_pair: params.pair,
      p_amount: params.amount,
      p_price: params.price,
      p_trade_type: params.trade_type,
      p_exchange_order_id: params.exchange_order_id ?? null,
      p_trade_mode: params.trade_mode,
      p_error: params.error ?? null,
    });
  } catch (err: any) {
    console.error(`[DCA] Failed to log trade for bot ${params.bot_id}:`, err.message);
  }
}

// ─── DCA evaluation ──────────────────────────────────────────────────────────

interface DcaDecision {
  action: 'buy_base' | 'buy_safety' | 'sell_tp' | 'sell_sl' | 'hold';
  orderUsdt: number;
  reason: string;
}

function evaluateDca(bot: DcaBot, currentPrice: number): DcaDecision {
  const pair = `${bot.coin}/USDT`;

  // ── Phase 1: No position yet — place base order ──
  if (bot.dca_orders_executed === 0 || bot.dca_last_buy_price == null) {
    return {
      action: 'buy_base',
      orderUsdt: bot.dca_base_order_usdt,
      reason: 'Initial DCA base order',
    };
  }

  const isLong = bot.direction !== 'short';
  const lastBuy = bot.dca_last_buy_price;
  const stepPct = bot.dca_safety_order_step_pct;

  // ── Phase 2: Check TP/SL for exit ──
  if (isLong) {
    if (bot.take_profit_pct != null && bot.dca_avg_entry_price != null) {
      const tpThreshold = bot.dca_avg_entry_price * (1 + bot.take_profit_pct / 100);
      if (currentPrice >= tpThreshold) {
        return { action: 'sell_tp', orderUsdt: 0, reason: `TP hit: ${currentPrice} >= ${tpThreshold.toFixed(4)}` };
      }
    }
    if (bot.stop_loss_pct != null && bot.dca_avg_entry_price != null) {
      const slThreshold = bot.dca_avg_entry_price * (1 - bot.stop_loss_pct / 100);
      if (currentPrice <= slThreshold) {
        return { action: 'sell_sl', orderUsdt: 0, reason: `SL hit: ${currentPrice} <= ${slThreshold.toFixed(4)}` };
      }
    }
  } else {
    if (bot.take_profit_pct != null && bot.dca_avg_entry_price != null) {
      const tpThreshold = bot.dca_avg_entry_price * (1 - bot.take_profit_pct / 100);
      if (currentPrice <= tpThreshold) {
        return { action: 'sell_tp', orderUsdt: 0, reason: `TP hit (short): ${currentPrice} <= ${tpThreshold.toFixed(4)}` };
      }
    }
    if (bot.stop_loss_pct != null && bot.dca_avg_entry_price != null) {
      const slThreshold = bot.dca_avg_entry_price * (1 + bot.stop_loss_pct / 100);
      if (currentPrice >= slThreshold) {
        return { action: 'sell_sl', orderUsdt: 0, reason: `SL hit (short): ${currentPrice} >= ${slThreshold.toFixed(4)}` };
      }
    }
  }

  // ── Phase 3: Check if safety order should trigger ──
  if (bot.dca_orders_executed >= bot.dca_max_safety_orders) {
    return { action: 'hold', orderUsdt: 0, reason: 'Max safety orders reached' };
  }

  if (isLong) {
    const dropPct = ((lastBuy - currentPrice) / lastBuy) * 100;
    if (dropPct >= stepPct) {
      const safetyUsdt = bot.dca_base_order_usdt * Math.pow(bot.dca_safety_order_multiplier, bot.dca_orders_executed);
      return {
        action: 'buy_safety',
        orderUsdt: Math.round(safetyUsdt * 100) / 100,
        reason: `Price dropped ${dropPct.toFixed(2)}% from last buy (${lastBuy} -> ${currentPrice})`,
      };
    }
  } else {
    const risePct = ((currentPrice - lastBuy) / lastBuy) * 100;
    if (risePct >= stepPct) {
      const safetyUsdt = bot.dca_base_order_usdt * Math.pow(bot.dca_safety_order_multiplier, bot.dca_orders_executed);
      return {
        action: 'buy_safety',
        orderUsdt: Math.round(safetyUsdt * 100) / 100,
        reason: `Price rose ${risePct.toFixed(2)}% from last sell (${lastBuy} -> ${currentPrice})`,
      };
    }
  }

  return { action: 'hold', orderUsdt: 0, reason: 'No trigger condition met' };
}

// ─── Per-bot execution ───────────────────────────────────────────────────────

async function executeDcaBot(
  admin: SupabaseClient,
  bot: DcaBot,
  currentPrice: number,
): Promise<void> {
  const pair = `${bot.coin}/USDT`;
  const decision = evaluateDca(bot, currentPrice);

  if (decision.action === 'hold') return;

  console.log(`[DCA] Bot "${bot.name}" — ${decision.action.toUpperCase()} — ${decision.reason}`);

  // ── Sell actions (TP/SL close) ──
  if (decision.action === 'sell_tp' || decision.action === 'sell_sl') {
    const sellSide = bot.direction === 'short' ? 'buy' : 'sell';
    const tradeType = decision.action === 'sell_tp' ? 'tp_close' : 'sl_close';
    const amount = bot.quantity ?? 0;

    if (amount <= 0) {
      console.warn(`[DCA] Bot "${bot.name}" has no quantity to sell, marking paused`);
      await admin.rpc('update_dca_bot_state', { p_bot_id: bot.id, p_status: 'paused', p_last_checked_at: new Date().toISOString() });
      return;
    }

    if (bot.trading_mode === 'live') {
      let apiKey = '';
      let apiSecret = '';
      let exchange: any = null;
      try {
        const { data: brokerArr } = await admin.rpc('get_user_broker_keys', { p_user_id: bot.user_id });
        const broker = (brokerArr as any[])?.[0] as BrokerKeyRow | undefined;

        if (broker?.encrypted_api_key && broker?.encrypted_api_secret && broker?.encryption_iv) {
          apiKey = decrypt(broker.encrypted_api_key, broker.encryption_iv);
          apiSecret = decrypt(broker.encrypted_api_secret, broker.encryption_iv);
          const exId = broker.exchange_id || mapExchangeName(broker.exchange_name);
          exchange = await createExchange(exId, apiKey, apiSecret);

          const order = await exchange.createOrder(pair, 'market', sellSide, amount);
          console.log(`[DCA] Live close order placed: ${sellSide} ${amount} ${pair} — order ${order?.id}`);

          await logTrade(admin, {
            bot_id: bot.id, user_id: bot.user_id, side: sellSide === 'buy' ? 'BUY' : 'SELL',
            pair, amount, price: currentPrice, trade_type: tradeType,
            exchange_order_id: order?.id, trade_mode: 'live',
          });
        } else {
          console.warn(`[DCA] Bot "${bot.name}" is live but no connected broker keys found`);
        }
      } catch (err: any) {
        console.error(`[DCA] Live sell failed for "${bot.name}":`, err.message);
        await logTrade(admin, {
          bot_id: bot.id, user_id: bot.user_id, side: sellSide === 'buy' ? 'BUY' : 'SELL',
          pair, amount, price: currentPrice, trade_type: tradeType, trade_mode: 'live', error: err.message,
        });
      } finally {
        // ── Garbage collection: purge plaintext keys from memory ──
        apiKey = '';
        apiSecret = '';
        exchange = null;
      }
    } else {
      // Paper trade
      const paperOrderId = `paper-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      console.log(`[DCA] Paper close: ${sellSide} ${amount} ${pair} @ ${currentPrice}`);
      await logTrade(admin, {
        bot_id: bot.id, user_id: bot.user_id, side: sellSide === 'buy' ? 'BUY' : 'SELL',
        pair, amount, price: currentPrice, trade_type: tradeType,
        exchange_order_id: paperOrderId, trade_mode: 'paper',
      });
    }

    // Calculate final PnL and pause the bot
    const avgEntry = bot.dca_avg_entry_price ?? bot.entry_price ?? currentPrice;
    const pnl = bot.direction === 'short'
      ? (avgEntry - currentPrice) * amount
      : (currentPrice - avgEntry) * amount;

    await admin.rpc('update_dca_bot_state', {
      p_bot_id: bot.id, p_status: 'paused', p_profit_loss: pnl, p_last_checked_at: new Date().toISOString(),
    });

    return;
  }

  // ── Buy actions (base or safety order) ──
  const orderUsdt = decision.orderUsdt;
  if (orderUsdt <= 0) return;
  const buyAmount = orderUsdt / currentPrice;
  const tradeType = decision.action === 'buy_base' ? 'dca_base' : 'dca_safety';

  let executedPrice = currentPrice;
  let exchangeOrderId: string | undefined;

  if (bot.trading_mode === 'live') {
    let apiKey = '';
    let apiSecret = '';
    let exchange: any = null;
    try {
      const { data: brokerArr } = await admin.rpc('get_user_broker_keys', { p_user_id: bot.user_id });
      const broker = (brokerArr as any[])?.[0] as BrokerKeyRow | undefined;

      if (broker?.encrypted_api_key && broker?.encrypted_api_secret && broker?.encryption_iv) {
        apiKey = decrypt(broker.encrypted_api_key, broker.encryption_iv);
        apiSecret = decrypt(broker.encrypted_api_secret, broker.encryption_iv);
        const exId = broker.exchange_id || mapExchangeName(broker.exchange_name);
        exchange = await createExchange(exId, apiKey, apiSecret);

        const order = await exchange.createOrder(pair, 'market', 'buy', buyAmount);
        exchangeOrderId = order?.id;
        executedPrice = order?.average ?? order?.price ?? currentPrice;
        console.log(`[DCA] Live buy order placed: BUY ${buyAmount.toFixed(6)} ${pair} — order ${exchangeOrderId}`);
      } else {
        console.warn(`[DCA] Bot "${bot.name}" is live but no connected broker keys found — skipping`);
        return;
      }
    } catch (err: any) {
      console.error(`[DCA] Live buy failed for "${bot.name}":`, err.message);
      await logTrade(admin, {
        bot_id: bot.id, user_id: bot.user_id, side: 'BUY',
        pair, amount: buyAmount, price: currentPrice, trade_type: tradeType, trade_mode: 'live', error: err.message,
      });
      return;
    } finally {
      apiKey = '';
      apiSecret = '';
      exchange = null;
    }
  } else {
    exchangeOrderId = `paper-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    console.log(`[DCA] Paper buy: BUY ${buyAmount.toFixed(6)} ${pair} @ ${currentPrice}`);
  }

  // ── Update DCA running averages ──
  const prevAvg = bot.dca_avg_entry_price ?? 0;
  const prevQty = bot.quantity ?? 0;
  const newQty = prevQty + buyAmount;
  const newAvg = newQty > 0
    ? (prevAvg * prevQty + executedPrice * buyAmount) / newQty
    : executedPrice;

  const newOrdersExecuted = bot.dca_orders_executed + 1;

  await admin.rpc('update_dca_bot_state', {
    p_bot_id: bot.id,
    p_quantity: newQty,
    p_entry_price: newAvg,
    p_dca_avg_entry_price: newAvg,
    p_dca_last_buy_price: executedPrice,
    p_dca_orders_executed: newOrdersExecuted,
    p_last_checked_at: new Date().toISOString(),
  });

  await logTrade(admin, {
    bot_id: bot.id, user_id: bot.user_id, side: 'BUY',
    pair, amount: buyAmount, price: executedPrice, trade_type: tradeType,
    exchange_order_id: exchangeOrderId, trade_mode: bot.trading_mode === 'live' ? 'live' : 'paper',
  });
}

// ─── Main tick ───────────────────────────────────────────────────────────────

const DCA_TICK_INTERVAL_MS = 10_000; // 10 seconds

let dcaRunnerActive = false;

export async function dcaTick(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) {
    console.error('[DCA] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return;
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ── STEP 1: Risk settings check (kill switch + circuit breaker) ──
  try {
    const { data: riskSettings, error: riskErr } = await admin.rpc('get_risk_settings');

    if (riskErr) {
      console.error('[DCA] Failed to check risk settings:', riskErr.message);
      return;
    }

    if (riskSettings?.global_kill_switch === true) {
      console.log('[DCA] Global kill switch is ACTIVE — bypassing execution loop');
      return;
    }

    if (riskSettings?.ai_circuit_breaker === true) {
      console.log('[DCA] AI circuit breaker is ACTIVE — pausing DCA execution for safety');
      return;
    }
  } catch (err: any) {
    console.error('[DCA] Risk settings check error:', err.message);
    return;
  }

  // ── STEP 2: Fetch all running bots with DCA strategy ──
  let bots: DcaBot[];
  try {
    const { data, error } = await admin.rpc('get_dca_bots');

    if (error) {
      console.error('[DCA] Failed to fetch bots:', error.message);
      return;
    }

    bots = (data ?? []) as unknown as DcaBot[];
    if (bots.length === 0) return;
  } catch (err: any) {
    console.error('[DCA] Bot fetch error:', err.message);
    return;
  }

  // ── STEP 3: Bulk fetch prices for all coins ──
  const uniqueCoins = [...new Set(bots.map(b => b.coin.toUpperCase()))];
  const prices = await fetchPrices(uniqueCoins);
  if (Object.keys(prices).length === 0) {
    console.warn('[DCA] No prices fetched from Binance — skipping tick');
    return;
  }

  // ── STEP 4: Execute DCA logic per bot ──
  const tickStart = Date.now();
  for (const bot of bots) {
    const price = prices[bot.coin.toUpperCase()];
    if (price == null || price <= 0) continue;

    try {
      await executeDcaBot(admin, bot, price);
    } catch (err: any) {
      console.error(`[DCA] Unhandled error for bot "${bot.name}":`, err.message);
    }
  }

  const elapsed = Date.now() - tickStart;
  if (elapsed > 5000) {
    console.warn(`[DCA] Tick took ${elapsed}ms for ${bots.length} bots — consider scaling`);
  }
}

// ─── Background runner ───────────────────────────────────────────────────────

export function startDcaRunner(): void {
  if (dcaRunnerActive) return;
  dcaRunnerActive = true;

  console.log(`[DCA RUNNER] Started — interval: ${DCA_TICK_INTERVAL_MS / 1000}s`);

  const interval = setInterval(() => {
    dcaTick().catch((err) => {
      console.error('[DCA RUNNER] Tick failed:', err.message);
    });
  }, DCA_TICK_INTERVAL_MS);

  // Immediate tick 3s after startup (offset from the existing bot worker)
  setTimeout(() => dcaTick().catch(() => {}), 3000);

  (globalThis as any).__dcaRunnerInterval = interval;
}
