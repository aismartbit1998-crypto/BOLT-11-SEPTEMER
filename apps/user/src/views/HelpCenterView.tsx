import { useState } from 'react';
import { LifeBuoy, MessageSquare, Mail, Send, BookOpen, Video, Bug, ChevronRight, Search, X } from 'lucide-react';

const channels = [
  { icon: MessageSquare, title: 'Live Chat', desc: 'Chat with our support team in real-time', action: 'Start Chat', color: 'text-neon-green', accent: 'green' },
  { icon: Mail, title: 'Email Support', desc: 'support@cortexai.io · Response within 24h', action: 'Send Email', color: 'text-neon-cyan', accent: 'cyan' },
  { icon: BookOpen, title: 'Documentation', desc: 'Browse detailed guides and API docs', action: 'Read Docs', color: 'text-neon-amber', accent: 'amber' },
  { icon: Video, title: 'Video Library', desc: 'Watch tutorials and strategy walkthroughs', action: 'Watch Videos', color: 'text-neon-cyan', accent: 'cyan' },
];

const articles = [
  'How to set up your first AI trading bot',
  'Understanding risk/reward ratios',
  'Configuring leverage for futures trading',
  'When to use the Panic Button',
  'Connecting Binance via API',
  'Reading AI market sentiment signals',
  'Optimizing grid trading parameters',
  'Switching between USD and INR display',
];

export default function HelpCenterView({ onNavigate }: { onNavigate?: (view: string) => void }) {
  const [search, setSearch] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);

  const filteredArticles = articles.filter(a =>
    a.toLowerCase().includes(search.toLowerCase())
  );

  const handleChannelAction = (title: string) => {
    if (title === 'Email Support') {
      window.location.href = 'mailto:support@cortexai.io';
    } else if (title === 'Documentation' || title === 'Video Library') {
      onNavigate?.('tutorials');
    } else if (title === 'Live Chat') {
      onNavigate?.('help-center');
    }
  };

  return (
    <div className="space-y-5 animate-slide-up">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <LifeBuoy className="w-5 h-5 text-neon-cyan" />
          Help Center
        </h2>
        <p className="text-sm text-slate-400">Get support and find answers to your questions</p>
      </div>

      {/* Search */}
      <div className="glass-card p-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search for help articles..."
            className="w-full pl-10 pr-4 py-3 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-cyan/40 transition-colors"
          />
        </div>
      </div>

      {/* Support channels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {channels.map((c, i) => {
          const Icon = c.icon;
          return (
            <div key={i} className="glass-card p-5 flex items-center gap-4 hover:border-white/[0.12] transition-all duration-300 cursor-pointer group">
              <div className={`w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-6 h-6 ${c.color}`} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-white">{c.title}</h3>
                <p className="text-xs text-slate-400">{c.desc}</p>
              </div>
              <button onClick={() => handleChannelAction(c.title)} className={`px-3 py-2 rounded-lg text-xs font-semibold btn-neon-${c.accent} transition-all`}>
                {c.action}
              </button>
            </div>
          );
        })}
      </div>

      {/* Popular articles */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-bold text-white mb-4">Popular Help Articles</h3>
        <div className="space-y-1">
          {filteredArticles.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">No articles match your search.</p>
          ) : filteredArticles.map((a, i) => (
            <button key={i} onClick={() => setSelectedArticle(a)} className="w-full flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-white/[0.03] transition-colors group">
              <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{a}</span>
              <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-neon-cyan transition-colors" />
            </button>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-4">
        <button onClick={() => onNavigate?.('tutorials')} className="glass-card p-5 flex items-center gap-3 hover:border-neon-cyan/30 transition-all">
          <BookOpen className="w-5 h-5 text-neon-cyan" />
          <span className="text-sm font-semibold text-white">Browse Tutorials</span>
        </button>
        <button onClick={() => onNavigate?.('report-bug')} className="glass-card p-5 flex items-center gap-3 hover:border-neon-red/30 transition-all">
          <Bug className="w-5 h-5 text-neon-red" />
          <span className="text-sm font-semibold text-white">Report a Bug</span>
        </button>
      </div>

      {/* Article detail modal */}
      {selectedArticle && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-base-900/80 backdrop-blur-md" onClick={() => setSelectedArticle(null)} />
          <div className="relative w-full max-w-lg animate-scale-in">
            <div className="glass-strong neon-glow-cyan p-6 rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-white">{selectedArticle}</h3>
                <button onClick={() => setSelectedArticle(null)} className="text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                This article covers the key concepts and step-by-step instructions. Our support team is available 24/7 via live chat and email if you need further assistance.
              </p>
              <div className="mt-5 flex gap-3">
                <button onClick={() => { onNavigate?.('tutorials'); setSelectedArticle(null); }} className="flex-1 px-4 py-2.5 rounded-xl bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30 text-sm font-semibold hover:bg-neon-cyan/20 transition-all">
                  Watch Tutorial
                </button>
                <button onClick={() => setSelectedArticle(null)} className="px-4 py-2.5 rounded-xl bg-white/[0.04] text-slate-300 border border-white/[0.06] text-sm transition-all hover:bg-white/[0.07]">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
