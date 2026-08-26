import { S3Client, PutObjectCommand, GetObjectCommand, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const BUCKET = process.env.S3_BUCKET || "fsm-documents";

// Used for actual upload/read operations — reaches MinIO over the internal
// Docker network, so it uses the service name ("minio") as configured.
export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: "us-east-1", // MinIO ignores this but the SDK requires a value.
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "",
    secretAccessKey: process.env.S3_SECRET_KEY || "",
  },
});

// Used only to SIGN download URLs that get handed to browsers/phones, which
// can't resolve the internal "minio" hostname. SigV4 signatures encode the
// host, so we can't just swap it after signing — a separate client pointed
// at the externally-reachable endpoint is required. Falls back to
// S3_ENDPOINT if no public endpoint is configured (fine for localhost-only use).
const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT;
const publicS3 = new S3Client({
  endpoint: publicEndpoint,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "",
    secretAccessKey: process.env.S3_SECRET_KEY || "",
  },
});

// Called once at boot; safe to call repeatedly since HeadBucket short-circuits.
export async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }
}

export async function uploadBuffer(params: { buffer: Buffer; contentType: string; prefix: string }) {
  const key = `${params.prefix}/${randomUUID()}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: params.buffer,
      ContentType: params.contentType,
    })
  );
  return key;
}

export async function getSignedDownloadUrl(key: string) {
  return getSignedUrl(publicS3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 3600 });
}
