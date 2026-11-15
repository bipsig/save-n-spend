import type { Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "../schemas/z";
import { AppError } from "../utils/AppError";
import { notFound } from "../utils/messages";
import { thingInPath } from "./errorHandler";

type Schemas = { params?: z.ZodType; query?: z.ZodType; body?: z.ZodType };

/** What `validate(schemas)` puts on `req.valid`: `const { body } = req.valid as Valid<typeof s>`. */
export type Valid<S extends Schemas> = {
    params: S["params"] extends z.ZodType ? z.output<S["params"]> : undefined;
    query: S["query"] extends z.ZodType ? z.output<S["query"]> : undefined;
    body: S["body"] extends z.ZodType ? z.output<S["body"]> : undefined;
};

/** An object schema that neither refuses nor keeps unknown keys (zod's default). */
const isDefaultObject = (s: z.ZodType): s is z.ZodObject => s instanceof z.ZodObject && s._zod.def.catchall === undefined;

/**
 * Route middleware that checks the path, query and body before the handler runs, so before any
 * database read. Put it after `protect`. Parsed values go on `req.valid`; `req.query` and
 * `req.body` are left as sent.
 *
 * - Path: any failure answers 404 `not_found` (a malformed id is the same as a missing one).
 * - Query: unknown parameters are dropped, even if the schema is strict.
 * - Body: a missing body is `{}`. An object schema with zod's default (strip) is made strict, so
 *   unknown fields are refused; a `z.looseObject` (backup documents) or an explicit catchall
 *   is left alone. Unions are left alone; give their members `.strict()`.
 */
export const validate = <S extends Schemas>(schemas: S): RequestHandler => {
    const query = schemas.query instanceof z.ZodObject ? schemas.query.strip() : schemas.query;
    const body = schemas.body && isDefaultObject(schemas.body) ? schemas.body.strict() : schemas.body;
    return (req: Request, _res: Response, next: NextFunction) => {
        const valid: Record<string, unknown> = {};
        if (schemas.params) {
            const r = schemas.params.safeParse(req.params);
            if (!r.success) {
                const key = r.error.issues[0]?.path[0];
                const value = typeof key === "string" ? req.params[key] : undefined;
                return next(AppError.notFound(notFound(thingInPath(req.originalUrl, value))));
            }
            valid.params = r.data;
        }
        if (query) {
            const r = query.safeParse(req.query);
            if (!r.success) return next(r.error);
            valid.query = r.data;
        }
        if (body) {
            const r = body.safeParse(req.body ?? {});
            if (!r.success) return next(r.error);
            valid.body = r.data;
        }
        req.valid = valid as Request["valid"];
        next();
    };
};
