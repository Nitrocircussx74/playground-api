/**
 * แปลง Date เป็นรูปแบบรอบบิล "MM-YYYY" ที่ใช้เป็น billingCycle ทั่วทั้งระบบ
 * @param {Date} date
 * @returns {string} เช่น "09-2026"
 */
function formatBillingCycle(date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
}

module.exports = { formatBillingCycle };
