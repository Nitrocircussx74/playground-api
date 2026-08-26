const authService = require('../../../src/services/authService');
const jwt = require('jsonwebtoken');

describe('AuthService Unit Tests (JWT Best Practices Dual Tokens)', () => {
  const mockUserPayload = {
    id: 999,
    email: 'unittest@example.com',
    name: 'Unit Test User',
    role: 'tester'
  };

  test('generateAccessToken - ควรสร้าง Access Token ที่ถูกต้อง', () => {
    const token = authService.generateAccessToken(mockUserPayload);

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');

    const decoded = jwt.decode(token);
    expect(decoded.id).toBe(mockUserPayload.id);
    expect(decoded.email).toBe(mockUserPayload.email);
  });

  test('generateRefreshToken - ควรสร้าง Refresh Token ที่ถูกต้อง', () => {
    const token = authService.generateRefreshToken(mockUserPayload);

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');

    const decoded = jwt.decode(token);
    expect(decoded.id).toBe(mockUserPayload.id);
  });

  test('verifyAccessToken - ควรคืนค่า Decoded Payload เมื่อ Token ถูกต้อง', () => {
    const token = authService.generateAccessToken(mockUserPayload);
    const decoded = authService.verifyAccessToken(token);

    expect(decoded.id).toBe(mockUserPayload.id);
    expect(decoded.email).toBe(mockUserPayload.email);
  });

  test('verifyAccessToken - ควรโยน Error เมื่อส่ง Token ที่ไม่ถูกต้อง', () => {
    const invalidToken = 'invalid.jwt.token.string';

    expect(() => {
      authService.verifyAccessToken(invalidToken);
    }).toThrow();
  });
});
