import test from "node:test";
import assert from "node:assert/strict";
import { billProblems, createBillSchemas, listBillsSchemas, payBillSchemas, skipBillSchemas, updateBillSchemas } from "./billSchema";
import { contributeGoalSchemas, createGoalSchemas, updateGoalSchemas } from "./goalSchema";
import { createBudgetSchemas, listBudgetsSchemas, updateBudgetSchemas } from "./budgetSchema";
import { listNotificationsSchemas, markAllNotificationsReadSchemas, markNotificationReadSchemas } from "./notificationSchema";
import { dismissRecurringSchemas } from "./recurringSchema";
import { MESSAGES, styleProblems } from "../utils/messages";

type Parser = { safeParse: (v: unknown) => { success: boolean; data?: any; error?: { issues: { message: string; path: PropertyKey[]; params?: any }[] } } };

const ID = "65a1b2c3d4e5f60718293a4b";
const ID2 = "65a1b2c3d4e5f60718293a4c";
const DUE = "2026-11-20T18:30:00.000Z"; // what toZonedDayISO sends

const ok = (schema: Parser, input: unknown) => {
    const r = schema.safeParse(input);
    assert.ok(r.success, `refused ${JSON.stringify(input)}: ${JSON.stringify(r.error?.issues)}`);
    return r.data;
};
const fails = (schema: Parser, input: unknown) => {
    const r = schema.safeParse(input);
    assert.ok(!r.success, `accepted ${JSON.stringify(input)}`);
    for (const i of r.error!.issues) assert.deepEqual(styleProblems(i.message), [], i.message);
    return r.error!.issues;
};

// Bodies read from the 2.6.0 app (01efb7c): EditBillSheet, MarkPaidSheet, add-goal,
// ContributeSheet, BudgetLimitSheet, store/notifications, bills.tsx. Strict bodies must take
// every one of them.
test("every body the 2.6.0 app sends is accepted", () => {
    const monthly = { name: "Rent", amount: 2_000_000, dueDate: DUE, recurring: true, frequency: "monthly", reminderDays: 3, category: ID, toInvestment: null };
    ok(createBillSchemas.body, monthly);
    ok(createBillSchemas.body, { name: "Repair", amount: 50_000, dueDate: DUE, recurring: false, reminderDays: 0, category: ID, toInvestment: null });
    ok(createBillSchemas.body, { ...monthly, name: "SIP", category: null, toInvestment: ID2 });
    ok(createBillSchemas.body, { ...monthly, frequency: "yearly", account: ID2 });
    ok(updateBillSchemas.body, monthly);
    ok(updateBillSchemas.body, { ...monthly, recurring: false, frequency: undefined });
    ok(updateBillSchemas.body, { ...monthly, category: null, toInvestment: ID2 });
    ok(payBillSchemas.body, { account: ID });
    ok(payBillSchemas.body, {});
    ok(skipBillSchemas.body, {});

    ok(createGoalSchemas.body, { name: "Trip", target: 10_000_000, icon: "plane", color: "blue" });
    ok(createGoalSchemas.body, { name: "Trip", target: 10_000_000, icon: "plane", color: "blue", deadline: DUE });
    ok(updateGoalSchemas.body, { name: "Trip", target: 10_000_000, icon: "plane", color: "blue", deadline: null });
    ok(updateGoalSchemas.body, { name: "Trip", target: 10_000_000, icon: "plane", color: "blue", deadline: DUE });
    ok(contributeGoalSchemas.body, { amount: 100_000 });

    ok(createBudgetSchemas.body, { category: ID, month: "2026-11", limit: 500_000 });
    ok(updateBudgetSchemas.body, { limit: 500_000 });
    ok(listBudgetsSchemas.query, {});
    ok(listBudgetsSchemas.query, { month: "2026-10" });

    assert.deepEqual(ok(listNotificationsSchemas.query, { page: "2", limit: "20" }), { page: 2, limit: 20 });
    assert.deepEqual(ok(listNotificationsSchemas.query, {}), { page: 1, limit: 20 });
    ok(markNotificationReadSchemas.body, {});
    ok(markAllNotificationsReadSchemas.body, {});
    ok(dismissRecurringSchemas.body, { key: "netflix|64900" });
    ok(listBillsSchemas.query, {});
    // One NAME_MAX for every name since 2.8.8 (gaps row 193); no stored bill name on dev is near it.
    ok(updateBillSchemas.body, { name: "x".repeat(60) });
    assert.equal(updateBillSchemas.body.safeParse({ name: "x".repeat(61) }).success, false);
});

