const line = require('@line/bot-sdk');
const generatePayload = require('promptpay-qr');
const QRCode = require('qrcode');

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || 'mock_token';
const client = new line.messagingApi.MessagingApiClient({ channelAccessToken });

class LineService {
  /**
   * สร้าง LINE Flex Message สรุปบิลค่าเช่าหอพัก
   */
  createInvoiceFlexMessage(invoice) {
    const liffId = process.env.LINE_LIFF_ID || '2000000000-mockliffid';
    const payUrl = `https://liff.line.me/${liffId}/pay/${invoice.id}`;
    const dueDateStr = new Date(invoice.dueDate).toLocaleDateString('th-TH');

    return {
      type: 'flex',
      altText: `ใบแจ้งหนี้ประจำเดือน ${invoice.billingCycle} ห้อง ${invoice.room?.roomNumber || ''}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🏢 ใบแจ้งหนี้ประจำเดือน',
              weight: 'bold',
              size: 'lg',
              color: '#ffffff'
            },
            {
              type: 'text',
              text: `รอบบิล: ${invoice.billingCycle} | ห้อง ${invoice.room?.roomNumber}`,
              size: 'xs',
              color: '#e0e7ff',
              margin: 'xs'
            }
          ],
          backgroundColor: '#4f46e5',
          paddingAll: '15px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'ค่าเช่าห้องพัก', size: 'sm', color: '#64748b' },
                { type: 'text', text: `฿${Number(invoice.roomPrice).toLocaleString()}`, size: 'sm', color: '#0f172a', align: 'end' }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              contents: [
                { type: 'text', text: 'ค่าน้ำประปา', size: 'sm', color: '#64748b' },
                { type: 'text', text: `฿${Number(invoice.waterTotal).toLocaleString()}`, size: 'sm', color: '#0f172a', align: 'end' }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              contents: [
                { type: 'text', text: 'ค่าไฟฟ้า', size: 'sm', color: '#64748b' },
                { type: 'text', text: `฿${Number(invoice.electricTotal).toLocaleString()}`, size: 'sm', color: '#0f172a', align: 'end' }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              contents: [
                { type: 'text', text: 'ค่าส่วนกลาง', size: 'sm', color: '#64748b' },
                { type: 'text', text: `฿${Number(invoice.commonFee).toLocaleString()}`, size: 'sm', color: '#0f172a', align: 'end' }
              ]
            },
            { type: 'separator', margin: 'lg' },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'lg',
              contents: [
                { type: 'text', text: 'ยอดรวมสุทธิ', weight: 'bold', size: 'md', color: '#0f172a' },
                { type: 'text', text: `฿${Number(invoice.grandTotal).toLocaleString()}`, weight: 'bold', size: 'lg', color: '#16a34a', align: 'end' }
              ]
            },
            {
              type: 'text',
              text: `กำหนดชำระภายในวันที่: ${dueDateStr}`,
              size: 'xs',
              color: '#ef4444',
              margin: 'md',
              align: 'center'
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              action: {
                type: 'uri',
                label: '💳 ชำระเงิน (Pay Now)',
                uri: payUrl
              },
              style: 'primary',
              color: '#4f46e5'
            }
          ]
        }
      }
    };
  }

  /**
   * สร้าง Flex Message แจ้งอัปเดตสถานะรายการแจ้งซ่อม
   */
  createMaintenanceFlexMessage(request) {
    const liffId = process.env.LINE_LIFF_ID || '2000000000-mockliffid';
    const trackingUrl = `https://liff.line.me/${liffId}/maintenance`;

    const statusTextMap = {
      pending: '⏳ รอดำเนินการ (Pending)',
      in_progress: '🔧 กำลังดำเนินการซ่อม (In Progress)',
      resolved: '✅ ซ่อมแซมเสร็จสิ้น (Resolved)',
      completed: '✅ ซ่อมแซมเสร็จสิ้น (Completed)'
    };
    const statusColorMap = {
      pending: '#f59e0b',
      in_progress: '#2563eb',
      resolved: '#16a34a',
      completed: '#16a34a'
    };

    const statusLabel = statusTextMap[request.status] || request.status;
    const headerBg = statusColorMap[request.status] || '#2563eb';

    return {
      type: 'flex',
      altText: `🔧 อัปเดตสถานะแจ้งซ่อม: ${request.title}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🔧 อัปเดตสถานะการแจ้งซ่อม',
              weight: 'bold',
              size: 'lg',
              color: '#ffffff'
            },
            {
              type: 'text',
              text: `ห้อง ${request.room?.roomNumber || ''}`,
              size: 'xs',
              color: '#ffffff',
              margin: 'xs'
            }
          ],
          backgroundColor: headerBg,
          paddingAll: '15px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: request.title,
              weight: 'bold',
              size: 'md',
              color: '#0f172a'
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              contents: [
                { type: 'text', text: 'สถานะปัจจุบัน', size: 'xs', color: '#64748b' },
                { type: 'text', text: statusLabel, size: 'xs', weight: 'bold', color: headerBg, align: 'end' }
              ]
            },
            ...(request.adminNote ? [
              { type: 'separator', margin: 'md' },
              {
                type: 'text',
                text: `💬 หมายเหตุจากช่าง/แอดมิน: ${request.adminNote}`,
                size: 'xs',
                color: '#334155',
                margin: 'md',
                wrap: true
              }
            ] : [])
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              action: {
                type: 'uri',
                label: '📜 ติดตามสถานะใน LIFF',
                uri: trackingUrl
              },
              style: 'primary',
              color: headerBg
            }
          ]
        }
      }
    };
  }

  /**
   * ส่ง LINE Push Notification แจ้งอัปเดตสถานะการแจ้งซ่อม
   */
  async sendMaintenanceStatusNotification(lineUserId, request) {
    if (!lineUserId) return false;

    try {
      const flexMsg = this.createMaintenanceFlexMessage(request);
      await client.pushMessage({
        to: lineUserId,
        messages: [flexMsg]
      });
      console.log(`✅ ส่ง LINE Push Message แจ้งเตือนสถานะซ่อมหา ${lineUserId} สำเร็จ`);
      return true;
    } catch (err) {
      console.warn(`⚠️ ไม่สามารถส่ง LINE Maintenance Notification ได้: ${err.message}`);
      return false;
    }
  }

  /**
   * สร้าง Flex Message สำหรับเตือนทวงหนี้แบบสุภาพ
   */
  createDebtReminderFlexMessage(invoice) {
    const liffId = process.env.LINE_LIFF_ID || '2000000000-mockliffid';
    const payUrl = `https://liff.line.me/${liffId}/pay/${invoice.id}`;
    const dueDateStr = new Date(invoice.dueDate).toLocaleDateString('th-TH');

    return {
      type: 'flex',
      altText: `⚠️ แจ้งเตือนยอดค้างชำระค่าเช่าห้อง ${invoice.room?.roomNumber || ''}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '⚠️ แจ้งเตือนยอดค้างชำระ',
              weight: 'bold',
              size: 'lg',
              color: '#ffffff'
            },
            {
              type: 'text',
              text: `ห้อง ${invoice.room?.roomNumber} | รอบบิล ${invoice.billingCycle}`,
              size: 'xs',
              color: '#fecdd3',
              margin: 'xs'
            }
          ],
          backgroundColor: '#be123c',
          paddingAll: '15px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `เรียนคุณ ${invoice.tenant?.firstName || ''} ${invoice.tenant?.lastName || ''}`,
              size: 'sm',
              color: '#475569'
            },
            {
              type: 'text',
              text: `ขอเรียนแจ้งเตือนยอดค้างชำระบิลค่าเช่าเลขที่ ${invoice.invoiceNumber} ซึ่งเกินกำหนดชำระตั้งแต่วันที่ ${dueDateStr} ครับ`,
              size: 'sm',
              color: '#0f172a',
              margin: 'md',
              wrap: true
            },
            { type: 'separator', margin: 'lg' },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'lg',
              contents: [
                { type: 'text', text: 'ยอดค้างชำระรวม', weight: 'bold', size: 'sm', color: '#64748b' },
                { type: 'text', text: `฿${Number(invoice.grandTotal).toLocaleString()}`, weight: 'bold', size: 'lg', color: '#dc2626', align: 'end' }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              action: {
                type: 'uri',
                label: '💳 ชำระเงินผ่าน LIFF',
                uri: payUrl
              },
              style: 'primary',
              color: '#dc2626'
            }
          ]
        }
      }
    };
  }

  /**
   * ส่ง Flex Message แจ้งเตือนทวงหนี้ไปยังลูกบ้านที่ค้างชำระ
   */
  async sendDebtReminderNotification(invoice) {
    if (!invoice.tenant?.lineUserId) return false;

    try {
      const flexMessage = this.createDebtReminderFlexMessage(invoice);
      await client.pushMessage({
        to: invoice.tenant.lineUserId,
        messages: [flexMessage]
      });
      console.log(`✅ ส่ง LINE Push Message เตือนทวงหนี้หา ${invoice.tenant.lineUserId} สำเร็จ`);
      return true;
    } catch (error) {
      console.warn(`⚠️ ไม่สามารถส่ง LINE Debt Reminder ได้: ${error.message}`);
      return false;
    }
  }

  /**
   * สร้าง Flex Message สวยงามสำหรับการประกาศข่าวสาร
   */
  createAnnouncementFlexMessage(announcement) {
    const liffId = process.env.LINE_LIFF_ID || '2000000000-mockliffid';
    const announcementsUrl = `https://liff.line.me/${liffId}/announcements`;
    const createdDateStr = new Date(announcement.createdAt || Date.now()).toLocaleDateString('th-TH');

    return {
      type: 'flex',
      altText: `📢 ประกาศข่าวสาร: ${announcement.title}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '📢 ประกาศจากหอพัก',
              weight: 'bold',
              size: 'lg',
              color: '#ffffff'
            },
            {
              type: 'text',
              text: `วันที่ประกาศ: ${createdDateStr}`,
              size: 'xs',
              color: '#fef08a',
              margin: 'xs'
            }
          ],
          backgroundColor: '#e11d48',
          paddingAll: '15px'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: announcement.title,
              weight: 'bold',
              size: 'md',
              color: '#0f172a',
              wrap: true
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'text',
              text: announcement.content,
              size: 'sm',
              color: '#334155',
              margin: 'md',
              wrap: true
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              action: {
                type: 'uri',
                label: '📜 ดูประกาศย้อนหลังทั้งหมด',
                uri: announcementsUrl
              },
              style: 'secondary'
            }
          ]
        }
      }
    };
  }

  /**
   * ส่ง Broadcast / Multicast / Push Notification ประกาศข่าวสารไปยังรายชื่อผู้รับ
   */
  async sendAnnouncementBroadcast(userIds, announcement) {
    if (!userIds || userIds.length === 0) {
      console.warn('⚠️ ไม่มีผู้รับที่มี lineUserId สำหรับส่งประกาศ');
      return 0;
    }

    try {
      const flexMessage = this.createAnnouncementFlexMessage(announcement);

      if (userIds.length > 1) {
        const batchSize = 500;
        for (let i = 0; i < userIds.length; i += batchSize) {
          const batch = userIds.slice(i, i + batchSize);
          await client.multicast({
            to: batch,
            messages: [flexMessage]
          });
        }
        console.log(`✅ ส่ง LINE Multicast ประกาศข่าวสารหา ${userIds.length} คนสำเร็จ`);
      } else {
        await client.pushMessage({
          to: userIds[0],
          messages: [flexMessage]
        });
        console.log(`✅ ส่ง LINE Push Message ประกาศข่าวสารหา ${userIds[0]} สำเร็จ`);
      }
      return userIds.length;
    } catch (error) {
      console.warn(`⚠️ ไม่สามารถส่ง LINE Announcement Broadcast ได้: ${error.message}`);
      return userIds.length;
    }
  }

  /**
   * ส่ง Push Message Flex Message แจ้งบิลไปหา LINE User ID ของลูกบ้าน
   */
  async pushInvoiceNotification(lineUserId, invoice) {
    if (!lineUserId) {
      console.warn('⚠️ ลูกบ้านไม่มี lineUserId ข้ามการส่ง LINE Push Message');
      return false;
    }

    try {
      const flexMessage = this.createInvoiceFlexMessage(invoice);
      await client.pushMessage({
        to: lineUserId,
        messages: [flexMessage]
      });
      console.log(`✅ ส่ง LINE Push Message แจ้งบิลหา ${lineUserId} สำเร็จ`);
      return true;
    } catch (error) {
      console.warn(`⚠️ ไม่สามารถส่ง LINE Push Message ได้ (Local/Mock Mode): ${error.message}`);
      return false;
    }
  }

  /**
   * ส่ง Push Message แจ้งเตือนเมื่อรับสลิปเรียบร้อยแล้ว
   */
  async pushSlipReceivedNotification(lineUserId, invoiceNumber) {
    if (!lineUserId) return false;

    try {
      await client.pushMessage({
        to: lineUserId,
        messages: [
          {
            type: 'text',
            text: `✅ ได้รับสลิปการชำระเงินสำหรับบิลเลขที่ ${invoiceNumber} เรียบร้อยแล้ว ขณะนี้แอดมินกำลังตรวจสอบความถูกต้องครับ`
          }
        ]
      });
      return true;
    } catch (error) {
      console.warn(`⚠️ ไม่สามารถส่ง LINE Push Message ตอบรับสลิปได้: ${error.message}`);
      return false;
    }
  }

  /**
   * สร้าง PromptPay Payload และ Data URL สำหรับ QR Code
   */
  async generatePromptPayQr(amount) {
    const targetPromptPay = process.env.PROMPTPAY_NUMBER || '0812345678';
    const numAmount = Number(amount) || 0;

    const payload = generatePayload(targetPromptPay, { amount: numAmount });
    const qrDataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 300 });

    return {
      promptpayNumber: targetPromptPay,
      amount: numAmount,
      payload,
      qrDataUrl
    };
  }
}

module.exports = new LineService();
