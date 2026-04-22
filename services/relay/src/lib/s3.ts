/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 *
 * S3-compatible storage client (MinIO / Selectel / AWS)
 * Presigned URLs for direct-to-storage uploads.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
const region = process.env.S3_REGION || 'us-east-1';
const bucket = process.env.S3_BUCKET || 'presidium';

export const s3 = new S3Client({
  endpoint,
  region,
  credentials: {
    accessKeyId: process.env.S3_KEY || 'presidium',
    secretAccessKey: process.env.S3_SECRET || 'presidium123',
  },
  forcePathStyle: true,
});

export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 300
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function getPresignedDownloadUrl(key: string, expiresIn = 300): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function deleteFromS3(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  await s3.send(command);
}

export function buildPublicUrl(key: string): string {
  const base =
    process.env.S3_PUBLIC_URL || `${endpoint.replace(/\/$/, '')}/${bucket}`;
  return `${base.replace(/\/$/, '')}/${key.replace(/^\/+/, '')}`;
}
