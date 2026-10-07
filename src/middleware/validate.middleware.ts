import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodSchema, ZodTypeDef } from 'zod';

type Target = 'body' | 'query' | 'params';

export function validate<T>(
  schema: ZodSchema<T, ZodTypeDef, unknown>,
  target: Target = 'body',
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const input = req[target];
      const parsed = schema.parse(input);
      if (target === 'query') {
        // Express 5 exposes req.query as a getter-only property, so we cannot
        // reassign it. Mutate the existing object in place instead.
        Object.assign(req.query, parsed);
      } else {
        (req as unknown as Record<string, unknown>)[target] = parsed;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function validateBody<T>(schema: ZodSchema<T, ZodTypeDef, unknown>): RequestHandler {
  return validate(schema, 'body');
}
export function validateQuery<T>(schema: ZodSchema<T, ZodTypeDef, unknown>): RequestHandler {
  return validate(schema, 'query');
}
export function validateParams<T>(schema: ZodSchema<T, ZodTypeDef, unknown>): RequestHandler {
  return validate(schema, 'params');
}
