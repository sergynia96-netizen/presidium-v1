import { Client } from 'minio';

const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: Number(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'presidium',
  secretKey: process.env.MINIO_SECRET_KEY || 'presidium123',
});

const BUCKET = process.env.MINIO_BUCKET || 'presidium-media';

export async function ensureBucket() {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET, process.env.MINIO_REGION || 'us-east-1');
    await minioClient.setBucketPolicy(
      BUCKET,
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${BUCKET}/*`],
          },
        ],
      })
    );
  }
}

export async function generatePresignedUrl(
  objectName: string,
  expirySeconds = 3600
): Promise<string> {
  return minioClient.presignedGetObject(BUCKET, objectName, expirySeconds);
}

export async function generateUploadUrl(
  objectName: string,
  expirySeconds = 300
): Promise<string> {
  return minioClient.presignedPutObject(BUCKET, objectName, expirySeconds);
}

export async function deleteObject(objectName: string) {
  await minioClient.removeObject(BUCKET, objectName);
}
