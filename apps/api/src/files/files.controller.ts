import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthzService } from "../entitlements/authz.service";
import { PrismaService } from "../prisma/prisma.service";
import { OrgScope, Tenant, VendorScope } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { FilesService, type UploadedResume } from "./files.service";

/** Vendor side: attach a resume to their own submission. */
@Controller("vendor/submissions")
@VendorScope()
export class VendorResumeController {
  constructor(
    private readonly files: FilesService,
    private readonly prisma: PrismaService,
  ) {}

  @Post(":id/resume")
  @UseInterceptors(FileInterceptor("file"))
  async upload(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedResume,
  ) {
    const submission = await this.prisma.submission.findFirst({
      where: {
        id,
        organizationId: tenant.vendor!.organizationId,
        vendorOrg: {
          vendorId: tenant.vendor!.vendor.id,
          organizationId: tenant.vendor!.organizationId,
        },
      },
    });
    if (!submission) throw new NotFoundException("Submission not found");
    return this.files.storeResume(submission.organizationId, submission.id, file);
  }
}

/** Org side: presigned download for reviewers/interviewers. */
@Controller("submissions")
@OrgScope()
export class OrgResumeController {
  constructor(
    private readonly files: FilesService,
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  @Get(":id/resume")
  async download(@Tenant() tenant: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    const submission = await this.prisma.submission.findFirst({
      where: { id, organizationId: tenant.org!.organizationId },
      include: { position: { select: { orgUnitId: true } } },
    });
    if (!submission) throw new NotFoundException("Submission not found");
    const access = await this.authz.access(tenant);
    this.authz.require(access, "submissions.view", submission.position.orgUnitId);
    return this.files.resumeDownloadUrl(tenant.org!.organizationId, id);
  }
}
