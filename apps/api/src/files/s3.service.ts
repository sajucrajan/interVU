import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";

/**
 * S3-compatible object storage (AWS S3, MinIO, R2, GCS-interop, …) — endpoint
 * and credentials via env, no provider assumed. Bucket is created on boot if
 * missing (self-host friendliness).
 */
@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  readonly bucket = process.env.S3_BUCKET ?? "intervu-files";
  readonly enabled = !!process.env.S3_ENDPOINT || !!process.env.AWS_REGION;
  private readonly client = new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: !!process.env.S3_ENDPOINT, // MinIO & friends
    credentials: process.env.S3_ACCESS_KEY
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY,
          secretAccessKey: process.env.S3_SECRET_KEY ?? "",
        }
      : undefined,
  });

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn("S3_ENDPOINT not set — file uploads are disabled");
      return;
    }
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`created bucket ${this.bucket}`);
      } catch (err) {
        this.logger.error(`bucket bootstrap failed: ${(err as Error).message}`);
      }
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /** Short-lived download URL (15 min). */
  presignGet(key: string, filename: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, "")}"`,
      }),
      { expiresIn: 900 },
    );
  }
}
