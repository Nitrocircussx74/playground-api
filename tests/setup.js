// tests/setup.js
// ตั้งค่าสภาพแวดล้อมสำหรับการรัน Test เพื่อป้องกันการยิง API หรือส่งข้อความไปยัง LINE จริง 100%

process.env.NODE_ENV = 'test';

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
