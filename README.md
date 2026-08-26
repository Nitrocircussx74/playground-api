# Node.js + Express REST API Starter (JWT, Google OAuth 2.0 & PostgreSQL)

โปรเจกต์เริ่มต้น REST API พัฒนาด้วย **Node.js** และ **Express** ที่ออกแบบในสถาปัตยกรรมแบบ Clean & Scalable Architecture แบ่งแยกเลเยอร์การทำงานอย่างเป็นระเบียบ พร้อมระบบยืนยันตัวตนที่รองรับทั้ง **JSON Web Token (JWT)**, **Google OAuth 2.0**, ระบบ **PostgreSQL Database + Migration Runner** รวมถึงชุดทดสอบ **Unit & Integration Test (Jest & Supertest)**

---

## 📌 คุณสมบัติหลัก (Features)

- 🏗️ **Clean & Scalable Architecture**: แบ่งแยกเลเยอร์ชัดเจน (`Config`, `Routes`, `Controllers`, `Services`, `Middlewares`, `Migrations`)
- 🐘 **PostgreSQL Integration**: เชื่อมต่อผ่าน `pg` Connection Pool ประสิทธิภาพสูง
- 🔄 **SQL Migration Runner**: ระบบจัดการและบันทึกประวัติ Database Schema Migrations อัตโนมัติ (`npm run migrate`)
- 🔐 **JWT Authentication**: ระบบออกและตรวจสอบ Token สำหรับป้องกัน Route (Protected Routes)
- 🔑 **Google OAuth 2.0 Integration**: ยืนยันตัวตนผ่าน Google ด้วย Passport.js พร้อมบันทึกผู้ใช้ลง PostgreSQL
- 🛡️ **Protected Route Middlewares**: Middleware กั้นทางเข้าถึง `/api` เพื่อบังคับแนบ `Authorization: Bearer <TOKEN>`
- 🚨 **Centralized Error Handling**: ระบบจัดการ Error และ 404 Not Found แบบรวมศูนย์
- 🧪 **Unit & Integration Tests**: ชุดทดสอบพร้อมใช้งานด้วย Jest และ Supertest
- 🤖 **Multi-Agent Support**: ระบบไฟล์คอนฟิกสำหรับให้ Gemini และ Claude ทำงานร่วมกันได้อย่างราบรื่น

---

## 📁 โครงสร้างโฟลเดอร์ (Directory Structure)

```text
playground/
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
│   ├── middlewares/          # JWT Verification & Error Handlers
│   ├── migrations/           # 📁 ระบบ Database Migration Runner
│   │   ├── migrate.js        # สคริปต์ประมวลผล Migration
│   │   └── files/            # 📁 โฟลเดอร์เก็บไฟล์ .sql สำหรับ Migrations
│   │       └── 001_create_users_table.sql
│   ├── routes/               # API Routes (Auth, Protected /api)
│   ├── services/             # Business Logic & DB Queries (Auth, User, Main)
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

## 🐘 การสร้างไฟล์ Migration ใหม่ (Adding New Migrations)

เมื่อต้องการสร้างตารางหรืออัปเดตโครงสร้าง Database ให้สร้างไฟล์ SQL ใหม่ใน `src/migrations/files/` โดยตั้งชื่อเรียงตามลำดับ เช่น:

```text
src/migrations/files/
├── 001_create_users_table.sql
├── 002_create_products_table.sql
└── 003_add_index_to_products.sql
```

จากนั้นสั่งรันด้วยคำสั่ง:
```bash
npm run migrate
```
ระบบจะทำการตรวจเช็คตาราง `schema_migrations` และรันเฉพาะไฟล์ Migration ใหม่โดยอัตโนมัติภายใต้ Transaction เพื่อความปลอดภัยของข้อมูล

---

## 🔌 ตารางสรุป API Endpoints

| Method | Endpoint | Description | Authentication Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/` | ตรวจสอบสถานะการทำงานของ API (Health Check) | ❌ ไม่ต้องมี |
| `GET` | `/auth/google` | เริ่มต้นยืนยันตัวตนด้วย Google OAuth 2.0 | ❌ ไม่ต้องมี |
| `GET` | `/auth/google/callback` | Google Callback ส่งคืน JWT Token | ❌ ไม่ต้องมี |
| `POST` | `/auth/login` | Mock Login สำหรับรับ JWT Token | ❌ ไม่ต้องมี |
| `GET` | `/auth/me` | เรียกดูข้อมูล Profile จาก JWT Token | ✅ ต้องมี JWT |
| `GET` | `/api` | ดึงข้อมูลภาพรวมหน้าหลัก API | ✅ ต้องมี JWT |
| `POST` | `/api` | ส่งและประมวลผลข้อมูลใหม่ | ✅ ต้องมี JWT |

---

## 📚 เอกสารเพิ่มเติมในโฟลเดอร์ `docs/`

- 📋 **[docs/ACTIVITY_LOG.md](file:///Users/user/Desktop/playgroud/playground/docs/ACTIVITY_LOG.md)**: ประวัติบันทึกกิจกรรมและรายการไฟล์ทั้งหมดในระบบ
- 🔄 **[docs/MULTI_AGENT_WORKFLOW.md](file:///Users/user/Desktop/playgroud/playground/docs/MULTI_AGENT_WORKFLOW.md)**: คู่มือและกรอบการทำงานร่วมกันระหว่าง Gemini และ Claude
