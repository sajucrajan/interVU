import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import { ChannelsController } from "./channels.controller";
import { PerformanceController } from "./performance.controller";
import {
  VendorAnalyticsController,
  VendorSelfAnalyticsController,
} from "./vendor-analytics.controller";

@Module({
  controllers: [
    AnalyticsController,
    PerformanceController,
    ChannelsController,
    VendorAnalyticsController,
    VendorSelfAnalyticsController,
  ],
})
export class AnalyticsModule {}
