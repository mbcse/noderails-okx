import type { Request, Response, NextFunction } from "express";
import type { ZodSchema, ZodError } from "zod";

// ────────────────────────────────────────────────────────────
// Zod validation middleware factory
// ────────────────────────────────────────────────────────────

interface ValidationTarget {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

export function validate(schemas: ValidationTarget) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: Record<string, string[]> = {};

    for (const [target, schema] of Object.entries(schemas) as [
      keyof ValidationTarget,
      ZodSchema,
    ][]) {
      if (!schema) continue;

      const result = schema.safeParse(req[target]);
      if (!result.success) {
        const fieldErrors = formatZodErrors(result.error);
        for (const [field, messages] of Object.entries(fieldErrors)) {
          const key = `${target}.${field}`;
          errors[key] = messages;
        }
      } else {
        // Replace with parsed (coerced / defaulted) values.
        // Express 5 makes req.query a getter-only property,
        // so we use Object.defineProperty to override it.
        Object.defineProperty(req, target, {
          value: result.data,
          writable: true,
          configurable: true,
        });
      }
    }

    if (Object.keys(errors).length > 0) {
      res.status(422).json({
        success: false,
        message: "Validation failed",
        errors,
      });
      return;
    }

    next();
  };
}

function formatZodErrors(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_root";
    if (!result[path]) result[path] = [];
    result[path].push(issue.message);
  }
  return result;
}
