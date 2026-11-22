import { before, test } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { PASSWORD, useTestApi, type TestUser } from "../harness";
import { failed } from "./moneyChecks";

// GET /categories/:id, GET /users/me and POST /auth/change-password: the success paths no
// other file reaches. Signed out, other users' ids and unknown fields are in route-matrix.test.ts.

const api = useTestApi();
const INTERNAL = ["__v", "userId", "pushToken", "googleId", "totpEnabled", "authProvider", "deactivatedAt", "password"];
const storedPassword = async (u: TestUser) => (await api.ro.col("users").find<{ password: string }>({ _id: new ObjectId(u.id) }))[0].password;

let me: TestUser;
let other: TestUser;

before(async () => {
    await api.ready();
    me = await api.user("rest-me");
    other = await api.user("rest-other");
});

test("GET /categories/:id: a top-level and a sub-category of yours; archived, another user's and missing are 404", async () => {
    const top = await me.send("POST", "/categories", { name: "Hobbies", kind: "expense", icon: "star", color: "blue" });
    assert.equal(top.status, 201, top.text);
    const child = await me.send("POST", "/categories", { name: "Paints", kind: "expense", parent: top.json.data._id });
    assert.equal(child.status, 201, child.text);

    const r = await me.send("GET", `/categories/${top.json.data._id}`);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.message, "Category fetched");
    assert.deepEqual(r.json.data, top.json.data, "the same record create answered with");
    assert.deepEqual([r.json.data.name, r.json.data.kind, r.json.data.icon, r.json.data.color, r.json.data.isArchived], ["Hobbies", "expense", "star", "blue", false]);
    for (const f of INTERNAL) assert.ok(!(f in r.json.data), `GET /categories/:id sends ${f}`);

    const sub = await me.send("GET", `/categories/${child.json.data._id}`);
    assert.equal(sub.status, 200);
    assert.equal(String(sub.json.data.parent), top.json.data._id);

    const own = await me.category("income");
    assert.equal((await me.send("GET", `/categories/${own}`)).json.data.kind, "income", "a default category from sign-up");

    failed(await other.send("GET", `/categories/${top.json.data._id}`), 404, "not_found", { message: "That category doesn't exist any more" });
    assert.equal((await me.send("DELETE", `/categories/${top.json.data._id}`)).status, 200);
    failed(await me.send("GET", `/categories/${top.json.data._id}`), 404, "not_found", { message: "That category doesn't exist any more" });
    failed(await me.send("GET", `/categories/${child.json.data._id}`), 404, "not_found", { message: "That category doesn't exist any more" });
    failed(await me.send("GET", `/categories/${new ObjectId().toHexString()}`), 404, "not_found");
});

test("PATCH /categories/reorder: a missing or foreign id is invalid_reference naming ids, as accounts' reorder does", async () => {
    const theirs = await other.category("expense");
    const r = await me.send("PATCH", "/categories/reorder", { ids: [await me.category("expense"), theirs] });
    failed(r, 400, "invalid_reference", { path: "ids", message: "A category in the list isn't one of your categories any more. Pick another" });
    const bad = await me.send("PATCH", "/categories/reorder", { ids: ["not-an-id"] });
    failed(bad, 400, "invalid_reference", { path: "ids.0" });
});

test("GET /users/me: the profile, the same as /auth/me, with no internal fields", async () => {
    assert.equal((await me.send("PATCH", "/users/me", { pushToken: "ExponentPushToken[rest-me]", prefs: { notifications: { weeklySummary: true } } })).status, 200);
    const r = await me.send("GET", "/users/me");
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.message, "Profile fetched");
    const d = r.json.data;
    assert.deepEqual([d._id, d.name, d.email, d.prefs.timeZone, d.prefs.notifications.weeklySummary], [me.id, "Test Runner", me.email, "Asia/Kolkata", true]);
    for (const f of INTERNAL) assert.ok(!(f in d), `GET /users/me sends ${f}`);
    const auth = await me.send("GET", "/auth/me");
    assert.equal(auth.json.message, "User fetched");
    assert.deepEqual(auth.json.data, d);
    assert.equal((await other.send("GET", "/users/me")).json.data.email, other.email);
});

