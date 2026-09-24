const prisma = require('../config/prisma');

const FULL_ACCESS_ROLES = ['super_admin', 'superadmin', 'owner'];
// room_owner/investor ถูกจำกัดด้วย ownerId ใน Controller อยู่แล้ว ไม่ได้อิงสิทธิ์รายตึก
const OWNER_SCOPED_ROLES = ['room_owner', 'investor'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const roleOf = (user) => (user?.role || '').toLowerCase();

/**
 * รายการตึกที่ผู้ใช้เข้าถึงได้: null = เข้าถึงได้ทุกตึก (owner/super_admin), Array = เฉพาะตึกที่ได้รับสิทธิ์
 * (ตารางเดียวกับที่ getBuildings/getRooms ใช้อยู่แล้ว)
 */
async function getAllowedBuildingIds(user) {
  if (FULL_ACCESS_ROLES.includes(roleOf(user))) return null;
  if (!user?.id) return [];
  const perms = await prisma.userBuildingPermission.findMany({ where: { userId: user.id }, select: { buildingId: true } });
  return perms.map((p) => p.buildingId);
}

async function canAccessBuilding(user, buildingId) {
  const allowed = await getAllowedBuildingIds(user);
  return allowed === null || allowed.includes(buildingId);
}

/**
 * สำหรับ List ที่ระบุตึกหรือไม่ก็ได้ (?buildingId=) → { forbidden: true } หรือ { ids }
 * ids = รายการตึกที่ต้องกรอง (ระบุมา = ตึกนั้น, ไม่ระบุ = ตึกที่มีสิทธิ์ทั้งหมด, null = ไม่ต้องกรอง)
 */
async function resolveListBuildings(user, requestedBuildingId) {
  const allowed = await getAllowedBuildingIds(user);
  if (requestedBuildingId) {
    return allowed && !allowed.includes(requestedBuildingId) ? { forbidden: true } : { ids: [requestedBuildingId] };
  }
  return { ids: allowed };
}

const deny = (res) =>
  res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลของอาคาร/ตึกนี้' });

/** ใช้กับ router.param('buildingId' | 'id', buildingParam) เมื่อพารามิเตอร์นั้นคือ ID ของตึกโดยตรง */
const buildingParam = async (req, res, next, buildingId) => {
  try {
    return (await canAccessBuilding(req.user, buildingId)) ? next() : deny(res);
  } catch (error) {
    return next(error);
  }
};

/**
 * Resolver: id ของเอนทิตี → ตึกที่เอนทิตีนั้นสังกัด
 * คืน undefined = ไม่พบเอนทิตี (ปล่อยให้ Controller ตอบ 404), null = ไม่ผูกตึก (Global → เฉพาะ owner/super_admin),
 * string = ตึกเดียว, string[] = หลายตึก (เข้าถึงได้ถ้ามีสิทธิ์อย่างน้อยหนึ่งตึก; ว่าง = เฉพาะ owner/super_admin)
 */
const buildingOf = (model, { direct = true, viaRoom = false } = {}) => async (id) => {
  const row = await prisma[model].findUnique({
    where: { id },
    select: { ...(direct && { buildingId: true }), ...(viaRoom && { room: { select: { buildingId: true } } }) }
  });
  return row ? (row.buildingId ?? row.room?.buildingId ?? null) : undefined;
};

const resolvers = {
  room: buildingOf('room'),
  invoice: buildingOf('invoice', { direct: false, viaRoom: true }),
  roomInvite: buildingOf('roomInvite', { direct: false, viaRoom: true }),
  parcel: buildingOf('parcel'),
  vendor: buildingOf('vendor'),
  inspection: buildingOf('roomInspection'),
  poll: buildingOf('poll'),
  vehicle: buildingOf('vehicle'),
  facility: buildingOf('facility'),
  facilityBooking: buildingOf('facilityBooking'),
  issue: buildingOf('issueTicket'),
  announcement: buildingOf('announcement'),
  lease: buildingOf('leaseContract', { viaRoom: true }),
  maintenance: buildingOf('maintenanceRequest', { viaRoom: true }),
  // ผู้เช่าไม่ผูกตึกตรงๆ: นับจากห้องที่ถือครอง/สัญญาเช่า/ผู้อยู่ร่วม (เกณฑ์เดียวกับรายชื่อผู้เช่าใน tenantService)
  tenant: async (id) => {
    const t = await prisma.tenant.findUnique({
      where: { id },
      select: {
        rooms: { select: { buildingId: true } },
        leaseContracts: { select: { buildingId: true, room: { select: { buildingId: true } } } },
        roomResidents: { select: { room: { select: { buildingId: true } } } }
      }
    });
    if (!t) return undefined;
    const ids = [
      ...t.rooms.map((r) => r.buildingId),
      ...t.leaseContracts.map((l) => l.buildingId ?? l.room?.buildingId),
      ...t.roomResidents.map((r) => r.room?.buildingId)
    ];
    return [...new Set(ids.filter(Boolean))];
  }
};

async function isAllowedFor(user, target) {
  const allowed = await getAllowedBuildingIds(user);
  if (allowed === null) return true;
  if (target === null) return false;
  return (Array.isArray(target) ? target : [target]).some((id) => allowed.includes(id));
}

const checkEntity = (resolve) => async (req, res, next, id) => {
  try {
    if (!UUID_RE.test(id) || OWNER_SCOPED_ROLES.includes(roleOf(req.user))) return next();
    const target = await resolve(id);
    if (target === undefined) return next();
    return (await isAllowedFor(req.user, target)) ? next() : deny(res);
  } catch (error) {
    return next(error);
  }
};

/** router.param('id' | 'roomId' | ..., entityParam(resolvers.x)) — ใช้เมื่อชื่อพารามิเตอร์นั้นเป็นเอนทิตีเดียวทั้ง Router */
const entityParam = checkEntity;

/** ใช้เป็น middleware ของ route เดียว เมื่อ Router เดียวกันมี :id หลายความหมาย (เช่น facilities/:id กับ facility-bookings/:id) */
const entityGuard = (resolve, param = 'id') => (req, res, next) => checkEntity(resolve)(req, res, next, req.params[param]);

/** ตรวจตึกที่มากับ body/query (buildingId) หรือที่อ้างผ่าน roomId/leaseId ใน body เช่น POST /rooms, POST /invoices, POST /inspections */
const requireBuildingInRequest = async (req, res, next) => {
  try {
    if (OWNER_SCOPED_ROLES.includes(roleOf(req.user))) return next();
    const targets = [req.body?.buildingId || req.query?.buildingId];
    if (req.body?.roomId && UUID_RE.test(req.body.roomId)) targets.push(await resolvers.room(req.body.roomId));
    if (req.body?.leaseId && UUID_RE.test(req.body.leaseId)) targets.push(await resolvers.lease(req.body.leaseId));
    for (const target of targets.filter((t) => t !== undefined && t !== '')) {
      if (!(await isAllowedFor(req.user, target))) return deny(res);
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAllowedBuildingIds,
  canAccessBuilding,
  resolveListBuildings,
  buildingParam,
  entityParam,
  entityGuard,
  resolvers,
  requireBuildingInRequest,
  // ชื่อเดิมที่ route เฟสก่อนใช้อยู่
  roomParam: entityParam(resolvers.room),
  invoiceParam: entityParam(resolvers.invoice)
};
