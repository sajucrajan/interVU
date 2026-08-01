import { Global, Module } from "@nestjs/common";
import { SlaService } from "./sla.service";

@Global()
@Module({
  providers: [SlaService],
  exports: [SlaService],
})
export class SlaModule {}
