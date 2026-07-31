import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from "@nestjs/common";
import { TENANT_CONTEXT_KEY, type TenantContext } from "./tenant-context";

export const SCOPE_KEY = "intervuRequiredScope";
export type RequiredScope = "org" | "vendor";

/** Route requires an org-side identity. */
export const OrgScope = () => SetMetadata(SCOPE_KEY, "org" satisfies RequiredScope);
/** Route requires a vendor-side identity. */
export const VendorScope = () => SetMetadata(SCOPE_KEY, "vendor" satisfies RequiredScope);

/** Injects the resolved TenantContext into a handler parameter. */
export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const req = ctx.switchToHttp().getRequest();
    return req[TENANT_CONTEXT_KEY] as TenantContext;
  },
);
