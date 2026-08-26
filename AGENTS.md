# 🤖 คำสั่งและข้อตกลงการทำงานสำหรับ AI Agents (AGENTS.md)

ไฟล์นี้เป็นคู่มือกลางสำหรับ AI Coding Assistants ทั้งหมด (รวมถึง **Gemini** และ **Claude**) ที่เข้ามาทำงานใน repository นี้ เพื่อให้เข้าใจโครงสร้างโปรเจกต์ กฎการเขียนโค้ด และแนวทางการทำงานร่วมกัน

---

## 🚫 กฎเหล็ก (Strict Rule): ห้ามใส่ Credit ของ AI หรือ Agent

> **ห้ามใส่ Credit, ลายเซ็น, ป้ายโลโก้ หรือข้อความอ้างอิงถึง AI / Agent ทุกประเภท** ลงในไฟล์โค้ด, คอมเมนต์, เอกสาร (Documentation), Commit messages หรือไฟล์ใดๆ ในโปรเจกต์นี้โดยเด็ดขาด

---

## 📌 ข้อมูลโปรเจกต์ (Project Overview)

- **Repository**: `https://github.com/Nitrocircussx74/playground-api` (GitHub Account: `Nitrocircussx74`)
- **Technology Stack**: Node.js, Express.js, JavaScript (CommonJS)
- **Security Layer**: Helmet (HTTP Header Protection) + Express Rate Limit (DoS/Brute-force Protection)
- **Data Validation Layer**: Zod (`src/validators/`, `src/middlewares/validateMiddleware.js`)
- **Database & Migrations**: PostgreSQL (`pg` Connection Pool) + Custom SQL Migration Runner (`npm run migrate`)
- **Authentication**: JWT (JsonWebToken) + Google OAuth 2.0 (Passport.js)
- **Testing**: Jest + Supertest
- **Architecture**: Layered Clean Architecture (`src/config`, `src/routes`, `src/controllers`, `src/services`, `src/middlewares`, `src/validators`, `src/migrations`)

---

## ⚡ คำสั่งพิเศษ: `update memory` (Memory Sync Protocol)

เมื่อผู้ใช้พิมพ์คำสั่ง **`update memory`** (หรือขอให้อัปเดตความจำ/ความรู้โปรเจกต์):
> **บังคับ (Mandatory)**: AI Agents ต้องทำการอัปเดตไฟล์ข้อมูลและคอนฟิกเหล่านี้พร้อมกันทันที:
> 1. [AGENTS.md](file:///Users/user/Desktop/playgroud/playground/playground-api/AGENTS.md) (ไฟล์นี้)
> 2. [GEMINI.md](file:///Users/user/Desktop/playgroud/playground/playground-api/GEMINI.md)
> 3. [CLAUDE.md](file:///Users/user/Desktop/playgroud/playground/playground-api/CLAUDE.md)
> 4. [docs/ACTIVITY_LOG.md](file:///Users/user/Desktop/playgroud/playground/playground-api/docs/ACTIVITY_LOG.md)
> 5. [README.md](file:///Users/user/Desktop/playgroud/playground/playground-api/README.md)

---

## 🛠️ คำสั่งที่ใช้ในโปรเจกต์ (Core Commands)

```bash
# การรันระบบในโหมดพัฒนา
npm run dev

# การรันระบบในโหมด Production
npm start

# การรันระบบ Database Migrations
npm run migrate

# การรันชุดทดสอบทั้งหมด
npm test

# การรันชุดทดสอบแบบ Watch Mode
npm run test:watch

# การตรวจสอบ Code Coverage
npm run test:coverage
```

---

## 📐 กฎการเขียนโค้ดและดีไซน์ (Code Style & Conventions)

1. **Module System**: ใช้ `require` และ `module.exports` (CommonJS) สอดคล้องกันทั้งโปรเจกต์
2. **Layer Responsibilities**:
   - `routes`: กำหนด Endpoint URL และผูก Middleware (ห้ามใส่ Business Logic ใน Route)
   - `controllers`: รับ HTTP Request, เรียกใช้ Services และส่งคืน HTTP Response
   - `services`: ประมวลผล Business Logic และการติดต่อกับ Database (`src/services/userService.js`)
   - `validators`: กำหนด Zod Validation Schemas (`src/validators/mainValidator.js`)
   - `migrations`: จัดการสร้างและอัปเดตโครงสร้าง Database Schema แบบอัตโนมัติ (`src/migrations/files/*.sql`)
   - `middlewares`: Security (Helmet, Rate Limiting), Auth, Zod Validation และ Error Handling
   - `config`: จัดการการอ่านค่า Environment Variables และการตั้งค่า Third-party libraries (`src/config/db.js`)
3. **Error Handling**: ส่งผ่าน Error ด้วย `next(error)` เสมอเพื่อให้ `errorMiddleware` จัดการ
4. **Language Policy**: ความคิดเห็นในโค้ด (Comments) และเอกสารคำอธิบาย ให้ใช้ **ภาษาไทย** เป็นหลัก

---

## 🤝 ข้อตกลงการทำงานร่วมกันระหว่าง Gemini และ Claude (Multi-Agent Protocol)

1. **อัปเดต Activity Log**: เมื่อ Agent ทำการสร้างหรือแก้ไขไฟล์งาน ให้ลงบันทึกใน [docs/ACTIVITY_LOG.md](file:///Users/user/Desktop/playgroud/playground/playground-api/docs/ACTIVITY_LOG.md) เสมอ
2. **รักษาความสะอาดของโค้ด**: ก่อนจบการทำงาน ให้รัน `npm test` เพื่อตรวจสอบว่าไม่มี Breaking Changes
3. **การส่งมอบงาน (Handover)**: หากต้องส่งต่องานใหีก Agent ให้ระบุสถานะล่าสุดลงใน `docs/ACTIVITY_LOG.md`
