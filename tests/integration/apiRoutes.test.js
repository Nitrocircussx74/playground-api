const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');

describe('API Routes Integration Tests (/api)', () => {
  let validToken;

  beforeAll(() => {
    const mockUser = {
      id: 'integration_user_1',
      email: 'integration@test.com',
      name: 'Integration User'
    };
    validToken = authService.generateToken(mockUser);
  });

  test('GET / - Health Check ต้องได้ 200 OK', async () => {
    const response = await request(app).get('/');

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('GET /api - แบบไม่แนบ Token ต้องปฏิเสธ 401 Unauthorized', async () => {
    const response = await request(app).get('/api');

    expect(response.statusCode).toBe(401);
    expect(response.body.success).toBe(false);
  });

  test('GET /api - แนบ Token ที่ถูกต้อง ต้องได้ 200 OK และส่งคืนข้อมูล', async () => {
    const response = await request(app)
      .get('/api')
      .set('Authorization', `Bearer ${validToken}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.authenticatedUser.email).toBe('integration@test.com');
  });
});
