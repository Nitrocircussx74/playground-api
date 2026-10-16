const cron = require('node-cron');
const prisma = require('../config/prisma');
const lineService = require('../services/lineService');

let cronTask = null;

/**
 * ส่งแจ้งเตือนสัญญาเช่าใกล้หมดอายุ
 * รัน 3 รอบต่อวัน: แจ้งเมื่อเหลือ 30, 7, 1 วัน
 */
async function runLeaseExpiryWorker() {
  console.log(`[Cron: LeaseExpiry] Starting at ${new Date().toISOString()}...`);
  const now = new Date();
  let totalSent = 0;

  for (const days of [30, 7, 1]) {
    const target = new Date(now);
    target.setDate(target.getDate() + days);
    const dayStart = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 0, 0, 0);
    const dayEnd = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59, 59);

    const leases = await prisma.leaseContract.findMany({
      where: { status: 'ACTIVE', expectedEndDate: { gte: dayStart, lte: dayEnd } },
      include: { tenant: true, room: { include: { building: true } } }
    });

    for (const lease of leases) {
      if (lease.tenant?.lineUserId) {
        await lineService.pushLeaseExpiryNotification(lease.tenant.lineUserId, lease, days).catch(() => {});
        totalSent++;
      }
    }
  }

  console.log(`[Cron: LeaseExpiry] Done. Sent ${totalSent} notifications.`);
  return { totalSent };
}

function initLeaseExpiryCron() {
  if (cronTask) return cronTask;
  // รัน 09:00 ทุกวัน (Asia/Bangkok)
  cronTask = cron.schedule('0 9 * * *', async () => { await runLeaseExpiryWorker(); }, {
    scheduled: true,
    timezone: 'Asia/Bangkok'
  });
  console.log('⏰ [Cron: LeaseExpiry] Scheduled daily 09:00 Asia/Bangkok');
  return cronTask;
}

function stopLeaseExpiryCron() {
  if (cronTask) { cronTask.stop(); cronTask = null; }
}

module.exports = { initLeaseExpiryCron, stopLeaseExpiryCron, runLeaseExpiryWorker };
