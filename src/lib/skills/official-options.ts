import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export type OfficialSkillOption = {
  slug: string;
  name: string;
  summary: string | null;
  tags: string[];
  managedCapabilities: Array<"search" | "crawl">;
  defaultAllowlist: boolean;
  sourceType: "clawhub" | "github" | "manual";
  sourceUrl: string | null;
};

type LocalOfficialSkillMetadata = {
  name?: string;
  summary?: string;
  tags?: string[];
  managed_capabilities?: Array<"search" | "crawl">;
  default_allowlist?: boolean;
  source_type?: "clawhub" | "github" | "manual";
  source_url?: string;
};

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function listLocalOfficialSkillOptions() {
  const root = path.resolve(process.cwd(), "official-skills");
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const options = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map(async (entry) => {
        const metadataPath = path.join(root, entry.name, "official-skill.json");
        let metadata: LocalOfficialSkillMetadata = {};
        try {
          const raw = await readFile(metadataPath, "utf8");
          metadata = JSON.parse(raw) as LocalOfficialSkillMetadata;
        } catch {
          metadata = {};
        }
        return {
          slug: entry.name,
          name:
            typeof metadata.name === "string" && metadata.name.trim()
              ? metadata.name.trim()
              : titleFromSlug(entry.name),
          summary:
            typeof metadata.summary === "string" && metadata.summary.trim()
              ? metadata.summary.trim()
              : null,
          tags: Array.isArray(metadata.tags)
            ? metadata.tags.filter(
                (tag): tag is string => typeof tag === "string" && tag.trim().length > 0
              )
            : [],
          managedCapabilities: Array.isArray(metadata.managed_capabilities)
            ? metadata.managed_capabilities.filter(
                (capability): capability is "search" | "crawl" =>
                  capability === "search" || capability === "crawl"
              )
            : [],
          defaultAllowlist: metadata.default_allowlist === true,
          sourceType:
            metadata.source_type === "clawhub" ||
            metadata.source_type === "github" ||
            metadata.source_type === "manual"
              ? metadata.source_type
              : "manual",
          sourceUrl:
            typeof metadata.source_url === "string" && metadata.source_url.trim()
              ? metadata.source_url.trim()
              : null,
        } satisfies OfficialSkillOption;
      })
  );
  return options.sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function listOfficialSkillOptions() {
  const localOptions = await listLocalOfficialSkillOptions();

  if (
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  ) {
    try {
      const { readOfficialSkillsManifestFromR2 } = await import("./official");
      const manifest = await readOfficialSkillsManifestFromR2();
      if (manifest.skills.length > 0) {
        const merged = new Map(
          manifest.skills.map((item) => [
            item.slug,
            {
              slug: item.slug,
              name: item.name,
              summary: item.summary ?? null,
              tags: item.tags ?? [],
              managedCapabilities: item.managed_capabilities ?? [],
              defaultAllowlist: item.default_allowlist === true,
              sourceType: item.source_type ?? "manual",
              sourceUrl: item.source_url ?? null,
            } satisfies OfficialSkillOption,
          ])
        );

        for (const local of localOptions) {
          if (!merged.has(local.slug)) {
            merged.set(local.slug, local);
          }
        }

        return Array.from(merged.values()).sort((a, b) => a.slug.localeCompare(b.slug));
      }
    } catch {
      // Fall back to the local checked-in official-skills directory for development
      // and pre-publish admin flows.
    }
  }

  return localOptions;
}
