import { Module } from "@nestjs/common";
import { ApplicationsModule } from "../applications/applications.module";
import { InterviewsController } from "./interviews.controller";
import { QuestionsModule } from "../questions/questions.module";
import { RoomService } from "./room.service";
import { InterviewsService } from "./interviews.service";

@Module({
  imports: [QuestionsModule, ApplicationsModule],
  controllers: [InterviewsController],
  providers: [InterviewsService, RoomService],
})
export class InterviewsModule {}
