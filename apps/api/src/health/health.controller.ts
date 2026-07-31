import { Controller, Get } from "@nestjs/common";

@Controller("healthz")
export class HealthController {
  @Get()
  health() {
    // M0: liveness only. Dependency checks (db/redis/s3) land with those deps.
    return { status: "ok", service: "intervu-api" };
  }
}
