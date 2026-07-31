import { Module } from "@nestjs/common";
import {
  OrgSubmissionsController,
  VendorSubmissionsController,
} from "./submissions.controller";
import { SubmissionsService } from "./submissions.service";

@Module({
  controllers: [VendorSubmissionsController, OrgSubmissionsController],
  providers: [SubmissionsService],
})
export class SubmissionsModule {}
