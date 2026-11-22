import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { validate } from "../middleware/validate";
import { toFailure } from "../middleware/errorHandler";
import { MESSAGES, styleProblems } from "../utils/messages";
import { changePasswordSchemas, loginSchemas, registerSchemas } from "./authSchema";
import { updateMeSchemas } from "./userSchema";
import { categoryIdSchemas, createCategorySchemas, reorderCategoriesSchemas, updateCategorySchemas } from "./categorySchema";
import { restoreSchemas } from "./backupSchema";
import { clientErrorSchemas } from "./diagnosticsSchema";
import { dashboardSummarySchemas } from "./dashboardSchema";
import { categoryInsightsSchemas, insightsSchemas } from "./insightsSchema";
import { reviewSchemas } from "./reviewSchema";
import { highlightHistorySchemas } from "./highlightSchema";

// Every body and query the 2.6.0 app (01efb7c) sends to sign-in, users, categories, backup,
// diagnostics, dashboard, insights, reviews and highlights, through validate() exactly as the
// routes run it (so default objects are strict). None may be refused.

const ID = "65a1b2c3d4e5f60718293a4b";
const ID2 = "65a1b2c3d4e5f60718293a4c";

type Parts = { params?: unknown; query?: unknown; body?: unknown; url?: string };
const run = (schemas: Parameters<typeof validate>[0], parts: Parts) => new Promise<{ err: unknown; req: Request }>((resolve) => {
    const req = { params: parts.params ?? {}, query: parts.query ?? {}, body: parts.body, originalUrl: parts.url ?? "/api/v1/x" } as Request;
    validate(schemas)(req, {} as Response, (err?: unknown) => resolve({ err, req }));
});
const accepts = async (schemas: Parameters<typeof validate>[0], parts: Parts) => {
    const { err, req } = await run(schemas, parts);
    assert.equal(err, undefined, `refused ${JSON.stringify(parts)}: ${JSON.stringify(err && toFailure(err, { originalUrl: parts.url ?? "/x" }))}`);
    return req.valid as { params?: any; query?: any; body?: any };
};
const refuses = async (schemas: Parameters<typeof validate>[0], parts: Parts) => {
    const { err } = await run(schemas, parts);
    assert.ok(err, `accepted ${JSON.stringify(parts)}`);
    const f = toFailure(err, { originalUrl: parts.url ?? "/api/v1/x", body: parts.body, query: parts.query });
    assert.deepEqual(styleProblems(f.message), [], f.message);
    return f;
};

test("sign-in bodies the app sends are accepted", async () => {
    await accepts(registerSchemas, { body: { name: "Sagnik", email: "s@example.test", password: "longenough", timeZone: "Asia/Kolkata" } });
    await accepts(loginSchemas, { body: { email: "s@example.test", password: "longenough" } });
    await accepts(changePasswordSchemas, { body: { currentPassword: "longenough", newPassword: "longerstill" } });
});

test("a short password at sign-in passes the schema, so it gets the same 401 as any wrong one", async () => {
    await accepts(loginSchemas, { body: { email: "s@example.test", password: "short" } });
});

test("sign-up keeps its 2-character name rule and reads the fixed wording", async () => {
    const short = await refuses(registerSchemas, { body: { name: "A", email: "s@example.test", password: "longenough" } });
    assert.deepEqual([short.status, short.code, short.message], [400, "invalid_input", "Name needs at least 2 characters"]);
    const pw = await refuses(registerSchemas, { body: { name: "Sagnik", email: "s@example.test", password: "short" } });
    assert.equal(pw.message, "Password needs at least 8 characters");
    const email = await refuses(registerSchemas, { body: { name: "Sagnik", email: "nope", password: "longenough" } });
    assert.equal(email.message, "Enter a valid email");
    const zone = await refuses(registerSchemas, { body: { name: "Sagnik", email: "s@example.test", password: "longenough", timeZone: "Mars/Base" } });
    assert.equal(zone.message, "That time zone isn't recognised");
    const extra = await refuses(registerSchemas, { body: { name: "Sagnik", email: "s@example.test", password: "longenough", admin: true } });
    assert.equal(extra.message, MESSAGES.unexpectedField);
});

test("every PATCH /users/me the app sends is accepted", async () => {
    const bodies = [
        { pushToken: "ExponentPushToken[abc]" }, { pushToken: null }, { name: "Guard Runner Two" },
        { prefs: { defaultAccount: ID } }, { prefs: { defaultAccount: null } }, { prefs: { timeZone: "Asia/Kolkata" } },
        { prefs: { notifications: { dailySummary: true } } }, { prefs: { notifications: { enabled: false } } },
        { prefs: { notifications: { billReminderLead: 7 } } }, { prefs: { notifications: { investmentReminderDay: 28 } } },
        { prefs: { notifications: { budgetAlerts: false, goalMilestones: true, weeklySummary: true, monthlySummary: false, investmentReminder: true } } },
    ];
    for (const body of bodies) await accepts(updateMeSchemas, { body });
});

test("PATCH /users/me: a malformed default account is a reference, not a field-name error", async () => {
    const f = await refuses(updateMeSchemas, { body: { prefs: { defaultAccount: "abc" } } });
    assert.deepEqual([f.status, f.code], [400, "invalid_reference"]);
    assert.equal(f.message, "The default account isn't one of your accounts any more. Pick another");
    const lead = await refuses(updateMeSchemas, { body: { prefs: { notifications: { billReminderLead: 2 } } } });
    assert.equal(lead.code, "invalid_input");
});

