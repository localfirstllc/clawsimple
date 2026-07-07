import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function getRunnerScriptSource() {
  return readFile(
    path.join(process.cwd(), "src/lib/runner/agent-jobs-runner.mjs"),
    "utf8"
  );
}

export function getRunnerVersion(script: string) {
  const match = script.match(/const\s+RUNNER_VERSION\s*=\s*["']([^"']+)["']/);
  return match?.[1] ?? "unknown";
}

export function getRunnerRevision(script: string) {
  return crypto.createHash("sha256").update(script).digest("hex").slice(0, 16);
}
