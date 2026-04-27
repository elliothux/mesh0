import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  out: "../../apps/api/migrations",
  schema: "./src/schema.ts",
  strict: true,
});
