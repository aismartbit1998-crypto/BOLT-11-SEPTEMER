import { useState, useEffect } from 'react';
import {
  Crown, Zap, Rocket, Check, Sparkles, Bot, TrendingUp, Shield,
  Activity, Copy, KeyRound, Users, SlidersHorizontal, Headphones,
  Building2, Clock, X, Loader2, Send, CheckCircle2, Infinity as InfinityIcon,
  Gauge, BrainCircuit, Layers,
} from 'lucide-react';
import { useAuth } from '@cortex/shared/context/AuthContext';
import { supabase } from '@cortex/shared/lib/supabase';

interface PlanFeature {
  icon: typeof Bot;
  label: string;
}

interface UpgradePlan {
  id: 'Starter' | 'Pro' | 'Enterprise';
  name: string;
  tagline: string;
  icon: typeof Crown;
  accent: 'cyan' | 'green' | 'amber';
  features: PlanFeature[];
  highlighted?: boolean;
}

const upgradePlans: UpgradePlan[] = [
  {
    id: 'Starter',
    name: 'Starter',
    tagline: 'Begin your AI trading journey',
    icon: Zap,
    accent: 'cyan',
    features: [
      { icon: Bot, label: '2 AI Bots Maximum' },
      { icon: Gauge, label: '10x Max Leverage' },
      { icon: TrendingUp, label: 'Spot Trading' },
      { icon: Headphones, label: 'Email Support' },
      { icon: Activity, label: 'Basic AI Signals' },
      { icon: BrainCircuit, label: '1 Strategy Core' },
    ],
  },
  {
    id: 'Pro',
    name: 'Pro',
    tagline: 'For serious algorithmic traders',
    icon: Rocket,
    accent: 'green',
    highlighted: true,
    features: [
      { icon: Bot, label: '10 AI Bots Maximum' },
      { icon: Gauge, label: '50x Max Leverage' },
      { icon: TrendingUp, label: 'Spot & Futures Trading' },
      { icon: Headphones, label: 'Priority Support' },
      { icon: Activity, label: 'Advanced AI Signals' },
      { icon: Copy, label: 'Copy Trading Access' },
      { icon: SlidersHorizontal, label: 'Custom Strategies' },
      { icon: BrainCircuit, label: '5 Strategy Cores' },
    ],
  },
  {
    id: 'Enterprise',
    name: 'Enterprise',
    tagline: 'Unlimited institutional-grade power',
    icon: Crown,
    accent: 'amber',
    features: [
      { icon: InfinityIcon, label: 'Unlimited AI Bots' },
      { icon: Gauge, label: '125x Max Leverage' },
      { icon: Layers, label: 'Unlimited Markets & Pairs' },
      { icon: Users, label: 'Dedicated Account Manager' },
      { icon: KeyRound, label: 'Full API Access' },
      { icon: Shield, label: 'Custom Risk Rules' },
      { icon: Building2, label: 'White-Label Option' },
      { icon: Sparkles, label: 'Priority Feature Access' },
      { icon: Copy, label: 'Copy Trading Marketplace' },
      { icon: BrainCircuit, label: 'All Strategy Cores Unlocked' },
    ],
  },
];

const accentMap = {
  cyan: { text: 'text-neon-cyan', bg: 'bg-neon-cyan/10', border: 'border-neon-cyan/30', glow: 'neon-glow-cyan', hex: '#00e5ff' },
  green: { text: 'text-neon-green', bg: 'bg-neon-green/10', border: 'border-neon-green/30', glow: 'neon-glow-green', hex: '#00ff9d' },
  amber: { text: 'text-neon-amber', bg: 'bg-neon-amber/10', border: 'border-neon-amber/30', glow: 'neon-glow-amber', hex: '#ffb020' },
};

// Mock current plan data — in production this would come from the licenses table
const currentPlanData = {
  plan: 'Starter',
  botLimit: 2,
  maxLeverage: 10,
  validFrom: '2026-10-01',
  validUntil: '2026-11-01',
  features: [
    '2 AI Bots Maximum',
    '10x Max Leverage',
    'Spot Trading',
    'Email Support',
    'Basic AI Signals',
    '1 Strategy Core',
  ],
};

