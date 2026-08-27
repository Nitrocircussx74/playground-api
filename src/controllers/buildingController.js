const billingService = require('../services/billingService');

class BuildingController {
  /**
   * ดึงรายการอาคาร/ตึกทั้งหมดในระบบ
   */
  async getBuildings(req, res, next) {
    try {
      const userRole = (req.user?.role || '').toLowerCase();
      const userId = req.user?.id;

      let where = {};

      if (userRole !== 'super_admin' && userId) {
        const permissions = await billingService.prisma.userBuildingPermission.findMany({
          where: { userId },
          select: { buildingId: true }
        });
        const allowedBuildingIds = permissions.map((p) => p.buildingId);
        where = { id: { in: allowedBuildingIds } };
      }

      const buildings = await billingService.prisma.building.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        include: {
          setting: true,
          _count: {
            select: { rooms: true }
          }
        }
      });

      return res.status(200).json({
        success: true,
        data: buildings
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * สร้างตึก/อาคารใหม่ในระบบ
   */
  async createBuilding(req, res, next) {
    try {
      const { name, address, promptpayNum, paymentQrUrl } = req.body;

      if (!name) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุชื่ออาคาร/ตึก (Building Name)'
        });
      }

      const building = await billingService.prisma.building.create({
        data: {
          name,
          address: address || null,
          setting: {
            create: {
              promptpayNum: promptpayNum || null,
              paymentQrUrl: paymentQrUrl || null
            }
          }
        },
        include: {
          setting: true
        }
      });

      return res.status(201).json({
        success: true,
        message: `สร้างอาคาร ${building.name} เรียบร้อยแล้ว`,
        data: building
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงข้อมูลและตั้งค่าของตึกตาม ID
   */
  async getBuildingById(req, res, next) {
    try {
      const { id } = req.params;

      const building = await billingService.prisma.building.findUnique({
        where: { id },
        include: {
          setting: true,
          rooms: {
            include: { tenant: true }
          }
        }
      });

      if (!building) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบข้อมูลอาคาร'
        });
      }

      return res.status(200).json({
        success: true,
        data: building
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * อัปเดตการตั้งค่าของตึกทั้ง 4 หมวดหมู่ (General, Payment, Billing, Rules)
   */
  async updateBuildingSetting(req, res, next) {
    try {
      const id = req.params.id || req.params.buildingId;
      const {
        // 1. General Info
        name,
        address,
        phone,
        coverImageUrl,

        // 2. Payment Options
        paymentQrUrl,
        promptpayNum,
        bankName,
        bankAccountName,
        bankAccountNo,
        paymentNote,

        // 3. Billing & Utilities
        waterRate,
        electricRate,
        dueDateDay,
        latePenalty,

        // 4. Rules & Contracts
        depositMonths,
        advanceMonths,
        termsAndConditions
      } = req.body;

      const building = await billingService.prisma.building.findUnique({ where: { id } });
      if (!building) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลอาคาร' });
      }

      // 1. อัปเดตข้อมูลทั่วไปของตึก (Building)
      if (name || address !== undefined) {
        await billingService.prisma.building.update({
          where: { id },
          data: {
            ...(name && { name }),
            ...(address !== undefined && { address })
          }
        });
      }

      // 2. อัปเดตหรือสร้าง BuildingSetting
      const settingData = {
        ...(phone !== undefined && { phone }),
        ...(coverImageUrl !== undefined && { coverImageUrl }),
        ...(paymentQrUrl !== undefined && { paymentQrUrl }),
        ...(promptpayNum !== undefined && { promptpayNum }),
        ...(bankName !== undefined && { bankName }),
        ...(bankAccountName !== undefined && { bankAccountName }),
        ...(bankAccountNo !== undefined && { bankAccountNo }),
        ...(paymentNote !== undefined && { paymentNote }),
        ...(waterRate !== undefined && { waterRate }),
        ...(electricRate !== undefined && { electricRate }),
        ...(dueDateDay !== undefined && { dueDateDay: parseInt(dueDateDay, 10) }),
        ...(latePenalty !== undefined && { latePenalty }),
        ...(depositMonths !== undefined && { depositMonths: parseInt(depositMonths, 10) }),
        ...(advanceMonths !== undefined && { advanceMonths: parseInt(advanceMonths, 10) }),
        ...(termsAndConditions !== undefined && { termsAndConditions })
      };

      const setting = await billingService.prisma.buildingSetting.upsert({
        where: { buildingId: id },
        update: settingData,
        create: {
          buildingId: id,
          ...settingData
        }
      });

      const updatedBuilding = await billingService.prisma.building.findUnique({
        where: { id },
        include: { setting: true }
      });

      return res.status(200).json({
        success: true,
        message: 'อัปเดตข้อมูลการตั้งค่าตึกสำเร็จ',
        data: {
          ...updatedBuilding,
          ...setting
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Alias สำหรับ GET /api/v1/buildings/:buildingId/settings หรือ /api/admin/buildings/:buildingId/settings
   */
  async getBuildingSettings(req, res, next) {
    req.params.id = req.params.buildingId || req.params.id;
    return this.getBuildingById(req, res, next);
  }
}

module.exports = new BuildingController();
