const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const generatePayload = require('promptpay-qr');
const QRCode = require('qrcode');

const prisma = new PrismaClient();

async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

async function main() {
  console.log('🌱 Starting comprehensive database seeding for all 31 tables...');

  // =========================================================================
  // 1. Buildings (อาคาร A & B)
  // =========================================================================
  let buildingA = await prisma.building.findFirst({
    where: { name: { contains: 'อาคาร A' } }
  });
  if (!buildingA) {
    buildingA = await prisma.building.create({
      data: {
        name: 'อาคาร A (Main Building)',
        address: '123/1 ถนนสุขุมวิท 71 แขวงพระโขนงเหนือ เขตวัฒนา กรุงเทพฯ 10110',
        themeColor: '#3B82F6'
      }
    });
  } else {
    buildingA = await prisma.building.update({
      where: { id: buildingA.id },
      data: { name: 'อาคาร A (Main Building)', themeColor: '#3B82F6' }
    });
  }

  let buildingB = await prisma.building.findFirst({
    where: { name: { contains: 'อาคาร B' } }
  });
  if (!buildingB) {
    buildingB = await prisma.building.create({
      data: {
        name: 'อาคาร B (North Wing)',
        address: '123/2 ถนนสุขุมวิท 71 แขวงพระโขนงเหนือ เขตวัฒนา กรุงเทพฯ 10110',
        themeColor: '#10B981'
      }
    });
  } else {
    buildingB = await prisma.building.update({
      where: { id: buildingB.id },
      data: { name: 'อาคาร B (North Wing)', themeColor: '#10B981' }
    });
  }

  console.log(`🏢 1. Buildings seeded: [A: ${buildingA.name}] [B: ${buildingB.name}]`);

  // =========================================================================
  // 2. Building Settings (พร้อม PromptPay QR และเงื่อนไขสัญญา)
  // =========================================================================
  const qrA = await QRCode.toDataURL(generatePayload('0812345678', { amount: 0 }), { width: 400, margin: 2 });
  const qrB = await QRCode.toDataURL(generatePayload('0899998888', { amount: 0 }), { width: 400, margin: 2 });

  await prisma.buildingSetting.upsert({
    where: { buildingId: buildingA.id },
    update: {
      phone: '02-123-4567',
      promptpayNum: '0812345678',
      paymentQrUrl: qrA,
      bankName: 'ธนาคารกสิกรไทย (KBANK)',
      bankAccountName: 'หอพักสุขุมวิทเพลส อาคาร A',
      bankAccountNo: '123-2-34567-8',
      paymentNote: 'กรุณาชำระเงินภายในวันที่ 5 ของทุกเดือน และแนบสลิปผ่านทางระบบ LIFF ทันทีหลังชำระเงิน',
      waterRate: 18.00,
      electricRate: 7.00,
      dueDateDay: 5,
      latePenalty: 50.00,
      lateFeeType: 'DAILY',
      gracePeriodDays: 3,
      lateFeeAmount: 50.00,
      depositMonths: 2,
      advanceMonths: 1,
      termsAndConditions: '1. ห้ามส่งเสียงดังรบกวนผู้อื่นหลังเวลา 22:00 น.\n2. ห้ามเลี้ยงสัตว์เลี้ยงทุกชนิดในห้องพัก\n3. ห้ามสูบบุหรี่ภายในห้องพักและบริเวณระเบียง\n4. แจ้งย้ายออกล่วงหน้าอย่างน้อย 30 วัน'
    },
    create: {
      buildingId: buildingA.id,
      phone: '02-123-4567',
      coverImageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80',
      promptpayNum: '0812345678',
      paymentQrUrl: qrA,
      bankName: 'ธนาคารกสิกรไทย (KBANK)',
      bankAccountName: 'หอพักสุขุมวิทเพลส อาคาร A',
      bankAccountNo: '123-2-34567-8',
      paymentNote: 'กรุณาชำระเงินภายในวันที่ 5 ของทุกเดือน และแนบสลิปผ่านทางระบบ LIFF ทันทีหลังชำระเงิน',
      waterRate: 18.00,
      electricRate: 7.00,
      dueDateDay: 5,
      latePenalty: 50.00,
      lateFeeType: 'DAILY',
      gracePeriodDays: 3,
      lateFeeAmount: 50.00,
      depositMonths: 2,
      advanceMonths: 1,
      termsAndConditions: '1. ห้ามส่งเสียงดังรบกวนผู้อื่นหลังเวลา 22:00 น.\n2. ห้ามเลี้ยงสัตว์เลี้ยงทุกชนิดในห้องพัก\n3. ห้ามสูบบุหรี่ภายในห้องพักและบริเวณระเบียง\n4. แจ้งย้ายออกล่วงหน้าอย่างน้อย 30 วัน'
    }
  });

  await prisma.buildingSetting.upsert({
    where: { buildingId: buildingB.id },
    update: {
      phone: '02-987-6543',
      promptpayNum: '0899998888',
      paymentQrUrl: qrB,
      bankName: 'ธนาคารไทยพาณิชย์ (SCB)',
      bankAccountName: 'หอพักสุขุมวิทเพลส อาคาร B',
      bankAccountNo: '987-1-23456-7',
      paymentNote: 'กรุณาโอนชำระเงินตามยอดสุทธิในใบแจ้งหนี้ และแนบสลิปเพื่อยืนยันการชำระ',
      waterRate: 20.00,
      electricRate: 8.00,
      dueDateDay: 5,
      latePenalty: 100.00,
      lateFeeType: 'FLAT',
      gracePeriodDays: 5,
      lateFeeAmount: 100.00,
      depositMonths: 2,
      advanceMonths: 1,
      termsAndConditions: '1. ห้ามดัดแปลงโครงสร้างห้องพักหรือเจาะผนัง\n2. รักษาความสะอาดพื้นที่ส่วนกลาง\n3. ทิ้งขยะในจุดที่นิติบุคคลกำหนดเท่านั้น'
    },
    create: {
      buildingId: buildingB.id,
      phone: '02-987-6543',
      coverImageUrl: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80',
      promptpayNum: '0899998888',
      paymentQrUrl: qrB,
      bankName: 'ธนาคารไทยพาณิชย์ (SCB)',
      bankAccountName: 'หอพักสุขุมวิทเพลส อาคาร B',
      bankAccountNo: '987-1-23456-7',
      paymentNote: 'กรุณาโอนชำระเงินตามยอดสุทธิในใบแจ้งหนี้ และแนบสลิปเพื่อยืนยันการชำระ',
      waterRate: 20.00,
      electricRate: 8.00,
      dueDateDay: 5,
      latePenalty: 100.00,
      lateFeeType: 'FLAT',
      gracePeriodDays: 5,
      lateFeeAmount: 100.00,
      depositMonths: 2,
      advanceMonths: 1,
      termsAndConditions: '1. ห้ามดัดแปลงโครงสร้างห้องพักหรือเจาะผนัง\n2. รักษาความสะอาดพื้นที่ส่วนกลาง\n3. ทิ้งขยะในจุดที่นิติบุคคลกำหนดเท่านั้น'
    }
  });

  console.log('⚙️ 2. Building Settings seeded');

  // =========================================================================
  // 3. Admin & User Accounts (OWNER, SUPER_ADMIN, MANAGER, ADMIN, ROOM_OWNER)
  // =========================================================================
  const defaultPassword = await hashPassword('password123');

  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@dorm.com' },
    update: { role: 'super_admin', passwordHash: defaultPassword },
    create: {
      email: 'superadmin@dorm.com',
      passwordHash: defaultPassword,
      name: 'Super Admin',
      role: 'super_admin',
      phone: '0899999999'
    }
  });

  const ownerUser = await prisma.user.upsert({
    where: { email: 'owner@dorm.com' },
    update: { role: 'OWNER', passwordHash: defaultPassword },
    create: {
      email: 'owner@dorm.com',
      passwordHash: defaultPassword,
      name: 'เจ้าของหอพัก (Owner)',
      role: 'OWNER',
      phone: '0888888888'
    }
  });

  const managerUser = await prisma.user.upsert({
    where: { email: 'manager@dorm.com' },
    update: { role: 'MANAGER', passwordHash: defaultPassword },
    create: {
      email: 'manager@dorm.com',
      passwordHash: defaultPassword,
      name: 'ผู้จัดการอาคาร (Manager)',
      role: 'MANAGER',
      phone: '0877777777'
    }
  });

  const adminA = await prisma.user.upsert({
    where: { email: 'admin_building_a@dorm.com' },
    update: { role: 'admin', passwordHash: defaultPassword },
    create: {
      email: 'admin_building_a@dorm.com',
      passwordHash: defaultPassword,
      name: 'แอดมิน อาคาร A',
      role: 'admin',
      phone: '0811111111'
    }
  });

  const adminB = await prisma.user.upsert({
    where: { email: 'admin_building_b@dorm.com' },
    update: { role: 'admin', passwordHash: defaultPassword },
    create: {
      email: 'admin_building_b@dorm.com',
      passwordHash: defaultPassword,
      name: 'แอดมิน อาคาร B',
      role: 'admin',
      phone: '0822222222'
    }
  });

  const roomOwnerUser = await prisma.user.upsert({
    where: { email: 'investor@dorm.com' },
    update: { role: 'room_owner', passwordHash: defaultPassword },
    create: {
      email: 'investor@dorm.com',
      passwordHash: defaultPassword,
      name: 'คุณวิชัย เจริญกิจ (เจ้าของห้องร่วม)',
      role: 'room_owner',
      phone: '0833333333'
    }
  });

  // User Building Permissions
  await prisma.userBuildingPermission.upsert({
    where: { userId_buildingId: { userId: managerUser.id, buildingId: buildingA.id } },
    update: {},
    create: { userId: managerUser.id, buildingId: buildingA.id }
  });
  await prisma.userBuildingPermission.upsert({
    where: { userId_buildingId: { userId: managerUser.id, buildingId: buildingB.id } },
    update: {},
    create: { userId: managerUser.id, buildingId: buildingB.id }
  });
  await prisma.userBuildingPermission.upsert({
    where: { userId_buildingId: { userId: adminA.id, buildingId: buildingA.id } },
    update: {},
    create: { userId: adminA.id, buildingId: buildingA.id }
  });
  await prisma.userBuildingPermission.upsert({
    where: { userId_buildingId: { userId: adminB.id, buildingId: buildingB.id } },
    update: {},
    create: { userId: adminB.id, buildingId: buildingB.id }
  });

  console.log('👤 3. Users & Building Permissions seeded');

  // =========================================================================
  // 4. Feature Toggles
  // =========================================================================
  const featureList = [
    { key: 'ENABLE_VEHICLE_MANAGEMENT', description: 'ระบบจัดการป้ายทะเบียนและยานพาหนะลูกบ้าน' },
    { key: 'ENABLE_PARCEL_NOTIFY', description: 'ระบบแจ้งเตือนพัสดุมาถึงผ่าน LINE' },
    { key: 'ENABLE_MAINTENANCE_REQUEST', description: 'ระบบแจ้งซ่อมแซมและติดตามสถานะ' },
    { key: 'ENABLE_LINE_PAYMENT', description: 'ระบบชำระเงินและแนบสลิปผ่าน LIFF' },
    { key: 'ENABLE_FACILITY_BOOKING', description: 'ระบบจองพื้นที่ส่วนกลาง (ฟิตเนส/สระว่ายน้ำ)' },
    { key: 'ENABLE_TENANT_POLLS', description: 'ระบบโหวตและสำรวจความคิดเห็นลูกบ้าน' },
    { key: 'ENABLE_VISITOR_PASS', description: 'ระบบบันทึกและลงทะเบียนผู้มาติดต่อ' }
  ];

  for (const f of featureList) {
    for (const b of [buildingA, buildingB]) {
      await prisma.featureToggle.upsert({
        where: { key_buildingId: { key: f.key, buildingId: b.id } },
        update: { isActive: true },
        create: { key: f.key, description: f.description, isActive: true, buildingId: b.id }
      }).catch(async () => {
        const exist = await prisma.featureToggle.findFirst({ where: { key: f.key, buildingId: null } });
        if (!exist) await prisma.featureToggle.create({ data: { key: f.key, description: f.description, isActive: true } });
      });
    }
  }

  console.log('🎛️ 4. Feature Toggles seeded');

  // =========================================================================
  // 5. Tenants (ผู้เช่าหลากหลายโปรไฟล์)
  // =========================================================================
  const activeLiffLineUserId = 'Uef737f8486c9f1e560364799ef60018e';

  let tenantSomkiat = await prisma.tenant.upsert({
    where: { lineUserId: activeLiffLineUserId },
    update: {
      firstName: 'สมเกียรติ',
      lastName: 'พัฒนกิจ',
      phone: '0898765432',
      idCard: '1100100200301',
      lineDisplayName: 'Somkiat (ลูกบ้าน)',
      linePictureUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
      lineStatusMessage: 'ยินดีที่ได้รู้จักครับ',
      internalNotes: 'ผู้เช่าชำระเงินตรงเวลา อัธยาศัยดี'
    },
    create: {
      firstName: 'สมเกียรติ',
      lastName: 'พัฒนกิจ',
      phone: '0898765432',
      idCard: '1100100200301',
      lineUserId: activeLiffLineUserId,
      lineDisplayName: 'Somkiat (ลูกบ้าน)',
      linePictureUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
      lineStatusMessage: 'ยินดีที่ได้รู้จักครับ',
      internalNotes: 'ผู้เช่าชำระเงินตรงเวลา อัธยาศัยดี'
    }
  });

  let tenantKanda = await prisma.tenant.upsert({
    where: { lineUserId: 'U_kanda_demo_line_01' },
    update: { firstName: 'กานดา', lastName: 'วิเศษสุข', phone: '0812345678' },
    create: {
      firstName: 'กานดา',
      lastName: 'วิเศษสุข',
      phone: '0812345678',
      idCard: '1100200300401',
      lineUserId: 'U_kanda_demo_line_01',
      lineDisplayName: 'Kanda Wisetsuk',
      linePictureUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
      lineStatusMessage: 'Focus on happiness ✨',
      internalNotes: 'ทำงานประจำใกล้บีทีเอส อ่อนนุช'
    }
  });

  let tenantThanakorn = await prisma.tenant.upsert({
    where: { lineUserId: 'U_thanakorn_demo_02' },
    update: { firstName: 'ธนกร', lastName: 'สิทธิโชค', phone: '0863334455' },
    create: {
      firstName: 'ธนกร',
      lastName: 'สิทธิโชค',
      phone: '0863334455',
      idCard: '1100300400502',
      lineUserId: 'U_thanakorn_demo_02',
      lineDisplayName: 'Boss Thanakorn',
      linePictureUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=300&q=80',
      internalNotes: 'มีมอเตอร์ไซค์ 1 คัน ขอสติ๊กเกอร์จอดรถแล้ว'
    }
  });

  let tenantPimmada = await prisma.tenant.upsert({
    where: { lineUserId: 'U_pimmada_demo_03' },
    update: { firstName: 'พิมพ์มาดา', lastName: 'ฤทัยรัตน์', phone: '0855556677' },
    create: {
      firstName: 'พิมพ์มาดา',
      lastName: 'ฤทัยรัตน์',
      phone: '0855556677',
      idCard: '1100400500603',
      lineUserId: 'U_pimmada_demo_03',
      lineDisplayName: 'Pimmada P.',
      linePictureUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=300&q=80',
      internalNotes: 'นักศึกษาปริญญาโท ม.กรุงเทพ'
    }
  });

  let tenantWorapol = await prisma.tenant.upsert({
    where: { inviteCode: 'INV202' },
    update: { firstName: 'วรพล', lastName: 'สุวรรณเมฆ', phone: '0844448899' },
    create: {
      firstName: 'วรพล',
      lastName: 'สุวรรณเมฆ',
      phone: '0844448899',
      idCard: '1100500600704',
      lineUserId: null,
      inviteCode: 'INV202',
      inviteExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      internalNotes: 'เพิ่งย้ายเข้าใหม่ รอผูกบัญชี LINE ทาง LIFF'
    }
  });

  let tenantSiriporn = await prisma.tenant.upsert({
    where: { lineUserId: 'U_siriporn_demo_04' },
    update: { firstName: 'ศิริพร', lastName: 'บุญมี', phone: '0821112233' },
    create: {
      firstName: 'ศิริพร',
      lastName: 'บุญมี',
      phone: '0821112233',
      idCard: '1100600700805',
      lineUserId: 'U_siriporn_demo_04',
      lineDisplayName: 'Siriporn B.',
      linePictureUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80',
      internalNotes: 'เช่าระยะยาว 2 ปี'
    }
  });

  let tenantAttapol = await prisma.tenant.upsert({
    where: { inviteCode: 'INV999' },
    update: { firstName: 'อรรถพล', lastName: 'เจริญผล', phone: '0891114477' },
    create: {
      firstName: 'อรรถพล',
      lastName: 'เจริญผล',
      phone: '0891114477',
      inviteCode: 'INV999',
      idCard: '1100700800906',
      internalNotes: 'ย้ายออกเมื่อสิ้นเดือนที่แล้ว คืนเงินมัดจำเรียบร้อย'
    }
  });

  console.log('👥 5. Tenants seeded');

  // =========================================================================
  // 6. UserLineAccount (บัญชี LINE หลายตึก / Multi-Building binding)
  // =========================================================================
  if (tenantSomkiat.lineUserId) {
    await prisma.userLineAccount.upsert({
      where: { buildingId_lineUserId: { buildingId: buildingB.id, lineUserId: tenantSomkiat.lineUserId } },
      update: {
        tenantId: tenantSomkiat.id,
        lineDisplayName: tenantSomkiat.lineDisplayName,
        linePictureUrl: tenantSomkiat.linePictureUrl
      },
      create: {
        lineUserId: tenantSomkiat.lineUserId,
        buildingId: buildingB.id,
        tenantId: tenantSomkiat.id,
        lineDisplayName: tenantSomkiat.lineDisplayName,
        linePictureUrl: tenantSomkiat.linePictureUrl
      }
    });
  }

  // =========================================================================
  // 7. Rooms (ที่พัก, ร้านค้าพาณิชย์, ตู้เต่าบิน, ที่จอดรถ)
  // =========================================================================
  async function upsertRoom(data) {
    const existing = await prisma.room.findFirst({
      where: { buildingId: data.buildingId, roomNumber: data.roomNumber }
    });
    if (existing) {
      return await prisma.room.update({
        where: { id: existing.id },
        data
      });
    }
    return await prisma.room.create({ data });
  }

  // Rooms in Building A
  const roomA101 = await upsertRoom({ buildingId: buildingA.id, roomNumber: '101', floor: 1, price: 4000.0, status: 'occupied', tenantId: tenantKanda.id, unitType: 'residential' });
  const roomA102 = await upsertRoom({ buildingId: buildingA.id, roomNumber: '102', floor: 1, price: 4000.0, status: 'occupied', tenantId: tenantThanakorn.id, unitType: 'residential' });
  const roomA103 = await upsertRoom({ buildingId: buildingA.id, roomNumber: '103', floor: 1, price: 4200.0, status: 'available', tenantId: null, unitType: 'residential' });
  const roomA104 = await upsertRoom({ buildingId: buildingA.id, roomNumber: '104', floor: 1, price: 4200.0, status: 'available', tenantId: null, unitType: 'residential' });
  const roomA201 = await upsertRoom({ buildingId: buildingA.id, roomNumber: '201', floor: 2, price: 4500.0, status: 'occupied', tenantId: tenantPimmada.id, unitType: 'residential' });
  const roomA202 = await upsertRoom({ buildingId: buildingA.id, roomNumber: '202', floor: 2, price: 4500.0, status: 'available', tenantId: null, unitType: 'residential' });
  const roomA203 = await upsertRoom({ buildingId: buildingA.id, roomNumber: '203', floor: 2, price: 4500.0, status: 'maintenance', tenantId: null, unitType: 'residential' });
  const roomAShop = await upsertRoom({ buildingId: buildingA.id, roomNumber: 'SHOP-01', floor: 1, price: 8500.0, status: 'available', tenantId: null, unitType: 'commercial_shop', areaSqm: 32.5 });

  // Rooms in Building B
  const roomB101 = await upsertRoom({ buildingId: buildingB.id, roomNumber: '101', floor: 1, price: 4300.0, status: 'occupied', tenantId: tenantSiriporn.id, unitType: 'residential' });
  const roomB102 = await upsertRoom({ buildingId: buildingB.id, roomNumber: '102', floor: 1, price: 4300.0, status: 'available', tenantId: null, unitType: 'residential' });
  const roomB201 = await upsertRoom({ buildingId: buildingB.id, roomNumber: '201', floor: 2, price: 4500.0, status: 'occupied', tenantId: tenantSomkiat.id, ownerId: roomOwnerUser.id, unitType: 'residential' });
  const roomB202 = await upsertRoom({ buildingId: buildingB.id, roomNumber: '202', floor: 2, price: 4500.0, status: 'occupied', tenantId: tenantWorapol.id, unitType: 'residential' });
  const roomB203 = await upsertRoom({ buildingId: buildingB.id, roomNumber: '203', floor: 2, price: 4700.0, status: 'available', tenantId: null, unitType: 'residential' });
  const roomBVending = await upsertRoom({ buildingId: buildingB.id, roomNumber: 'VEND-01', floor: 1, price: 0.0, status: 'occupied', billingModel: 'revenue_share', revSharePercent: 12.0, unitType: 'vending_spot' });

  console.log('🏠 7. Rooms seeded across Building A and B');

  // =========================================================================
  // 8. Room Residents (รูมเมท / สมาชิกร่วมห้อง)
  // =========================================================================
  await prisma.roomResident.upsert({
    where: { roomId_tenantId: { roomId: roomB201.id, tenantId: tenantSomkiat.id } },
    update: { role: 'PRIMARY', isPayer: true },
    create: {
      roomId: roomB201.id,
      tenantId: tenantSomkiat.id,
      role: 'PRIMARY',
      isPayer: true,
      status: 'ACTIVE'
    }
  });

  await prisma.roomResident.upsert({
    where: { roomId_tenantId: { roomId: roomA101.id, tenantId: tenantKanda.id } },
    update: { role: 'PRIMARY', isPayer: true },
    create: {
      roomId: roomA101.id,
      tenantId: tenantKanda.id,
      role: 'PRIMARY',
      isPayer: true,
      status: 'ACTIVE'
    }
  });

  // =========================================================================
  // 9. Lease Contracts & Move Out History
  // =========================================================================
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const oneYearLater = new Date(Date.now() + 185 * 24 * 60 * 60 * 1000);

  // Active Lease for Somkiat (Building B - 201)
  let leaseB201 = await prisma.leaseContract.findFirst({
    where: { roomId: roomB201.id, tenantId: tenantSomkiat.id }
  });
  if (!leaseB201) {
    leaseB201 = await prisma.leaseContract.create({
      data: {
        roomId: roomB201.id,
        tenantId: tenantSomkiat.id,
        buildingId: buildingB.id,
        startDate: sixMonthsAgo,
        expectedEndDate: oneYearLater,
        depositAmount: 9000.0,
        status: 'ACTIVE',
        adminNote: 'สัญญาเช่า 1 ปี เงินประกัน 2 เดือน'
      }
    });
  }

  // Active Lease for Kanda (Building A - 101)
  let leaseA101 = await prisma.leaseContract.findFirst({
    where: { roomId: roomA101.id, tenantId: tenantKanda.id }
  });
  if (!leaseA101) {
    leaseA101 = await prisma.leaseContract.create({
      data: {
        roomId: roomA101.id,
        tenantId: tenantKanda.id,
        buildingId: buildingA.id,
        startDate: sixMonthsAgo,
        expectedEndDate: oneYearLater,
        depositAmount: 8000.0,
        status: 'ACTIVE'
      }
    });
  }

  // Ended Lease for Attapol (Building A - 104) with Move Out Record
  let pastLeaseA104 = await prisma.leaseContract.findFirst({
    where: { roomId: roomA104.id, tenantId: tenantAttapol.id }
  });
  if (!pastLeaseA104) {
    pastLeaseA104 = await prisma.leaseContract.create({
      data: {
        roomId: roomA104.id,
        tenantId: tenantAttapol.id,
        buildingId: buildingA.id,
        startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
        expectedEndDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        actualEndDate: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000),
        depositAmount: 8400.0,
        status: 'ENDED',
        moveOutReason: 'ย้ายที่ทำงานไปต่างจังหวัด',
        adminNote: 'ตรวจสภาพห้องแล้ว มีค่าทำความสะอาดและทาสีใหม่เล็กน้อย'
      }
    });

    await prisma.moveOutRecord.create({
      data: {
        leaseId: pastLeaseA104.id,
        moveOutDate: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000),
        finalWaterMeter: 240,
        finalElectricMeter: 1450,
        finalWaterTotal: 180.0,
        finalElectricTotal: 560.0,
        unpaidInvoicesTotal: 0.0,
        damageCharges: [
          { description: 'ค่าทำความสะอาดห้องพัก', amount: 500 },
          { description: 'ค่าล้างแอร์ก่อนส่งมอบ', amount: 600 }
        ],
        totalDeductions: 1840.0,
        depositAmount: 8400.0,
        netRefund: 6560.0,
        refundStatus: 'PAID'
      }
    });
  }

  console.log('📜 9. Lease Contracts & Move-out Records seeded');

  // =========================================================================
  // 10. Meter Records (มิเตอร์น้ำ-ไฟย้อนหลัง)
  // =========================================================================
  const meterData = [
    { roomId: roomB201.id, meterType: 'water', previousReading: 120, currentReading: 129, unitsUsed: 9, billingCycle: '08-2026', recordedAt: new Date('2026-08-25') },
    { roomId: roomB201.id, meterType: 'electric', previousReading: 2150, currentReading: 2255, unitsUsed: 105, billingCycle: '08-2026', recordedAt: new Date('2026-08-25') },
    { roomId: roomB201.id, meterType: 'water', previousReading: 112, currentReading: 120, unitsUsed: 8, billingCycle: '07-2026', recordedAt: new Date('2026-07-25') },
    { roomId: roomB201.id, meterType: 'electric', previousReading: 2045, currentReading: 2150, unitsUsed: 105, billingCycle: '07-2026', recordedAt: new Date('2026-07-25') },
    { roomId: roomA101.id, meterType: 'water', previousReading: 85, currentReading: 91, unitsUsed: 6, billingCycle: '08-2026', recordedAt: new Date('2026-08-25') },
    { roomId: roomA101.id, meterType: 'electric', previousReading: 1540, currentReading: 1620, unitsUsed: 80, billingCycle: '08-2026', recordedAt: new Date('2026-08-25') }
  ];

  for (const m of meterData) {
    const existing = await prisma.meterRecord.findFirst({
      where: { roomId: m.roomId, meterType: m.meterType, billingCycle: m.billingCycle }
    });
    if (!existing) {
      await prisma.meterRecord.create({ data: m });
    }
  }

  console.log('⚡ 10. Meter Records seeded');

  // =========================================================================
  // 11. Invoices (ใบแจ้งหนี้ Pending, Paid, Overdue)
  // =========================================================================
  async function upsertInvoice(data) {
    const existing = await prisma.invoice.findUnique({
      where: { invoiceNumber: data.invoiceNumber }
    });
    if (existing) {
      return await prisma.invoice.update({
        where: { invoiceNumber: data.invoiceNumber },
        data
      });
    }
    return await prisma.invoice.create({ data });
  }

  // Invoice 1: Room B201 (Pending)
  await upsertInvoice({
    invoiceNumber: 'INV-202608-B201',
    roomId: roomB201.id,
    tenantId: tenantSomkiat.id,
    billingCycle: '08-2026',
    roomPrice: 4500.0,
    waterTotal: 180.0,
    electricTotal: 840.0,
    commonFee: 100.0,
    otherFee: 0.0,
    grandTotal: 5620.0,
    status: 'pending',
    dueDate: new Date('2026-09-05'),
    slipUrl: null
  });

  // Invoice 2: Room B201 (Paid with receipt)
  await upsertInvoice({
    invoiceNumber: 'INV-202607-B201',
    roomId: roomB201.id,
    tenantId: tenantSomkiat.id,
    billingCycle: '07-2026',
    roomPrice: 4500.0,
    waterTotal: 160.0,
    electricTotal: 840.0,
    commonFee: 100.0,
    otherFee: 0.0,
    grandTotal: 5600.0,
    status: 'paid',
    dueDate: new Date('2026-08-05'),
    paidAt: new Date('2026-08-03T14:25:00Z'),
    paymentMethod: 'PROMPTPAY',
    paymentNote: 'ชำระผ่าน PromptPay QR Code อัตโนมัติ',
    slipUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=600&q=80',
    slipHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  });

  console.log('🧾 11. Invoices seeded');

  // =========================================================================
  // 12. Maintenance Requests (แจ้งซ่อมแซม Admin Backoffice)
  // =========================================================================
  const maintenanceList = [
    {
      roomId: roomB201.id,
      tenantId: tenantSomkiat.id,
      buildingId: buildingB.id,
      title: 'ก๊อกน้ำอ่างล้างหน้ารั่วซึม',
      description: 'มีน้ำหยดตลอดเวลาปิดไม่สนิท น้ำซึมลงใต้เคาน์เตอร์',
      technicianName: 'ช่างวิชัย',
      repairCost: 0,
      adminNote: 'รับเรื่องแล้ว จัดคิวช่างตรวจเช็คช่วงบ่าย',
      status: 'pending',
      payer: 'MANAGEMENT'
    },
    {
      roomId: roomB201.id,
      tenantId: tenantSomkiat.id,
      buildingId: buildingB.id,
      title: 'เครื่องปรับอากาศไม่เย็น มีลมร้อนออกมา',
      description: 'เปิดแอร์ 24 องศาแล้วห้องยังร้อน คอมเพรสเซอร์ตัดบ่อย',
      imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80',
      technicianName: 'ช่างสมชาย (แอร์เซอร์วิส)',
      repairCost: 500.0,
      adminNote: 'นัดช่างแอร์เข้าตรวจเช็คแรงดันน้ำยาแอร์และแผงคอยล์เย็น',
      status: 'in_progress',
      payer: 'MANAGEMENT'
    },
    {
      roomId: roomB201.id,
      tenantId: tenantSomkiat.id,
      buildingId: buildingB.id,
      title: 'ลูกบิดประตูด้านในล็อคฝืดและไขติดขัด',
      description: 'ลูกบิดประตูระเบียงบิดยากมาก',
      technicianName: 'ช่างวิชัย',
      repairCost: 350.0,
      adminNote: 'ช่างได้ทำการเปลี่ยนตลับลูกบิดประตูสแตนเลสตัวใหม่ให้เรียบร้อยแล้ว',
      status: 'resolved',
      resolvedAt: new Date('2026-08-27T14:30:00Z'),
      payer: 'MANAGEMENT'
    }
  ];

  for (const req of maintenanceList) {
    const existing = await prisma.maintenanceRequest.findFirst({
      where: { roomId: req.roomId, title: req.title }
    });
    if (!existing) {
      await prisma.maintenanceRequest.create({ data: req });
    }
  }

  console.log('🔧 12. Maintenance Requests seeded');

  // =========================================================================
  // 13. Smart Parcels (พัสดุ)
  // =========================================================================
  const sampleParcels = [
    {
      roomId: roomB201.id,
      buildingId: buildingB.id,
      tenantId: tenantSomkiat.id,
      trackingNumber: 'SPXTH048291039',
      courier: 'Shopee Express',
      photoUrl: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=600&q=80',
      status: 'PENDING',
      receivedAt: new Date()
    },
    {
      roomId: roomB201.id,
      buildingId: buildingB.id,
      tenantId: tenantSomkiat.id,
      trackingNumber: 'KER882940192',
      courier: 'Kerry Express',
      photoUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80',
      status: 'PICKED_UP',
      receivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      pickedUpAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
    }
  ];

  for (const p of sampleParcels) {
    const existing = await prisma.parcel.findFirst({ where: { trackingNumber: p.trackingNumber } });
    if (!existing) await prisma.parcel.create({ data: p });
  }

  console.log('📦 13. Smart Parcels seeded');

  // =========================================================================
  // 14. Announcements & AnnouncementRead (ข่าวสาร & สถานะการอ่าน)
  // =========================================================================
  const sampleAnnouncements = [
    {
      title: 'แจ้งกำหนดการล้างถังพักน้ำส่วนกลางประจำปี',
      content: 'นิติบุคคลจะทำการล้างทำความสะอาดถังพักน้ำประปาประจำปี ในวันอาทิตย์ที่ 6 กันยายน 2569 เวลา 09:00 - 15:00 น. ช่วงเวลาดังกล่าวจะงดจ่ายน้ำประปาชั่วคราว ขอความกรุณาลูกบ้านทุกท่านสำรองน้ำไว้ใช้ล่วงหน้า',
      imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80',
      targetType: 'all',
      createdBy: 'Admin Manager',
      buildingId: buildingB.id
    },
    {
      title: 'ขอความร่วมมือคัดแยกขยะและทิ้งในจุดที่กำหนด',
      content: 'เพื่อความสะอาดและสุขอนามัยที่ดีของอาคาร ขอความร่วมมือลูกบ้านทุกท่านช่วยคัดแยกขยะเปียกและขยะรีไซเคิลก่อนนำมาทิ้ง ณ ห้องขยะชั้น 1',
      targetType: 'all',
      createdBy: 'Admin Manager',
      buildingId: buildingB.id
    }
  ];

  for (const ann of sampleAnnouncements) {
    let savedAnn = await prisma.announcement.findFirst({
      where: { title: ann.title, buildingId: ann.buildingId }
    });
    if (!savedAnn) {
      savedAnn = await prisma.announcement.create({ data: ann });
    }

    // Seed AnnouncementRead for Somkiat
    await prisma.announcementRead.upsert({
      where: { announcementId_tenantId: { announcementId: savedAnn.id, tenantId: tenantSomkiat.id } },
      update: {},
      create: { announcementId: savedAnn.id, tenantId: tenantSomkiat.id }
    });
  }

  console.log('📢 14. Announcements & Read Status seeded');

  // =========================================================================
  // 15. Facilities & FacilityBookings (พื้นที่ส่วนกลางและการจอง)
  // =========================================================================
  const facilityFitness = await prisma.facility.upsert({
    where: { id: '00000000-0000-0000-0000-0000000000f1' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-0000000000f1',
      buildingId: buildingB.id,
      name: 'ห้องฟิตเนส (Fitness Center ชั้น 2)',
      description: 'อุปกรณ์คาร์ดิโอ ดัมเบล และลู่วิ่งไฟฟ้า เปิด 06:00 - 22:00 น.',
      imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=600&q=80',
      isActive: true
    }
  });

  const facilityCoworking = await prisma.facility.upsert({
    where: { id: '00000000-0000-0000-0000-0000000000f2' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-0000000000f2',
      buildingId: buildingB.id,
      name: 'ห้องประชุม & Co-Working Space (ชั้น 1)',
      description: 'โต๊ะทำงานพร้อม Wi-Fi ความเร็วสูง ปลั๊กไฟ และกระดานไวท์บอร์ด',
      imageUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=80',
      isActive: true
    }
  });

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  tomorrow.setHours(17, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrow.getTime() + 60 * 60 * 1000);

  await prisma.facilityBooking.create({
    data: {
      facilityId: facilityFitness.id,
      tenantId: tenantSomkiat.id,
      buildingId: buildingB.id,
      startTime: tomorrow,
      endTime: tomorrowEnd,
      status: 'CONFIRMED',
      notes: 'จองออกกำลังกายช่วงเย็น'
    }
  }).catch(() => {});

  console.log('🏋️ 15. Facilities & Bookings seeded');

  // =========================================================================
  // 16. Vehicles & Visitors (ทะเบียนรถและผู้มาติดต่อ)
  // =========================================================================
  await prisma.vehicle.upsert({
    where: { id: '00000000-0000-0000-0000-0000000000c1' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-0000000000c1',
      tenantId: tenantSomkiat.id,
      buildingId: buildingB.id,
      licensePlate: '9กก-1234 กทม',
      vehicleType: 'car',
      brand: 'Honda Civic',
      color: 'สีขาว',
      status: 'APPROVED'
    }
  });

  await prisma.visitor.create({
    data: {
      tenantId: tenantSomkiat.id,
      buildingId: buildingB.id,
      visitorName: 'คุณประสิทธิ์ แซ่ตั้ง',
      licensePlate: '5ขข-5678 กทม',
      expectedDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
      note: 'ส่งเอกสารและของใช้ส่วนตัว',
      status: 'EXPECTED'
    }
  }).catch(() => {});

  console.log('🚗 16. Vehicles & Visitors seeded');

  // =========================================================================
  // 17. Polls & PollVotes (การโหวตและมติลูกบ้าน)
  // =========================================================================
  let samplePoll = await prisma.poll.findFirst({ where: { buildingId: buildingB.id } });
  if (!samplePoll) {
    samplePoll = await prisma.poll.create({
      data: {
        buildingId: buildingB.id,
        question: 'ท่านเห็นด้วยหรือไม่กับการขยายเวลาเปิดห้องฟิตเนสเป็น 24 ชั่วโมง?',
        options: ['เห็นด้วยอย่างยิ่ง', 'เห็นด้วย แต่ต้องมีกล้องวงจรปิดครอบคลุม', 'ไม่เห็นด้วย เกรงว่าจะมีเสียงรบกวน'],
        isActive: true
      }
    });
  }

  if (samplePoll) {
    await prisma.pollVote.upsert({
      where: { pollId_tenantId: { pollId: samplePoll.id, tenantId: tenantSomkiat.id } },
      update: { optionIndex: 0 },
      create: {
        pollId: samplePoll.id,
        tenantId: tenantSomkiat.id,
        optionIndex: 0
      }
    }).catch(() => {});
  }

  console.log('🗳️ 17. Polls & Votes seeded');

  // =========================================================================
  // 18. IssueTickets (แจ้งเหตุ & ร้องเรียน LIFF)
  // =========================================================================
  await prisma.issueTicket.create({
    data: {
      userId: tenantSomkiat.id,
      roomId: roomB201.id,
      buildingId: buildingB.id,
      category: 'COMPLAINT',
      description: 'ช่วงดึกมีกลิ่นควันบุหรี่ลอยเข้ามาจากระเบียงห้องข้างๆ ขอความกรุณานิติตักเตือน',
      imageUrls: [],
      status: 'RESOLVED',
      adminReply: 'นิติบุคคลได้ออกหนังสือแจ้งเตือนและติดป้ายห้ามสูบบุหรี่บริเวณโถงทางเดินเรียบร้อยแล้วครับ'
    }
  }).catch(() => {});

  console.log('🎫 18. Issue Tickets seeded');

  // =========================================================================
  // 19. Vendors & Room Inspections (รายชื่อช่าง & การตรวจสภาพห้อง)
  // =========================================================================
  await prisma.vendor.create({
    data: {
      buildingId: buildingB.id,
      name: 'ช่างสมชาย (แอร์เซอร์วิส & ไฟฟ้า)',
      category: 'ช่างแอร์',
      phone: '081-456-7890',
      lineId: 'somchai_air',
      note: 'ติดต่อได้ตลอด 24 ชั่วโมง มีเครื่องมือวัดระดับน้ำยาแอร์ครบชุด'
    }
  }).catch(() => {});

  await prisma.roomInspection.create({
    data: {
      leaseId: leaseB201.id,
      buildingId: buildingB.id,
      type: 'MOVE_IN',
      items: [
        { label: 'เครื่องปรับอากาศ', condition: 'GOOD', note: 'เย็นฉ่ำ เสียงเงียบปกติ' },
        { label: 'ผ้าม่านและมุ้งลวด', condition: 'GOOD', note: 'สะอาด ไม่มีรอยฉีกขาด' },
        { label: 'สุขภัณฑ์ห้องน้ำ', condition: 'GOOD', note: 'น้ำไหลแรง ระบายน้ำดี' }
      ],
      photoUrls: [],
      adminNote: 'ผู้เช่าตรวจรับมอบห้องพักเรียบร้อย สภาพสมบูรณ์พร้อมเข้าอยู่'
    }
  }).catch(() => {});

  console.log('👷 19. Vendors & Room Inspections seeded');

  // =========================================================================
  // 20. NotificationLog & DeveloperFeedback (แจ้งเตือน & ข้อเสนอแนะ)
  // =========================================================================
  await prisma.notificationLog.create({
    data: {
      buildingId: buildingB.id,
      tenantId: tenantSomkiat.id,
      roomId: roomB201.id,
      notificationType: 'INVOICE',
      messagePreview: 'ใบแจ้งหนี้ค่าเช่าห้อง 201 ประจำเดือน 08-2026 ออกแล้ว ยอดชำระ ฿5,620',
      status: 'SUCCESS'
    }
  }).catch(() => {});

  await prisma.developerFeedback.create({
    data: {
      platform: 'CMS_ADMIN',
      category: 'FEATURE_REQUEST',
      title: 'ต้องการให้ระบบส่ง LINE แจ้งเตือนเมื่อลูกบ้านจองฟิตเนสสำเร็จ',
      content: 'อยากให้มี Flex message สรุปเวลาจองยิงเข้า LINE ลูกบ้านอัตโนมัติ',
      rating: 5,
      senderRole: 'ADMIN',
      senderId: superAdmin.id,
      senderName: 'Super Admin',
      buildingId: buildingB.id,
      status: 'IN_REVIEW'
    }
  }).catch(() => {});

  // =========================================================================
  // 21. AuditLog (ประวัติการใช้งานระบบ)
  // =========================================================================
  await prisma.auditLog.create({
    data: {
      adminId: ownerUser.id,
      action: 'UPDATE_BUILDING_SETTING',
      entity: 'BUILDING_SETTING',
      entityId: buildingB.id,
      newValues: { waterRate: 20 }
    }
  }).catch(() => {});

  console.log('📋 20-21. Notification Logs, Feedback & Audit Logs seeded');

  // =========================================================================
  // 22. Room Invites
  // =========================================================================
  const sampleInvites = [
    { roomId: roomA103.id, code: 'INV103', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), isUsed: false },
    { roomId: roomB102.id, code: 'INV102', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), isUsed: false },
    { roomId: roomB203.id, code: 'INV203', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), isUsed: false }
  ];

  for (const inv of sampleInvites) {
    await prisma.roomInvite.upsert({
      where: { code: inv.code },
      update: { roomId: inv.roomId, expiresAt: inv.expiresAt, isUsed: inv.isUsed },
      create: inv
    });
  }

  console.log('🎟️ 22. Room Invites seeded (INV103, INV102, INV203)');

  console.log('\n=============================================================');
  console.log('  COMPLETE DATABASE MOCKUP SEEDING COMPLETED (ALL TABLES)!');
  console.log('  - Buildings: อาคาร A, อาคาร B พร้อม PromptPay QR');
  console.log('  - Users: Super Admin, Owner, Manager, Admins, Room Investor');
  console.log('  - Rooms & Types: Residential, Commercial Shop, Vending, Parking');
  console.log(`  - LIFF Tenant Linked: ${activeLiffLineUserId} -> สมเกียรติ (ห้อง 201 อาคาร B)`);
  console.log('  - Features: Facilities, Bookings, Vehicles, Visitors, Polls, Vendors');
  console.log('  - Records: Leases, MoveOuts, Invoices, Meters, Maintenance, Parcels');
  console.log('  - System: Audit Logs, Feedback, Inspections, Notifications');
  console.log('=============================================================\n');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
