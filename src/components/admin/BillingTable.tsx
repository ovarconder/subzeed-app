'use client';

import type { BillingHistory } from '@/lib/types';

interface Props {
  billing: BillingHistory[];
}

export default function BillingTable({ billing }: Props) {
  if (billing.length === 0) {
    return <p className="py-8 text-center text-text-secondary">ไม่มีประวัติธุรกรรม</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 font-medium text-text-secondary">ผู้ใช้</th>
            <th className="text-left py-3 px-4 font-medium text-text-secondary">Action</th>
            <th className="text-left py-3 px-4 font-medium text-text-secondary">Tier</th>
            <th className="text-left py-3 px-4 font-medium text-text-secondary">จำนวนเงิน</th>
            <th className="text-left py-3 px-4 font-medium text-text-secondary">เลขที่ใบเสร็จ</th>
            <th className="text-left py-3 px-4 font-medium text-text-secondary">วันที่</th>
            <th className="text-left py-3 px-4 font-medium text-text-secondary">ดาวน์โหลด</th>
          </tr>
        </thead>
        <tbody>
          {billing.map((b) => (
            <tr key={b.id} className="border-b border-border hover:bg-white/50">
              <td className="py-3 px-4 font-medium">{b.user_id?.slice(0, 8)}...</td>
              <td className="py-3 px-4">
                <span className="capitalize">{b.action_type.replace('_', ' ')}</span>
              </td>
              <td className="py-3 px-4">
                {b.previous_tier} → {b.new_tier}
              </td>
              <td className="py-3 px-4 font-semibold">{b.amount_thb.toLocaleString()}.-</td>
              <td className="py-3 px-4 text-xs text-text-secondary">
                {b.invoice_number || '—'}
              </td>
              <td className="py-3 px-4 text-xs text-text-secondary">
                {new Date(b.created_at).toLocaleDateString('th-TH')}
              </td>
              <td className="py-3 px-4">
                <a
                  href={`/api/invoice/${b.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  📄 ใบเสร็จ
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
