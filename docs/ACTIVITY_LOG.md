# 📋 บันทึกกิจกรรมการพัฒนา (Development Activity Log)

บันทึกสรุปขั้นตอน การดำเนินการสร้างโปรเจกต์ **Node.js + Express REST API Starter (Security, Zod Validation, JWT Best Practices, Google OAuth 2.0 & PostgreSQL)**, ชุดทดสอบ **100% Full API Integration Testing (19/19 Test Cases Passed)**, ระบบ **Multi-Agent Collaboration Setup (Gemini + Claude)** และการสลับใช้งาน **Yarn Package Manager**

---

## 📅 ข้อมูลกิจกรรม (Activity Summary)

- **วันที่ดำเนินการ**: 26 สิงหาคม 2026 (เริ่มโปรเจกต์) — อัปเดตล่าสุด 10 กันยายน 2026
- **สถานะ**: ✅ สำเร็จเสร็จสมบูรณ์ 100% (Phase 1-11: โครงสร้างเริ่มต้น / Phase 12: PIN Verify + Maintenance Payer Billing + Android Download Fix / Phase 13: Account Takeover Security Fix + Room Owner + Notification Log / Phase 14: Full Audit ระบบ HorHub + errorMiddleware statusCode Fix + Service Layer Refactor / Phase 15: Mock Mode / Dev Fallback Decoupling Fix + Brand Theme Color Default)
- **คำสั่งล่าสุด**: แก้ `liffAuthMiddleware.js`/`liffController.js` ไม่ให้ `LINE_AUTH_MOCK_MODE` ปนกับ Logic "ปล่อยผ่านแบบไม่มี Token" อีกต่อไป (เปิดค้างบนเครื่อง Dev ได้ถาวรโดยไม่ทำ Test Suite พัง), เปลี่ยน Default `themeColor` ทั้งระบบจาก Blue `#3B82F6` เป็น HorHub Teal `#0E7490` (ดู Phase 15)
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

### Phase 13 (2026-09-10): Audit & แก้ช่องโหว่ Account Takeover ใน LIFF PIN Flow + Room Owner / Notification Log
- **Audit Flow การ Login ของลูกบ้านผ่าน LINE และ Web**: ไล่ตรวจทุก Endpoint ที่เกี่ยวกับ PIN/การผูกบัญชี (`pinLogin`, `setupPin`/`reset-pin`, `linkAndLogin`, `verifyPhoneAndLinkTenant`, `loginWeb`) พบช่องโหว่ระดับ Critical: รู้แค่เบอร์โทรของลูกบ้านก็ยึดบัญชีได้ทันที ไม่ต้องพิสูจน์ความเป็นเจ้าของเบอร์เลย
  - **`src/controllers/authController.js` (`setupPin`/`reset-pin`)**: เดิมค้นหา Tenant จากเบอร์โทรอย่างเดียวแล้วเขียนทับ PIN + ออก JWT ให้เลย — แก้ให้ต้องมี Identity ที่ Verify แล้ว (LINE ID Token จริง หรือ Session JWT) ก่อนเสมอ, เลิกเชื่อ `req.body.lineUserId` ที่ไม่ผ่านการ Verify, ปฏิเสธ `403 ACCOUNT_ALREADY_LINKED` ถ้าบัญชีตั้ง PIN และผูก LINE คนอื่นไว้แล้ว
  - **`src/controllers/authController.js` (`linkAndLogin`)**: เดิมถ้า Tenant ยังไม่เคยตั้ง PIN จะเอา PIN ที่ Client ส่งมาตั้งเป็นของจริงทันที (ไม่ต้องเดา PIN เลย) — แก้ให้ต้องมี LINE ID Token ที่ Verify ผ่านจริงเสมอ และตอบ `400 PIN_NOT_SET` เหมือน `pinLogin` แทน (ไม่เช็ค `tenant.lineUserId` ซ้ำ เพราะ Endpoint นี้ตั้งใจรองรับ Centralized Multi-Building Identity อยู่แล้ว)
  - **`src/controllers/liffController.js` (`verifyPhoneAndLinkTenant`)**: ปฏิเสธ `403 ACCOUNT_ALREADY_LINKED` ถ้าเบอร์โทรตรงกับ Tenant ที่ผูก LINE คนอื่นไว้แล้ว แทนที่จะเขียนทับเงียบๆ
  - **`src/routes/authRoutes.js`, `src/routes/liffRoutes.js`**: เพิ่ม Rate Limiter (8 ครั้ง/15 นาที ต่อ IP) ให้ `pin-login`, `setup-pin`, `reset-pin`, `link-and-login`, `verify-phone-status`, `verify-phone`, `login/local`, `web/login` ทั้งสองเส้นทาง (ปิดใน Test Env กัน Integration Test ติด 429)
  - ปรับ `tests/integration/hybridAuth.test.js` และ `tests/integration/liffSmartEntry.test.js` (รวม 2 เทสใหม่ที่ assert พฤติกรรมความปลอดภัยใหม่แทนพฤติกรรมช่องโหว่เดิม)
