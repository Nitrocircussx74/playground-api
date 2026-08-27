# Node.js + Express REST API Starter (Production-Ready Architecture)

โปรเจกต์เริ่มต้น REST API พัฒนาด้วย **Node.js** และ **Express** ที่ออกแบบในสถาปัตยกรรมแบบ **Clean & Scalable Architecture** ระดับ Production-Ready อิงตามมาตรฐาน **JWT Best Practices** และ **Prisma ORM**:
- **Package Manager**: **Yarn** (`yarn.lock`)
- **Database & ORM**: **PostgreSQL 16+** บริหารจัดการผ่าน **Prisma ORM (v5.22)** (กำหนด UUID PK, แมปชื่อตาราง/คอลัมน์เป็น `snake_case` ด้วย `@map`)
- **Access Token (อายุสั้น 15 นาที)**: ส่งคืนใน JSON Payload สำหรับใส่ใน Header `Authorization: Bearer <TOKEN>`
- **Refresh Token (อายุยาว 7 วัน)**: จัดเก็บอย่างปลอดภัยใน **HTTP-Only, Secure, SameSite Cookie** และเก็บบันทึกลง **PostgreSQL Database**
- **Token Rotation & Revocation**: ระบบหมุนเวียน Token เมื่อใช้งาน และระบบเพิกถอน Token เมื่อ Logout
- **Testing Coverage**: **100% Full API Integration Testing** (36/36 Test Cases Passed Across All Endpoints)

---

## 📌 คุณสมบัติหลัก (Features)

- 🏗️ **Clean & Scalable Architecture**: แบ่งแยกเลเยอร์ชัดเจน (`Config`, `Routes`, `Controllers`, `Services`, `Middlewares`, `Validators`, `Prisma Schema`)
- 🧶 **Yarn Package Manager**: จัดการ Dependencies อย่างรวดเร็ว ปลอดภัยด้วย `yarn.lock`
- 💳 **PromptPay QR Code & Auto Slip Verification**:
  - `lineService.js`: สร้าง Dynamic PromptPay QR Code ตามยอดบิลจริงสุทธิ
  - `slipService.js`: Engine ตรวจสอบสลิปอัตโนมัติ (Amount Matching & SHA-256 Replay Protection) ปรับสถานะเป็น `PAID` ทันทีเมื่อยอดเงินตรง
- 🔑 **Room Invite Code Generator**: แอดมินสร้างรหัสเชิญลงทะเบียน 6 หลัก (อายุ 48 ชม.) สำหรับผู้เช่าใหม่ลงทะเบียนผูกห้องพักผ่าน LINE LIFF
- 🛡️ **Role-Based Access Control (RBAC)**:
  - `roleMiddleware.js` (`requireRole('admin')`): ควบคุมสิทธิ์การเข้าถึง API แอดมิน ป้องกันผู้เช่าหรือบุคคลภายนอกเรียกใช้ Admin Endpoints (`HTTP 403 Forbidden`)
- 🔐 **JWT Best Practices (Dual Tokens)**:
  - Access Token (15m): ใช้ยืนยันตัวตนสำหรับ Protected Routes
  - Refresh Token (7d): ฝังใน HTTP-Only Cookie ป้องกัน XSS
  - `/auth/refresh`: ขอ Access Token ใหม่พร้อมหมุนเวียน (Rotate) Refresh Token
  - `/auth/logout`: ลบ Token ใน Database และเพิกถอน Cookie (`res.clearCookie('refreshToken')`)
- 🛡️ **Security Layer**: 
  - `helmet`: ป้องกันการโจมตีผ่าน HTTP Headers (เปิด Cross-Origin Resource Policy สำหรับ LIFF/Cloudflare Tunnels)
  - `express-rate-limit`: จำกัดจำนวน Request ป้องกัน Brute-force & DoS (200 Request / 15 นาที)
  - `cookie-parser` & `cors`: รองรับ `origin: true` และ `credentials: true` สำหรับ LIFF App และ Cloudflare Tunnels
