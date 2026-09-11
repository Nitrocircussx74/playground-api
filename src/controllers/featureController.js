const billingService = require('../services/billingService');

const STANDARD_FEATURE_METADATA = {
  ENABLE_MAINTENANCE_REQUEST: {
    title: 'ระบบแจ้งซ่อมและร้องเรียน',
    category: 'LINE LIFF (ลูกบ้าน)',
    description: 'เปิดให้ลูกบ้านส่งเรื่องแจ้งซ่อมหรือร้องเรียนปัญหาห้องพัก พร้อมแนบรูปถ่ายและติดตามสถานะงานซ่อมของช่างผ่าน LINE'
  },
  ENABLE_LINE_PAYMENT: {
    title: 'ระบบบิลค่าเช่า & ชำระเงินออนไลน์',
    category: 'LINE LIFF (ลูกบ้าน)',
    description: 'เปิดให้ลูกบ้านดูยอดบิลค่าเช่าประจำเดือน สแกน PromptPay QR Code และแนบสลิปโอนเงินผ่าน LINE ได้ทันที'
  },
  ENABLE_PARCEL_NOTIFY: {
    title: 'ระบบแจ้งเตือนและรับพัสดุ',
    category: 'LINE LIFF (ลูกบ้าน)',
    description: 'ระบบแจ้งเตือนเมื่อมีพัสดุมาส่งถึงหอพัก พร้อมสร้าง QR Code ให้ลูกบ้านนำมาสแกนรับของที่นิติบุคคล'
  },
  ENABLE_ANNOUNCEMENTS: {
    title: 'ข่าวสาร & ประกาศหอพัก',
    category: 'LINE LIFF (ลูกบ้าน)',
    description: 'แสดงข่าวสารและประกาศสำคัญจากหอพักบนหน้าแรกของ LINE ให้ลูกบ้านรับทราบข้อมูลได้อย่างรวดเร็ว'
  },
  ENABLE_DIGITAL_ID: {
    title: 'บัตรประจำตัวผู้เช่าดิจิทัล (Digital ID)',
    category: 'LINE LIFF (ลูกบ้าน)',
    description: 'แสดงปุ่มบัตรประจำตัวผู้เช่าดิจิทัล (QR Code) บนหน้าโปรไฟล์ สำหรับใช้แสดงตัวตนกับเจ้าหน้าที่หอพัก'
  },
  ENABLE_RECEIPT_HISTORY: {
    title: 'ประวัติใบเสร็จรับเงิน E-Receipt',
    category: 'LINE LIFF (ลูกบ้าน)',
    description: 'เปิดให้ลูกบ้านสามารถดูประวัติการชำระเงินย้อนหลัง และดาวน์โหลดใบเสร็จรับเงินอิเล็กทรอนิกส์ได้เอง'
  },
  ENABLE_VEHICLE_MANAGEMENT: {
    title: 'จัดการยานพาหนะและทะเบียนรถ',
    category: 'LINE LIFF (ลูกบ้าน)',
    description: 'เปิดให้ลูกบ้านลงทะเบียนและจัดการข้อมูลป้ายทะเบียนรถยนต์หรือมอเตอร์ไซค์ในระบบเพื่อใช้สิทธิ์ที่จอดรถ พร้อมแจ้งแขก/ผู้มาเยือนล่วงหน้า'
  },
  ENABLE_FACILITY_BOOKING: {
    title: 'จองพื้นที่ส่วนกลาง',
    category: 'LINE LIFF (ลูกบ้าน)',
    description: 'เปิดให้ลูกบ้านจองพื้นที่ส่วนกลาง เช่น สระว่ายน้ำ ห้องฟิตเนส หรือห้องประชุม ผ่าน LINE ได้ด้วยตนเอง'
  },
  ENABLE_VOTING: {
    title: 'โหวต & แบบสำรวจความเห็น',
    category: 'LINE LIFF (ลูกบ้าน)',
    description: 'เปิดให้ลูกบ้านร่วมโหวตหรือแสดงความเห็นในโพลที่นิติบุคคล/ผู้ดูแลสร้างขึ้น ผ่าน LINE'
  }
};

