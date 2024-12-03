import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/__tests__/**.test.ts"],
    coverage: {
      provider: "istanbul",
      reporter: ["json-summary", "html", "json"],
      include: ["src/**"],
      exclude: ["src/__tests__/**", "src/dist/**"],
      thresholds: {
        lines: 60
      },
      reportOnFailure: true
    },
    hookTimeout: 30000
  }
});
