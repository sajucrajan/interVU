import { Module } from "@nestjs/common";
import { CandidatesModule } from "../candidates/candidates.module";
import {
  DirectCandidatesController,
  OrgSubmissionsController,
  VendorSubmissionsController,
} from "./submissions.controller";
import { SubmissionsService } from "./submissions.service";

@Module({
  imports: [CandidatesModule], // provides ErasureService (tombstone probe)
  controllers: [VendorSubmissionsController, OrgSubmissionsController, DirectCandidatesController],
  providers: [SubmissionsService],
})
export class SubmissionsModule {}
