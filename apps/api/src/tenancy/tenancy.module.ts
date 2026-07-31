import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DevAuthGuard } from "./dev-auth.guard";

@Module({
  providers: [{ provide: APP_GUARD, useClass: DevAuthGuard }],
})
export class TenancyModule {}
