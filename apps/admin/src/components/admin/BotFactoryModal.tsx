import { useState, useEffect, useRef } from 'react';
import {
  Rocket, X, Zap, Layers, TrendingUp, Copy, ChevronDown, Check,
  Loader2, Cpu, Shield, Target, Gauge, Plus, Trash2, Radio,
  Workflow, Activity, AlertTriangle,
} from 'lucide-react';
import { allStrategies, allIndicators } from '@/data/adminMockData';
import type { BotTemplate } from '@cortex/shared/lib/supabase';
import type { BotFactoryDraft } from '@cortex/shared/types/bot';

export type { BotFactoryDraft };

interface Props {
  onClose: () => void;
  onSave: (draft: BotFactoryDraft) => Promise<void>;
  editing?: BotTemplate | null;
}

const botTypes = [
  {
    id: 'scalper' as const,
    label: 'Scalper',
    icon: Zap,
    desc: 'High-frequency trades capturing small price movements',
    accent: 'cyan',
  },
  {
    id: 'dca' as const,
    label: 'DCA',
    icon: TrendingUp,
    desc: 'Dollar-cost averaging with sentiment-weighted entries',
    accent: 'green',
  },
  {
    id: 'grid' as const,
    label: 'Grid',
    icon: Layers,
    desc: 'Grid trading in consolidation and sideways ranges',
    accent: 'amber',
  },
  {
    id: 'copier' as const,
    label: 'Copier',
    icon: Copy,
    desc: 'Mirror trades from source exchange accounts',
    accent: 'cyan',
  },
];

const accentMap: Record<string, { text: string; bg: string; border: string; glow: string }> = {
  cyan: { text: 'text-neon-cyan', bg: 'bg-neon-cyan/10', border: 'border-neon-cyan/40', glow: 'hover:neon-glow-cyan' },
  green: { text: 'text-neon-green', bg: 'bg-neon-green/10', border: 'border-neon-green/40', glow: 'hover:neon-glow-green' },
  amber: { text: 'text-neon-amber', bg: 'bg-neon-amber/10', border: 'border-neon-amber/40', glow: 'hover:neon-glow-amber' },
};

