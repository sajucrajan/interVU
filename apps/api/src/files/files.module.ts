import { Module } from "@nestjs/common";
import { OrgResumeController, VendorResumeController } from "./files.controller";
import { FilesService } from "./files.service";
import { S3Service } from "./s3.service";

@Module({
  controllers: [VendorResumeController, OrgResumeController],
  providers: [S3Service, FilesService],
  exports: [FilesService],
})
export class FilesModule {}
