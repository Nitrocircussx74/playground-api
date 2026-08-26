# Node.js + Express REST API Starter (Production-Ready Architecture)

โปรเจกต์เริ่มต้น REST API พัฒนาด้วย **Node.js** และ **Express** ที่ออกแบบในสถาปัตยกรรมแบบ **Clean & Scalable Architecture** ระดับ Production-Ready ครอบคลุมทั้ง **Security (Helmet, Rate Limiting)**, **Data Validation (Zod)**, **JSON Web Token (JWT)**, **Google OAuth 2.0**, **PostgreSQL Database + SQL Migration Runner** รวมถึงชุดทดสอบ **Unit & Integration Test (Jest & Supertest)**

---

## 📌 คุณสมบัติหลัก (Features)

- 🏗️ **Clean & Scalable Architecture**: แบ่งแยกเลเยอร์ชัดเจน (`Config`, `Routes`, `Controllers`, `Services`, `Middlewares`, `Validators`, `Migrations`)
- 🛡️ **Security Layer**: 
  - `helmet`: ป้องกันการโจมตีผ่าน HTTP Headers
  - `express-rate-limit`: จำกัดจำนวน Request ป้องกัน Brute-force & DoS (100 Request / 15 นาที)
- ✅ **Data Validation (Zod)**: ตรวจสอบความถูกต้องของ Request Body ล่วงหน้าก่อนเข้า Controller หากไม่ถูกต้องตอบกลับ `400 Bad Request` พร้อมรายละเอียด
- 🐘 **PostgreSQL Integration**: เชื่อมต่อผ่าน `pg` Connection Pool ประสิทธิภาพสูง
- 🔄 **SQL Migration Runner**: ระบบจัดการและบันทึกประวัติ Database Schema Migrations อัตโนมัติ (`npm run migrate`)
- 🔐 **JWT Authentication**: ระบบออกและตรวจสอบ Token สำหรับป้องกัน Route (Protected Routes)
- 🔑 **Google OAuth 2.0 Integration**: ยืนยันตัวตนผ่าน Google ด้วย Passport.js พร้อมบันทึกผู้ใช้ลง PostgreSQL
- 🚨 **Centralized Error Handling**: ระบบจัดการ Error และ 404 Not Found แบบรวมศูนย์
- 🧪 **Unit & Integration Tests**: ชุดทดสอบพร้อมใช้งานด้วย Jest และ Supertest
- 🤖 **Multi-Agent Support**: ระบบไฟล์คอนฟิกสำหรับให้ Gemini และ Claude ทำงานร่วมกันได้อย่างราบรื่น

---

## 📁 โครงสร้างโฟลเดอร์ (Directory Structure)

```text
playground-api/
├── .env.example              # ตัวแปรสภาพแวดล้อมจำลอง
├── .gitignore                # ป้องกันการติดตามไฟล์ที่ไม่จำเป็น
├── jest.config.js            # การตั้งค่า Jest Testing Framework
├── package.json              # กำหนด Dependencies และ Scripts
├── README.md                 # คู่มือการใช้งานโปรเจกต์
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
│   ├── controllers/          # HTTP Controllers
│   ├── middlewares/          # Security, JWT Verification, Zod Validator & Error Handlers
│   ├── migrations/           # 📁 ระบบ Database Migration Runner
│   │   ├── migrate.js        # สคริปต์ประมวลผล Migration
│   │   └── files/            # 📁 โฟลเดอร์เก็บไฟล์ .sql สำหรับ Migrations
│   │       └── 001_create_users_table.sql
│   ├── routes/               # API Routes (Auth, Protected /api)
│   ├── services/             # Business Logic & DB Queries (Auth, User, Main)
│   ├── validators/           # 📁 Zod Data Validation Schemas
│   │   └── mainValidator.js  # Zod Schema สำหรับ POST /api
│   ├── app.js
│   └── server.js
└── tests/                    # 📁 ชุดทดสอบ Unit & Integration Tests
```

---

## 🚀 ขั้นตอนการติดตั้งและการใช้งาน (Getting Started)

### 1. ติดตั้ง Dependencies

```bash
npm install
```

