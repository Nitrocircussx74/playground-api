/**
 * เลือกห้องที่ผู้เช่ากำลังใช้งานอยู่ใน LIFF (X-Room-Id ก่อน แล้วค่อย X-Building-Id) จากห้องที่ผู้เช่าถือครองจริงเท่านั้น
 * id ที่ไม่ใช่ห้องของตัวเอง (ค่าเก่าค้างใน localStorage หรือปลอม Header) จะ Fallback เป็นห้องแรก กัน IDOR
 */
const pickActiveRoom = (rooms = [], { roomId, buildingId } = {}) =>
  rooms.find((r) => roomId && r.id === roomId)
  || rooms.find((r) => buildingId && r.buildingId === buildingId)
  || rooms[0]
  || null;

module.exports = pickActiveRoom;
