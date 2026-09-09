# 📋 บันทึกกิจกรรมการพัฒนา (Development Activity Log)

บันทึกสรุปขั้นตอน การดำเนินการสร้างโปรเจกต์ **Node.js + Express REST API Starter (Security, Zod Validation, JWT Best Practices, Google OAuth 2.0 & PostgreSQL)**, ชุดทดสอบ **100% Full API Integration Testing (19/19 Test Cases Passed)**, ระบบ **Multi-Agent Collaboration Setup (Gemini + Claude)** และการสลับใช้งาน **Yarn Package Manager**

---

## 📅 ข้อมูลกิจกรรม (Activity Summary)

- **วันที่ดำเนินการ**: 26 สิงหาคม 2026 (เริ่มโปรเจกต์) — อัปเดตล่าสุด 9 กันยายน 2026
- **สถานะ**: ✅ สำเร็จเสร็จสมบูรณ์ 100% (Phase 1-11: โครงสร้างเริ่มต้น / Phase 12: PIN Verify + Maintenance Payer Billing + Android Download Fix)
- **คำสั่งล่าสุด**: PIN Verify-and-Set Flow, Maintenance Repair Cost Payer & Auto-Billing, Android/LINE PDF Download Fix (ดู Phase 12)
- **Repository**: `https://github.com/Nitrocircussx74/playground-api`

> ⚠️ หมายเหตุ: บันทึกนี้ (Phase 1-11) ครอบคลุมเฉพาะช่วงเริ่มต้นโปรเจกต์ (26 ส.ค. 2026) โค้ดเบสปัจจุบันมีระบบเพิ่มเติมอีกมาก (Prisma ORM, LINE LIFF Tenant Portal, Invoices, Maintenance, Parcels, Announcements ฯลฯ) ที่ยังไม่ได้บันทึกย้อนหลังไว้ที่นี่ทั้งหมด — Phase 12 เป็นการบันทึกงานเซสชันล่าสุดต่อจากสถานะปัจจุบันของโค้ดเบส ไม่ใช่ประวัติการสร้างระบบเหล่านั้นตั้งแต่ต้น

---

## 🛠️ รายละเอียดขั้นตอนการดำเนินงาน (Phases Executed)

### Phase 1: การวางแผนและการตั้งค่าเริ่มต้น (Initialization & Architecture)
- จัดเตรียมโครงสร้างไดเรกทอรีภายใต้แนวคิด Clean & Scalable Architecture
- สลับใช้งาน **Yarn Package Manager** (`yarn.lock` generated)
- สร้างไฟล์ `package.json` กำหนดคำสั่งการรันด้วย Yarn (`yarn dev`, `yarn start`, `yarn migrate`, `yarn test`)

### Phase 2: การตั้งค่าระบบ Security & Server Entrypoints
- **`src/app.js`**: ติดตั้ง `helmet()`, `express-rate-limit`, `cookieParser()`, CORS (`credentials: true`), JSON Parser และ Global Error Handling

### Phase 3: การสร้าง Data Validation Layer (Zod)
- **`src/validators/authValidator.js`**: กำหนด Zod Schema (`loginSchema`) สำหรับตรวจข้อมูล Login (email, password)
- **`src/validators/mainValidator.js`**: กำหนด Zod Schema (`createApiDataSchema`) สำหรับตรวจข้อมูล Request Body (title, description, category)
- **`src/middlewares/validateMiddleware.js`**: สร้าง Validation Middleware รับ Zod Schema ไปตรวจสอบข้อมูล หากไม่ถูกต้องส่งคืน `400 Bad Request` พร้อม Zod Errors ทันที

### Phase 4: การจัดการ Configuration & JWT Best Practices Core
- **`src/config/env.js`**: สร้างโมดูลกลางสำหรับอ่านค่าจาก `.env` เพิ่มตัวแปร `accessSecret`, `refreshSecret`, `accessExpiresIn`, `refreshExpiresIn`
- **`src/config/db.js`**: สร้าง PostgreSQL Connection Pool (`pg.Pool`) พร้อมฟังก์ชันทดสอบการเชื่อมต่อ (`testConnection`)
- **`src/services/authService.js`**: พัฒนาสถาปัตยกรรม Dual Tokens (`generateAccessToken`, `generateRefreshToken`, `saveRefreshToken`, `rotateRefreshToken`, `revokeRefreshToken`)
- **`src/controllers/authController.js`**: จัดการ Login, Google Callback, Refresh Token Rotation (`/auth/refresh`), Logout เคลียร์ Cookie (`/auth/logout`) และ Profile (`/auth/me`)

