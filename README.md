# 🏢 Dormitory Management System - API (Node.js Express + Prisma ORM)

ระบบบริหารจัดการหอพักและอพาร์ตเมนต์ครบวงจร พัฒนาด้วย **Node.js (Express)**, **Prisma ORM (PostgreSQL)**, **LINE Messaging API / LIFF SDK** ภายใต้สถาปัตยกรรมระดับ Production-Ready

---

## 🌟 ภาพรวมฟีเจอร์ของระบบทั้งหมด (Comprehensive Feature List)

### 🏢 1. ระบบจัดการสำหรับผู้ดูแลและนิติบุคคล (Admin Backoffice CMS)
- **📊 Business Analytics & Executive Dashboard**:
  - สรุปอัตราการเช่าห้องพัก (Occupancy Rate) แบบ Real-time
  - สรุปรายรับประจำเดือน และอัตราการเติบโต MoM (Month-over-Month)
  - ติดตามยอดหนี้ค้างชำระ (Debt Tracking) และรายชื่อลูกหนี้
  - แจ้งเตือนสัญญาเช่าที่ใกล้หมดอายุใน 30 วันล่วงหน้า (Expiring Leases)
  - สรุปจำนวนรายการแจ้งซ่อมที่รอดำเนินการ (Pending Maintenance)
  - กราฟแนวโน้มรายรับย้อนหลัง 6 เดือน (Revenue Trend Chart)
  - สลับดูสถิติรายอาคาร หรือภาพรวมทุกอาคาร (Multi-Building Consolidated View)
  - ส่งออกรายงานสรุปงบการเงินเป็นไฟล์ PDF (`Sarabun` Thai Font) และรายงานใบแจ้งหนี้เป็น CSV (UTF-8 BOM)
- **🏢 Multi-Building Architecture**:
  - จัดการรายชื่ออาคาร/หอพัก (`Building`) หลายสาขาในระบบเดียว
  - ตั้งค่าอัตราค่าน้ำ ค่าไฟ วันครบกำหนด ค่าปรับ และ PromptPay QR Code ประจำแต่ละอาคาร (`BuildingSetting`)
  - ควบคุมสิทธิ์การเข้าถึงข้อมูลรายอาคารสำหรับผู้ดูแล (`UserBuildingPermission`)
- **🏠 ระบบจัดการห้องพัก & ผู้เช่า (Rooms & Tenancy Management)**:
  - ผังแสดงสถานะห้องพัก (Available, Occupied, Maintenance)
  - ออกรหัสเชิญลงทะเบียนเข้าพัก 6 หลัก (Room Invite Code อายุ 48 ชม.) พร้อม QR Code
  - ระบบลงทะเบียนผู้เช่าเข้าห้องพักแบบ Manual (Check-in Modal)
  - ดูประวัติผู้เช่าย้อนหลังรายห้อง (Room Tenancy History Modal)
  - จัดการสัญญาเช่า และระบบบันทึกการย้ายออกพร้อมคำนวณคืนเงินมัดจำ (Move-Out Inspection & Deposit Settlement)
- **⚡ ระบบบันทึกมิเตอร์น้ำ-ไฟ (Utility Meter Records)**:
  - บันทึกเลขมิเตอร์น้ำ-ไฟประจำรอบบิล พร้อมคำนวณหน่วยที่ใช้และยอดเงินอัตโนมัติ
  - รองรับการ Import ข้อมูลมิเตอร์จากไฟล์ Excel / CSV
  - ระบบ Anomaly Detection ตรวจจับเลขมิเตอร์ผิดปกติ
- **🧾 ระบบใบแจ้งหนี้ & การชำระเงิน (Invoices & Billing)**:
  - ออกบิลค่าเช่าประจำรอบบิลอัตโนมัติ
  - ออกบิลปรับแต่ง (Custom Invoice) ปรับค่าน้ำ ค่าไฟ ละเว้นค่าส่วนกลาง และระบุค่าบริการอื่นๆ
  - ตรวจทานบิล Draft (Review & Publish) ก่อนเผยแพร่
  - **ระบบส่ง LINE ทวงถามยอดค้างชำระ**:
    - ส่ง LINE แจ้งเตือนรายห้อง (`💬 เตือน LINE`)
    - ส่ง LINE แจ้งเตือนยอดค้างชำระทั้งหมดในคลิกเดียว (`💬 ส่ง LINE เตือนยอดค้างทั้งหมด`)
  - บันทึกรับชำระเงินสด/โอนเงินผ่านเคาน์เตอร์ (Manual Payment)
  - พรีวิวและสั่งพิมพ์บิล/ใบเสร็จ (Print Preview & Window Print)
  - ส่งออกใบแจ้งหนี้ PDF และใบเสร็จรับเงิน PDF พร้อมฟอนต์ไทยสารบรรณ 100%
