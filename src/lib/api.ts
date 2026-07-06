/**
 * API helper — เติม basePath ให้อัตโนมัติ
 * รองรับ basePath เช่น "/subzeed" ใน production
 */

export function getBasePath(): string {
  if (typeof window === 'undefined') return '';

  // ลองอ่านจาก __NEXT_DATA__
  try {
    const nextData = (window as any).__NEXT_DATA__;
    if (nextData?.runtimeConfig?.basePath) {
      return nextData.runtimeConfig.basePath as string;
    }
  } catch {}
  // ถ้าไม่ได้ให้เช็คจาก location pathname
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length > 0 && parts[0] !== 'api') {
    return `/${parts[0]}`;
  }

  return '';
}

export function api(path: string): string {
  const base = getBasePath();
  return `${base}${path}`;
}
