# 📋 บันทึกกิจกรรมการพัฒนา (Development Activity Log)

บันทึกสรุปขั้นตอน การดำเนินการสร้างโปรเจกต์ **Node.js + Express REST API Starter (Security, Zod Validation, JWT Best Practices, Google OAuth 2.0 & PostgreSQL)**, ชุดทดสอบ **100% Full API Integration Testing (19/19 Test Cases Passed)**, ระบบ **Multi-Agent Collaboration Setup (Gemini + Claude)** และการสลับใช้งาน **Yarn Package Manager**

---

## 📅 ข้อมูลกิจกรรม (Activity Summary)

- **วันที่ดำเนินการ**: 26 สิงหาคม 2026 (เริ่มโปรเจกต์) — อัปเดตล่าสุด 10 กันยายน 2026
- **สถานะ**: ✅ สำเร็จเสร็จสมบูรณ์ 100% (Phase 1-11: โครงสร้างเริ่มต้น / Phase 12-15: Security + Billing + Mock Decoupling / Phase 16-17: Condo Modules + Notification Bell / Phase 18: LIFF Building Owner Dashboard (Phase 1+2+3))
- **คำสั่งล่าสุด**: สร้าง LIFF Building Owner Dashboard (`LiffOwnerDashboardView.vue`) ครบ 3 Phase — Executive Snapshot, Slip/Maintenance Approvals, Multi-Building Switcher + Dual-Role Mode Switcher (Owner↔Tenant) พร้อม `dashboardController.js` รองรับ Multi-Building Permission (ดู Phase 18)
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

### Phase 14 (2026-09-10): Full Audit ระบบ Horspace (ฮอร์สเปซ) + errorMiddleware statusCode Fix + Service Layer Refactor
- **Audit ทั้งระบบ Horspace (LIFF Onboarding, Auth, Invite, Billing)**: ไล่ตรวจ Flow ทั้งหมดตั้งแต่ `authController.js`, `liffController.js`, `liffAuthMiddleware.js` จนถึง `prisma/schema.prisma` พบ 6 ประเด็น:
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
- **เปลี่ยน Default Theme Color ทั้งระบบจาก Blue → Horspace Teal**: Sample สีจากโลโก้จริงด้วยสคริปต์อ่าน Pixel PNG ได้ Cluster สีหลัก `#1B6C7D`–`#239C93` เลือก `#0E7490` (ใกล้เคียง Tailwind `cyan-700` ที่สุด) เป็นค่า Default แทน `#3B82F6` (Blue-500) เดิมทุกจุดที่เป็น Fallback (ไม่แตะค่าที่เป็น Preset ตัวเลือกให้แอดมินเลือกเอง เช่น "น้ำเงิน (Blue)" ใน `BuildingSettingsView.vue`):
  - `src/controllers/buildingController.js` (Default ตอนสร้างตึกใหม่ไม่ระบุสี), `src/services/tenantService.js` (7 จุด Fallback ตอนส่งข้อมูลให้ LIFF)
- **ขยาย NotificationLog ให้ครอบคลุม LINE API Failure ระดับ Auth (ไม่ใช่แค่ Push Message)**: ตอบคำถาม "ควรมี api_log ไหม" — พบว่ามี `NotificationLog` + `lineService.logDelivery()` อยู่แล้วสำหรับ Push Message แต่ `verifyLineIdToken` (Token Verify) กับ `getUserProfile` (Profile Fetch) ไม่เคย Log เลย ถ้า LINE API มีปัญหาจะไม่มีทางรู้ย้อนหลัง
  - `prisma/schema.prisma`: เปลี่ยน `NotificationLog.buildingId` เป็น Nullable (`onDelete: SetNull`) เพราะเหตุการณ์ระดับ Auth มักยังไม่รู้ตึก — Push ผ่าน `prisma db push` แล้ว
  - `src/middlewares/liffAuthMiddleware.js`: Log `AUTH_VERIFY/FAILED` เฉพาะ Network Error หรือ HTTP 5xx/429 (Outage/Rate Limit ฝั่ง LINE จริง) **ไม่ Log** กรณี Token หมดอายุ/ไม่ถูกต้องแบบ 400 ปกติ (พฤติกรรมผู้ใช้งานทั่วไป ไม่ใช่ปัญหา LINE API กันรก Log)
  - `src/services/lineService.js` (`getUserProfile`): Log `PROFILE_FETCH/FAILED` ทุกครั้งที่ดึงโปรไฟล์ไม่สำเร็จ
  - Query ดู LINE API Failure ทั้งหมดได้จากที่เดียว: `notification_logs WHERE notification_type IN ('AUTH_VERIFY','PROFILE_FETCH') AND status='FAILED'`