export default function MySubscriptionView() {
  const { user } = useAuth();
  const [requestModal, setRequestModal] = useState<UpgradePlan | null>(null);
  const [sending, setSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [licenseData, setLicenseData] = useState<{
    plan_name: string;
    bot_limit: number;
    valid_from: string;
    valid_until: string;
    allotted_strategies: string[] | null;
    is_active: boolean;
  } | null>(null);
  const [loadingLicense, setLoadingLicense] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoadingLicense(false); return; }
    supabase
      .from('licenses')
      .select('plan_name, bot_limit, valid_from, valid_until, allotted_strategies, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setLicenseData(data as typeof licenseData);
        setLoadingLicense(false);
      });
  }, [user?.id]);

  const currentPlan = licenseData?.plan_name ?? 'Starter';
  const botLimit = licenseData?.bot_limit ?? 2;
  const validFromStr = licenseData?.valid_from ?? new Date().toISOString();
  const validUntilStr = licenseData?.valid_until ?? new Date(Date.now() + 30 * 86400000).toISOString();
  const maxLeverage = currentPlan === 'Enterprise' ? 125 : currentPlan === 'Pro' ? 50 : 10;
  const features = licenseData?.allotted_strategies ?? [
    `${botLimit} AI Bots Maximum`,
    `${maxLeverage}x Max Leverage`,
    currentPlan === 'Pro' || currentPlan === 'Enterprise' ? 'Spot & Futures Trading' : 'Spot Trading',
    currentPlan === 'Enterprise' ? 'Priority Feature Access' : 'Email Support',
    'Basic AI Signals',
    `${currentPlan === 'Enterprise' ? 'All' : currentPlan === 'Pro' ? '5' : '1'} Strategy Cores`,
  ];

  const validFrom = new Date(validFromStr);
  const validUntil = new Date(validUntilStr);
  const now = new Date();
  const totalDays = Math.max(1, Math.ceil((validUntil.getTime() - validFrom.getTime()) / (1000 * 60 * 60 * 24)));
  const daysElapsed = Math.ceil((now.getTime() - validFrom.getTime()) / (1000 * 60 * 60 * 24));
  const daysLeft = Math.max(0, totalDays - daysElapsed);
  const progressPct = Math.min(100, Math.max(0, (daysElapsed / totalDays) * 100));

  const currentAccent = currentPlan === 'Enterprise' ? 'amber' : currentPlan === 'Pro' ? 'green' : 'cyan';
  const a = accentMap[currentAccent];

  const handleRequestUpgrade = async () => {
    if (!requestModal) return;
    setSending(true);

    // Log the upgrade request in the admin activity log so admins can see it
    await supabase.from('admin_activity_log').insert({
      admin_email: 'system',
      admin_name: 'Upgrade Bot',
      action_type: 'license_change',
      message: `Client ${user?.email ?? 'unknown'} requested upgrade to ${requestModal.name} plan`,
      severity: 'info',
    });

    setSending(false);
    setRequestModal(null);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 5000);
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center neon-glow-cyan">
          <KeyRound className="w-6 h-6 text-neon-cyan" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">My Subscription</h2>
          <p className="text-sm text-slate-400">Manage your plan, view active features, and request upgrades</p>
        </div>
      </div>

      {/* === Section 1: Current Plan Overview === */}
      <div className={`glass-card p-5 sm:p-6 relative overflow-hidden border ${a.border}`}>
        <div className={`absolute -top-20 -right-20 w-60 h-60 ${a.bg} rounded-full blur-3xl opacity-40`} />

            {loadingLicense ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-neon-cyan animate-spin" /></div>
            ) : (
              <div className="relative">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl ${a.bg} ${a.border} border flex items-center justify-center ${a.glow}`}>
                      <Crown className={`w-7 h-7 ${a.text}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-white">{currentPlan} Plan</h3>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${a.bg} ${a.text} ${a.border} border flex items-center gap-1`}>
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-neon-green" />
                          </span>
                          {licenseData?.is_active ? 'ACTIVE' : 'NO LICENSE'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        Valid from {validFrom.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {' — '}
                        {validUntil.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-500 uppercase font-semibold">Days Remaining</p>
                    <p className={`text-3xl font-bold ${a.text} font-mono`}>{daysLeft}</p>
                    <p className="text-[10px] text-slate-500">of {totalDays} days</p>
                  </div>
                </div>

          {/* Glowing Time-Left Progress Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1.5">
              <span>Subscription Period</span>
              <span className={a.text}>{progressPct.toFixed(0)}% elapsed</span>
            </div>
            <div className="h-3 rounded-full bg-base-700 overflow-hidden relative">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${currentAccent === 'amber' ? 'from-neon-amber to-neon-cyan' : currentAccent === 'green' ? 'from-neon-green to-neon-cyan' : 'from-neon-cyan to-neon-green'} transition-all duration-1000 relative`}
                style={{ width: `${progressPct}%` }}
              >
                <div className="absolute inset-0 rounded-full" style={{ boxShadow: `0 0 20px ${a.hex}99` }} />
                <div className="absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-white/30 to-transparent" />
              </div>
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-slate-600">
              <span>{validFrom.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
              <span>{validUntil.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04] text-center">
              <Bot className={`w-4 h-4 mx-auto mb-1 ${a.text}`} />
              <p className="text-lg font-bold text-white font-mono">{botLimit}</p>
              <p className="text-[9px] text-slate-500 uppercase">Bot Limit</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04] text-center">
              <Gauge className={`w-4 h-4 mx-auto mb-1 ${a.text}`} />
              <p className="text-lg font-bold text-white font-mono">{maxLeverage}x</p>
              <p className="text-[9px] text-slate-500 uppercase">Max Leverage</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04] text-center">
              <Clock className={`w-4 h-4 mx-auto mb-1 ${a.text}`} />
              <p className="text-lg font-bold text-white font-mono">{daysLeft}d</p>
              <p className="text-[9px] text-slate-500 uppercase">Time Left</p>
            </div>
          </div>

          {/* Active Features */}
          <div>
            <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-3 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Your Active Features
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {features.map((feat) => (
                <div key={feat} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                  <div className={`w-5 h-5 rounded-md ${a.bg} flex items-center justify-center flex-shrink-0`}>
                    <Check className={`w-3 h-3 ${a.text}`} />
                  </div>
                  <span className="text-xs text-slate-300 font-medium">{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
              )}
      </div>

      {/* === Section 2: Upgrade Plans Matrix === */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-neon-cyan" />
            Upgrade Your Plan
          </h3>
        </div>
        <p className="text-sm text-slate-400 mb-5">Unlock more bots, higher leverage, advanced strategies, and premium features</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {upgradePlans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} currentPlan={currentPlan} onRequest={() => setRequestModal(plan)} />
          ))}
        </div>
      </div>

      {/* === Request Upgrade Confirmation Modal === */}
      {requestModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-base-900/85 backdrop-blur-md" onClick={() => !sending && setRequestModal(null)} />
          <div className="relative w-full max-w-md animate-scale-in">
            <div className={`glass-strong ${accentMap[requestModal.accent].glow} p-6`}>
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl ${accentMap[requestModal.accent].bg} border ${accentMap[requestModal.accent].border} flex items-center justify-center`}>
                    <Send className={`w-5 h-5 ${accentMap[requestModal.accent].text}`} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">Request Upgrade</h2>
                    <p className="text-xs text-slate-400">Send request to Master Admin</p>
                  </div>
                </div>
                <button onClick={() => !sending && setRequestModal(null)} className="text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="space-y-4">
                <div className={`p-4 rounded-xl ${accentMap[requestModal.accent].bg} border ${accentMap[requestModal.accent].border}`}>
                  <div className="flex items-center gap-3 mb-2">
                    {(() => {
                      const PIcon = planIconMap[requestModal.id];
                      return <PIcon className={`w-5 h-5 ${accentMap[requestModal.accent].text}`} />;
                    })()}
                    <span className={`text-sm font-bold ${accentMap[requestModal.accent].text}`}>{requestModal.name} Plan</span>
                  </div>
                  <p className="text-xs text-slate-400">{requestModal.tagline}</p>
                </div>

                <p className="text-sm text-slate-300 leading-relaxed">
                  You are about to send an upgrade request from <span className="font-semibold text-white">{currentPlan}</span> to <span className={`font-semibold ${accentMap[requestModal.accent].text}`}>{requestModal.name}</span>. The Master Admin team will review your request and contact you shortly to complete the upgrade.
                </p>

                <div className="flex items-start gap-2 p-3 rounded-xl bg-neon-amber/5 border border-neon-amber/15">
                  <Shield className="w-4 h-4 text-neon-amber flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Your request will be sent to the Master Admin panel for review. You'll be notified once approved. No payment is processed at this stage.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setRequestModal(null)}
                  disabled={sending}
                  className="flex-1 px-4 py-2.5 rounded-xl glass hover:bg-white/[0.07] text-sm text-slate-300 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRequestUpgrade}
                  disabled={sending}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${accentMap[requestModal.accent].bg} ${accentMap[requestModal.accent].text} border ${accentMap[requestModal.accent].border} hover:opacity-90 active:scale-95`}
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sending ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === Success Toast === */}
      {showSuccess && (
        <div className="fixed bottom-6 right-6 z-[110] animate-slide-up">
          <div className="glass-strong neon-glow-green p-4 pr-6 flex items-start gap-3 max-w-sm">
            <div className="w-10 h-10 rounded-xl bg-neon-green/15 border border-neon-green/30 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-5 h-5 text-neon-green" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Upgrade Request Sent!</p>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                Your upgrade request has been sent to the Master Admin. Our team will contact you shortly.
              </p>
            </div>
            <button onClick={() => setShowSuccess(false)} className="text-slate-500 hover:text-white transition-colors flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const planIconMap: Record<string, typeof Crown> = {
  Starter: Zap,
  Pro: Rocket,
  Enterprise: Crown,
};

function PlanCard({ plan, currentPlan, onRequest }: { plan: UpgradePlan; currentPlan: string; onRequest: () => void }) {
  const a = accentMap[plan.accent];
  const PIcon = plan.icon;
  const isCurrent = plan.id === currentPlan;

  return (
    <div className={`glass-card p-6 relative overflow-hidden group transition-all duration-300 ${plan.highlighted ? `border-2 ${a.border} ${a.glow}` : 'hover:border-white/[0.12]'}`}>
      {plan.highlighted && (
        <div className={`absolute -top-16 -right-16 w-40 h-40 ${a.bg} rounded-full blur-3xl opacity-50`} />
      )}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="relative">
        {/* Highlighted badge */}
        {plan.highlighted && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className={`px-3 py-1 rounded-full ${a.bg} ${a.text} text-[9px] font-bold tracking-wide border ${a.border} whitespace-nowrap flex items-center gap-1`}>
              <Sparkles className="w-3 h-3" /> MOST POPULAR
            </span>
          </div>
        )}

        {/* Icon + Name */}
        <div className="flex items-center gap-3 mb-4 mt-1">
          <div className={`w-12 h-12 rounded-xl ${a.bg} ${a.border} border flex items-center justify-center`}>
            <PIcon className={`w-6 h-6 ${a.text}`} />
          </div>
          <div>
            <h3 className={`text-lg font-bold ${a.text}`}>{plan.name}</h3>
            <p className="text-[10px] text-slate-500">{plan.tagline}</p>
          </div>
        </div>

        {/* Features list */}
        <div className="space-y-2.5 mb-6">
          {plan.features.map((feat) => {
            const FIcon = feat.icon;
            return (
              <div key={feat.label} className="flex items-center gap-2.5">
                <div className={`w-5 h-5 rounded-md ${a.bg} flex items-center justify-center flex-shrink-0`}>
                  <Check className={`w-3 h-3 ${a.text}`} />
                </div>
                <FIcon className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                <span className="text-xs text-slate-300 font-medium">{feat.label}</span>
              </div>
            );
          })}
        </div>

        {/* Action button */}
        {isCurrent ? (
          <div className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm font-bold text-slate-400">
            <CheckCircle2 className="w-4 h-4 text-neon-green" />
            Current Plan
          </div>
        ) : (
          <button
            onClick={onRequest}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${a.bg} ${a.text} border ${a.border} hover:opacity-90 hover:scale-[1.02] ${plan.highlighted ? a.glow : ''}`}
          >
            <Send className="w-4 h-4" />
            {plan.id === 'Enterprise' ? 'Contact Sales' : 'Request Upgrade'}
          </button>
        )}
      </div>
    </div>
  );
}
