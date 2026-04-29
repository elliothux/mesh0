import { z } from "zod";

const envSchema = z.strictObject({
  WORKOS_API_KEY: z.string().min(1),
  WORKOS_CLIENT_ID: z.string().min(1),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseAppEnv(env: unknown): AppEnv {
  return envSchema.parse(env);
}
