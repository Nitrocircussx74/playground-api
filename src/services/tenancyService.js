/**
 * ปิดการเข้าพักของห้องหนึ่ง (เรียกใน Transaction หลังตั้ง lease = ENDED และ room.tenantId = null แล้ว)
 * - ผู้อยู่ร่วมทุกคนของห้อง (RoomResident ACTIVE) เปลี่ยนเป็น MOVED_OUT ไม่งั้นรูมเมทยังเห็นข้อมูลห้อง/บิลของผู้เช่าคนใหม่
 * - ผู้เช่าแต่ละคนที่หมดสิทธิ์ในห้องนี้: ถ้าไม่เหลือห้อง/สัญญา/ที่พักในตึกนี้ ให้ลบการผูก LINE ของตึกนี้ (UserLineAccount)
 *   และถ้าไม่เหลือที่ไหนเลย ให้ล้าง LINE/Invite บนตัวผู้เช่าและเพิกถอน Refresh Token ของเว็บด้วย
 *   (ผู้เช่าหลายห้อง/หลายตึกที่ยังมีที่อื่นอยู่ต้องไม่ถูกตัดสิทธิ์ทั้งบัญชี)
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {{ id: string, buildingId: string|null }} room
 * @param {string[]} tenantIds ผู้เช่าที่ผูกกับห้องนี้อยู่แล้ว (ผู้เช่าหลัก/คู่สัญญา) ผู้อยู่ร่วมดึงจาก DB เอง
 */
async function releaseRoomTenancy(tx, room, tenantIds) {
  const active = { roomId: room.id, status: 'ACTIVE' };
  const residents = await tx.roomResident.findMany({ where: active, select: { tenantId: true } });
  await tx.roomResident.updateMany({ where: active, data: { status: 'MOVED_OUT', leftAt: new Date() } });

  const affected = new Set([...tenantIds, ...residents.map((r) => r.tenantId)].filter(Boolean));
  for (const tenantId of affected) {
    const otherRoom = { not: room.id };
    const [rooms, stays, leases] = await Promise.all([
      tx.room.findMany({ where: { tenantId, id: otherRoom }, select: { buildingId: true } }),
      tx.roomResident.findMany({ where: { tenantId, status: 'ACTIVE', roomId: otherRoom }, select: { room: { select: { buildingId: true } } } }),
      tx.leaseContract.findMany({ where: { tenantId, status: 'ACTIVE', roomId: otherRoom }, select: { room: { select: { buildingId: true } } } })
    ]);
    const remaining = [...rooms, ...stays.map((s) => s.room), ...leases.map((l) => l.room)].filter(Boolean).map((r) => r.buildingId);

    if (!remaining.includes(room.buildingId)) {
      await tx.userLineAccount.deleteMany({ where: { tenantId, buildingId: room.buildingId } });
    }
    if (remaining.length === 0) {
      await tx.tenant.update({
        where: { id: tenantId },
        data: { lineUserId: null, lineDisplayName: null, linePictureUrl: null, lineStatusMessage: null, inviteCode: null, inviteExpiresAt: null }
      });
      await tx.refreshToken.deleteMany({ where: { userId: tenantId } });
    }
  }
}

module.exports = { releaseRoomTenancy };