### Phase 5: การสร้าง Protected & Validated Main API Module (`/api`)
- **`src/services/mainService.js`**: เขียน Business Logic สำหรับการดึงข้อมูลภาพรวมและการประมวลผล POST Data
- **`src/controllers/mainController.js`**: เขียน Controller ควบคุม HTTP Request/Response สำหรับ `/api`
- **`src/routes/apiRoutes.js`**: ครอบ `authMiddleware` (JWT Auth) และ `validate(createApiDataSchema)` (Zod Validation) ที่ `POST /api`

### Phase 6: การตั้งค่าและสร้างชุดทดสอบครอบคลุม API ทุกตัว (100% Coverage Phase)
- **`jest.config.js`**: ตั้งค่า Jest Test Runner สำหรับ Node.js
- **`tests/unit/services/authService.test.js`**: Unit Tests ตรวจสอบ Dual Tokens
- **`tests/unit/middlewares/authMiddleware.test.js`**: Unit Tests ตรวจสอบ authMiddleware
- **`tests/integration/apiRoutes.test.js`**: Full Integration Tests จำลอง HTTP Request ครอบคลุม API Endpoints ทุกตัวในระบบ (`GET /`, `POST /auth/login`, `GET /auth/me`, `POST /auth/refresh`, `POST /auth/logout`, `GET /api`, `POST /api` ทั้งกรณี Valid และ Invalid Body) ผ่านทั้งหมด 19/19 Tests

### Phase 7: การเพิ่มระบบ Database Migration Runner (`yarn migrate`)
- **`src/migrations/migrate.js`**: ระบบตรวจเช็คตาราง `schema_migrations` และรันไฟล์ SQL Migrations ภายใต้ Transaction
- **`src/migrations/files/001_create_users_and_tokens_table.sql`**: DDL Script สำหรับสร้างตาราง `users` และ `refresh_tokens`

### Phase 8: การตั้งค่า Swagger API Docs, Morgan Logging, Double CSRF & Docker Orchestration
- **`src/config/swagger.js`**: ตั้งค่า Swagger OpenAPI 3.0 Specification สำหรับ API Documentation
- **`src/app.js`**: ติดตั้ง **Swagger UI** (`/api-docs`), **Morgan Logging** (`morgan`), และ **Double CSRF Protection** (`/api/csrf-token`)
- **`Dockerfile` & `.dockerignore`**: สร้าง Node.js 20 Alpine Image พร้อมสคริปต์รัน Migration + Start Server
- **`docker-compose.yml`**: จัดการ Container Orchestration สำหรับ `db` (PostgreSQL 16), `backend` (Node.js API) และ `frontend` (Vue 3 Nginx) รองรับการรันผ่าน **Colima** และ Docker Desktop

### Phase 9: การปรับปรุงระบบ CORS สำหรับ Dynamic Localhost Development Ports
- **`src/app.js`**: ปรับแต่ง CORS Middleware ให้อนุญาตการเชื่อมต่อจาก `http://localhost:*` ทุกพอร์ตที่รันโหมดพัฒนา (เช่น 5173, 5174, 5175, 80) โดยคงความปลอดภัยของ `credentials: true` สำหรับ HTTP-Only Cookies ไว้ 100%

### Phase 10: การออกแบบสถาปัตยกรรมและบันทึกแผนงานระบบจัดการหอพัก (Dormitory Management System MVP)
- **`implementation_plan.md`**: บันทึกแผนงานการพัฒนาระบบหอพัก (Prisma PostgreSQL + Express API + Vue 3 Tailwind/Shadcn) ครอบคลุม 7 โมดูลหลัก, Prisma Schema, User Roles & Permissions, API Specifications และ Business Edge Cases

### Phase 11: การออกแบบและบันทึกสถาปัตยกรรมโมดูล Meter Reading & Billing Calculation Engine
- **`billingService.js`**: ออกแบบลอจิกการคำนวณค่าน้ำขั้นต่ำ (Minimum Base Rate), ค่าไฟอัตราคงที่ (Unit Rate), การจัดการ Edge Case มิเตอร์รันกลับไป 0 (`isMeterReset`), และการสร้างใบแจ้งหนี้ภายใต้ Prisma Database Transaction

