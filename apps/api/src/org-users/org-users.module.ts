import { Module } from "@nestjs/common";
import { OrgUsersController } from "./org-users.controller";

@Module({
  controllers: [OrgUsersController],
})
export class OrgUsersModule {}
