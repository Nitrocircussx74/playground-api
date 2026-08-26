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

  test('ควรอนุญาตให้ผ่าน (เรียก next) และฝัง req.user เมื่อ Token ถูกต้อง', () => {
    const mockUser = { id: '123', email: 'test@example.com' };
    const token = authService.generateToken(mockUser);

    req.headers.authorization = `Bearer ${token}`;

    authenticateJWT(req, res, next);

    expect(req.user).toBeDefined();
    expect(req.user.id).toBe(mockUser.id);
    expect(next).toHaveBeenCalled();
  });
});
