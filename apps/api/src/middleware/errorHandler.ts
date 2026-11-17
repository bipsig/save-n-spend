import "../schemas/z"; // installs the zod error map before any request is parsed
import type { Request, Response, NextFunction } from "express";
import type { ApiErrorCode, ApiIssue } from "@save-n-spend/types";
import { AppError } from "../utils/AppError";
import { MESSAGES, invalidReference, notFound } from "../utils/messages";
import { labelFor } from "../schemas/errorMap";
import { logDebug } from "../utils/logger";

// Every error the API sends has one shape:
//   { success: false, statusCode, code, message, issues?, data: null, requestId }
// `message` is one plain sentence (the 2.6/2.7 apps show only it, plus the status); `code` is
// from the closed ApiErrorCode list; `issues` is there for invalid_input and invalid_reference.
// Library text never gets through: zod issues are already labelled sentences (schemas/z.ts),
// and Mongoose and body-parser errors are mapped here. The request's reference rides on every
// error so "Ref 7K2QXB" in the app finds this request in the log; the real message and, for a
// 500, the stack go to the request logger through res.locals, never to the client.

export type ApiFailure = {
    status: number;
    code: ApiErrorCode;
    message: string;
    issues?: ApiIssue[];
    headers?: Record<string, string>;
    /** For the log only. */
    logMessage?: string;
    /** Library text too detailed for the log; written only at debug level (see logDebug). */
    debugMessage?: string;
    stack?: string;
};

type RequestLike = Pick<Request, "originalUrl"> & { body?: unknown; query?: unknown };

/** The collection segment before an id in the URL → what a person calls it. */
const THING_IN_PATH: Record<string, string> = {
    accounts: "account", categories: "category", category: "category", transactions: "transaction", budgets: "budget",
    bills: "bill", goals: "goal", notifications: "notification", investments: "holding", trips: "trip", expenses: "expense",
};

/** A body or query key that names a record → what the user has of them. */
const THINGS_FOR_KEY: Record<string, string> = {
    account: "accounts", toAccount: "accounts", paidFrom: "accounts", defaultAccount: "accounts",
    person: "people", paidBy: "people", members: "people", letGo: "people",
    toInvestment: "holdings", category: "categories", parent: "categories", transactionIds: "payments",
};
const PEOPLE_LISTS = new Set(["owedBy", "shares", "entries"]);

const segments = (url: string): string[] => url.split("?")[0].split("/").filter(Boolean).map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
});

/** What the id in the URL is: "/api/v1/bills/abc/pay" → "bill". `value` picks which id. */
export const thingInPath = (url: string, value?: string): string => {
    const parts = segments(url);
    const at = value !== undefined ? parts.indexOf(value) : -1;
    if (at > 0) return THING_IN_PATH[parts[at - 1]] ?? "item";
    const known = parts.filter((p) => THING_IN_PATH[p]);
    return THING_IN_PATH[known[known.length - 1]] ?? "item";
};

/** Where a value sits in a body or query, as a key path: ["owedBy", 1, "account"]. */
const findPath = (where: unknown, value: string, at: (string | number)[] = []): (string | number)[] | null => {
    if (typeof where === "string") return where === value ? at : null;
    if (Array.isArray(where)) {
        for (let i = 0; i < where.length; i += 1) { const p = findPath(where[i], value, [...at, i]); if (p) return p; }
        return null;
    }
    if (where && typeof where === "object") {
        for (const [k, v] of Object.entries(where)) { const p = findPath(v, value, [...at, k]); if (p) return p; }
    }
    return null;
};

const thingsFor = (path: (string | number)[]): string | undefined => {
    const keys = path.filter((p): p is string => typeof p === "string");
    const last = keys[keys.length - 1];
    if (last === "account" && keys.some((k) => PEOPLE_LISTS.has(k))) return "people";
    return last ? THINGS_FOR_KEY[last] : undefined;
};

/** The code for an AppError that didn't name one. */
export const defaultCode = (status: number, url: string): ApiErrorCode => {
    if (status === 401) return /\/auth\/(login|change-password)\/?$/.test(url.split("?")[0]) ? "invalid_credentials" : "unauthenticated";
    if (status === 404) return "not_found";
    if (status === 409) return "conflict";
    if (status === 413) return "body_too_large";
    if (status === 429) return "rate_limited";
    if (status >= 500) return "internal";
    return "invalid_input";
};

const BODY_PARSER: Record<string, Pick<ApiFailure, "status" | "code" | "message">> = {
    "entity.parse.failed": { status: 400, code: "invalid_json", message: MESSAGES.invalidJson },
    "encoding.unsupported": { status: 400, code: "invalid_json", message: MESSAGES.invalidJson },
    "charset.unsupported": { status: 400, code: "invalid_json", message: MESSAGES.invalidJson },
    "request.aborted": { status: 400, code: "invalid_json", message: MESSAGES.invalidJson },
    "request.size.invalid": { status: 400, code: "invalid_json", message: MESSAGES.invalidJson },
    "entity.too.large": { status: 413, code: "body_too_large", message: MESSAGES.bodyTooLarge },
    "parameters.too.many": { status: 413, code: "body_too_large", message: MESSAGES.bodyTooLarge },
};

type CastLike = { name: "CastError"; kind?: string; path?: string; value?: unknown };
type ValidatorLike = { name: string; kind?: string; path?: string; properties?: Record<string, unknown> };

