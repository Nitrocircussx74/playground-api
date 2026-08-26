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