- **🔧 ระบบจัดการงานแจ้งซ่อม (Maintenance Management)**:
  - ตรวจสอบรายการแจ้งซ่อมจากลูกบ้าน พร้อมรูปถ่ายและรายละเอียด
  - มอบหมายช่าง บันทึกค่าซ่อม และอัปเดตสถานะงานซ่อม
  - ระบุผู้รับผิดชอบค่าซ่อม (นิติออกให้ / ลูกบ้านจ่ายเอง) — หากเลือกลูกบ้านจ่ายเอง ระบบจะรวมยอดเข้าบิลค่าเช่ารอบถัดไปของห้องนั้นให้อัตโนมัติตอนออกบิล (กันเรียกเก็บซ้ำด้วย `billedInvoiceId`)
  - ส่ง LINE Push Notification แจ้งเตือนลูกบ้านอัตโนมัติเมื่อสถานะงานซ่อมเปลี่ยน
- **📢 ระบบประกาศข่าวสาร (Announcements & Broadcast)**:
  - สร้างและเผยแพร่ข่าวสารหอพักพร้อมแนบรูปภาพ
  - ส่ง LINE Flex Message Broadcast / Multicast แจ้งเตือนลูกบ้านทุกคน
- **📦 ระบบจัดการพัสดุ (Parcel Management)**:
  - บันทึกรับพัสดุ พร้อมถ่ายรูปกล่องพัสดุ บันทึกขนส่ง และเลข Tracking
  - ส่ง LINE Flex Message แจ้งเตือนลูกบ้านทันทีเมื่อพัสดุมาถึง
  - สแกน QR Code ยืนยันการรับพัสดุ (Claimed)
- **📅 ระบบจองพื้นที่ส่วนกลาง (Facility Booking)** — สำหรับคอนโด/หมู่บ้าน:
  - จัดการรายชื่อพื้นที่ส่วนกลางที่เปิดให้จอง (สระว่ายน้ำ, ฟิตเนส, ห้องประชุม ฯลฯ)
  - ดูรายการจองทั้งหมด ยกเลิกการจองของลูกบ้านได้
  - เช็คช่วงเวลาจองซ้อนทับอัตโนมัติ (Interval Overlap Guard)
- **🚗 ระบบยานพาหนะ & ผู้มาเยือน (Vehicle & Visitor Management)** — สำหรับคอนโด/หมู่บ้าน:
  - อนุมัติ/ปฏิเสธทะเบียนรถที่ลูกบ้านลงทะเบียน พร้อมแจ้งเตือน LINE อัตโนมัติ
  - ดูรายชื่อแขก/ผู้มาเยือนที่ลูกบ้านแจ้งล่วงหน้าทั้งตึก
- **🗳️ ระบบโหวต & แบบสำรวจความเห็น (Voting/Polls)** — สำหรับคอนโด/หมู่บ้าน:
  - สร้างโพลถามความเห็นลูกบ้าน (1 คน 1 โหวต) พร้อมบรอดแคสต์แจ้งเตือน LINE
  - ดูผลโหวตแบบเรียลไทม์ ปิดรับโหวตได้เมื่อต้องการ
- **🛡️ ระบบความปลอดภัย & สิทธิ์การใช้งาน (RBAC & Security)**:
  - Dual Token System: Access Token (15m in-memory) + Refresh Token (7d in HTTP-Only Cookie)
  - Token Rotation & DB Session Revocation
  - Role-Based Access Control (Super Admin, Owner, Manager, Admin)
  - Audit Log Viewer บันทึกประวัติการแก้ไขข้อมูลสำคัญ
  - Rate Limiter เฉพาะทาง (8 ครั้ง/15 นาทีต่อ IP) ป้องกัน Brute Force บนทุก Endpoint ที่เกี่ยวกับ PIN/การผูกบัญชี LINE
  - Room Owner: กำหนดเจ้าของห้อง (`User`) แยกจากผู้เช่า พร้อม Scoped Access Control
  - Notification Log: บันทึกประวัติการส่งแจ้งเตือน LINE/SMS ทุกช่องทางพร้อมสถานะสำเร็จ/ล้มเหลว
  - Smart Entry Gateway Router (`checkTenantStatus`) ผูก LINE ID เข้ากับ Tenant อัตโนมัติเฉพาะบัญชีที่ยังไม่เคยผูก LINE มาก่อนเท่านั้น กัน Account Takeover ผ่านการเดา Tenant ID
  - Business Logic ทั้งหมดอยู่ใน Service Layer (`src/services/`) — Controller ไม่แตะ Prisma โดยตรง (Layered Architecture ตาม `CLAUDE.md`)

---

