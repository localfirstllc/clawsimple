import { describe, expect, it } from "vitest";
import { normalizeOfficialSkillsManifest } from "./official-manifest";

describe("official skills manifest normalization", () => {
  it("keeps managed capability metadata for supported values", () => {
    const manifest = normalizeOfficialSkillsManifest({
      version: 1,
      generated_at: "2026-04-03T00:00:00.000Z",
      sync_interval_ms: 1800000,
      skills: [
        {
          slug: "daily-ai-briefing",
          name: "Daily AI Briefing",
          version: "2026.04.03.1",
          object_key: "official-skills/daily-ai-briefing/2026.04.03.1.tar.gz",
          sha256: "abc123",
          default_allowlist: true,
          managed_capabilities: ["search", "crawl", "invalid"],
        },
      ],
    });

    expect(manifest.skills).toHaveLength(1);
    expect(manifest.skills[0]?.default_allowlist).toBe(true);
    expect(manifest.skills[0]?.managed_capabilities).toEqual(["search", "crawl"]);
  });
});
