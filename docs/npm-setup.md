# ⚙️ NPM / Node.js Setup — ต้องอ่านก่อนทำงานทุกครั้ง

> **ระดับ: CRITICAL** — ห้ามลืมเด็ดขาด มิฉะนั้นจะเสียเวลา

---

## ปัญหา

Codespace / VSCode บน Mac ไม่มี `node`, `npm`, `npx` ใน PATH โดยตรง
ต้องใช้ `nvm` หรือ `n` ในการ activate ก่อน

---

## วิธี Setup (เลือก 1 วิธี)

### วิธีที่ 1: ใช้ `n` (node version manager ที่ติดตั้งไว้)

```bash
# รันคำสั่งนี้ก่อนใช้ npm, node, npx ทุกครั้ง
export N_PREFIX=/usr/local/n
export PATH=/usr/local/n/versions/node/22.14.0/bin:$PATH

# ตรวจสอบ
node --version   # ต้องขึ้น v22.14.0
npm --version    # ต้องขึ้น 10.9.2

# รัน dev server
npm run dev

# type check
npx tsc --noEmit

# build
npm run build
```

### วิธีที่ 2: ใช้ `nvm` (ถ้าติดตั้งไว้)

```bash
# หา nvm ก่อน
which nvm || source ~/.nvm/nvm.sh

# ใช้ node version ที่ project ต้องการ
nvm use
```

---

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ความหมาย |
|--------|----------|
| `npm run dev` | รัน dev server (localhost:3000) |
| `npx tsc --noEmit` | type check อย่างเดียว |
| `npm run build` | build production |
| `npm run lint` | lint code |
| `npm run type-check` | type check (ถ้ามี script) |

---

## Checklist ก่อนเริ่มทำงานทุก Session

- [ ] รัน `export N_PREFIX=/usr/local/n && export PATH=/usr/local/n/versions/node/22.14.0/bin:$PATH`
- [ ] ตรวจสอบ `node --version` → 22.14.0
- [ ] อ่าน `docs/lessons-learned-workflow.md`
- [ ] อ่าน `docs/critical-basepath.md`
- [ ] เรียก `ls` ดูโครงสร้างไฟล์ที่มีอยู่แล้ว

---

_Last updated: ระหว่าง Session ที่แก้ไข Subtitle System_