- **แก้บั๊ก Web Login พังทุกครั้งแม้ PIN ถูกต้อง**: `WebLogin.vue` (Frontend) อ้างตัวแปร `tenant`/`user`/`rooms`/`building`/`accessToken` โดยไม่เคย Destructure จาก `res.data.data` เลย → ล็อกอินสำเร็จทุกครั้งแต่โยน `ReferenceError` แล้วโดน Catch กลืนไปแสดง "เบอร์โทรศัพท์หรือรหัส PIN ไม่ถูกต้อง"
- **Test Verification**: รัน `yarn test` เต็ม Suite ผ่าน 206/206 (เพิ่มขึ้นจาก 192/193 เดิม)
- **รวม Commit งาน Room Owner / Notification Log ที่ค้างอยู่**: Commit งานที่พัฒนาไว้ก่อนหน้าแต่ยังไม่เคย Commit เข้า Git History — เพิ่มโมเดล `NotificationLog` (ติดตามการส่งแจ้งเตือน LINE/SMS ราย Building/Tenant/Room), โมเดล `RoomResident` (ผู้อยู่อาศัยร่วมห้อง/Co-Resident), และความสัมพันธ์ `Room.owner` (User เจ้าของห้อง) พร้อม Controller/Service ที่ขยายรองรับ (`dashboardController`, `buildingController`, `roomController`, `maintenanceController`, `invoiceController`, `lineService`, `tenantService`) — ทดสอบผ่านครบก่อน Commit

