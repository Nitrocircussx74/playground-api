const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class AuditService {
  /**
   * บันทึกประวัติการใช้งานระบบ (Audit Log / Activity History)
   * @param {Object} params
   * @param {string} params.adminId - ID ของแอดมินผู้ดำเนินการ
   * @param {string} params.action - ประเภทการกระทำ ('CREATE', 'UPDATE', 'DELETE')
   * @param {string} params.entity - โมดูลที่ดำเนินการ ('ROOM', 'INVOICE', 'TENANT', 'BUILDING_SETTING', 'ANNOUNCEMENT', 'USER')
   * @param {string} [params.entityId] - ID ของวัตถุที่ถูกดำเนินการ
   * @param {Object} [params.oldValues] - ค่าข้อมูลก่อนการแก้ไข (JSON Object)
   * @param {Object} [params.newValues] - ค่าข้อมูลหลังการแก้ไข (JSON Object)
   */
  async logAction({ adminId, action, entity, entityId, oldValues, newValues }) {
    if (!adminId) return null;
    try {
      return await prisma.auditLog.create({
        data: {
          adminId,
          action: (action || 'UPDATE').toUpperCase(),
          entity: (entity || 'SYSTEM').toUpperCase(),
          entityId: entityId ? String(entityId) : null,
          oldValues: oldValues ? JSON.parse(JSON.stringify(oldValues)) : null,
          newValues: newValues ? JSON.parse(JSON.stringify(newValues)) : null
        }
      });
    } catch (error) {
      console.error('⚠️ Failed to save AuditLog record:', error.message);
      return null;
    }
  }
}

module.exports = new AuditService();