### Phase 12 (2026-09-09): PIN Verify-and-Set Flow, Maintenance Repair Cost Payer & Auto-Billing, Android/LINE PDF Download Fix
- **Audit ระบบ PIN**: ไล่ตรวจทุก Endpoint ที่เกี่ยวกับ PIN (`pinLogin`, `setupPin`, `changePin`, `checkAuthStatus`, `verifyPhoneStatus`, `linkAndLogin`) พบว่า `linkAndLogin` (ยืนยันตัวตนด้วยเบอร์โทร+PIN เพื่อผูก LINE ตึกใหม่) ยังไม่มีทางตั้ง PIN ใหม่ได้เลยถ้าบัญชียังไม่เคยตั้ง PIN มาก่อน (บล็อกด้วย `PIN_NOT_SET` เฉยๆ)
  - **`src/controllers/authController.js`**: แก้ `linkAndLogin` ให้ถ้า `!tenant.pinHash` ให้ถือว่า PIN ที่ส่งมาคือ PIN ใหม่ที่ต้องการตั้ง แล้วบันทึกทันทีในคำขอเดียวกัน (พร้อมเพิ่ม validate รูปแบบ PIN 6 หลักที่ขาดไปเดิม) ส่ง `pinCreated` กลับไปให้ Frontend ทราบ
  - **`src/controllers/liffController.js`**: `linkTenantAccount` (ผูกบัญชีเดิมด้วย Invite Code) และ `registerTenantWithInvite` (ลงทะเบียนใหม่ด้วย Invite Code) เดิมไม่เคยส่ง `hasPin` กลับไปเลย ทำให้ลูกบ้านกลุ่มนี้ไม่เคยถูกพาไปตั้ง PIN — เพิ่ม `hasPin` ในผลลัพธ์ทั้งคู่ และตัดฟิลด์อ่อนไหว (`pinHash` ฯลฯ) ที่ `registerTenantWithInvite` เคยส่งกลับไปแบบดิบๆ ออก (ป้องกัน Data Leak)
  - เพิ่มเทส `tests/integration/hybridAuth.test.js` (3 เคสใหม่) และ `tests/integration/liffAccountLinking.test.js` (assert `hasPin` + เคส `register/invite`) ครอบคลุม Flow ใหม่
- **ระบบผู้รับผิดชอบค่าซ่อม (Maintenance Payer) + รวมบิลอัตโนมัติ**:
  - **`prisma/schema.prisma`**: เพิ่ม `payer` (MANAGEMENT/TENANT, default MANAGEMENT) และ `billedInvoiceId` (FK → Invoice) ใน `MaintenanceRequest` — push ผ่าน `prisma db push`
  - **`src/controllers/maintenanceController.js`**: รับ/validate `payer` ตอนสร้าง/อัปเดตงานซ่อม บล็อกการแก้ `repairCost`/`payer` ถ้าถูกรวมเข้าบิลไปแล้ว (เทียบค่าที่เปลี่ยนจริงเท่านั้น ไม่บล็อกฟิลด์อื่น)
  - **`src/services/billingService.js` (`generateInvoice`)**: ตอนออกบิลห้องไหน จะดึงค่าซ่อม `payer=TENANT` ที่ `resolved` และยังไม่เคยถูกบิล (`billedInvoiceId: null`) มารวมเป็น `otherFee` อัตโนมัติพร้อม Note รายการ แล้ว `updateMany` mark ว่าบิลแล้วภายใน Transaction เดียวกัน กันเรียกเก็บซ้ำข้ามรอบบิล
  - เพิ่มไฟล์เทสใหม่ **`tests/integration/maintenanceBilling.test.js`** (6 เคส): validate payer, รวมเฉพาะ TENANT (ไม่รวม MANAGEMENT), กันเก็บซ้ำ, บล็อกแก้ไขหลังบิลแล้ว
