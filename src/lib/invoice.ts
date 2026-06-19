// ============================================================
// 📄 Invoice PDF Generator — SubZeed
// ============================================================
// ใช้ jspdf + jspdf-autotable สร้าง PDF ใบเสร็จ/ใบกำกับภาษี
// ทำงานฝั่ง Client (Browser) เพื่อลดค่าใช้จ่ายเซิร์ฟเวอร์
// ============================================================

import type { BillingHistory, Profile, SubscriptionTier } from './types';
import { TIER_CONFIGS } from './types';

interface InvoiceData {
  profile: Profile;
  billing: BillingHistory;
  companyInfo: {
    name: string;
    address: string;
    taxId: string;
    phone: string;
    email: string;
  };
}

/**
 * กำหนดค่าบริษัท (เปลี่ยนเมื่อจด VAT แล้ว)
 */
const COMPANY = {
  name: 'บริษัท ซับซี๊ด จำกัด',
  address: 'เลขที่ 123/45 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110',
  taxId: '0123456789012', // เลขผู้เสียภาษี 13 หลัก
  phone: '02-123-4567',
  email: 'billing@subzeed.com',
};

const COMPANY_VAT = {
  name: 'บริษัท ซับซี๊ด จำกัด',
  address: 'เลขที่ 123/45 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110',
  taxId: '0123456789012',
  phone: '02-123-4567',
  email: 'billing@subzeed.com',
  vatRate: 0.07, // VAT 7%
};

/**
 * รูปแบบ Action Type → ภาษาไทย
 */
const actionLabel: Record<string, string> = {
  subscribe: 'สมัครแพ็กเกจ',
  renew_early: 'ต่ออายุ (เติมก่อนกำหนด)',
  recurring: 'ต่ออายุอัตโนมัติ',
  cancel: 'ยกเลิกแพ็กเกจ',
  refund: 'คืนเงิน',
};

/**
 * สร้าง PDF ใบเสร็จรับเงิน (ช่วงยังไม่จด VAT)
 */
