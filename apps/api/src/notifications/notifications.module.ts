import { Global, Module } from "@nestjs/common";
import { MailService } from "./mail.service";
import { NotificationsService } from "./notifications.service";
import { ReleaseNotifierService } from "./release-notifier.service";
import { WebhooksController } from "./webhooks.controller";

@Global()
@Module({
  controllers: [WebhooksController],
  providers: [MailService, NotificationsService, ReleaseNotifierService],
  exports: [MailService, NotificationsService, ReleaseNotifierService],
})
export class NotificationsModule {}
