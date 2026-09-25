// tests/setup.js
// ตั้งค่าสภาพแวดล้อมสำหรับการรัน Test เพื่อป้องกันการยิง API หรือส่งข้อความไปยัง LINE จริง 100%

// ใช้ DB แยกเสมอ ห้ามรันเทสต์กับ DB dev (เทสต์เขียน/ลบข้อมูลจริง) — ต้องตั้ง TEST_DATABASE_URL ใน .env
require('dotenv').config();
const testDbUrl = process.env.TEST_DATABASE_URL;
if (!testDbUrl || !/_test\b/.test(testDbUrl.split('?')[0]) || testDbUrl === process.env.DATABASE_URL) {
  throw new Error('ปฏิเสธการรันเทสต์: ต้องตั้ง TEST_DATABASE_URL เป็น DB ที่ชื่อลงท้าย _test และไม่ซ้ำกับ DATABASE_URL');
}
process.env.DATABASE_URL = testDbUrl;

process.env.NODE_ENV = 'test';
process.env.PORT = '9090';
jest.setTimeout(30000);

// Mock @line/bot-sdk MessagingApiClient โดยตรงเป็น Global Safeguard
jest.mock('@line/bot-sdk', () => {
  return {
    messagingApi: {
      MessagingApiClient: jest.fn().mockImplementation(() => ({
        pushMessage: jest.fn().mockResolvedValue({}),
        multicast: jest.fn().mockResolvedValue({}),
        broadcast: jest.fn().mockResolvedValue({}),
        getProfile: jest.fn().mockResolvedValue({
          userId: 'mock_line_user_id',
          displayName: 'Mock Test User',
          pictureUrl: 'https://example.com/mock.jpg',
          statusMessage: 'Test Status'
        })
      }))
    }
  };
});
