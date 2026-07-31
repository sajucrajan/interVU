import { Module } from "@nestjs/common";
import { CandidatesController } from "./candidates.controller";
import { CandidatesService } from "./candidates.service";
import { ErasureService } from "./erasure.service";

@Module({
  controllers: [CandidatesController],
  providers: [CandidatesService, ErasureService],
  exports: [ErasureService],
})
export class CandidatesModule {}
