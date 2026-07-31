import { Module } from "@nestjs/common";
import { MatchReviewsController } from "./match-reviews.controller";
import { MatchReviewsService } from "./match-reviews.service";
import { RematchSweepService } from "./rematch-sweep.service";

@Module({
  controllers: [MatchReviewsController],
  providers: [MatchReviewsService, RematchSweepService],
})
export class MatchReviewsModule {}
