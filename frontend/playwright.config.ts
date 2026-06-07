import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "https://dukapilot.vercel.app";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
  },
  reporter: [["list"]],
});
