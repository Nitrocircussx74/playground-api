const authService = require('../../../src/services/authService');
const jwt = require('jsonwebtoken');

describe('AuthService Unit Tests', () => {
  const mockUserPayload = {
    id: 'user_999',
    email: 'unittest@example.com',
    name: 'Unit Test User',
    role: 'tester'
  };

  test('generateToken - ควรสร้าง JWT Token ที่ถูกต้อง', () => {
    const token = authService.generateToken(mockUserPayload);

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    
    // Decode token เพื่อตรวจเช็คความถูกต้องของ payload
    const decoded = jwt.decode(token);
    expect(decoded.id).toBe(mockUserPayload.id);
    expect(decoded.email).toBe(mockUserPayload.email);
  });

  test('verifyToken - ควรคืนค่า Decoded Payload เมื่อ Token ถูกต้อง', () => {
    const token = authService.generateToken(mockUserPayload);
    const decoded = authService.verifyToken(token);

    expect(decoded.id).toBe(mockUserPayload.id);
    expect(decoded.email).toBe(mockUserPayload.email);
  });

  test('verifyToken - ควรโยน Error เมื่อส่ง Token ที่ไม่ถูกต้อง', () => {
    const invalidToken = 'invalid.jwt.token.string';

    expect(() => {
      authService.verifyToken(invalidToken);
    }).toThrow();
  });
});
