import { Module } from "@nestjs/common";
import { InterviewsService } from "../interviews/interviews.service";
import { ApplicationsController } from "./applications.controller";
import { BoardController } from "./board.controller";
import { ApplicationsService } from "./applications.service";
import { OffersService } from "./offers.service";
import { DebriefController } from "./debrief.controller";
import { DebriefService } from "./debrief.service";

@Module({
  controllers: [ApplicationsController, BoardController, DebriefController],
  providers: [ApplicationsService, InterviewsService, OffersService, DebriefService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
