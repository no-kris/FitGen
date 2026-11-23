import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // Only source tests: never the bundles copied into ios/ or android/.
    include: [
      "src/**/*.test.{js,jsx}",
      "api/**/*.test.js",
      "scripts/**/*.test.js",
    ],
    // Component tests opt into jsdom per file with a `// @vitest-environment jsdom`
    // docblock; pure-function tests stay in the default node environment.
  },
});
