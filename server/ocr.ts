import {
  TextractClient,
  DetectDocumentTextCommand,
} from "@aws-sdk/client-textract";

// AWS Textract for OCR. Region defaults to us-east-1 to match EliteGCI's
// SES region; AWS_REGION env var overrides. Auth uses the default credential
// provider chain (ECS task role in production, ~/.aws/credentials locally).
const region = process.env.AWS_REGION || "us-east-1";
let textract: TextractClient | null = null;
function getClient(): TextractClient {
  if (!textract) textract = new TextractClient({ region });
  return textract;
}

export async function ocrFromBytes(bytes: Buffer): Promise<string> {
  const cmd = new DetectDocumentTextCommand({ Document: { Bytes: bytes } });
  const resp = await getClient().send(cmd);
  const lines = (resp.Blocks ?? [])
    .filter((b) => b.BlockType === "LINE" && b.Text)
    .map((b) => b.Text as string);
  return lines.join("\n");
}

export async function ocrFromS3(bucket: string, key: string): Promise<string> {
  const cmd = new DetectDocumentTextCommand({
    Document: { S3Object: { Bucket: bucket, Name: key } },
  });
  const resp = await getClient().send(cmd);
  const lines = (resp.Blocks ?? [])
    .filter((b) => b.BlockType === "LINE" && b.Text)
    .map((b) => b.Text as string);
  return lines.join("\n");
}
