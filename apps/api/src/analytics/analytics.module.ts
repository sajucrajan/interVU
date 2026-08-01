import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import { PerformanceController } from "./performance.controller";

@Module({
  controllers: [AnalyticsController, PerformanceController],
})
export class AnalyticsModule {}
