const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  console.log('🌱 Seeding database according to strict Naming Conventions...');

  // 1. Create Admin User
  const adminPassword = hashPassword('password123');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@dorm.com' },
    update: {},
    create: {
      email: 'admin@dorm.com',
      passwordHash: adminPassword,
      name: 'Admin Manager',
      role: 'admin',
      phone: '0899999999'
    }
  });
  console.log('👤 Admin user seeded:', admin.email);

  // 2. Create Sample Tenant
  const tenantPassword = hashPassword('password123');
  const tenantUser = await prisma.user.upsert({
    where: { email: 'tenant@dorm.com' },
    update: {},
    create: {
      email: 'tenant@dorm.com',
      passwordHash: tenantPassword,
      name: 'Somchai Jaidee',
      role: 'tenant',
      phone: '0812345678'
    }
  });

  const tenant = await prisma.tenant.create({
    data: {
      firstName: 'Somchai',
      lastName: 'Jaidee',
      phone: '0812345678',
      idCard: '1100200300401'
    }
  });
  console.log('👤 Tenant record seeded:', tenant.firstName, tenant.lastName);

  // 3. Create Sample Rooms
  const room101 = await prisma.room.create({
    data: {
      roomNumber: '101',
      floor: 1,
      price: 4000.0,
      status: 'occupied',
      tenantId: tenant.id
    }
  });

  const room102 = await prisma.room.create({
    data: {
      roomNumber: '102',
      floor: 1,
      price: 4000.0,
      status: 'available'
    }
  });

  const room201 = await prisma.room.create({
    data: {
      roomNumber: '201',
      floor: 2,
      price: 4500.0,
      status: 'available'
    }
  });

  console.log('🏠 Rooms seeded:', room101.roomNumber, room102.roomNumber, room201.roomNumber);

  // 4. Create Initial Meter Record for Room 101 (Previous Month: 07-2026)
  await prisma.meterRecord.create({
    data: {
      roomId: room101.id,
      meterType: 'water',
      previousReading: 100.0,
      currentReading: 120.0,
      unitsUsed: 20.0,
      billingCycle: '07-2026',
      recordedAt: new Date('2026-07-25')
    }
  });

  await prisma.meterRecord.create({
    data: {
      roomId: room101.id,
      meterType: 'electric',
      previousReading: 1000.0,
      currentReading: 1150.0,
      unitsUsed: 150.0,
      billingCycle: '07-2026',
      recordedAt: new Date('2026-07-25')
    }
  });

  console.log('📊 Meter records seeded for Room 101');
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
