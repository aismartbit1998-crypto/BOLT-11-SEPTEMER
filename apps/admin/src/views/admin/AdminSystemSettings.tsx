import { useState, useEffect } from 'react';
import { Settings, Save, Palette, Globe, Bell, ShieldCheck, Check, Loader2, BrainCircuit } from 'lucide-react';
import { supabase, type SystemSettings } from '@cortex/shared/lib/supabase';

export default function AdminSystemSettings() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [appName, setAppName] = useState('Cortex AI');
  const [tagline, setTagline] = useState('AI-Powered Crypto Trading Platform');
  const [primaryColor, setPrimaryColor] = useState('cyan');
  const [accentColor, setAccentColor] = useState('green');
  const [supportEmail, setSupportEmail] = useState('support@cortexai.io');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [twoFactor, setTwoFactor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.from('system_settings').select('*').limit(1).maybeSingle().then(({ data }) => {
      if (!mounted) return;
      const s = data as SystemSettings | null;
      setSettings(s);
      if (s) {
        setAppName(s.app_name);
        setTagline(s.tagline);
        setPrimaryColor(s.primary_color || 'cyan');
        setAccentColor(s.accent_color || 'green');
        setSupportEmail(s.support_email);
        setMaintenanceMode(s.maintenance_mode);
        setEmailAlerts(s.email_alerts);
        setTwoFactor(s.two_factor);
      }
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    if (settings) {
      await supabase.from('system_settings').update({
        app_name: appName,
        tagline,
        primary_color: primaryColor,
        accent_color: accentColor,
        support_email: supportEmail,
        maintenance_mode: maintenanceMode,
        email_alerts: emailAlerts,
        two_factor: twoFactor,
        updated_at: new Date().toISOString(),
      }).eq('id', settings.id);
    } else {
      const { data } = await supabase.from('system_settings').insert({
        app_name: appName,
        tagline,
        primary_color: primaryColor,
        accent_color: accentColor,
        support_email: supportEmail,
        maintenance_mode: maintenanceMode,
        email_alerts: emailAlerts,
        two_factor: twoFactor,
      }).select('*').maybeSingle();
      setSettings(data as SystemSettings | null);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const colorOptions = [
    { id: 'cyan', color: '#00e5ff' },
    { id: 'green', color: '#00ff9d' },
    { id: 'amber', color: '#ffb020' },
    { id: 'red', color: '#ff3b5c' },
  ];

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-neon-cyan animate-spin" /></div>;
  }

  return (
    <div className="space-y-5 animate-slide-up max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2"><Settings className="w-5 h-5 text-neon-cyan" /> System Settings</h2>
        <p className="text-sm text-slate-400">App editing, white-labeling, and platform configuration</p>
      </div>

      <div className="glass-card p-5">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Palette className="w-4 h-4 text-neon-cyan" /> White-Label & Branding</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block font-semibold">App Name</label>
            <div className="relative">
              <BrainCircuit className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input value={appName} onChange={e => setAppName(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-cyan/40 transition-colors" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block font-semibold">Tagline</label>
            <input value={tagline} onChange={e => setTagline(e.target.value)} className="w-full px-4 py-2.5 rounded-xl glass text-sm text-white focus:outline-none focus:border-neon-cyan/40 transition-colors" />
          </div>
        </div>
        <div className="mt-4">
          <label className="text-xs text-slate-400 mb-2 block font-semibold">Theme Colors</label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-slate-500 mb-2">Primary Color</p>
              <div className="flex gap-2">
                {colorOptions.map(c => (
                  <button key={c.id} onClick={() => setPrimaryColor(c.id)} className={`w-10 h-10 rounded-xl border-2 transition-all ${primaryColor === c.id ? 'scale-110 border-white' : 'border-transparent'}`} style={{ backgroundColor: c.color, boxShadow: primaryColor === c.id ? `0 0 15px ${c.color}` : 'none' }} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 mb-2">Accent Color</p>
              <div className="flex gap-2">
                {colorOptions.map(c => (
                  <button key={c.id} onClick={() => setAccentColor(c.id)} className={`w-10 h-10 rounded-xl border-2 transition-all ${accentColor === c.id ? 'scale-110 border-white' : 'border-transparent'}`} style={{ backgroundColor: c.color, boxShadow: accentColor === c.id ? `0 0 15px ${c.color}` : 'none' }} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 p-4 rounded-xl bg-base-800/50 border border-white/[0.06]">
          <p className="text-[10px] text-slate-500 mb-2">Live Preview</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl border flex items-center justify-center" style={{ borderColor: colorOptions.find(c => c.id === primaryColor)?.color + '60', background: colorOptions.find(c => c.id === primaryColor)?.color + '15' }}>
              <BrainCircuit className="w-5 h-5" style={{ color: colorOptions.find(c => c.id === primaryColor)?.color }} />
            </div>
            <div>
              <h4 className="text-sm font-bold" style={{ color: colorOptions.find(c => c.id === primaryColor)?.color }}>{appName}</h4>
              <p className="text-[10px] text-slate-500">{tagline}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-5">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Globe className="w-4 h-4 text-neon-green" /> Platform Configuration</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
            <div><p className="text-sm font-semibold text-white">Support Email</p><p className="text-[10px] text-slate-500">Displayed in Help Center and contact pages</p></div>
            <input value={supportEmail} onChange={e => setSupportEmail(e.target.value)} className="px-3 py-2 rounded-lg glass text-xs text-white font-mono focus:outline-none focus:border-neon-cyan/40 w-56" />
          </div>
          <ToggleRow label="Maintenance Mode" desc="Take the platform offline for updates" icon={Settings} enabled={maintenanceMode} onToggle={() => setMaintenanceMode(!maintenanceMode)} />
          <ToggleRow label="Email Alerts" desc="Send admin email notifications for critical events" icon={Bell} enabled={emailAlerts} onToggle={() => setEmailAlerts(!emailAlerts)} />
          <ToggleRow label="Two-Factor Authentication" desc="Require 2FA for all admin accounts" icon={ShieldCheck} enabled={twoFactor} onToggle={() => setTwoFactor(!twoFactor)} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {saved && <span className="flex items-center gap-1.5 text-xs text-neon-green animate-fade-in"><Check className="w-4 h-4" /> Settings saved successfully</span>}
        <button onClick={handleSave} disabled={saving} className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${saving ? 'bg-white/[0.05] text-slate-400 cursor-wait' : 'bg-gradient-to-r from-neon-cyan/20 to-neon-green/20 text-white border border-neon-cyan/40 hover:from-neon-cyan/30 hover:to-neon-green/30 neon-glow-cyan hover:scale-[1.02]'}`}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, icon: Icon, enabled, onToggle }: {
  label: string; desc: string; icon: typeof Settings; enabled: boolean; onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
      <div className="flex items-center gap-3">
        <Icon className={`w-4 h-4 ${enabled ? 'text-neon-green' : 'text-slate-500'}`} />
        <div><p className="text-sm font-semibold text-white">{label}</p><p className="text-[10px] text-slate-500">{desc}</p></div>
      </div>
      <button onClick={onToggle} className={`relative w-12 h-6 rounded-full transition-all duration-200 ${enabled ? 'bg-neon-green/30' : 'bg-white/[0.08]'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-all duration-200 ${enabled ? 'translate-x-6 bg-neon-green neon-glow-green' : 'bg-slate-500'}`} />
      </button>
    </div>
  );
}