class FeatureController {
  /**
   * ดึงรายการสถานะ Feature Toggles ทั้งหมด (รวมและตัดรายการซ้ำออก พร้อมคำอธิบายที่เข้าใจง่าย)
   */
  async getFeatures(req, res, next) {
    try {
      const { buildingId } = req.query;

      // ดึงข้อมูลทั้งหมดที่เกี่ยวข้อง (ทั้งค่าเริ่มต้นส่วนกลาง และค่าเฉพาะตึก)
      const allRecords = await billingService.prisma.featureToggle.findMany({
        orderBy: { key: 'asc' }
      });

      // ดึงรายชื่อ Master Keys ทั้งหมดที่ระบบรองรับ
      const allDefinedKeys = Object.keys(STANDARD_FEATURE_METADATA);
      const uniqueFeaturesMap = new Map();
      const featureMap = {};

      // 1. นำ Master Metadata มาเป็นโครงเริ่มต้น
      allDefinedKeys.forEach((key) => {
        const meta = STANDARD_FEATURE_METADATA[key];
        uniqueFeaturesMap.set(key, {
          key,
          title: meta.title,
          category: meta.category,
          description: meta.description,
          isActive: true, // ค่าเริ่มต้น
          buildingId: buildingId || null,
          isBuildingOverride: false
        });
        featureMap[key] = true;
      });

      // 2. นำค่า Global Default (buildingId = null) ใน Database มาทับ
      allRecords
        .filter((r) => !r.buildingId)
        .forEach((r) => {
          const meta = STANDARD_FEATURE_METADATA[r.key] || {};
          uniqueFeaturesMap.set(r.key, {
            id: r.id,
            key: r.key,
            title: meta.title || r.key,
            category: meta.category || 'ระบบทั่วไป',
            description: meta.description || r.description || `ฟีเจอร์ ${r.key}`,
            isActive: r.isActive,
            buildingId: null,
            isBuildingOverride: false
          });
          featureMap[r.key] = r.isActive;
        });

      // 3. หากเลือกอาคาร (buildingId) ให้นำค่าเฉพาะอาคารนั้นมาทับ
      if (buildingId) {
        allRecords
          .filter((r) => r.buildingId === buildingId)
          .forEach((r) => {
            const meta = STANDARD_FEATURE_METADATA[r.key] || {};
            uniqueFeaturesMap.set(r.key, {
              id: r.id,
              key: r.key,
              title: meta.title || r.key,
              category: meta.category || 'ระบบทั่วไป',
              description: meta.description || r.description || `ฟีเจอร์ ${r.key}`,
              isActive: r.isActive,
              buildingId: buildingId,
              isBuildingOverride: true
            });
            featureMap[r.key] = r.isActive;
          });
      }

      // แปลง Map เป็น Array รายการฟีเจอร์ที่ไม่ซ้ำกัน 1 Key = 1 การ์ดเท่านั้น
      const features = Array.from(uniqueFeaturesMap.values());

      return res.status(200).json({
        success: true,
        data: {
          features,
          featureMap
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินอัปเดตสถานะการเปิด-ปิด Feature Toggle (isActive: true/false) ประจำตึกหรือสากล
   */
  async updateFeature(req, res, next) {
    try {
      const { key } = req.params;
      const { isActive, buildingId } = req.body;

      if (isActive == null) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุค่า isActive (true หรือ false)'
        });
      }

      const meta = STANDARD_FEATURE_METADATA[key] || {};
      const targetBuildingId = buildingId || req.query.buildingId || null;
      const description = meta.description || req.body.description || `ฟีเจอร์ ${key}`;

      let updatedFeature;
      if (targetBuildingId) {
        updatedFeature = await billingService.prisma.featureToggle.upsert({
          where: { key_buildingId: { key, buildingId: targetBuildingId } },
          update: { isActive: Boolean(isActive), description },
          create: {
            key,
            isActive: Boolean(isActive),
            buildingId: targetBuildingId,
            description
          }
        });
      } else {
        const firstMatch = await billingService.prisma.featureToggle.findFirst({
          where: { key, buildingId: null }
        });
        if (firstMatch) {
          updatedFeature = await billingService.prisma.featureToggle.update({
            where: { id: firstMatch.id },
            data: { isActive: Boolean(isActive), description }
          });
        } else {
          updatedFeature = await billingService.prisma.featureToggle.create({
            data: {
              key,
              isActive: Boolean(isActive),
              description
            }
          });
        }
      }

      return res.status(200).json({
        success: true,
        message: `อัปเดตสถานะฟีเจอร์ ${meta.title || key} เป็น ${updatedFeature.isActive ? 'เปิดใช้งาน (ON)' : 'ปิดใช้งาน (OFF)'} เรียบร้อยแล้ว`,
        data: updatedFeature
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FeatureController();