- **Test Verification**: รัน `yarn jest --runInBand` ผ่าน 211/211 ทุกครั้งที่แก้ (เพิ่มจาก 206 เดิมด้วย Unit Test ใหม่ 5 เคสคุม Logic การตัดสินใจ Log ของ `verifyLineIdToken`)

### Phase 16 (2026-09-11): ขยาย Scope รองรับคอนโด/หมู่บ้าน (Facility Booking, Vehicle/Visitor, Voting/Polls) + แก้บั๊ก LINE Notification เดิม
- **บริบท**: ผู้ใช้ขอวางแผนขยาย Horspace จากหอพักอย่างเดียวให้รองรับคอนโด/หมู่บ้านด้วย หลัง Audit เจอว่า `Room.unitType`/`ownerId`/`areaSqm` และ `FeatureToggle` ต่อตึกเอื้อให้ทำแบบ Opt-in Module ใหม่ได้โดยไม่ต้อง Migrate ของเดิมแบบ Breaking Change เลย — วางแผนผ่าน Plan Mode ก่อนแล้วค่อย Implement (อนุมัติแผนแล้วที่ `.claude/plans/mossy-sprouting-lecun.md`)
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

### Phase 17 (2026-09-11): In-App Notification Bell (Admin CMS + Tenant LIFF)

- **บริบท**: ผู้ใช้ขอวางแผนระบบแจ้งเตือน — สำรวจโค้ดเจอว่า LINE Push ทางเดียว (Admin→Tenant) ครบเกือบทุกเหตุการณ์อยู่แล้วและมี `NotificationLog` เก็บประวัติให้แอดมินดูอยู่แล้ว (`DeliveryLogsTab.vue`) แต่ไม่มีฝั่งกลับ (Tenant→Admin) เลย เช่น แจ้งซ่อมใหม่/แนบสลิป/ขอจองพื้นที่/ขอจดทะเบียนรถ/ลูกบ้านลงทะเบียนใหม่ — แอดมินต้องเข้าไปไล่ดูเองไม่มีการเตือน
- **Reuse `NotificationLog` เป็น Source เดียว ไม่สร้างตารางใหม่**: เพิ่มคอลัมน์ `readAt DateTime?` (`prisma/schema.prisma`, Push ผ่าน `npx prisma db push` แล้ว) + Index `[buildingId, notificationType, readAt]` และ `[tenantId, readAt]`
- **แยก Audience ด้วยลิสต์ Type ไม่ใช่คอลัมน์ใหม่**: `ADMIN_ALERT_TYPES` ใน `lineService.js` (`MAINTENANCE_NEW`, `SLIP_UPLOADED`, `FACILITY_BOOKING_NEW`, `VEHICLE_NEW`, `TENANT_ONBOARDED`) — Query ฝั่ง Admin กรอง `IN` ลิสต์นี้, ฝั่ง Tenant กรอง `NOT IN` กันข้อความฝั่งแอดมินหลุดไปโผล่ในกระดิ่งลูกบ้าน (Row เดียวกันไม่มีทางถูก Query จากทั้งสองฝั่งพร้อมกัน จึงไม่มีปัญหา `readAt` ชนกันข้าม Audience)
- **`src/services/lineService.js`**: เพิ่ม `getAdminAlerts`/`getTenantNotifications` (ใช้ `_listNotifications` กลางร่วมกัน คืน `unreadCount` แยกจาก `total` เสมอ), `markNotificationRead`/`markAllNotificationsRead` (สโคปด้วย `buildingId` หรือ `tenantId` กันอ่านข้ามของคนอื่น) — **หมายเหตุ**: `readAt` เป็น Shared State ต่อตึก/ต่อผู้เช่า ไม่ใช่ต่อแอดมินแต่ละคน (แอดมินหลายคนในตึกเดียวกันเห็นสถานะอ่านร่วมกันแบบ Shared Inbox) — ตัดสินใจไม่ทำ Per-Admin Read State เพราะเกินความจำเป็นสำหรับสเกลหอพัก (YAGNI)
- **จุดยิงแจ้งเตือนใหม่ 5 จุด** (เรียก `lineService.logDelivery()` ตรงๆ ไม่ผ่าน LINE เพราะแอดมินไม่มี `lineUserId`):
  - `maintenanceController.createMaintenanceRequest` → `MAINTENANCE_NEW`
  - `liffController.uploadSlipFromLiff` → `SLIP_UPLOADED` (เฉพาะกรณีไม่ Auto-Approve เท่านั้น กัน Noise ตอนสลิปตรวจผ่านอัตโนมัติ)
  - `facilityController.createBookingForLiff` → `FACILITY_BOOKING_NEW`
  - `vehicleController.registerVehicle` → `VEHICLE_NEW`
  - `tenantService.registerTenantWithInvite` → `TENANT_ONBOARDED`
