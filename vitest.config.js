import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only source tests: never the bundles copied into ios/ or android/.
    include: ["src/**/*.test.{js,jsx}", "api/**/*.test.js"],
    // No tests exist yet. Drop this with the first test so an empty run fails.
    passWithNoTests: true,
  },
});
