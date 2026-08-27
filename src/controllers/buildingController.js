const billingService = require('../services/billingService');

class BuildingController {
  /**
   * ดึงรายการอาคาร/ตึกทั้งหมดในระบบ
   */
  async getBuildings(req, res, next) {
    try {
      const buildings = await billingService.prisma.building.findMany({
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
   * อัปเดตการตั้งค่าและ PromptPay QR Code ประจำตึก
   */
  async updateBuildingSetting(req, res, next) {
    try {
      const { id } = req.params; // buildingId
      const { promptpayNum, paymentQrUrl, name, address } = req.body;

      const building = await billingService.prisma.building.findUnique({ where: { id } });
      if (!building) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลอาคาร' });
      }

      // 1. อัปเดตข้อมูลตึก (ถ้ามี)
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
      const setting = await billingService.prisma.buildingSetting.upsert({
        where: { buildingId: id },
        update: {
          ...(promptpayNum !== undefined && { promptpayNum }),
          ...(paymentQrUrl !== undefined && { paymentQrUrl })
        },
        create: {
          buildingId: id,
          promptpayNum: promptpayNum || null,
          paymentQrUrl: paymentQrUrl || null
        }
      });

      return res.status(200).json({
        success: true,
        message: `อัปเดตการตั้งค่าของอาคารเรียบร้อยแล้ว`,
        data: setting
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new BuildingController();
