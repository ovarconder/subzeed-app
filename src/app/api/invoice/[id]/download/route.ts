import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { TIER_CONFIGS, type SubscriptionTier } from '@/lib/types';

/**
 * GET /api/invoice/[id]/download
 *
 * Server-side PDF generation (ทางเลือก)
 * ดึงข้อมูล billing → gen PDF → ส่งกลับ
 *
 * ข้อดี: ไม่ต้องโหลด jspdf ฝั่ง client
 * ข้อเสีย: กิน resources เซิร์ฟเวอร์
 *
 * ปัจจุบัน: คืน JSON ให้ client gen PDF เอง (Client-side)
 * ถ้าอยากให้ Server gen จริง ให้ใช้ library pdf-lib แทน
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // ─── Auth check ───────────────────────────────────
    const supabase = await createServerSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // ─── ตรวจสอบสิทธิ์ ────────────────────────────────
    const adminSupabase = createServiceSupabase();
    const { data: billing } = await adminSupabase
      .from('billing_history')
      .select('*')
      .eq('id', id)
      .single();

    if (!billing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const isOwner = billing.user_id === userId;
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('tier')
      .eq('id', userId)
      .single();

    if (!isOwner && profile?.tier !== 'business_pro') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ─── สร้าง HTML Invoice (ใช้ print-to-PDF ของเบราว์เซอร์) ──
    // วิธีนี้ lightweight กว่า PDF library จริง ๆ
    const tierConfig = TIER_CONFIGS[billing.new_tier as SubscriptionTier];
    const actionLabels: Record<string, string> = {
      subscribe: 'สมัครแพ็กเกจ',
      renew_early: 'ต่ออายุ (เติมก่อนกำหนด)',
      recurring: 'ต่ออายุอัตโนมัติ',
      cancel: 'ยกเลิกแพ็กเกจ',
      refund: 'คืนเงิน',
    };

    const { data: ownerProfile } = await adminSupabase
      .from('profiles')
      .select('email, phone_number')
      .eq('id', billing.user_id)
      .single();

    const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>Invoice #${billing.invoice_number || billing.id}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Kanit', sans-serif;
      color: #1e293b;
      padding: 40px;
      font-size: 14px;
    }
    .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 30px; }
    .header h1 { font-size: 28px; color: #2563eb; }
    .header .doc-title { font-size: 16px; color: #64748b; margin-top: 4px; }
    .header .invoice-meta { text-align: right; }
    .header .invoice-meta p { margin: 2px 0; }
    .section-title {
      background: #2563eb; color: white; padding: 4px 12px;
      font-size: 13px; font-weight: 500; margin: 20px 0 10px;
      border-radius: 4px;
    }
    .info-block { padding: 0 12px; margin-bottom: 16px; }
    .info-block p { margin: 3px 0; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th { background: #2563eb; color: white; text-align: left; padding: 8px 12px; font-size: 13px; font-weight: 500; }
    td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
    .total-row { background: #dbeafe; font-weight: 700; }
    .total-row td { border-bottom: 2px solid #2563eb; }
    .footer { margin-top: 30px; font-size: 11px; color: #94a3b8; }
    .footer .thanks { color: #2563eb; font-size: 14px; font-weight: 500; text-align: center; margin-top: 20px; }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>SubZeed</h1>
      <p class="doc-title">ใบเสร็จรับเงิน</p>
    </div>
    <div class="invoice-meta">
      <p><strong>เลขที่:</strong> ${billing.invoice_number || '-'}</p>
      <p><strong>วันที่:</strong> ${new Date(billing.created_at).toLocaleDateString('th-TH')}</p>
    </div>
  </div>

  <div class="section-title">ผู้ออกใบเสร็จ</div>
  <div class="info-block">
    <p><strong>บริษัท ซับซี๊ด จำกัด</strong></p>
    <p>เลขที่ผู้เสียภาษี: 0123456789012</p>
    <p>เลขที่ 123/45 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110</p>
    <p>โทร: 02-123-4567 | อีเมล: billing@subzeed.com</p>
  </div>

  <div class="section-title">ผู้ซื้อ / ลูกค้า</div>
  <div class="info-block">
    <p><strong>${ownerProfile?.email || billing.user_id}</strong></p>
    ${ownerProfile?.phone_number ? `<p>โทร: ${ownerProfile.phone_number}</p>` : ''}
  </div>

  <div class="section-title">รายการสินค้า / บริการ</div>
  <table>
    <thead>
      <tr>
        <th>รายการ</th>
        <th>รายละเอียด</th>
        <th>จำนวนเงิน</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${actionLabels[billing.action_type] || billing.action_type}</td>
        <td>${billing.previous_tier} → ${billing.new_tier} (${tierConfig?.name || ''})</td>
        <td>${billing.amount_thb.toFixed(2)} บาท</td>
      </tr>
      <tr class="total-row">
        <td colspan="2" style="text-align: right;"><strong>รวมทั้งสิ้น</strong></td>
        <td><strong>${billing.amount_thb.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} บาท</strong></td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <p>เอกสารนี้ยังไม่ใช่ใบกำกับภาษีเต็มรูปแบบ (อยู่ระหว่างดำเนินการจดทะเบียนภาษีมูลค่าเพิ่ม)</p>
    <p>กรุณาตรวจสอบและเก็บไว้เป็นหลักฐานการชำระเงิน</p>
    <div class="thanks">ขอบคุณที่ใช้บริการ SubZeed!</div>
    <div class="no-print" style="margin-top: 20px; text-align: center;">
      <button onclick="window.print()" style="padding: 10px 24px; background: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;">
        🖨️ พิมพ์ / บันทึกเป็น PDF
      </button>
    </div>
  </div>

  <script>
    // Auto-print เมื่อเปิด (optional)
    // window.onload = () => setTimeout(() => window.print(), 500);
  </script>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[api/invoice/download] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
