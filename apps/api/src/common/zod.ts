import { BadRequestException } from "@nestjs/common";
import type { z, ZodTypeAny } from "zod";

/** Parse a request body against a contracts schema; 400 with issues on failure. */
export function parseBody<S extends ZodTypeAny>(
  schema: S,
  body: unknown,
): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      code: "validation_error",
      issues: result.error.issues,
    });
  }
  return result.data;
}
