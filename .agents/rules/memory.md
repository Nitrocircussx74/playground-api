# 🧠 กฎการอัปเดตความจำโปรเจกต์ (Update Memory Protocol)

เมื่อผู้ใช้พิมพ์คำสั่ง **`update memory`** (หรือขอให้อัปเดตความรู้/ความจำโปรเจกต์):

## 🚫 กฎเหล็กประจำโปรเจกต์ (Strict Rule)
- **ห้ามใส่ Credit ของ AI หรือ Agent ทุกประเภท** ในไฟล์โค้ด คอมเมนต์ เอกสาร หรือ commit messages โดยเด็ดขาด

---

## 📋 สิ่งที่ AI Agents (ทั้ง Gemini และ Claude) ต้องดำเนินการทันที:

1. **สรุปความรู้ใหม่**: สรุปกฎระเบียบ การตัดสินใจเชิงสถาปัตยกรรม เทคโนโลยีใหม่ หรือข้อตกลงที่เพิ่งตกลงกับผู้ใช้
2. **อัปเดตไฟล์คอนฟิกหลัก**:
   - 📝 **[AGENTS.md](file:///Users/user/Desktop/playgroud/playground/playground-api/AGENTS.md)**: อัปเดตกฎและสเปกกลางของโปรเจกต์
   - ♊ **[GEMINI.md](file:///Users/user/Desktop/playgroud/playground/playground-api/GEMINI.md)**: อัปเดตแนวทางเฉพาะสำหรับ Gemini
   - 🧠 **[CLAUDE.md](file:///Users/user/Desktop/playgroud/playground/playground-api/CLAUDE.md)**: อัปเดตแนวทางเฉพาะสำหรับ Claude
3. **อัปเดตไฟล์บันทึกและคู่มือ**:
   - 📋 **[docs/ACTIVITY_LOG.md](file:///Users/user/Desktop/playgroud/playground/playground-api/docs/ACTIVITY_LOG.md)**: ลงบันทึกการอัปเดต memory ล่าสุด
   - 📘 **[README.md](file:///Users/user/Desktop/playgroud/playground/playground-api/README.md)**: อัปเดตคู่มือหากมีการเปลี่ยนแปลงฟีเจอร์หรือคำสั่ง
