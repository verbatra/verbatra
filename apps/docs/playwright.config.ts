import { defineConfig, devices } from "playwright/test";

const PORT = process.env.E2E_PORT ?? "3107";
const BASE_URL = `http://localhost:${PORT}`;
const IN_CI = process.env.CI !== undefined;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: IN_CI,
  retries: IN_CI ? 1 : 0,
  reporter: IN_CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    reducedMotion: "reduce",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/serve-standalone.mjs",
    url: BASE_URL,
    env: { PORT },
    reuseExistingServer: !IN_CI,
    timeout: 60_000,
  },
});
