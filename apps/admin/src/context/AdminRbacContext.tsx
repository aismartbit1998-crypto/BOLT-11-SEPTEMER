import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@cortex/shared/context/AuthContext';
import type { Profile, UserRole } from '@cortex/shared/lib/supabase';

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

  const role: UserRole = profile?.role ?? 'master_admin';
  const permissions: string[] = profile?.permissions ?? [];
  const isMasterAdmin = role === 'master_admin';
  const isSubAdmin = role === 'sub_admin';
  const licenseQuota = profile?.license_quota ?? 0;

  const hasPermission = (perm: string): boolean => {
    if (isMasterAdmin) return true;
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
