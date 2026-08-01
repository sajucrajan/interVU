import { Module } from "@nestjs/common";
import { CandidatesController } from "./candidates.controller";
import { CandidatesService } from "./candidates.service";
import { ErasureService } from "./erasure.service";
import { DossierService } from "./dossier.service";

@Module({
  controllers: [CandidatesController],
  providers: [CandidatesService, ErasureService, DossierService],
  exports: [ErasureService],
})
export class CandidatesModule {}
