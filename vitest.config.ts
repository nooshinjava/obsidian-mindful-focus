import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The real `obsidian` package ships type definitions only; tests use a small stub.
    alias: { obsidian: fileURLToPath(new URL("./test-support/obsidian-stub.ts", import.meta.url)) },
  },
  test: { include: ["test/**/*.test.ts", "lib/shared/test/**/*.test.ts"], environment: "node" },
});
