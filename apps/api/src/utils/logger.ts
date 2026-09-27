import mongoose from "mongoose";
import RequestLog, { type LogSource } from "../models/RequestLog";

// Structured logs: one JSON object per line on stdout (Render's log view searches these), and
// the same entry saved for a week (see models/RequestLog) so it can be looked up later.
//
// Nothing here may throw or slow a request down: a log that can't be written is dropped, and
// the save isn't awaited by anyone.

type Level = "info" | "warn" | "error";

export type LogEntry = {
    source: LogSource;
    route: string;
    requestId?: string | null;
    userId?: string | null;
    status?: number | null;
    durationMs?: number | null;
    message?: string | null;
    stack?: string | null;
    appVersion?: string | null;
};

/** Money out, before anything is written — error messages like "You can only redeem up to
 *  ₹12,000" would otherwise put a balance in the log. Also caps length. */
export const scrub = (text: string | null | undefined, max = 300): string | null => {
    if (!text) return null;
    return text.replace(/₹\s?[\d,]+(\.\d+)?/g, "₹…").slice(0, max);
};

/** The frames that matter from a stack — the error line and where it came from. */
export const shortStack = (stack: string | null | undefined, lines = 6): string | null =>
    stack ? scrub(stack.split("\n").slice(0, lines).join("\n"), 1200) : null;

const levelFor = (entry: LogEntry): Level =>
    entry.stack || (entry.status ?? 0) >= 500 ? "error" : (entry.status ?? 0) >= 400 ? "warn" : "info";

export const log = (entry: LogEntry): void => {
    const clean = {
        ...entry,
        message: scrub(entry.message),
        stack: entry.stack ? shortStack(entry.stack) : null,
    };
    try {
        const line = JSON.stringify({ t: new Date().toISOString(), level: levelFor(entry), ...clean });
        if (levelFor(entry) === "error") console.error(line);
        else console.log(line);
    }
    catch {
        // A value that can't be serialised isn't worth failing over.
    }

    // Saved only once the database is up — during the boot window the line above is all there is.
    if (mongoose.connection.readyState !== 1) return;
    void RequestLog.create({
        ...clean,
        requestId: clean.requestId ?? null,
        userId: clean.userId && mongoose.isValidObjectId(clean.userId) ? clean.userId : null,
        status: clean.status ?? null,
        durationMs: clean.durationMs ?? null,
        appVersion: clean.appVersion ?? null,
    }).catch(() => {
        // Dropped — the stdout line above still has it.
    });
};
