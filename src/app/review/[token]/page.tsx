'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Project } from '@/lib/types';

export default function ClientReviewPage() {
  const params = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from('projects')
      .select('*')
      .eq('review_token', params.token)
      .single()
      .then(({ data }) => {
        setProject(data as Project);
        setLoading(false);
      });
  }, [params.token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="skeleton h-8 w-48 rounded" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-center">
          <p className="text-4xl mb-4">🔗</p>
          <p className="text-text-secondary">ลิงก์ไม่ถูกต้องหรือหมดอายุ</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold">{project.title}</h1>
          <p className="text-text-secondary text-sm">ตรวจสอบและแก้ไขซับไตเติล</p>
        </div>

        <div className="bg-white rounded-xl border border-border p-6">
          {project.subtitles.map((sub, i) => (
            <div key={sub.id} className="flex gap-3 py-3 border-b border-border last:border-0">
              <span className="text-xs text-muted w-16 shrink-0 pt-1">
                {sub.start.toFixed(1)}s
              </span>
              <div className="flex-1">
                <p className="text-sm">{sub.text}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted mt-6">
          จัดทำโดย SubZeed — สร้างซับไตเติลภาษาไทยอัตโนมัติ
        </p>
      </div>
    </div>
  );
}
