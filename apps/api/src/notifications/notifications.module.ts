import { Global, Module } from "@nestjs/common";
import { DeliveriesController } from "./deliveries.controller";
import { DeliveryWorkerService } from "./delivery-worker.service";
import { MailService } from "./mail.service";
import { NotificationsService } from "./notifications.service";
import { ReleaseNotifierService } from "./release-notifier.service";
import { WebhooksController } from "./webhooks.controller";

@Global()
@Module({
  controllers: [WebhooksController, DeliveriesController],
  providers: [
    MailService,
    DeliveryWorkerService,
    NotificationsService,
    ReleaseNotifierService,
  ],
  exports: [MailService, NotificationsService, ReleaseNotifierService],
})
export class NotificationsModule {}
