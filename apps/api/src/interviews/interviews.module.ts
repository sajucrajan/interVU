import { Module } from "@nestjs/common";
import { ApplicationsModule } from "../applications/applications.module";
import { InterviewsController } from "./interviews.controller";
import { RoomService } from "./room.service";
import { InterviewsService } from "./interviews.service";

@Module({
  imports: [ApplicationsModule],
  controllers: [InterviewsController],
  providers: [InterviewsService, RoomService],
})
export class InterviewsModule {}
