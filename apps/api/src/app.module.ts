import { Module } from "@nestjs/common";
import { ApplicationsModule } from "./applications/applications.module";
import { AuthModule } from "./auth/auth.module";
import { CandidatesModule } from "./candidates/candidates.module";
import { EntitlementsModule } from "./entitlements/entitlements.module";
import { HealthModule } from "./health/health.module";
import { InterviewsModule } from "./interviews/interviews.module";
import { OrgUnitsModule } from "./org-units/org-units.module";
import { OrgUsersModule } from "./org-users/org-users.module";
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
    OrgUsersModule,
    PositionsModule,
    SubmissionsModule,
    ApplicationsModule,
    InterviewsModule,
    CandidatesModule,
    VendorPortalModule,
  ],
})
export class AppModule {}
