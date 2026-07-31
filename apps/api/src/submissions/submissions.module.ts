import { Module } from "@nestjs/common";
import { CandidatesModule } from "../candidates/candidates.module";
import {
  OrgSubmissionsController,
  VendorSubmissionsController,
} from "./submissions.controller";
import { SubmissionsService } from "./submissions.service";

@Module({
  imports: [CandidatesModule], // provides ErasureService (tombstone probe)
  controllers: [VendorSubmissionsController, OrgSubmissionsController],
  providers: [SubmissionsService],
})
export class SubmissionsModule {}
