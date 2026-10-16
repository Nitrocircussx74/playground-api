const { jsonReplacer, SECRET_MASK } = require('../../src/utils/secrets');

describe('jsonReplacer (กันความลับหลุดใน JSON Response)', () => {
  test('ตัด pinHash/passwordHash ทิ้งแม้ซ้อนอยู่ลึก และ mask token/secret ของ LINE', () => {
    const payload = {
      rooms: [{ tenant: { name: 'A', pinHash: '$2a$x', passwordHash: '$2a$y', idCard: '123' } }],
      setting: { lineChannelAccessToken: 'real-token', lineChannelSecret: 'real-secret', lineOaId: '@x' }
    };
    const out = JSON.parse(JSON.stringify(payload, jsonReplacer));

    expect(out.rooms[0].tenant).toEqual({ name: 'A', idCard: '123' });
    expect(out.setting).toEqual({ lineChannelAccessToken: SECRET_MASK, lineChannelSecret: SECRET_MASK, lineOaId: '@x' });
  });

  test('ค่าว่างของ token ยังคงเป็น null เพื่อให้ UI รู้ว่ายังไม่ได้ตั้งค่า', () => {
    const out = JSON.parse(JSON.stringify({ lineChannelSecret: null }, jsonReplacer));
    expect(out.lineChannelSecret).toBeNull();
  });
});
