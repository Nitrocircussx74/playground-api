const prisma = require('../config/prisma');

class VendorController {
  /**
   * GET /api/admin/buildings/:buildingId/vendors
   * ดึงรายชื่อช่าง/ผู้รับเหมาประจำอาคาร
   */
  async getVendorsByBuilding(req, res, next) {
    try {
      const { buildingId } = req.params;
      const { category } = req.query;

      const where = { buildingId };
      if (category) {
        where.category = category;
      }

      const vendors = await prisma.vendor.findMany({
        where,
        orderBy: { createdAt: 'desc' }
      });

      return res.status(200).json({
        success: true,
        data: vendors
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/buildings/:buildingId/vendors
   * เพิ่มช่าง/ผู้รับเหมาใหม่
   */
  async createVendor(req, res, next) {
    try {
      const { buildingId } = req.params;
      const { name, category, phone, lineId, note } = req.body;

      if (!name || !category) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุชื่อและหมวดหมู่ของช่าง/ผู้รับเหมา'
        });
      }

      const vendor = await prisma.vendor.create({
        data: {
          buildingId,
          name,
          category,
          phone: phone || null,
          lineId: lineId || null,
          note: note || null
        }
      });

      return res.status(201).json({
        success: true,
        message: 'เพิ่มข้อมูลช่างสำเร็จ',
        data: vendor
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/admin/vendors/:id
   * อัปเดตข้อมูลช่าง/ผู้รับเหมา
   */
  async updateVendor(req, res, next) {
    try {
      const { id } = req.params;
      const { name, category, phone, lineId, note } = req.body;

      const vendor = await prisma.vendor.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(category && { category }),
          phone: phone !== undefined ? phone : undefined,
          lineId: lineId !== undefined ? lineId : undefined,
          note: note !== undefined ? note : undefined
        }
      });

      return res.status(200).json({
        success: true,
        message: 'อัปเดตข้อมูลช่างสำเร็จ',
        data: vendor
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/admin/vendors/:id
   * ลบช่าง/ผู้รับเหมา
   */
  async deleteVendor(req, res, next) {
    try {
      const { id } = req.params;
      await prisma.vendor.delete({
        where: { id }
      });

      return res.status(200).json({
        success: true,
        message: 'ลบข้อมูลช่างสำเร็จ'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new VendorController();
