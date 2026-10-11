import { useState, useEffect } from 'react';
import { Server, CheckCircle, AlertCircle, Activity, AlertTriangle } from 'lucide-react';
import { supabase, type BrokerResponse } from '@cortex/shared/lib/supabase';
import { useAuth } from '@cortex/shared/context/AuthContext';

const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; bg: string; border: string; label: string }> = {
  success: { icon: CheckCircle, color: 'text-neon-green', bg: 'bg-neon-green/10', border: 'border-neon-green/20', label: 'SUCCESS' },
  error: { icon: AlertCircle, color: 'text-neon-red', bg: 'bg-neon-red/10', border: 'border-neon-red/20', label: 'ERROR' },
};

export default function BrokerResponseView() {
  const { user } = useAuth();
  const [responses, setResponses] = useState<BrokerResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }

    const fetchResponses = async () => {
      const { data, error } = await supabase
        .from('broker_responses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        setError(error.message);
      } else {
        setResponses((data as BrokerResponse[]) ?? []);
      }
      setLoading(false);
    };
    fetchResponses();

    const channel = supabase
      .channel('broker-responses-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'broker_responses' }, (payload) => {
        setResponses(prev => [payload.new as BrokerResponse, ...prev].slice(0, 50));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  if (loading) {
    return (
      <div className="space-y-5 animate-slide-up">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Server className="w-5 h-5 text-neon-cyan" />
          Broker Response
        </h2>
        <div className="glass-card p-8 text-center">
          <p className="text-sm text-slate-400">Loading broker responses...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5 animate-slide-up">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Server className="w-5 h-5 text-neon-cyan" />
          Broker Response
        </h2>
        <div className="glass-card p-8 text-center border-neon-red/20">
          <AlertTriangle className="w-8 h-8 text-neon-red mx-auto mb-3" />
          <p className="text-sm font-semibold text-white">Failed to load broker responses</p>
          <p className="text-xs text-slate-500 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const successCount = responses.filter(r => r.status === 'success').length;
  const errorCount = responses.filter(r => r.status === 'error').length;
  const avgLatency = responses.length > 0 ? Math.round(responses.reduce((s, r) => s + r.latency_ms, 0) / responses.length) : 0;

  return (
    <div className="space-y-5 animate-slide-up">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Server className="w-5 h-5 text-neon-cyan" />
          Broker Response
        </h2>
        <p className="text-sm text-slate-400">Real-time API response logs from connected brokers</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass-card p-4">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Total Requests</span>
          <p className="text-lg font-bold text-white font-mono">{responses.length}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Successful</span>
            <CheckCircle className="w-4 h-4 text-neon-green" />
          </div>
          <p className="text-lg font-bold text-neon-green font-mono">{successCount}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Errors</span>
            <AlertCircle className="w-4 h-4 text-neon-red" />
          </div>
          <p className="text-lg font-bold text-neon-red font-mono">{errorCount}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Avg Latency</span>
            <Activity className="w-4 h-4 text-neon-cyan" />
          </div>
          <p className="text-lg font-bold text-neon-cyan font-mono">{avgLatency}ms</p>
        </div>
      </div>

      {responses.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Server className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-300">No broker responses yet</p>
          <p className="text-xs text-slate-500 mt-1">API response logs will appear here once your bot starts trading.</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.06]">
            <h3 className="text-sm font-bold text-white">API Response Log</h3>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {responses.map((r) => {
              const sc = statusConfig[r.status] ?? statusConfig.success;
              const Icon = sc.icon;
              return (
                <div key={r.id} className="flex items-start gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${sc.bg} ${sc.border} border flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${sc.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-white">{r.endpoint ?? r.exchange_name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${sc.bg} ${sc.color}`}>{sc.label}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{r.latency_ms}ms</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 font-mono truncate">{r.message ?? r.exchange_name}</p>
                  </div>
                  <span className="text-[10px] text-slate-600 font-mono flex-shrink-0 hidden sm:block">{new Date(r.created_at).toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
