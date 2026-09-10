# 🤖 คำสั่งและข้อตกลงการทำงานสำหรับ AI Agents (AGENTS.md)

ไฟล์นี้เป็นคู่มือกลางสำหรับ AI Coding Assistants ทั้งหมด (รวมถึง **Gemini** และ **Claude**) ที่เข้ามาทำงานใน repository นี้ เพื่อให้เข้าใจโครงสร้างโปรเจกต์ กฎการเขียนโค้ด และแนวทางการทำงานร่วมกัน

---

## 🚫 กฎเหล็ก (Strict Rule): ห้ามใส่ Credit ของ AI หรือ Agent

> **ห้ามใส่ Credit, ลายเซ็น, ป้ายโลโก้ หรือข้อความอ้างอิงถึง AI / Agent ทุกประเภท** ลงในไฟล์โค้ด, คอมเมนต์, เอกสาร (Documentation), Commit messages หรือไฟล์ใดๆ ในโปรเจกต์นี้โดยเด็ดขาด

---

## 📌 ข้อมูลโปรเจกต์ (Project Overview)

- **Architecture Overview**: โปรเจกต์นี้ทำงานร่วมกันเป็นคู่ (Full-Stack Architecture):
  - ⚙️ **`playground-api`**: ระบบ Backend (Node.js + Express + PostgreSQL + JWT + HTTP-Only Cookie)
  - 🖥️ **`playground-frontend`**: ระบบ Frontend (Vue 3 + Vite + Pinia + Axios Interceptors)