/** One Mongoose cast or validator error → an issue, and whether it is a reference. */
const mongooseIssue = (e: CastLike | ValidatorLike, req: RequestLike): { issue: ApiIssue; reference: boolean } => {
    const own = (e.path ?? "").split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p));
    if (e.name === "CastError" && (e.kind === "ObjectId" || e.kind === "ObjectID")) {
        // A Mongoose path like "_id" says nothing; where the client put the value does.
        const value = String((e as CastLike).value ?? "");
        const sent = findPath(req.body, value) ?? findPath(req.query, value) ?? own;
        const message = invalidReference(labelFor(sent), thingsFor(sent));
        return { issue: { path: sent.join("."), message }, reference: true };
    }
    const label = labelFor(own);
    const kind = (e.kind ?? "").toLowerCase();
    const props = (e as ValidatorLike).properties ?? {};
    let message: string;
    if (e.name === "CastError") message = kind === "date" ? `${label} isn't a valid date` : kind === "number" ? `${label} must be a number` : `${label} isn't valid`;
    else if (kind === "required") message = `${label} is required`;
    else if (kind === "min") message = props.min === 0 ? `${label} can't be negative` : `${label} is too small`;
    else if (kind === "max") message = `${label} is too big`;
    else if (kind === "enum") message = `${label} isn't one of the options`;
    else if (kind === "minlength") message = `${label} needs at least ${Number(props.minlength)} characters`;
    else if (kind === "maxlength") message = `${label} can be at most ${Number(props.maxlength)} characters`;
    else if (own[own.length - 1] === "timeZone") message = "That time zone isn't recognised";
    else message = `${label} isn't valid`;
    return { issue: { path: own.join("."), message }, reference: false };
};

/** Any thrown value → what the client is told. Pure, for tests. */
export const toFailure = (err: unknown, req: RequestLike): ApiFailure => {
    const e = err as Record<string, any> | null | undefined;

    if (err instanceof AppError) {
        return { status: err.statusCode, code: err.code ?? defaultCode(err.statusCode, req.originalUrl), message: err.message, ...(err.issues ? { issues: err.issues } : {}) };
    }

    // zod, v3 or v4: both name their error "ZodError". Messages are already sentences.
    if (e?.name === "ZodError" && Array.isArray(e.issues) && e.issues.length) {
        const issues: ApiIssue[] = e.issues.map((i: { path: PropertyKey[]; message: string }) => ({ path: i.path.map(String).join("."), message: i.message }));
        const reference = e.issues[0]?.params?.code === "invalid_reference";
        return { status: 400, code: reference ? "invalid_reference" : "invalid_input", message: issues[0].message, issues };
    }

    // body-parser: broken JSON, too large, bad encoding.
    if (typeof e?.type === "string" && BODY_PARSER[e.type]) {
        return { ...BODY_PARSER[e.type], logMessage: e.message };
    }

    if (e?.name === "CastError") {
        const value = String(e.value ?? "");
        if ((e.kind === "ObjectId" || e.kind === "ObjectID") && value && segments(req.originalUrl).includes(value)) {
            return { status: 404, code: "not_found", message: notFound(thingInPath(req.originalUrl, value)), logMessage: e.message };
        }
        const { issue, reference } = mongooseIssue(e as CastLike, req);
        return { status: 400, code: reference ? "invalid_reference" : "invalid_input", message: issue.message, issues: [issue], logMessage: e.message };
    }

    if (e?.name === "ValidationError" && e.errors && typeof e.errors === "object") {
        const mapped = Object.values(e.errors as Record<string, CastLike | ValidatorLike>).map((x) => mongooseIssue(x, req));
        if (mapped.length) {
            return { status: 400, code: mapped[0].reference ? "invalid_reference" : "invalid_input", message: mapped[0].issue.message, issues: mapped.map((m) => m.issue), logMessage: e.message };
        }
    }

    // A unique index said no. The sentence stays generic until each route names its duplicate.
    // The log gets the same sentence; Mongo's own text (collection, index, key) is debug only.
    if (e?.code === 11000 || e?.code === 11001) {
        return { status: 409, code: "duplicate", message: MESSAGES.duplicateGeneric, debugMessage: e.message };
    }

    return { status: 500, code: "internal", message: MESSAGES.internal, logMessage: e?.message ?? String(err), stack: e?.stack ?? String(err) };
};

/** Sends one error in the standard shape. Also used by the rate limiters and the 404 route. */
export const sendError = (res: Response, f: ApiFailure): void => {
    res.locals.errorMessage = f.logMessage ?? f.message;
    if (f.stack) res.locals.errorStack = f.stack;
    if (f.debugMessage) logDebug({ requestId: res.locals.requestId ?? null, message: f.debugMessage });
    for (const [k, v] of Object.entries(f.headers ?? {})) res.setHeader(k, v);
    if (f.status === 401) res.setHeader("WWW-Authenticate", 'Bearer realm="save-n-spend"');
    res.status(f.status).json({
        success: false,
        statusCode: f.status,
        code: f.code,
        message: f.message,
        ...(f.issues ? { issues: f.issues } : {}),
        data: null,
        requestId: res.locals.requestId ?? null,
    });
};

export const errorHandler = (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) return next(err);
    sendError(res, toFailure(err, req));
};

/** Any path or method no route answers. */
export const routeNotFound = (_req: Request, res: Response): void => {
    sendError(res, { status: 404, code: "route_not_found", message: MESSAGES.routeNotFound });
};
