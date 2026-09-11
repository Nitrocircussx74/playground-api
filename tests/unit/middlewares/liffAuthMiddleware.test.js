const config = require('../../../src/config/env');
const lineService = require('../../../src/services/lineService');
const { verifyLineIdToken } = require('../../../src/middlewares/liffAuthMiddleware');

/**
 * verifyLineIdToken ปกติจะ Short-circuit ผ่าน Mock Mode เสมอตอนรัน Test (NODE_ENV=test ถูกบังคับใน
 * tests/setup.js) — เทสชุดนี้ปลอม nodeEnv ชั่วคราวเพื่อบังคับให้วิ่งเข้า Path เรียก fetch() จริง
 * (Mock ไว้) จะได้ทดสอบ Logic การตัดสินใจ Log NotificationLog (AUTH_VERIFY) ที่เพิ่งเพิ่มเข้าไปได้
 * ต้องปลอม config.line.mockMode = false ด้วยเสมอ ไม่งั้นถ้าเครื่อง Dev เปิด LINE_AUTH_MOCK_MODE=true
 * ไว้ทดสอบผ่าน Browser (ค่าจาก .env จริง ไม่ใช่แค่ nodeEnv) เทสชุดนี้จะ Short-circuit เหมือนเดิม
 */
describe('verifyLineIdToken Unit Tests (LINE API Failure Logging)', () => {
  let originalNodeEnv;
  let originalMockMode;
  let originalFetch;
  let logDeliverySpy;

  beforeEach(() => {
    originalNodeEnv = config.nodeEnv;
    originalMockMode = config.line.mockMode;
    originalFetch = global.fetch;
    config.nodeEnv = 'production'; // ปลอมให้ผ่าน Mock Mode Guard ไปเรียก fetch() จริง (Mock ไว้)
    config.line.mockMode = false; // เช่นกัน เผื่อเครื่อง Dev เปิด LINE_AUTH_MOCK_MODE=true ไว้ทดสอบ
    logDeliverySpy = jest.spyOn(lineService, 'logDelivery').mockResolvedValue(null);
  });

  afterEach(() => {
    config.nodeEnv = originalNodeEnv;
    config.line.mockMode = originalMockMode;
    global.fetch = originalFetch;
    logDeliverySpy.mockRestore();
  });

  test('Network Error (เชื่อมต่อ LINE ไม่ได้เลย) -> ต้อง log AUTH_VERIFY แบบ FAILED แล้วโยน Error ต่อ', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(verifyLineIdToken('some_token')).rejects.toThrow('ไม่สามารถเชื่อมต่อ LINE Platform');

    expect(logDeliverySpy).toHaveBeenCalledTimes(1);
    expect(logDeliverySpy).toHaveBeenCalledWith(expect.objectContaining({
      notificationType: 'AUTH_VERIFY',
      status: 'FAILED'
    }));
  });

  test('LINE ตอบ 503 (Outage ฝั่ง LINE) -> ต้อง log AUTH_VERIFY แบบ FAILED', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });

    await expect(verifyLineIdToken('some_token')).rejects.toThrow('LINE ID Token ไม่ถูกต้องหรือหมดอายุแล้ว');

    expect(logDeliverySpy).toHaveBeenCalledTimes(1);
    expect(logDeliverySpy).toHaveBeenCalledWith(expect.objectContaining({
      notificationType: 'AUTH_VERIFY',
      status: 'FAILED',
      errorReason: expect.stringContaining('503')
    }));
  });

  test('LINE ตอบ 429 (Rate Limited) -> ต้อง log AUTH_VERIFY แบบ FAILED เหมือนกัน', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests' });

    await expect(verifyLineIdToken('some_token')).rejects.toThrow();

    expect(logDeliverySpy).toHaveBeenCalledTimes(1);
  });

  test('Token หมดอายุ/ไม่ถูกต้องปกติ (400) -> ห้าม log (ไม่ใช่ปัญหาฝั่ง LINE API กันรก Log)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, statusText: 'Bad Request' });

    await expect(verifyLineIdToken('some_token')).rejects.toThrow('LINE ID Token ไม่ถูกต้องหรือหมดอายุแล้ว');

    expect(logDeliverySpy).not.toHaveBeenCalled();
  });

  test('Token ถูกต้อง (200) -> ไม่ log และคืนค่า Payload ปกติ', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ sub: 'U123', aud: config.line.liffChannelId || '' })
    });

    const result = await verifyLineIdToken('some_token');

    expect(result.sub).toBe('U123');
    expect(logDeliverySpy).not.toHaveBeenCalled();
  });
});
