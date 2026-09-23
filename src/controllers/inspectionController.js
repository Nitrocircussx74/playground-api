const prisma = require('../config/prisma');

class InspectionController {
  /**
   * POST /api/admin/inspections
   * บันทึกหรืออัปเดตการตรวจสภาพห้องพัก (Move-in / Move-out)
   */
  async createInspection(req, res, next) {
    try {
      const { leaseId, buildingId, type = 'MOVE_IN', items = [], photoUrls = [], adminNote } = req.body;

      if (!leaseId || !buildingId) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุ leaseId และ buildingId'
        });
      }

      // ตรวจสอบว่ามีสัญญานี้จริง
      const lease = await prisma.leaseContract.findUnique({
        where: { id: leaseId },
        include: { room: true, tenant: true }
      });

      if (!lease) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบสัญญาเช่าที่ระบุ'
        });
      }

      const inspection = await prisma.roomInspection.create({
        data: {
          leaseId,
          buildingId,
          type,
          items: items || [],
          photoUrls: photoUrls || [],
          adminNote: adminNote || null
        },
        include: {
          lease: {
            include: {
              room: true,
              tenant: true
            }
          }
        }
      });

      return res.status(201).json({
        success: true,
        message: 'บันทึกรายการตรวจสภาพห้องสำเร็จ',
        data: inspection
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/leases/:leaseId/inspections
   * ดึงประวัติการตรวจสภาพห้องของสัญญาเช่า
   */
  async getByLease(req, res, next) {
    try {
      const { leaseId } = req.params;
      const inspections = await prisma.roomInspection.findMany({
        where: { leaseId },
        orderBy: { createdAt: 'desc' },
        include: {
          lease: {
            include: { room: true, tenant: true }
          }
        }
      });

      return res.status(200).json({
        success: true,
        data: inspections
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/buildings/:buildingId/inspections
   * ดึงรายการตรวจสภาพห้องทั้งหมดในตึก
   */
  async getByBuilding(req, res, next) {
    try {
      const { buildingId } = req.params;
      const inspections = await prisma.roomInspection.findMany({
        where: { buildingId },
        orderBy: { createdAt: 'desc' },
        include: {
          lease: {
            include: { room: true, tenant: true }
          }
        }
      });

      return res.status(200).json({
        success: true,
        data: inspections
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/admin/inspections/:id
   */
  async deleteInspection(req, res, next) {
    try {
      const { id } = req.params;
      await prisma.roomInspection.delete({
        where: { id }
      });

      return res.status(200).json({
        success: true,
        message: 'ลบรายการตรวจสภาพห้องสำเร็จ'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new InspectionController();
