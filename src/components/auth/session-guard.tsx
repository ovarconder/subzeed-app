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
    // redirect ไป /auth/login — หลังจาก login success
    // redirect_to จะถูกใช้กลับมาที่เดิม
    const currentPath = window.location.href;
    try {
      localStorage.setItem('subzeed_redirect_path', currentPath);
    } catch {}
    router.push(`/auth/login?redirect_to=${encodeURIComponent(currentPath)}`);
  };

  // ─── ถ้ายังไม่มีอะไร ให้ไม่ render อะไร ─────────────
  if (!showAlert) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6 space-y-4">
        {/* Icon */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <span className="text-xl">🔒</span>
          </div>
          <div>
            <h3 className="font-semibold text-base text-text-primary">Session Expired</h3>
            <p className="text-sm text-text-secondary mt-1">
              {alertMessage}
            </p>
          </div>
        </div>

        {/* Info */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          <p className="font-medium">Your work is safe 👍</p>
          <p className="mt-0.5">
            We have saved your current page. After signing in, you will return exactly where you left off.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 justify-end pt-1">
          <button
            onClick={() => {
              setShowAlert(false);
              // refresh page — ถ้า session กลับมาแล้วจะหาย
              window.location.reload();
            }}
            className="px-4 py-2 text-sm rounded-lg border border-border text-text-secondary hover:bg-surface transition-colors"
          >
            Reload (try again)
          </button>
          <button
            onClick={handleLoginAgain}
            disabled={isLoggingIn}
            className="px-5 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors disabled:opacity-60 font-medium"
          >
            {isLoggingIn ? 'Redirecting...' : 'Sign in again'}
          </button>
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
