import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@cortex/shared/context/AuthContext';
import type { UserRole } from '@cortex/shared/lib/supabase';

interface AdminRbac {
  role: UserRole;
  permissions: string[];
  isMasterAdmin: boolean;
  isSubAdmin: boolean;
  licenseQuota: number;
  hasPermission: (perm: string) => boolean;
  loading: boolean;
}

const AdminRbacContext = createContext<AdminRbac | null>(null);

export function AdminRbacProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(!profile);
  }, [profile]);

  // Fail CLOSED: default to 'client' (no access) when profile is null.
  // Previously this defaulted to 'master_admin' which was a privilege escalation bug.
  const role: UserRole = profile?.role ?? 'client';
  const rawPermissions = profile?.permissions;
  const permissions: string[] = Array.isArray(rawPermissions)
    ? rawPermissions
    : rawPermissions && typeof rawPermissions === 'object'
      ? Object.keys(rawPermissions).filter(k => (rawPermissions as Record<string, boolean>)[k])
      : [];
  const isMasterAdmin = role === 'master_admin';
  const isSubAdmin = role === 'sub_admin';
  const licenseQuota = profile?.license_quota ?? 0;

  const hasPermission = (perm: string): boolean => {
    if (isMasterAdmin) return true;
    if (!isSubAdmin) return false;
    return permissions.includes(perm);
  };

  return (
    <AdminRbacContext.Provider value={{ role, permissions, isMasterAdmin, isSubAdmin, licenseQuota, hasPermission, loading }}>
      {children}
    </AdminRbacContext.Provider>
  );
}

export function useAdminRbac() {
  const ctx = useContext(AdminRbacContext);
  if (!ctx) throw new Error('useAdminRbac must be used within AdminRbacProvider');
  return ctx;
}
