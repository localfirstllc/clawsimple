import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getRequiredEnv(name: string) {
  const value = (process.env[name] ?? "").trim();
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

export function getR2Config() {
  return {
    endpoint: getRequiredEnv("R2_ENDPOINT"),
    accessKeyId: getRequiredEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: getRequiredEnv("R2_SECRET_ACCESS_KEY"),
    bucket: getRequiredEnv("R2_BUCKET"),
  };
}

export function createR2Client() {
  const cfg = getR2Config();
  return new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

export async function presignR2UploadUrl(params: {
  key: string;
  expiresInSeconds?: number;
}) {
  const cfg = getR2Config();
  const client = createR2Client();
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: params.key,
    }),
    { expiresIn: params.expiresInSeconds ?? 15 * 60 }
  );
  return { url, bucket: cfg.bucket };
}

export async function presignR2DownloadUrl(params: {
  key: string;
  expiresInSeconds?: number;
}) {
  const cfg = getR2Config();
  const client = createR2Client();
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: cfg.bucket,
      Key: params.key,
    }),
    { expiresIn: params.expiresInSeconds ?? 15 * 60 }
  );
  return { url, bucket: cfg.bucket };
}

