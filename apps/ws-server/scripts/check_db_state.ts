
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkState() {
  console.log("🔍 Checking database state...");
  
  try {
    const templates = await prisma.gameTemplate.findMany();
    console.log(`✅ Found ${templates.length} GameTemplate records.`);
    if (templates.length > 0) {
      console.log("Sample template:", JSON.stringify(templates[0], null, 2));
    } else {
      console.error("❌ No GameTemplate records found!");
    }

    const config = await prisma.systemConfig.findUnique({ where: { id: "default" } });
    if (config) {
      console.log(`✅ SystemConfig found. templatesVersion: ${config.templatesVersion}`);
    } else {
      console.error("❌ SystemConfig record not found!");
    }

  } catch (error) {
    console.error("❌ Database check failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkState();
