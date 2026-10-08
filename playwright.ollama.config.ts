import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests of the Ollama path: the real app, the real Ollama client and
 * streaming pipeline, talking HTTP to the mock Ollama server (no model needed).
 * A second app instance is pointed at a model that doesn't exist, to test the
 * failure experience.
 *
 *   npm run build && npm run test:e2e:ollama
 */
const MOCK = 11510;
const APP = 3210;
const APP_BROKEN = 3211;

export default defineConfig({
  testDir: "./e2e-ollama",
  timeout: 120_000,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${APP}`,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `npx tsx scripts/mock-ollama.ts --port ${MOCK} --cps 900 --first-token-ms 400`,
      url: `http://127.0.0.1:${MOCK}/api/version`,
      reuseExistingServer: false,
    },
    {
      command: `npx next start -p ${APP}`,
      url: `http://localhost:${APP}/api/status`,
      reuseExistingServer: false,
      env: { AI_PROVIDER: "ollama", OLLAMA_HOST: `127.0.0.1:${MOCK}`, OLLAMA_MODEL: "mock-qwen" },
    },
    {
      command: `npx next start -p ${APP_BROKEN}`,
      url: `http://localhost:${APP_BROKEN}/api/status`,
      reuseExistingServer: false,
      env: { AI_PROVIDER: "ollama", OLLAMA_HOST: `127.0.0.1:${MOCK}`, OLLAMA_MODEL: "qwen3.5:4b", SHOW_AI_ERRORS: "true" },
    },
  ],
});