- **`src/controllers/notificationController.js` (ใหม่)** + Routes: `GET/POST/PATCH /api/admin/buildings/:id/notifications[...]` (ผูกใน `buildingRoutes.js` ตาม Pattern `notification-logs` เดิม), `GET/POST/PATCH /api/v1/liff/notifications[...]` (ผูกใน `liffRoutes.js` ตาม Pattern `announcements` เดิม)
- **Test**: เพิ่ม `tests/integration/notificationBell.test.js` (4 เคส ครอบคลุม Type-Isolation ระหว่าง Audience โดยเฉพาะ — จุดที่มีโอกาสพังเงียบๆ ที่สุดถ้าแก้ `ADMIN_ALERT_TYPES` ผิด)
- **Test Verification**: รัน `yarn jest --runInBand --forceExit` ผ่าน **247/247** ทุก Suite (38 Suites รวม 1 Test File ใหม่)

### STATUS: 🟢 COMPLETE & VERIFIED (Frontend ส่วนที่เกี่ยวข้องดู `playground-frontend/docs/ACTIVITY_LOG.md` Phase เดียวกัน)

### ⏭️ งานที่เหลือ (Follow-up Items):
- `sendAnnouncementBroadcast` (`lineService.js`) ยังไม่เคย `logDelivery()` เลย (รับแค่ `lineUserId[]` แมปกลับเป็น Tenant ไม่ได้) — ประกาศข่าวสารจึงยังไม่ขึ้นในกระดิ่ง Tenant ต้องแก้ Signature ให้รับ Tenant List ด้วยถึงจะปิด Gap นี้ได้ (Phase ถัดไป)
- Polling 45s ฝั่ง Frontend ไม่ใช่ Realtime แท้ — พอสำหรับสเกลหอพักตอนนี้ ถ้าจะทำ WebSocket/SSE ค่อยพิจารณาเมื่อ Poll เริ่มหน่วงจริง

---

### Phase 18 (2026-09-17): LIFF Building Owner Dashboard — Executive Snapshot, Approvals & Multi-Building

- **บริบท**: วางแผนและพัฒนา Mobile Portal สำหรับเจ้าของตึก/ผู้บริหารอาคารบน LINE LIFF ตามแผน `docs/plans/2026-09-liff-building-owner-plan.md` ครบทั้ง Phase 1, 2, 3 ในเซสชันเดียว
- **Phase 1 — Executive Snapshot (MVP)**:
  - สร้าง `src/views/LiffOwnerDashboardView.vue` (หน้าแดชบอร์ดหลัก): Metric Cards ยอดรายรับ/ยอดรับชำระ/ยอดค้าง, Occupancy Rate, Counter Badges (สลิปรอตรวจ, แจ้งซ่อมรอดำเนินการ)
  - สร้าง `src/components/owner/OwnerMetricCard.vue`: Reusable card แสดงตัวเลขสถิติแบบ trend-aware
  - เพิ่ม route `/liff/owner-dashboard` ใน `router/index.js` พร้อม Guard ตรวจ `role ∈ {owner, admin, super_admin}`
  - อัปเดต `authStore` ให้รองรับ `availableRoles`/`activeRole` สำหรับ Dual-Role Session
  - Reuse `GET /api/admin/dashboard/summary` ที่มีอยู่แล้ว — ไม่สร้าง Endpoint ใหม่
- **Phase 2 — Quick Operations (Approvals)**:
  - Slip Verification Queue: ดึง `GET /api/admin/invoices?status=reviewing` แสดงรูปสลิป + ปุ่ม Approve/Reject (ปฏิเสธบันทึก Reason + แจ้ง Tenant ผ่าน LINE push)
  - Urgent Maintenance List: แสดงงานซ่อม PENDING/IN_PROGRESS + ปุ่มเปลี่ยนสถานะ
  - Expiring Leases Alert: รายชื่อห้องที่สัญญาจะหมดใน 30 วัน
  - แก้ `invoiceController.js`: `updateInvoiceStatus` ส่ง LINE push แจ้ง Tenant เมื่อ Reject (เดิมไม่มี)
