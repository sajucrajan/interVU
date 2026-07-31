import { Module } from "@nestjs/common";
import { MatchReviewsController } from "./match-reviews.controller";
import { MatchReviewsService } from "./match-reviews.service";

@Module({
  controllers: [MatchReviewsController],
  providers: [MatchReviewsService],
})
export class MatchReviewsModule {}
