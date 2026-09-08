const cron = require('node-cron');
const lateFeeService = require('../services/lateFeeService');

let cronTask = null;

/**
 * ฟังก์ชันประมวลผลค่าปรับ (Worker Execution)
 */
async function runLateFeeWorker() {
  console.log(`[Cron: LateFeeWorker] 🚀 Starting automated late fee calculation at ${new Date().toISOString()} (Asia/Bangkok)...`);
  try {
    const result = await lateFeeService.processLateFees();
    console.log(
      `[Cron: LateFeeWorker] ✅ Completed! Processed: ${result.totalProcessed} invoices, Updated: ${result.totalUpdated} invoices, Total Late Fees: ฿${result.totalLateFeeAmount.toLocaleString()}`
    );
    return result;
  } catch (err) {
    console.error('[Cron: LateFeeWorker] ❌ Error calculating late fees:', err);
    throw err;
  }
}

/**
 * เริ่มต้นการทำงานของ Cron Job (รันทุกวันเวลาเที่ยงคืน 00:00 Asia/Bangkok)
 */
function initLateFeeCron() {
  if (cronTask) {
    console.log('[Cron: LateFeeWorker] Cron job is already scheduled.');
    return cronTask;
  }

  // Expression: 0 0 * * * (At 00:00 every day)
  cronTask = cron.schedule(
    '0 0 * * *',
    async () => {
      await runLateFeeWorker();
    },
    {
      scheduled: true,
      timezone: 'Asia/Bangkok'
    }
  );

  console.log('⏰ [Cron: LateFeeWorker] Scheduled daily midnight job (0 0 * * *) in timezone Asia/Bangkok');
  return cronTask;
}

/**
 * หยุดการทำงานของ Cron Job
 */
function stopLateFeeCron() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    console.log('🛑 [Cron: LateFeeWorker] Cron job stopped.');
  }
}

module.exports = {
  initLateFeeCron,
  stopLateFeeCron,
  runLateFeeWorker
};
