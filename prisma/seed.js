const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  console.log('🌱 Seeding database with Multi-Building & Fine-Grained Permissions...');

  // 1. Seed Buildings
  let buildingA = await prisma.building.findFirst({ where: { name: 'อาคาร A (Main Building)' } });
  if (!buildingA) {
    buildingA = await prisma.building.create({
      data: {
        name: 'อาคาร A (Main Building)',
        address: '123/1 ถนนสุขุมวิท กรุงเทพมหานคร'
      }
    });
  }

  let buildingB = await prisma.building.findFirst({ where: { name: 'อาคาร B (North Wing)' } });
  if (!buildingB) {
    buildingB = await prisma.building.create({
      data: {
        name: 'อาคาร B (North Wing)',
        address: '123/2 ถนนสุขุมวิท กรุงเทพมหานคร'
      }
    });
  }
  console.log('🏢 Buildings seeded:', buildingA.name, buildingB.name);

  // 2. Seed Building Settings
  await prisma.buildingSetting.upsert({
    where: { buildingId: buildingA.id },
    update: {},
    create: {
      buildingId: buildingA.id,
      phone: '02-123-4567',
      coverImageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80',
      promptpayNum: '0812345678',
      paymentQrUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=600&q=80',
      bankName: 'ธนาคารกสิกรไทย (KBANK)',
      bankAccountName: 'หอพักอาคาร A จำกัด',
      bankAccountNo: '123-4-56789-0',
      paymentNote: 'ชำระภายในวันที่ 5 ของทุกเดือน กรุณาแนบสลิปผ่านทางระบบ LIFF',
      waterRate: 18.00,
      electricRate: 7.00,
      dueDateDay: 5,
      latePenalty: 50.00,
      depositMonths: 2,
      advanceMonths: 1,
      termsAndConditions: '1. ห้ามส่งเสียงดังหลังเวลา 22:00 น.\n2. ห้ามเลี้ยงสัตว์เลี้ยงทุกชนิด\n3. ห้ามสูบบุหรี่ภายในห้องพักและระเบียง'
    }
  });

  await prisma.buildingSetting.upsert({
    where: { buildingId: buildingB.id },
    update: {},
    create: {
      buildingId: buildingB.id,
      phone: '02-987-6543',
      coverImageUrl: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80',
      promptpayNum: '0899998888',
      paymentQrUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=600&q=80',
      bankName: 'ธนาคารไทยพาณิชย์ (SCB)',
      bankAccountName: 'หอพักอาคาร B จำกัด',
      bankAccountNo: '987-6-54321-0',
      paymentNote: 'โอนชำระเงินตามยอดสุทธิในใบแจ้งหนี้',
      waterRate: 20.00,
      electricRate: 8.00,
      dueDateDay: 5,
      latePenalty: 100.00,
      depositMonths: 2,
      advanceMonths: 1,
      termsAndConditions: '1. ห้ามดัดแปลงโครงสร้างห้องพัก\n2. รักษาความสะอาดพื้นที่ส่วนกลาง'
    }
  });
  console.log('⚙️ Building Settings seeded per building with 4 categories');

  // 3. Seed Users & Building Permissions
  const defaultPassword = hashPassword('password123');

  // 3.1 Super Admin (Full Access to all buildings)
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

  // 3.2 Admin for Building A Only
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
    create: {
      userId: adminA.id,
      buildingId: buildingA.id
    }
  });

  // 3.3 Admin for Building B Only
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
    create: {
      userId: adminB.id,
      buildingId: buildingB.id
    }
  });

  console.log('👤 Test Admin Users & Permissions seeded:');
  console.log('   - superadmin@dorm.com (Super Admin -> All Buildings)');
  console.log('   - admin@dorm.com (Super Admin -> All Buildings)');
  console.log('   - admin_building_a@dorm.com (Admin -> Building A Only)');
  console.log('   - admin_building_b@dorm.com (Admin -> Building B Only)');

  // 4. Create Sample Tenant
  let tenant = await prisma.tenant.findFirst({ where: { firstName: 'Somchai', lastName: 'Jaidee' } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        firstName: 'Somchai',
        lastName: 'Jaidee',
        phone: '0812345678',
        idCard: '1100200300401'
      }
    });
  }

  // 5. Create Sample Rooms
  const room101 = await prisma.room.upsert({
    where: { roomNumber: '101' },
    update: { buildingId: buildingA.id, tenantId: tenant.id, status: 'occupied' },
    create: {
      buildingId: buildingA.id,
      roomNumber: '101',
      floor: 1,
      price: 4000.0,
      status: 'occupied',
      tenantId: tenant.id
    }
  });

  const room102 = await prisma.room.upsert({
    where: { roomNumber: '102' },
    update: { buildingId: buildingA.id },
    create: {
      buildingId: buildingA.id,
      roomNumber: '102',
      floor: 1,
      price: 4000.0,
      status: 'available'
    }
  });

  const room201 = await prisma.room.upsert({
    where: { roomNumber: '201' },
    update: { buildingId: buildingB.id },
    create: {
      buildingId: buildingB.id,
      roomNumber: '201',
      floor: 2,
      price: 4500.0,
      status: 'available'
    }
  });

  console.log('🏠 Rooms seeded:', room101.roomNumber, '(Building A),', room102.roomNumber, '(Building A),', room201.roomNumber, '(Building B)');

  // 6. Create Feature Toggles
  const defaultFeatures = [
    { key: 'ENABLE_VEHICLE_MANAGEMENT', description: 'ระบบจัดการป้ายทะเบียนและยานพาหนะลูกบ้าน', isActive: true },
    { key: 'ENABLE_PARCEL_NOTIFY', description: 'ระบบแจ้งเตือนพัสดุมาถึงผ่าน LINE', isActive: true },
    { key: 'ENABLE_MAINTENANCE_REQUEST', description: 'ระบบแจ้งซ่อมแซมและติดตามสถานะ', isActive: true },
    { key: 'ENABLE_LINE_PAYMENT', description: 'ระบบชำระเงินและแนบสลิปผ่าน LIFF', isActive: true }
  ];

  for (const feature of defaultFeatures) {
    await prisma.featureToggle.upsert({
      where: { key: feature.key },
      update: {},
      create: feature
    });
  }
  console.log('🚩 Feature Toggles seeded successfully!');

  console.log('✅ Database seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
