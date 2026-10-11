import { useEffect, useState } from 'react';
import {
  AlertTriangle, ShieldCheck, Loader2, Activity,
  Gauge, Brain, Sliders,
  CheckCircle2, XCircle, RefreshCw, Server,
} from 'lucide-react';
import { supabase, type RiskSettings, type ApiHealthLog } from '@cortex/shared/lib/supabase';

const healthConfig: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  healthy: { color: 'text-neon-green', bg: 'bg-neon-green/10', border: 'border-neon-green/25', dot: 'bg-neon-green' },
  degraded: { color: 'text-neon-amber', bg: 'bg-neon-amber/10', border: 'border-neon-amber/25', dot: 'bg-neon-amber' },
  down: { color: 'text-neon-red', bg: 'bg-neon-red/10', border: 'border-neon-red/25', dot: 'bg-neon-red' },
};

export default function AdminRiskControl() {
  const [settings, setSettings] = useState<RiskSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiLogs, setApiLogs] = useState<ApiHealthLog[]>([]);
  const [aiCircuitBreaker, setAiCircuitBreaker] = useState(true);
  const [maxSlippagePct, setMaxSlippagePct] = useState(1.5);

  useEffect(() => {
    let mounted = true;
    supabase.from('risk_settings').select('*').limit(1).maybeSingle().then(({ data }) => {
      if (!mounted) return;
      const s = data as RiskSettings | null;
      setSettings(s);
      if (s) {
        setMaxSlippagePct(Number(s.max_slippage_pct ?? 1.5));
        setAiCircuitBreaker(s.ai_circuit_breaker ?? true);
      }
      setLoading(false);
    });
    supabase.from('api_health_logs').select('*').order('last_checked_at', { ascending: false }).then(({ data }) => {
      if (!mounted) return;
      setApiLogs((data as ApiHealthLog[]) ?? []);
    });
    return () => { mounted = false; };
  }, []);

  const update = async (field: keyof RiskSettings, value: boolean | number) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
    setSaving(true);
    await supabase.from('risk_settings').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', settings.id);
    setSaving(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-neon-cyan animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-neon-amber" /> Risk Control & Platform Infrastructure</h2>
          <p className="text-sm text-slate-400">Manage risk breach defenses, AI circuit breakers, and global core API health</p>
        </div>
        {saving && <div className="flex items-center gap-2 text-xs text-neon-amber font-mono bg-neon-amber/10 px-3 py-1.5 rounded-lg border border-neon-amber/20"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving changes...</div>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="glass-card p-5 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-neon-green/10 border border-neon-green/20 text-neon-green"><ShieldCheck className="w-5 h-5" /></div>
              <div><h3 className="text-sm font-bold text-white">Auto-Disable on Risk Breach</h3><p className="text-[11px] text-slate-500">Automatically pause bots upon risk limit violations</p></div>
            </div>
            <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold border ${settings?.auto_disable_on_breach ? 'text-neon-green bg-neon-green/10 border-neon-green/25' : 'text-slate-500 bg-white/[0.03] border-white/[0.06]'}`}>{settings?.auto_disable_on_breach ? 'ENABLED' : 'DISABLED'}</span>
          </div>
          <button onClick={() => update('auto_disable_on_breach', !(settings?.auto_disable_on_breach ?? true))} className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all border ${settings?.auto_disable_on_breach ? 'bg-neon-green/15 text-neon-green border-neon-green/30 hover:bg-neon-green/25' : 'bg-white/[0.04] text-slate-400 border-white/[0.08] hover:text-white'}`}>{settings?.auto_disable_on_breach ? 'Active Defense Enabled (Click to Toggle)' : 'Defense Disabled (Click to Enable)'}</button>
        </div>

        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan"><Sliders className="w-5 h-5" /></div>
              <div><h3 className="text-sm font-bold text-white">Max Slippage Protection Guard</h3><p className="text-[11px] text-slate-500">Reject orders if slippage exceeds threshold</p></div>
            </div>
            <span className="text-xl font-bold font-mono text-neon-cyan">{maxSlippagePct}%</span>
          </div>
          <input type="range" min="0.1" max="5.0" step="0.1" value={maxSlippagePct} onChange={e => { const v = Number(e.target.value); setMaxSlippagePct(v); if (settings) update('max_slippage_pct', v); }} className="w-full h-2 rounded-full appearance-none cursor-pointer accent-neon-cyan bg-white/[0.08]" />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono"><span>0.1% (Strict)</span><span>1.5% (Standard)</span><span>5.0% (Relaxed)</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-1 gap-5">
        <div className="glass-card p-5 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-neon-amber/10 border border-neon-amber/20 text-neon-amber"><Brain className="w-5 h-5" /></div>
              <div><h3 className="text-sm font-bold text-white">AI Volatility Circuit Breaker</h3><p className="text-[11px] text-slate-500">AI monitors market spikes & pauses trades during flash crashes</p></div>
            </div>
            <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold border ${aiCircuitBreaker ? 'text-neon-amber bg-neon-amber/10 border-neon-amber/25' : 'text-slate-500 bg-white/[0.03] border-white/[0.06]'}`}>{aiCircuitBreaker ? 'SHIELD ACTIVE' : 'OFF'}</span>
          </div>
          <button onClick={() => { const newVal = !aiCircuitBreaker; setAiCircuitBreaker(newVal); if (settings) update('ai_circuit_breaker', newVal); }} className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all border ${aiCircuitBreaker ? 'bg-neon-amber/15 text-neon-amber border-neon-amber/30 hover:bg-neon-amber/25' : 'bg-white/[0.04] text-slate-400 border-white/[0.08] hover:text-white'}`}>{aiCircuitBreaker ? 'AI Shield Protecting Platform' : 'Enable AI Volatility Shield'}</button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2"><Activity className="w-4 h-4 text-neon-cyan" /><h3 className="text-sm font-bold text-white">Core Infrastructure & AI Engine Health Hub</h3></div>
          <button onClick={() => supabase.from('api_health_logs').select('*').order('last_checked_at', { ascending: false }).then(({ data }) => setApiLogs((data as ApiHealthLog[]) ?? []))} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] text-slate-300 hover:text-white text-xs border border-white/[0.08] transition-all"><RefreshCw className="w-3.5 h-3.5" /> Refresh Status</button>
        </div>
        {apiLogs.length === 0 ? (
          <div className="p-12 text-center">
            <Server className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-300">No health logs yet</p>
            <p className="text-xs text-slate-500 mt-1">API health data will appear here once monitoring is active.</p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left py-3 px-4 font-semibold">Exchange</th>
                  <th className="text-right py-3 px-4 font-semibold">Latency</th>
                  <th className="text-right py-3 px-4 font-semibold">Error Rate</th>
                  <th className="text-center py-3 px-4 font-semibold">Health Status</th>
                  <th className="text-right py-3 px-4 font-semibold">Last Checked</th>
                </tr>
              </thead>
              <tbody>
                {apiLogs.map((item) => {
                  const hc = healthConfig[item.status] ?? healthConfig.healthy;
                  const HIcon = item.status === 'healthy' ? CheckCircle2 : item.status === 'degraded' ? AlertTriangle : XCircle;
                  return (
                    <tr key={item.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-white flex items-center gap-2.5"><div className={`w-2 h-2 rounded-full ${hc.dot} animate-pulse`} />{item.exchange_name}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-200"><span className={item.latency_ms > 150 ? 'text-neon-amber' : 'text-neon-green'}>{item.latency_ms}ms</span></td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-300">{Number(item.error_rate_pct).toFixed(1)}%</td>
                      <td className="py-3.5 px-4 text-center"><span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold border ${hc.bg} ${hc.color} ${hc.border}`}><HIcon className="w-3.5 h-3.5" />{item.status.toUpperCase()}</span></td>
                      <td className="py-3.5 px-4 text-right text-xs text-slate-500 font-mono">{new Date(item.last_checked_at).toLocaleTimeString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