test("category bodies the app sends are accepted", async () => {
    await accepts(createCategorySchemas, { body: { name: "Guard Pets", kind: "expense", icon: "paw", color: "amber" } });
    await accepts(createCategorySchemas, { body: { name: "Guard Vet", kind: "expense", icon: "paw", color: "amber", parent: ID } });
    await accepts(updateCategorySchemas, { params: { id: ID }, body: { name: "Guard Crafts", icon: "star", color: "rose" } });
    await accepts(reorderCategoriesSchemas, { body: { ids: [ID, ID2] } });
});

test("category faults: malformed parent is a reference, malformed path id is 404, blank name is refused", async () => {
    const parent = await refuses(createCategorySchemas, { body: { name: "X", kind: "expense", parent: "nope" } });
    assert.deepEqual([parent.status, parent.code, parent.message], [400, "invalid_reference", "Parent category isn't one of your categories any more. Pick another"]);
    const path = await refuses(categoryIdSchemas, { params: { id: "abc" }, url: "/api/v1/categories/abc" });
    assert.deepEqual([path.status, path.code, path.message], [404, "not_found", "That category doesn't exist any more"]);
    const blank = await refuses(createCategorySchemas, { body: { name: "   ", kind: "expense" } });
    assert.equal(blank.message, "Name can't be empty");
});

/** A file as GET /backup writes it (and, without trips, as it did before trips existed). */
const backupFile = (withTrips: boolean) => ({
    version: 1,
    exportedAt: "2026-11-14T10:00:00.000Z",
    preferences: { currency: "INR", timeZone: "Asia/Kolkata", notifications: { enabled: true, billReminderLead: 3 }, defaultAccount: ID },
    accounts: [{ _id: ID, userId: ID2, name: "Cash", type: "cash", balance: 0, startingBalance: 0, isArchived: false, __v: 0 }],
    categories: [{ _id: ID2, userId: ID2, name: "Food", kind: "expense", parent: null, isArchived: false, order: 0 }],
    transactions: [], budgets: [], bills: [], goals: [],
    ...(withTrips ? { trips: [], tripExpenses: [] } : {}),
});

test("restore accepts a backup file of either age plus confirm, and keeps every document field", async () => {
    for (const withTrips of [true, false]) {
        const valid = await accepts(restoreSchemas, { body: { ...backupFile(withTrips), confirm: true } });
        assert.equal(valid.body.accounts[0].__v, 0, "document fields stay as exported");
        assert.equal(valid.body.accounts[0].name, "Cash");
    }
});

test("restore refuses a file that isn't a backup with one sentence", async () => {
    const alone = await refuses(restoreSchemas, { body: { confirm: true } });
    assert.equal(alone.message, "That doesn't look like a Save n Spend backup file");
    const badId = await refuses(restoreSchemas, { body: { ...backupFile(true), accounts: [{ _id: "x" }], confirm: true } });
    assert.equal(badId.message, "That doesn't look like a Save n Spend backup file");
    const noConfirm = await refuses(restoreSchemas, { body: backupFile(true) });
    assert.equal(noConfirm.status, 400);
});

test("restore accepts only INR", async () => {
    const file = backupFile(true);
    const usd = await refuses(restoreSchemas, { body: { ...file, preferences: { ...file.preferences, currency: "USD" }, confirm: true } });
    assert.equal(usd.message, "That doesn't look like a Save n Spend backup file");
});

test("the crash report the app sends is accepted", async () => {
    await accepts(clientErrorSchemas, { body: { message: "boom", stack: "Error: boom\n at x", screen: "/settings", requestId: "7K2QXB", appVersion: "2.6.0" } });
    await accepts(clientErrorSchemas, { body: { message: "boom" } });
});

test("dashboard, insights, review and highlight queries the app sends are accepted, extras dropped", async () => {
    await accepts(dashboardSummarySchemas, { query: {} });
    await accepts(dashboardSummarySchemas, { query: { since: "2026-11-13T10:00:00.000Z", month: "2026-11" } });
    for (const query of [{ period: "month", offset: "0" }, { period: "day", offset: "0" }, { period: "week", offset: "-1" }, { period: "year", offset: "0" }]) {
        await accepts(insightsSchemas, { query });
    }
    const cat = await accepts(categoryInsightsSchemas, { params: { id: ID }, query: { period: "month", offset: "0" } });
    assert.deepEqual(cat.query, { period: "month", offset: 0 });
    await accepts(reviewSchemas, { query: { period: "month", offset: "-1" } });
    await accepts(reviewSchemas, { query: { period: "week", offset: "-1" } });
    const h = await accepts(highlightHistorySchemas, { query: { page: "1", limit: "20", utm: "x" } });
    assert.deepEqual(h.query, { page: 1, limit: 20 });
});

test("bad queries are 400 with plain sentences, never a 500", async () => {
    assert.equal((await refuses(dashboardSummarySchemas, { query: { month: "2026-13" } })).status, 400);
    assert.equal((await refuses(insightsSchemas, { query: { offset: "1" } })).message, "You can't look at a future period");
    assert.equal((await refuses(reviewSchemas, { query: { offset: "0" } })).message, "That period hasn't finished yet");
    assert.equal((await refuses(highlightHistorySchemas, { query: { page: "0" } })).status, 400);
    const cat = await refuses(categoryInsightsSchemas, { params: { id: "trips" }, url: "/api/v1/insights/category/trips" });
    assert.deepEqual([cat.status, cat.code], [404, "not_found"]);
});
