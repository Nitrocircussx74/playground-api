# Node.js + Express REST API Starter (JWT & Google OAuth 2.0)

โปรเจกต์เริ่มต้น REST API พัฒนาด้วย **Node.js** และ **Express** ที่ออกแบบในสถาปัตยกรรมแบบ Clean & Scalable Architecture แบ่งแยกเลเยอร์การทำงานอย่างเป็นระเบียบ พร้อมระบบยืนยันตัวตนที่รองรับทั้ง **JSON Web Token (JWT)** และ **Google OAuth 2.0** รวมถึงชุดทดสอบ **Unit & Integration Test (Jest & Supertest)**

---

## 📌 คุณสมบัติหลัก (Features)

- 🏗️ **Clean & Scalable Architecture**: แบ่งแยกเลเยอร์ชัดเจน (`Config`, `Routes`, `Controllers`, `Services`, `Middlewares`)
- 🔐 **JWT Authentication**: ระบบออกและตรวจสอบ Token สำหรับป้องกัน Route (Protected Routes)
- 🔑 **Google OAuth 2.0 Integration**: ยืนยันตัวตนผ่าน Google ด้วย Passport.js พร้อมออก JWT Token อัตโนมัติเมื่อสำเร็จ
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
│   └── MULTI_AGENT_WORKFLOW.md# กรอบการทำงานร่วมกันระหว่าง Gemini & Claude
├── .agents/
│   └── rules/
│       └── memory.md         # กฎคำสั่งพิเศษ update memory
├── src/                      # 📁 ซอร์สโค้ดของแอปพลิเคชัน
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

ปรับแต่งข้อมูลในไฟล์ `.env`:

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=1d

# รับค่าได้จาก Google Cloud Console
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

CLIENT_URL=http://localhost:5173
```

### 3. คำสั่งการรันโปรเจกต์ (Scripts)

```bash
# รันในโหมด Development (มี Auto-Reload ด้วย Nodemon)
npm run dev

# รันในโหมด Production
npm start

# รันการทดสอบ Unit & Integration Tests (Jest)
npm test

# รันการทดสอบแบบ Watch Mode
npm run test:watch

# รันการทดสอบเพื่อดูรายงาน Code Coverage
npm run test:coverage
```

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