- **Phase 3 — Multi-Building & Mode Switcher**:
  - Building Switcher Dropdown: สำหรับ Owner ที่มีสิทธิ์หลายตึก (query `UserBuildingPermission`)
  - Dual-Role Mode Switcher Pill: สลับ Owner Dashboard ↔ Tenant View (`activeRole` ใน `authStore`) โดยไม่ reload
  - `dashboardController.js`: ตรวจ `UserBuildingPermission` ก่อนคืนข้อมูล — Manager/Staff เห็นเฉพาะตึกที่มีสิทธิ์, Owner/Admin เห็นทุกตึก
  - `tenantAuthService.js`: `silentLogin`/`verifyLiffToken` คืน `availableRoles` และ `tenantId` (ถ้ามี) เพื่อให้ Frontend ตัดสิน Role Switcher ได้
  - `tenantService.js`: เพิ่ม `getTenantByLineUserId` ใช้ใน Dual-Role resolution
  - `lineService.js`: เพิ่ม Reject-Slip notification path ใน `sendSlipRejectedNotification`
- **ไฟล์ที่แก้ไข (API)**: `dashboardController.js`, `invoiceController.js`, `server.js` (route mount), `lineService.js`, `tenantAuthService.js`, `tenantService.js`, `package.json`, `tests/setup.js`
- **ไฟล์ที่แก้ไข/สร้าง (Frontend)**: `src/views/LiffOwnerDashboardView.vue` (NEW), `src/views/LiffOwnerDashboardView.test.js` (NEW), `src/components/owner/OwnerMetricCard.vue` (NEW), `src/components/owner/OwnerMetricCard.test.js` (NEW), `router/index.js`, `stores/auth.js`, `utils/api.js`, `utils/swal.js`, `views/AdminUserManagementView.vue`, `views/LiffProfileView.vue`, `vite.config.js`, `playwright.config.js`, `layouts/LiffLayout.test.js`
- **Known Gap**: `sendAnnouncementBroadcast` (`lineService.js`) ยังไม่เคย `logDelivery()` — ปิด Gap นี้ Phase ถัดไป

### STATUS: COMPLETE & VERIFIED (All 3 Phases)

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

### Phase 19 (2026-09-18): Finalize Rebranding & Announcement Notification Gap
- **Logo Branding**: แทนที่ไฟล์โลโก้เก่า (horhub) ใน frontend ด้วยไฟล์ใหม่ (horspace)
- **Announcement Notification**: แก้ไขให้ประกาศต่างๆ จากส่วนกลางแสดงในกระดิ่งแจ้งเตือน (Tenant Notification Bell) ของลูกบ้าน (เดิมส่งแค่ LINE API อย่างเดียว) โดยปรับให้ `_getTargetUserIds` ส่งกลับทั้ง `tenantId` และ `buildingId` ไปใช้สร้าง `NotificationLog`

---

### Phase 20 (2026-09-23): Full Flow & Bug Audit (API + CMS) — แก้ทุกจุดที่ยืนยันเป็นบั๊กจริง

- **บริบท**: ผู้ใช้ขอให้ไล่ตรวจ Flow และบั๊กทั้งหมดของทั้ง `playground-api` และ `playground-frontend` แล้ววางแผน — ส่ง Sub-Agent 2 ตัวไล่อ่านโค้ดจริงคู่ขนานกัน (ไม่เชื่อแค่ Log เก่า) แล้วแก้ทุกข้อที่ยืนยันว่าเป็นบั๊กจริงตามคำขอ

