import { Module } from "@nestjs/common";
import { PanelsModule } from "../panels/panels.module";
import { TemplatesController } from "./templates.controller";
import { TemplatesService } from "./templates.service";

@Module({
  imports: [PanelsModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
