import { Module } from "@nestjs/common";
import { WorklistController } from "./worklist.controller";

@Module({
  controllers: [WorklistController],
})
export class WorklistModule {}
