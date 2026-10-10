import { Global, Module } from "@nestjs/common";
import { PrismaService, withAuditPersona } from "./prisma.service";

/**
 * PrismaService is injected everywhere by class, so the extended client is
 * provided under that token. The extension only intercepts audit writes;
 * everything else is the plain client, transactions included.
 */
@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: () => withAuditPersona(new PrismaService()) as unknown as PrismaService,
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