### 📱 2. ระบบพอร์ทัลลูกบ้านผ่าน LINE (LINE LIFF Tenant Portal)
- **🔑 ลงทะเบียน & ผูกบัญชี (Onboarding & Linking)**:
  - ลงทะเบียนเข้าพักใหม่ผ่าน Invite Code 6 หลัก
  - ผูกบัญชี LINE กับห้องพักเดิมด้วยเบอร์โทรศัพท์ 4 ตัวท้าย
  - ยืนยันตัวตนข้ามอาคาร (Multi-Building Centralized Identity) ด้วยเบอร์โทร + PIN ที่ตั้งไว้แล้ว — ต้องผ่าน LINE ID Token ที่ Verify จริงเสมอ และห้ามอาคารที่ยังไม่เคยตั้ง PIN สร้าง PIN ใหม่ผ่านช่องทางนี้ (ต้องตั้งผ่าน Invite Code เท่านั้น กัน Account Takeover ด้วยเบอร์โทรอย่างเดียว)
  - Auto-Sync โปรไฟล์ LINE (ชื่อ, รูปภาพ, Status)
  - ส่ง Welcome Flex Message ต้อนรับเมื่อผูกบัญชีสำเร็จ
- **🆔 บัตรประจำตัวลูกบ้านดิจิทัล (Digital Tenant Hub)**:
  - Digital Tenant ID QR Code สำหรับยืนยันตัวตนกับ รปภ.
  - ดูรายละเอียดสัญญาเช่า หมายเลขห้องพัก และข้อมูลติดต่อ
  - แก้ไขข้อมูลส่วนตัว เบอร์โทรศัพท์ และบัตรประชาชน
- **💳 บิลค่าเช่า & แนบสลิปชำระเงิน (LIFF Invoices & Payment)**:
  - ตรวจสอบบิลค้างชำระ (Pending / Overdue) และประวัติบิลที่ชำระแล้ว (Paid / Reviewing)
  - Dynamic PromptPay QR Code สแกนชำระเงินตามยอดจริงสุทธิ
  - แนบไฟล์สลิปโอนเงินผ่านมือถือ
  - Auto Slip Verification ตรวจสอบยอดเงินอัตโนมัติและปรับเป็น PAID ทันที
  - ดาวน์โหลดใบเสร็จรับเงินอิเล็กทรอนิกส์ (Official E-Receipt PDF) ภาษาไทย
- **🔧 แจ้งซ่อมออนไลน์ (LIFF Maintenance)**:
  - สร้างคำขอแจ้งซ่อม แนบรูปภาพปัญหา และติดตามสถานะแบบ Real-time
- **📦 พัสดุของฉัน (LIFF My Parcels)**:
  - ตรวจสอบรายการพัสดุที่รอรับ พร้อมรูปถ่ายกล่องพัสดุและเลข Tracking
- **📢 ข่าวสาร & ประกาศ (LIFF Announcements)**:
  - อ่านข่าวสารและประกาศย้อนหลังของหอพัก
- **📅 จองพื้นที่ส่วนกลาง (LIFF Facility Booking)** — สำหรับคอนโด/หมู่บ้าน:
  - เลือกพื้นที่ส่วนกลางและช่วงเวลาที่ต้องการจองด้วยตนเอง ยกเลิกได้
- **🚗 ยานพาหนะ/ผู้มาเยือน (LIFF Vehicle & Visitor)** — สำหรับคอนโด/หมู่บ้าน:
  - ลงทะเบียนทะเบียนรถ (รออนุมัติ) และแจ้งแขกมาเยือนล่วงหน้า
- **🗳️ โหวต & แบบสำรวจ (LIFF Voting/Polls)** — สำหรับคอนโด/หมู่บ้าน:
  - ร่วมโหวตโพลที่นิติบุคคล/ผู้ดูแลสร้างขึ้น

---

## 📁 โครงสร้างโปรเจกต์ (Directory Structure)

```text
playground-api/
├── prisma/
│   ├── schema.prisma         # Data Models (User, Room, Tenant, LeaseContract, Invoice, etc.)
│   └── seed.js               # Comprehensive Initial Database Seeder
├── src/
│   ├── assets/fonts/         # ฟอนต์ภาษาไทย (Sarabun-Regular.ttf, Sarabun-Bold.ttf)
│   ├── config/               # ตั้งค่า Environment, Database, Passport
│   ├── controllers/          # Controllers (Auth, Invoice, Liff, Maintenance, Dashboard, etc.)
│   ├── middlewares/          # JWT Auth, LIFF Token Verification, Security, Upload
│   ├── routes/               # Express API Route Definitions
│   ├── services/             # LINE Messaging API, Billing, Slip Verification
│   ├── utils/                # PDF Generation Helper, Token Helpers
│   ├── validators/           # Zod Validation Schemas
│   ├── app.js
│   └── server.js
├── tests/                    # API Integration & Unit Tests (224/224 Passed)
└── package.json
```

---

## 🚀 การติดตั้งและรันโปรเจกต์ (Getting Started)

```bash
# 1. ติดตั้ง Dependencies
yarn install

# 2. ตั้งค่าไฟล์ .env
cp .env.example .env

# 3. อัปเดต Database Schema & Seed Data ด้วย Prisma
npx prisma db push
node prisma/seed.js

# 4. รันเซิร์ฟเวอร์ในโหมดพัฒนา
yarn dev

# 5. รันเซิร์ฟเวอร์พร้อมเปิด Cloudflare Tunnel สำหรับทดสอบ LINE LIFF
yarn dev:tunnel
```
