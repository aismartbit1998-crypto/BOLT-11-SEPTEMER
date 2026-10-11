import type { BotConfig, TradeSignal, ExecutionResult } from '../types';

export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  exchange: string;
}

export class TradingEngine {
  private credentials: Map<string, ExchangeCredentials> = new Map();

  registerCredentials(exchange: string, apiKey: string, apiSecret: string) {
    this.credentials.set(exchange, { apiKey, apiSecret, exchange });
  }

  async executeSignal(bot: BotConfig, signal: TradeSignal): Promise<ExecutionResult> {
    if (bot.execution_mode === 'manual') {
      return { success: false, error: 'Manual approval required', timestamp: new Date().toISOString() };
    }

    const creds = this.credentials.get(signal.pair.split('/')[0]);
    if (!creds) {
      return { success: false, error: 'No credentials registered for this exchange', timestamp: new Date().toISOString() };
    }

    return {
      success: true,
      orderId: `order-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
  }

  async closePosition(orderId: string): Promise<ExecutionResult> {
    return { success: true, orderId, timestamp: new Date().toISOString() };
  }

  async getPanicCloseAll(): Promise<ExecutionResult[]> {
    return [];
  }
}
