import { Module } from "@nestjs/common";
import { ApplicationsModule } from "../applications/applications.module";
import { AttributesModule } from "../attributes/attributes.module";
import { InterviewsController } from "./interviews.controller";
import { QuestionsModule } from "../questions/questions.module";
import { RoomService } from "./room.service";
import { InterviewsService } from "./interviews.service";
import { ScorecardReminderService } from "./scorecard-reminder.service";

@Module({
  imports: [QuestionsModule, ApplicationsModule, AttributesModule],
  controllers: [InterviewsController],
  providers: [InterviewsService, RoomService, ScorecardReminderService],
})
export class InterviewsModule {}