- **แก้บั๊กดาวน์โหลดใบแจ้งหนี้/ใบเสร็จไม่ได้บน Android ใน LINE**:
  - **`src/controllers/invoiceController.js`**: `exportInvoicePdf` และ `exportReceiptPdf` เดิม set `Content-Disposition: inline` ทำให้เปิดผ่าน External Browser บน Android (Custom Tab/WebView ที่ LINE เปิดให้เวลากดดาวน์โหลด) แสดงผล PDF ในหน้าเว็บแทนที่จะดาวน์โหลดจริง (iOS Safari ยังพอกดปุ่มแชร์เซฟได้ แต่ Android ส่วนใหญ่ไม่มีปุ่มให้กด) — แก้เป็น `attachment` ทั้งคู่
  - เพิ่มเทสคุมใน `tests/integration/payment.test.js` (2 เคสใหม่) assert ว่า Content-Disposition ต้องเป็น `attachment` เสมอ กันกลับไปเป็น `inline` อีกในอนาคต
- **Test Verification**: รัน `yarn test` เต็ม Suite ผ่าน 192/193 (เหลือ 1 เทสเดิมที่ Flaky อยู่ก่อนแล้วใน `liffAccountLinking.test.js` เพราะ Test Design ใช้ `tenant.findFirst()` แบบไม่เจาะจง ไม่เกี่ยวกับงานเซสชันนี้)
- **⚠️ พบและแก้ไข Data Corruption ระหว่างตรวจงาน**: การรัน `liffAccountLinking.test.js` ซ้ำหลายรอบทำให้ tenant ทดสอบ ("sear sear", phone `0895556677`) ถูก Test เขียนทับ `lineDisplayName`/`linePictureUrl` ด้วยข้อมูลปลอมค้างไว้ (ไม่มี `afterAll` restore เดิม) — เคลียร์ข้อมูลกลับเป็น `null` ให้แล้ว และแก้ไฟล์เทสให้จด-restore ค่าเดิมเสมอ (`beforeAll`/`afterAll` + `try/finally`) กันไม่ให้เกิดซ้ำ

---

## 📂 สรุปรายการไฟล์ทั้งหมดที่สร้างขึ้น (Created Files Inventory)

