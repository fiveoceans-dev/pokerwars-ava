import { PrismaClient } from "@prisma/client";
import { logger } from "@hyper-poker/engine/utils/logger";

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient | null {
  if (prisma) return prisma;

  const url = process.env.DATABASE_URL;
  if (!url) {
    logger.warn("DATABASE_URL not set; tournament persistence disabled (using in-memory defaults)");
    return null;
  }

  prisma = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "info", "warn", "error"] : ["warn", "error"],
  });

  return prisma;
}
