import { Controller, Get, Query } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Tells the sign-in page how to ask for the organization. Unauthenticated by
 * necessity, so what it reveals is deliberately operator-controlled via
 * LOGIN_ORG_MODE (docs/05 §1):
 *
 *   auto (default) — one org on the deployment → return it, and the sign-in
 *                    page skips the field entirely. More than one → "manual",
 *                    which enumerates nothing.
 *   picker         — enumerate organizations in a dropdown. Convenient for a
 *                    multi-org install with a soft trust boundary
 *                    (subsidiaries); note it publishes your organization list,
 *                    including to anyone opening the vendor tab.
 *   manual         — always a typed slug, never enumerate, even with one org.
 */
@Controller("auth/login-context")
export class LoginContextController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async context(@Query("kind") kind?: string) {
    const mode = (process.env.LOGIN_ORG_MODE ?? "auto").toLowerCase();
    if (mode === "manual") return { mode: "manual", organizations: [] };

    const organizations = await this.prisma.organization.findMany({
      select: { slug: true, name: true },
      orderBy: { name: "asc" },
      take: 100,
    });

    if (mode === "picker") {
      return { mode: "picker", organizations };
    }
    // auto
    if (organizations.length === 1) {
      return { mode: "single", organizations };
    }
    void kind; // reserved: per-audience policy if operators ask for it
    return { mode: "manual", organizations: [] };
  }
}
