/**
 * Prisma where สำหรับข้อมูลที่ผูกกับห้อง (บิล/พัสดุ/แจ้งซ่อม) ของ "ห้องที่เลือกอยู่" เท่านั้น
 * ต้องใช้หลัง scopeTenantRooms (req.roomId ผ่านการตรวจสิทธิ์แล้ว) และจำกัดเจ้าของข้อมูลเป็นตัวเอง หรือคนที่ยัง
 * Active ในห้องนี้ (ผู้เช่าหลักของห้องที่เราเป็นผู้อยู่ร่วม) กันข้อมูลผู้เช่าเก่าก่อนย้ายเข้าหลุดมาให้คนใหม่เห็น
 *
 * @param {object} req Express req ที่ผ่าน scopeTenantRooms
 * @param {{ includeUnassigned?: boolean }} opts true = รวมรายการที่ไม่ได้ระบุผู้เช่า (เช่น พัสดุที่นิติลงแค่เลขห้อง)
 */
const roomScopedWhere = (req, { includeUnassigned = false } = {}) => ({
  roomId: req.roomId,
  OR: [
    { tenantId: req.scope.tenantId },
    {
      tenant: {
        is: {
          OR: [
            { rooms: { some: { id: req.roomId } } },
            { roomResidents: { some: { roomId: req.roomId, status: 'ACTIVE' } } },
            { leaseContracts: { some: { roomId: req.roomId, status: 'ACTIVE' } } }
          ]
        }
      }
    },
    ...(includeUnassigned ? [{ tenantId: null }] : [])
  ]
});

/** ยังไม่ได้ผูกผู้เช่า/ไม่มีห้องที่มีสิทธิ์ = ไม่มีข้อมูลให้ดู */
const hasRoomScope = (req) => Boolean(req.scope?.tenantId && req.roomId);

module.exports = { roomScopedWhere, hasRoomScope };
