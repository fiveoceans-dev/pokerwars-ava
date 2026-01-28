import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { prisma } from "@temp/db";
import { healthSchema } from "@temp/shared";

const app = Fastify({ logger: true });

app.register(cors, { origin: true });

app.get("/health", async () => {
  return { ok: true };
});

app.get("/api/health", async () => {
  const payload = healthSchema.parse({ status: "ok" });
  return payload;
});

app.get("/api/users", async () => {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  return { ok: true, users };
});

const envSchema = z.object({
  PORT: z.string().optional(),
});

const env = envSchema.parse(process.env);
const port = Number(env.PORT ?? process.env.API_PORT ?? 8080);

app.listen({ host: "0.0.0.0", port }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
