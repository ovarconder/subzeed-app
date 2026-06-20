'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SocialLogin } from '@/components/auth/social-login';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message === 'Invalid login credentials' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : err.message);
      setLoading(false);
      return;
    }

    const redirect = searchParams.get('redirect') || '/dashboard';
    router.push(redirect);
  };

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <Link href="/" className="text-2xl font-bold text-primary">SubZeed</Link>
        <p className="mt-2 text-text-secondary">เข้าสู่ระบบเพื่อใช้งาน</p>
      </div>

      {/* Social Login */}
      <div className="mb-6">
        <SocialLogin />
      </div>

      {/* Divider */}
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-text-secondary">หรือเข้าสู่ระบบด้วยอีเมล</span>
        </div>
      </div>

      <form onSubmit={handleLogin} className="rounded-xl border border-border bg-white p-6 space-y-4">
        <Input label="อีเมล" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input label="รหัสผ่าน" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" loading={loading} className="w-full">เข้าสู่ระบบ</Button>
      </form>

      <p className="mt-4 text-center text-sm text-text-secondary">
        ยังไม่มีบัญชี?{' '}
        <Link href="/signup" className="text-primary font-medium hover:underline">สมัครใช้งาน</Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <Suspense fallback={<div className="text-text-secondary">กำลังโหลด...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