### Phase 14 (2026-09-10): Full Audit ระบบ HorHub (หอฮับ) + errorMiddleware statusCode Fix + Service Layer Refactor
- **Audit ทั้งระบบ HorHub (LIFF Onboarding, Auth, Invite, Billing)**: ไล่ตรวจ Flow ทั้งหมดตั้งแต่ `authController.js`, `liffController.js`, `liffAuthMiddleware.js` จนถึง `prisma/schema.prisma` พบ 6 ประเด็น:
  1. **🔴 Critical — Account Takeover ผ่าน `GET /api/v1/liff/check-status?tenantId=...`**: `checkTenantStatus` มี 3 ทางผูก `lineUserId` อัตโนมัติ (phone/roomNumber/tenantId) แต่ทาง `tenantId` ทางเดียวไม่เช็ค `!matched.lineUserId` ก่อนเขียนทับเหมือน 2 ทางที่เหลือ — ใครก็ตามที่ล็อกอิน LINE ของตัวเองแล้วรู้ `tenantId` (UUID) ของคนอื่น ยึดบัญชีได้ทันทีโดยไม่ต้องรู้เบอร์โทร/PIN เลย
  2. **🟠 Payment Fallback ข้ามตึก**: `getSettingsForTenant` เดิมถ้า resolve ตึกของลูกบ้านไม่เจอ จะ Fallback ไป "ดึงตึกแรกในระบบ" แล้วส่ง PromptPay Number ของตึกนั้นกลับไปแทน เสี่ยงลูกบ้านโอนเงินผิดบัญชีข้ามตึก
  3. **🟡 เงื่อนไขห้องว่างไม่ตรงกันระหว่าง `registerTenantWithInvite` กับ `verifyInviteCode`**: Endpoint แรกเช็ค `room.status !== 'available' && !room.tenantId` (ต้องทั้งคู่จริง) ส่วน Endpoint หลังเช็คแค่ `room.status !== 'available'` — ทำให้ verify ผ่านแต่ register จริงอาจไม่ผ่าน
  4. **🟡 ระบบ Invite Code ซ้อนกัน 2 ระบบ**: `Tenant.inviteCode` (ผูกบัญชีเดิม, สุ่มด้วย `Math.random()`) กับ `RoomInvite.code` (ลงทะเบียนใหม่, สุ่มด้วย `crypto`) — ใช้ RNG ไม่เท่ากัน และมี `liffController.generateTenantInvite` เป็น Dead Code ซ้ำกับ `tenantService.generateInvite` (ไม่ได้ผูก Route ไหนเลย)
  5. **🟢 โค้ด Normalize เบอร์โทรซ้ำ 6+ จุด** ใน `authController.js`/`liffController.js` และไม่ตรงกันเป๊ะทุกจุด (`loginWeb`/`verifyPhoneAndLinkTenant` ขาด Variant "ตัดเลข 0 นำหน้า" ที่อีก 4 จุดมี)
  6. **🔴 `errorMiddleware.js` ไม่เคยอ่าน `err.statusCode`**: Error ที่ Service `throw` พร้อม `.statusCode` ตั้งใจไว้ (เช่น 404/403 ใน `tenantService.js`) กลายเป็น `500` เสมอเมื่อ Controller ส่งต่อด้วย `next(error)` — พบระหว่างรัน Test เต็ม Suite (ทำให้ `meterImportBatch.test.js` หลุดตอนรันรวมกับ Suite อื่น)
- **แก้ครบทั้ง 6 ข้อ**:
  - `checkTenantStatus`: เติม Guard `!matched.lineUserId` ก่อนผูก LINE ให้ Tenant จาก `tenantId`
  - `getSettingsForTenant`: คืน `404` แทนการเดาตึกแรกในระบบ เมื่อมีการระบุตัวตนมาแล้วแต่ resolve ไม่เจอ (คงพฤติกรรม Fallback เดิมไว้เฉพาะกรณีไม่มีข้อมูลระบุตัวตนมาเลย)
  - `registerTenantWithInvite`: ปรับเงื่อนไขห้องว่างให้ตรงกับ `verifyInviteCode`
  - Invite Code: เปลี่ยน `Math.random()` → `crypto.randomInt()` ทั้งใน `tenantService.generateInvite` (ตัวจริงที่ Route ใช้งาน) และลบ `liffController.generateTenantInvite` (Dead Code) ทิ้ง
  - เพิ่ม `src/utils/normalizePhone.js` (`getPhoneVariants`) รวม Logic Normalize เบอร์โทรเป็นจุดเดียว ใช้แทนของเดิมทั้ง 6 จุด (แก้ผลพลอยได้: Variant ที่ขาดหายไปด้วย)
  - `errorMiddleware.js`: อ่าน `err.statusCode || err.status` ก่อนเสมอ พร้อม Pass ผ่าน `err.code`/`err.data` เพิ่มเติมถ้ามี (Backward-Compatible กับพฤติกรรมเดิม 100%)
