'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFingerprint } from '@/hooks/useFingerprint';
import { useToast } from '@/components/ui/toaster';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isAbuser, setIsAbuser] = useState(false);

  const router = useRouter();
  const supabase = createClient();
  const { addToast } = useToast();
  const { fingerprint, isLoading: fpLoading, error: fpError } = useFingerprint();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      setLoading(false);
      return;
    }

    // === ขั้นที่ 1: ตรวจสอบ Browser Fingerprint ก่อนสมัคร ===
    if (!fingerprint && !fpError) {
      setError('กำลังตรวจสอบอุปกรณ์... กรุณาลองอีกครั้ง');
      setLoading(false);
      return;
    }

    if (fingerprint) {
      try {
        const checkRes = await fetch('/api/fingerprint/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fingerprint, email, action: 'signup' }),
        });
        const checkData = await checkRes.json();

        if (checkData.isAbuser) {
          setIsAbuser(true);
          addToast('⚠️ อุปกรณ์นี้เคยใช้โควตาฟรีไปแล้ว', 'error');
          setError('ไม่สามารถสมัครรับโควตาฟรีซ้ำได้');
          setLoading(false);
          return;
        }
      } catch {
        console.warn('[signup] Fingerprint check failed — allowing signup');
      }
    }

    // === ขั้นที่ 2: สมัครสมาชิก ===
    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { tier: 'free' } },
    });

    if (signupError) {
      setError(signupError.message);
      setLoading(false);
      return;
    }

    // === ขั้นที่ 3: บันทึก fingerprint หลังสมัครสำเร็จ ===
    if (data.user && fingerprint) {
      try {
        await fetch('/api/fingerprint/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fingerprint, email, userId: data.user.id }),
        });
      } catch {
        console.warn('[signup] Failed to register fingerprint');
      }
    }

    addToast('สมัครสมาชิกสำเร็จ 🎉', 'success');
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-primary">SubZeed</Link>
          <p className="mt-2 text-text-secondary">สมัครใช้งานฟรี</p>
        </div>

        <form onSubmit={handleSignup} className="rounded-xl border border-border bg-white p-6 space-y-4">
          <Input label="อีเมล" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="รหัสผ่าน" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />

          {isAbuser && (
            <div className="rounded-lg bg-danger/10 border border-danger/20 p-3 text-sm text-danger">
              <p className="font-semibold">🚫 ตรวจพบการสมัครซ้ำ</p>
              <p className="mt-1">อุปกรณ์นี้เคยใช้โควตาฟรีไปแล้ว หากต้องการใช้งานต่อ กรุณาสมัครแพ็กเกจแบบเสียเงิน</p>
            </div>
          )}

          {fpLoading && (
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              กำลังตรวจสอบความปลอดภัยของอุปกรณ์...
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" loading={loading} className="w-full" disabled={isAbuser}>
            สมัครใช้งาน
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-text-secondary">
          มีบัญชีอยู่แล้ว?{' '}
          <Link href="/login" className="text-primary font-medium hover:underline">เข้าสู่ระบบ</Link>
        </p>
      </div>
    </div>
  );
}
