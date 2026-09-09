const { PrismaClient } = require('@prisma/client');

// Single shared PrismaClient instance for the whole app (avoids exhausting
// the DB connection pool by opening a new client per module).
const prisma = new PrismaClient();

module.exports = prisma;
