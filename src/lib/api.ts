/**
 * API helper — เติม basePath ให้อัตโนมัติ
 * รองรับ basePath เช่น "/subzeed" ใน production
 */
let _basePath: string | null = null;

function getBasePath(): string {
  if (_basePath !== null) return _basePath;

  if (typeof window !== 'undefined') {
    // ลองอ่านจาก __NEXT_DATA__ หรือ window.next
    try {
      const nextData = (window as any).__NEXT_DATA__;
      if (nextData?.runtimeConfig?.basePath) {
        _basePath = nextData.runtimeConfig.basePath;
        return _basePath;
      }
    } catch {}
    // ถ้าไม่ได้ให้เช็คจาก location pathname
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts.length > 0 && parts[0] !== 'api') {
      _basePath = `/${parts[0]}`;
      return _basePath;
    }
  }

  _basePath = '';
  return _basePath;
}

export function api(path: string): string {
  const base = getBasePath();
  return `${base}${path}`;
}
