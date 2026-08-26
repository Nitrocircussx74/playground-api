# Node.js + Express REST API Starter (Production-Ready Architecture)

โปรเจกต์เริ่มต้น REST API พัฒนาด้วย **Node.js** และ **Express** ที่ออกแบบในสถาปัตยกรรมแบบ **Clean & Scalable Architecture** ระดับ Production-Ready อิงตามมาตรฐาน **JWT Best Practices**:
- **Package Manager**: **Yarn** (`yarn.lock`)
- **Access Token (อายุสั้น 15 นาที)**: ส่งคืนใน JSON Payload สำหรับใส่ใน Header `Authorization: Bearer <TOKEN>`
- **Refresh Token (อายุยาว 7 วัน)**: จัดเก็บอย่างปลอดภัยใน **HTTP-Only, Secure, SameSite Cookie** และเก็บบันทึกลง **PostgreSQL Database**
- **Token Rotation & Revocation**: ระบบหมุนเวียน Token เมื่อใช้งาน และระบบเพิกถอน Token เมื่อ Logout
- **Testing Coverage**: **100% Full API Integration Testing** (19/19 Test Cases Passed Across All Endpoints)

---

## 📌 คุณสมบัติหลัก (Features)

- 🏗️ **Clean & Scalable Architecture**: แบ่งแยกเลเยอร์ชัดเจน (`Config`, `Routes`, `Controllers`, `Services`, `Middlewares`, `Validators`, `Migrations`)
- 🧶 **Yarn Package Manager**: จัดการ Dependencies อย่างรวดเร็ว ปลอดภัยด้วย `yarn.lock`
- 🔐 **JWT Best Practices (Dual Tokens)**:
  - Access Token (15m): ใช้ยืนยันตัวตนสำหรับ Protected Routes
  - Refresh Token (7d): ฝังใน HTTP-Only Cookie ป้องกัน XSS
  - `/auth/refresh`: ขอ Access Token ใหม่พร้อมหมุนเวียน (Rotate) Refresh Token
  - `/auth/logout`: ลบ Token ใน Database และเพิกถอน Cookie (`res.clearCookie('refreshToken')`)
- 🛡️ **Security Layer**: 
  - `helmet`: ป้องกันการโจมตีผ่าน HTTP Headers
  - `express-rate-limit`: จำกัดจำนวน Request ป้องกัน Brute-force & DoS (100 Request / 15 นาที)
  - `cookie-parser` & `cors`: รองรับ `credentials: true` สำหรับการรับส่ง HTTP-Only Cookies
- ✅ **Data Validation (Zod)**: ตรวจสอบความถูกต้องของ Request Body ล่วงหน้าก่อนเข้า Controller หากไม่ถูกต้องตอบกลับ `400 Bad Request` พร้อมรายละเอียด Zod Issues
- 🐘 **PostgreSQL Integration**: เชื่อมต่อผ่าน `pg` Connection Pool ประสิทธิภาพสูง
- 🔄 **SQL Migration Runner**: ระบบจัดการและบันทึกประวัติ Database Schema Migrations อัตโนมัติ (`yarn migrate`)
- 🔑 **Google OAuth 2.0 Integration**: ยืนยันตัวตนผ่าน Google ด้วย Passport.js พร้อมบันทึกผู้ใช้ลง PostgreSQL
- 🚨 **Centralized Error Handling**: ระบบจัดการ Error และ 404 Not Found แบบรวมศูนย์
- 🧪 **100% Full API Integration Tests**: ชุดทดสอบครอบคลุม API Endpoints ทุกตัวในระบบด้วย Jest และ Supertest (19/19 Passed)

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
├── AGENTS.md                 # คอนฟิกและข้อตกลงกลางสำหรับ AI Agents
├── GEMINI.md                 # คำสั่งเฉพาะสำหรับ Gemini Agent
├── CLAUDE.md                 # คำสั่งเฉพาะสำหรับ Claude Agent
├── docs/                     # 📁 โฟลเดอร์รวบรวมเอกสารการพัฒนา
│   ├── ACTIVITY_LOG.md       # บันทึกกิจกรรมและขั้นตอนการพัฒนา
│   ├── MULTI_AGENT_WORKFLOW.md# กรอบการทำงานร่วมกันระหว่าง Gemini & Claude
│   └── schema.sql            # DDL สคริปต์สำหรับ PostgreSQL
├── .agents/
│   └── rules/
│       └── memory.md         # กฎคำสั่งพิเศษ update memory
├── src/
│   ├── config/               # ตั้งค่า App, DB (PostgreSQL Pool), Passport
│   ├── controllers/          # HTTP Controllers (Auth, Main)
│   ├── middlewares/          # Security, JWT Access Token Verification, Zod Validator & Error Handlers
│   ├── migrations/           # 📁 ระบบ Database Migration Runner
│   │   ├── migrate.js        # สคริปต์ประมวลผล Migration
│   │   └── files/            # 📁 โฟลเดอร์เก็บไฟล์ .sql สำหรับ Migrations
│   │       └── 001_create_users_and_tokens_table.sql
│   ├── routes/               # API Routes (Auth, Protected /api)
│   ├── services/             # Business Logic & DB Queries (Auth Dual Token, User, Main)
│   ├── validators/           # 📁 Zod Data Validation Schemas
│   │   ├── authValidator.js  # Zod Schema สำหรับ Login
│   │   └── mainValidator.js  # Zod Schema สำหรับ POST /api
│   ├── app.js
│   └── server.js
└── tests/                    # 📁 ชุดทดสอบ Unit & Integration Tests (100% Coverage)
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

