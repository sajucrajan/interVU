import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { EntitlementsModule } from "./entitlements/entitlements.module";
import { HealthModule } from "./health/health.module";
import { OrgUnitsModule } from "./org-units/org-units.module";
import { PositionsModule } from "./positions/positions.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SubmissionsModule } from "./submissions/submissions.module";
import { TenancyModule } from "./tenancy/tenancy.module";
import { VendorPortalModule } from "./vendor-portal/vendor-portal.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    TenancyModule,
    EntitlementsModule,
    HealthModule,
    OrgUnitsModule,
    PositionsModule,
    SubmissionsModule,
    VendorPortalModule,
  ],
})
export class AppModule {}
