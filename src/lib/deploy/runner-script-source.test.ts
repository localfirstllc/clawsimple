import { describe, expect, it } from "vitest";
import { getRunnerVersion, getRunnerRevision } from "./runner-script-source";

const SAMPLE_SCRIPT = `
#!/usr/bin/env node
const RUNNER_VERSION = "1.2.3";
const RUNNER_LABEL = "production";

async function main() {
  console.log("Hello from runner v" + RUNNER_VERSION);
}
main();
`;

const SCRIPT_WITHOUT_VERSION = `
#!/usr/bin/env node
console.log("no version here");
`;

describe("getRunnerVersion", () => {
  it("extracts RUNNER_VERSION from script", () => {
    expect(getRunnerVersion(SAMPLE_SCRIPT)).toBe("1.2.3");
  });

  it('returns "unknown" when version not found', () => {
    expect(getRunnerVersion(SCRIPT_WITHOUT_VERSION)).toBe("unknown");
  });

  it("matches versions with single quotes", () => {
    const script = `const RUNNER_VERSION = '2.0.0-beta';`;
    expect(getRunnerVersion(script)).toBe("2.0.0-beta");
  });
});

describe("getRunnerRevision", () => {
  it("returns a 16-char hex string", () => {
    const rev = getRunnerRevision(SAMPLE_SCRIPT);
    expect(rev.length).toBe(16);
    expect(/^[a-f0-9]+$/.test(rev)).toBe(true);
  });

  it("returns different revisions for different scripts", () => {
    const rev1 = getRunnerRevision(SAMPLE_SCRIPT);
    const rev2 = getRunnerRevision(SCRIPT_WITHOUT_VERSION);
    expect(rev1).not.toBe(rev2);
  });

  it("returns the same revision for the same script", () => {
    const rev1 = getRunnerRevision(SAMPLE_SCRIPT);
    const rev2 = getRunnerRevision(SAMPLE_SCRIPT);
    expect(rev1).toBe(rev2);
  });
});