| ลำดับ | ชื่อไฟล์ / พาธ | ชนิดไฟล์ | หน้าที่และความรับผิดชอบ |
| :---: | :--- | :---: | :--- |
| 1 | `playground-api/package.json` | JSON | กำหนด Dependencies (รวม cookie-parser) และ Scripts การรัน |
| 2 | `playground-api/yarn.lock` | Lockfile | ไฟล์ล็อกสเปกเวอร์ชันของ Dependencies สำหรับ Yarn Package Manager |
| 3 | `playground-api/.env.example` | ENV | แม่แบบกำหนดตัวแปรสภาพแวดล้อม (App, DB, JWT Access/Refresh Secrets, OAuth) |
| 4 | `playground-api/.gitignore` | Git | ละเว้นโฟลเดอร์ `node_modules` และไฟล์ `.env` |
| 5 | `playground-api/jest.config.js` | JS Config | กำหนดการตั้งค่าสำหรับการรัน Jest Test Framework |
| 6 | `playground-api/AGENTS.md` | Markdown | ข้อตกลงกลางและคำสั่งสำหรับ AI Agents ทั้งหมดในการทำงานร่วมกัน |
| 7 | `playground-api/CLAUDE.md` | Markdown | คำสั่งเฉพาะและแนวทางการทำงานสำหรับ Claude Agent |
| 8 | `playground-api/GEMINI.md` | Markdown | คำสั่งเฉพาะและแนวทางการทำงานสำหรับ Gemini Agent |
| 9 | `playground-api/docs/MULTI_AGENT_WORKFLOW.md` | Markdown | กรอบการทำงานและการแบ่งบทบาทหน้าที่ระหว่าง Gemini และ Claude |
| 10 | `playground-api/docs/schema.sql` | SQL Script | DDL สคริปต์สำรองสำหรับสร้างตาราง `users` และ `refresh_tokens` |
| 11 | `playground-api/.agents/rules/memory.md` | Rule | กฎคำสั่งพิเศษ `update memory` สำหรับ AI Agents |
| 12 | `playground-api/src/config/env.js` | JS Module | รวมและส่งออกค่า Environment Variables (App, DB, JWT, OAuth) |
| 13 | `playground-api/src/config/db.js` | JS Config | ตั้งค่า PostgreSQL Connection Pool (`pg.Pool`) และฟังก์ชันทดสอบการเชื่อมต่อ |
| 14 | `playground-api/src/config/passport.js` | JS Module | ตั้งค่า Google OAuth 2.0 Strategy ร่วมกับ `userService` |
| 15 | `playground-api/src/validators/authValidator.js` | JS Validator | Zod Schemas ตรวจสอบความถูกต้องของ Request Body ใน Endpoint Auth (`loginSchema`) |
| 16 | `playground-api/src/validators/mainValidator.js` | JS Validator | Zod Schemas ตรวจสอบความถูกต้องของ Request Body (`createApiDataSchema`) |
| 17 | `playground-api/src/middlewares/validateMiddleware.js` | JS Middleware | Validation Middleware นำ Zod Schema มาตรวจ Request ก่อนเข้า Controller |
| 18 | `playground-api/src/migrations/migrate.js` | JS Script | ระบบรัน Database Schema Migrations ภายใต้ SQL Transaction |
| 19 | `playground-api/src/migrations/files/001_create_users_and_tokens_table.sql` | Migration SQL | ไฟล์ DDL Migration สำหรับสร้างตาราง `users` และ `refresh_tokens` |
| 20 | `playground-api/src/services/authService.js` | JS Service | จัดการ Dual Tokens, Token Rotation และ Database Storage/Revocation |
| 21 | `playground-api/src/services/userService.js` | JS Service | จัดการการค้นหาและบันทึกข้อมูลผู้ใช้ลง PostgreSQL |
| 22 | `playground-api/src/services/mainService.js` | JS Service | จัดการ Business Logic สำหรับ Endpoint หลัก `/api` |
| 23 | `playground-api/src/middlewares/authMiddleware.js` | JS Middleware | ตรวจสอบ JWT Access Token ป้องกัน Protected Routes |
| 24 | `playground-api/src/middlewares/errorMiddleware.js` | JS Middleware | จัดการ Error 404 และ Global Error 500 รวมศูนย์ |
| 25 | `playground-api/src/controllers/authController.js` | JS Controller | ควบคุม Login, Google OAuth, Refresh Token Cookie, Logout และ Profile |
| 26 | `playground-api/src/controllers/mainController.js` | JS Controller | ควบคุม Request/Response สำหรับ `GET /api` และ `POST /api` |
| 27 | `playground-api/src/routes/authRoutes.js` | JS Route | เส้นทางสำหรับระบบ Auth (`/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/google`, `/auth/me`) |
| 28 | `playground-api/src/routes/apiRoutes.js` | JS Route | เส้นทางสำหรับ `/api` ครอบด้วย `authMiddleware` และ Zod Validation |
| 29 | `playground-api/src/routes/index.js` | JS Route | Master Router รวมเส้นทางทั้งหมด |
| 30 | `playground-api/src/app.js` | JS App | ประกอบ Express App, Helmet, Rate Limiter, CORS credentials, Cookie Parser, Body Parsers และ Routes |
| 31 | `playground-api/src/server.js` | JS Entrypoint | จุดเริ่มต้นเปิด HTTP Server และการทดสอบเชื่อมต่อ PostgreSQL |
| 32 | `playground-api/tests/unit/services/authService.test.js` | Test File | Unit Tests สำหรับ AuthService (Passed 4/4) |
| 33 | `playground-api/tests/unit/middlewares/authMiddleware.test.js` | Test File | Unit Tests สำหรับ authMiddleware (Passed 3/3) |
| 34 | `playground-api/tests/integration/apiRoutes.test.js` | Test File | Full Integration Tests สำหรับ Endpoints ทั้งหมดในระบบ (Passed 12/12) |
| 35 | `playground-api/README.md` | Markdown | เอกสารคู่มือการใช้งานโปรเจกต์ภาษาไทย (Yarn Supported) |
| 36 | `playground-api/docs/ACTIVITY_LOG.md` | Markdown | เอกสารบันทึกกิจกรรมการพัฒนาโปรเจกต์ |
| 37 | `playground-api/tests/integration/maintenanceBilling.test.js` | Test File | Integration Tests สำหรับ Maintenance Payer + Auto-Billing เข้าใบแจ้งหนี้รอบถัดไป (Passed 6/6) |