test("unknown body fields are refused with the update-the-app sentence", () => {
    for (const [schema, body] of [
        [createBillSchemas.body, { name: "Rent", amount: 1, dueDate: DUE, foo: 1 }],
        [payBillSchemas.body, { account: ID, amount: 5 }],
        [skipBillSchemas.body, { dueDate: DUE }],
        [createGoalSchemas.body, { name: "Trip", target: 1, saved: 5 }],
        [contributeGoalSchemas.body, { amount: 1, clientId: "x" }],
        [createBudgetSchemas.body, { category: ID, month: "2026-11", limit: 1, spent: 0 }],
    ] as [Parser, unknown][]) {
        assert.ok(fails(schema, body).some((i) => i.message === MESSAGES.unexpectedField));
    }
});

test("a recurring bill needs a frequency, on create and once an update is applied", () => {
    const issues = fails(createBillSchemas.body, { name: "Rent", amount: 1, dueDate: DUE, recurring: true });
    assert.deepEqual(issues.map((i) => [i.path.join("."), i.message]), [["frequency", "Pick how often this bill repeats"]]);
    assert.deepEqual(billProblems({ recurring: true, frequency: undefined }), [{ path: "frequency", message: "Pick how often this bill repeats" }]);
    assert.deepEqual(billProblems({ recurring: true, frequency: "monthly" }), []);
    assert.deepEqual(billProblems({ recurring: false }), []);
    // The patch alone has no frequency; the stored bill supplies it.
    assert.deepEqual(billProblems({ ...{ recurring: false, frequency: "yearly" }, ...ok(updateBillSchemas.body, { recurring: true }) }), []);
});

test("dates: null and unreadable text are refused for a bill, a goal deadline of null stays null", () => {
    assert.deepEqual(fails(createBillSchemas.body, { name: "Rent", amount: 1, dueDate: null }).map((i) => i.message), ["Due date can't be empty"]);
    assert.deepEqual(fails(createBillSchemas.body, { name: "Rent", amount: 1, dueDate: "soon" }).map((i) => i.message), ["Due date isn't a valid date"]);
    assert.ok(ok(createBillSchemas.body, { name: "Rent", amount: 1, dueDate: "2026-11-20" }).dueDate instanceof Date);

    assert.equal(ok(createGoalSchemas.body, { name: "Trip", target: 1, deadline: null }).deadline, null);
    assert.equal(ok(createGoalSchemas.body, { name: "Trip", target: 1, deadline: DUE }).deadline.toISOString(), DUE);
    assert.equal("deadline" in ok(createGoalSchemas.body, { name: "Trip", target: 1 }), false);
});

test("GET /bills takes every status the list shows", () => {
    for (const status of ["pending", "overdue", "paid"]) assert.equal(ok(listBillsSchemas.query, { status }).status, status);
    fails(listBillsSchemas.query, { status: "late" });
});

test("a malformed id in a body is a reference problem, with no id in the sentence", () => {
    const [issue] = fails(createBudgetSchemas.body, { category: "abc", month: "2026-11", limit: 1 });
    assert.equal(issue.message, "Category isn't one of your categories any more. Pick another");
    assert.equal(issue.params?.code, "invalid_reference");
    assert.equal(fails(payBillSchemas.body, { account: "nope" })[0].message, "Account isn't one of your accounts any more. Pick another");
    assert.equal(fails(createBillSchemas.body, { name: "SIP", amount: 1, dueDate: DUE, toInvestment: "x" })[0].message, "Investment isn't one of your holdings any more. Pick another");
});

test("field rules read as sentences", () => {
    assert.ok(fails(contributeGoalSchemas.body, { amount: 0 }).some((i) => i.message === "Amount must be more than zero"));
    assert.ok(fails(contributeGoalSchemas.body, {}).some((i) => i.message === "Amount is required"));
    assert.ok(fails(createGoalSchemas.body, { name: "  ", target: 1 }).some((i) => i.message === "Name can't be empty"));
    assert.ok(fails(createBudgetSchemas.body, { category: ID, month: "May", limit: 1 }).some((i) => i.path[0] === "month"));
    assert.ok(fails(listNotificationsSchemas.query, { page: "0" }).some((i) => i.path[0] === "page"));
    assert.ok(fails(listNotificationsSchemas.query, { limit: "51" }).some((i) => i.message === "Limit is too big"));
    assert.ok(fails(dismissRecurringSchemas.body, { key: "" }).some((i) => i.message === "Suggestion can't be empty"));
});
