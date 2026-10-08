import { defineConfig, loadEnv } from "vite";
import path from "path";

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    // Makes TEST_DATABASE_URL from .env available to the isolation test.
    env: loadEnv(mode, process.cwd(), ""),
  },
}));