- **Refactor โครงสร้างตามกฎ `CLAUDE.md` ("ห้ามเขียน SQL/JWT Sign-Verify ใน Controller")**: `authController.js` (1300+ → 326 บรรทัด) และ `liffController.js` (1750+ → 437 บรรทัด) เดิมเรียก `prisma`/`billingService.prisma` ตรงๆ เกือบทุกเมธอด ย้าย Business Logic ทั้งหมดออกเป็น:
  - **`src/services/tenantAuthService.js` (ใหม่)**: รวม Login/PIN/Link ทุกรูปแบบของ Tenant (`loginWithLine`, `pinLogin`, `setupOrResetPin`, `changePin`, `checkAuthStatus`, `verifyPhoneStatus`, `linkAndLogin`, `loginLocal`, `setupPassword`, `loginWeb`, `silentLogin`) คืนผลเป็น `{ statusCode, body, refreshToken }` ให้ Controller ส่งต่อโดยไม่เปลี่ยนรูป Response เดิมแม้แต่ Field เดียว
  - **`src/services/tenantService.js` (ขยาย)**: เพิ่ม `checkTenantStatus`, `verifyPhoneAndLinkTenant`, `linkTenantAccountByInviteCode`, `syncLineProfile`, `getTenantProfileForLiff`, `updateTenantContactPhone`, `getBuildingSettingForTenant`, `registerTenantWithInvite`, `verifyInviteCode`, `createRoommateInvite`, `getBuildingPublicInfo`
  - **`src/services/billingService.js` (ขยาย)**: เพิ่ม `getInvoiceForLiff`, `getInvoiceQrImage`, `uploadSlipFromLiff`
  - **Circular Dependency ที่เจอระหว่าง Refactor**: `slipService.js` require `billingService.js` อยู่แล้ว ถ้าให้ `billingService.js` require `slipService.js` กลับตรงๆ ที่ Top-level จะวนลูปกันจนฝั่งใดฝั่งหนึ่งได้ Module ที่โหลดไม่ครบ (ขึ้นกับลำดับการโหลดตอน Start) — แก้ด้วยการ `require('./slipService')` แบบ Lazy ข้างในเมธอด `uploadSlipFromLiff` แทน
  - พบบั๊กเล็กเป็นของแถมระหว่างย้ายโค้ด: `createRoommateInvite` เดิมอ้าง `targetRoom.building?.name` ที่ Query ไม่เคย `include` building มาด้วย เลย Fallback เป็น "อาคารหลัก" เสมอแม้ตึกมีชื่อจริง — แก้ให้อ่านจาก `invite.room.building` ที่ Query จริงมี
- **Test Verification**: รัน `yarn jest --runInBand` เต็ม Suite ผ่าน **206/206** ทุกครั้งที่แก้ (ยืนยันไม่มี Behavior เปลี่ยนแปลงจากการย้ายโค้ดเข้า Service Layer)

