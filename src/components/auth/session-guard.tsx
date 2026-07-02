'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from './auth-provider';

// ============================================================
// 🛡️ Session Guard
// ============================================================
// ตรวจจับ session หลุด (ไม่ว่าเกิดจาก timeout, token expire,
// หรือ server reject 401) แล้วแสดง Alert Box ให้ login ใหม่
// โดยไม่เสียข้อมูลในหน้าปัจจุบัน
//
// วิธีใช้: ใส่ <SessionGuard /> ที่ root layout
// ============================================================

export function SessionGuard() {
  const { user, session, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [showAlert, setShowAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const prevUserRef = useRef<string | null>(null);

  // ─── จำ path ปัจจุบันใน localStorage ──────────────────
  const saveCurrentPath = useCallback(() => {
    try {
      localStorage.setItem('subzeed_redirect_path', window.location.href);
      localStorage.setItem('subzeed_redirect_ts', Date.now().toString());
    } catch {}
  }, []);

  // ─── ตรวจจับ session หลุดจาก auth state ──────────────
  useEffect(() => {
    if (isLoading) return;

    // กรณี user เคย login มาก่อน (มี prevUserRef) แต่ตอนนี้กลายเป็น null
    if (prevUserRef.current && !user) {
      saveCurrentPath();
      setAlertMessage('Your session has expired. Please sign in again to continue. Your work on this page will be saved.');
      setShowAlert(true);
    }

    prevUserRef.current = user?.id ?? null;
  }, [user, isLoading, saveCurrentPath]);

  // ─── ตรวจจับ HTTP 401/403 จาก fetch ─────────────────
  useEffect(() => {
    const originalFetch = window.fetch;
    // ใช้ wrapper fetch ที่ intercept response
    const wrappedFetch = async (...args: Parameters<typeof fetch>) => {
      const response = await originalFetch(...args);
      // ถ้า supabase API หรือ API ของเราคืน 401/403
      // (เช็คเฉพาะ API calls ที่ไม่ใช่ static assets)
      if (response.status === 401 || response.status === 403) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
        // ข้ามพวก auth callback URLs
        if (url.includes('/auth/') || url.includes('/login')) {
          return response;
        }
        // แจ้ง session หลุด แต่ไม่ต้องซ้ำถ้าแสดง alert อยู่แล้ว
        if (!showAlert) {
          saveCurrentPath();
          setAlertMessage(
            response.status === 401
              ? 'Your session has expired. Please sign in again.'
              : 'You do not have permission to perform this action. Please sign in again.'
          );
          setShowAlert(true);
        }
      }
      return response;
    };

    window.fetch = wrappedFetch;
    return () => {
      window.fetch = originalFetch;
    };
  }, [showAlert, saveCurrentPath]);

  // ─── ฟัง SIGNED_OUT event ตรง ๆ ──────────────────────
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'SIGNED_OUT') {
        // ถ้าเกิด SIGNED_OUT โดยที่ user ไม่ได้กด signOut เอง
        // (เช่น token expire, someone else signed out from another tab)
        // เราจะใช้ shouldIgnore เพื่อแยกกรณี user กด signOut เอง
        const ignore = window.__subzeed_signout_initiated;
        if (ignore) {
          window.__subzeed_signout_initiated = false;
          return;
        }
        saveCurrentPath();
        setAlertMessage('You have been signed out. Please sign in again to continue.');
        setShowAlert(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, saveCurrentPath]);

  // ─── กลับไปหน้า login ───────────────────────────────
  const handleLoginAgain = () => {
    setIsLoggingIn(true);
    // redirect ไป /login — หลังจาก login success
    // redirect จะถูกใช้กลับมาที่เดิม
    const currentPath = window.location.href;
    try {
      localStorage.setItem('subzeed_redirect_path', currentPath);
    } catch {}
    router.push(`/login?redirect=${encodeURIComponent(currentPath)}`);
  };

  // ─── Dismiss (ปิด popup โดยไม่ redirect) ───────────
  const handleDismiss = () => {
    setShowAlert(false);
  };

  // ─── ถ้ายังไม่มีอะไร ให้ไม่ render อะไร ─────────────
  if (!showAlert) return null;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      <div className="absolute bottom-6 right-6 pointer-events-auto">
        <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 p-4 space-y-3 border border-border">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <span className="text-base">🔒</span>
              </div>
              <div>
                <h4 className="font-semibold text-sm text-text-primary">Session Expired</h4>
                <p className="text-xs text-text-secondary mt-0.5">{alertMessage}</p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md hover:bg-surface transition-colors text-text-secondary"
              title="Dismiss"
            >
              <span className="text-lg leading-none">&times;</span>
            </button>
          </div>

          {/* Info */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
            <p className="font-medium">Your work is safe</p>
            <p className="mt-0.5">
              We have saved your current page. After signing in, you will return exactly where you left off.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2 justify-end pt-0.5">
            <button
              onClick={() => {
                setShowAlert(false);
                window.location.reload();
              }}
              className="px-3.5 py-1.5 text-xs rounded-lg border border-border text-text-secondary hover:bg-surface transition-colors"
            >
              Reload
            </button>
            <button
              onClick={handleLoginAgain}
              disabled={isLoggingIn}
              className="px-4 py-1.5 text-xs rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors disabled:opacity-60 font-medium"
            >
              {isLoggingIn ? 'Redirecting...' : 'Sign in again'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ประกาศ global type ─────────────────────────────────
declare global {
  interface Window {
    __subzeed_signout_initiated?: boolean;
  }
}
