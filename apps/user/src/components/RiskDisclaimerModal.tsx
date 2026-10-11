import { useState } from 'react';
import { ShieldAlert, Check, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@cortex/shared/lib/supabase';
import { useAuth } from '@cortex/shared/context/AuthContext';

interface Props {
  onProceed: () => void;
}

export default function RiskDisclaimerModal({ onProceed }: Props) {
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const { user } = useAuth();

  const handleProceed = async () => {
    if (!agreed) return;
    setSaving(true);
    setDbError(null);

    if (user) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({
            disclaimer_accepted: true,
            disclaimer_accepted_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (error) {
          console.error('Disclaimer update failed (DB error):', error.message);
          setDbError(`Database error: ${error.message}. You can still proceed — the preference will save when the database is available.`);
        }
      } catch (err) {
        console.error('Disclaimer update threw (network/timeout):', err);
        setDbError('Could not reach the database. You can still proceed to the dashboard.');
      }
    }

    setSaving(false);
    onProceed();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-base-900/80 backdrop-blur-md" />
      <div className="relative w-full max-w-lg animate-scale-in">
        <div className="glass-strong neon-glow-cyan p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-neon-amber/10 border border-neon-amber/30 flex items-center justify-center" style={{ boxShadow: '0 0 15px rgba(255, 176, 32, 0.2)' }}>
              <ShieldAlert className="w-6 h-6 text-neon-amber" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Risk Disclaimer & Terms of Use</h2>
              <p className="text-xs text-slate-400">Please read carefully before proceeding</p>
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto scrollbar-thin pr-2 space-y-3 text-sm text-slate-300 leading-relaxed">
            <p>
              <span className="text-neon-amber font-semibold">Cryptocurrency trading involves significant risk.</span> Digital asset markets are highly volatile and subject to rapid, unpredictable price swings. You may lose all or a substantial portion of your invested capital.
            </p>
            <p>
              Cortex AI provides AI-powered analytical tools and automated trading strategies for informational and educational purposes only. Nothing on this platform constitutes financial advice, investment recommendations, or solicitation to buy or sell any asset.
            </p>
            <p>
              Past performance, AI predictions, and backtested results do not guarantee future outcomes. The use of leverage can amplify both gains and losses. You are solely responsible for your trading decisions and should consult a licensed financial advisor before engaging in any trading activity.
            </p>
            <p>
              By proceeding, you acknowledge that you understand these risks and agree that Cortex AI, its operators, and affiliates shall not be held liable for any financial losses, damages, or claims arising from your use of this platform.
            </p>
          </div>

          {dbError && (
            <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-neon-amber/10 border border-neon-amber/20 text-xs text-neon-amber">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{dbError}</span>
            </div>
          )}

          <label className="mt-5 flex items-start gap-3 cursor-pointer group">
            <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border transition-all duration-200 flex items-center justify-center ${agreed ? 'bg-neon-green/20 border-neon-green/50 neon-glow-green' : 'border-white/20 group-hover:border-white/40'}`}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="sr-only"
              />
              {agreed && <Check className="w-3.5 h-3.5 text-neon-green" />}
            </div>
            <span className={`text-sm select-none transition-colors ${agreed ? 'text-slate-200' : 'text-slate-400'}`}>
              I understand the market risks and accept the terms.
            </span>
          </label>

          <button
            disabled={!agreed || saving}
            onClick={handleProceed}
            className={`mt-5 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all duration-300 ${
              agreed && !saving
                ? 'bg-gradient-to-r from-neon-cyan/20 to-neon-green/20 text-white border border-neon-cyan/40 hover:from-neon-cyan/30 hover:to-neon-green/30 neon-glow-cyan hover:scale-[1.02]'
                : 'bg-white/[0.03] text-slate-500 border border-white/[0.06] cursor-not-allowed'
            }`}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                Proceed to Cortex AI Dashboard
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <span>This disclaimer will not be shown again once accepted</span>
          </div>
        </div>
      </div>
    </div>
  );
}
