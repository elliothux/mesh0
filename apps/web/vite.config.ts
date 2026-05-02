import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = defineConfig({
  plugins: [
    tanstackStart({ client: { entry: "src/main.tsx" } }),
    tailwindcss(),
    viteReact(),
  ],
  server: {
    forwardConsole: {
      logLevels: ["warn", "error"],
      unhandledErrors: true,
    },
  },
});

export default config;
