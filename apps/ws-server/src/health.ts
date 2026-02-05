import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function healthCheck() {
  try {
    // Test database connection (lightweight)
    await prisma.$queryRaw`SELECT 1`;

    return {
      status: 'healthy',
      database: {
        connected: true,
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
