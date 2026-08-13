/**
 * API helper — เติม basePath ให้อัตโนมัติ
 * รองรับ basePath เช่น "/subzeed" ใน production
 */

export function getBasePath(): string {
  // ใช้ basePath เฉพาะที่กำหนด explicit ผ่าน runtimeConfig เท่านั้น
  // ⚠️ ห้ามเดาจาก pathname — หน้า /studio, /admin ฯลฯ ไม่ใช่ basePath
  //    (จะเดาผิดเป็น /studio/api/... ได้)
  if (typeof window === 'undefined') return '';

  try {
    const nextData = (window as any).__NEXT_DATA__;
    if (nextData?.runtimeConfig?.basePath) {
      return nextData.runtimeConfig.basePath as string;
    }
  } catch {}

  return '';
}

export function api(path: string): string {
  const base = getBasePath();
  return `${base}${path}`;
}