### 3. คำสั่งการรันโปรเจกต์ด้วย Yarn (Yarn Scripts)

```bash
# 1. รัน Database Migrations เพื่อสร้างตาราง users และ refresh_tokens
yarn migrate

# 2. รันในโหมด Development (มี Auto-Reload ด้วย Nodemon)
yarn dev

# 3. รันในโหมด Production
yarn start

# 4. รันการทดสอบ Unit & Integration Tests (19/19 Tests Passed)
yarn test

# 5. รันการทดสอบแบบ Watch Mode
yarn test:watch

# 6. รันการทดสอบเพื่อดูรายงาน Code Coverage
yarn test:coverage
```

---

## 🔌 ตารางสรุป API Endpoints และสถานะการทดสอบ (Full API Coverage)

| Method | Endpoint | Description | Auth Required | Validation Required | Cookie Support | Integration Test |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| `GET` | `/` | ตรวจสอบสถานะการทำงานของ API (Health Check) | ❌ ไม่ต้องมี | ❌ | ❌ | ✅ Passed |
| `GET` | `/auth/google` | เริ่มต้นยืนยันตัวตนด้วย Google OAuth 2.0 | ❌ ไม่ต้องมี | ❌ | ❌ | ✅ Passed |
| `GET` | `/auth/google/callback` | Google Callback ส่งคืน Access Token & Refresh Cookie | ❌ ไม่ต้องมี | ❌ | 🍪 Refresh Cookie | ✅ Passed |
| `POST` | `/auth/login` | เข้าสู่ระบบ -> รับ Access Token ใน Body + Refresh Cookie | ❌ ไม่ต้องมี | ✅ Zod Validation | 🍪 Set Refresh Cookie | ✅ Passed |
| `POST` | `/auth/refresh` | ขอ Access Token ใหม่โดยอ่าน Refresh Cookie (Token Rotation) | ❌ ไม่ต้องมี | ❌ | 🍪 Read Refresh Cookie | ✅ Passed |
| `POST` | `/auth/logout` | ออกจากระบบ -> เพิกถอน Token ใน DB และเคลียร์ Cookie | ❌ ไม่ต้องมี | ❌ | 🧹 Clear Cookie | ✅ Passed |
| `GET` | `/auth/me` | เรียกดูข้อมูล Profile จาก Access Token | ✅ ต้องมี JWT Bearer | ❌ | ❌ | ✅ Passed |
| `GET` | `/api` | ดึงข้อมูลภาพรวมหน้าหลัก API | ✅ ต้องมี JWT Bearer | ❌ | ❌ | ✅ Passed |
| `POST` | `/api` | ส่งและประมวลผลข้อมูลใหม่ | ✅ ต้องมี JWT Bearer | ✅ Zod Validation | ❌ | ✅ Passed |

---

## 📚 เอกสารเพิ่มเติมในโฟลเดอร์ `docs/`

- 📋 **[docs/ACTIVITY_LOG.md](file:///Users/user/Desktop/playgroud/playground/playground-api/docs/ACTIVITY_LOG.md)**: ประวัติบันทึกกิจกรรมและรายการไฟล์ทั้งหมดในระบบ
- 🔄 **[docs/MULTI_AGENT_WORKFLOW.md](file:///Users/user/Desktop/playgroud/playground/playground-api/docs/MULTI_AGENT_WORKFLOW.md)**: คู่มือและกรอบการทำงานร่วมกันระหว่าง Gemini และ Claude