### Phase 15 (2026-09-10): Mock Mode / Dev Fallback Decoupling Fix + Brand Theme Color Default + NotificationLog ครอบคลุม LINE API Failure
- **บริบท**: ผู้ใช้ทดสอบ LIFF Onboarding Flow จริงผ่าน Browser/Tunnel ต่อจาก Phase 14 แล้วเจอ Error "LINE ID Token ไม่ถูกต้องหรือหมดอายุแล้ว" ระหว่างตั้ง PIN — ไล่ Debug จนเจอปัญหาเชิงโครงสร้างที่ `LINE_AUTH_MOCK_MODE` (Flag สำหรับข้าม Network Call ไปตรวจ Token กับ LINE จริงตอน Dev/Test) ถูกใช้ปนกับ "อนุญาตให้ Request ที่ไม่มี Token เลยผ่านไปแบบ Anonymous" ในหลายจุด ทำให้เปิด Flag นี้ไว้ทดสอบผ่าน Browser ไม่ได้เลยโดยไม่ทำ Integration Test (`NODE_ENV=test`) ที่ตั้งใจเช็ค 401 พังไปด้วย (Test คนละเรื่องกับ Dev Fallback แต่ดันแชร์เงื่อนไขเดียวกัน)
- **แก้ Decoupling ครบ 3 จุด**: แยก "ข้าม Verify กับ LINE จริง" (mockMode, ควรมีผลแค่ตอน**มี** token ส่งมา) ออกจาก "ปล่อยผ่านแบบไม่มี Token" (ควรผูกกับ `nodeEnv==='development'` อย่างเดียว)
  - `src/middlewares/liffAuthMiddleware.js`: 2 จุด (ไม่มี `X-Line-Id-Token` Header เลย / `verifyLineIdToken` throw)
  - `src/controllers/liffController.js` (`silentLogin`): 1 จุด (`isDevOrMock` ที่ส่งต่อไป `tenantAuthService.silentLogin`)
  - ผลคือเปิด `LINE_AUTH_MOCK_MODE=true` ค้างไว้บนเครื่อง Dev ได้ถาวรแล้ว ไม่ต้องคอยเปิด-ปิดสลับไปมาก่อน/หลังรัน `yarn test` อีกต่อไป
  - อัปเดต `tests/unit/middlewares/liffAuthMiddleware.test.js` ให้ปลอม `config.line.mockMode = false` คู่กับ `config.nodeEnv` เสมอ (เดิมปลอมแค่ nodeEnv พอ .env จริงมี mockMode=true ค้างอยู่ก็ Short-circuit เหมือนเดิมจนเทสต์พัง)
- **เปลี่ยน Default Theme Color ทั้งระบบจาก Blue → HorHub Teal**: Sample สีจากโลโก้จริงด้วยสคริปต์อ่าน Pixel PNG ได้ Cluster สีหลัก `#1B6C7D`–`#239C93` เลือก `#0E7490` (ใกล้เคียง Tailwind `cyan-700` ที่สุด) เป็นค่า Default แทน `#3B82F6` (Blue-500) เดิมทุกจุดที่เป็น Fallback (ไม่แตะค่าที่เป็น Preset ตัวเลือกให้แอดมินเลือกเอง เช่น "น้ำเงิน (Blue)" ใน `BuildingSettingsView.vue`):
  - `src/controllers/buildingController.js` (Default ตอนสร้างตึกใหม่ไม่ระบุสี), `src/services/tenantService.js` (7 จุด Fallback ตอนส่งข้อมูลให้ LIFF)
- **ขยาย NotificationLog ให้ครอบคลุม LINE API Failure ระดับ Auth (ไม่ใช่แค่ Push Message)**: ตอบคำถาม "ควรมี api_log ไหม" — พบว่ามี `NotificationLog` + `lineService.logDelivery()` อยู่แล้วสำหรับ Push Message แต่ `verifyLineIdToken` (Token Verify) กับ `getUserProfile` (Profile Fetch) ไม่เคย Log เลย ถ้า LINE API มีปัญหาจะไม่มีทางรู้ย้อนหลัง
  - `prisma/schema.prisma`: เปลี่ยน `NotificationLog.buildingId` เป็น Nullable (`onDelete: SetNull`) เพราะเหตุการณ์ระดับ Auth มักยังไม่รู้ตึก — Push ผ่าน `prisma db push` แล้ว
  - `src/middlewares/liffAuthMiddleware.js`: Log `AUTH_VERIFY/FAILED` เฉพาะ Network Error หรือ HTTP 5xx/429 (Outage/Rate Limit ฝั่ง LINE จริง) **ไม่ Log** กรณี Token หมดอายุ/ไม่ถูกต้องแบบ 400 ปกติ (พฤติกรรมผู้ใช้งานทั่วไป ไม่ใช่ปัญหา LINE API กันรก Log)
  - `src/services/lineService.js` (`getUserProfile`): Log `PROFILE_FETCH/FAILED` ทุกครั้งที่ดึงโปรไฟล์ไม่สำเร็จ
  - Query ดู LINE API Failure ทั้งหมดได้จากที่เดียว: `notification_logs WHERE notification_type IN ('AUTH_VERIFY','PROFILE_FETCH') AND status='FAILED'`
