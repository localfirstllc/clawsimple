export type OfficialSkillManifestItem = {
  slug: string;
  name: string;
  version: string;
  object_key: string;
  sha256: string;
  default_allowlist?: boolean;
  summary?: string;
  tags?: string[];
  managed_capabilities?: Array<"search" | "crawl">;
  source_type?: "clawhub" | "github" | "manual";
  source_url?: string;
};

export type OfficialSkillManifest = {
  version: number;
  generated_at: string;
  sync_interval_ms: number;
  skills: OfficialSkillManifestItem[];
};

export const DEFAULT_OFFICIAL_SKILLS_SYNC_INTERVAL_MS = 30 * 60 * 1000;

export function createEmptyOfficialSkillsManifest(): OfficialSkillManifest {
  return {
    version: 1,
    generated_at: new Date(0).toISOString(),
    sync_interval_ms: DEFAULT_OFFICIAL_SKILLS_SYNC_INTERVAL_MS,
    skills: [],
  };
}

export function normalizeOfficialSkillsManifest(raw: unknown): OfficialSkillManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createEmptyOfficialSkillsManifest();
  }
  const manifest = raw as {
    version?: unknown;
    generated_at?: unknown;
    sync_interval_ms?: unknown;
    skills?: unknown;
  };
  const skills = Array.isArray(manifest.skills)
    ? manifest.skills.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const candidate = item as Record<string, unknown>;
        const slug = typeof candidate.slug === "string" ? candidate.slug.trim() : "";
        const name = typeof candidate.name === "string" ? candidate.name.trim() : slug;
        const version = typeof candidate.version === "string" ? candidate.version.trim() : "";
        const objectKey =
          typeof candidate.object_key === "string" ? candidate.object_key.trim() : "";
        const sha256 = typeof candidate.sha256 === "string" ? candidate.sha256.trim() : "";
        if (!slug || !version || !objectKey || !sha256) return [];
        return [
          {
            slug,
            name: name || slug,
            version,
            object_key: objectKey,
            sha256,
            default_allowlist: candidate.default_allowlist === true,
            summary:
              typeof candidate.summary === "string" && candidate.summary.trim()
                ? candidate.summary.trim()
                : undefined,
            tags: Array.isArray(candidate.tags)
              ? candidate.tags.filter(
                  (tag): tag is string => typeof tag === "string" && tag.trim().length > 0
                )
              : undefined,
            managed_capabilities: Array.isArray(candidate.managed_capabilities)
              ? candidate.managed_capabilities.filter(
                  (capability): capability is "search" | "crawl" =>
                    capability === "search" || capability === "crawl"
                )
              : undefined,
            source_type:
              candidate.source_type === "clawhub" ||
              candidate.source_type === "github" ||
              candidate.source_type === "manual"
                ? candidate.source_type
                : undefined,
            source_url:
              typeof candidate.source_url === "string" && candidate.source_url.trim()
                ? candidate.source_url.trim()
                : undefined,
          } satisfies OfficialSkillManifestItem,
        ];
      })
    : [];

  return {
    version:
      typeof manifest.version === "number" && Number.isFinite(manifest.version)
        ? manifest.version
        : 1,
    generated_at:
      typeof manifest.generated_at === "string" && manifest.generated_at.trim()
        ? manifest.generated_at
        : new Date(0).toISOString(),
    sync_interval_ms:
      typeof manifest.sync_interval_ms === "number" && Number.isFinite(manifest.sync_interval_ms)
        ? Math.max(5 * 60 * 1000, Math.floor(manifest.sync_interval_ms))
        : DEFAULT_OFFICIAL_SKILLS_SYNC_INTERVAL_MS,
    skills,
  };
}
