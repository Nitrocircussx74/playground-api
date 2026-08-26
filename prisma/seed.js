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
  const tenantUser = await prisma.user.upsert({
    where: { email: 'tenant@dorm.com' },
    update: {},
    create: {
      email: 'tenant@dorm.com',
      passwordHash: hashPassword('password123'),
      name: 'Somchai Jaidee',
      role: 'tenant',
      phone: '0812345678'
    }
  });

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
  console.log('👤 Tenant record seeded:', tenant.firstName, tenant.lastName);

  // 3. Create Sample Rooms
  const room101 = await prisma.room.upsert({
    where: { roomNumber: '101' },
    update: { tenantId: tenant.id, status: 'occupied' },
    create: {
      roomNumber: '101',
      floor: 1,
      price: 4000.0,
      status: 'occupied',
      tenantId: tenant.id
    }
  });

  const room102 = await prisma.room.upsert({
    where: { roomNumber: '102' },
    update: {},
    create: {
      roomNumber: '102',
      floor: 1,
      price: 4000.0,
      status: 'available'
    }
  });

  const room201 = await prisma.room.upsert({
    where: { roomNumber: '201' },
    update: {},
    create: {
      roomNumber: '201',
      floor: 2,
      price: 4500.0,
      status: 'available'
    }
  });

  console.log('🏠 Rooms seeded:', room101.roomNumber, room102.roomNumber, room201.roomNumber);
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
