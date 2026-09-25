const app = require('./app');
const config = require('./config/env');
const prisma = require('./config/prisma');

const { initLateFeeCron } = require('./jobs/lateFeeCron');
const { initLeaseExpiryCron } = require('./jobs/leaseExpiryCron');

// ปฏิเสธการบูตบน Production ถ้า secret/โหมด mock ไม่ปลอดภัย (ดู config/env.js)
config.assertProductionConfig();

let server;

function startServer() {
  server = app.listen(config.port, async () => {
    console.log(`=================================`);
    console.log(`Server is running on port ${config.port}`);
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Health Check: http://localhost:${config.port}/`);
    console.log(`Protected API: http://localhost:${config.port}/api`);
    console.log(`=================================`);

    // ทดสอบเชื่อมต่อกับ Database ผ่าน Prisma
    try {
      await prisma.$connect();
      console.log('Database connected via Prisma');
    } catch (err) {
      console.error('Database connection error:', err.message);
    }

    // เริ่มต้นทำงาน Background Worker (Late Fee Cron Job)
    if (config.nodeEnv !== 'test') {
      initLateFeeCron();
      initLeaseExpiryCron();
    }
  });

  server.on('error', (err) => {
    // ไม่ไล่ kill process อื่นที่ถือ Port อยู่ (เดิมสั่ง kill -9 ทุก Environment) — แจ้งแล้วจบ ให้ผู้ดูแลเลือกจัดการเอง
    console.error(
      err.code === 'EADDRINUSE'
        ? `[FATAL] Port ${config.port} ถูกใช้งานอยู่แล้ว กรุณาปิด Process เดิมหรือเปลี่ยน PORT`
        : `[FATAL] Server error: ${err.message}`
    );
    process.exit(1);
  });
}

startServer();

// จัดการกรณีเซิร์ฟเวอร์ปิดตัวอย่างกะทันหัน (Graceful Shutdown)
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection Error:', err);
  if (server) {
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});
