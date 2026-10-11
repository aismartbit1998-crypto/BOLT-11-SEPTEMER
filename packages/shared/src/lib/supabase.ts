import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'onepalace-auth',
    detectSessionInUrl: true,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'X-Client-Info': 'onepalace-web',
    },
  },
});

// ─── Types ───────────────────────────────────────────────────────────

export type UserRole = 'master_admin' | 'sub_admin' | 'client';
export type UserStatus = 'active' | 'suspended' | 'banned';

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  permissions: string[] | Record<string, boolean> | null;
  parent_admin_id: string | null;
  license_quota: number;
  quota_ledger: Record<string, { used: number; total: number }> | null;
  country: string | null;
  disclaimer_accepted: boolean;
  disclaimer_accepted_at: string | null;
  created_at: string;
}

export interface AdminRole {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  role: 'master_admin' | 'sub_admin';
  permissions: Record<string, boolean>;
  is_active: boolean;
  license_quota: number;
  quota_ledger: Record<string, { used: number; total: number }> | null;
  last_login: string | null;
  created_at: string;
}

// ─── Auth cache helpers ──────────────────────────────────────────────

/**
 * Clears all auth-related localStorage and sessionStorage entries.
 * Call this before every login or initialization to prevent stale
 * token conflicts from previous sessions.
 */
export function clearAuthCache(): void {
  try {
    // Clear Supabase auth tokens (both old and new storage keys)
    const keysToRemove = [
      'onepalace-auth',
      'sb-nohmueknyboklssiwpqp-auth-token',
      'sb-kzqwsdjmbxpnoptctvvb-auth-token',
      'cortex-auth',
      'MASTER_BYPASS',
      'impersonate_token',
      'impersonate_client_id',
      'impersonate_client_email',
    ];
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
    // Also sweep for any sb-*-auth-token patterns
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        localStorage.removeItem(key);
      }
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Storage may be unavailable (private mode) — safe to ignore
  }
}
