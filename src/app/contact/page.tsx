import { Metadata } from 'next';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';

export const metadata: Metadata = {
  title: 'ติดต่อเรา',
};

export default function ContactPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1 py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h1 className="text-3xl font-bold mb-8" style={{ color: 'var(--sz-text)' }}>
            ติดต่อเรา
          </h1>

          <div className="prose prose-sm max-w-none space-y-8" style={{ color: 'var(--sz-text)' }}>
            {/* ช่องทางติดต่อ */}
            <section>
              <h2 className="text-xl font-semibold mb-3">ช่องทางติดต่อ</h2>
              <div className="space-y-4 mt-4">
                <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--sz-surface)' }}>
                  <h3 className="font-medium mb-1">📧 อีเมล</h3>
                  <p style={{ color: 'var(--sz-text-secondary)' }}>
                    สอบถามทั่วไป: <a href="mailto:support@overconda.space" style={{ color: 'var(--sz-primary)' }}>support@overconda.space</a>
                    <br />
                    ฝ่ายบัญชี: <a href="mailto:billing@overconda.space" style={{ color: 'var(--sz-primary)' }}>billing@overconda.space</a>
                  </p>
                </div>

                <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--sz-surface)' }}>
                  <h3 className="font-medium mb-1">💬 LINE</h3>
                  <p style={{ color: 'var(--sz-text-secondary)' }}>
                    @SubZeed (ตอบกลับในเวลาทำการ)
                  </p>
                </div>

                <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--sz-surface)' }}>
                  <h3 className="font-medium mb-1">📘 Facebook</h3>
                  <p style={{ color: 'var(--sz-text-secondary)' }}>
                    facebook.com/subzeed
                  </p>
                </div>
              </div>
            </section>

            {/* แผนที่ / ที่อยู่ */}
            <section>
              <h2 className="text-xl font-semibold mb-3">ที่อยู่</h2>
              <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--sz-surface)' }}>
                <p style={{ color: 'var(--sz-text-secondary)' }}>
                  SubZeed Technology Co., Ltd.
                  <br />
                  123/45 ถนนสุขุมวิท แขวงคลองเตย
                  <br />
                  เขตคลองเตย กรุงเทพฯ 10110
                </p>
              </div>
            </section>

            {/* เวลาทำการ */}
            <section>
              <h2 className="text-xl font-semibold mb-3">เวลาทำการ</h2>
              <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--sz-surface)' }}>
                <table className="w-full text-sm" style={{ color: 'var(--sz-text-secondary)' }}>
                  <tbody>
                    <tr className="border-b" style={{ borderColor: 'var(--sz-border)' }}>
                      <td className="py-2 font-medium" style={{ color: 'var(--sz-text)' }}>จันทร์ – ศุกร์</td>
                      <td className="py-2 text-right">09:00 – 18:00 น.</td>
                    </tr>
                    <tr className="border-b" style={{ borderColor: 'var(--sz-border)' }}>
                      <td className="py-2 font-medium" style={{ color: 'var(--sz-text)' }}>เสาร์</td>
                      <td className="py-2 text-right">09:00 – 12:00 น.</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-medium" style={{ color: 'var(--sz-text)' }}>อาทิตย์</td>
                      <td className="py-2 text-right" style={{ color: 'var(--sz-danger)' }}>หยุด</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* FAQ สั้น */}
            <section>
              <h2 className="text-xl font-semibold mb-3">คำถามที่พบบ่อย</h2>
              <div className="space-y-4 mt-4">
                <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--sz-surface)' }}>
                  <h3 className="font-medium mb-1">ใช้เวลานานแค่ไหนกว่าจะได้คำตอบ?</h3>
                  <p className="text-sm" style={{ color: 'var(--sz-text-secondary)' }}>
                    โดยทั่วไปเราตอบกลับภายใน 24 ชั่วโมงในวันทำการ
                  </p>
                </div>
                <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--sz-surface)' }}>
                  <h3 className="font-medium mb-1">มีช่องทางด่วนสำหรับกรณีฉุกเฉินไหม?</h3>
                  <p className="text-sm" style={{ color: 'var(--sz-text-secondary)' }}>
                    สำหรับปัญหาด้านเทคนิคด่วน ติดต่อผ่าน LINE @SubZeed หรืออีเมล support@overconda.space
                    พร้อมระบุหัวข้อ [ด่วน]
                  </p>
                </div>
                <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--sz-surface)' }}>
                  <h3 className="font-medium mb-1">ต้องการแจ้งปัญหาหรือแนะนำฟีเจอร์?</h3>
                  <p className="text-sm" style={{ color: 'var(--sz-text-secondary)' }}>
                    เรายินดีรับฟังทุกความคิดเห็น ส่งอีเมลมาที่ support@overconda.space
                    พร้อมหัวข้อ [ข้อเสนอแนะ]
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
