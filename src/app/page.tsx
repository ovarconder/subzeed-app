'use client';
import Link from 'next/link';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import siteConfig from '@/lib/site-config';

export default function HomePage() {
  const { theme, homepage } = siteConfig;

  return (
    <>
      <Navbar />
      <main className="flex-1">
        {/* ─── Hero ───────────────────────────────────── */}
        <section
          className="relative overflow-hidden py-24 sm:py-32"
          style={{
            background: theme.heroGradient,
            backgroundImage: theme.backgroundImage
              ? `${theme.backgroundImage}, ${theme.heroGradient}`
              : theme.heroGradient,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* overlay เพื่อให้ข้อความอ่านง่าย */}
          <div className="absolute inset-0 bg-black/20" />

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl whitespace-pre-line">
              {homepage.heroTitle}
            </h1>
            <p className="mt-6 text-lg text-white/80 max-w-2xl mx-auto whitespace-pre-line">
              {homepage.heroSubtitle}
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link href="/signup">
                <Button size="lg" className="bg-white text-primary hover:bg-white/90">
                  {homepage.heroCta}
                </Button>
              </Link>
              <Link href="/pricing">
                <Button variant="outline" size="lg" className="border-white text-white hover:bg-white/10">
                  ดูแพ็กเกจ
                </Button>
              </Link>
            </div>
            {/* Stats */}
            <div className="mt-16 grid grid-cols-2 gap-8 sm:grid-cols-4">
              {[
                { label: 'รองรับภาษาไทย', value: '100%' },
                { label: 'ประมวลผลเร็ว', value: '10x' },
                { label: 'ราคาประหยัด', value: 'เริ่ม 0.-' },
                { label: 'ไม่มีค่าเซิร์ฟเวอร์', value: '0 บาท' },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="text-2xl font-bold text-white">{stat.value}</div>
                  <div className="text-sm text-white/70">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Features ──────────────────────────────── */}
        <section className="py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <h2 className="text-3xl font-bold text-center mb-12" style={{ color: 'var(--sz-text)' }}>
              {homepage.featuresTitle}
            </h2>
            <div className="grid gap-8 sm:grid-cols-3">
              {[
                { title: 'ถอดความอัตโนมัติ', desc: 'ใช้ Whisper AI ถอดเสียงพูดเป็นข้อความภาษาไทย แม่นยำระดับสูง' },
                { title: 'ประมวลผลฝั่งคุณ', desc: 'ดึงเสียงและเรนเดอร์ซับบนเบราว์เซอร์ของคุณ — ไม่เสียค่าทราฟฟิกเซิร์ฟเวอร์' },
                { title: 'ปรับแต่งได้', desc: 'เปลี่ยนฟอนต์ ตำแหน่ง สี และเพิ่ม Animation ให้ซับไตเติล' },
              ].map((f) => (
                <div key={f.title} className="rounded-xl p-6" style={{
                  border: `1px solid var(--sz-border)`,
                  background: theme.cardGradient,
                }}>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--sz-text)' }}>{f.title}</h3>
                  <p className="text-sm" style={{ color: 'var(--sz-text-secondary)' }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── How it works ──────────────────────────── */}
        <section className="py-20" style={{ backgroundColor: 'var(--sz-surface)' }}>
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <h2 className="text-3xl font-bold text-center mb-12" style={{ color: 'var(--sz-text)' }}>
              {homepage.howItWorksTitle}
            </h2>
            <div className="grid gap-8 sm:grid-cols-3">
              {[
                { step: '1', title: 'เลือกวิดีโอ', desc: 'ลากวิดีโอของคุณมาวางใน Studio หรือกดเลือกไฟล์' },
                { step: '2', title: 'กดถอดความ', desc: 'ระบบดึงเสียงและถอดความด้วย AI ในไม่กี่วินาที' },
                { step: '3', title: 'แก้ไข & ดาวน์โหลด', desc: 'ปรับแก้คำผิด เพิ่ม animation แล้วส่งออกเป็น .srt' },
              ].map((item) => (
                <div key={item.step} className="text-center">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-white font-bold text-lg"
                    style={{ backgroundColor: 'var(--sz-primary)' }}>
                    {item.step}
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--sz-text)' }}>{item.title}</h3>
                  <p className="text-sm" style={{ color: 'var(--sz-text-secondary)' }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
