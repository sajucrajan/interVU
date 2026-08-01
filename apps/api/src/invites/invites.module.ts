import { Global, Module } from "@nestjs/common";
import { InvitesService } from "./invites.service";

@Global()
@Module({
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
