import { z } from "zod";

export const healthSchema = z.object({
  status: z.string(),
});

export type HealthPayload = z.infer<typeof healthSchema>;
