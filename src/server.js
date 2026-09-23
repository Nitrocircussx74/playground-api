const { execSync } = require('child_process');
const app = require('./app');
const config = require('./config/env');
const prisma = require('./config/prisma');

const { initLateFeeCron } = require('./jobs/lateFeeCron');
const { initLeaseExpiryCron } = require('./jobs/leaseExpiryCron');

function killProcessOnPort(port) {
  try {
    if (process.platform === 'win32') {
      execSync(`for /f "tokens=5" %a in ('netstat -aon ^| findstr :${port}') do taskkill /f /pid %a`, { stdio: 'ignore' });
    } else {
      const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8' })
        .split('\n')
        .map((p) => p.trim())
        .filter((p) => p && p !== String(process.pid) && p !== String(process.ppid));

      if (pids.length > 0) {
        execSync(`kill -9 ${pids.join(' ')}`, { stdio: 'ignore' });
      }
    }
  } catch {
    // Process already terminated or not found
  }
}

let server;

function startServer() {
  server = app.listen(config.port, async () => {
    console.log(`=================================`);
    console.log(`Server is running on port ${config.port}`);
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Health Check: http://localhost:${config.port}/`);
    console.log(`Protected API: http://localhost:${config.port}/api`);
    console.log(`Google Auth: http://localhost:${config.port}/auth/google`);
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
    if (err.code === 'EADDRINUSE') {
      console.warn(`[WARN] Port ${config.port} is already in use. Killing previous process and restarting...`);
      killProcessOnPort(config.port);
      setTimeout(() => {
        startServer();
      }, 500);
    } else {
      console.error('Server error:', err);
    }
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
