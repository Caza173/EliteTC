import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.AWS_REGION || "us-east-1";
let s3: S3Client | null = null;
function getClient(): S3Client {
  if (!s3) s3 = new S3Client({ region });
  return s3;
}

export const DOCUMENTS_BUCKET =
  process.env.S3_DOCUMENTS_BUCKET || "elitetc-documents";

export async function putObject(
  key: string,
  body: Buffer,
  contentType?: string,
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    }),
  );
}

export async function presignedGetUrl(key: string, expiresSeconds = 3600): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: DOCUMENTS_BUCKET, Key: key });
  return getSignedUrl(getClient(), cmd, { expiresIn: expiresSeconds });
}
