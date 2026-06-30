'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { createClient } from '@/lib/supabase/client';
import { api } from '@/lib/api';

/**
 * SuperAdminSettings — แท็บสำหรับเจ้าของระบบ
 * - ตั้งค่า Super Admin (เพิ่ม/ลบ email)
 * - ดูรายชื่อ Super Admin ปัจจุบัน
 */
export default function SuperAdminSettings() {
  const { addToast } = useToast();
  const supabase = createClient();

  const [superAdmins, setSuperAdmins] = useState<{ id: string; email: string; created_at: string }[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // ─── โหลดรายชื่อ Super Admin ─────────────────────
  const fetchSuperAdmins = async () => {
    try {
      setLoading(true);
      const res = await fetch(api('/api/admin/super-admins'), {
        headers: { 'x-user-id': (await supabase.auth.getUser()).data.user?.id || '' },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setSuperAdmins(data.admins || []);
    } catch (err) {
      console.error('[SuperAdminSettings] fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuperAdmins();
  }, []);

  // ─── เพิ่ม Super Admin ────────────────────────────
  const handleAdd = async () => {
    const email = newAdminEmail.trim().toLowerCase();
    if (!email) return;
    if (!email.includes('@')) {
      addToast('กรุณากรอกอีเมลให้ถูกต้อง', 'error');
      return;
    }
    if (superAdmins.some((a) => a.email === email)) {
      addToast('อีเมลนี้เป็น Super Admin อยู่แล้ว', 'warning');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(api('/api/admin/super-admins'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': (await supabase.auth.getUser()).data.user?.id || '',
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');

      addToast(`✅ ${email} กลายเป็น Super Admin แล้ว`, 'success');
      setNewAdminEmail('');
      fetchSuperAdmins();
    } catch (err: any) {
      addToast(`❌ ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── ลบ Super Admin ──────────────────────────────
  const handleRemove = async (adminId: string, email: string) => {
    if (!confirm(`แน่ใจว่าต้องการถอดสิทธิ์ Super Admin ของ "${email}"?`)) return;

    setRemovingId(adminId);
    try {
      const res = await fetch(api('/api/admin/super-admins'), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': (await supabase.auth.getUser()).data.user?.id || '',
        },
        body: JSON.stringify({ adminId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');

      addToast(`🔒 ถอดสิทธิ์ ${email} เรียบร้อย`, 'success');
      fetchSuperAdmins();
    } catch (err: any) {
      addToast(`❌ ${err.message}`, 'error');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-white p-6">
      <h2 className="text-lg font-semibold mb-1">🔐 Super Admin Settings</h2>
      <p className="text-sm text-text-secondary mb-6">
        จัดการสิทธิ์ผู้ดูแลระบบสูงสุด — สามารถเพิ่มอีเมลอื่นให้เป็น Super Admin ได้
      </p>

      {/* ─── Add Form ─────────────────────────────────── */}
      <div className="flex items-end gap-3 mb-8 p-4 rounded-lg bg-surface border border-border">
        <div className="flex-1">
          <label className="block text-xs text-text-secondary font-medium mb-1">อีเมลผู้ใช้ที่ต้องการตั้งเป็น Super Admin</label>
          <input
            type="email"
            value={newAdminEmail}
            onChange={(e) => setNewAdminEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-white"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
        </div>
        <Button onClick={handleAdd} disabled={saving || !newAdminEmail.trim()}>
          {saving ? 'กำลังเพิ่ม...' : '➕ เพิ่ม'}
        </Button>
      </div>

      {/* ─── Current List ────────────────────────────── */}
      <h3 className="text-sm font-semibold mb-3">Super Admin ปัจจุบัน ({superAdmins.length} คน)</h3>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-surface skeleton" />
          ))}
        </div>
      ) : superAdmins.length === 0 ? (
        <p className="text-sm text-text-secondary py-4 text-center">ยังไม่มี Super Admin (คุณ overconda@gmail.com จะโดน bypass เสมอ)</p>
      ) : (
        <div className="space-y-2">
          {superAdmins.map((admin) => (
            <div
              key={admin.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3"
            >
              <div>
                <span className="text-sm font-medium">{admin.email}</span>
                <span className="text-xs text-text-secondary ml-2">
                  — ตั้งแต่ {new Date(admin.created_at).toLocaleDateString('th-TH')}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-danger border-danger hover:bg-danger/10"
                disabled={removingId === admin.id}
                onClick={() => handleRemove(admin.id, admin.email)}
              >
                {removingId === admin.id ? '...' : '🔒 ถอดสิทธิ์'}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 p-3 rounded-lg bg-warning/5 border border-warning/20 text-xs text-text-secondary">
        <p className="font-medium text-warning mb-1">⚠️ คำเตือน</p>
        <p>Super Admin สามารถเข้าถึงข้อมูลผู้ใช้ทั้งหมด แก้ไขแพ็กเกจ และตั้งค่าระบบได้ ควรให้เฉพาะคนที่ไว้ใจเท่านั้น</p>
        <p className="mt-1">อีเมล <strong>overconda@gmail.com</strong> จะเป็น Super Admin เสมอ ไม่สามารถลบได้</p>
      </div>
    </div>
  );
}
