'use client';

interface FingerprintRecord {
  id: string;
  fingerprint: string;
  user_id: string;
  email: string;
  action: string;
  ip_address: string | null;
  blocked: boolean;
  created_at: string;
}

interface Props {
  fingerprints: FingerprintRecord[];
}

export default function FingerprintsTable({ fingerprints }: Props) {
  if (fingerprints.length === 0) {
    return <p className="py-8 text-center text-text-secondary">ไม่มีข้อมูล</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 font-medium text-text-secondary">Fingerprint</th>
            <th className="text-left py-3 px-4 font-medium text-text-secondary">อีเมล</th>
            <th className="text-left py-3 px-4 font-medium text-text-secondary">Action</th>
            <th className="text-left py-3 px-4 font-medium text-text-secondary">IP</th>
            <th className="text-left py-3 px-4 font-medium text-text-secondary">บล็อก</th>
            <th className="text-left py-3 px-4 font-medium text-text-secondary">วันที่</th>
          </tr>
        </thead>
        <tbody>
          {fingerprints.map((f) => (
            <tr key={f.id} className="border-b border-border hover:bg-white/50">
              <td className="py-3 px-4 font-mono text-xs">{f.fingerprint.slice(0, 20)}...</td>
              <td className="py-3 px-4">{f.email}</td>
              <td className="py-3 px-4 capitalize">{f.action}</td>
              <td className="py-3 px-4 text-xs text-text-secondary">{f.ip_address || '—'}</td>
              <td className="py-3 px-4">
                {f.blocked ? (
                  <span className="text-danger font-medium">🔴 ใช่</span>
                ) : (
                  <span className="text-success font-medium">🟢 ไม่</span>
                )}
              </td>
              <td className="py-3 px-4 text-xs text-text-secondary">
                {new Date(f.created_at).toLocaleDateString('th-TH')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
