import { Global, Module } from "@nestjs/common";
import { AuthzService } from "./authz.service";
import { PersonaService } from "./persona.service";

@Global()
@Module({
  providers: [AuthzService, PersonaService],
  exports: [AuthzService, PersonaService],
})
export class EntitlementsModule {}
