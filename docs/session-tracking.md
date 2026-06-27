# 💾 Session Tracking + Session Expiry Handling

> ระบบบันทึก session การทำงาน + Alert เมื่อ auth หมดอายุ  
> เก็บค่าใน form ก่อน session หมด → login ใหม่ → กลับมาทำต่อ

---

## 🎯 Concept

```
[User กำลังทำงาน]
         ↓
[session expired / 401] ← capture ไว้
         ↓
[Alert Modal] → "เซสชั่นหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง"
         ↓
[save form data ไป localStorage/IndexedDB]
         ↓
[Login Modal/Page] → login สำเร็จ
         ↓
[redirect กลับหน้าเดิม + restore form data]
```

---

## 🧩 Component: `SessionGuard`

### หน้าที่
- ใช้ `onAuthStateChange` ของ Supabase ตรวจจับเมื่อ session หมดอายุ (`SIGNED_OUT` event)
- เมื่อ detected → แสดง Modal Alert
- บันทึก form data (ถ้ามี) ผ่าน callback `onSaveDraft`
- เมื่อ login สำเร็จ → redirect กลับมาหน้าเดิม พร้อม restore draft

### ตัวอย่างการใช้งาน

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal'; // สมมติว่ามี component Modal

interface SessionGuardProps {
  /** callback ก่อน session expire — ให้ component parent save draft */
  onSaveDraft?: () => Promise<void> | void;
  /** unique key สำหรับ draft ใน localStorage */
  draftKey?: string;
  /** children */
  children?: React.ReactNode;
}

