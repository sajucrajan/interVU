import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

/**
 * Per-request facts that are set once and read far away: the persona the
 * caller acts as, stamped onto every audit row (prisma.service.ts) without
 * threading it through thirty service signatures.
 */
export interface RequestContext {
  persona: string | null;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/** Opens the store for the whole request; the auth guard fills it in. */
export function requestContextMiddleware(_req: Request, _res: Response, next: NextFunction) {
  requestContext.run({ persona: null }, () => next());
}
