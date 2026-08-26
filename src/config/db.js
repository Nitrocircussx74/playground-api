const { Pool } = require('pg');
const config = require('./env');

/**
 * ตั้งค่า Connection Pool สำหรับ PostgreSQL Database
 */
const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
  max: 20, // จำนวน Connection สูงสุดใน Pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// ตรวจจับ Error จาก Connection Pool
pool.on('error', (err) => {
  console.error('❌ เกิดข้อผิดพลาดที่ไม่คาดคิดใน PostgreSQL Connection Pool:', err);
});

/**
 * ฟังก์ชันทดสอบการเชื่อมต่อกับ Database
 */
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ เชื่อมต่อกับ PostgreSQL Database สำเร็จ!');
    client.release();
  } catch (error) {
    console.error('⚠️ การเชื่อมต่อ PostgreSQL ขัดข้อง (ระบบจะสลับใช้ Mock Fallback กรณีไม่มี DB):', error.message);
  }
};

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  testConnection
};