- **Test Verification**: รัน `yarn jest --runInBand` ผ่าน 211/211 ทุกครั้งที่แก้ (เพิ่มจาก 206 เดิมด้วย Unit Test ใหม่ 5 เคสคุม Logic การตัดสินใจ Log ของ `verifyLineIdToken`)

### Phase 16 (2026-09-11): ขยาย Scope รองรับคอนโด/หมู่บ้าน (Facility Booking, Vehicle/Visitor, Voting/Polls) + แก้บั๊ก LINE Notification เดิม
- **บริบท**: ผู้ใช้ขอวางแผนขยาย HorHub จากหอพักอย่างเดียวให้รองรับคอนโด/หมู่บ้านด้วย หลัง Audit เจอว่า `Room.unitType`/`ownerId`/`areaSqm` และ `FeatureToggle` ต่อตึกเอื้อให้ทำแบบ Opt-in Module ใหม่ได้โดยไม่ต้อง Migrate ของเดิมแบบ Breaking Change เลย — วางแผนผ่าน Plan Mode ก่อนแล้วค่อย Implement (อนุมัติแผนแล้วที่ `.claude/plans/mossy-sprouting-lecun.md`)
- **เพิ่ม 6 Models ใหม่** (`prisma/schema.prisma`, Push ผ่าน `npx prisma db push` แล้ว):
  - `Facility`/`FacilityBooking`: พื้นที่ส่วนกลางที่จองได้ + การจอง เช็คช่วงเวลาซ้อนทับ Inline ใน Controller ด้วย Interval Overlap Query (`startTime < B.endTime AND endTime > B.startTime`), Index `[facilityId, startTime, endTime]`
  - `Vehicle`/`Visitor`: แยก 2 Model เพราะ Lifecycle ต่างกัน — ทะเบียนรถถาวรต้องอนุมัติ (`PENDING`/`APPROVED`/`REJECTED`) ส่วนแขกมาเยือนครั้งเดียวไม่ต้องอนุมัติ (`EXPECTED`/`CANCELLED`)
  - `Poll`/`PollVote`: โหวตแบบ 1 คน 1 เสียง (`@@unique([pollId, tenantId])`), Options เป็น JSON Array ไม่ทำตารางลูก (ไม่มี Requirement ต้องมี Identity แยกต่อ Option)
