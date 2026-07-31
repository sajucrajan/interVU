import { Module } from "@nestjs/common";
import { VendorPortalController } from "./vendor-portal.controller";
import { VendorPortalService } from "./vendor-portal.service";

@Module({
  controllers: [VendorPortalController],
  providers: [VendorPortalService],
})
export class VendorPortalModule {}
