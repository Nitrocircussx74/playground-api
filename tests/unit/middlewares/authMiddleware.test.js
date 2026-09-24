const authenticateJWT = require('../../../src/middlewares/authMiddleware');
const authService = require('../../../src/services/authService');

describe('authMiddleware Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  test('ควรตอบกลับ 401 หากไม่ได้แนบ Authorization Header', () => {
    authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('ปฏิเสธการเข้าถึง')
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('ควรตอบกลับ 401 หาก Header ไม่ได้เริ่มต้นด้วย Bearer', () => {
    req.headers.authorization = 'Basic invalidtoken';

    authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  afterEach(() => jest.restoreAllMocks());

  test('ควรอนุญาตให้ผ่าน (เรียก next) และฝัง req.user เมื่อ Access Token ถูกต้อง', async () => {
    const mockUser = { id: 123, email: 'test@example.com' };
    const token = authService.generateAccessToken(mockUser);
    jest.spyOn(authService, 'resolveCurrentClaims').mockImplementation(async (decoded) => decoded);

    req.headers.authorization = `Bearer ${token}`;

    await authenticateJWT(req, res, next);

    expect(req.user).toBeDefined();
    expect(req.user.id).toBe(mockUser.id);
    expect(next).toHaveBeenCalled();
  });

  test('ควรใช้ role ล่าสุดจาก DB แทน role ที่ฝังใน Token (ถูกลดสิทธิ์แล้วมีผลทันที)', async () => {
    const token = authService.generateAccessToken({ id: 'u1', email: 'a@b.com', role: 'owner' });
    jest.spyOn(authService, 'resolveCurrentClaims').mockImplementation(async (decoded) => ({ ...decoded, role: 'tenant' }));

    req.headers.authorization = `Bearer ${token}`;
    await authenticateJWT(req, res, next);

    expect(req.user.role).toBe('tenant');
    expect(next).toHaveBeenCalled();
  });

  test('ควรตอบ 401 เมื่อบัญชีถูกลบไปแล้ว แม้ Token ยังไม่หมดอายุ', async () => {
    const token = authService.generateAccessToken({ id: 'u1', email: 'a@b.com', role: 'admin' });
    jest.spyOn(authService, 'resolveCurrentClaims').mockResolvedValue(null);

    req.headers.authorization = `Bearer ${token}`;
    await authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
