import { createHash, randomUUID } from "crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import mongoose from "mongoose";
import IdempotencyRecord, { type IIdempotencyRecord } from "../models/IdempotencyRecord";
import { AppError } from "../utils/AppError";
import { runInScope, type IdempotencyScope } from "../utils/idempotencyScope";
import { MESSAGES } from "../utils/messages";

// `Idempotency-Key` on a write (docs/api-reference.md → "Idempotency-Key"). Optional: without
// one the route behaves exactly as before. With one:
//   - first send: the key is claimed, the route runs, and its reply is stored;
//   - same key, same route and body, after it finished: the stored reply, byte for byte;
//   - same key, different route or body: 422 idempotency_mismatch;
//   - same key while the first is still running: 409 idempotency_in_progress, Retry-After.
// Stored: 2xx only. Any other answer releases the key (it can run again), unless the write had
// already committed. A write that committed is never run again: its transaction also
// marked the record (utils/inTransaction), so a retry after a crash between the commit and
// storing the reply gets 200 "already saved" with no data instead of a second write.

/** How long a claim blocks a retry before the retry may take it over (only if nothing committed). */
export const LEASE_MS = 60_000;
const KEY = /^[A-Za-z0-9_-]{1,255}$/;

export const isValidKey = (key: string): boolean => KEY.test(key);

const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        return Object.fromEntries(Object.keys(o).sort().map((k) => [k, canonical(o[k])]));
    }
    return v;
};

/** The same request sent again hashes the same, whatever order its keys come in. */
export const requestHash = (req: { params?: unknown; query?: unknown; body?: unknown }): string =>
    createHash("sha256").update(JSON.stringify(canonical({ params: req.params ?? {}, query: req.query ?? {}, body: req.body ?? null }))).digest("hex");

type Seen = Pick<IIdempotencyRecord, "route" | "bodyHash" | "status" | "committed" | "lockedUntil">;
export type Decision = "mismatch" | "replay" | "busy" | "lost" | "takeover";

/** What to do with a key that already has a record. */
export const decide = (seen: Seen, route: string, hash: string, now: Date): Decision => {
    if (seen.route !== route || seen.bodyHash !== hash) return "mismatch";
    if (seen.status === "done") return "replay";
    if (new Date(seen.lockedUntil) > now) return "busy";
    return seen.committed ? "lost" : "takeover";
};

/** What to keep once the route has answered `status`. */
export const outcomeFor = (status: number, committed: boolean): "store" | "release" | "lost" => {
    const ok = status >= 200 && status < 300;
    if (committed) return ok ? "store" : "lost";
    return ok ? "store" : "release";
};

export const LOST_REPLY = JSON.stringify({ success: true, statusCode: 200, message: MESSAGES.alreadySaved, data: null });

// Test seam for scripts/races/idempotency.race.test.ts: dies after the write committed and
// before the reply is stored. Never in production.
const CRASH_AFTER_COMMIT = process.env.NODE_ENV !== "production" && process.env.IDEMPOTENCY_TEST_CRASH === "after-commit";

const busy = (res: Response, lockedUntil: Date, now: Date) => {
    const seconds = Math.max(1, Math.min(5, Math.ceil((new Date(lockedUntil).getTime() - now.getTime()) / 1000)));
    res.setHeader("Retry-After", String(seconds));
    return new AppError(409, MESSAGES.idempotencyInProgress, { code: "idempotency_in_progress" });
};

const sendStored = (res: Response, statusCode: number, body: string) => {
    res.setHeader("Idempotent-Replayed", "true");
    res.status(statusCode).type("application/json").send(body);
};

const warnNoKey = (req: Request, res: Response, route: string) => {
    console.log(JSON.stringify({
        t: new Date().toISOString(), level: "warn", source: "api", route,
        requestId: res.locals.requestId ?? null, userId: req.user?.userId ?? null, appVersion: req.header("x-app-version") ?? null,
        message: "Money write without an Idempotency-Key",
    }));
};