- ✅ **Data Validation (Zod)**: ตรวจสอบความถูกต้องของ Request Body ล่วงหน้าก่อนเข้า Controller หากไม่ถูกต้องตอบกลับ `400 Bad Request`
- 💎 **Prisma ORM Integration**: จัดการ Database Schema, Migrations และ Seeding ข้อมูลผ่าน **Prisma Client** (ใช้ `npx prisma db push` แทน SQL Migration Runner เดิม)
- 📊 **Business Analytics & CSV/PDF Report Export**: 
  - `pdfkit`: ส่งออกรายงานสรุปงบการเงินประจำเดือนในรูปแบบ PDF (Monthly Financial & Revenue Summary)
  - `CSV Export Engine`: ส่งออกรายงานใบแจ้งหนี้เป็น CSV ด้วย UTF-8 BOM (`\uFEFF`) แสดงผลภาษาไทยบน Excel สมบูรณ์แบบ
- 🔑 **Google OAuth 2.0 Integration**: ยืนยันตัวตนผ่าน Google ด้วย Passport.js พร้อมบันทึกผู้ใช้ลง PostgreSQL
- 🚨 **Centralized Error Handling**: ระบบจัดการ Error และ 404 Not Found แบบรวมศูนย์
- 🧪 **100% Full API Integration Tests**: ชุดทดสอบครอบคลุม API Endpoints ทุกตัวในระบบด้วย Jest และ Supertest (36/36 passed)

---

## 📁 โครงสร้างโฟลเดอร์ (Directory Structure)

```text
playground-api/
├── .env.example              # ตัวแปรสภาพแวดล้อมจำลอง (JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, DB, OAuth)
├── .gitignore                # ป้องกันการติดตามไฟล์ที่ไม่จำเป็น
├── jest.config.js            # การตั้งค่า Jest Testing Framework
├── package.json              # กำหนด Dependencies และ Scripts
├── yarn.lock                 # ไฟล์ ล็อกสเปก Dependencies ของ Yarn
├── README.md                 # คู่มือแนะนำการใช้งานโปรเจกต์
├── prisma/                   # 📁 โฟลเดอร์จัดการ Database Schema & Seed ด้วย Prisma
│   ├── schema.prisma         # Prisma Data Model (User, Room, Tenant, Invoice, FeatureToggle, etc.)
│   └── seed.js               # สคริปต์สำหรับ Seeding ข้อมูลเริ่มต้นลง PostgreSQL
├── src/
│   ├── config/               # ตั้งค่า App, DB, Passport, Swagger
│   ├── controllers/          # HTTP Controllers (Auth, Liff, Invoice, Feature, Dashboard, etc.)
│   ├── middlewares/          # Security, JWT Verification, Upload Middleware, Error Handlers
│   ├── routes/               # API Routes (Auth, Liff, Admin Protected Endpoints)
│   ├── services/             # Business Logic & LINE SDK Services
│   ├── validators/           # Zod Data Validation Schemas
│   ├── app.js
│   └── server.js
└── tests/                    # 📁 ชุดทดสอบ Unit & Integration Tests
```

---

## 🚀 ขั้นตอนการติดตั้งและการใช้งานด้วย Yarn (Getting Started)

### 1. ติดตั้ง Dependencies ด้วย Yarn

```bash
yarn install
```

### 2. ตั้งค่า ตัวแปรสภาพแวดล้อม (Environment Variables)

สร้างไฟล์ `.env` โดยคัดลอกตัวแปรจากไฟล์ `.env.example`:

```bash
cp .env.example .env
```

### 3. อัปเดต Database Schema และ Seeding ข้อมูลด้วย Prisma

```bash
# 1. Sync Prisma Schema เข้าสู่ PostgreSQL Database
npx prisma db push

# 2. Seeding ข้อมูลเริ่มต้น (Admin, Sample Tenant, Rooms, Feature Toggles)
node prisma/seed.js
```

### 4. คำสั่งการรันโปรเจกต์ด้วย Yarn (Yarn Scripts)

```bash
# 1. รันในโหมด Development (มี Auto-Reload ด้วย Nodemon)
yarn dev

# 2. รันในโหมด Development พร้อมเปิด Cloudflare HTTPS Tunnel
yarn dev:tunnel

# 3. รันในโหมด Production
yarn start

# 4. รันการทดสอบ Unit & Integration Tests
yarn test
```

---

## 🔌 ตารางสรุป API Endpoints และสถานะการทดสอบ