export async function generateReceiptPDF(
  profile: Profile,
  billing: BillingHistory,
  hasVat: boolean = false
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  await import('jspdf-autotable');
  
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const company = hasVat ? COMPANY_VAT : COMPANY;

  // ─── ฟอนต์ไทย (ใช้ built-in font หมุนเอา) ─────────
  // โน้ต: jspdf ไม่รองรับ Thai โดยตรง เราจะใช้ Helvetica + จัด layout ให้สวย
  // ใน production ควรใช้ custom font (Kanit, Sarabun) แทน

  // ─── 1. Header ─────────────────────────────────────
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('SubZeed', margin, y);
  y += 8;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  const docTitle = hasVat ? 'ใบเสร็จรับเงิน / ใบกำกับภาษี' : 'ใบเสร็จรับเงิน';
  doc.text(docTitle, margin, y);
  y += 10;

  // Invoice info (right-aligned)
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('เลขที่:', pageWidth - margin - 50, y - 8);
  doc.setFont('helvetica', 'normal');
  doc.text(billing.invoice_number || '-', pageWidth - margin - 25, y - 8);
  
  doc.setFont('helvetica', 'bold');
  doc.text('วันที่:', pageWidth - margin - 50, y - 4);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date(billing.created_at).toLocaleDateString('th-TH'), pageWidth - margin - 25, y - 4);

  // ─── 2. Company Info ───────────────────────────────
  y += 6;
  doc.setDrawColor(37, 99, 235); // primary blue
  doc.setFillColor(37, 99, 235);
  doc.rect(margin, y, contentWidth, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('ผู้ออกใบเสร็จ', margin + 3, y + 4);
  y += 10;

  doc.setTextColor(30, 41, 59); // text color
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(company.name, margin, y);
  y += 5;
  doc.text(`เลขที่ผู้เสียภาษี: ${company.taxId}`, margin, y);
  y += 5;
  doc.text(company.address, margin, y);
  y += 5;
  doc.text(`โทร: ${company.phone} | อีเมล: ${company.email}`, margin, y);
  y += 12;

  // ─── 3. Customer Info ──────────────────────────────
  doc.setFillColor(37, 99, 235);
  doc.rect(margin, y, contentWidth, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('ผู้ซื้อ / ลูกค้า', margin + 3, y + 4);
  y += 10;

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`อีเมล: ${profile.email}`, margin, y);
  y += 5;
  // ถ้ามี profile.phone_number → แสดงด้วย

  if (profile.phone_number) {
    doc.text(`โทร: ${profile.phone_number}`, margin, y);
    y += 5;
  }

  // ─── 4. Billing Period ─────────────────────────────
  doc.text(
    `รอบบิล: ${new Date(billing.billing_cycle_start).toLocaleDateString('th-TH')} — ${new Date(billing.billing_cycle_end).toLocaleDateString('th-TH')}`,
    margin, y
  );
  y += 10;

  // ─── 5. Items Table ────────────────────────────────
  const tierConfig = TIER_CONFIGS[billing.new_tier as SubscriptionTier];

  const tableBody = [
    [
      actionLabel[billing.action_type] || billing.action_type,
      `${billing.previous_tier} → ${billing.new_tier}`,
      tierConfig?.name || billing.new_tier,
      `${billing.amount_thb.toFixed(2)}`,
    ],
  ];

  if (hasVat) {
    const vatAmount = billing.amount_thb * COMPANY_VAT.vatRate;
    const totalWithVat = billing.amount_thb + vatAmount;
    tableBody.push(['', '', 'ภาษีมูลค่าเพิ่ม 7%', `${vatAmount.toFixed(2)}`]);
    tableBody.push(['', '', 'รวมทั้งสิ้น', `${totalWithVat.toFixed(2)}`]);
  }

  (doc as any).autoTable({
    startY: y,
    head: [['รายการ', 'รายละเอียด', 'จำนวน', 'จำนวนเงิน (บาท)']],
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 50 },
      2: { cellWidth: 40 },
      3: { cellWidth: 35, halign: 'right' },
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // ─── 6. Total (highlight) ──────────────────────────
  doc.setFillColor(239, 246, 255); // primary-light
  doc.setDrawColor(37, 99, 235);
  const totalAmount = hasVat
    ? billing.amount_thb * (1 + COMPANY_VAT.vatRate)
    : billing.amount_thb;

  doc.rect(margin, y, contentWidth, 10, 'F');
  doc.rect(margin, y, contentWidth, 10, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('จำนวนเงินรวมทั้งสิ้น:', margin + 3, y + 7);
  doc.text(
    `${totalAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} บาท`,
    pageWidth - margin - 3,
    y + 7,
    { align: 'right' }
  );
  y += 18;

  // ─── 7. Footer note ────────────────────────────────
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // text-secondary
  doc.setFont('helvetica', 'normal');

  if (hasVat) {
    doc.text(
      'เอกสารนี้เป็นใบเสร็จรับเงิน / ใบกำกับภาษี ตามมาตรา 86/4 แห่งประมวลรัษฎากร',
      margin, y
    );
    y += 4;
    doc.text(
      'ผู้ซื้อสามารถใช้เป็นหลักฐานในการประกอบการยื่นภาษีได้',
      margin, y
    );
  } else {
    doc.text(
      'เอกสารนี้ยังไม่ใช่ใบกำกับภาษีเต็มรูปแบบ (อยู่ระหว่างดำเนินการจดทะเบียนภาษีมูลค่าเพิ่ม)',
      margin, y
    );
    y += 4;
    doc.text(
      'กรุณาตรวจสอบและเก็บไว้เป็นหลักฐานการชำระเงิน',
      margin, y
    );
  }

  y += 10;

  // ─── 8. ขอบคุณ ─────────────────────────────────────
  doc.setFontSize(10);
  doc.setTextColor(37, 99, 235);
  doc.setFont('helvetica', 'bold');
  doc.text('ขอบคุณที่ใช้บริการ SubZeed!', pageWidth / 2, y, { align: 'center' });

  // Return as Blob
  return doc.output('blob');
}

/**
 * ดาวน์โหลด PDF อัตโนมัติ
 */
export function downloadInvoice(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
