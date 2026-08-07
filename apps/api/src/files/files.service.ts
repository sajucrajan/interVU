import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { S3Service } from "./s3.service";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Map<string, string>([
  ["application/pdf", ".pdf"],
  ["text/plain", ".txt"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
]);

export interface UploadedResume {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /**
   * `extract_only` reads the resume, keeps the text the matcher needs, and
   * throws the bytes away — no object storage required at all.
   *
   * It exists for deployments with no durable disk (the free demo, docs/11):
   * a container filesystem is wiped on redeploy and on scale-to-zero, so
   * "just write it locally" is not storage, it is a delay before data loss.
   * The cost is that the file itself is gone, so the presigned download in
   * `resumeDownloadUrl` has nothing to hand back.
   *
   * Deliberately opt-in. A real install that lost every CV because an
   * environment variable was unset would be a far worse failure than an
   * upload that refuses.
   */
  private get extractOnly() {
    return process.env.RESUME_STORAGE === "extract_only";
  }

  /** Store a resume for a submission; extracts text for the matcher. */
  async storeResume(
    organizationId: string,
    submissionId: string,
    file: UploadedResume,
  ) {
    if (!this.s3.enabled && !this.extractOnly) {
      throw new ServiceUnavailableException({
        code: "storage_disabled",
        detail: "File storage is not configured (S3_ENDPOINT)",
      });
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException({ code: "file_too_large", max_bytes: MAX_BYTES });
    }
    const ext = ALLOWED.get(file.mimetype);
    if (!ext) {
      throw new BadRequestException({
        code: "unsupported_type",
        detail: "Accepted: PDF, plain text, DOCX",
      });
    }

    const parsedText = await this.extractText(file).catch((err) => {
      this.logger.warn(`text extraction failed: ${(err as Error).message}`);
      return null;
    });

    // With no bytes retained, unextractable text leaves NOTHING behind — the
    // row would record that a resume once existed and hold none of it. Refuse
    // instead, and say which formats do work. (DOCX extraction is still the
    // "later increment" noted in extractText.)
    if (this.extractOnly && !parsedText) {
      throw new BadRequestException({
        code: "text_not_extractable",
        detail:
          "This deployment does not retain uploaded files, and no text could be read from this one. Upload a PDF or plain text file.",
      });
    }

    let key: string | null = null;
    if (!this.extractOnly) {
      key = `resumes/${organizationId}/${submissionId}/${randomUUID()}${ext}`;
      await this.s3.put(key, file.buffer, file.mimetype);
    }

    // One resume per submission: replace metadata if re-uploaded.
    await this.prisma.attachment.deleteMany({
      where: { ownerType: "submission", ownerId: submissionId, kind: "resume" },
    });
    return this.prisma.attachment.create({
      data: {
        organizationId,
        kind: "resume",
        ownerType: "submission",
        ownerId: submissionId,
        s3Key: key,
        filename: file.originalname,
        contentType: file.mimetype,
        size: file.size,
        parsedText,
      },
      select: { id: true, filename: true, size: true, contentType: true },
    });
  }

  async resumeDownloadUrl(organizationId: string, submissionId: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: {
        organizationId,
        ownerType: "submission",
        ownerId: submissionId,
        kind: "resume",
      },
    });
    if (!attachment) throw new NotFoundException("No resume on this submission");
    if (!attachment.s3Key) {
      throw new ServiceUnavailableException({
        code: "bytes_not_retained",
        detail:
          "This deployment reads resumes and discards the file. The extracted text is on the submission; the original is not kept.",
      });
    }
    return {
      filename: attachment.filename,
      url: await this.s3.presignGet(attachment.s3Key, attachment.filename),
    };
  }

  private async extractText(file: UploadedResume): Promise<string | null> {
    if (file.mimetype === "text/plain") {
      return file.buffer.toString("utf8").slice(0, 100_000);
    }
    if (file.mimetype === "application/pdf") {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require("pdf-parse") as (b: Buffer) => Promise<{ text: string }>;
      const parsed = await pdfParse(file.buffer);
      return parsed.text.slice(0, 100_000);
    }
    return null; // docx extraction: later increment
  }
}
