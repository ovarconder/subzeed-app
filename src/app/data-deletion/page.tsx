import { Metadata } from 'next';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';

export const metadata: Metadata = {
  title: 'คำแนะนำการลบข้อมูล | Data Deletion',
};

export default function DataDeletionPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1 py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--sz-text)' }}>
            คำแนะนำการลบข้อมูล
          </h1>
          <p className="text-lg mb-2" style={{ color: 'var(--sz-text-secondary)' }}>
            Data Deletion Instructions
          </p>
          <p className="text-sm mb-8" style={{ color: 'var(--sz-text-secondary)' }}>
            อัปเดตล่าสุด: 20 มิถุนายน 2568
          </p>

          <div className="space-y-8" style={{ color: 'var(--sz-text)' }}>
            <section className="rounded-xl border p-6" style={{
              borderColor: 'var(--sz-border)',
              backgroundColor: 'var(--sz-surface)',
            }}>
              <h2 className="text-xl font-semibold mb-3">📋 วิธีลบบัญชีของคุณ</h2>
              <p className="mb-2">
                คุณสามารถลบข้อมูลบัญชีของคุณได้ 2 วิธี:
              </p>
              <hr className="my-4" style={{ borderColor: 'var(--sz-border)' }} />

              <h3 className="font-semibold mb-2">วิธีที่ 1: ลบด้วยตัวเอง (แนะนำ)</h3>
              <ol className="list-decimal pl-5 space-y-2">
                <li>เข้าสู่ระบบที่ <a href="/dashboard" className="text-blue-600 underline">Dashboard</a></li>
                <li>ไปที่เมนู <strong>ตั้งค่า → ลบบัญชี</strong></li>
                <li>ยืนยันการลบ — ระบบจะลบข้อมูลทั้งหมดทันที</li>
              </ol>

              <hr className="my-4" style={{ borderColor: 'var(--sz-border)' }} />

              <h3 className="font-semibold mb-2">วิธีที่ 2: แจ้งขอลบผ่านอีเมล</h3>
              <ol className="list-decimal pl-5 space-y-2">
                <li>ส่งอีเมลไปที่ <strong>support@overconda.space</strong></li>
                <li>หัวข้ออีเมล: <code className="bg-gray-100 px-2 py-0.5 rounded text-sm">Data Deletion Request</code></li>
                <li>แนบอีเมลที่ใช้สมัครสมาชิก</li>
                <li>เราจะดำเนินการให้ภายใน <strong>7 วันทำการ</strong></li>
              </ol>
            </section>

            <section className="rounded-xl border p-6" style={{
              borderColor: 'var(--sz-border)',
              backgroundColor: 'var(--sz-surface)',
            }}>
              <h2 className="text-xl font-semibold mb-3">🗑️ ข้อมูลที่ถูกลบ</h2>
              <p className="mb-3">เมื่อคุณขอลบบัญชี ข้อมูลต่อไปนี้จะถูกลบทั้งหมด:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>โปรไฟล์และข้อมูลบัญชี</li>
                <li>วิดีโอและโปรเจกต์ที่อัปโหลด</li>
                <li>ซับไตเติลที่สร้าง</li>
                <li>ประวัติการชำระเงิน (ยกเว้นที่กฎหมายกำหนดให้เก็บ)</li>
                <li>Fingerprint และข้อมูลป้องกันการใช้งานผิดวัตถุประสงค์</li>
              </ul>
            </section>

            <section className="rounded-xl border p-6" style={{
              borderColor: 'var(--sz-border)',
              backgroundColor: 'var(--sz-surface)',
            }}>
              <h2 className="text-xl font-semibold mb-3">📧 Facebook App — การลบข้อมูล</h2>
              <p className="mb-3">
                หากคุณเข้าสู่ระบบผ่าน Facebook และต้องการลบข้อมูลที่ App ของเราเก็บไว้:
              </p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>ไปที่ <strong>Facebook Settings → Apps and Websites</strong></li>
                <li>ค้นหา <strong>SubZeed</strong> ในรายการ</li>
                <li>คลิก <strong>Remove</strong> เพื่อยกเลิกการเชื่อมต่อ</li>
                <li>ส่งอีเมลแจ้งมาที่ <strong>support@overconda.space</strong> เพื่อยืนยันการลบข้อมูลในระบบของเรา</li>
              </ol>
              <p className="mt-3 text-sm text-yellow-600 bg-yellow-50 p-3 rounded-lg">
                ⚠️ การ Remove ใน Facebook จะหยุดการเข้าถึงข้อมูลเท่านั้น
                แต่ข้อมูลที่เราเก็บไว้แล้วจะไม่ถูกลบโดยอัตโนมัติ
                กรุณาส่งอีเมลแจ้งด้วยเพื่อให้เราลบข้อมูลให้ครบถ้วน
              </p>
            </section>

            <section className="rounded-xl border p-6" style={{
              borderColor: 'var(--sz-border)',
              backgroundColor: 'var(--sz-surface)',
            }}>
              <h2 className="text-xl font-semibold mb-3">⏱️ ระยะเวลาดำเนินการ</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>ลบด้วยตัวเอง: ทันที</li>
                <li>แจ้งขอลบทางอีเมล: ภายใน 7 วันทำการ</li>
                <li>ข้อมูลสำรอง (backup): จะถูกลบภายใน 30 วัน</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">📬 ติดต่อ</h2>
              <p>
                หากมีข้อสงสัยเพิ่มเติม:<br />
                อีเมล: <strong>support@overconda.space</strong>
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
