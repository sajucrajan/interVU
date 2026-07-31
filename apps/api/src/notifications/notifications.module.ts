import { Global, Module } from "@nestjs/common";
import { MailService } from "./mail.service";
import { ReleaseNotifierService } from "./release-notifier.service";

@Global()
@Module({
  providers: [MailService, ReleaseNotifierService],
  exports: [MailService, ReleaseNotifierService],
})
export class NotificationsModule {}
