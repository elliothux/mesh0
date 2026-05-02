import { z } from "zod";

const appDomainSchema = z
  .string()
  .trim()
  .min(1)
  .transform((domain) => domain.replace(/^\./, "").toLowerCase())
  .refine(
    (domain) =>
      !domain.includes("://") && !domain.includes("/") && !domain.includes(":"),
    { message: "APP_DOMAIN must be a hostname like mesh0.run" },
  );

const envSchema = z.object({
  APP_DOMAIN: appDomainSchema,
  WORKOS_API_KEY: z.string().min(1),
  WORKOS_CLIENT_ID: z.string().min(1),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseAppEnv(env: unknown): AppEnv {
  return envSchema.parse(env);
}
