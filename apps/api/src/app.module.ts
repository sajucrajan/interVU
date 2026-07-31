import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { OrgUnitsModule } from "./org-units/org-units.module";
import { PositionsModule } from "./positions/positions.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TenancyModule } from "./tenancy/tenancy.module";
import { VendorPortalModule } from "./vendor-portal/vendor-portal.module";

@Module({
  imports: [
    PrismaModule,
    TenancyModule,
    HealthModule,
    OrgUnitsModule,
    PositionsModule,
    VendorPortalModule,
  ],
})
export class AppModule {}
