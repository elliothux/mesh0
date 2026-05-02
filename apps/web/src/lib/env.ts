import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  emptyStringAsUndefined: true,
  clientPrefix: "VITE_",
  runtimeEnv: import.meta.env,
  client: {
    VITE_MESH0_API_URL: z.url(),
  },
});
