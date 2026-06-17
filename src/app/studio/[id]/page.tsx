'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Navbar } from '@/components/layout/navbar';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/auth-provider';
import { useSubtitleStore } from '@/lib/store/subtitle-store';
import { useToast } from '@/components/ui/toaster';
import type { Project } from '@/lib/types';

export default function StudioEditPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();
  const { addToast } = useToast();
  const store = useSubtitleStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProject = async () => {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .eq('id', params.id)
        .single();
      if (data) {
        store.setCurrentProject(data as Project);
      } else {
        addToast('ไม่พบโปรเจกต์', 'error');
        router.push('/dashboard');
      }
      setLoading(false);
    };
    fetchProject();
  }, [params.id]);

  const handleSave = async () => {
    if (!user || !store.currentProject) return;
    const { error } = await supabase
      .from('projects')
      .update({
        subtitles: store.subtitles,
        title: store.currentProject.title,
        updated_at: new Date().toISOString(),
      })
      .eq('id', store.currentProject.id);

    if (error) {
      addToast('บันทึกไม่สำเร็จ', 'error');
    } else {
      addToast('บันทึกสำเร็จ ✅', 'success');
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="skeleton h-8 w-32 rounded" />
        </div>
      </>
    );
  }

  const currentSub = store.subtitles.find(
    (s) => store.currentTime >= s.start && store.currentTime <= s.end
  );

  return (
    <>
      <Navbar />
      <main className="flex-1 flex">
        {/* Video Preview (simplified) */}
        <div className="flex-1 flex flex-col">
          <div className="border-b border-border bg-surface px-4 py-2 flex items-center gap-3">
            <span className="font-medium text-sm">{store.currentProject?.title}</span>
            <Button size="sm" variant="outline" onClick={handleSave}>💾 บันทึก</Button>
            <Button size="sm" variant="outline" onClick={() => router.push('/dashboard')}>
              ← กลับ
            </Button>
          </div>
          <div className="flex-1 bg-black flex items-center justify-center">
            <div className="text-white/60 text-center">
              <p className="text-4xl mb-2">📝</p>
              <p>โปรเจกต์โหลดแล้ว • {store.subtitles.length} รายการ</p>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 border-l border-border bg-white flex flex-col">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-sm">ซับไตเติล ({store.subtitles.length})</h3>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {store.subtitles.map((sub, i) => (
              <div key={sub.id} className="p-3 text-sm hover:bg-surface cursor-pointer">
                <div className="text-xs text-muted">#{i + 1} | {sub.start.toFixed(1)}s - {sub.end.toFixed(1)}s</div>
                <p className="line-clamp-2 mt-1">{sub.text}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
