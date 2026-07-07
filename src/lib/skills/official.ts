import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createR2Client, getR2Config } from "@/lib/backup/r2";
import {
  createEmptyOfficialSkillsManifest,
  normalizeOfficialSkillsManifest,
} from "./official-manifest";
export type { OfficialSkillManifest, OfficialSkillManifestItem } from "./official-manifest";

function isMissingKeyError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "NoSuchKey" ||
      error.message.includes("NoSuchKey") ||
      error.message.includes("The specified key does not exist"))
  );
}

export function getOfficialSkillsPrefix() {
  return (process.env.OFFICIAL_SKILLS_R2_PREFIX ?? "official-skills").trim() || "official-skills";
}

export function getOfficialSkillsManifestKey() {
  return `${getOfficialSkillsPrefix().replace(/\/+$/, "")}/manifest.json`;
}

export async function readOfficialSkillsManifestFromR2() {
  const cfg = getR2Config();
  const client = createR2Client();
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: getOfficialSkillsManifestKey(),
      })
    );
    const body = response.Body;
    if (!body) return createEmptyOfficialSkillsManifest();
    const text =
      typeof (body as { transformToString?: () => Promise<string> }).transformToString === "function"
        ? await (body as { transformToString: () => Promise<string> }).transformToString()
        : await new Response(body as BodyInit).text();
    return normalizeOfficialSkillsManifest(JSON.parse(text));
  } catch (error) {
    if (isMissingKeyError(error)) {
      return createEmptyOfficialSkillsManifest();
    }
    throw error;
  }
}

export { createEmptyOfficialSkillsManifest, normalizeOfficialSkillsManifest };

export async function presignOfficialSkillObjectKey(objectKey: string, expiresInSeconds = 15 * 60) {
  const cfg = getR2Config();
  const client = createR2Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: cfg.bucket,
      Key: objectKey,
    }),
    { expiresIn: expiresInSeconds }
  );
}

export async function getSignedOfficialSkillsManifest() {
  const manifest = await readOfficialSkillsManifestFromR2();
  const skills = await Promise.all(
    manifest.skills.map(async (item) => ({
      ...item,
      download_url: await presignOfficialSkillObjectKey(item.object_key),
    }))
  );
  return {
    ...manifest,
    skills,
  };
}
