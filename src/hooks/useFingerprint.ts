'use client';

import { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';

/**
 * useFingerprint
 *
 * Custom React Hook สำหรับดึงค่า Browser Fingerprint (visitorId)
 * ใช้ @fingerprintjs/fingerprintjs เพื่อสร้าง identifier ที่ไม่ซ้ำกัน
 * สำหรับป้องกันผู้ใช้เปลี่ยน Email มาสมัครใหม่เพื่อใช้โควตาฟรีซ้ำ
 *
 * Usage:
 *   const { fingerprint, isLoading, error } = useFingerprint();
 */
interface UseFingerprintResult {
  fingerprint: string | null;
  isLoading: boolean;
  error: string | null;
}

// Lazy load FingerprintJS (client-side only)
let fpPromise: Promise<any> | null = null;

function getFingerprintJS() {
  if (typeof window === 'undefined') return null;
  if (!fpPromise) {
    fpPromise = import('@fingerprintjs/fingerprintjs').then((FingerprintJS) =>
      FingerprintJS.load()
    );
  }
  return fpPromise;
}

export function useFingerprint(): UseFingerprintResult {
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    // ป้องกันการเรียกซ้ำใน StrictMode
    if (hasFetched.current) return;
    hasFetched.current = true;

    const fpLib = getFingerprintJS();

    if (!fpLib) {
      setError('ไม่สามารถเรียก FingerprintJS ได้ (อาจไม่ได้รันบน Browser)');
      setIsLoading(false);
      return;
    }

    fpLib
      .then((fp) => fp.get())
      .then((result: { visitorId: string }) => {
        setFingerprint(result.visitorId);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : 'Unknown fingerprint error';
        console.error('[useFingerprint] Error:', message);
        setError(message);
        setIsLoading(false);
      });
  }, []);

  return { fingerprint, isLoading, error };
}

// ============================================================
// ตัวอย่างการใช้งานร่วมกับ API Route
// ============================================================
/*
  // ใน signup form หรือ component ที่ต้องตรวจสอบ:

  import { useFingerprint } from '@/hooks/useFingerprint';
  import { useToast } from '@/components/ui/toaster';

  function SignupPage() {
    const { fingerprint, isLoading: fpLoading, error: fpError } = useFingerprint();
    const { addToast } = useToast();
    const [isAbuser, setIsAbuser] = useState(false);

    const handleSignup = async (email: string, password: string) => {
      if (!fingerprint) {
        addToast('กรุณาอนุญาตให้ระบบ识别 browser', 'warning');
        return;
      }

      const res = await fetch(api('/api/fingerprint/check'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint, email }),
      });

      const data = await res.json();

      if (data.isAbuser) {
        setIsAbuser(true);
        addToast('⚠️ ตรวจพบการสมัครซ้ำ: ไม่สามารถรับโควตาฟรีได้', 'error');
        return;
      }

      // proceed with signup normally...
    };
  }
*/
