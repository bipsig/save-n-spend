import type { NAME_MIN as SharedNameMin, NAME_MAX as SharedNameMax } from "@save-n-spend/types";
import { z } from "./z";
import { invalidReference } from "../utils/messages";
import { isValidZone } from "../utils/timezone";

// Shared field types for route schemas. Messages come from the error map (labelled by field
// key) unless a field needs its own, like an id or a name.

/** packages/types can't be loaded at runtime (see its "API errors" note), so these mirror it;
 *  the `typeof` types fail the typecheck if the shared values change. */
export const NAME_MIN: typeof SharedNameMin = 1;
export const NAME_MAX: typeof SharedNameMax = 60;

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/**
 * A 24-hex id. In a body or query a bad one is `invalid_reference` (the error handler reads the
 * code from the issue's params); in the path `validate()` answers 404 whatever the issue.
 * `objectId("The account it goes to", "accounts")`.
 */
export const objectId = (label: string, things?: string) =>
    z.string({ error: (issue) => (issue.input === undefined ? `${label} is required` : invalidReference(label, things)) })
        .refine((v) => OBJECT_ID.test(v), { message: invalidReference(label, things), params: { code: "invalid_reference" } });

/** Paise, signed (a credit card's balance is negative). Whole numbers only. */
export const money = z.number().int();
/** Paise, more than zero. */
export const positiveMoney = z.number().int().positive();

/** A calendar day, `YYYY-MM-DD`, as the app's date filters send it. */
export const calendarDay = z.iso.date();

/** A moment, as the app sends it (`Date.toISOString()`); an offset is accepted too. Parsed to a Date. */
export const instant = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

/** A date field the app already sends (bills, goals, trips): any text or number `new Date()`
 *  reads, as before, so every body from 2.8.5 and older still parses; the app sends
 *  `toISOString()`. Parsed to a Date. `null` and unreadable text are refused (`z.coerce.date()`
 *  turned `null` into 1 January 1970). A new field takes `instant` or `calendarDay`. */
export const lenientDate = z.preprocess((v) => (typeof v === "string" || typeof v === "number" ? new Date(v) : v), z.date());

/** A transaction's `occurredAt`: the same rule as `lenientDate`, kept as text (the controller
 *  makes the Date and compares the stored one). */
export const lenientDateText = z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Date isn't a valid date");

/** `YYYY-MM`. */
export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** A name a person typed, trimmed. `name("The trip's name")`. */
export const name = (label: string) =>
    z.string({ error: (issue) => (issue.input === undefined ? `${label} is required` : `${label} must be text`) })
        .trim()
        .min(NAME_MIN, `${label} can't be empty`)
        .max(NAME_MAX, `${label} can be at most ${NAME_MAX} characters`);

export const timeZone = z.string().refine(isValidZone, "That time zone isn't recognised");

/** `trips=entries` asks for the 2.8.6 rule: each closed trip is one expense in Trips on its
 *  close day (services/tripEntries). Absent, a read keeps its 2.8.5 meaning. */
export const tripRuleParam = z.enum(["entries"]).optional();

/** Query paging. Query values arrive as text, hence the coercion. */
export const page = z.coerce.number().int().positive().default(1);
export const limit = (max: number, fallback = 20) => z.coerce.number().int().positive().max(max).default(fallback);
