const app = require('./app');
const config = require('./config/env');
const db = require('./config/db');

// เริ่มต้นเปิดเซิร์ฟเวอร์รับการเชื่อมต่อ
const server = app.listen(config.port, async () => {
  console.log(`=================================`);
  console.log(`🚀 Server is running on port ${config.port}`);
  console.log(`🌍 Environment: ${config.nodeEnv}`);
  console.log(`🔗 Health Check: http://localhost:${config.port}/`);
  console.log(`🔐 Protected API: http://localhost:${config.port}/api`);
  console.log(`🔑 Google Auth: http://localhost:${config.port}/auth/google`);
  console.log(`=================================`);

  // ทดสอบเชื่อมต่อกับ PostgreSQL Database
  await db.testConnection();
});

// จัดการกรณีเซิร์ฟเวอร์ปิดตัวอย่างกะทันหัน (Graceful Shutdown)
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection Error:', err);
  server.close(() => process.exit(1));
});
