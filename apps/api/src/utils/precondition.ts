import type { Request } from "express";
import { instant } from "../schemas/fields";
import { AppError } from "./AppError";
import { MESSAGES } from "./messages";

// `If-Match: <updatedAt>` on a PATCH: write only if the record is still as the caller last saw
// it. The app sends it on "Undo" after an edit, with the `updatedAt` its save got back, so an
// undo never overwrites a change made since. Optional: without it a PATCH behaves as it always
// has (2.8.5 and older never send it).

/** The time the header names, or null without one. A header that isn't one ISO instant (an
 *  ETag's quotes are allowed) is a 400 naming `If-Match`. */
export const ifMatch = (req: Request): Date | null => {
    const raw = req.get("If-Match");
    if (raw === undefined) return null;
    const parsed = instant.safeParse(raw.trim().replace(/^"(.*)"$/, "$1"));
    if (!parsed.success) {
        throw new AppError(400, MESSAGES.unexpectedField, { code: "invalid_input", issues: [{ path: "If-Match", message: MESSAGES.unexpectedField }] });
    }
    return parsed.data;
};

export const changedSince = () => new AppError(409, MESSAGES.changedSince, { code: "conflict" });

/** Refuses with 409 `conflict` when `since` is set and the record was written after it. */
export const requireUnchanged = (doc: object, since: Date | null): void => {
    if (since && (doc as { updatedAt?: Date | null }).updatedAt?.getTime() !== since.getTime()) throw changedSince();
};

/** For an update's filter, so the check and the write are one step. */
export const unchangedFilter = (since: Date | null): { updatedAt?: Date } => (since ? { updatedAt: since } : {});
