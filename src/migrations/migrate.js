const fs = require('fs');
const path = require('path');
const db = require('../config/db');

/**
 * สคริปต์สำหรับรัน Database Migrations บน PostgreSQL
 */
const runMigrations = async () => {
  console.log('🚀 กำลังเริ่มต้นกระบวนการ Database Migration...');

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const executedRes = await db.query('SELECT name FROM schema_migrations');
    const executedMigrations = new Set(executedRes.rows.map((row) => row.name));

    const migrationsDir = path.join(__dirname, 'files');

    if (!fs.existsSync(migrationsDir)) {
      fs.mkdirSync(migrationsDir, { recursive: true });
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('ℹ️ ไม่พบไฟล์ Migration ใหม่ในไดเรกทอรี src/migrations/files');
      process.exit(0);
    }

    let appliedCount = 0;

    for (const file of files) {
      if (executedMigrations.has(file)) {
        continue;
      }

      console.log(`⏳ กำลังรัน Migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✅ รัน Migration สำเร็จ: ${file}`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ เกิดข้อผิดพลาดขณะรัน Migration ${file}:`, err.message);
        client.release();
        process.exit(1);
      } finally {
        client.release();
      }
    }

    if (appliedCount === 0) {
      console.log('👍 Database อยู่ในสถานะล่าสุดแล้ว (No pending migrations)');
    } else {
      console.log(`🎉 ทำการรัน Migration ทั้งหมด ${appliedCount} ไฟล์เรียบร้อยแล้ว!`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในระบบ Migration:', error.message);
    process.exit(1);
  }
};

runMigrations();
