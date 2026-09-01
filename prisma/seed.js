const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const generatePayload = require('promptpay-qr');
const QRCode = require('qrcode');

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function ensureRefreshTokensTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        token TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  } catch (err) {
    console.warn('⚠️ Could not verify/create refresh_tokens table:', err.message);
  }
}

async function main() {
  console.log('🌱 Starting comprehensive database seeding...');

  // 0. Ensure refresh_tokens table exists
  await ensureRefreshTokensTable();

  // 1. Buildings
  let buildingA = await prisma.building.findFirst({
    where: { name: { contains: 'อาคาร A' } }
  });
  if (!buildingA) {
    buildingA = await prisma.building.create({
      data: {
        name: 'อาคาร A (Main Building)',
        address: '123/1 ถนนสุขุมวิท 71 แขวงพระโขนงเหนือ เขตวัฒนา กรุงเทพฯ 10110'
      }
    });
  } else {
    await prisma.building.update({
      where: { id: buildingA.id },
      data: { name: 'อาคาร A (Main Building)' }
    });
  }

  let buildingB = await prisma.building.findFirst({
    where: { name: { contains: 'อาคาร B' } }
  });
  if (!buildingB) {
    buildingB = await prisma.building.create({
      data: {
        name: 'อาคาร B (North Wing)',
        address: '123/2 ถนนสุขุมวิท 71 แขวงพระโขนงเหนือ เขตวัฒนา กรุงเทพฯ 10110'
      }
    });
  }

  console.log(`🏢 Buildings ready: [A: ${buildingA.id}] ${buildingA.name}, [B: ${buildingB.id}] ${buildingB.name}`);

  // 2. Building Settings with Real PromptPay QR Codes
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
      depositMonths: 2,
      advanceMonths: 1,
      termsAndConditions: '1. ห้ามดัดแปลงโครงสร้างห้องพักหรือเจาะผนัง\n2. รักษาความสะอาดพื้นที่ส่วนกลาง\n3. ทิ้งขยะในจุดที่นิติบุคคลกำหนดเท่านั้น'
    }
  });

  console.log('⚙️ Building Settings seeded');

  // 3. Admin Users
  const defaultPassword = hashPassword('password123');

  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@dorm.com' },
    update: { role: 'super_admin' },
    create: {
      email: 'superadmin@dorm.com',
      passwordHash: defaultPassword,
      name: 'Super Admin',
      role: 'super_admin',
      phone: '0899999999'
    }
  });

  const mainAdmin = await prisma.user.upsert({
    where: { email: 'admin@dorm.com' },
    update: { role: 'super_admin' },
    create: {
      email: 'admin@dorm.com',
      passwordHash: defaultPassword,
      name: 'Admin Manager',
      role: 'super_admin',
      phone: '0899999999'
    }
  });

  const ownerUser = await prisma.user.upsert({
    where: { email: 'owner@dorm.com' },
    update: { role: 'OWNER' },
    create: {
      email: 'owner@dorm.com',
      passwordHash: defaultPassword,
      name: 'Owner User',
      role: 'OWNER',
      phone: '0888888888'
    }
  });

  const managerUser = await prisma.user.upsert({
    where: { email: 'manager@dorm.com' },
    update: { role: 'MANAGER' },
    create: {
      email: 'manager@dorm.com',
      passwordHash: defaultPassword,
      name: 'Manager User',
      role: 'MANAGER',
      phone: '0877777777'
    }
  });

  await prisma.userBuildingPermission.upsert({
    where: { userId_buildingId: { userId: managerUser.id, buildingId: buildingA.id } },
    update: {},
    create: { userId: managerUser.id, buildingId: buildingA.id }
  });

  const adminA = await prisma.user.upsert({
    where: { email: 'admin_building_a@dorm.com' },
    update: { role: 'admin' },
    create: {
      email: 'admin_building_a@dorm.com',
      passwordHash: defaultPassword,
      name: 'Admin Building A',
      role: 'admin',
      phone: '0811111111'
    }
  });

  await prisma.userBuildingPermission.upsert({
    where: { userId_buildingId: { userId: adminA.id, buildingId: buildingA.id } },
    update: {},
    create: { userId: adminA.id, buildingId: buildingA.id }
  });

  const adminB = await prisma.user.upsert({
    where: { email: 'admin_building_b@dorm.com' },
    update: { role: 'admin' },
    create: {
      email: 'admin_building_b@dorm.com',
      passwordHash: defaultPassword,
      name: 'Admin Building B',
      role: 'admin',
      phone: '0822222222'
    }
  });

  await prisma.userBuildingPermission.upsert({
    where: { userId_buildingId: { userId: adminB.id, buildingId: buildingB.id } },
    update: {},
    create: { userId: adminB.id, buildingId: buildingB.id }
  });

  console.log('👤 Admin users & building permissions ready');

  // 4. Feature Toggles
  const defaultFeatures = [
    { key: 'ENABLE_VEHICLE_MANAGEMENT', description: 'ระบบจัดการป้ายทะเบียนและยานพาหนะลูกบ้าน', isActive: true },
    { key: 'ENABLE_PARCEL_NOTIFY', description: 'ระบบแจ้งเตือนพัสดุมาถึงผ่าน LINE', isActive: true },
    { key: 'ENABLE_MAINTENANCE_REQUEST', description: 'ระบบแจ้งซ่อมแซมและติดตามสถานะ', isActive: true },
    { key: 'ENABLE_LINE_PAYMENT', description: 'ระบบชำระเงินและแนบสลิปผ่าน LIFF', isActive: true }
  ];

  for (const feature of defaultFeatures) {
    await prisma.featureToggle.upsert({
      where: { key_buildingId: { key: feature.key, buildingId: buildingA.id } },
      update: { isActive: true },
      create: { ...feature, buildingId: buildingA.id }
    }).catch(async () => {
      // If table constraint has no buildingId composite, fallback
      const existing = await prisma.featureToggle.findFirst({ where: { key: feature.key, buildingId: null } });
      if (!existing) await prisma.featureToggle.create({ data: { key: feature.key, description: feature.description, isActive: true } });
    });
  }

  // 5. Tenants
  // User's active LIFF LINE ID: Uef737f8486c9f1e560364799ef60018e
  const activeLiffLineUserId = 'Uef737f8486c9f1e560364799ef60018e';

  // Tenant 1: Main User / Somkiat (Linked to Building B - Room 201)
  let tenantSomkiat = await prisma.tenant.findFirst({
    where: {
      OR: [
        { lineUserId: activeLiffLineUserId },
        { phone: '0898765432' }
      ]
    }
  });

  if (tenantSomkiat) {
    tenantSomkiat = await prisma.tenant.update({
      where: { id: tenantSomkiat.id },
      data: {
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
  } else {
    tenantSomkiat = await prisma.tenant.create({
      data: {
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
  }

  // Tenant 2: Kanda (Building A - Room 101)
  let tenantKanda = await prisma.tenant.findFirst({ where: { phone: '0812345678' } });
  if (!tenantKanda) {
    tenantKanda = await prisma.tenant.create({
      data: {
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
  }

  // Tenant 3: Thanakorn (Building A - Room 102)
  let tenantThanakorn = await prisma.tenant.findFirst({ where: { phone: '0863334455' } });
  if (!tenantThanakorn) {
    tenantThanakorn = await prisma.tenant.create({
      data: {
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
  }

  // Tenant 4: Pimmada (Building A - Room 201)
  let tenantPimmada = await prisma.tenant.findFirst({ where: { phone: '0855556677' } });
  if (!tenantPimmada) {
    tenantPimmada = await prisma.tenant.create({
      data: {
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
  }

  // Tenant 5: Worapol (Building B - Room 202, Unlinked, Invite Code ready)
  let tenantWorapol = await prisma.tenant.findFirst({ where: { phone: '0844448899' } });
  if (!tenantWorapol) {
    tenantWorapol = await prisma.tenant.create({
      data: {
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
  }

  // Tenant 6: Siriporn (Building B - Room 101)
  let tenantSiriporn = await prisma.tenant.findFirst({ where: { phone: '0821112233' } });
  if (!tenantSiriporn) {
    tenantSiriporn = await prisma.tenant.create({
      data: {
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
  }

  // Tenant 7: Attapol (Moved Out / History)
  let tenantAttapol = await prisma.tenant.findFirst({ where: { phone: '0891114477' } });
  if (!tenantAttapol) {
    tenantAttapol = await prisma.tenant.create({
      data: {
        firstName: 'อรรถพล',
        lastName: 'เจริญผล',
        phone: '0891114477',
        idCard: '1100700800906',
        internalNotes: 'ย้ายออกเมื่อสิ้นเดือนที่แล้ว คืนเงินมัดจำเรียบร้อย'
      }
    });
  }

  console.log('👥 Tenants seeded successfully');

  // 6. Rooms
  // Helper to upsert rooms
  async function upsertRoom(buildingId, roomNumber, floor, price, status, tenantId = null) {
    const existing = await prisma.room.findFirst({
      where: { buildingId, roomNumber }
    });
    if (existing) {
      return await prisma.room.update({
        where: { id: existing.id },
        data: { floor, price, status, tenantId }
      });
    }
    return await prisma.room.create({
      data: { buildingId, roomNumber, floor, price, status, tenantId }
    });
  }

  // Rooms in Building A
  const roomA101 = await upsertRoom(buildingA.id, '101', 1, 4000.0, 'occupied', tenantKanda.id);
  const roomA102 = await upsertRoom(buildingA.id, '102', 1, 4000.0, 'occupied', tenantThanakorn.id);
  const roomA103 = await upsertRoom(buildingA.id, '103', 1, 4200.0, 'available', null);
  const roomA104 = await upsertRoom(buildingA.id, '104', 1, 4200.0, 'available', null);
  const roomA201 = await upsertRoom(buildingA.id, '201', 2, 4500.0, 'occupied', tenantPimmada.id);
  const roomA202 = await upsertRoom(buildingA.id, '202', 2, 4500.0, 'available', null);
  const roomA203 = await upsertRoom(buildingA.id, '203', 2, 4500.0, 'maintenance', null);
  const roomA301 = await upsertRoom(buildingA.id, '301', 3, 4800.0, 'available', null);

  // Rooms in Building B
  const roomB101 = await upsertRoom(buildingB.id, '101', 1, 4300.0, 'occupied', tenantSiriporn.id);
  const roomB102 = await upsertRoom(buildingB.id, '102', 1, 4300.0, 'available', null);
  const roomB201 = await upsertRoom(buildingB.id, '201', 2, 4500.0, 'occupied', tenantSomkiat.id);
  const roomB202 = await upsertRoom(buildingB.id, '202', 2, 4500.0, 'occupied', tenantWorapol.id);
  const roomB203 = await upsertRoom(buildingB.id, '203', 2, 4700.0, 'available', null);

  console.log('🏠 Rooms seeded across Building A and B');

  // 7. Lease Contracts & Move Out History
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

  // Active Lease for Thanakorn (Building A - 102)
  let leaseA102 = await prisma.leaseContract.findFirst({
    where: { roomId: roomA102.id, tenantId: tenantThanakorn.id }
  });
  if (!leaseA102) {
    leaseA102 = await prisma.leaseContract.create({
      data: {
        roomId: roomA102.id,
        tenantId: tenantThanakorn.id,
        buildingId: buildingA.id,
        startDate: sixMonthsAgo,
        expectedEndDate: oneYearLater,
        depositAmount: 8000.0,
        status: 'ACTIVE'
      }
    });
  }

  // Active Lease for Worapol (Building B - 202)
  let leaseB202 = await prisma.leaseContract.findFirst({
    where: { roomId: roomB202.id, tenantId: tenantWorapol.id }
  });
  if (!leaseB202) {
    leaseB202 = await prisma.leaseContract.create({
      data: {
        roomId: roomB202.id,
        tenantId: tenantWorapol.id,
        buildingId: buildingB.id,
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        expectedEndDate: oneYearLater,
        depositAmount: 9000.0,
        status: 'ACTIVE'
      }
    });
  }

  // Past Ended Lease for Attapol (Building A - 104) with Move Out Record
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

  console.log('📜 Lease contracts & move-out history seeded');

  // 8. Meter Records (July 2026 and August 2026)
  const meterData = [
    // Room B201 (Somkiat)
    { roomId: roomB201.id, meterType: 'water', previousReading: 120, currentReading: 129, unitsUsed: 9, billingCycle: '08-2026', recordedAt: new Date('2026-08-25') },
    { roomId: roomB201.id, meterType: 'electric', previousReading: 2150, currentReading: 2255, unitsUsed: 105, billingCycle: '08-2026', recordedAt: new Date('2026-08-25') },
    { roomId: roomB201.id, meterType: 'water', previousReading: 112, currentReading: 120, unitsUsed: 8, billingCycle: '07-2026', recordedAt: new Date('2026-07-25') },
    { roomId: roomB201.id, meterType: 'electric', previousReading: 2045, currentReading: 2150, unitsUsed: 105, billingCycle: '07-2026', recordedAt: new Date('2026-07-25') },
    // Room A101 (Kanda)
    { roomId: roomA101.id, meterType: 'water', previousReading: 85, currentReading: 91, unitsUsed: 6, billingCycle: '08-2026', recordedAt: new Date('2026-08-25') },
    { roomId: roomA101.id, meterType: 'electric', previousReading: 1540, currentReading: 1620, unitsUsed: 80, billingCycle: '08-2026', recordedAt: new Date('2026-08-25') },
    // Room A102 (Thanakorn)
    { roomId: roomA102.id, meterType: 'water', previousReading: 90, currentReading: 98, unitsUsed: 8, billingCycle: '08-2026', recordedAt: new Date('2026-08-25') },
    { roomId: roomA102.id, meterType: 'electric', previousReading: 1800, currentReading: 1910, unitsUsed: 110, billingCycle: '08-2026', recordedAt: new Date('2026-08-25') }
  ];

  for (const m of meterData) {
    const existing = await prisma.meterRecord.findFirst({
      where: { roomId: m.roomId, meterType: m.meterType, billingCycle: m.billingCycle }
    });
    if (!existing) {
      await prisma.meterRecord.create({ data: m });
    }
  }

  console.log('⚡ Water & Electric meter records seeded');

  // 9. Invoices
  // Helper to create or update invoice
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

  // Invoice 1: Room B201 (Somkiat / Current Month) -> Pending (ยังไม่จ่าย รอชำระ)
  await upsertInvoice({
    invoiceNumber: 'INV-202608-B201',
    roomId: roomB201.id,
    tenantId: tenantSomkiat.id,
    billingCycle: '08-2026',
    roomPrice: 4500.0,
    waterTotal: 180.0, // 9 units * 20
    electricTotal: 840.0, // 105 units * 8
    commonFee: 100.0,
    otherFee: 0.0,
    grandTotal: 5620.0,
    status: 'pending',
    dueDate: new Date('2026-09-05'),
    slipUrl: null
  });

  // Invoice 2: Room B201 (Somkiat / July 2026) -> Paid (ชำระแล้ว มีใบเสร็จ)
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

  // Invoice 3: Room B201 (Somkiat / June 2026) -> Paid (ชำระแล้ว)
  await upsertInvoice({
    invoiceNumber: 'INV-202606-B201',
    roomId: roomB201.id,
    tenantId: tenantSomkiat.id,
    billingCycle: '06-2026',
    roomPrice: 4500.0,
    waterTotal: 140.0,
    electricTotal: 800.0,
    commonFee: 100.0,
    otherFee: 0.0,
    grandTotal: 5540.0,
    status: 'paid',
    dueDate: new Date('2026-07-05'),
    paidAt: new Date('2026-07-04T10:10:00Z'),
    paymentMethod: 'PROMPTPAY',
    paymentNote: 'โอนชำระเงินเรียบร้อย',
    slipUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=600&q=80'
  });

  // Invoice 4: Room A101 (Kanda / August 2026) -> Paid
  await upsertInvoice({
    invoiceNumber: 'INV-202608-A101',
    roomId: roomA101.id,
    tenantId: tenantKanda.id,
    billingCycle: '08-2026',
    roomPrice: 4000.0,
    waterTotal: 108.0, // 6 units * 18
    electricTotal: 560.0, // 80 units * 7
    commonFee: 100.0,
    otherFee: 0.0,
    grandTotal: 4768.0,
    status: 'paid',
    dueDate: new Date('2026-09-05'),
    paidAt: new Date('2026-08-28T09:30:00Z'),
    paymentMethod: 'PROMPTPAY',
    slipUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=600&q=80'
  });

  // Invoice 5: Room A102 (Thanakorn / August 2026) -> Pending
  await upsertInvoice({
    invoiceNumber: 'INV-202608-A102',
    roomId: roomA102.id,
    tenantId: tenantThanakorn.id,
    billingCycle: '08-2026',
    roomPrice: 4000.0,
    waterTotal: 144.0,
    electricTotal: 770.0,
    commonFee: 100.0,
    otherFee: 0.0,
    grandTotal: 5014.0,
    status: 'pending',
    dueDate: new Date('2026-09-05')
  });

  // Invoice 6: Room A201 (Pimmada / July 2026) -> Overdue (เกินกำหนดชำระ มีค่าปรับ)
  await upsertInvoice({
    invoiceNumber: 'INV-202607-A201',
    roomId: roomA201.id,
    tenantId: tenantPimmada.id,
    billingCycle: '07-2026',
    roomPrice: 4500.0,
    waterTotal: 180.0,
    electricTotal: 700.0,
    commonFee: 100.0,
    otherFee: 100.0,
    otherFeeNote: 'ค่าปรับชำระล่าช้าเกินกำหนด 10 วัน',
    grandTotal: 5580.0,
    status: 'overdue',
    dueDate: new Date('2026-08-05')
  });

  console.log('🧾 Invoices seeded (pending, paid, overdue)');

  // 10. Maintenance Requests
  const sampleRequests = [
    // 1. Pending for Somkiat (Room B201)
    {
      roomId: roomB201.id,
      tenantId: tenantSomkiat.id,
      buildingId: buildingB.id,
      title: 'ก๊อกน้ำอ่างล้างหน้ารั่วซึม',
      description: 'มีน้ำหยดติ๋งๆ ตลอดเวลาปิดไม่สนิท น้ำซึมลงใต้เคาน์เตอร์',
      imageUrl: null,
      photoUrl: null,
      technicianName: null,
      repairCost: 0,
      adminNote: 'รับเรื่องแล้ว จัดคิวช่างตรวจเช็คช่วงบ่ายครับ',
      status: 'pending'
    },
    // 2. In Progress for Somkiat (Room B201)
    {
      roomId: roomB201.id,
      tenantId: tenantSomkiat.id,
      buildingId: buildingB.id,
      title: 'เครื่องปรับอากาศไม่เย็น มีลมร้อนออกมา',
      description: 'เปิดแอร์ 24 องศาแล้วห้องยังร้อน คอมเพรสเซอร์ตัดบ่อย มีเสียงฮึ่มๆ',
      imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80',
      photoUrl: null,
      technicianName: 'ช่างสมชาย (แอร์เซอร์วิส)',
      repairCost: 0,
      adminNote: 'นัดช่างแอร์เข้าตรวจเช็คแรงดันน้ำยาแอร์และแผงคอยล์เย็น วันพรุ่งนี้ 10:00 น.',
      status: 'in_progress'
    },
    // 3. Resolved for Somkiat (Room B201)
    {
      roomId: roomB201.id,
      tenantId: tenantSomkiat.id,
      buildingId: buildingB.id,
      title: 'ลูกบิดประตูด้านในล็อคฝืดและไขติดขัด',
      description: 'ลูกบิดประตูระเบียงบิดยากมาก เกรงว่าจะติดอยู่ในระเบียง',
      imageUrl: null,
      photoUrl: null,
      technicianName: 'ช่างวิชัย',
      repairCost: 350.0,
      adminNote: 'ช่างได้ทำการเปลี่ยนตลับลูกบิดประตูสแตนเลสตัวใหม่ให้เรียบร้อยแล้ว ทดสอบการใช้งานปกติ',
      status: 'resolved',
      resolvedAt: new Date('2026-08-27T14:30:00Z')
    },
    // 4. Resolved for Somkiat (Room B201)
    {
      roomId: roomB201.id,
      tenantId: tenantSomkiat.id,
      buildingId: buildingB.id,
      title: 'ท่อน้ำทิ้งใต้อ่างล้างจานตัน น้ำระบายช้ามาก',
      description: 'ล้างจานแล้วน้ำเอ่อขึ้นมา ไหลลงท่อช้ามาก',
      imageUrl: null,
      photoUrl: null,
      technicianName: 'ช่างวิชัย',
      repairCost: 200.0,
      adminNote: 'ลอกสิ่งอุดตันใน Trap ดักกลิ่นและทำความสะอาดท่อเรียบร้อย',
      status: 'resolved',
      resolvedAt: new Date('2026-08-20T11:00:00Z')
    },
    // 5. In Progress for Kanda (Room A101)
    {
      roomId: roomA101.id,
      tenantId: tenantKanda.id,
      buildingId: buildingA.id,
      title: 'หลอดไฟระเบียงและพัดลมดูดอากาศในห้องน้ำดับ',
      description: 'เปิดสวิตช์แล้วไฟไม่ติด พัดลมดูดอากาศไม่หมุน คาดว่าเบรกเกอร์ย่อยอาจทริป',
      imageUrl: null,
      photoUrl: null,
      technicianName: 'ช่างสมหมาย',
      repairCost: 0,
      adminNote: 'ช่างกำลังเบิกหลอด LED และสวิตช์ไปเปลี่ยนให้ครับ',
      status: 'in_progress'
    },
    // 6. Pending for Thanakorn (Room A102)
    {
      roomId: roomA102.id,
      tenantId: tenantThanakorn.id,
      buildingId: buildingA.id,
      title: 'สายฉีดชำระน้ำรั่วจากสายยาง',
      description: 'น้ำพุ่งออกจากสายถักสแตนเลส ต้องปิดวาล์วไว้ก่อน',
      imageUrl: null,
      photoUrl: null,
      technicianName: null,
      repairCost: 0,
      adminNote: 'เตรียมสายฉีดชำระใหม่เข้าไปเปลี่ยนให้พรุ่งนี้เช้าครับ',
      status: 'pending'
    },
    // 7. Resolved for Pimmada (Room A201)
    {
      roomId: roomA201.id,
      tenantId: tenantPimmada.id,
      buildingId: buildingA.id,
      title: 'กระจกบานเลื่อนหน้าต่างฝืด ตกราง',
      description: 'เลื่อนปิดหน้าต่างไม่ได้ ติดขัด',
      imageUrl: null,
      photoUrl: null,
      technicianName: 'ช่างสมหมาย',
      repairCost: 250.0,
      adminNote: 'ปรับตั้งล้อบานเลื่อนและหยอดสารหล่อลื่นเรียบร้อย',
      status: 'resolved',
      resolvedAt: new Date('2026-08-24T16:00:00Z')
    },
    // 8. Cancelled for Siriporn (Room B101)
    {
      roomId: roomB101.id,
      tenantId: tenantSiriporn.id,
      buildingId: buildingB.id,
      title: 'แจ้งซ่อมรีโมทแอร์กดไม่ติด',
      description: 'หน้าจอดับ',
      imageUrl: null,
      photoUrl: null,
      technicianName: null,
      repairCost: 0,
      adminNote: 'ผู้เช่าแจ้งว่าลองเปลี่ยนถ่านใหม่ 2 ก้อนแล้วเปิดติดใช้งานได้ตามปกติ ขอยกเลิกคำร้อง',
      status: 'cancelled'
    }
  ];

  for (const req of sampleRequests) {
    const existing = await prisma.maintenanceRequest.findFirst({
      where: {
        roomId: req.roomId,
        title: req.title
      }
    });
    if (existing) {
      await prisma.maintenanceRequest.update({
        where: { id: existing.id },
        data: req
      });
    } else {
      await prisma.maintenanceRequest.create({
        data: req
      });
    }
  }

  console.log('🔧 Maintenance requests seeded across buildings and statuses');

  // 11. Smart Parcels
  const sampleParcels = [
    // PENDING for Somkiat (Room B201)
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
      status: 'PENDING',
      receivedAt: new Date(Date.now() - 4 * 60 * 60 * 1000)
    },
    // PICKED_UP for Somkiat (Room B201)
    {
      roomId: roomB201.id,
      buildingId: buildingB.id,
      tenantId: tenantSomkiat.id,
      trackingNumber: 'TH0192837465',
      courier: 'Flash Express',
      photoUrl: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=600&q=80',
      status: 'PICKED_UP',
      receivedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      pickedUpAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    },
    // PENDING for Kanda (Room A101)
    {
      roomId: roomA101.id,
      buildingId: buildingA.id,
      tenantId: tenantKanda.id,
      trackingNumber: 'ED987654321TH',
      courier: 'ไปรษณีย์ไทย (EMS)',
      photoUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80',
      status: 'PENDING',
      receivedAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
    }
  ];

  for (const p of sampleParcels) {
    const existing = await prisma.parcel.findFirst({
      where: { trackingNumber: p.trackingNumber }
    });
    if (existing) {
      await prisma.parcel.update({
        where: { id: existing.id },
        data: p
      });
    } else {
      await prisma.parcel.create({ data: p });
    }
  }

  console.log('📦 Smart parcels seeded');

  // 12. Announcements
  const sampleAnnouncements = [
    {
      title: 'แจ้งกำหนดการล้างถังพักน้ำส่วนกลางประจำปี',
      content: 'นิติบุคคลจะทำการล้างทำความสะอาดถังพักน้ำประปาประจำปี ในวันอาทิตย์ที่ 6 กันยายน 2569 เวลา 09:00 - 15:00 น. ช่วงเวลาดังกล่าวจะงดจ่ายน้ำประปาชั่วคราว ขอความกรุณาลูกบ้านทุกท่านสำรองน้ำไว้ใช้ล่วงหน้า ขออภัยในความไม่สะดวกครับ',
      imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80',
      targetType: 'all',
      targetValue: null,
      createdBy: 'Admin Manager',
      buildingId: buildingB.id
    },
    {
      title: 'ขอความร่วมมือคัดแยกขยะและทิ้งในจุดที่กำหนด',
      content: 'เพื่อความสะอาดและสุขอนามัยที่ดีของอาคาร ขอความร่วมมือลูกบ้านทุกท่านช่วยคัดแยกขยะเปียกและขยะรีไซเคิลก่อนนำมาทิ้ง ณ ห้องขยะชั้น 1 พร้อมทั้งมัดปากถุงขยะให้มิดชิด ขอบคุณในความร่วมมือครับ',
      imageUrl: null,
      targetType: 'all',
      targetValue: null,
      createdBy: 'Admin Manager',
      buildingId: buildingB.id
    },
    {
      title: 'แจ้งรอบเวลาเปิด-ปิดประตูอาคารและระบบรักษาความปลอดภัย',
      content: 'เพื่อความปลอดภัยสูงสุดของลูกบ้าน ประตูทางเข้าคีย์การ์ดจะล็อคอัตโนมัติ 24 ชั่วโมง และ รปภ. จะเริ่มตรวจตราความปลอดภัยเข้มงวดตั้งแต่เวลา 22:00 - 05:00 น. หากมีผู้มาติดต่อกรุณาแจ้งนิติบุคคลล่วงหน้า',
      imageUrl: null,
      targetType: 'all',
      targetValue: null,
      createdBy: 'Admin Manager',
      buildingId: buildingA.id
    },
    {
      title: 'ประกาศทำความสะอาดพื้นที่ส่วนกลาง ทางเดินชั้น 2 (อาคาร B)',
      content: 'แม่บ้านจะเข้าทำการขัดล้างพื้นทางเดินส่วนกลางบริเวณชั้น 2 ในวันศุกร์นี้ เวลา 10:00 - 12:00 น. ระวังพื้นลื่น',
      imageUrl: null,
      targetType: 'floor',
      targetValue: '2',
      createdBy: 'Admin Building B',
      buildingId: buildingB.id
    }
  ];

  for (const ann of sampleAnnouncements) {
    const existing = await prisma.announcement.findFirst({
      where: { title: ann.title, buildingId: ann.buildingId }
    });
    if (existing) {
      await prisma.announcement.update({
        where: { id: existing.id },
        data: ann
      });
    } else {
      await prisma.announcement.create({ data: ann });
    }
  }

  console.log('📢 Announcements seeded');

  // 13. Room Invites
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

  console.log('🎟️ Room Invites seeded (INV103, INV102, INV203)');

  console.log('\n🎉 ======================================================= 🎉');
  console.log('   DATABASE SEEDING COMPLETED SUCCESSFULLY!');
  console.log('   - 🏢 Buildings: อาคาร A, อาคาร B (พร้อม PromptPay QR)');
  console.log('   - 🏠 Rooms: 101, 102, 103, 104, 201, 202, 203, 301');
  console.log('   - 👥 Tenants: สมเกียรติ, กานดา, ธนกร, พิมพ์มาดา, วรพล, ศิริพร, อรรถพล');
  console.log(`   - 📱 LIFF User ID linked: ${activeLiffLineUserId} -> สมเกียรติ (ห้อง 201 อาคาร B)`);
  console.log('   - 📜 Lease Contracts & Move-Out History: Active & Ended with Deposit refund');
  console.log('   - ⚡ Meter Records: ค่าน้ำ-ค่าไฟรอบ 07-2026, 08-2026');
  console.log('   - 🧾 Invoices: รอดำเนินการ (Pending), ชำระแล้ว (Paid), เกินกำหนด (Overdue)');
  console.log('   - 🔧 Maintenance: แจ้งซ่อมครบสถานะ (รอดำเนินการ, กำลังซ่อม, ซ่อมเสร็จ, ยกเลิก)');
  console.log('   - 📦 Parcels: Shopee, Kerry, Flash, ไปรษณีย์ไทย (รอรับ / รับแล้ว)');
  console.log('   - 📢 Announcements: ข่าวสารประกาศหอพัก');
  console.log('   - 🎟️ Invite Codes: INV103, INV102, INV203 สำหรับทดสอบผูกห้องใน LIFF');
  console.log('🎉 ======================================================= 🎉\n');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
