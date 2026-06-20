import { Metadata } from 'next';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import siteConfig from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'ข้อกำหนดและเงื่อนไข',
};

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1 py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h1 className="text-3xl font-bold mb-8" style={{ color: 'var(--sz-text)' }}>
            ข้อกำหนดและเงื่อนไข
          </h1>
          <p className="text-sm mb-8" style={{ color: 'var(--sz-text-secondary)' }}>
            อัปเดตล่าสุด: 20 มิถุนายน 2568
          </p>

          <div className="prose prose-sm max-w-none space-y-8" style={{ color: 'var(--sz-text)' }}>
            <section>
              <h2 className="text-xl font-semibold mb-3">1. การยอมรับข้อกำหนด</h2>
              <p>
                การใช้บริการ {siteConfig.brand.name} (ต่อไปจะเรียกว่า &ldquo;บริการ&rdquo;)
                ถือว่าคุณยอมรับข้อกำหนดและเงื่อนไขนี้ทั้งหมด หากคุณไม่ยอมรับ
                กรุณาอย่าใช้บริการ
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">2. คำจำกัดความ</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>ผู้ใช้:</strong> บุคคลที่สมัครใช้บริการ</li>
                <li><strong>เนื้อหา:</strong> วิดีโอ, เสียง, หรือไฟล์ที่อัปโหลด</li>
                <li><strong>ซับไตเติล:</strong> ข้อความคำบรรยายที่สร้างโดยบริการ</li>
                <li><strong>โควตา:</strong> ปริมาณนาทีที่สามารถถอดความได้ในรอบบิล</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">3. การสมัครสมาชิกและบัญชี</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>คุณต้องให้ข้อมูลที่เป็นจริงและถูกต้องในการสมัคร</li>
                <li>คุณรับผิดชอบต่อการรักษาความปลอดภัยบัญชีของคุณ</li>
                <li>คุณต้องมีอายุอย่างน้อย 18 ปี หรือมีผู้ปกครองอนุญาต</li>
                <li>เราขอสงวนสิทธิ์ในการระงับบัญชีหากพบการใช้งานผิดวัตถุประสงค์</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">4. แพ็กเกจและการชำระเงิน</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>ค่าบริการเป็นไปตามแพ็กเกจที่เลือก ณ เวลาที่ชำระ</li>
                <li>รอบบิลคือ 30 วันนับจากวันที่ชำระ (Anniversary Billing)</li>
                <li>โควตาที่ไม่ได้ใช้จะรีเซ็ตเมื่อครบรอบบิล</li>
                <li>การชำระเงินดำเนินการผ่าน Stripe — เราไม่เก็บข้อมูลการชำระเงิน</li>
                <li>กรณียกเลิกก่อนครบรอบ จะไม่มีการคืนเงิน (ไม่มีการ Refund)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">5. การใช้งานที่เหมาะสม</h2>
              <p>คุณตกลงว่าจะไม่ใช้บริการเพื่อ:</p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>อัปโหลดเนื้อหาที่ละเมิดลิขสิทธิ์ของผู้อื่น</li>
                <li>อัปโหลดเนื้อหาที่ผิดกฎหมาย ลามก หรือมีความรุนแรง</li>
                <li>พยายามแฮ็กระบบ, ย้อนวิศวกรรม, หรือโจมตีบริการ</li>
                <li>ใช้บอทหรือสคริปต์อัตโนมัติโดยไม่ได้รับอนุญาต</li>
                <li>แชร์บัญชีกับผู้อื่น (ยกเว้นแพ็กเกจทีม)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">6. ลิขสิทธิ์และสิทธิ์ในเนื้อหา</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>คุณยังคงเป็นเจ้าของลิขสิทธิ์ในวิดีโอและเนื้อหาที่คุณอัปโหลด</li>
                <li>เราไม่ได้อ้างสิทธิ์ ownership ในซับไตเติลที่คุณสร้าง</li>
                <li>คุณยืนยันว่าคุณมีสิทธิ์ที่เพียงพอในการอัปโหลดเนื้อหา</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">7. การจำกัดความรับผิด</h2>
              <p>
                บริการนี้ให้บริการ &ldquo;ตามสภาพที่เป็นอยู่&rdquo; โดยไม่มีการรับประกันใด ๆ
                ทั้งโดยชัดแจ้งหรือโดยนัย รวมถึงแต่ไม่จำกัดเพียงความเหมาะสมในเชิงพาณิชย์
                เราจะไม่รับผิดชอบต่อความเสียหายใด ๆ ที่เกิดจากการใช้บริการ
                รวมถึงค่าปรับหรือค่าเสียโอกาส
              </p>
              <p className="mt-2">
                ความแม่นยำของ AI Transcription อยู่ที่ประมาณ 85-95% ขึ้นอยู่กับ
                คุณภาพเสียงและสำเนียง ผู้ใช้ควรตรวจสอบและแก้ไขซับไตเติลก่อนนำไปใช้
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">8. การยกเลิกบริการ</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>คุณสามารถลบบัญชีได้ตลอดเวลาผ่านฟังก์ชันใน Dashboard</li>
                <li>เราอาจระงับหรือยกเลิกบัญชีหากพบการละเมิดข้อกำหนด</li>
                <li>เมื่อบัญชีถูกลบ ข้อมูลของคุณจะถูกลบภายใน 30 วัน</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">9. การเปลี่ยนแปลงข้อกำหนด</h2>
              <p>
                เราอาจแก้ไขข้อกำหนดนี้เป็นครั้งคราว โดยจะแจ้งให้ทราบล่วงหน้า
                อย่างน้อย 14 วันผ่านอีเมลหรือประกาศในเว็บไซต์
                การใช้บริการต่อหลังการเปลี่ยนแปลงถือว่าคุณยอมรับข้อกำหนดใหม่
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">10. การติดต่อ</h2>
              <p>
                หากมีคำถามเกี่ยวกับข้อกำหนดนี้ กรุณาติดต่อ:
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
