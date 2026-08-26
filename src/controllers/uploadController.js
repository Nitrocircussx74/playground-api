class UploadController {
  /**
   * รับและประมวลผลไฟล์รูปภาพที่ผ่านการอัปโหลดจาก Multer
   */
  async uploadFile(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาแนบไฟล์รูปภาพที่ต้องการอัปโหลด'
        });
      }

      // สร้าง Full URL สำหรับเข้าถึงไฟล์ static
      const protocol = req.protocol;
      const host = req.get('host');
      const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

      return res.status(200).json({
        success: true,
        message: 'อัปโหลดไฟล์รูปภาพเรียบร้อยแล้ว',
        data: {
          filename: req.file.filename,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
          url: fileUrl
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UploadController();
