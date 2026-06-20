import { Metadata } from 'next';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import siteConfig from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'นโยบายความเป็นส่วนตัว',
};

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1 py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h1 className="text-3xl font-bold mb-8" style={{ color: 'var(--sz-text)' }}>
            นโยบายความเป็นส่วนตัว
          </h1>
          <p className="text-sm mb-8" style={{ color: 'var(--sz-text-secondary)' }}>
            อัปเดตล่าสุด: 20 มิถุนายน 2568
          </p>

          <div className="prose prose-sm max-w-none space-y-8" style={{ color: 'var(--sz-text)' }}>
            <section>
              <h2 className="text-xl font-semibold mb-3">1. ข้อมูลที่เราเก็บ</h2>
              <p>เราเก็บข้อมูลต่อไปนี้เมื่อคุณใช้งาน {siteConfig.brand.name}:</p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li><strong>ข้อมูลบัญชี:</strong> อีเมล, ชื่อ (ถ้ามี)</li>
                <li><strong>ข้อมูลการใช้งาน:</strong> วิดีโอที่อัปโหลด, ซับไตเติลที่สร้าง, ประวัติการใช้งาน</li>
                <li><strong>ข้อมูลการชำระเงิน:</strong> ผ่าน Stripe — เราไม่เก็บเลขบัตรหรือข้อมูลธนาคาร</li>
                <li><strong>ข้อมูลทางเทคนิค:</strong> IP address, browser fingerprint (เพื่อป้องกันการใช้งานผิดวัตถุประสงค์)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">2. เราใช้ข้อมูลอย่างไร</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>ให้บริการถอดความและสร้างซับไตเติล</li>
                <li>ปรับปรุงคุณภาพของ AI Transcription</li>
                <li>ตรวจสอบและป้องกันการใช้งานผิดวัตถุประสงค์</li>
                <li>ติดต่อเกี่ยวกับบัญชีและการชำระเงิน</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">3. การเก็บรักษาข้อมูล</h2>
              <p>
                วิดีโอและไฟล์เสียงที่อัปโหลดจะถูกเก็บไว้ชั่วคราวระหว่างการประมวลผล และจะถูกลบ
                ภายใน 24 ชั่วโมงหลังจากถอดความเสร็จ ยกเว้นกรณีที่คุณบันทึกโปรเจกต์ไว้ในระบบ
              </p>
              <p className="mt-2">
                ข้อมูลบัญชีจะถูกเก็บไว้จนกว่าคุณจะลบบัญชี หรือเราได้รับคำขอให้ลบข้อมูล
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">4. การแชร์ข้อมูลกับบุคคลที่สาม</h2>
              <p>เราใช้บริการของบุคคลที่สามดังนี้:</p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li><strong>OpenAI (Whisper):</strong> สำหรับถอดเสียงเป็นข้อความ</li>
                <li><strong>Google (Gemini):</strong> สำหรับ AI Vocabulary (เฉพาะ Premium+)</li>
                <li><strong>Stripe:</strong> สำหรับการชำระเงิน</li>
                <li><strong>Supabase:</strong> สำหรับฐานข้อมูลและการยืนยันตัวตน</li>
                <li><strong>Vercel:</strong> สำหรับโฮสติ้ง</li>
              </ul>
              <p className="mt-2">เราไม่ขายข้อมูลส่วนบุคคลของคุณให้ใคร</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">5. สิทธิ์ของคุณ</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>ขอเข้าถึงข้อมูลที่เราเก็บเกี่ยวกับคุณ</li>
                <li>ขอให้ลบข้อมูลหรือบัญชีของคุณ</li>
                <li>ขอให้แก้ไขข้อมูลที่ไม่ถูกต้อง</li>
                <li>คัดค้านการประมวลผลข้อมูลของคุณ</li>
              </ul>
              <p className="mt-2">
                ติดต่อเราที่ <strong>support@overconda.space</strong> เพื่อใช้สิทธิ์ข้างต้น
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">6. การติดต่อ</h2>
              <p>
                หากมีคำถามเกี่ยวกับนโยบายความเป็นส่วนตัวนี้ กรุณาติดต่อ:
                <br />
                อีเมล: support@overconda.space
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
