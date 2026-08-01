import { Module } from "@nestjs/common";
import { AnalyticsModule } from "./analytics/analytics.module";
import { ApplicationsModule } from "./applications/applications.module";
import { AuthModule } from "./auth/auth.module";
import { CandidatesModule } from "./candidates/candidates.module";
import { EntitlementsModule } from "./entitlements/entitlements.module";
import { FilesModule } from "./files/files.module";
import { HealthModule } from "./health/health.module";
import { InterviewsModule } from "./interviews/interviews.module";
import { MatchReviewsModule } from "./match-reviews/match-reviews.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { OrgUnitsModule } from "./org-units/org-units.module";
import { OrgUsersModule } from "./org-users/org-users.module";
import { PanelsModule } from "./panels/panels.module";
import { PositionsModule } from "./positions/positions.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SettingsModule } from "./settings/settings.module";
import { SubmissionsModule } from "./submissions/submissions.module";
import { TemplatesModule } from "./templates/templates.module";
import { TenancyModule } from "./tenancy/tenancy.module";
import { VendorPortalModule } from "./vendor-portal/vendor-portal.module";
import { VendorsModule } from "./vendors/vendors.module";
import { WorklistModule } from "./worklist/worklist.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    TenancyModule,
    EntitlementsModule,
    NotificationsModule,
    FilesModule,
    HealthModule,
    OrgUnitsModule,
    OrgUsersModule,
    PositionsModule,
    PanelsModule,
    SettingsModule,
    SubmissionsModule,
    TemplatesModule,
    ApplicationsModule,
    AnalyticsModule,
    InterviewsModule,
    MatchReviewsModule,
    CandidatesModule,
    VendorPortalModule,
    VendorsModule,
    WorklistModule,
  ],
})
export class AppModule {}
