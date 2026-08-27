const xlsx = require('xlsx');
const billingService = require('../services/billingService');

class MeterImportController {
  /**
   * สร้างและดาวน์โหลดไฟล์ Excel Template รายชื่อห้องพักและเลขมิเตอร์เดิมประจำตึก
   * GET /api/admin/buildings/:buildingId/meters/template
   */
  async downloadTemplate(req, res, next) {
    try {
      const { buildingId } = req.params;

      const building = await billingService.prisma.building.findUnique({
        where: { id: buildingId }
      });

      if (!building) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลตึก' });
      }

      // ดึงรายชื่อห้องพักที่มีผู้เช่า (occupied)
      const rooms = await billingService.prisma.room.findMany({
        where: { buildingId, status: 'occupied' },
        orderBy: { roomNumber: 'asc' },
        include: {
          tenant: true,
          meterRecords: {
            orderBy: { recordedAt: 'desc' },
            take: 10
          }
        }
      });

      // Construct Excel JSON rows
      const templateData = rooms.map((room) => {
        const waterMeter = room.meterRecords.find((m) => m.meterType === 'water');
        const electricMeter = room.meterRecords.find((m) => m.meterType === 'electric');
        return {
          'เลขห้องพัก (Room Number)': room.roomNumber,
          'ชื่อผู้เช่า (Tenant Name)': room.tenant ? `${room.tenant.firstName} ${room.tenant.lastName}` : '-',
          'มิเตอร์น้ำเดิม (Previous Water)': waterMeter ? Number(waterMeter.currentReading) : 0,
          'มิเตอร์น้ำใหม่ (New Water)': '',
          'มิเตอร์ไฟเดิม (Previous Electric)': electricMeter ? Number(electricMeter.currentReading) : 0,
          'มิเตอร์ไฟใหม่ (New Electric)': ''
        };
      });

      const worksheet = xlsx.utils.json_to_sheet(templateData);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Meter Readings');

      // Set column widths for clean readability
      worksheet['!cols'] = [
        { wch: 20 },
        { wch: 25 },
        { wch: 22 },
        { wch: 20 },
        { wch: 22 },
        { wch: 20 }
      ];

      const excelBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const filename = `Meter_Template_${building.name.replace(/\s+/g, '_')}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      return res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * อ่านไฟล์อัปโหลด -> วนลูป Validate ข้อมูลทีละแถว (In-Memory Preview) -> ส่งคืน JSON
   * POST /api/admin/buildings/:buildingId/meters/import-preview
   */
  async previewImport(req, res, next) {
    try {
      const { buildingId } = req.params;

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'กรุณาอัปโหลดไฟล์ Excel/CSV (.xlsx, .csv)' });
      }

      // Read Excel file buffer
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

      if (!rawRows || rawRows.length === 0) {
        return res.status(400).json({ success: false, message: 'ไฟล์ที่อัปโหลดไม่มีข้อมูล' });
      }

      // Fetch all rooms in this building
      const rooms = await billingService.prisma.room.findMany({
        where: { buildingId },
        include: {
          tenant: true,
          meterRecords: {
            orderBy: { recordedAt: 'desc' },
            take: 10
          }
        }
      });

      const roomsMap = new Map();
      rooms.forEach((r) => roomsMap.set(String(r.roomNumber).trim(), r));

      const previewItems = [];

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];

        // Extract values from column names or keys
        const rawRoomNumber = String(
          row['เลขห้องพัก (Room Number)'] || row['roomNumber'] || row['Room Number'] || row['เลขห้อง'] || ''
        ).trim();

        const newWaterRaw = row['มิเตอร์น้ำใหม่ (New Water)'] ?? row['newWater'] ?? row['New Water'] ?? '';
        const newElectricRaw = row['มิเตอร์ไฟใหม่ (New Electric)'] ?? row['newElectric'] ?? row['New Electric'] ?? '';

        const room = roomsMap.get(rawRoomNumber);

        let isValid = true;
        let errorMessage = null;

        if (!rawRoomNumber) {
          isValid = false;
          errorMessage = 'ไม่พบเลขห้องพักในแถวนี้';
        } else if (!room) {
          isValid = false;
          errorMessage = `ไม่พบห้อง ${rawRoomNumber} ในตึกนี้`;
        } else if (room.status !== 'occupied') {
          isValid = false;
          errorMessage = `ห้อง ${rawRoomNumber} เป็นห้องว่าง (ไม่มีผู้เช่า)`;
        }

        const waterMeter = room?.meterRecords.find((m) => m.meterType === 'water');
        const electricMeter = room?.meterRecords.find((m) => m.meterType === 'electric');

        const oldWater = waterMeter ? Number(waterMeter.currentReading) : 0;
        const oldElectric = electricMeter ? Number(electricMeter.currentReading) : 0;

        const newWater = newWaterRaw !== '' ? Number(newWaterRaw) : NaN;
        const newElectric = newElectricRaw !== '' ? Number(newElectricRaw) : NaN;

        if (isValid) {
          if (isNaN(newWater) || newWater < 0) {
            isValid = false;
            errorMessage = 'กรุณาระบุเลขมิเตอร์น้ำใหม่ให้ถูกต้อง';
          } else if (newWater < oldWater) {
            isValid = false;
            errorMessage = `เลขมิเตอร์น้ำใหม่ (${newWater}) น้อยกว่าเลขเดิม (${oldWater})`;
          } else if (isNaN(newElectric) || newElectric < 0) {
            isValid = false;
            errorMessage = 'กรุณาระบุเลขมิเตอร์ไฟใหม่ให้ถูกต้อง';
          } else if (newElectric < oldElectric) {
            isValid = false;
            errorMessage = `เลขมิเตอร์ไฟใหม่ (${newElectric}) น้อยกว่าเลขเดิม (${oldElectric})`;
          }
        }

        const waterUsage = !isNaN(newWater) ? Math.max(0, newWater - oldWater) : 0;
        const electricUsage = !isNaN(newElectric) ? Math.max(0, newElectric - oldElectric) : 0;

        previewItems.push({
          rowId: i + 1,
          roomId: room?.id || null,
          roomNumber: rawRoomNumber,
          tenantName: room?.tenant ? `${room.tenant.firstName} ${room.tenant.lastName}` : 'N/A',
          oldWater,
          newWater: isNaN(newWater) ? '' : newWater,
          waterUsage,
          oldElectric,
          newElectric: isNaN(newElectric) ? '' : newElectric,
          electricUsage,
          isValid,
          errorMessage
        });
      }

      return res.status(200).json({
        success: true,
        message: `ประมวลผลพรีวิวเรียบร้อยแล้ว (${previewItems.length} แถว)`,
        data: previewItems
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MeterImportController();
