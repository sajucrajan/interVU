import { Module } from "@nestjs/common";
import { InterviewsService } from "../interviews/interviews.service";
import { ApplicationsController } from "./applications.controller";
import { BoardController } from "./board.controller";
import { ApplicationsService } from "./applications.service";

@Module({
  controllers: [ApplicationsController, BoardController],
  providers: [ApplicationsService, InterviewsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
