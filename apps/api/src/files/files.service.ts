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

  /** Store a resume for a submission; extracts text for the matcher. */
  async storeResume(
    organizationId: string,
    submissionId: string,
    file: UploadedResume,
  ) {
    if (!this.s3.enabled) {
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

    const key = `resumes/${organizationId}/${submissionId}/${randomUUID()}${ext}`;
    await this.s3.put(key, file.buffer, file.mimetype);

    const parsedText = await this.extractText(file).catch((err) => {
      this.logger.warn(`text extraction failed: ${(err as Error).message}`);
      return null;
    });

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
