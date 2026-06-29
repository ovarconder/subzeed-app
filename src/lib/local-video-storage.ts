// ============================================================
// 🗄️ Local Video Storage — SubZeed
// ============================================================
// เก็บวิดีโอไว้ใน IndexedDB (localStorage ของ browser user)
// เพื่อให้เปิด project เก่าแล้วยังมีวิดีโอให้เล่น
// 
// แนวคิด: เหมือน Capcut / DaVinci Resolve — ไฟล์วิดีโอ
// อยู่ที่เครื่อง user ไม่ต้องอัปโหลดขึ้นเซิร์ฟเวอร์
// ============================================================

const DB_NAME = 'subzeed-videos';
const DB_VERSION = 1;
const STORE_NAME = 'video-files';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('projectId', 'projectId', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface StoredVideo {
  id: string;          // project ID หรือ unique key
  projectId: string;   // project ID สำหรับค้นหา
  fileName: string;    // ชื่อไฟล์เดิม
  mimeType: string;    // video/mp4 etc
  size: number;        // bytes
  data: ArrayBuffer;   // เนื้อหาไฟล์
  storedAt: string;    // ISO timestamp
}

/**
 * บันทึกวิดีโอลง IndexedDB
 */
export async function saveVideoLocally(
  projectId: string,
  file: File,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = e.target?.result as ArrayBuffer;
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const videoRecord: StoredVideo = {
          id: `video_${projectId}`,
          projectId,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          data,
          storedAt: new Date().toISOString(),
        };

        store.put(videoRecord);

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * โหลดวิดีโอจาก IndexedDB กลับมาเป็น Object URL
 * @returns videoUrl, fileName, fileSize หรือ null ถ้าไม่เจอ
 */
export async function loadVideoLocally(projectId: string): Promise<{
  videoUrl: string;
  fileName: string;
  fileSize: number;
} | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const record = await new Promise<StoredVideo | undefined>((resolve, reject) => {
    const req = store.get(`video_${projectId}`);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();

  if (!record) return null;

  // สร้าง Blob จาก ArrayBuffer แล้วสร้าง Object URL
  const blob = new Blob([record.data], { type: record.mimeType });
  const videoUrl = URL.createObjectURL(blob);

  return {
    videoUrl,
    fileName: record.fileName,
    fileSize: record.size,
  };
}

/**
 * ลบวิดีโอออกจาก IndexedDB
 */
export async function removeVideoLocally(projectId: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.delete(`video_${projectId}`);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * ตรวจสอบว่ามีวิดีโอ cached อยู่หรือไม่
 */
export async function hasVideoLocally(projectId: string): Promise<boolean> {
  const result = await loadVideoLocally(projectId);
  return result !== null;
}

/**
 * ดูพื้นที่ทั้งหมดที่ใช้โดย IndexedDB (bytes)
 */
export async function getVideoStorageUsage(): Promise<{
  totalBytes: number;
  fileCount: number;
}> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const all = await new Promise<StoredVideo[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();

  return {
    totalBytes: all.reduce((acc, v) => acc + v.size, 0),
    fileCount: all.length,
  };
}
