'use client';

import { TierBadge, QuotaBar } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Profile } from '@/lib/types';

interface Props {
  users: Profile[];
  onUpdateTier: (userId: string, tier: string) => void;
  onUnblock: (userId: string) => void;
}

export default function UsersTable({ users, onUpdateTier, onUnblock }: Props) {
  if (users.length === 0) {
    return <p className="py-8 text-center text-text-secondary">ไม่มีข้อมูล</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 font-medium text-text-secondary">อีเมล</th>
            <th className="text-left py-3 px-4 font-medium text-text-secondary">Tier</th>
            <th className="text-left py-3 px-4 font-medium text-text-secondary">โควตา</th>
            <th className="text-left py-3 px-4 font-medium text-text-secondary">Abuser</th>
            <th className="text-left py-3 px-4 font-medium text-text-secondary">รอบบิล</th>
            <th className="text-left py-3 px-4 font-medium text-text-secondary">จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-border hover:bg-white/50">
              <td className="py-3 px-4">
                <span className="font-medium">{u.email}</span>
              </td>
              <td className="py-3 px-4">
                <TierBadge tier={u.tier} />
              </td>
              <td className="py-3 px-4">
                <div className="max-w-[180px]">
                  <QuotaBar used={u.quota_minutes_used} total={u.quota_minutes_total} />
                </div>
              </td>
              <td className="py-3 px-4">
                {(u as any).is_quota_abuser ? (
                  <span className="text-danger font-medium">🚫 ใช่</span>
                ) : (
                  <span className="text-text-secondary">—</span>
                )}
              </td>
              <td className="py-3 px-4 text-xs text-text-secondary">
                {new Date(u.billing_cycle_end).toLocaleDateString('th-TH')}
              </td>
              <td className="py-3 px-4">
                <div className="flex gap-2">
                  <select
                    className="text-xs rounded border border-border px-2 py-1"
                    value={u.tier}
                    onChange={(e) => onUpdateTier(u.id, e.target.value)}
                  >
                    <option value="free">Free</option>
                    <option value="basic">Basic</option>
                    <option value="premium">Premium</option>
                    <option value="business_starter">Business Starter</option>
                    <option value="business_pro">Business Pro</option>
                  </select>
                  {(u as any).is_quota_abuser && (
                    <Button size="sm" variant="outline" onClick={() => onUnblock(u.id)}>
                      ปลดล็อก
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
