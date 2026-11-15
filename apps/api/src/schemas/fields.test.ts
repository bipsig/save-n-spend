import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "./z";
import { NAME_MAX, NAME_MIN, calendarDay, instant, limit, money, month, name, objectId, page, positiveMoney, timeZone } from "./fields";
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