- **🐛 [IDOR] Broadcast ประกาศข้ามตึกได้**: `announcementController.js` เดิมไม่เช็คสิทธิ์ตึกของแอดมินเลย ถ้า `targetType:'ALL'` ไม่ส่ง `buildingId` มา จะยิงหาผู้เช่า**ทุกตึกในระบบ**, ถ้าเป็น `BUILDING`/`FLOOR` ไม่ส่ง `buildingId` จะ Fallback ไปเดา `building.findFirst()` (ตึกแรกในระบบ ไม่ใช่ตึกของแอดมินคนนั้น) — เพิ่ม `_resolveAllowedBuildingId()` เช็คสิทธิ์จริงจาก `UserBuildingPermission` (Pattern เดียวกับ `dashboardController.getSummary`) ทั้งใน `createAnnouncement` และ `getRecipientsCount`, ตัด Fallback เดาตึกทิ้งทั้งหมด — เพิ่มเทส 3 เคสใน `tests/integration/broadcast.test.js` (`Building-Scoped Admin Authorization (IDOR Fix)`)
- **🐛 `silentLogin` คืนข้อมูลผิดตึกสำหรับผู้เช่า Multi-Building**: `tenantAuthService.silentLogin()` เดิมค้นหาด้วย `prisma.tenant.findFirst({ where: { lineUserId } })` ตรงๆ ไม่เช็ค `UserLineAccount` เหมือน `checkAuthStatus`/`pinLogin`/`linkAndLogin` — ผู้เช่าที่ผูกหลายตึกผ่าน LINE OA เดียว (Centralized Identity) พอ Access Token หมดอายุแล้ว Client เรียก Silent Re-Auth อาจได้ข้อมูลห้อง/บิลของตึกอื่นกลับมาแทนตึกที่กำลังใช้งานอยู่จริง — แก้ให้เช็ค `UserLineAccount` ตาม `buildingId` ก่อนเสมอ (Pattern เดียวกับ `checkAuthStatus`) รับ `buildingId` เพิ่มจาก `liffController.silentLogin` (`req.body.buildingId`) — ฝั่ง Frontend ส่ง `liff_target_building` ที่มีอยู่แล้วใน `localStorage` (`router/index.js` เก็บไว้ตอนเข้าผ่าน Query/Deep Link) ผ่าน `authService.silentLoginLiff()` — เพิ่มเทส 2 เคสใน `tests/integration/hybridAuth.test.js`
- **🐛 Invite Code 2 ระบบซ้อนกัน**: `tenantService.verifyInviteCode()` เดิมเช็คแค่ `RoomInvite.code` (ระบบ `/liff/register` สำหรับผู้เช่าใหม่) ถ้าผู้เช่า**เดิม**พิมพ์รหัสแบบ `Tenant.inviteCode` (ระบบ `/liff/onboarding`) ผิดหน้าจะได้แค่ "ไม่พบรหัสเชิญ" เฉยๆ — เพิ่ม Fallback เช็ค `Tenant.inviteCode` เมื่อไม่เจอใน `RoomInvite` แล้วส่ง Error Code `TENANT_LINK_CODE` กลับแทน 404, ฝั่ง `LiffRegisterView.vue` เจอ Code นี้แล้ว Auto-Redirect ไป `/liff/onboarding?code=...` ให้เอง (ปิด Gap ที่ค้างมาตั้งแต่ 2026-09-10 โดยไม่ต้องรวม 2 ระบบเป็นหนึ่งเดียว)
- **🐛 `jwt` ไม่ได้ `require`** ใน `liffAuthMiddleware.js` — Dev Fallback Path (`verifyLineIdToken` ล้มเหลว + `nodeEnv==='development'`) เรียก `jwt.decode()` โดยไม่เคย Require `jsonwebtoken` เลย โยน `ReferenceError` เงียบๆ ถูก Catch กลืนไป (เฉพาะ Dev เท่านั้น ไม่กระทบ Production) — เพิ่ม `require('jsonwebtoken')`
- **🐛 Invoice Generation Race Condition**: `billingService.generateInvoice()` เช็ค `existingInvoice` แล้วค่อย Create ภายใน Transaction เดียวกัน ถ้า 2 Request สร้างบิลห้อง/รอบเดียวกันพร้อมกันจริงๆ ตัวที่แพ้จะชน Unique Constraint ของ `invoiceNumber` แล้วโยน 500 ดิบให้ผู้ใช้เห็น — เพิ่ม `catch (P2002)` คืนบิลที่ถูกสร้างไปแล้วแทน (Idempotent)
- **✅ ตรวจแล้วพบว่า "ไม่ใช่บั๊กจริง"**: Audit รอบแรกเข้าใจผิดว่า Feature Toggle ไม่ครอบ Endpoint เขียนฝั่ง LIFF (`facility-bookings`/`vehicles`/`visitors`/`polls/:id/vote`) เพราะ Grep หาแค่ `requireFeature` Middleware — อ่านโค้ดจริงพบว่าทั้ง 4 Controller เช็ค `FeatureToggle` แบบ Inline อยู่แล้วทุกจุด (Comment บอกเหตุผลไว้ว่า "ต้อง Resolve tenant→room→building ก่อน") ไม่ต้องแก้อะไร — `vehicleRoutes.js` ฝั่งแอดมินไม่มี `requireFeature` ก็ตรงตามแพทเทิร์นเดียวกับ `facilityRoutes.js`/`pollRoutes.js` ที่ตั้งใจไม่ Gate การจัดการรายการเก่า (Approve/Reject/Update/Delete) หลังปิดฟีเจอร์ ให้แอดมินยังเคลียร์งานค้างได้

#### Follow-up จากการทดสอบจริงของผู้ใช้หลัง Phase 20 (วันเดียวกัน): 3 บั๊กเพิ่มเติมที่เจอตอน Live Test

