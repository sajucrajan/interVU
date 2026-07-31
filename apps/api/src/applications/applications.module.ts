import { Module } from "@nestjs/common";
import { InterviewsService } from "../interviews/interviews.service";
import { ApplicationsController } from "./applications.controller";
import { ApplicationsService } from "./applications.service";

@Module({
  controllers: [ApplicationsController],
  providers: [ApplicationsService, InterviewsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
