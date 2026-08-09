import { Module } from "@nestjs/common";
import { InterviewsService } from "../interviews/interviews.service";
import { ApplicationsController } from "./applications.controller";
import { BoardController } from "./board.controller";
import { ApplicationsService } from "./applications.service";
import { OffersService } from "./offers.service";
import { DebriefController } from "./debrief.controller";
import { DebriefService } from "./debrief.service";
import { ScreeningService } from "./screening.service";
import { QuestionsModule } from "../questions/questions.module";

@Module({
  // InterviewsService is provided here as well as in InterviewsModule, so its
  // dependencies have to be reachable from both.
  imports: [QuestionsModule],
  controllers: [ApplicationsController, BoardController, DebriefController],
  providers: [ApplicationsService, InterviewsService, OffersService, DebriefService, ScreeningService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
