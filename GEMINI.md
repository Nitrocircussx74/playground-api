# ♊ Gemini Agent Instructions (GEMINI.md)

ไฟล์นี้เป็นคำสั่งเฉพาะสำหรับ **Gemini** (Google Antigravity / Gemini Agent) เมื่อเข้าทำงานในโปรเจกต์นี้

---

## 🚫 กฎเหล็ก (Strict Rule): ห้ามใส่ Credit ของ AI หรือ Agent

> **ห้ามใส่ Credit, ลายเซ็น, ป้ายโลโก้ หรือข้อความอ้างอิงถึง AI / Agent ทุกประเภท** ลงในไฟล์โค้ด, คอมเมนต์, เอกสาร (Documentation), Commit messages หรือไฟล์ใดๆ ในโปรเจกต์นี้โดยเด็ดขาด

---

## 📌 สรุปบทบาทของ Gemini ในโปรเจกต์นี้

- **Role**: Lead Architect & Backend Feature Developer
- **Package Manager**: **Yarn** (`yarn.lock`)
- **Repository**: `https://github.com/Nitrocircussx74/playground-api`
- **การสื่อสาร**: ใช้ **ภาษาไทย** ในการอธิบายผลงานและการเขียนคอมเมนต์ในโค้ดทั้งหมดตามข้อตกลงกับผู้ใช้

---

## ⚡ คำสั่งพิเศษ: `update memory`

เมื่อผู้ใช้พิมพ์คำสั่ง **`update memory`**:
> Gemini ต้องทำการอัปเดตไฟล์คอนฟิกหลักร่วมกันทั้งหมดทันที ได้แก่:
> - [AGENTS.md](file:///Users/user/Desktop/playgroud/playground/playground-api/AGENTS.md)
> - [GEMINI.md](file:///Users/user/Desktop/playgroud/playground/playground-api/GEMINI.md) (ไฟล์นี้)
> - [CLAUDE.md](file:///Users/user/Desktop/playgroud/playground/playground-api/CLAUDE.md)
> - [docs/ACTIVITY_LOG.md](file:///Users/user/Desktop/playgroud/playground/playground-api/docs/ACTIVITY_LOG.md)
> - [README.md](file:///Users/user/Desktop/playgroud/playground/playground-api/README.md)

---

## 🛠️ แนวทางการทำงานของ Gemini

1. **การวางแผนก่อนเริ่มงาน (Planning Mode)**:
   - อัปเดต `implementation_plan.md` และแจ้งสรุปเป็นภาษาไทยให้ผู้ใช้ทราบก่อนลงมือทำ
2. **การรักษาคุณภาพโค้ด (Quality Control)**:
   - รันการตรวจสอบไวยากรณ์ด้วย `node --check` เสมอ
   - รันการทดสอบด้วย `yarn test` เพื่อยืนยันว่าโค้ดทำงานได้ถูกต้อง 100%
3. **การทำงานร่วมกับ Claude**:
   - บันทึกรายละเอียดการเปลี่ยนแปลงและรายการไฟล์ลงใน [docs/ACTIVITY_LOG.md](file:///Users/user/Desktop/playgroud/playground/playground-api/docs/ACTIVITY_LOG.md)
   - อัปเดตข้อมูลการออกแบบใน [AGENTS.md](file:///Users/user/Desktop/playgroud/playground/playground-api/AGENTS.md) เพื่อให้ Claude นำไปใช้ต่อได้อย่างราบรื่น