- **Backend ใหม่ 3 ชุด** (`facilityController.js`/`vehicleController.js`/`pollController.js` + Routes คู่กัน) — ตามรูปแบบ `parcelController.js` เป๊ะ (Controller เรียก `billingService.prisma` ตรง ไม่มี Service Layer/Zod Validator ตั้งใจให้ตรงกับของจริงในระบบ), LIFF Endpoint เพิ่มเข้า `liffRoutes.js` เดิม (ไม่แยกไฟล์), ทุก Endpoint LIFF Write เช็ค `req.tenantId`/`req.lineUserId` เท่านั้นห้ามรับจาก Body (IDOR Guard ตามแบบ `parcelController.js`)
- **`src/middlewares/requireFeatureMiddleware.js` (ใหม่)**: จุดแรกที่ทำให้ `FeatureToggle` มีผลบังคับจริงฝั่ง Backend (ของเดิมทุกฟีเจอร์เป็นแค่ Frontend `v-if` ซ่อน UI เฉยๆ) ใช้เฉพาะ Route เขียนของ 3 โมดูลนี้เท่านั้น ไม่แตะ Route เดิม
- **`src/services/lineService.js`**: เพิ่ม `pushFacilityBookingNotification`/`pushVehicleApprovalNotification`/`pushPollNotification` ตามรูปแบบ `pushParcelNotification` เป๊ะ พร้อม `logDelivery()` เข้า `NotificationLog` (เพิ่ม `FACILITY_BOOKING`/`VEHICLE`/`POLL` ในคอมเมนต์ `notificationType`)
- **🐛 พบและแก้บั๊กเดิมระหว่างเขียนฟังก์ชัน Push ใหม่**: `pushParcelNotification` อ้างตัวแปร `isMockUserId` โดยไม่เคยประกาศไว้ในฟังก์ชันเลย (ตัวแปรชื่อเดียวกันมีประกาศจริงในฟังก์ชัน Push อื่นเท่านั้น) — นอก `NODE_ENV=test` การอ้างตัวแปรที่ไม่มีจริงจะโยน `ReferenceError` แล้วโดน `catch` ด้านล่างกลืนไปแสดงเป็น "ส่งแจ้งเตือนไม่สำเร็จ" เงียบๆ **ทุกครั้งในโปรดักชัน** — แก้โดยเพิ่ม `const isMockUserId = ...` ให้ตรงกับ Pattern ของฟังก์ชันอื่น
- **`src/controllers/featureController.js`**: เพิ่ม `ENABLE_FACILITY_BOOKING`, `ENABLE_VOTING` ใน `STANDARD_FEATURE_METADATA` (ส่วน `ENABLE_VEHICLE_MANAGEMENT` มีอยู่แล้วตั้งแต่ก่อนหน้านี้ — Reuse ตัวเดียวคุมทั้ง Vehicle และ Visitor)
- **Test**: เพิ่ม `tests/integration/poll.test.js`, `facilityBooking.test.js`, `vehicle.test.js` (25 เคสใหม่ รวม IDOR + Feature Toggle Off + Slot Conflict) — ระหว่างเขียน Test เจอ Unique Constraint ชนกันเพราะ Toggle Row ค้างจาก Test รอบก่อนที่ Assertion ล้มเหลวกลางคันแล้ว Cleanup ไม่ทัน (เกิดจากการทดลอง `git stash` ระหว่าง Debug เอง ไม่ใช่บั๊กของโค้ดจริง) แก้ Test ให้ใช้ `upsert` + `try/finally` กันเหตุการณ์แบบนี้ไม่ให้ทำ Test พังต่อในรันครั้งถัดไป
- **Test Verification**: รัน `yarn jest --runInBand --forceExit` ผ่าน **224/224** ทุก Suite (33 Suites รวม 3 Test File ใหม่)
- **หมายเหตุ Jest Hang**: พบว่ารันแบบไม่ใส่ `--forceExit` แล้ว Jest ไม่ยอม Exit หลังเทสต์ผ่านหมด (ขึ้น Warning ให้ลอง `--detectOpenHandles`) — เป็นปัญหา Pre-existing ไม่เกี่ยวกับโค้ดที่แก้ (สงสัย Prisma Connection Pool หรือ `express-rate-limit` Timer ค้าง Ref Event Loop) ยังไม่ได้ไล่หาสาเหตุที่แท้จริง บันทึกไว้เป็น Follow-up

### STATUS: 🟢 COMPLETE & VERIFIED (Frontend ส่วนที่เกี่ยวข้องดู `playground-frontend/docs/ACTIVITY_LOG.md` Phase เดียวกัน)

### ⏭️ งานที่เหลือ (Follow-up Items):
- หาสาเหตุจริงของ Jest Hang (ไม่ Exit เองถ้าไม่ใส่ `--forceExit`) — เดายังไม่ได้ทดสอบว่าเป็น Prisma Client หรือ Rate Limiter Timer
- Facility Booking ยังไม่มี Workflow อนุมัติ (Auto-`CONFIRMED` เสมอ), Poll ยังไม่รองรับ AGM/Quorum/ถ่วงน้ำหนักตามกรรมสิทธิ์, Visitor ยังไม่มี Check-in/Check-out State Machine — ตัดออกตั้งแต่วางแผนตามคำขอผู้ใช้ (Ponytail/YAGNI) เพิ่มทีหลังเมื่อมี Requirement จริง

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
