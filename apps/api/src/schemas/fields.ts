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

/** `YYYY-MM`. */
export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** A name a person typed, trimmed. `name("The trip's name")`. */
export const name = (label: string) =>
    z.string({ error: (issue) => (issue.input === undefined ? `${label} is required` : `${label} must be text`) })
        .trim()
        .min(NAME_MIN, `${label} can't be empty`)
        .max(NAME_MAX, `${label} can be at most ${NAME_MAX} characters`);

export const timeZone = z.string().refine(isValidZone, "That time zone isn't recognised");

/** Query paging. Query values arrive as text, hence the coercion. */
export const page = z.coerce.number().int().positive().default(1);
export const limit = (max: number, fallback = 20) => z.coerce.number().int().positive().max(max).default(fallback);
