import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "openclaw/**",
    ".source/**",
    ".open-next/**",
    ".wrangler/**",
    "scripts/**",
    ".claude/**",
    ".codex/**",
    ".agent/**",
    ".agents/**",
    ".system_generated/**",
    "tmp/**",
    "video/**",
    "src/remotion-video/**",
    "public/remotion/**",
    ".e2e-playground/**",
    ".tmp/**",
    ".tmp*/**",
    // Local one-off debugging scripts
    ".tmp*.js",
  ]),
]);

export default eslintConfig;
