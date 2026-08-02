import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import { ChannelsController } from "./channels.controller";
import { PerformanceController } from "./performance.controller";

@Module({
  controllers: [AnalyticsController, PerformanceController, ChannelsController],
})
export class AnalyticsModule {}
