'use client';

import { AuthProvider } from '@/components/auth/auth-provider';
import { Toaster } from '@/components/ui/toaster';
import { SessionGuard } from '@/components/auth/session-guard';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <Toaster />
      <SessionGuard />
    </AuthProvider>
  );
}
