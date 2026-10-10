import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { requestContext } from "../tenancy/request-context";

/**
 * Every audit row records which persona the actor was using — "decided as
 * hiring manager" — read from the request store the auth guard fills, so no
 * service has to carry it. Rows written outside a request (sweeps, workers)
 * have no persona, which is also true.
 */
function stampActorPersona<T extends { data?: unknown }>(args: T): T {
  const data = args.data as { actorPersona?: string | null } | undefined;
  if (!data || data.actorPersona !== undefined) return args;
  const persona = requestContext.getStore()?.persona ?? null;
  return persona ? { ...args, data: { ...data, actorPersona: persona } } : args;
}

export function withAuditPersona(client: PrismaClient) {
  return client.$extends({
    query: {
      auditLog: {
        create: ({ args, query }) => query(stampActorPersona(args)),
        createMany: ({ args, query }) =>
          query({
            ...args,
            data: Array.isArray(args.data)
              ? args.data.map((d) => stampActorPersona({ data: d }).data as typeof d)
              : (stampActorPersona({ data: args.data }).data as typeof args.data),
          }),
      },
    },
  });
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

/** The client the application actually uses: PrismaService plus the audit stamp. */
export type AppPrisma = ReturnType<typeof withAuditPersona>;
