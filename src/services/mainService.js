/**
 * Service สำหรับจัดการ Business Logic ของ API หลัก (/api)
 */
class MainService {
  /**
   * ดึงข้อมูลภาพรวม API Dashboard / Status
   * @param {Object} currentUser - ข้อมูล User ที่ยืนยันตัวตนแล้วจาก JWT
   */
  async getApiOverview(currentUser) {
    return {
      message: 'ยินดีต้อนรับเข้าสู่ระบบ Protected API',
      timestamp: new Date().toISOString(),
      authenticatedUser: currentUser,
      features: [
        'JWT Protection Enabled',
        'OAuth 2.0 Integration Ready',
        'Clean Scalable Architecture'
      ]
    };
  }

  /**
   * บันทึกหรือประมวลผลข้อมูลใหม่ผ่าน POST /api
   * @param {Object} data - payload ข้อมูลที่ส่งมาจาก request body
   * @param {Object} currentUser - ข้อมูล User ที่ยืนยันตัวตน
   */
  async processData(data, currentUser) {
    // ในระบบจริง: นำข้อมูลไปประมวลผล Validate หรือบันทึกลง Database
    return {
      success: true,
      action: 'ประมวลผลข้อมูลเรียบร้อยแล้ว',
      receivedData: data,
      processedBy: currentUser.email,
      createdAt: new Date().toISOString()
    };
  }
}

module.exports = new MainService();
