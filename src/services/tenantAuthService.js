const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const authService = require('./authService');
const { verifyLineIdToken } = require('../middlewares/liffAuthMiddleware');
const { getPhoneVariants } = require('../utils/normalizePhone');

const TENANT_ROOM_INCLUDE = { rooms: { include: { building: true } } };

/**
 * ประกอบ Payload ผู้ใช้งานฝั่งลูกบ้านสำหรับใช้ทั้งออก JWT และส่งกลับใน Response
 * (รวมจุดที่เคยก๊อปวางซ้ำกันเกือบทุกเมธอด Login/Link ของ Tenant)
 */
function buildTenantUserPayload(tenant, overrides = {}) {
  return {
    id: tenant.id,
    tenantId: tenant.id,
    phone: tenant.phone,
    email: tenant.email || `tenant_${tenant.id}@dorm.local`,
    name: tenant.name || `${tenant.firstName} ${tenant.lastName}`.trim(),
    displayName: tenant.lineDisplayName || tenant.firstName,
    role: 'tenant',
    lineUserId: tenant.lineUserId,
    roomId: tenant.rooms?.[0]?.id,
    buildingId: tenant.rooms?.[0]?.buildingId,
    ...overrides
  };
}

/**
 * ออก Dual JWT Tokens (Access + Refresh) ให้ tenantUser พร้อมบันทึก Refresh Token ลง DB
 */
async function issueTokens(tenantUser) {
  const accessToken = authService.generateAccessToken(tenantUser);
  const refreshToken = authService.generateRefreshToken(tenantUser);
  await authService.saveRefreshToken(tenantUser.id, refreshToken);
  return { accessToken, refreshToken };
}

