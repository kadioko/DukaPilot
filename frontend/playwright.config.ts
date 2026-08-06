import { defineConfig } from "@playwright/test";

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const productionMode = process.env.PLAYWRIGHT_PRODUCTION === "1";
const localBaseURL = productionMode ? "http://127.0.0.1:3010" : "http://localhost:3010";
const baseURL = externalBaseURL || localBaseURL;

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
  webServer: externalBaseURL ? undefined : {
    command: productionMode ? "npm run start -- -p 3010" : "npm run dev -- -p 3010",
    url: localBaseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
