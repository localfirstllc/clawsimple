import crypto from "node:crypto";

function getKey() {
  const raw =
    (process.env.DEPLOY_SESSION_SECRET_KEY ?? "").trim() ||
    (process.env.DEPLOY_JOB_SECRET_KEY ?? "").trim();
  if (!raw) {
    throw new Error("Missing env: DEPLOY_SESSION_SECRET_KEY");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("DEPLOY_SESSION_SECRET_KEY must be base64-encoded 32 bytes");
  }
  return key;
}

// v1:<iv_b64>:<tag_b64>:<ct_b64>
export function sealSessionSecret(plaintext: string) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function openSessionSecret(sealed: string) {
  const parts = sealed.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid sealed secret");
  }
  const key = getKey();
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ct = Buffer.from(parts[3], "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