- **Repository**: `https://github.com/Nitrocircussx74/playground-api` (GitHub Account: `Nitrocircussx74`)
- **Package Manager**: **Yarn** (`yarn.lock`)
- **Technology Stack**: Node.js, Express.js, JavaScript (CommonJS)
- **Security Layer**: Helmet + Express Rate Limit + Cookie Parser + Double CSRF Protection (`/api/csrf-token`)
- **API Documentation**: **Swagger UI** (`swagger-ui-express` & `swagger-jsdoc` at `/api-docs`)
- **Logging Layer**: **Morgan** HTTP Request Logger (`morgan`)
- **Data Validation Layer**: Zod (`src/validators/authValidator.js`, `src/validators/mainValidator.js`, `src/middlewares/validateMiddleware.js`)
- **Database & Migrations**: **Prisma ORM (PostgreSQL)** เป็นตัวจัดการ Schema จริงของระบบหอพัก (`prisma/schema.prisma` → `npx prisma db push` + `npx prisma generate`) — ระบบ SQL Migration Runner เดิม (`yarn migrate`, `src/migrations/files/*.sql`) เป็นของเริ่มโปรเจกต์ก่อน Prisma เข้ามา มีแค่ไฟล์เดียว ไม่ได้ใช้จัดการตารางของระบบหอพักแล้ว
- **Authentication**: JWT Best Practices (Dual Tokens: Access Token 15m ใน Body + Refresh Token 7d ใน HttpOnly, Secure, SameSite Cookie + Database Persistence `refresh_tokens` + Token Rotation & Revocation) + Google OAuth 2.0 (Passport.js) + LIFF Seamless PIN Login สำหรับลูกบ้าน (Business Logic ทั้งหมดอยู่ใน `src/services/tenantAuthService.js`: `loginWithLine`, `pinLogin`, `setupOrResetPin`, `changePin`, `checkAuthStatus`, `verifyPhoneStatus`, `linkAndLogin`, `loginLocal`, `setupPassword`, `loginWeb`, `silentLogin` — `authController.js` เรียกแค่ Service แล้วส่ง Response ต่อ ไม่แตะ Prisma ตรงๆ — ทุกเส้นทางที่ค้นหา Tenant ด้วยเบอร์โทรต้องมี Identity ที่ Verify แล้ว (LINE ID Token จริง/Session JWT) เสมอก่อนแตะ PIN, ปฏิเสธ `403 ACCOUNT_ALREADY_LINKED` ถ้าบัญชีถูกผูก LINE คนอื่นไว้แล้ว, และมี Rate Limiter 8 ครั้ง/15 นาทีต่อ IP กัน Brute Force — ดูรายละเอียดช่องโหว่ที่แก้ใน `docs/ACTIVITY_LOG.md` Phase 13 และ Phase 14)
- **DevOps & Containerization**: Dockerfile (Node 20 Alpine) + Docker Compose + Colima Support
- **Testing Coverage**: **Full API Integration & Unit Testing ด้วย Jest** (211/211 Test Cases Passed — รันด้วย `yarn jest --runInBand` เพื่อกัน Test คนละไฟล์แย่ง DB State กันเวลารันขนาน; ดูรายละเอียดล่าสุดใน `docs/ACTIVITY_LOG.md` Phase 15; ตัวเลข 19/19 เดิมคือช่วงเริ่มโปรเจกต์ก่อนขยายเป็นระบบหอพักเต็มรูปแบบ)
- **Architecture**: Layered Clean Architecture (`src/config`, `src/routes`, `src/controllers`, `src/services`, `src/middlewares`, `src/validators`, `src/migrations`) — `authController.js`/`liffController.js` เป็น Controller บางที่สุดในระบบ (326/437 บรรทัด) Business Logic ของฝั่ง LIFF/Tenant ทั้งหมดอยู่ใน `tenantAuthService.js`, `tenantService.js`, `billingService.js` แทน (Phase 14 Refactor)
- **Maintenance Billing**: `MaintenanceRequest` มีฟิลด์ `payer` (MANAGEMENT/TENANT) — ถ้า TENANT และสถานะ `resolved` แล้ว `billingService.generateInvoice()` จะรวมค่าซ่อมเข้า `otherFee` ของบิลรอบถัดไปอัตโนมัติ (mark ผ่าน `billedInvoiceId` กันเรียกเก็บซ้ำ)
- **Room Ownership & Notification Log**: `Room.owner` (FK → `User`) สำหรับกำหนดเจ้าของห้องแยกจากผู้เช่า, `RoomResident` รองรับผู้อยู่อาศัยร่วมห้อง (Co-Resident), `NotificationLog` เก็บประวัติการส่งแจ้งเตือน LINE/SMS ทุกช่องทาง (Invoice, Maintenance, Parcel, General, **AUTH_VERIFY, PROFILE_FETCH**) ราย Building/Tenant/Room พร้อมสถานะ SUCCESS/FAILED — `buildingId` เป็น Nullable (เหตุการณ์ระดับ Auth ยังไม่รู้ตึก) Query LINE API Failure ทั้งหมด: `notification_logs WHERE notification_type IN ('AUTH_VERIFY','PROFILE_FETCH') AND status='FAILED'`
- **`LINE_AUTH_MOCK_MODE` (.env)**: ข้าม Network Call ไปตรวจ Token กับ LINE จริงตอน Dev — **เปิดค้างไว้บนเครื่อง Dev ได้ตลอดโดยไม่ทำ `yarn test` พัง** (Decouple แล้วใน Phase 15: mockMode มีผลแค่ตอน**มี** Token ส่งมาเท่านั้น ส่วน "ปล่อยผ่านแบบไม่มี Token เลย" ผูกกับ `nodeEnv==='development'` อย่างเดียวเสมอ ใน `liffAuthMiddleware.js` และ `liffController.js`'s `silentLogin`) — ห้ามเปิดบน Production เด็ดขาด
- **Default `themeColor`**: `#0E7490` (HorHub Brand Teal, Sample จากโลโก้จริง) ทุกจุด Fallback ทั้ง Backend/Frontend — ไม่ใช่ `#3B82F6` (Blue) เดิมอีกต่อไป (ยกเว้น Preset ตัวเลือกสีให้แอดมินเลือกเองใน `BuildingSettingsView.vue` ที่ยังมี "น้ำเงิน (Blue)" เป็นตัวเลือกหนึ่งตามปกติ)

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

## 🛠️ คำสั่งที่ใช้ในโปรเจกต์ (Yarn Commands)

```bash
# การติดตั้ง Dependencies ด้วย Yarn
yarn install

# การรันระบบในโหมดพัฒนา
yarn dev

# การรันระบบในโหมด Production
yarn start

# การรันระบบ Database Migrations
yarn migrate

# การรันชุดทดสอบทั้งหมด (211/211 Passed ล่าสุด)
yarn test

# การรันชุดทดสอบแบบ Watch Mode
yarn test:watch

# การตรวจสอบ Code Coverage
yarn test:coverage
```

---

## 📐 กฎการเขียนโค้ดและดีไซน์ (Code Style & Conventions)

1. **Module System**: ใช้ `require` และ `module.exports` (CommonJS) สอดคล้องกันทั้งโปรเจกต์
2. **Layer Responsibilities**:
   - `routes`: กำหนด Endpoint URL และผูก Middleware (ห้ามใส่ Business Logic ใน Route)
   - `controllers`: รับ HTTP Request, เรียกใช้ Services และส่งคืน HTTP Response
   - `services`: ประมวลผล Business Logic และการติดต่อกับ Database ทั้งหมด — **ห้าม Controller เรียก Prisma ตรงๆ เด็ดขาด** (`src/services/userService.js`, `src/services/authService.js` (JWT ล้วนๆ), `src/services/tenantAuthService.js` (Tenant Login/PIN/Link ทุกรูปแบบ คืนผลเป็น `{statusCode, body, refreshToken}`), `src/services/tenantService.js` (Tenant CRUD + LIFF Identity/Invite), `src/services/billingService.js` (คำนวณบิล + LIFF Invoice/QR/Slip))
   - `validators`: กำหนด Zod Validation Schemas (`src/validators/authValidator.js`, `src/validators/mainValidator.js`)
   - `migrations`: จัดการสร้างและอัปเดตโครงสร้าง Database Schema แบบอัตโนมัติ (`src/migrations/files/*.sql`)
   - `middlewares`: Security (Helmet, Rate Limiting), Auth (Access Token Verification), Zod Validation และ Error Handling
   - `config`: จัดการการอ่านค่า Environment Variables และการตั้งค่า Third-party libraries (`src/config/db.js`)
3. **Error Handling**: ส่งผ่าน Error ด้วย `next(error)` เสมอเพื่อให้ `errorMiddleware` จัดการ — Service ที่ต้องการ Throw ด้วย Status Code เฉพาะ (400/403/404) ให้ตั้ง `error.statusCode` (และ `error.code` ถ้ามี Error Code ให้ Frontend เช็ค) ก่อน `throw` ได้เลย `errorMiddleware.js` อ่านค่านี้เป็นหลักเสมอ (แก้ไปแล้วใน Phase 14 — เดิมไม่เคยอ่าน `err.statusCode` เลย ทำให้ Error ที่ Service Throw มากลายเป็น 500 เสมอ)
4. **Language Policy**: ความคิดเห็นในโค้ด (Comments) และเอกสารคำอธิบาย ให้ใช้ **ภาษาไทย** เป็นหลัก

---

## 🤝 ข้อตกลงการทำงานร่วมกันระหว่าง Gemini และ Claude (Multi-Agent Protocol)

1. **อัปเดต Activity Log**: เมื่อ Agent ทำการสร้างหรือแก้ไขไฟล์งาน ให้ลงบันทึกใน [docs/ACTIVITY_LOG.md](file:///Users/user/Desktop/playgroud/playground/playground-api/docs/ACTIVITY_LOG.md) เสมอ
2. **รักษาความสะอาดของโค้ด**: ก่อนจบการทำงาน ให้รัน `yarn test` เพื่อตรวจสอบว่าไม่มี Breaking Changes
3. **การส่งมอบงาน (Handover)**: หากต้องส่งต่องานใหีก Agent ให้ระบุสถานะล่าสุดลงใน `docs/ACTIVITY_LOG.md`
