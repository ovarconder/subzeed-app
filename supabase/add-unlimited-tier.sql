-- ⚠️ รัน SQL นี้ใน Supabase SQL Editor ก่อนใช้ fixture "unlimited"
-- เพิ่มค่า 'unlimited' เข้าไปใน enum subscription_tier

ALTER TYPE subscription_tier ADD VALUE IF NOT EXISTS 'unlimited';
