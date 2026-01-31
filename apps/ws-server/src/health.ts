import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function healthCheck() {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;

    // Test basic table access
    const tableCount = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM pg_tables WHERE schemaname = 'public'
    `;

    // Test user table
    const userCount = await prisma.user.count();

    return {
      status: 'healthy',
      database: {
        connected: true,
        tableCount: Number(tableCount[0].count),
        userCount,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      database: {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }
    };
  } finally {
    await prisma.$disconnect();
  }
}