- **🐛 `ENABLE_E_CONTRACT` ปิดใน CMS แล้ว แต่ `/liff/contract` ยังเข้าดูได้ตรงๆ**: `liffController.getTenantContract()` ไม่เคยเช็ค `FeatureToggle` เลยตั้งแต่สร้างฟีเจอร์นี้ (ต่างจาก Facility/Vehicle/Poll ที่เช็คแบบ Inline ครบ) — Toggle มีผลแค่ซ่อนปุ่ม Quick Action ในหน้าโปรไฟล์เท่านั้น ถ้าเคยเปิดหน้าค้างไว้หรือมีลิงก์เดิมยังเข้าดูสัญญาได้ปกติ — เพิ่มเช็ค Inline (Resolve buildingId จาก `activeLease.buildingId || activeLease.room.buildingId`) ตอบ 403 ถ้าปิดอยู่ — เพิ่มเทส 2 เคสใน `tests/integration/leaseContractPdf.test.js` (จำลอง Bug จริงก่อนแก้ ยืนยันว่า Reproduce ได้จริงก่อนค่อยแก้)
- **🐛 Feature Card ผี โผล่ในหน้า Feature Settings**: `featureController.getFeatures()` เดิม Merge ทุก Row ในตาราง `FeatureToggle` มาโชว์เป็นการ์ด โดยไม่เช็คว่า Key นั้นยังอยู่ใน `STANDARD_FEATURE_METADATA` หรือไม่ — เจอ 2 Row ค้างจากการ Rename Key เก่า (`ENABLE_TENANT_POLLS`→`ENABLE_VOTING`, `ENABLE_VISITOR_PASS`→รวมเข้า `ENABLE_VEHICLE_MANAGEMENT` แล้ว) โผล่เป็นการ์ดไม่มี Title/คำอธิบายจริง (โชว์ Raw Key แทน) — แก้ `getFeatures()` ให้กรองเฉพาะ Key ที่ยังมี Metadata จริงเท่านั้นก่อน Merge (กัน Key เก่า/พิมพ์ผิดโผล่ซ้ำในอนาคตด้วย ไม่ใช่แค่ลบ 2 Row นี้) + ลบ 2 Row ขยะออกจากฐานข้อมูลจริงแล้ว (ยืนยันไม่มีโค้ดจุดไหนอ้างอิง Key เหล่านี้ก่อนลบ) — เพิ่มเทสกันการเกิดซ้ำใน `tests/integration/apiRoutes.test.js`
- **🐛 [Frontend] Owner Preview Mode ไม่ผูกตึก ทำให้เห็นฟีเจอร์เปิดหมดทั้งที่ปิดไว้เฉพาะตึกแล้ว**: ผู้ใช้ Report "ปิดฟีเจอร์ใน CMS ครบแล้วแต่ LIFF ไม่ซ่อนตาม" — ตรวจ Backend ด้วยการจำลอง Fetch จากฐานข้อมูลจริงแล้วถูกต้อง 100% สรุปว่าเป็นบั๊กฝั่ง Frontend ที่ `LiffProfileView.vue`: ตอน Login ด้วยบัญชีแอดมิน/เจ้าของอาคาร (ไม่มี Tenant Record ผูกอยู่) จะเข้า "โหมดจำลอง (Preview Mode)" ซึ่งเดิมเรียก `featureStore.fetchFeatures(null)` (Global เสมอ) ทั้งที่การปิดฟีเจอร์ทุกครั้งเป็น Override เฉพาะตึกเท่านั้น ไม่เคยแตะ Global — ดูรายละเอียด Fix ฝั่ง Frontend ใน `playground-frontend/docs/ACTIVITY_LOG.md` (บั๊กนี้เป็น Frontend ล้วน ไม่ได้แก้ฝั่ง API)
- **Test Verification**: รัน `yarn jest --runInBand --forceExit` ผ่าน **275/275** ทุก Suite (เพิ่มจาก 272 เดิมด้วยเทสใหม่ 3 เคส)

### STATUS: 🟢 COMPLETE & VERIFIED (Frontend ส่วนที่เกี่ยวข้องดู `playground-frontend/docs/ACTIVITY_LOG.md` Phase 20 เดียวกัน)

### ⏭️ งานที่เหลือ (Follow-up Items — Deferred ตาม YAGNI ไม่ใช่บั๊ก):
- Facility Booking ยังไม่มี Workflow อนุมัติ (Auto-`CONFIRMED` เสมอ), Poll ยังไม่รองรับ AGM/Quorum/ถ่วงน้ำหนักตามกรรมสิทธิ์
- ฟีเจอร์เก่าอื่นๆ (แจ้งซ่อม/บิล/พัสดุ/ข่าวสาร/ใบเสร็จ/Digital ID) ยัง**ไม่มี**การเช็ค `FeatureToggle` ฝั่ง Backend เหมือนกัน (Toggle ซ่อนแค่ UI ทางเข้าเท่านั้น) — เป็น Known Limitation ตั้งใจตั้งแต่ Phase 16 ไม่ใช่บั๊ก ถ้าต้องการให้บังคับจริงฝั่ง Backend ด้วยเหมือน `ENABLE_E_CONTRACT`/Facility/Vehicle/Poll ต้องแจ้งทำเพิ่ม (ไม่ใช่ Auto-fix ตาม YAGNI)
- Jest Hang ถ้าไม่ใส่ `--forceExit` ยังไม่ได้ไล่หาสาเหตุจริง (สงสัย Prisma Connection Pool หรือ `express-rate-limit` Timer)

