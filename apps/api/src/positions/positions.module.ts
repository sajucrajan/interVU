import { Module } from "@nestjs/common";
import { PanelsModule } from "../panels/panels.module";
import { PositionsController } from "./positions.controller";
import { PositionsService } from "./positions.service";

@Module({
  imports: [PanelsModule],
  controllers: [PositionsController],
  providers: [PositionsService],
})
export class PositionsModule {}
