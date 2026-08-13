'use client';

import { AuthProvider } from '@/components/auth/auth-provider';
import { ToastProvider } from '@/components/ui/toaster';
import { SessionGuard } from '@/components/auth/session-guard';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        {children}
      </ToastProvider>
      <SessionGuard />
    </AuthProvider>
  );
}