| Method | Endpoint | Description | Auth Required | Validation Required | Cookie Support |
| :--- | :--- | :--- | :---: | :---: | :---: |
| `GET` | `/` | ตรวจสอบสถานะการทำงานของ API (Health Check) | ❌ ไม่ต้องมี | ❌ | ❌ |
| `POST` | `/api/v1/rooms/:id/invites` | แอดมินสร้างรหัสเชิญ 6 หลักสำหรับห้องว่าง (อายุ 48 ชม.) | ✅ ต้องมี JWT Bearer | ❌ | ❌ |
| `GET` | `/api/v1/rooms/:id/invites` | ดึงรายการ Invite Codes ทั้งหมดของห้องพัก | ✅ ต้องมี JWT Bearer | ❌ | ❌ |
| `DELETE` | `/api/v1/rooms/invites/:inviteId` | แอดมินยกเลิก/เพิกถอน Invite Code ที่ยังไม่ได้ใช้งาน | ✅ ต้องมี JWT Bearer | ❌ | ❌ |
| `GET` | `/api/v1/liff/invites/verify/:code` | ตรวจสอบความถูกต้องของ Invite Code ฝั่ง LIFF | ❌ ไม่ต้องมี | ❌ | ❌ |
| `POST` | `/api/v1/liff/register/invite` | ลงทะเบียนผู้เช่าใหม่ผูกเข้ากับห้องพัก (Prisma Transaction) | ❌ ไม่ต้องมี | ✅ Required Fields | ❌ |
| `GET` | `/api/v1/features` | ดึงรายการ Feature Toggles ทั้งหมด (สำหรับ LIFF & Admin) | ❌ ไม่ต้องมี | ❌ | ❌ |
| `PUT` | `/api/v1/features/:key` | แอดมินสับสวิตช์เปิด-ปิด Feature Toggle | ✅ ต้องมี JWT Bearer | ❌ | ❌ |
| `GET` | `/api/v1/dashboard/summary` | ดึงข้อมูลภาพรวมธุรกิจ สถิติห้องพัก ยอดหนี้ รายรับ MoM | ✅ ต้องมี JWT Bearer | ❌ | ❌ |
| `GET` | `/api/v1/dashboard/trend` | ดึงข้อมูลแนวโน้มรายรับย้อนหลัง 6 เดือน | ✅ ต้องมี JWT Bearer | ❌ | ❌ |
| `GET` | `/api/v1/dashboard/export/csv` | ส่งออกรายงานใบแจ้งหนี้เป็น CSV (UTF-8 BOM) | ✅ ต้องมี JWT Bearer | ❌ | ❌ |
| `GET` | `/api/v1/dashboard/export/pdf` | ส่งออกรายงานสรุปงบการเงินเป็น PDF (pdfkit) | ✅ ต้องมี JWT Bearer | ❌ | ❌ |
| `POST` | `/api/v1/dashboard/remind-debtors` | ส่ง LINE Flex Message ทวงหนี้ผู้เช่าค้างชำระ | ✅ ต้องมี JWT Bearer | ❌ | ❌ |
| `GET` | `/api/v1/liff/profile` | ดึงข้อมูลโปรไฟล์ผู้เช่าฝั่ง LIFF Portal | ❌ ไม่ต้องมี | ❌ | ❌ |
| `PUT` | `/api/v1/liff/profile` | อัปเดตเบอร์โทรศัพท์ผู้เช่าฝั่ง LIFF Portal | ❌ ไม่ต้องมี | ✅ Phone Check | ❌ |
| `GET` | `/api/v1/liff/invoices/history` | ดึงประวัติบิลค้างชำระ & ชำระแล้วของลูกบ้าน | ❌ ไม่ต้องมี | ❌ | ❌ |
| `POST` | `/api/v1/liff/invoices/:id/slip` | อัปโหลดสลิปโอนเงินฝั่ง LIFF Portal | ❌ ไม่ต้องมี | 📸 Image File | ❌ |
| `POST` | `/auth/login` | เข้าสู่ระบบ -> รับ Access Token ใน Body + Refresh Cookie | ❌ ไม่ต้องมี | ✅ Zod Validation | 🍪 Set Refresh Cookie |
| `POST` | `/auth/refresh` | ขอ Access Token ใหม่โดยอ่าน Refresh Cookie (Token Rotation) | ❌ ไม่ต้องมี | ❌ | 🍪 Read Refresh Cookie |
| `POST` | `/auth/logout` | ออกจากระบบ -> เพิกถอน Token ใน DB และเคลียร์ Cookie | ❌ ไม่ต้องมี | ❌ | 🧹 Clear Cookie |

---
*Updated to use Prisma ORM for schema migrations and data seeding.*