### 2. ตั้งค่า ตัวแปรสภาพแวดล้อม (Environment Variables)

สร้างไฟล์ `.env` โดยคัดลอกตัวแปรจากไฟล์ `.env.example`:

```bash
cp .env.example .env
```

ปรับแต่งข้อมูลการเชื่อมต่อ PostgreSQL ในไฟล์ `.env`:

```env
PORT=3000
NODE_ENV=development

# การตั้งค่า PostgreSQL Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=playground_db
DB_SSL=false

JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=1d

GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

CLIENT_URL=http://localhost:5173
```

### 3. คำสั่งการรันโปรเจกต์ (Scripts)

```bash
# 1. รัน Database Migrations เพื่อสร้างตารางและ Indexes ใน PostgreSQL
npm run migrate

# 2. รันในโหมด Development (มี Auto-Reload ด้วย Nodemon)
npm run dev

# 3. รันในโหมด Production
npm start

# 4. รันการทดสอบ Unit & Integration Tests (Jest)
npm test

# 5. รันการทดสอบแบบ Watch Mode
npm run test:watch

# 6. รันการทดสอบเพื่อดูรายงาน Code Coverage
npm run test:coverage
```

---

## ✅ การทดสอบ Zod Data Validation (`POST /api`)

ตัวอย่างการยิงคำสั่ง cURL เพื่อทดสอบ Zod Validation ใน `POST /api`:

### กรณี 1: ข้อมูลไม่ถูกต้อง (Validation Failed -> HTTP 400)

```bash
curl -X POST http://localhost:3000/api \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"title": "ab", "description": "short"}'
```

**Response (HTTP 400 Bad Request)**:
```json
{
  "success": false,
  "message": "ข้อมูลที่ส่งมาไม่ถูกต้องตามข้อกำหนด (Validation Failed)",
  "errors": [
    {
      "field": "title",
      "message": "หัวข้อ (title) ต้องมีความยาวอย่างน้อย 3 ตัวอักษร"
    }
  ]
}
```

### กรณี 2: ข้อมูลถูกต้องตาม Zod Schema (Success -> HTTP 201)

```bash
curl -X POST http://localhost:3000/api \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"title": "New Product Title", "description": "Valid detailed description text", "category": "technology"}'
```

---

## 🔌 ตารางสรุป API Endpoints

| Method | Endpoint | Description | Authentication Required | Validation Required |
| :--- | :--- | :--- | :---: | :---: |
| `GET` | `/` | ตรวจสอบสถานะการทำงานของ API (Health Check) | ❌ ไม่ต้องมี | ❌ |
| `GET` | `/auth/google` | เริ่มต้นยืนยันตัวตนด้วย Google OAuth 2.0 | ❌ ไม่ต้องมี | ❌ |
| `GET` | `/auth/google/callback` | Google Callback ส่งคืน JWT Token | ❌ ไม่ต้องมี | ❌ |
| `POST` | `/auth/login` | Mock Login สำหรับรับ JWT Token | ❌ ไม่ต้องมี | ❌ |
| `GET` | `/auth/me` | เรียกดูข้อมูล Profile จาก JWT Token | ✅ ต้องมี JWT | ❌ |
| `GET` | `/api` | ดึงข้อมูลภาพรวมหน้าหลัก API | ✅ ต้องมี JWT | ❌ |
| `POST` | `/api` | ส่งและประมวลผลข้อมูลใหม่ | ✅ ต้องมี JWT | ✅ Zod Validation |

---

## 📚 เอกสารเพิ่มเติมในโฟลเดอร์ `docs/`

- 📋 **[docs/ACTIVITY_LOG.md](file:///Users/user/Desktop/playgroud/playground/playground-api/docs/ACTIVITY_LOG.md)**: ประวัติบันทึกกิจกรรมและรายการไฟล์ทั้งหมดในระบบ
- 🔄 **[docs/MULTI_AGENT_WORKFLOW.md](file:///Users/user/Desktop/playgroud/playground/playground-api/docs/MULTI_AGENT_WORKFLOW.md)**: คู่มือและกรอบการทำงานร่วมกันระหว่าง Gemini และ Claude
