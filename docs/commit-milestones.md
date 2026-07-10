# 📍 Commit Milestones

> **ไฟล์นี้ใช้ track commit สำคัญ** — ย้อนกลับไปยังสถานะที่ทำงานได้ หรือ benchmark ว่าฟีเจอร์ไหนเริ่มใช้งานได้จาก commit ไหน

---

## Render / Export

| Commit | สถานะ | รายละเอียด |
|--------|--------|------------|
| `0ebff86` | ✅ Render ได้ (แต่ subtitle ไม่ burn-in) | Single-thread mode + self-host WASM. `ffmpeg.load()` ผ่าน 31MB WASM, video output มา แต่ซับไม่ติด |
| `8d9e951` | ✅ Render ได้ (subtitle ยังไม่มา) | Single-thread mode (no classWorkerURL). FFmpeg.wasm โหลดจาก self-host `/subzeed/ffmpeg/` |
| `e60e2fb` | ⚠️ load() ค้าง | Self-host path ถูกเป็น `/subzeed/ffmpeg/` แต่ `instance.load()` ยังค้างเพราะ classWorkerURL |
| `0a80d8c` | ❌ load() ค้าง | fetch 3 assets แยก + Blob URL แต่ `instance.load()` ค้าง |
| `d36bdfe` | ❌ load() ค้าง | coreURL/wasmURL ส่ง CDN URL ตรงๆ (ไม่ผ่าน Blob) — 31MB WASM fetch ภายในค้าง |
| `142cf28` | ❌ timeout 30s ทำงานแล้ว | เพิ่ม `awaitCancelable`, `loadGeneration`, timeout 30s. CDN ยังค้างแต่ยกเลิกได้แล้ว |
| `5e93cb2` | ✅ Render ผ่าน + Text มา | Commit ก่อน self-host/CDN fixes. ใช้ CDN unpkg + `toBlobURL()` + `classWorkerURL`. **เวอร์ชันที่ subtitle ทำงาน** |

---

## Text Style System

| Commit | สถานะ | รายละเอียด |
|--------|--------|------------|
| `5e93cb2` | ✅ | Segment-based ASS builder: per-subtitle y_offset, position, fontFamily, fontSize |
| `8c7c35e` | ✅ | createDir + writeFile font `/fonts/` ใน VFS |
| `9e82a22` | ✅ | libass font rendering ผ่าน fontsdir + font family match |

---

## ยกเลิกการ Render (Cancel)

| Commit | สถานะ | รายละเอียด |
|--------|--------|------------|
| `af51fc9` | ✅ | ปุ่มยกเลิก + AbortSignal |
| `ae690c2` | ✅ | Promise.race abort signal |
| `4b705c2` | ✅ | Cancel works even during FFmpeg loading phase |
| `fc2cee3` | ✅ | reject ffmpeg load promise on cancel |
| `81f8ca2` | ✅ | execWithAbort wrapper for reliable cancel |
| `142cf28` | ✅ | awaitCancelable + loadGeneration (cancel ทุกจุด) |

---

## CDN / Network fixes

| Commit | สถานะ | รายละเอียด |
|--------|--------|------------|
| `e60e2fb` | ✅ | Self-host path `/subzeed/ffmpeg/` ตรงกับ basePath |
| `0a80d8c` | ❌ | fetch ผ่าน `fetch()` โดยตรง + Blob URL (CDN ยังค้าง) |
| `f04471c` | ❌ | เปลี่ยนเป็น jsDelivr + fallback unpkg |
| `849ae07` | ❌ | CDN unpkg → jsDelivr + timeout 30s |
| `ecd7d66` | ❌ | Self-host WASM (ชน basePath 404) |

---

## วิธีกลับไป commit ใด commit หนึ่ง

```bash
# checkout specific commit
git checkout <commit-hash>

# สร้าง branch ใหม่จาก commit นั้น
git checkout -b <branch-name> <commit-hash>

# ดูว่า commit ไหนมีไฟล์อะไรบ้าง
git show --stat <commit-hash>
```
