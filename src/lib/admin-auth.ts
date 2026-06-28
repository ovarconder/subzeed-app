import { NextRequest } from 'next/server';
import { createServiceSupabase } from './supabase/server';

/**
 * verifyAdmin — ตรวจสอบสิทธิ์ Admin จาก header x-user-id
 *
 * วิธีใช้: แทนที่ createServerSupabase().getSession() ใน API routes
 *
 * ```ts
 * const userId = await verifyAdmin(request);
 * // ถ้าไม่ throws → มีสิทธิ์
 * ```
 *
 * throws Error('Unauthorized') หรือ Error('Forbidden: Admin only')
 * ถ้าไม่ผ่าน
 */
export async function verifyAdmin(request: NextRequest): Promise<string> {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const adminSupabase = createServiceSupabase();
  const { data: profile, error } = await adminSupabase
    .from('profiles')
    .select('is_super_admin, email')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    throw new Error('Unauthorized');
  }

  if (profile.is_super_admin !== true && profile.email !== 'overconda@gmail.com') {
    throw new Error('Forbidden: Admin only');
  }

  return userId;
}
