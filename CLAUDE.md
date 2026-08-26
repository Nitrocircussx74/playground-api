# 🧠 Claude Code Instructions (CLAUDE.md)

ไฟล์นี้เป็นคำสั่งเฉพาะสำหรับ **Claude** (Claude Code / Anthropic AI Agent) เมื่อเข้าทำงานในโปรเจกต์นี้

---

## 🚫 Strict Rule: NO AI Credits

> **NEVER add credits, signatures, logos, or references to any AI or Agent** in any code files, comments, documentation, commit messages, or any artifacts in this repository.

---

## ⚡ Special Trigger Command: `update memory`

When user inputs **`update memory`**:
> Claude MUST update the following configuration & log files simultaneously:
> 1. [AGENTS.md](file:///Users/user/Desktop/playgroud/playground/playground-api/AGENTS.md)
> 2. [GEMINI.md](file:///Users/user/Desktop/playgroud/playground/playground-api/GEMINI.md)
> 3. [CLAUDE.md](file:///Users/user/Desktop/playgroud/playground/playground-api/CLAUDE.md) (This file)
> 4. [docs/ACTIVITY_LOG.md](file:///Users/user/Desktop/playgroud/playground/playground-api/docs/ACTIVITY_LOG.md)
> 5. [README.md](file:///Users/user/Desktop/playgroud/playground/playground-api/README.md)

---

## 🚀 Quick Reference Commands

- **Build / Run Dev Server**: `npm run dev`
- **Run Migrations**: `npm run migrate`
- **Run All Tests**: `npm test`
- **Run Single Test**: `npx jest tests/unit/services/authService.test.js`
- **Check Code Coverage**: `npm run test:coverage`

---

## 🧱 Architecture & Design Guidelines

1. **Clean Layering**:
   - `src/routes/` -> `src/controllers/` -> `src/services/`
   - ห้ามเขียน SQL/Database Queries หรือ JWT Sign/Verify ใน Controller หรือ Route โดยเด็ดขาด ให้ย้ายไปไว้ใน `src/services/`
2. **Security & Validation**:
   - Helmet for HTTP headers, express-rate-limit for DoS protection, cookie-parser
   - Zod schemas in `src/validators/` with `validateMiddleware.js`
3. **JWT Best Practices (Dual Tokens)**:
   - Access Token (15m) in response payload for `Authorization: Bearer <TOKEN>`
   - Refresh Token (7d) in HttpOnly, Secure, SameSite Cookie + DB table `refresh_tokens`
   - Endpoints: `/auth/login`, `/auth/refresh` (Rotation), `/auth/logout` (Revocation), `/auth/me`
4. **Database & Migrations**:
   - PostgreSQL connection pool configured in `src/config/db.js`
   - SQL migration files placed in `src/migrations/files/*.sql`
5. **Testing Expectations**:
   - เมื่อสร้าง Service หรือ Middleware ใหม่ ต้องสร้างไฟล์ Unit Test ใน `tests/unit/` ควบคู่กันเสมอ
   - เมื่อสร้าง Endpoint ใหม่ ต้องสร้าง Integration Test ใน `tests/integration/` ด้วย Supertest

---

## 🤝 Multi-Agent Synchronization (กับ Gemini)

- เคารพการออกแบบของ **Gemini** ใน `AGENTS.md` และ `GEMINI.md`
- บันทึกการเปลี่ยนแปลงและสถานะการทำงานลงใน [docs/ACTIVITY_LOG.md](file:///Users/user/Desktop/playgroud/playground/playground-api/docs/ACTIVITY_LOG.md) เมื่อทำงานเสร็จสิ้น
- อ่านข้อมูลบริบทจาก `AGENTS.md` ก่อนเริ่มสกัดโค้ดหรือ Refactor
