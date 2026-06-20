# 🌐 Site Configuration — SubZeed

> ระบบปรับแต่งเว็บไซต์แบบ Config-Driven
> เปลี่ยนค่าที่ `src/lib/site-config.ts` → เปลี่ยนแปลงทั้งเว็บ

---

## วิธีปรับแต่ง

เปิดไฟล์ `src/lib/site-config.ts` แล้วแก้ค่าที่ต้องการ

### 1. เปลี่ยน Brand / โลโก้

```ts
brand: {
  name: 'SubZeed',          // ชื่อแบรนด์
  tagline: 'ซับซี๊ด',        // คำใต้โลโก้
  slogan: 'สร้างซับไตเติลภาษาไทย...',  // ข้อความโปรโมท
  logo: '/logo.svg',        // โลโก้ desktop
  logoMobile: '/logo-mobile.svg',  // โลโก้มือถือ
  favicon: '/favicon.ico',  // favicon
}
```

วางไฟล์ SVG/PNG ใน `public/` แล้วเปลี่ยน path

### 2. เปลี่ยนสี (Theme)

```ts
theme: {
  primary: '#2563eb',       // สีหลัก (blue)
  primaryDark: '#1d4ed8',   // สีหลักเข้ม
  primaryLight: '#dbeafe',  // สีหลักอ่อน
  background: '#ffffff',    // พื้นหลัง
  surface: '#f8fafc',       // พื้นผิวการ์ด
  border: '#e2e8f0',        // เส้นขอบ
  text: '#1e293b',          // ตัวอักษร
  // ...
  heroGradient: 'linear-gradient(135deg, #2563eb 0%, #8b5cf6 50%, #06b6d4 100%)',
  cardGradient: 'linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)',
  backgroundImage: undefined,  // รูปพื้นหลัง hero (optional)
}
```

### 3. เปลี่ยนข้อความ

```ts
homepage: {
  heroTitle: 'ซับไตเติลภาษาไทย\nง่ายนิดเดียว',
  heroSubtitle: 'อัปโหลดวิดีโอ ถอดความอัตโนมัติ...',
  heroCta: 'เริ่มใช้งานฟรี',
  featuresTitle: 'ทำไมต้อง SubZeed?',
  howItWorksTitle: 'วิธีใช้งาน',
}
```

### 4. เปลี่ยน Footer

```ts
footer: {
  copyright: '© 2025 SubZeed — สร้างซับไตเติลภาษาไทย อัตโนมัติ',
  links: [
    { label: 'แพ็กเกจ', href: '/pricing' },
    { label: 'เงื่อนไข', href: '/terms' },
    { label: 'ความเป็นส่วนตัว', href: '/privacy' },
    { label: 'ติดต่อเรา', href: '/contact' },
  ],
  showSocial: true,
  socialLinks: [
    { label: 'Facebook', href: '#', icon: 'facebook' },
  ],
}
```

### 5. เลือกไอคอนโซเชียลที่รองรับ

```
facebook → 📘
youtube  → ▶️
tiktok   → 🎵
twitter  → 🐦
instagram → 📸
line     → 💬
```

---

## โครงสร้างไฟล์ที่เกี่ยวข้อง

```
src/
  lib/site-config.ts       ← ไฟล์หลัก เปลี่ยนตรงนี้
  app/
    layout.tsx             ← ใช้ metadata จาก site-config
    page.tsx               ← homepage ใช้ theme gradients
    globals.css            ← CSS variables (sync กับ site-config)
  components/layout/
    navbar.tsx             ← ใช้ brand logo + name
    footer.tsx             ← ใช้ footer config
public/
  logo.svg                 ← โลโก้ desktop
  logo-mobile.svg           ← โลโก้มือถือ
  favicon.ico               ← favicon
```

---

## ตัวอย่าง: เปลี่ยนธีมเป็นสีเขียว

```ts
theme: {
  primary: '#059669',       // emerald-600
  primaryDark: '#047857',   // emerald-700
  primaryLight: '#d1fae5',  // emerald-100
  heroGradient: 'linear-gradient(135deg, #059669 0%, #0284c7 100%)',
  // ...
}
```

---

_อัปเดตล่าสุด: รอบเพิ่ม Site Configuration_
