import { useState } from 'react';
import { Megaphone, Mail, MessageSquare, Send, Loader2, Check, Users, AlertCircle } from 'lucide-react';
import { useAuth } from '@cortex/shared/context/AuthContext';

const API_BASE = import.meta.env.VITE_ENGINE_URL || '';

type TargetType = 'all' | 'active' | 'expired';

interface TargetOption {
  id: TargetType;
  label: string;
  desc: string;
  icon: typeof Users;
}

const targetOptions: TargetOption[] = [
  { id: 'all', label: 'All Clients', desc: 'Send to every registered client', icon: Users },
  { id: 'active', label: 'Active Clients', desc: 'Clients with an active license', icon: Check },
  { id: 'expired', label: 'Expired Clients', desc: 'Clients whose license has lapsed', icon: AlertCircle },
];

export default function AdminBroadcast() {
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<TargetType>('all');
  const [sendEmail, setSendEmail] = useState(true);
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; sent: number; failed: number; total: number; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) return;
    if (!sendEmail && !sendWhatsApp) {
      setError('Select at least one delivery channel (Email or WhatsApp).');
      return;
    }

    setSending(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/admin/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
          target,
          channels: { email: sendEmail, whatsapp: sendWhatsApp },
          admin_id: user?.id,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setResult({
          success: true,
          sent: data.sent ?? 0,
          failed: data.failed ?? 0,
          total: data.total ?? 0,
          message: data.message || 'Broadcast sent successfully',
        });
        setSubject('');
        setMessage('');
      } else {
        setError(data.error || 'Failed to send broadcast.');
      }
    } catch {
      setError('Unable to reach the server. Please ensure the engine service is running.');
    }

    setSending(false);
  };

  return (
    <div className="space-y-5 animate-slide-up">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-neon-amber" />
          Promotions & Broadcasts
        </h2>
        <p className="text-sm text-slate-400">Send promotional messages and announcements to your clients via Email and WhatsApp</p>
      </div>

      {/* Result banner */}
      {result && (
        <div className="glass-card p-4 border-neon-green/20 flex items-start gap-3 animate-fade-in">
          <Check className="w-5 h-5 text-neon-green flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-white">Broadcast Complete</p>
            <p className="text-xs text-slate-400 mt-1">
              {result.message} — Delivered: {result.sent}/{result.total}{result.failed > 0 ? `, Failed: ${result.failed}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="glass-card p-4 border-neon-red/20 flex items-start gap-3 animate-fade-in">
          <AlertCircle className="w-5 h-5 text-neon-red flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-white">Error</p>
            <p className="text-xs text-slate-400 mt-1">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Form */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card p-5 space-y-4">
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. New Trading Features Available Now"
                className="w-full px-4 py-2.5 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-amber/40 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Message Body</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your promotional message here..."
                rows={8}
                className="w-full px-4 py-2.5 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-amber/40 transition-colors resize-y"
              />
              <p className="text-[10px] text-slate-500 mt-1">{message.length} characters</p>
            </div>
          </div>
        </div>

        {/* Sidebar: target + channels */}
        <div className="space-y-4">
          {/* Target audience */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-neon-amber" />
              Target Audience
            </h3>
            <div className="space-y-2">
              {targetOptions.map((opt) => {
                const Icon = opt.icon;
                const isSelected = target === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setTarget(opt.id)}
                    className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all border ${
                      isSelected
                        ? 'bg-neon-amber/10 border-neon-amber/30'
                        : 'border-transparent hover:bg-white/[0.04]'
                    }`}
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isSelected ? 'text-neon-amber' : 'text-slate-500'}`} />
                    <div>
                      <p className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-slate-300'}`}>{opt.label}</p>
                      <p className="text-[10px] text-slate-500">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Delivery channels */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Send className="w-4 h-4 text-neon-amber" />
              Delivery Channels
            </h3>
            <div className="space-y-2">
              <label className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all border ${
                sendEmail ? 'bg-neon-cyan/10 border-neon-cyan/30' : 'border-transparent hover:bg-white/[0.04]'
              }`}>
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="w-4 h-4 accent-neon-cyan"
                />
                <Mail className={`w-4 h-4 ${sendEmail ? 'text-neon-cyan' : 'text-slate-500'}`} />
                <span className={`text-sm font-semibold ${sendEmail ? 'text-white' : 'text-slate-300'}`}>Email</span>
              </label>
              <label className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all border ${
                sendWhatsApp ? 'bg-neon-green/10 border-neon-green/30' : 'border-transparent hover:bg-white/[0.04]'
              }`}>
                <input
                  type="checkbox"
                  checked={sendWhatsApp}
                  onChange={(e) => setSendWhatsApp(e.target.checked)}
                  className="w-4 h-4 accent-neon-green"
                />
                <MessageSquare className={`w-4 h-4 ${sendWhatsApp ? 'text-neon-green' : 'text-slate-500'}`} />
                <span className={`text-sm font-semibold ${sendWhatsApp ? 'text-white' : 'text-slate-300'}`}>WhatsApp</span>
              </label>
            </div>
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!subject.trim() || !message.trim() || sending || (!sendEmail && !sendWhatsApp)}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
              subject.trim() && message.trim() && !sending && (sendEmail || sendWhatsApp)
                ? 'bg-neon-amber/15 text-neon-amber border border-neon-amber/40 hover:bg-neon-amber/20'
                : 'bg-white/[0.03] text-slate-500 border border-white/[0.06] cursor-not-allowed'
            }`}
          >
            {sending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Sending Broadcast...</>
            ) : (
              <><Send className="w-4 h-4" /> Send Broadcast</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