/** Stores the reply (or releases the key) before it goes out. */
const finish = async (record: { _id: unknown }, scope: IdempotencyScope, statusCode: number, body: string): Promise<void> => {
    scope.finished = true;
    if (scope.committed && CRASH_AFTER_COMMIT) process.exit(70);
    const outcome = outcomeFor(statusCode, scope.committed);
    const mine = { _id: record._id, attempt: scope.attempt };
    if (outcome === "release") {
        await IdempotencyRecord.deleteOne({ ...mine, committed: false });
        return;
    }
    const reply = outcome === "lost" ? { statusCode: 200, body: LOST_REPLY } : { statusCode, body };
    await IdempotencyRecord.updateOne(mine, { $set: { status: "done", ...reply } });
};

/**
 * Route middleware, after `protect` and `validate`. `money` marks a write that moves money, so
 * one sent without a key is logged.
 */
export const withIdempotency = ({ money = false }: { money?: boolean } = {}): RequestHandler =>
    async (req: Request, res: Response, next: NextFunction) => {
        const pattern = req.route?.path === "/" ? "" : req.route?.path ?? "";
        const route = `${req.method} ${req.baseUrl}${pattern}`;
        const key = req.header("idempotency-key");
        if (key === undefined) {
            if (money) warnNoKey(req, res, route);
            return next();
        }
        if (!isValidKey(key)) {
            return next(new AppError(400, MESSAGES.unexpectedField, { code: "invalid_input", issues: [{ path: "Idempotency-Key", message: MESSAGES.unexpectedField }] }));
        }

        const userId = new mongoose.Types.ObjectId(req.user!.userId);
        const bodyHash = requestHash(req);
        let record: { _id: unknown } | null = null;
        const attempt = randomUUID();

        for (let tries = 0; tries < 3 && !record; tries += 1) {
            const now = new Date();
            const lockedUntil = new Date(now.getTime() + LEASE_MS);
            const seen = await IdempotencyRecord.findOne({ userId, key }).lean();
            if (!seen) {
                try {
                    record = await IdempotencyRecord.create({ userId, key, route, bodyHash, status: "in_progress", attempt, lockedUntil, createdAt: now });
                }
                catch (e) {
                    if ((e as { code?: number }).code !== 11000) throw e;
                }
                continue;
            }
            switch (decide(seen, route, bodyHash, now)) {
                case "mismatch":
                    return next(new AppError(422, MESSAGES.idempotencyMismatch, { code: "idempotency_mismatch" }));
                case "replay":
                    return sendStored(res, seen.statusCode ?? 200, seen.body ?? LOST_REPLY);
                case "busy":
                    return next(busy(res, seen.lockedUntil, now));
                case "lost":
                    await IdempotencyRecord.updateOne({ _id: seen._id, status: "in_progress", committed: true }, { $set: { status: "done", statusCode: 200, body: LOST_REPLY } });
                    return sendStored(res, 200, LOST_REPLY);
                case "takeover":
                    record = await IdempotencyRecord.findOneAndUpdate(
                        { _id: seen._id, attempt: seen.attempt, status: "in_progress", committed: false },
                        { $set: { attempt, lockedUntil } },
                        { new: true },
                    ).lean();
            }
        }
        if (!record) return next(busy(res, new Date(Date.now() + 1_000), new Date()));

        const claimed = record;
        const scope: IdempotencyScope = { recordId: claimed._id, attempt, committed: false, finished: false };
        const send = res.json.bind(res);
        res.json = ((body: unknown) => {
            if (scope.finished) return send(body);
            const text = JSON.stringify(body);
            finish(claimed, scope, res.statusCode, text).then(
                () => send(body),
                (e) => {
                    console.error(JSON.stringify({ t: new Date().toISOString(), level: "error", source: "api", route, requestId: res.locals.requestId ?? null, message: `Idempotency record not stored: ${(e as Error).message}` }));
                    send(body);
                },
            );
            return res;
        }) as Response["json"];
        runInScope(scope, () => next());
    };