---

### Phase 21 (2026-09-23): Delete Building Feature (Backend API & RBAC)

- **บริบท**: เพิ่มฟีเจอร์สำหรับการลบตึก/อาคารที่ไม่ใช้งานออกจากระบบ พร้อมมาตรการป้องกันความปลอดภัยของข้อมูล (Data Loss Prevention)
- **DELETE /api/v1/buildings/:id**: เพิ่ม endpoint สำหรับลบอาคาร พร้อม middleware `requireRole('OWNER', 'super_admin')`
- **Data Loss Prevention Guards**:
  - ตรวจสอบตึกที่ต้องการลบ (404 หากไม่พบ)
  - ห้ามลบหากเหลือตึกเดียวในระบบ (`totalBuildings <= 1` ตอบ 400)
  - ห้ามลบหากตึกยังมีห้องพักผูกอยู่ (`roomsCount > 0` ตอบ 400 พร้อมแจ้งเตือนให้ย้ายหรือลบห้องพักทั้งหมดออกก่อน)
- **Cascade & Cleanup**: ลบ Maintenance Requests และปลด `buildingId` ใน Notification Logs ที่เกี่ยวข้อง ก่อนลบตัวอาคารด้วย Prisma Transaction
- **Audit Log**: บันทึกการกระทำลงในตาราง `AuditLog` (action: `DELETE`, entity: `BUILDING`)
- **Test Verification**: สร้าง `tests/integration/buildingDelete.test.js` (Passed 5/5) และรันชุดทดสอบทั้งหมด `PORT=9090 yarn test` ผ่านครบ **280/280** (42 test suites)

---

### Phase 22 (2026-09-24): Fix Room Invite Code Endpoints & 404 on /api/v1/invites

- **บริบท**: แก้ไขปัญหาที่ผู้ใช้กดสร้างรหัสเชิญห้องพักแล้วขึ้นข้อผิดพลาด `ไม่พบ Endpoint นี้ - /api/v1/invites` (404)
- **Root Cause**:
  - `RoomInviteModal.vue` ในฝั่ง Frontend เรียกใช้งาน API `/api/v1/invites` (POST), `/api/v1/invites/room/:roomId` (GET) และ `/api/v1/invites/:id` (DELETE)
  - ใน Backend มีเพียง `/api/v1/rooms/:id/invites` แต่ยังไม่มี `inviteRoutes` เชื่อมต่อเส้นทาง `/api/v1/invites` และ `revokeRoomInvite` ใน Controller ยังไม่ได้ถูกผูก Route
- **Implementation**:
  - สร้าง `src/routes/inviteRoutes.js` รองรับ `POST /`, `GET /room/:roomId`, `DELETE /:id`
  - ติดตั้ง `inviteRoutes` ใน `src/routes/index.js` ภายใต้ prefix `/api/v1/invites` และ `/api/admin/invites`
  - เพิ่ม Route `DELETE /:id/invites/:inviteId` ใน `src/routes/roomRoutes.js`
  - อัปเดต `src/controllers/roomController.js`: รองรับการรับ `id` จากทั้ง `req.params` และ `req.body.roomId`, รองรับ `expiresInHours` ที่ส่งมาจาก Frontend
  - อัปเดต `tests/integration/invite.test.js` ครอบคลุมทั้ง 3 endpoint ใหม่
- **Test Verification**:
  - รัน `PORT=9090 yarn test` ผ่านครบ **282/282 tests** (42 test suites)
  - ทดสอบสดผ่าน live API port 3000 สำเร็จทั้งสร้าง, เรียกดู, และยกเลิกรหัสเชิญ

---

### Phase 23 (2026-09-25): Security, Billing & Auth Audit ทั้งระบบ