export function SessionGuard({ onSaveDraft, draftKey, children }: SessionGuardProps) {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const [returnUrl, setReturnUrl] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        // save draft ก่อน
        if (onSaveDraft) onSaveDraft();
        
        // save return URL
        setReturnUrl(pathname || '/studio');
        
        // save draft ลง localStorage ถ้ามี draftKey
        if (draftKey) {
          // callback จัดการเอง
        }

        setShowExpiredModal(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, pathname, onSaveDraft, draftKey]);

  const handleLogin = () => {
    setShowExpiredModal(false);
    // ไปที่ login page โดยเก็บ returnUrl ไว้
    router.push(`/login?redirect=${encodeURIComponent(returnUrl || '/studio')}`);
  };

  return (
    <>
      {children}
      
      {showExpiredModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 animate-fade-in">
            {/* Icon */}
            <div className="text-center mb-4">
              <span className="text-5xl">⏰</span>
            </div>
            
            {/* Title */}
            <h2 className="text-xl font-bold text-center mb-2">
              เซสชั่นหมดอายุ
            </h2>
            
            {/* Description */}
            <p className="text-text-secondary text-center text-sm mb-6">
              การเชื่อมต่อของคุณหมดอายุแล้ว<br />
              กรุณาเข้าสู่ระบบอีกครั้งเพื่อทำงานต่อ<br />
              <span className="text-warning font-medium">
                ข้อมูลของคุณถูกบันทึกไว้เรียบร้อย ✅
              </span>
            </p>
            
            {/* Buttons */}
            <div className="flex gap-3 justify-center">
              <Button
                onClick={handleLogin}
                className="min-w-[140px] bg-primary hover:bg-primary-dark text-white font-semibold"
              >
                🔑 เข้าสู่ระบบอีกครั้ง
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

---

## 🧩 useDraft — Hook สำหรับ save/restore form data

```typescript
// hooks/use-draft.ts
'use client';

import { useState, useEffect, useCallback } from 'react';

interface DraftOptions<T> {
  key: string;
  initialData: T;
  autoSaveIntervalMs?: number; // auto save ทุกกี่ ms (default 30s)
}

export function useDraft<T extends Record<string, unknown>>({ 
  key, 
  initialData, 
  autoSaveIntervalMs = 30000 
}: DraftOptions<T>) {
  const [data, setData] = useState<T>(initialData);
  const [draftRestored, setDraftRestored] = useState(false);

  // โหลด draft จาก localStorage ตอน mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`draft:${key}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        setData({ ...initialData, ...parsed });
        setDraftRestored(true);
      }
    } catch { /* ignore */ }
  }, [key]);

  // auto save ทุกๆ autoSaveIntervalMs
  useEffect(() => {
    if (!key) return;
    const interval = setInterval(() => {
      localStorage.setItem(`draft:${key}`, JSON.stringify(data));
    }, autoSaveIntervalMs);
    return () => clearInterval(interval);
  }, [key, data, autoSaveIntervalMs]);

  // save ด้วยตนเอง
  const saveDraft = useCallback(() => {
    if (!key) return;
    localStorage.setItem(`draft:${key}`, JSON.stringify(data));
  }, [key, data]);

  // ลบ draft
  const clearDraft = useCallback(() => {
    if (!key) return;
    localStorage.removeItem(`draft:${key}`);
  }, [key]);

  // อัปเดตบางฟิลด์
  const updateDraft = useCallback((partial: Partial<T>) => {
    setData(prev => ({ ...prev, ...partial }));
  }, []);

  return {
    data,
    setData,
    draftRestored,
    saveDraft,
    clearDraft,
    updateDraft,
  };
}
```

---

## 📋 การผูกกับ Studio Page

```tsx
// src/app/studio/page.tsx — example integration
export default function StudioPage() {
  // ─── Draft System ───────────────────────────────────
  const draft = useDraft<{
    subtitleText: string;
    brandTerms: string;
    enableAiVocab: boolean;
    enableAiSmart: boolean;
    aiSmartLanguage: string;
  }>({
    key: 'studio-form',
    initialData: {
      subtitleText: '',
      brandTerms: '',
      enableAiVocab: false,
      enableAiSmart: false,
      aiSmartLanguage: 'en',
    },
    autoSaveIntervalMs: 15000, // ทุก 15 วิ
  });

  // show toast เมื่อ restore draft
  useEffect(() => {
    if (draft.draftRestored) {
      addToast('📋 โหลดข้อมูลที่บันทึกไว้กลับมาแล้ว', 'info');
    }
  }, [draft.draftRestored]);

  return (
    <>
      <SessionGuard
        draftKey="studio-form"
        onSaveDraft={() => {
          // save subtitles ก่อน session expire
          try {
            localStorage.setItem(
              'draft:studio-subtitles',
              JSON.stringify(store.subtitles)
            );
          } catch {}
        }}
      >
        {/* ... existing studio content ... */}
      </SessionGuard>
    </>
  );
}
```

---

## 🔐 ไอเดียสำหรับ Premium Users

สำหรับ **Free tier** → ไม่ save workflow (ประหยัด storage)
สำหรับ **Premium / Business ขึ้นไป** → save ไป IndexedDB หรือ localStorage

**ตัวอย่าง:**

```typescript
const shouldSaveDraft = profile?.tier !== 'free';
```

---

## 📌 ไฟล์ที่ต้องสร้าง

| Path | เนื้อหา |
|------|---------|
| `src/components/auth/session-guard.tsx` | Component SessionGuard |
| `src/lib/hooks/use-draft.ts` | Hook useDraft |
| `src/app/login/page.tsx` | (มีอยู่แล้ว) เพิ่มรับ `?redirect=` param |

---

## 📌 ไฟล์ที่ต้องแก้ไข

| Path | แก้ไขอะไร |
|------|---------|
| `src/app/studio/page.tsx` | เพิ่ม `SessionGuard` + `useDraft` |
| `src/app/login/page.tsx` | อ่าน `redirect` param → redirect กลับเมื่อ login สำเร็จ |

---

## ✅ Checklist Implementation

- [ ] สร้าง `src/components/auth/session-guard.tsx`
- [ ] สร้าง `src/lib/hooks/use-draft.ts`
- [ ] แก้ `login/page.tsx` ให้รับ `?redirect=` param
- [ ] เพิ่ม `SessionGuard` ใน `studio/page.tsx`
- [ ] เพิ่ม auto-save interval
- [ ] เพิ่ม restore draft toast
- [ ] ทดสอบ: ปล่อย session หมด → alert → login → กลับมาหน้าเดิม

_อัปเดตล่าสุด: วางแผนครั้งแรก_
