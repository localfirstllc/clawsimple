import path from "path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    exclude: [
      ...configDefaults.exclude,
      ".claude/worktrees/**",
    ],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
    },
    // Use happy-dom for React component tests. Pure-logic tests that
    // don't touch DOM imports are unaffected because Vitest only spins
    // up the environment when the transform detects DOM usage.
    environment: "happy-dom",
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        "src/**/__mocks__/**",
        "src/test-setup.ts",
        "src/messages/**",
        "src/assets/**",
        "src/**/*.d.ts",
      ],
      // Thresholds set at current baseline (2026-06-20). Raise as coverage improves.
      // Baseline: 8.90% lines, 7.76% branches, 10.42% functions, 8.87% statements
      // Updated 2026-06-20: +9 new test files added (billing, proxy, API routes)
      thresholds: {
        lines: 8,
        branches: 7,
        functions: 10,
        statements: 8,
      },
    },
  },
});