- **บริบท**: ตรวจ flow ทั้งระบบหา logic ที่ผิด/แปลก แล้วแก้เป็นเฟส (PR รวม `playground-api#5`, `playground-frontend#10`, branch `fix/auth-phase-3`) — เทสต์ backend 372/372 (57 suites), frontend 26/26
- **เฟส 0-1 (สิทธิ์/ความลับ)**: DB เทสต์แยก (`TEST_DATABASE_URL`), ตรวจสิทธิ์รายตึกทุก endpoint, ซ่อน hash/ความลับของตึกจาก `res.json`
- **เฟส 2 (ยอดเงิน)**: อัตราน้ำไฟจาก `BuildingSetting` เป็นต้นทางเดียว (ไม่มีขั้นต่ำน้ำ hardcode), `dueDate` ตามรอบบิล (`dueDateForCycle`: ถ้าบิลย้อนหลังพ้นกำหนดแล้วให้ครบกำหนดวันนี้)
- **เฟส 3 (ยืนยันตัวตน)**: Refresh Token Rotation + Reuse Detection (`familyId`/`usedAt`, grace 10 วินาที, race ไม่ลบ cookie), ยึดบัญชีด้วยเบอร์ต้องไม่เปลี่ยน UX ผู้เช่าทั่วไป, production boot guard, ตัด Google login, เปลี่ยนรหัสผ่านแอดมินแล้ว session อื่นหลุด
- **เฟส 4 (ops)**: lockout รายบัญชี, `TRUST_PROXY` ตั้งค่าได้, startup ปลอดภัยขึ้น
- **Audit ความเสี่ยงสูง**: อัปโหลด `.html` ถูกเสิร์ฟเป็น `text/html` (แก้: นามสกุลจาก MIME), `room_owner` โหลด PDF บิลห้องอื่นได้, MANAGER เขียนมิเตอร์/ย้ายห้องข้ามตึกได้ (เพิ่ม `requireBuildingInRequest`), ลูกบ้านสร้างใบแจ้งซ่อมในห้องอื่นได้ (LIFF ใช้ตัวตน/ห้องที่ตรวจแล้ว, `POST /maintenance-requests` เหลือเฉพาะแอดมิน), จบสัญญาไม่ตัดสิทธิ์ผู้อยู่ร่วม/LINE (`services/tenancyService.js`)
- **ย้ายออก**: อัตราน้ำไฟจาก `BuildingSetting`, ตรวจ input, บิลค้างถูกตัดจ่ายด้วยมัดจำเมื่อมัดจำพอ, กดซ้ำพร้อมกันได้ 409/400, เลขมิเตอร์ตอนย้ายออกเป็น `MeterRecord` ชุดเดิมรอบ `MM-YYYY`, ผู้เช่าใหม่เริ่มนับจาก `LeaseContract.initialWaterReading/initialElectricReading` (ฟอร์มเช็กอินมีช่องกรอก)
- **ระดับกลาง**: error 5xx ไม่ส่งข้อความภายใน, URL ไฟล์ใช้ `PUBLIC_BASE_URL`, whitelist สถานะบิล + audit log, `process-late-fees` ไม่รับ `targetDate`, PDF เอาเบอร์/TAX ID ปลอมออก, CSV กัน formula injection, whitelist role แอดมิน, ออกบิลทั้งตึกรองรับ `isReset`/`waiveCommonFee`, ถอด `/api/settings` แบบไม่ล็อกอิน, แก้ path API หน้าโพล/พัสดุ/ทะเบียนรถใน frontend และเอาปุ่มอัปโหลดสลิปฝั่งแอดมินออก
- **Dependencies**: อัปเดต multer/morgan/qs/express, เอา passport ออก, `xlsx` ย้ายไป 0.20.3 จาก SheetJS CDN (`npm audit --omit=dev` = 0)
- **ก่อน deploy**: `prisma db push` กับ `playground_db` (คอลัมน์ `RefreshToken.familyId/usedAt`, `LeaseContract.initialWaterReading/initialElectricReading`), ตั้ง `PUBLIC_BASE_URL`, แก้ `docker-compose.yml` (JWT secret จริง, `TRUST_PROXY`, พอร์ต/รหัสผ่าน DB)
- **การตัดสินใจหลัง audit**: (1) สถานะห้องหลังจบสัญญาแยกตามวัตถุประสงค์เดิม — `process-move-out` (ย้ายออกจริง มีคิดมิเตอร์/มัดจำ) → `maintenance` เพื่อรอตรวจสภาพ/ทำความสะอาด ส่วน `terminate` (ยกเลิกสัญญา เช่น สร้างผิด/ไม่ได้เข้าพักจริง) → `available` ไม่ปรับโค้ด (2) สัญญาที่ไม่ได้จดเลขมิเตอร์วันเข้าพักตอนสร้าง (เช่น ผู้เช่าลงทะเบียนเองผ่าน Invite Code) ให้แอดมินจดทีหลังผ่านหน้าสัญญาเช่า: `PATCH /api/admin/leases/:leaseId/initial-readings` (เฉพาะสัญญา ACTIVE, มี audit log) และหน้า `LeasesView` แสดงเตือนสัญญาที่ยังไม่มีเลข

