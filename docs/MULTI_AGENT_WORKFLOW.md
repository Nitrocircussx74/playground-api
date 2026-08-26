# 🔄 กรอบการทำงานร่วมกันระหว่าง Gemini และ Claude (Multi-Agent Workflow Framework)

เอกสารฉบับนี้อธิบายแนวทางและโปรโตคอลการทำงานร่วมกันอย่างมีประสิทธิภาพระหว่าง **Gemini** (Google Antigravity Agent) และ **Claude** (Claude Code Agent) ภายในโปรเจกต์เดียวกัน

---

## ⚡ คำสั่งพิเศษ: `update memory` Protocol

เมื่อผู้ใช้พิมพ์คำสั่ง **`update memory`** ในการสนทนา:
> **ข้อตกลงบังคับ (Mandatory Rule)**: ไม่ว่าจะเป็น Gemini หรือ Claude ที่กำลังปฏิบัติงาน จะต้องดำเนินการอัปเดตไฟล์คอนฟิกหลักและเอกสารสรุปเหล่านี้พร้อมกันทันที:
> 1. 📝 **[AGENTS.md](file:///Users/user/Desktop/playgroud/playground/AGENTS.md)**: เพิ่ม/แก้ไขกฎสเปกกลางและข้อตกลงใหม่
> 2. ♊ **[GEMINI.md](file:///Users/user/Desktop/playgroud/playground/GEMINI.md)**: อัปเดตบริบทเฉพาะของ Gemini
> 3. 🧠 **[CLAUDE.md](file:///Users/user/Desktop/playgroud/playground/CLAUDE.md)**: อัปเดตบริบทเฉพาะของ Claude
> 4. 📋 **[docs/ACTIVITY_LOG.md](file:///Users/user/Desktop/playgroud/playground/docs/ACTIVITY_LOG.md)**: ลงบันทึกประวัติการอัปเดต Memory ล่าสุด
> 5. 📘 **[README.md](file:///Users/user/Desktop/playgroud/playground/README.md)**: ปรับปรุงคู่มือให้ตรงกับสถานะปัจจุบัน

---

## 🎯 1. การแบ่งบทบาทหน้าที่ (Role Distribution Matrix)

| หน้าที่ / งาน (Task) | Gemini | Claude | สรุปความรับผิดชอบ |
| :--- | :---: | :---: | :--- |
| **System Architecture Design** | 🟢 หลัก | 🔵 สนับสนุน | Gemini ออกแบบเลเยอร์โปรเจกต์และสร้างโครงร่างหลัก |
| **Core API & Auth Implementation** | 🟢 หลัก | 🔵 สนับสนุน | Gemini พัฒนาระบบ JWT, Google OAuth และ Routes |
| **Unit & Integration Testing** | 🔵 สนับสนุน | 🟢 หลัก | Claude ช่วยขยายเคสทดสอบ เขียน Edge cases และคำนวณ Coverage |
| **Code Review & Refactoring** | 🔵 สนับสนุน | 🟢 หลัก | Claude ตรวจสอบคุณภาพโค้ด ลดความซับซ้อน และทำ Code Cleanup |
| **Documentation & Activity Logging** | 🟢 หลัก | 🟢 หลัก | ทั้งสอง Agent ลงบันทึกความคืบหน้าใน `docs/ACTIVITY_LOG.md` |

---

## 🔗 2. เครื่องมือและไฟล์สื่อสารระหว่าง Agent (Communication & Context Sync)

เพื่อให้ทั้งสอง AI สามารถสลับกันทำงานต่อจากกันได้อย่างราบรื่นโดยไม่เสียบริบท (Context):

1. **[AGENTS.md](file:///Users/user/Desktop/playgroud/playground/AGENTS.md)**: สเปกรวมของโปรเจกต์และกฎกติกาที่ทุก AI ต้องปฏิบัติตาม
2. **[docs/ACTIVITY_LOG.md](file:///Users/user/Desktop/playgroud/playground/docs/ACTIVITY_LOG.md)**: บันทึกสถานะล่าสุด ไฟล์ที่ถูกสร้าง/แก้ไข และสิ่งที่ทำเสร็จแล้ว
3. **[GEMINI.md](file:///Users/user/Desktop/playgroud/playground/GEMINI.md)**: แนวทางและสไตล์เฉพาะของ Gemini Agent
4. **[CLAUDE.md](file:///Users/user/Desktop/playgroud/playground/CLAUDE.md)**: แนวทางและสไตล์เฉพาะของ Claude Agent
5. **[.agents/rules/memory.md](file:///Users/user/Desktop/playgroud/playground/.agents/rules/memory.md)**: กฎคำสั่งพิเศษ `update memory`

---

## 🔄 3. ขั้นตอนการส่งมอบงาน (Handover Protocol)

เมื่อ Agent ตัวใดตัวหนึ่งพัฒนาฟีเจอร์เสร็จเรียบร้อยแล้ว และต้องการส่งต่อให้อีก Agent ทำงานต่อ:

1. **รัน Verification**: รัน `npm test` เพื่อให้แน่ใจว่าไม่มีข้อผิดพลาดเกิดขึ้น
2. **อัปเดต Activity Log**: เขียนบันทึกสั้นๆ ใน [docs/ACTIVITY_LOG.md](file:///Users/user/Desktop/playgroud/playground/docs/ACTIVITY_LOG.md) ระบุ:
   - ฟีเจอร์ที่พัฒนาสำเร็จ
   - ไฟล์ที่แก้ไขหรือสร้างใหม่
   - ข้อเสนอแนะหรือสิ่งที่ต้องทำต่อใน Phase ถัดไป
3. **การ commit งาน (ถ้ามี Git)**:
   - ฝั่ง Gemini ให้ใช้รูปแบบ: `feat(gemini): <ข้อความภาษาไทย>`
   - ฝั่ง Claude ให้ใช้รูปแบบ: `feat(claude): <ข้อความภาษาไทย>`