class TenantAuthService {
  /**
   * เข้าสู่ระบบด้วย LINE SSO Token
   */
  async loginWithLine({ idToken, lineDisplayName, linePictureUrl }) {
    if (!idToken) {
      return { statusCode: 400, body: { success: false, message: 'กรุณาระบุ LINE ID Token สำหรับยืนยันตัวตน' } };
    }

    let lineUserId;
    let lineProfileData = null;
    try {
      const verified = await verifyLineIdToken(idToken);
      lineUserId = verified.sub;
      lineProfileData = {
        displayName: verified.name || lineDisplayName || null,
        pictureUrl: verified.picture || linePictureUrl || null
      };
    } catch {
      return { statusCode: 401, body: { success: false, code: 'LINE_TOKEN_INVALID', message: 'LINE ID Token ไม่ถูกต้องหรือหมดอายุแล้ว' } };
    }

    const tenant = await prisma.tenant.findFirst({ where: { lineUserId }, include: TENANT_ROOM_INCLUDE });
    if (!tenant) {
      return {
        statusCode: 404,
        body: { success: false, isRegistered: false, message: 'ไม่พบข้อมูลลูกบ้านที่ผูกกับบัญชี LINE นี้ กรุณาลงทะเบียนก่อน' }
      };
    }

    if (lineProfileData && (lineProfileData.displayName || lineProfileData.pictureUrl)) {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          ...(lineProfileData.displayName && { lineDisplayName: lineProfileData.displayName }),
          ...(lineProfileData.pictureUrl && { linePictureUrl: lineProfileData.pictureUrl })
        }
      }).catch(() => {});
    }

    const tenantUser = buildTenantUserPayload(tenant);
    const { accessToken, refreshToken } = await issueTokens(tenantUser);

    return {
      statusCode: 200,
      refreshToken,
      body: {
        success: true,
        message: 'เข้าสู่ระบบด้วย LINE สำเร็จ (LINE SSO Login Success)',
        accessToken,
        token: accessToken,
        user: tenantUser,
        tenant,
        data: { accessToken, token: accessToken, user: tenantUser, tenant }
      }
    };
  }

  /**
   * เข้าสู่ระบบด้วย LIFF Seamless PIN 6 หลัก
   */
  async pinLogin({ rawToken, pin, buildingId }) {
    if (!rawToken || !pin) {
      return { statusCode: 400, body: { success: false, message: 'กรุณาระบุ LINE ID Token และรหัส PIN 6 หลัก' } };
    }
    if (!/^\d{6}$/.test(String(pin))) {
      return { statusCode: 400, body: { success: false, message: 'รหัส PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น' } };
    }

    let lineUserId = null;
    let lineProfileData = null;
    try {
      const verified = await verifyLineIdToken(rawToken);
      lineUserId = verified?.sub;
      lineProfileData = { displayName: verified?.name || null, pictureUrl: verified?.picture || null };
    } catch {
      return { statusCode: 401, body: { success: false, code: 'LINE_TOKEN_INVALID', message: 'LINE ID Token ไม่ถูกต้องหรือหมดอายุแล้ว' } };
    }

    if (!lineUserId) {
      return { statusCode: 401, body: { success: false, message: 'LINE ID Token ไม่ถูกต้องหรือหมดอายุ' } };
    }

    // 1. ค้นหา Tenant: ตรวจสอบจากตาราง UserLineAccount ก่อน (Multi-Building Mapping)
    let tenant = null;
    if (buildingId) {
      const linkedAccount = await prisma.userLineAccount.findUnique({
        where: { buildingId_lineUserId: { buildingId, lineUserId } },
        include: { tenant: { include: TENANT_ROOM_INCLUDE } }
      });
      tenant = linkedAccount?.tenant || null;
    }

    // Fallback: ค้นหาจาก UserLineAccount ใดๆ ที่ตรงกับ lineUserId
    if (!tenant) {
      const anyLinkedAccount = await prisma.userLineAccount.findFirst({
        where: { lineUserId },
        include: { tenant: { include: TENANT_ROOM_INCLUDE } }
      });
      tenant = anyLinkedAccount?.tenant || null;
    }

    // Fallback: ค้นหาจากตาราง Tenant โดยตรง (Backward Compatibility)
    if (!tenant) {
      tenant = await prisma.tenant.findFirst({ where: { lineUserId }, include: TENANT_ROOM_INCLUDE });
    }

    if (!tenant) {
      return {
        statusCode: 404,
        body: {
          success: false,
          code: 'TENANT_NOT_FOUND',
          isRegistered: false,
          message: 'ยังไม่พบบัญชีผู้เช่าที่ผูกกับ LINE ในตึกนี้ กรุณาผูกบัญชีด้วยเบอร์โทรศัพท์'
        }
      };
    }

    if (!tenant.pinHash) {
      return {
        statusCode: 400,
        body: { success: false, code: 'PIN_NOT_SET', message: 'คุณยังไม่ได้ตั้งค่ารหัส PIN 6 หลัก กรุณาตั้งค่า PIN ก่อนใช้งาน' }
      };
    }

    const isMatch = await bcrypt.compare(String(pin), tenant.pinHash);
    if (!isMatch) {
      return { statusCode: 401, body: { success: false, code: 'INVALID_PIN', message: 'รหัส PIN 6 หลักไม่ถูกต้อง' } };
    }

    // บันทึก/อัปเดต UserLineAccount สำหรับตึกนี้อัตโนมัติ (Seamless Sync)
    if (buildingId) {
      await prisma.userLineAccount.upsert({
        where: { buildingId_lineUserId: { buildingId, lineUserId } },
        update: {
          tenantId: tenant.id,
          lineDisplayName: lineProfileData?.displayName || tenant.lineDisplayName,
          linePictureUrl: lineProfileData?.pictureUrl || tenant.linePictureUrl
        },
        create: {
          tenantId: tenant.id,
          buildingId,
          lineUserId,
          lineDisplayName: lineProfileData?.displayName || tenant.lineDisplayName,
          linePictureUrl: lineProfileData?.pictureUrl || tenant.linePictureUrl
        }
      }).catch((e) => console.warn('UserLineAccount sync warning in pinLogin:', e.message));
    }

    const tenantUser = buildTenantUserPayload(tenant, {
      lineUserId: tenant.lineUserId || lineUserId,
      buildingId: buildingId || tenant.rooms?.[0]?.buildingId
    });
    const { accessToken, refreshToken } = await issueTokens(tenantUser);

    return {
      statusCode: 200,
      refreshToken,
      body: {
        success: true,
        message: 'เข้าสู่ระบบด้วย PIN สำเร็จ (LIFF PIN Auto-Login Success)',
        accessToken,
        token: accessToken,
        user: tenantUser,
        tenant,
        data: { accessToken, token: accessToken, user: tenantUser, tenant }
      }
    };
  }

  /**
   * ตั้งค่าหรือรีเซ็ตรหัส PIN 6 หลักสำหรับลูกบ้าน
   */
  async setupOrResetPin({
    targetPin, rawToken, rawPhone, buildingId, lineDisplayName, linePictureUrl, lineStatusMessage,
    lineUserIdFromRequest, tenantIdFromRequest
  }) {
    if (!targetPin || !/^\d{6}$/.test(String(targetPin))) {
      return { statusCode: 400, body: { success: false, message: 'รหัส PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น' } };
    }

    let lineUserId = lineUserIdFromRequest;
    let profileFromToken = null;
    if (!lineUserId && rawToken) {
      try {
        const verified = await verifyLineIdToken(rawToken);
        lineUserId = verified?.sub;
        profileFromToken = { displayName: verified?.name || null, pictureUrl: verified?.picture || null };
      } catch {}
    }

    // ⚠️ ห้ามเชื่อ lineUserId ที่ Client ส่งมาเองตรงๆ ใน body โดยไม่ผ่านการ Verify กับ LINE Platform
    // (จุดนี้เคยเป็นช่องโหว่ Account Takeover: ใครก็ส่ง lineUserId ของคนอื่นมาแล้วตั้ง/รีเซ็ต PIN แทนได้เลย)

    // ต้องมี Identity ที่เชื่อถือได้อย่างน้อยหนึ่งทาง (LINE ID Token ที่ Verify แล้ว หรือ Session JWT ที่ login อยู่แล้ว)
    // ก่อนอนุญาตให้ค้นหา Tenant ด้วยเบอร์โทรศัพท์เพียงอย่างเดียวแล้วเขียนทับ PIN — ไม่งั้นแค่รู้เบอร์โทรก็ Takeover บัญชีได้
    const tenantId = tenantIdFromRequest;
    if (!lineUserId && !tenantId) {
      return {
        statusCode: 401,
        body: { success: false, code: 'LINE_LOGIN_REQUIRED', message: 'กรุณาเข้าสู่ระบบผ่าน LINE ก่อนตั้งค่าหรือรีเซ็ต PIN' }
      };
    }

    let tenant = null;

    if (tenantId) {
      tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: TENANT_ROOM_INCLUDE });
    }

    // 1. หากระบุเบอร์โทรศัพท์ (เช่น มาจาก Reset PIN / Verify flow) ให้ค้นหาตามเบอร์
    if (!tenant && rawPhone) {
      tenant = await prisma.tenant.findFirst({
        where: { phone: { in: getPhoneVariants(rawPhone) } },
        include: TENANT_ROOM_INCLUDE
      });
    }

    // 2. ค้นหาจาก UserLineAccount
    if (!tenant && lineUserId) {
      const linked = await prisma.userLineAccount.findFirst({
        where: { lineUserId },
        include: { tenant: { include: TENANT_ROOM_INCLUDE } }
      });
      tenant = linked?.tenant || null;
    }

    // 3. ค้นหาจาก Tenant.lineUserId โดยตรง
    if (!tenant && lineUserId) {
      tenant = await prisma.tenant.findFirst({ where: { lineUserId }, include: TENANT_ROOM_INCLUDE });
    }

    if (!tenant) {
      return { statusCode: 404, body: { success: false, message: 'ไม่พบข้อมูลลูกบ้านสำหรับตั้งค่าหรือรีเซ็ต PIN' } };
    }

    // ป้องกัน Account Takeover: ถ้าบัญชีนี้ตั้ง PIN และผูก LINE ไว้แล้ว ห้ามให้ LINE คนอื่น
    // (ที่แค่รู้เบอร์โทรของเจ้าของบัญชี) มารีเซ็ต PIN แทนเจ้าของตัวจริงได้
    if (tenant.pinHash && tenant.lineUserId && lineUserId && tenant.lineUserId !== lineUserId) {
      return {
        statusCode: 403,
        body: {
          success: false,
          code: 'ACCOUNT_ALREADY_LINKED',
          message: 'บัญชีนี้ผูกกับ LINE อื่นและตั้งรหัส PIN ไว้แล้ว กรุณาติดต่อนิติบุคคลประจำหอพักเพื่อรีเซ็ต PIN'
        }
      };
    }

    const pinHash = await bcrypt.hash(String(targetPin), 10);
    const updatedTenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        pinHash,
        ...(lineUserId && !tenant.lineUserId ? { lineUserId } : {}),
        ...((lineDisplayName || profileFromToken?.displayName) && !tenant.lineDisplayName
          ? { lineDisplayName: lineDisplayName || profileFromToken?.displayName } : {}),
        ...((linePictureUrl || profileFromToken?.pictureUrl) && !tenant.linePictureUrl
          ? { linePictureUrl: linePictureUrl || profileFromToken?.pictureUrl } : {})
      },
      include: TENANT_ROOM_INCLUDE
    });

    // Upsert UserLineAccount สำหรับตึกนี้เพื่อรองรับ Multi-Building Centralized Identity
    const targetBuildingId = buildingId || tenant.rooms?.[0]?.buildingId;
    if (targetBuildingId && lineUserId) {
      await prisma.userLineAccount.upsert({
        where: { buildingId_lineUserId: { buildingId: targetBuildingId, lineUserId } },
        update: {
          tenantId: updatedTenant.id,
          lineDisplayName: lineDisplayName || profileFromToken?.displayName || updatedTenant.lineDisplayName,
          linePictureUrl: linePictureUrl || profileFromToken?.pictureUrl || updatedTenant.linePictureUrl,
          lineStatusMessage: lineStatusMessage || updatedTenant.lineStatusMessage
        },
        create: {
          tenantId: updatedTenant.id,
          buildingId: targetBuildingId,
          lineUserId,
          lineDisplayName: lineDisplayName || profileFromToken?.displayName || updatedTenant.lineDisplayName,
          linePictureUrl: linePictureUrl || profileFromToken?.pictureUrl || updatedTenant.linePictureUrl,
          lineStatusMessage: lineStatusMessage || updatedTenant.lineStatusMessage
        }
      }).catch((e) => console.warn('UserLineAccount upsert in setupPin:', e.message));
    }

    const tenantUser = buildTenantUserPayload(updatedTenant, {
      lineUserId: lineUserId || updatedTenant.lineUserId,
      buildingId: targetBuildingId || updatedTenant.rooms?.[0]?.buildingId
    });
    const { accessToken, refreshToken } = await issueTokens(tenantUser);

    return {
      statusCode: 200,
      refreshToken,
      body: {
        success: true,
        message: 'ตั้งค่าหรือรีเซ็ตรหัส PIN 6 หลักสำเร็จเรียบร้อยแล้ว',
        accessToken,
        token: accessToken,
        user: tenantUser,
        tenant: updatedTenant,
        data: { accessToken, token: accessToken, user: tenantUser, tenant: updatedTenant }
      }
    };
  }

  /**
   * เปลี่ยนรหัส PIN สำหรับลูกบ้าน (ต้องยืนยันตัวตนด้วย Bearer JWT)
   */
  async changePin({ oldPin, newPin, tenantId, lineUserId }) {
    if (!oldPin || !newPin) {
      return { statusCode: 400, body: { success: false, message: 'กรุณากรอกรหัส PIN เดิมและรหัส PIN ใหม่' } };
    }
    if (!/^\d{6}$/.test(String(newPin))) {
      return { statusCode: 400, body: { success: false, message: 'รหัส PIN ใหม่ต้องเป็นตัวเลข 6 หลักเท่านั้น' } };
    }

    let tenant = null;
    if (tenantId) {
      tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    } else if (lineUserId) {
      tenant = await prisma.tenant.findFirst({ where: { lineUserId } });
    }

    if (!tenant) {
      return { statusCode: 404, body: { success: false, message: 'ไม่พบข้อมูลลูกบ้าน' } };
    }

    // ถ้ามี PIN เดิมอยู่ใน DB ให้ตรวจสอบว่าตรงไหม
    if (tenant.pinHash) {
      const isMatch = await bcrypt.compare(String(oldPin), tenant.pinHash);
      if (!isMatch) {
        return { statusCode: 400, body: { success: false, message: 'รหัส PIN เดิมไม่ถูกต้อง' } };
      }
    }

    const pinHash = await bcrypt.hash(String(newPin), 10);
    await prisma.tenant.update({ where: { id: tenant.id }, data: { pinHash } });

    return { statusCode: 200, body: { success: true, message: 'เปลี่ยนรหัส PIN สำเร็จเรียบร้อยแล้ว' } };
  }

  /**
   * ตรวจสอบสถานะการผูกบัญชีและการตั้งค่า PIN ของลูกบ้าน
   */
  async checkAuthStatus({ rawToken, buildingId, lineUserIdFromRequest }) {
    let lineUserId = lineUserIdFromRequest;

    if (!lineUserId && rawToken) {
      try {
        const verified = await verifyLineIdToken(rawToken);
        lineUserId = verified?.sub;
      } catch {
        return { statusCode: 401, body: { success: false, code: 'LINE_TOKEN_INVALID', message: 'LINE ID Token ไม่ถูกต้องหรือหมดอายุแล้ว' } };
      }
    }

    if (!lineUserId) {
      return { statusCode: 200, body: { success: true, isLinked: false, hasPin: false, data: null } };
    }

    // 1. ค้นหาในตาราง UserLineAccount ตาม buildingId + lineUserId ก่อน
    let tenant = null;
    if (buildingId) {
      const linkedAccount = await prisma.userLineAccount.findUnique({
        where: { buildingId_lineUserId: { buildingId, lineUserId } },
        include: { tenant: { include: TENANT_ROOM_INCLUDE } }
      });
      tenant = linkedAccount?.tenant || null;
    }

    // 2. Fallback: ค้นหาจาก UserLineAccount ใดๆ ที่ตรงกับ lineUserId
    if (!tenant) {
      const anyLinked = await prisma.userLineAccount.findFirst({
        where: { lineUserId },
        include: { tenant: { include: TENANT_ROOM_INCLUDE } }
      });
      tenant = anyLinked?.tenant || null;
    }

    // 3. Fallback: ค้นหาในตาราง Tenant โดยตรง (Backward-Compatible)
    if (!tenant) {
      tenant = await prisma.tenant.findFirst({ where: { lineUserId }, include: TENANT_ROOM_INCLUDE });
    }

    if (!tenant) {
      return { statusCode: 200, body: { success: true, isLinked: false, hasPin: false, isRegistered: false, data: null } };
    }

    return {
      statusCode: 200,
      body: {
        success: true,
        isLinked: true,
        hasPin: Boolean(tenant.pinHash),
        isRegistered: true,
        data: {
          isLinked: true,
          hasPin: Boolean(tenant.pinHash),
          tenant: {
            id: tenant.id,
            firstName: tenant.firstName,
            lastName: tenant.lastName,
            phone: tenant.phone,
            lineDisplayName: tenant.lineDisplayName,
            linePictureUrl: tenant.linePictureUrl
          },
          room: tenant.rooms?.[0] ? { id: tenant.rooms[0].id, roomNumber: tenant.rooms[0].roomNumber } : null
        }
      }
    };
  }

  /**
   * ตรวจสอบว่าเบอร์โทรศัพท์เป็นผู้ใช้เดิมในระบบ HorHub หรือเป็นลูกบ้านใหม่
   */
  async verifyPhoneStatus({ rawPhone }) {
    if (!rawPhone) {
      return { statusCode: 400, body: { success: false, message: 'กรุณาระบุเบอร์โทรศัพท์' } };
    }

    const tenant = await prisma.tenant.findFirst({
      where: { phone: { in: getPhoneVariants(rawPhone) } },
      include: { rooms: { include: { building: true } }, lineAccounts: true }
    });

    if (tenant) {
      const fullName = `${tenant.firstName} ${tenant.lastName}`.trim();
      return {
        statusCode: 200,
        body: {
          success: true,
          isExistingUser: true,
          hasPin: Boolean(tenant.pinHash),
          userName: fullName,
          tenantName: fullName,
          tenant: { id: tenant.id, firstName: tenant.firstName, lastName: tenant.lastName, phone: tenant.phone },
          message: 'พบข้อมูลบัญชีของคุณในระบบ HorHub แล้ว กรุณากรอกรหัส PIN เดิมเพื่อยืนยันตัวตนและผูกเข้ากับตึกนี้'
        }
      };
    }

    return {
      statusCode: 200,
      body: { success: true, isExistingUser: false, hasPin: false, message: 'เป็นลูกบ้านใหม่ กรุณากรอกข้อมูลและตั้งค่ารหัส PIN 6 หลักใหม่' }
    };
  }

  /**
   * ผูก LINE ID ตึกใหม่เข้ากับบัญชีผู้ใช้เดิมด้วย PIN 6 หลัก และออก Token ทันที
   */
  async linkAndLogin({ rawPhone, pin, buildingId, rawToken, lineDisplayName, linePictureUrl, lineStatusMessage }) {
    if (!rawPhone || !pin) {
      return { statusCode: 400, body: { success: false, message: 'กรุณาระบุเบอร์โทรศัพท์และรหัส PIN 6 หลัก' } };
    }
    if (!/^\d{6}$/.test(String(pin))) {
      return { statusCode: 400, body: { success: false, message: 'รหัส PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น' } };
    }

    // ต้องมี LINE ID Token ที่ Verify ผ่านจริงเสมอ (Endpoint นี้มีไว้ "ผูก LINE ใหม่" ให้บัญชีเดิม
    // ถ้าไม่รู้ lineUserId ที่แท้จริงก็ไม่มีอะไรให้ผูก และห้ามเชื่อ lineUserId ที่ Client ส่งมาเองใน body เด็ดขาด)
    let lineUserId = null;
    let profileFromToken = null;
    if (rawToken) {
      try {
        const verified = await verifyLineIdToken(rawToken);
        lineUserId = verified?.sub;
        profileFromToken = { displayName: verified?.name || null, pictureUrl: verified?.picture || null };
      } catch {
        return { statusCode: 401, body: { success: false, code: 'LINE_TOKEN_INVALID', message: 'LINE ID Token ไม่ถูกต้องหรือหมดอายุแล้ว' } };
      }
    }

    if (!lineUserId) {
      return { statusCode: 400, body: { success: false, message: 'กรุณาเข้าสู่ระบบผ่าน LINE ก่อนผูกบัญชี' } };
    }

    const tenant = await prisma.tenant.findFirst({
      where: { phone: { in: getPhoneVariants(rawPhone) } },
      include: TENANT_ROOM_INCLUDE
    });

    if (!tenant) {
      return { statusCode: 404, body: { success: false, message: 'ไม่พบบัญชีผู้ใช้ที่ตรงกับเบอร์โทรศัพท์นี้' } };
    }

    // ⚠️ เดิม endpoint นี้ถ้ายังไม่เคยตั้ง PIN จะเอา PIN ที่ Client ส่งมาตั้งเป็นของจริงทันที
    // (แค่รู้เบอร์โทรก็ Takeover บัญชีได้ ไม่ต้องเดา PIN เลย) — ให้บล็อกเหมือน pinLogin แทน
    // แล้วให้ไปตั้ง PIN ผ่านช่องทางที่มีการยืนยันตัวตนจริง (Invite Code) ที่ setup-pin/register-invite
    if (!tenant.pinHash) {
      return {
        statusCode: 400,
        body: { success: false, code: 'PIN_NOT_SET', message: 'คุณยังไม่ได้ตั้งค่ารหัส PIN 6 หลัก กรุณาตั้งค่า PIN ผ่านรหัสเชิญจากแอดมินก่อนใช้งาน' }
      };
    }

    // หมายเหตุ: ไม่เช็คว่า tenant.lineUserId ตรงกับ lineUserId ปัจจุบันหรือไม่ เพราะ Endpoint นี้มีไว้รองรับ
    // Centralized User Identity (1 ผู้เช่า : หลาย LINE OA ID ต่อตึก) โดยตั้งใจ — ตัวพิสูจน์ตัวตนจริงคือ PIN ด้านล่าง
    const isMatch = await bcrypt.compare(String(pin), tenant.pinHash);
    if (!isMatch) {
      return { statusCode: 401, body: { success: false, code: 'INVALID_PIN', message: 'รหัส PIN 6 หลักไม่ถูกต้อง' } };
    }

    if (buildingId && lineUserId) {
      await prisma.userLineAccount.upsert({
        where: { buildingId_lineUserId: { buildingId, lineUserId } },
        update: {
          tenantId: tenant.id,
          lineDisplayName: lineDisplayName || profileFromToken?.displayName || tenant.lineDisplayName,
          linePictureUrl: linePictureUrl || profileFromToken?.pictureUrl || tenant.linePictureUrl,
          lineStatusMessage: lineStatusMessage || tenant.lineStatusMessage
        },
        create: {
          tenantId: tenant.id,
          buildingId,
          lineUserId,
          lineDisplayName: lineDisplayName || profileFromToken?.displayName || tenant.lineDisplayName,
          linePictureUrl: linePictureUrl || profileFromToken?.pictureUrl || tenant.linePictureUrl,
          lineStatusMessage: lineStatusMessage || tenant.lineStatusMessage
        }
      }).catch((e) => console.warn('UserLineAccount upsert warning in linkAndLogin:', e.message));
    }

    const tenantUser = buildTenantUserPayload(tenant, {
      lineUserId: lineUserId || tenant.lineUserId,
      buildingId: buildingId || tenant.rooms?.[0]?.buildingId
    });
    const { accessToken, refreshToken } = await issueTokens(tenantUser);

    return {
      statusCode: 200,
      refreshToken,
      body: {
        success: true,
        message: 'ยืนยันตัวตนและผูก LINE กับตึกนี้สำเร็จเรียบร้อย',
        pinCreated: false,
        accessToken,
        token: accessToken,
        user: tenantUser,
        tenant,
        data: { accessToken, token: accessToken, user: tenantUser, tenant, pinCreated: false }
      }
    };
  }

  /**
   * เข้าสู่ระบบด้วยเบอร์โทรศัพท์และรหัสผ่าน (Local Password Login) — รองรับทั้ง Tenant และ Admin/Staff (User)
   */
  async loginLocal({ rawPhone, password }) {
    if (!rawPhone || !password) {
      return { statusCode: 400, body: { success: false, message: 'กรุณากรอกเบอร์โทรศัพท์และรหัสผ่าน' } };
    }

    const possiblePhones = getPhoneVariants(rawPhone);

    // 1. ค้นหาในตาราง Tenant ก่อน
    const tenant = await prisma.tenant.findFirst({ where: { phone: { in: possiblePhones } }, include: TENANT_ROOM_INCLUDE });

    if (tenant) {
      if (!tenant.passwordHash) {
        return {
          statusCode: 400,
          body: { success: false, code: 'PASSWORD_NOT_SET', message: 'คุณยังไม่ได้ตั้งรหัสผ่าน กรุณาเข้าสู่ระบบด้วย LINE เพื่อตั้งค่ารหัสผ่าน' }
        };
      }

      const isMatch = await bcrypt.compare(password, tenant.passwordHash);
      if (!isMatch) {
        return { statusCode: 401, body: { success: false, message: 'เบอร์โทรศัพท์หรือรหัสผ่านไม่ถูกต้อง' } };
      }

      const tenantUser = buildTenantUserPayload(tenant);
      const { accessToken, refreshToken } = await issueTokens(tenantUser);

      return {
        statusCode: 200,
        refreshToken,
        body: {
          success: true,
          message: 'เข้าสู่ระบบสำเร็จ (Local Password Login Success)',
          accessToken,
          token: accessToken,
          user: tenantUser,
          tenant,
          data: { accessToken, token: accessToken, user: tenantUser, tenant }
        }
      };
    }

    // 2. ค้นหาในตาราง User (สำหรับ Admin/Staff)
    const user = await prisma.user.findFirst({
      where: { OR: [{ phone: { in: possiblePhones } }, { email: rawPhone.trim().toLowerCase() }] }
    });

    if (user && user.passwordHash) {
      let isMatch = false;
      if (user.passwordHash.includes(':')) {
        const [salt, key] = user.passwordHash.split(':');
        const crypto = require('crypto');
        const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
        isMatch = (hash === key);
      } else {
        isMatch = await bcrypt.compare(password, user.passwordHash);
      }

      if (isMatch) {
        const accessToken = authService.generateAccessToken(user);
        const refreshToken = authService.generateRefreshToken(user);
        await authService.saveRefreshToken(user.id, refreshToken);

        return {
          statusCode: 200,
          refreshToken,
          body: {
            success: true,
            message: 'เข้าสู่ระบบสำเร็จ (Admin / Staff Login Success)',
            accessToken,
            token: accessToken,
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
          }
        };
      }
    }

    return { statusCode: 401, body: { success: false, message: 'เบอร์โทรศัพท์หรือรหัสผ่านไม่ถูกต้อง' } };
  }

  /**
   * ตั้งค่ารหัสผ่านใหม่หรือเปลี่ยนรหัสผ่านสำหรับลูกบ้าน
   */
  async setupPassword({ newPassword, oldPassword, tenantId, lineUserId, phone }) {
    if (!newPassword || newPassword.length < 6) {
      return { statusCode: 400, body: { success: false, message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร' } };
    }

    let tenant = null;
    if (tenantId) {
      tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    }
    if (!tenant && lineUserId) {
      tenant = await prisma.tenant.findFirst({ where: { lineUserId } });
    }
    if (!tenant && phone) {
      tenant = await prisma.tenant.findFirst({ where: { phone } });
    }

    if (!tenant) {
      return { statusCode: 404, body: { success: false, message: 'ไม่พบข้อมูลลูกบ้านสำหรับตั้งรหัสผ่าน' } };
    }

    // หากมีรหัสผ่านเดิมอยู่แล้ว และระบุ oldPassword มา ให้ตรวจก่อน
    if (tenant.passwordHash && oldPassword) {
      const isOldMatch = await bcrypt.compare(oldPassword, tenant.passwordHash);
      if (!isOldMatch) {
        return { statusCode: 400, body: { success: false, message: 'รหัสผ่านเดิมไม่ถูกต้อง' } };
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.tenant.update({ where: { id: tenant.id }, data: { passwordHash: hashedPassword } });

    return {
      statusCode: 200,
      body: { success: true, message: 'ตั้งค่ารหัสผ่านใหม่สำเร็จเรียบร้อยแล้ว สามารถใช้เบอร์โทรศัพท์และรหัสผ่านนี้ล็อกอินได้' }
    };
  }

  /**
   * เข้าสู่ระบบผ่าน Web Browser ปกติ (Dual-Mode Login สำหรับลูกบ้านที่ไม่ใช้ LINE)
   */
  async loginWeb({ phoneNumber, pin }) {
    if (!phoneNumber || !pin) {
      return { statusCode: 400, body: { success: false, message: 'กรุณาระบุหมายเลขโทรศัพท์และรหัส PIN 6 หลัก' } };
    }

    const phoneConditions = getPhoneVariants(phoneNumber).map((p) => ({ phone: p }));

    // ค้นหาในตาราง Tenant
    const tenant = await prisma.tenant.findFirst({
      where: { OR: phoneConditions },
      include: {
        rooms: { include: { building: { include: { setting: true } } } },
        leaseContracts: {
          where: { status: 'ACTIVE' },
          include: { room: { include: { building: { include: { setting: true } } } } }
        }
      }
    });

    let isValidPin = false;
    let userAccount = null;

    if (tenant) {
      const pinHash = tenant.pinHash || tenant.passwordHash;
      if (pinHash) {
        isValidPin = await bcrypt.compare(String(pin).trim(), pinHash);
      }
    } else {
      // Fallback: ค้นหาในตาราง User
      userAccount = await prisma.user.findFirst({ where: { OR: phoneConditions } });
      if (userAccount && userAccount.passwordHash) {
        isValidPin = await bcrypt.compare(String(pin).trim(), userAccount.passwordHash);
      }
    }

    if (!isValidPin) {
      return { statusCode: 401, body: { success: false, message: 'เบอร์โทรศัพท์หรือรหัส PIN ไม่ถูกต้อง' } };
    }

    // จัดเตรียม Payload และออก Dual JWT Tokens
    const activeRoom = tenant?.rooms?.[0] || tenant?.leaseContracts?.[0]?.room || null;
    const building = activeRoom?.building || null;

    const userPayload = tenant
      ? {
          id: tenant.id,
          role: 'tenant',
          name: `${tenant.firstName} ${tenant.lastName}`.trim(),
          phone: tenant.phone,
          email: `${tenant.phone}@tenant.dorm.com`,
          isTenant: true,
          isWebLogin: true,
          buildingId: building?.id || null
        }
      : {
          id: userAccount.id,
          role: userAccount.role || 'tenant',
          name: userAccount.name,
          phone: userAccount.phone,
          email: userAccount.email,
          isTenant: true,
          isWebLogin: true
        };

    const accessToken = authService.generateAccessToken(userPayload);
    const refreshToken = authService.generateRefreshToken(userPayload);
    await authService.saveRefreshToken(userPayload.id, refreshToken);

    return {
      statusCode: 200,
      refreshToken,
      body: {
        success: true,
        message: 'เข้าสู่ระบบสำเร็จ',
        data: { accessToken, user: userPayload, tenant: tenant || null, rooms: tenant?.rooms || [], building: building || null }
      }
    };
  }

  /**
   * Silent Re-Authentication สำหรับต่ออายุเซสชัน LIFF อัตโนมัติเบื้องหลัง
   */
  async silentLogin({ lineIdToken, authHeader, lineDisplayName, linePictureUrl, lineUserIdFromRequest, devLineUserId, isDevOrMock, accessExpiresIn }) {
    let lineUserId = lineUserIdFromRequest;

    // 1. ถ้าส่ง LINE ID Token มา ให้ Verify ลายเซ็นกับ LINE API
    if (lineIdToken) {
      try {
        const verified = await verifyLineIdToken(lineIdToken);
        lineUserId = verified.sub;
      } catch {
        return { statusCode: 401, body: { success: false, code: 'LINE_TOKEN_INVALID', message: 'LINE ID Token ไม่ถูกต้องหรือหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่' } };
      }
    }

    // 2. ถ้ามี Bearer Token เดิมที่ส่งมา (กรณี fallback)
    if (!lineUserId && authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = authService.verifyAccessToken(authHeader.split(' ')[1]);
        if (decoded && (decoded.lineUserId || decoded.id)) {
          lineUserId = decoded.lineUserId;
        }
      } catch {
        // Token expired
      }
    }

    // Dev Mode Fallback
    if (!lineUserId && isDevOrMock) {
      lineUserId = devLineUserId || 'dev_line_user';
    }

    if (!lineUserId) {
      return { statusCode: 401, body: { success: false, code: 'UNAUTHORIZED', message: 'ไม่พบ LINE ID Token สำหรับยืนยันตัวตน' } };
    }

    // 3. ค้นหาผู้เช่าในระบบ
    const tenant = await prisma.tenant.findFirst({ where: { lineUserId }, include: TENANT_ROOM_INCLUDE });

    if (!tenant) {
      return { statusCode: 404, body: { success: false, isRegistered: false, code: 'TENANT_NOT_FOUND', message: 'ไม่พบข้อมูลลูกบ้านที่ผูกกับบัญชี LINE นี้' } };
    }

    // Sync Profile information if provided
    if (lineDisplayName || linePictureUrl) {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { ...(lineDisplayName && { lineDisplayName }), ...(linePictureUrl && { linePictureUrl }) }
      }).catch((err) => console.warn('Silent Login profile sync warning:', err.message));
    }

    // 4. ออก Backend JWT Access Token ใหม่สำหรับเซสชันลูกบ้าน (Silent Re-Auth ไม่ต้องหมุน Refresh Token)
    const accessToken = authService.generateAccessToken({
      id: tenant.id,
      tenantId: tenant.id,
      email: tenant.email || `tenant_${tenant.id}@dorm.local`,
      name: tenant.name,
      displayName: tenant.lineDisplayName || tenant.name,
      role: 'tenant',
      lineUserId: tenant.lineUserId,
      roomId: tenant.rooms?.[0]?.id,
      buildingId: tenant.rooms?.[0]?.buildingId
    });

    return {
      statusCode: 200,
      body: {
        success: true,
        message: 'ต่ออายุเซสชัน LIFF อัตโนมัติสำเร็จ (Silent Re-Auth Success)',
        accessToken,
        token: accessToken,
        data: { tenant, accessToken, expiresIn: accessExpiresIn }
      }
    };
  }
}

module.exports = new TenantAuthService();
module.exports.buildTenantUserPayload = buildTenantUserPayload;
