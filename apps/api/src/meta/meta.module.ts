import { Module } from "@nestjs/common";
import { WorkflowMetaController } from "./workflow.controller";

@Module({
  controllers: [WorkflowMetaController],
})
export class MetaModule {}