test("change-password: the new password signs in, the old one doesn't; every other login ends, this phone stays signed in (gaps row 42)", async () => {
    const before = await storedPassword(me);
    const elsewhere = (await api.send("POST", "/auth/login", { email: me.email, password: PASSWORD })).json.data.accessToken as string;
    const r = await me.send("POST", "/auth/change-password", { currentPassword: PASSWORD, newPassword: "a-new-pass-5678" });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual([r.json.success, r.json.message, Object.keys(r.json.data)], [true, "Password changed", ["accessToken"]]);
    const after = await storedPassword(me);
    assert.notEqual(after, before);
    assert.match(after, /^\$2[aby]\$/, "stored as a bcrypt hash");

    failed(await api.send("GET", "/users/me", undefined, { token: elsewhere }), 401, "unauthenticated", { message: "Your session has ended. Please sign in again" });
    // The phone that changed it: its old token (what 2.8.5 keeps using) and the fresh one both work.
    assert.equal((await me.send("GET", "/users/me")).status, 200, "the token that made the change");
    assert.equal((await api.send("GET", "/users/me", undefined, { token: r.json.data.accessToken })).status, 200);

    failed(await api.send("POST", "/auth/login", { email: me.email, password: PASSWORD }), 401, "invalid_credentials");
    const login = await api.send("POST", "/auth/login", { email: me.email, password: "a-new-pass-5678" });
    assert.equal(login.status, 200, login.text);
    assert.equal((await api.send("GET", "/users/me", undefined, { token: login.json.data.accessToken })).status, 200);
    const stored = (await api.ro.col("users").find<Record<string, unknown>>({ email: me.email }))[0];
    assert.ok(stored.tokensValidAfter instanceof Date);
    for (const f of ["tokensValidAfter", "tokenKept"]) assert.ok(!(f in (await me.send("GET", "/users/me")).json.data), `GET /users/me sends ${f}`);
    api.resetLimits();
});

test("deactivation ends every token; signing in again reopens the account, and only the new token works (gaps row 42)", async () => {
    const u = await api.user("revoke-close");
    const old = (await api.send("POST", "/auth/login", { email: u.email, password: PASSWORD })).json.data.accessToken as string;
    assert.equal((await u.send("DELETE", "/users/me")).status, 200);
    const back = await api.send("POST", "/auth/login", { email: u.email, password: PASSWORD });
    assert.equal(back.status, 200, back.text);
    for (const token of [old, u.token]) {
        failed(await api.send("GET", "/accounts", undefined, { token }), 401, "unauthenticated", { message: "Your session has ended. Please sign in again" });
    }
    assert.equal((await api.send("GET", "/accounts", undefined, { token: back.json.data.accessToken })).status, 200);
    api.resetLimits();
});

test("change-password: a wrong current password is 400 wrong_password; the same password or a short one is 400 invalid_input; nothing changes", async () => {
    const before = await storedPassword(other);
    failed(await other.send("POST", "/auth/change-password", { currentPassword: "not-it-at-all", newPassword: "another-one-1" }), 400, "wrong_password", { message: "Your current password isn't right" });
    failed(await other.send("POST", "/auth/change-password", { currentPassword: PASSWORD, newPassword: PASSWORD }), 400, "invalid_input", { message: "Choose a password different from your current one" });
    failed(await other.send("POST", "/auth/change-password", { currentPassword: PASSWORD, newPassword: "short" }), 400, "invalid_input", { path: "newPassword" });
    failed(await other.send("POST", "/auth/change-password", { newPassword: "another-one-1" }), 400, "invalid_input", { path: "currentPassword" });
    assert.equal(await storedPassword(other), before);
    assert.equal((await api.send("POST", "/auth/login", { email: other.email, password: PASSWORD })).status, 200);
    api.resetLimits();
});

test("restore's limit (gaps row 139): anonymous requests don't spend it; the sixth in the hour is 429 and says so", async () => {
    api.resetLimits();
    const u = await api.user("restore-limit");
    for (let i = 0; i < 8; i++) failed(await api.send("POST", "/backup/restore", { confirm: true }), 401, "unauthenticated");
    for (let i = 0; i < 5; i++) failed(await u.send("POST", "/backup/restore", { confirm: true }), 400, "invalid_input");
    const limited = await u.send("POST", "/backup/restore", { confirm: true });
    failed(limited, 429, "rate_limited", { message: "Too many restores. Try again in an hour" });
    const wait = Number(limited.headers.get("Retry-After"));
    assert.ok(wait > 3_500 && wait <= 3_600, `Retry-After ${wait}`);
    api.resetLimits();
});
