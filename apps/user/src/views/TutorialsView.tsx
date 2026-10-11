import { useState } from 'react';
import { BookOpen, Play, Clock, ChevronRight, X, ArrowLeft } from 'lucide-react';

const tutorials = [
  { title: 'Getting Started with Cortex AI', duration: '5 min', level: 'Beginner', desc: 'Learn the basics of navigating the dashboard and understanding AI signals.', content: 'Welcome to Cortex AI! This guide walks you through the dashboard layout, AI market sentiment panel, and how to read signals. You will learn how to navigate between the trading views, monitor your portfolio, and understand the Fear & Greed meter.' },
  { title: 'Deploying Your First AI Strategy', duration: '8 min', level: 'Beginner', desc: 'Step-by-step guide to deploying automatic strategies on autopilot.', content: 'This tutorial covers selecting an AI strategy from the dashboard, clicking Deploy on Autopilot, configuring your position size and risk parameters, and monitoring the bot execution in real time.' },
  { title: 'Building a Custom Trading Bot', duration: '12 min', level: 'Intermediate', desc: 'Create a custom bot with your own risk/reward parameters and strategy core.', content: 'Dive into the AI Smart Bot Builder. Learn how to choose between Scalper, DCA, Grid, and Copier strategies. Configure take profit, stop loss, leverage, indicators (RSI, MACD, EMA Crossover), and daily safety limits.' },
  { title: 'Understanding AI Market Sentiment', duration: '7 min', level: 'Intermediate', desc: 'Deep dive into how Cortex Neural Engine analyzes 1,200+ data sources.', content: 'The Cortex Neural Engine aggregates on-chain data, social sentiment, and technical indicators to produce a real-time market analysis. Learn how to interpret the bullish/bearish gauge and AI recommendations.' },
  { title: 'Advanced Grid Trading Techniques', duration: '15 min', level: 'Advanced', desc: 'Master grid trading in sideways markets with dynamic interval optimization.', content: 'Grid trading profits from sideways markets by placing buy and sell orders at set intervals. This tutorial covers optimal grid spacing, number of grids, and when to activate vs pause your grid bot.' },
  { title: 'Risk Management & Position Sizing', duration: '10 min', level: 'Intermediate', desc: 'Learn proper position sizing and risk/reward ratio calculation.', content: 'Proper position sizing is critical. Use the Position Size Calculator in the Wallet view to determine how many units to buy based on your entry price, stop loss, and risk amount. Never risk more than 1-2% of your portfolio per trade.' },
  { title: 'Connecting Multiple Brokers', duration: '6 min', level: 'Beginner', desc: 'Link exchange accounts and manage API keys securely.', content: 'Connect Binance, KuCoin, Kraken, Bybit and more via API keys. Only enable Read and Trade permissions, never withdrawal. Your keys are encrypted with AES-256 before storage.' },
  { title: 'Futures Trading with Leverage', duration: '14 min', level: 'Advanced', desc: 'Understand leverage up to 100x and liquidation risk management.', content: 'Leverage amplifies both gains and losses. Learn about margin requirements, liquidation prices, funding rates, and how to set appropriate stop losses to protect your positions from liquidation.' },
];

const levelColors = {
  Beginner: 'text-neon-green bg-neon-green/10 border-neon-green/20',
  Intermediate: 'text-neon-amber bg-neon-amber/10 border-neon-amber/20',
  Advanced: 'text-neon-red bg-neon-red/10 border-neon-red/20',
};

export default function TutorialsView() {
  const [selected, setSelected] = useState<typeof tutorials[0] | null>(null);

  if (selected) {
    return (
      <div className="space-y-5 animate-slide-up">
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Tutorials
        </button>

        <div className="glass-card p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${levelColors[selected.level as keyof typeof levelColors]}`}>
                  {selected.level}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-slate-500">
                  <Clock className="w-3 h-3" /> {selected.duration}
                </span>
              </div>
              <h2 className="text-lg font-bold text-white">{selected.title}</h2>
            </div>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white transition-colors flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="relative h-40 rounded-xl bg-gradient-to-br from-neon-cyan/10 to-neon-green/5 border border-white/[0.06] flex items-center justify-center mb-5 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-base-700/50 to-transparent" />
            <div className="relative w-16 h-16 rounded-full bg-white/[0.08] border border-white/[0.1] flex items-center justify-center hover:bg-neon-cyan/20 hover:border-neon-cyan/40 transition-all duration-300 cursor-pointer">
              <Play className="w-7 h-7 text-white ml-0.5" fill="currentColor" />
            </div>
          </div>

          <p className="text-sm text-slate-300 leading-relaxed">{selected.content}</p>

          <div className="mt-5 p-4 rounded-xl bg-neon-amber/5 border border-neon-amber/15">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Need more help? Contact our support team via the Help Center or email support@cortexai.io
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-slide-up">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-neon-cyan" />
          Tutorials & Guides
        </h2>
        <p className="text-sm text-slate-400">Learn to master Cortex AI with our video and written guides</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {tutorials.map((t, i) => (
          <div key={i} onClick={() => setSelected(t)} className="glass-card p-5 group hover:border-white/[0.12] transition-all duration-300 cursor-pointer">
            {/* Thumbnail */}
            <div className="relative h-32 rounded-xl bg-gradient-to-br from-neon-cyan/10 to-neon-green/5 border border-white/[0.06] flex items-center justify-center mb-4 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-base-700/50 to-transparent" />
              <div className="relative w-12 h-12 rounded-full bg-white/[0.08] border border-white/[0.1] flex items-center justify-center group-hover:bg-neon-cyan/20 group-hover:border-neon-cyan/40 transition-all duration-300">
                <Play className="w-5 h-5 text-white group-hover:text-neon-cyan ml-0.5" fill="currentColor" />
              </div>
              <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-base-900/60 text-[10px] text-slate-300">
                <Clock className="w-3 h-3" /> {t.duration}
              </div>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${levelColors[t.level as keyof typeof levelColors]}`}>
                {t.level}
              </span>
            </div>
            <h3 className="text-sm font-bold text-white mb-1 group-hover:text-neon-cyan transition-colors">{t.title}</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">{t.desc}</p>
            <div className="flex items-center gap-1 text-xs text-neon-cyan font-semibold">
              Watch now <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