export default function BotFactoryModal({ onClose, onSave, editing }: Props) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [strategiesOpen, setStrategiesOpen] = useState(false);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [newExchange, setNewExchange] = useState('');
  const strategiesRef = useRef<HTMLDivElement>(null);
  const indicatorsRef = useRef<HTMLDivElement>(null);

  const [draft, setDraft] = useState<BotFactoryDraft>(() => {
    if (editing) {
      return {
        name: editing.name,
        description: editing.description ?? '',
        bot_type: (editing.bot_type ?? 'scalper') as BotFactoryDraft['bot_type'],
        execution_mode: (editing.execution_mode ?? 'auto') as BotFactoryDraft['execution_mode'],
        market_type: editing.market_type,
        strategies: editing.strategies ?? [],
        indicators: editing.indicators ?? [],
        max_drawdown_pct: editing.max_drawdown_pct ?? 15,
        default_tp_pct: editing.default_tp_pct,
        default_sl_pct: editing.default_sl_pct,
        tp_sl_ratio: editing.tp_sl_ratio ?? 2,
        max_leverage: editing.max_leverage ?? 20,
        risk_level: editing.risk_level,
        source_exchanges: editing.source_exchanges ?? [],
      };
    }
    return {
      name: '',
      description: '',
      bot_type: 'scalper',
      execution_mode: 'auto',
      market_type: 'futures',
      strategies: [],
      indicators: [],
      max_drawdown_pct: 15,
      default_tp_pct: 5,
      default_sl_pct: 2,
      tp_sl_ratio: 2.5,
      max_leverage: 20,
      risk_level: 'Medium',
      source_exchanges: [],
    };
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (strategiesRef.current && !strategiesRef.current.contains(e.target as Node)) setStrategiesOpen(false);
      if (indicatorsRef.current && !indicatorsRef.current.contains(e.target as Node)) setIndicatorsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleStrategy = (s: string) => {
    setDraft(prev => ({
      ...prev,
      strategies: prev.strategies.includes(s)
        ? prev.strategies.filter(x => x !== s)
        : [...prev.strategies, s],
    }));
  };

  const toggleIndicator = (i: string) => {
    setDraft(prev => ({
      ...prev,
      indicators: prev.indicators.includes(i)
        ? prev.indicators.filter(x => x !== i)
        : [...prev.indicators, i],
    }));
  };

  const addExchange = () => {
    const val = newExchange.trim();
    if (val && !draft.source_exchanges.includes(val)) {
      setDraft(prev => ({ ...prev, source_exchanges: [...prev.source_exchanges, val] }));
      setNewExchange('');
    }
  };

  const removeExchange = (ex: string) => {
    setDraft(prev => ({ ...prev, source_exchanges: prev.source_exchanges.filter(x => x !== ex) }));
  };

  const canProceed = (s: number): boolean => {
    if (s === 1) return draft.name.trim().length > 0;
    if (s === 2) return draft.strategies.length > 0 || draft.indicators.length > 0;
    if (s === 3) return draft.default_tp_pct > 0 && draft.default_sl_pct > 0 && draft.max_drawdown_pct > 0;
    return true;
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
  };

  const steps = [
    { num: 1, label: 'Identity', icon: Cpu },
    { num: 2, label: 'Strategy Engine', icon: Workflow },
    { num: 3, label: 'Risk Parameters', icon: Shield },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="absolute inset-0 bg-base-900/85 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-3xl animate-scale-in">
        <div className="glass-strong neon-glow-cyan max-h-[92vh] overflow-y-auto scrollbar-thin rounded-2xl">
          {/* Header */}
          <div className="sticky top-0 z-20 bg-base-800/90 backdrop-blur-xl border-b border-white/[0.06] px-5 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center">
                <Rocket className="w-5 h-5 text-neon-cyan" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">
                  {editing ? 'Modify Bot Configuration' : 'Bot Factory'}
                </h2>
                <p className="text-[11px] text-slate-500">Algorithmic Trading Bot Builder</p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/[0.06]">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-1 sm:gap-2 px-5 sm:px-6 py-4 border-b border-white/[0.04]">
            {steps.map((s, idx) => {
              const isActive = step === s.num;
              const isDone = step > s.num;
              const SIcon = s.icon;
              return (
                <div key={s.num} className="flex items-center flex-1">
                  <button
                    onClick={() => isDone && setStep(s.num)}
                    disabled={!isDone}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all flex-shrink-0 ${
                      isActive
                        ? 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30'
                        : isDone
                        ? 'text-neon-green hover:bg-neon-green/5 cursor-pointer'
                        : 'text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${isActive ? 'bg-neon-cyan/15' : isDone ? 'bg-neon-green/10' : 'bg-white/[0.04]'}`}>
                      {isDone ? <Check className="w-3.5 h-3.5" /> : <SIcon className="w-3.5 h-3.5" />}
                    </div>
                    <span className="hidden sm:inline">{s.label}</span>
                  </button>
                  {idx < steps.length - 1 && (
                    <div className={`flex-1 h-px mx-1 sm:mx-2 transition-colors ${isDone ? 'bg-neon-green/30' : 'bg-white/[0.06]'}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Body */}
          <div className="px-5 sm:px-6 py-5 space-y-5">
            {/* STEP 1 — Identity & Type */}
            {step === 1 && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Bot Name</label>
                  <input
                    value={draft.name}
                    onChange={e => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. Quantum SMC Scalper v2"
                    className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-neon-cyan/40 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Description (optional)</label>
                  <textarea
                    value={draft.description}
                    onChange={e => setDraft({ ...draft, description: e.target.value })}
                    placeholder="Brief description of the bot's approach..."
                    rows={2}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-neon-cyan/40 transition-colors resize-none"
                  />
                </div>

                {/* Bot Type Selection */}
                <div>
                  <label className="text-xs text-slate-400 mb-3 block font-semibold flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5" /> Bot Type Selection
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {botTypes.map(bt => {
                      const a = accentMap[bt.accent];
                      const isSelected = draft.bot_type === bt.id;
                      const BIcon = bt.icon;
                      return (
                        <button
                          key={bt.id}
                          onClick={() => setDraft({ ...draft, bot_type: bt.id })}
                          className={`relative text-left p-4 rounded-xl border transition-all duration-200 group overflow-hidden ${
                            isSelected
                              ? `${a.bg} ${a.border} ${a.glow}`
                              : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12]'
                          }`}
                        >
                          {isSelected && (
                            <div className={`absolute -top-8 -right-8 w-24 h-24 ${a.bg} rounded-full blur-2xl opacity-60`} />
                          )}
                          <div className="relative">
                            <div className="flex items-center justify-between mb-2">
                              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isSelected ? a.bg : 'bg-white/[0.05]'}`}>
                                <BIcon className={`w-5 h-5 ${isSelected ? a.text : 'text-slate-400'}`} />
                              </div>
                              {isSelected && (
                                <div className={`w-5 h-5 rounded-full ${a.bg} flex items-center justify-center`}>
                                  <Check className={`w-3 h-3 ${a.text}`} />
                                </div>
                              )}
                            </div>
                            <p className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>{bt.label}</p>
                            <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">{bt.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Copier Bot — Source Exchanges */}
                {draft.bot_type === 'copier' && (
                  <div className="p-4 rounded-xl bg-neon-cyan/5 border border-neon-cyan/15 animate-slide-up">
                    <label className="text-xs text-neon-cyan mb-3 block font-semibold flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5" /> Source Exchange Accounts
                    </label>
                    <p className="text-[11px] text-slate-400 mb-3">Define the exchange accounts this copier bot will mirror trades from.</p>
                    <div className="flex gap-2 mb-3">
                      <input
                        value={newExchange}
                        onChange={e => setNewExchange(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addExchange())}
                        placeholder="e.g. Binance-Master-01"
                        className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-neon-cyan/40 transition-colors"
                      />
                      <button
                        onClick={addExchange}
                        className="px-3 py-2 rounded-lg bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30 hover:bg-neon-cyan/25 text-sm font-semibold transition-all flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" /> Add
                      </button>
                    </div>
                    {draft.source_exchanges.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {draft.source_exchanges.map(ex => (
                          <div key={ex} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-neon-cyan/20 text-xs text-slate-200">
                            <Radio className="w-3 h-3 text-neon-cyan" />
                            {ex}
                            <button onClick={() => removeExchange(ex)} className="text-slate-500 hover:text-neon-red transition-colors">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Execution Mode Toggle */}
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <label className="text-xs text-slate-400 mb-3 block font-semibold flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5" /> Execution Mode
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setDraft({ ...draft, execution_mode: 'auto' })}
                      className={`relative p-3 rounded-xl border text-left transition-all ${
                        draft.execution_mode === 'auto'
                          ? 'bg-neon-green/10 border-neon-green/40'
                          : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Zap className={`w-4 h-4 ${draft.execution_mode === 'auto' ? 'text-neon-green' : 'text-slate-400'}`} />
                        <span className={`text-sm font-bold ${draft.execution_mode === 'auto' ? 'text-neon-green' : 'text-slate-300'}`}>Fully Auto-Trade</span>
                      </div>
                      <p className="text-[10px] text-slate-500">Bot executes trades automatically without human approval.</p>
                      {/* Toggle visual */}
                      <div className={`mt-2 w-10 h-5 rounded-full transition-colors relative ${draft.execution_mode === 'auto' ? 'bg-neon-green/30' : 'bg-white/[0.08]'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${draft.execution_mode === 'auto' ? 'left-5 bg-neon-green' : 'left-0.5 bg-slate-500'}`} />
                      </div>
                    </button>
                    <button
                      onClick={() => setDraft({ ...draft, execution_mode: 'manual' })}
                      className={`relative p-3 rounded-xl border text-left transition-all ${
                        draft.execution_mode === 'manual'
                          ? 'bg-neon-amber/10 border-neon-amber/40'
                          : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Target className={`w-4 h-4 ${draft.execution_mode === 'manual' ? 'text-neon-amber' : 'text-slate-400'}`} />
                        <span className={`text-sm font-bold ${draft.execution_mode === 'manual' ? 'text-neon-amber' : 'text-slate-300'}`}>Manual Signal Approval</span>
                      </div>
                      <p className="text-[10px] text-slate-500">Bot generates signals; user approves each trade manually.</p>
                      <div className={`mt-2 w-10 h-5 rounded-full transition-colors relative ${draft.execution_mode === 'manual' ? 'bg-neon-amber/30' : 'bg-white/[0.08]'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${draft.execution_mode === 'manual' ? 'left-5 bg-neon-amber' : 'left-0.5 bg-slate-500'}`} />
                      </div>
                    </button>
                  </div>
                </div>

                {/* Market + Risk Level */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-2 block font-semibold">Market</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['spot', 'futures'] as const).map(m => (
                        <button
                          key={m}
                          onClick={() => setDraft({ ...draft, market_type: m })}
                          className={`px-3 py-2.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                            draft.market_type === m
                              ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/40'
                              : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:border-white/[0.12]'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-2 block font-semibold">Risk Level</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Low', 'Medium', 'High'] as const).map(r => (
                        <button
                          key={r}
                          onClick={() => setDraft({ ...draft, risk_level: r })}
                          className={`px-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                            draft.risk_level === r
                              ? r === 'Low' ? 'bg-neon-green/15 text-neon-green border border-neon-green/40'
                                : r === 'Medium' ? 'bg-neon-amber/15 text-neon-amber border border-neon-amber/40'
                                : 'bg-neon-red/15 text-neon-red border border-neon-red/40'
                              : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:border-white/[0.12]'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2 — Strategy & Indicator Engine */}
            {step === 2 && (
              <div className="space-y-5 animate-fade-in">
                {/* Strategy Multi-Select */}
                <div>
                  <label className="text-xs text-slate-400 mb-2 block font-semibold flex items-center gap-1.5">
                    <Workflow className="w-3.5 h-3.5" /> Strategy Engine — Inject Strategies
                  </label>
                  <div ref={strategiesRef} className="relative">
                    <button
                      onClick={() => setStrategiesOpen(!strategiesOpen)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm transition-colors hover:border-white/[0.14]"
                    >
                      <span className={draft.strategies.length > 0 ? 'text-white' : 'text-slate-500'}>
                        {draft.strategies.length > 0 ? `${draft.strategies.length} strategies selected` : 'Select strategies to inject...'}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${strategiesOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {strategiesOpen && (
                      <div className="absolute z-30 top-full mt-1 w-full max-h-56 overflow-y-auto scrollbar-thin glass-strong rounded-xl p-2 animate-scale-in">
                        {allStrategies.map(s => {
                          const selected = draft.strategies.includes(s);
                          return (
                            <button
                              key={s}
                              onClick={() => toggleStrategy(s)}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                                selected ? 'bg-neon-cyan/10 text-neon-cyan' : 'text-slate-300 hover:bg-white/[0.04]'
                              }`}
                            >
                              <span>{s}</span>
                              {selected && <Check className="w-4 h-4" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {/* Selected strategy chips */}
                  {draft.strategies.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {draft.strategies.map(s => (
                        <div key={s} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neon-cyan/10 border border-neon-cyan/25 text-xs text-neon-cyan font-medium">
                          {s}
                          <button onClick={() => toggleStrategy(s)} className="text-neon-cyan/50 hover:text-neon-red transition-colors">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Indicator Toggle Chips */}
                <div>
                  <label className="text-xs text-slate-400 mb-3 block font-semibold flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5" /> Indicator Engine — Toggle Indicators
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {allIndicators.map(ind => {
                      const selected = draft.indicators.includes(ind);
                      return (
                        <button
                          key={ind}
                          onClick={() => toggleIndicator(ind)}
                          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                            selected
                              ? 'bg-neon-amber/15 text-neon-amber border border-neon-amber/40 shadow-[0_0_12px_rgba(255,176,32,0.2)]'
                              : 'bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:border-white/[0.14] hover:text-slate-200'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full transition-all ${selected ? 'bg-neon-amber shadow-[0_0_6px_rgba(255,176,32,0.8)]' : 'bg-slate-600'}`} />
                            {ind}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Summary preview */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                  <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Logic Preview</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-slate-500">IF</span>
                    {draft.strategies.length > 0 ? (
                      draft.strategies.map((s, i) => (
                        <span key={s}>
                          <span className="px-2 py-0.5 rounded bg-neon-cyan/10 text-neon-cyan">{s}</span>
                          {i < draft.strategies.length - 1 && <span className="text-slate-500 ml-1.5">AND</span>}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-600 italic">no strategies</span>
                    )}
                    <span className="text-slate-500 ml-1">CONFIRMED BY</span>
                    {draft.indicators.length > 0 ? (
                      draft.indicators.map((ind, i) => (
                        <span key={ind}>
                          <span className="px-2 py-0.5 rounded bg-neon-amber/10 text-neon-amber">{ind}</span>
                          {i < draft.indicators.length - 1 && <span className="text-slate-500 ml-1.5">+</span>}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-600 italic">no indicators</span>
                    )}
                    <span className="text-slate-500 ml-1">THEN {draft.execution_mode === 'auto' ? 'EXECUTE' : 'SIGNAL'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3 — Risk Parameters */}
            {step === 3 && (
              <div className="space-y-5 animate-fade-in">
                {/* Max Drawdown Slider */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-neon-red" /> Max Drawdown
                    </label>
                    <span className="text-sm font-mono font-bold text-neon-red">{draft.max_drawdown_pct}%</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    step="1"
                    value={draft.max_drawdown_pct}
                    onChange={e => setDraft({ ...draft, max_drawdown_pct: Number(e.target.value) })}
                    className="w-full slider-neon h-2 rounded-full appearance-none bg-white/[0.06] cursor-pointer"
                    style={{ accentColor: '#ff3b5c' }}
                  />
                  <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                    <span>1%</span><span>25%</span><span>50%</span>
                  </div>
                </div>

                {/* TP & SL Inputs */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block font-semibold flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-neon-green" /> Take Profit %
                    </label>
                    <input
                      type="number"
                      value={draft.default_tp_pct}
                      onChange={e => setDraft({ ...draft, default_tp_pct: Number(e.target.value) })}
                      step="0.5"
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white font-mono focus:outline-none focus:border-neon-green/40 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block font-semibold flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-neon-red" /> Stop Loss %
                    </label>
                    <input
                      type="number"
                      value={draft.default_sl_pct}
                      onChange={e => setDraft({ ...draft, default_sl_pct: Number(e.target.value) })}
                      step="0.5"
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white font-mono focus:outline-none focus:border-neon-red/40 transition-colors"
                    />
                  </div>
                </div>

                {/* TP/SL Ratio Slider */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-neon-cyan" /> TP/SL Ratio
                    </label>
                    <span className="text-sm font-mono font-bold text-neon-cyan">{draft.tp_sl_ratio.toFixed(1)}:1</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="10"
                    step="0.5"
                    value={draft.tp_sl_ratio}
                    onChange={e => setDraft({ ...draft, tp_sl_ratio: Number(e.target.value) })}
                    className="w-full slider-neon h-2 rounded-full appearance-none bg-white/[0.06] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                    <span>0.5:1</span><span>5:1</span><span>10:1</span>
                  </div>
                </div>

                {/* Leverage Limit Slider */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-neon-amber" /> Leverage Limit
                    </label>
                    <span className="text-sm font-mono font-bold text-neon-amber">{draft.max_leverage}x</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="125"
                    step="1"
                    value={draft.max_leverage}
                    onChange={e => setDraft({ ...draft, max_leverage: Number(e.target.value) })}
                    className="w-full h-2 rounded-full appearance-none bg-white/[0.06] cursor-pointer"
                    style={{ accentColor: '#ffb020' }}
                  />
                  <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                    <span>1x</span><span>50x</span><span>125x</span>
                  </div>
                </div>

                {/* Risk Summary */}
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <p className="text-[10px] text-slate-500 uppercase font-semibold mb-3">Risk Configuration Summary</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="text-center py-2 rounded-lg bg-neon-red/5">
                      <p className="text-[9px] text-slate-500 uppercase">Max DD</p>
                      <p className="text-sm font-bold text-neon-red font-mono">{draft.max_drawdown_pct}%</p>
                    </div>
                    <div className="text-center py-2 rounded-lg bg-neon-green/5">
                      <p className="text-[9px] text-slate-500 uppercase">TP</p>
                      <p className="text-sm font-bold text-neon-green font-mono">{draft.default_tp_pct}%</p>
                    </div>
                    <div className="text-center py-2 rounded-lg bg-neon-red/5">
                      <p className="text-[9px] text-slate-500 uppercase">SL</p>
                      <p className="text-sm font-bold text-neon-red font-mono">{draft.default_sl_pct}%</p>
                    </div>
                    <div className="text-center py-2 rounded-lg bg-neon-amber/5">
                      <p className="text-[9px] text-slate-500 uppercase">Max Lev</p>
                      <p className="text-sm font-bold text-neon-amber font-mono">{draft.max_leverage}x</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer — Navigation */}
          <div className="sticky bottom-0 bg-base-800/90 backdrop-blur-xl border-t border-white/[0.06] px-5 sm:px-6 py-4 flex items-center justify-between gap-3">
            <button
              onClick={() => step > 1 ? setStep(step - 1) : onClose()}
              className="px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] text-sm text-slate-300 border border-white/[0.06] transition-all"
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </button>

            {step < 3 ? (
              <button
                onClick={() => canProceed(step) && setStep(step + 1)}
                disabled={!canProceed(step)}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                  canProceed(step)
                    ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/40 hover:neon-glow-cyan'
                    : 'bg-white/[0.03] text-slate-600 border border-white/[0.06] cursor-not-allowed'
                }`}
              >
                Next <ChevronDown className="w-4 h-4 -rotate-90" />
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-neon-green/15 text-neon-green border border-neon-green/40 hover:neon-glow-green transition-all flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                {editing ? 'Save Changes' : 'Deploy Bot'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
