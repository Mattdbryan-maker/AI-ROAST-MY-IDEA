import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside React Server Components; it's a no-op for unit tests.
      "server-only": fileURLToPath(new URL("./tests/stubs/empty.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Several suites re-import api-helpers after vi.resetModules(); a cold import can take 3-4 s on a busy machine,
    // which made one test flake against the 5 s default (observed once on the unmodified baseline).
    testTimeout: 20_000,
  },
});
