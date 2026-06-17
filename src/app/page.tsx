'use client';
import Link from 'next/link';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-primary-light/50 to-white py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 text-center">
            <h1 className="text-4xl font-bold tracking-tight text-text sm:text-6xl">
              สร้างซับไตเติลภาษาไทย
              <span className="block text-primary mt-2">ง่ายๆ ในไม่กี่คลิก</span>
            </h1>
            <p className="mt-6 text-lg text-text-secondary max-w-2xl mx-auto">
              อัปโหลดวิดีโอ ระบบถอดคำพูดเป็นซับไตเติลภาษาไทยอัตโนมัติ
              รองรับหลายรูปแบบไฟล์ เริ่มต้นใช้งานฟรี!
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link href="/signup">
                <Button size="lg">เริ่มใช้งานฟรี</Button>
              </Link>
              <Link href="/pricing">
                <Button variant="outline" size="lg">
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
                  <div className="text-2xl font-bold text-primary">{stat.value}</div>
                  <div className="text-sm text-text-secondary">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <h2 className="text-3xl font-bold text-center mb-12">ทำไมต้อง SubZeed?</h2>
            <div className="grid gap-8 sm:grid-cols-3">
              {[
                { title: 'ถอดความอัตโนมัติ', desc: 'ใช้ Whisper AI ถอดเสียงพูดเป็นข้อความภาษาไทย แม่นยำระดับสูง' },
                { title: 'ประมวลผลฝั่งคุณ', desc: 'ดึงเสียงและเรนเดอร์ซับบนเบราว์เซอร์ของคุณ — ไม่เสียค่าทราฟฟิกเซิร์ฟเวอร์' },
                { title: 'ปรับแต่งได้', desc: 'เปลี่ยนฟอนต์ ตำแหน่ง สี และเพิ่ม Animation ให้ซับไตเติล' },
              ].map((f) => (
                <div key={f.title} className="rounded-xl border border-border bg-white p-6">
                  <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                  <p className="text-sm text-text-secondary">{f.desc}</p>
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

