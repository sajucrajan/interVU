import { Injectable, Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";

/**
 * SMTP mail with a console fallback: when SMTP_HOST is unset (fresh dev
 * setups), messages are logged instead of sent — the app never hard-depends
 * on a mail server. Dev: run Mailpit (`docker compose up -d mailpit`) and set
 * SMTP_HOST=localhost SMTP_PORT=1025.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from =
    process.env.SMTP_FROM ?? "InterVU <no-reply@intervu.local>";

  constructor() {
    if (process.env.SMTP_HOST) {
      this.transporter = createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
    } else {
      this.transporter = null;
      this.logger.warn("SMTP_HOST not set — emails will be logged, not sent");
    }
  }

  async send(to: string[], subject: string, text: string): Promise<boolean> {
    if (to.length === 0) return false;
    if (!this.transporter) {
      this.logger.log(`[mail:console] to=${to.join(",")} subject="${subject}"`);
      return true;
    }
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text });
      return true;
    } catch (err) {
      this.logger.error(`mail send failed: ${(err as Error).message}`);
      return false;
    }
  }
}
