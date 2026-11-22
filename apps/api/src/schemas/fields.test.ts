import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "./z";
import { NAME_MAX, NAME_MIN, calendarDay, instant, lenientDate, lenientDateText, limit, money, month, name, objectId, page, positiveMoney, timeZone } from "./fields";
import { styleProblems } from "../utils/messages";

const fail = (schema: z.ZodType, input: unknown) => {
    const r = schema.safeParse(input);
    assert.equal(r.success, false, `expected ${JSON.stringify(input)} to fail`);
    return r.error!.issues;
};
const firstMessage = (schema: z.ZodType, input: unknown) => fail(schema, input)[0].message;

test("objectId: 24 hex chars; a bad or missing one names the label, never the value", () => {
    const id = objectId("The account it goes to", "accounts");
    assert.equal(id.parse("6aa0fcbd0bd274f50c193770"), "6aa0fcbd0bd274f50c193770");
    assert.equal(firstMessage(id, "abc"), "The account it goes to isn't one of your accounts any more. Pick another");
    assert.equal(fail(id, "abc")[0].code, "custom");
    assert.equal((fail(id, "abc")[0] as { params?: { code?: string } }).params?.code, "invalid_reference");
    assert.equal(firstMessage(z.object({ a: id }), {}), "The account it goes to is required");
    assert.equal(firstMessage(objectId("Category"), 5), "Category isn't one of yours any more. Pick another");
});

test("money and positiveMoney are whole paise", () => {
    assert.equal(money.parse(-500), -500);
    assert.equal(firstMessage(z.object({ amount: money }), { amount: 1.5 }), "Amount must be a whole number");
    assert.equal(firstMessage(z.object({ amount: positiveMoney }), { amount: 0 }), "Amount must be more than zero");
    assert.equal(firstMessage(z.object({ amount: positiveMoney }), { amount: "10" }), "Amount must be a number");
});

test("lenientDate and lenientDateText take every date 2.8.5 sends, and refuse null and unreadable text", () => {
    // What 2.8.5 sends: toISOString() for transactions, trip expenses and settle-ups, and a zoned
    // day's midnight (toZonedDayISO) for bills, goals and trips.
    for (const sent of ["2026-11-14T21:41:31.897Z", "2026-11-13T18:30:00.000Z"]) {
        assert.equal(lenientDate.parse(sent).toISOString(), sent);
        assert.equal(lenientDateText.parse(sent), sent);
    }
    // Older forms the 2.6/2.7 apps could send keep working.
    assert.equal(lenientDate.parse("2026-11-14").toISOString(), "2026-11-14T00:00:00.000Z");
    assert.equal(lenientDate.parse(1763156491897).toISOString(), "2025-11-14T21:41:31.897Z");
    assert.equal(lenientDate.safeParse(null).success, false);
    assert.equal(lenientDate.nullable().parse(null), null);
    assert.equal(lenientDate.safeParse("soon").success, false);
    assert.equal(firstMessage(z.object({ occurredAt: lenientDateText }), { occurredAt: "soon" }), "Date isn't a valid date");
});

test("calendarDay, instant and month", () => {
    assert.equal(calendarDay.parse("2026-11-15"), "2026-11-15");
    assert.equal(firstMessage(z.object({ startDate: calendarDay }), { startDate: "2026-02-30" }), "Start date isn't a valid date");
    assert.equal(instant.parse("2026-11-14T21:41:31.897Z").toISOString(), "2026-11-14T21:41:31.897Z");
    assert.equal(instant.parse("2026-11-15T03:11:31+05:30").toISOString(), "2026-11-14T21:41:31.000Z");
    assert.equal(firstMessage(z.object({ occurredAt: instant }), { occurredAt: "yesterday" }), "Date isn't a valid date");
    assert.equal(month.parse("2026-11"), "2026-11");
    assert.equal(firstMessage(z.object({ month }), { month: "2026-13" }), "Month isn't valid");
});

test("name trims and uses the shared limits", () => {
    const n = name("The trip's name");
    assert.equal(n.parse("  Goa  "), "Goa");
    assert.equal(NAME_MIN, 1);
    assert.equal(n.parse("A"), "A");
    assert.equal(firstMessage(n, "   "), "The trip's name can't be empty");
    assert.equal(firstMessage(n, "x".repeat(NAME_MAX + 1)), `The trip's name can be at most ${NAME_MAX} characters`);
    assert.equal(firstMessage(z.object({ name: n }), {}), "The trip's name is required");
});

test("timeZone, page and limit", () => {
    assert.equal(timeZone.parse("Asia/Kolkata"), "Asia/Kolkata");
    assert.equal(firstMessage(timeZone, "Mars/Base"), "That time zone isn't recognised");
    const q = z.object({ page, limit: limit(100) });
    assert.deepEqual(q.parse({}), { page: 1, limit: 20 });
    assert.deepEqual(q.parse({ page: "3", limit: "100" }), { page: 3, limit: 100 });
    assert.equal(firstMessage(q, { page: "0" }), "Page must be more than zero");
    assert.equal(firstMessage(q, { limit: "500" }), "Limit is too big");
    assert.equal(firstMessage(q, { page: "two" }), "Page must be a number");
});

test("every field message follows the style rules", () => {
    const cases: [z.ZodType, unknown][] = [
        [z.object({ toAccount: objectId("The account it goes to", "accounts") }), { toAccount: "x" }],
        [z.object({ amount: positiveMoney }), { amount: -1 }], [z.object({ startDate: calendarDay }), { startDate: "x" }],
        [z.object({ occurredAt: instant }), { occurredAt: "x" }], [z.object({ month }), { month: "x" }],
        [name("Name"), ""], [timeZone, "x"], [z.object({ page }), { page: "-1" }],
    ];
    for (const [s, input] of cases) for (const i of fail(s, input)) assert.deepEqual(styleProblems(i.message), [], i.message);
});

test("every name a person types takes 1 to NAME_MAX characters (gaps row 193)", async () => {
    const { createAccountRequest } = await import("./accountSchema");
    const { createCategorySchemas } = await import("./categorySchema");
    const { createBillSchemas } = await import("./billSchema");
    const { createTripSchemas } = await import("./tripSchema");
    const bodies: [z.ZodType, Record<string, unknown>][] = [
        [createAccountRequest.body, { type: "person", startingBalance: 0 }],
        [createCategorySchemas.body, { kind: "expense" }],
        [createBillSchemas.body, { amount: 100, dueDate: "2026-12-01T00:00:00.000Z" }],
        [createTripSchemas.body, { startDate: "2026-12-01T00:00:00.000Z", endDate: "2026-12-02T00:00:00.000Z", members: [] }],
    ];
    for (const [schema, rest] of bodies) {
        assert.equal(schema.safeParse({ ...rest, name: "A" }).success, true, JSON.stringify(schema.safeParse({ ...rest, name: "A" }).error?.issues));
        assert.equal(schema.safeParse({ ...rest, name: "x".repeat(NAME_MAX) }).success, true);
        const long = schema.safeParse({ ...rest, name: "x".repeat(NAME_MAX + 1) });
        assert.deepEqual(long.error?.issues.map((i) => i.path.join(".")), ["name"]);
    }
});
