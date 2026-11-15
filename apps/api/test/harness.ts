import "./env";
import { spawn } from "child_process";
import { randomBytes } from "crypto";
import type { AddressInfo } from "net";
import type { Server } from "http";
import path from "path";
import { after, afterEach, before } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import type { MongoMemoryReplSet } from "mongodb-memory-server-core";
import app from "../src/app";
import { authLimiter, restoreLimiter } from "../src/middleware/rateLimiter";
import { client, type Reply, type Send } from "../scripts/guards/lib";
import { checkUser, type Problem, type UserData } from "../scripts/invariants/rules";
import { URI_ENV, isLoopbackUri, startReplSet } from "./mongo";
import { sentPushes } from "./env";

export type { Reply, Send };
export { sentPushes };

const COLLECTIONS = ["users", "accounts", "transactions", "categories", "goals", "goalcontributionlogs", "bills", "budgets", "trips", "tripexpenses", "idempotencyrecords", "notifications", "highlightlogs", "requestlogs", "recurringdismissals"] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

export const PASSWORD = "test-pass-1234";

export type TestUser = {
    id: string;
    email: string;
    password: string;
    token: string;
    /** Sends as this user (`Authorization: Bearer <token>`). */
    send: Send;
    /** A top-level default category of this kind, from sign-up. */
    category: (kind?: "expense" | "income") => Promise<string>;
    /** Creates an account through the API and returns its id. */
    account: (name: string, opts?: { type?: string; startingBalance?: number; investmentKind?: string }) => Promise<string>;
};

export type TestApi = {
    /** `http://127.0.0.1:<port>`, the app in this process. */
    base: string;
    dbName: string;
    /** Sends with no token. */
    send: Send;
    /** A new user, signed up and signed in through the API, with the default categories. */
    user: (tag?: string) => Promise<TestUser>;
    /** Reads straight from this file's database. */
    ro: { col: (name: CollectionName) => { find: <T>(q?: Record<string, unknown>) => Promise<T[]>; count: (q?: Record<string, unknown>) => Promise<number> } };
    /** The raw database, for a test that must set up a state no route can (say why in the test). */
    db: () => NonNullable<typeof mongoose.connection.db>;
    /** scripts/invariants/rules.ts over every user in this database. */
    problems: () => Promise<(Problem & { email: string })[]>;
    assertInvariants: () => Promise<void>;
    /** The same app in a child process, on this database (for a test that kills the server). */
    child: (env?: Record<string, string>) => Promise<{ base: string; stop: () => Promise<void>; exited: Promise<number | null> }>;
    /** Forgets every rate-limit hit so far (sign-in and restore). */
    resetLimits: () => void;
    stop: () => Promise<void>;
};

let ownReplSet: MongoMemoryReplSet | undefined;

/** The run's replica set (globalSetup.ts), or one of this process's own when a file runs alone. */
const mongoUri = async (): Promise<string> => {
    let uri = process.env[URI_ENV];
    if (!uri) {
        ownReplSet = await startReplSet();
        uri = ownReplSet.getUri();
        process.env[URI_ENV] = uri;
    }
    if (!isLoopbackUri(uri)) throw new Error(`Refusing ${uri.replace(/\/\/[^@]*@/, "//***@")}: tests only use the in-memory database`);
    return uri;
};

const LOOPBACK_KEYS = ["127.0.0.1", "::ffff:127.0.0.1", "::1"];
const resetLimits = () => {
    for (const key of LOOPBACK_KEYS) { void authLimiter.resetKey(key); void restoreLimiter.resetKey(key); }
};

/**
 * Starts the app in this process on a free 127.0.0.1 port against a fresh database on the
 * in-memory replica set, with every index built. `stop()` drops the database.
 */
export const startTestApi = async (): Promise<TestApi> => {
    const uri = await mongoUri();
    const dbName = `t-${process.pid}-${randomBytes(3).toString("hex")}`;
    await mongoose.connect(uri, { dbName, writeConcern: { w: "majority" } });
    assert.equal(mongoose.connection.name, dbName);
    await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()));

    const server: Server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const db = () => mongoose.connection.db!;

    const ro: TestApi["ro"] = {
        col: (name) => ({
            find: <T>(q: Record<string, unknown> = {}) => db().collection(name).find(q).toArray() as unknown as Promise<T[]>,
            count: (q: Record<string, unknown> = {}) => db().collection(name).countDocuments(q),
        }),
    };

    const user = async (tag = "user"): Promise<TestUser> => {
        const email = `${tag}-${Date.now().toString(36)}-${randomBytes(2).toString("hex")}@example.test`;
        let token = "";
        const send = client(base, () => token || null);
        const reg = await send("POST", "/auth/register", { name: "Test Runner", email, password: PASSWORD, timeZone: "Asia/Kolkata" });
        assert.equal(reg.status, 201, `register: ${reg.status} ${reg.text.slice(0, 200)}`);
        const login = await send("POST", "/auth/login", { email, password: PASSWORD });
        assert.equal(login.status, 200, `login: ${login.status} ${login.text.slice(0, 200)}`);
        token = login.json.data.accessToken;
        // The helper's own sign-in shouldn't use up the allowance a test may be measuring.
        resetLimits();
        let cats: { _id: string; kind: string; parent?: string | null }[] | undefined;
        return {
            id: String(reg.json.data._id), email, password: PASSWORD, token, send,
            category: async (kind = "expense") => {
                cats ??= (await send("GET", "/categories")).json.data;
                return cats!.find((c) => c.kind === kind && !c.parent)!._id;
            },
            account: async (name, { type = "bank", startingBalance = 1_000_000, investmentKind } = {}) => {
                const r = await send("POST", "/accounts", { name, type, startingBalance, ...(type === "investment" ? { investmentKind: investmentKind ?? "mutual_fund" } : {}) });
                assert.equal(r.status, 201, `account ${name}: ${r.status} ${r.json?.message}`);
                return r.json.data._id as string;
            },
        };
    };

    const problems = async () => {
        const users = await ro.col("users").find<UserData["user"]>({});
        const all = await Promise.all((["accounts", "transactions", "categories", "goals", "goalcontributionlogs", "bills", "budgets", "trips", "tripexpenses"] as const).map((c) => ro.col(c).find<{ userId: unknown }>({})));
        const of = <T>(rows: { userId: unknown }[], id: string) => rows.filter((r) => String(r.userId) === id) as unknown as T[];
        return users.flatMap((u) => {
            const id = String(u._id);
            const [accounts, transactions, categories, goals, goalLogs, bills, budgets, trips, tripExpenses] = all;
            return checkUser({
                user: u, accounts: of(accounts, id), transactions: of(transactions, id), categories: of(categories, id), goals: of(goals, id),
                goalLogs: of(goalLogs, id), bills: of(bills, id), budgets: of(budgets, id), trips: of(trips, id), tripExpenses: of(tripExpenses, id),
            }).map((p) => ({ ...p, email: u.email }));
        });
    };

    const child: TestApi["child"] = async (env = {}) => {
        const proc = spawn(process.execPath, ["-r", "ts-node/register", path.join(__dirname, "childApi.ts")], {
            cwd: path.resolve(__dirname, ".."),
            env: { ...process.env, ...env, TEST_DB_NAME: dbName },
            stdio: ["ignore", "pipe", "pipe"],
        });
        const exited = new Promise<number | null>((resolve) => proc.once("exit", (code) => resolve(code)));
        let log = "";
        const port = await new Promise<number>((resolve, reject) => {
            proc.stdout.on("data", (b: Buffer) => { log += b; const m = /^listening (\d+)$/m.exec(log); if (m) resolve(Number(m[1])); });
            proc.stderr.on("data", (b: Buffer) => { log += b; });
            void exited.then((code) => reject(new Error(`child API exited (${code}) before listening:\n${log.slice(-2000)}`)));
        });
        const stop = async () => { if (proc.exitCode === null && proc.signalCode === null) { proc.kill("SIGTERM"); await exited; } };
        return { base: `http://127.0.0.1:${port}`, stop, exited };
    };

    return {
        base, dbName, send: client(base), user, ro, db, problems, child, resetLimits,
        assertInvariants: async () => assert.deepEqual(await problems(), [], "invariants (scripts/invariants/rules.ts) broken"),
        stop: async () => {
            await new Promise<void>((resolve) => server.close(() => resolve()));
            server.closeAllConnections?.();
            await mongoose.connection.dropDatabase().catch(() => undefined);
            await mongoose.disconnect();
            await ownReplSet?.stop();
        },
    };
};

/**
 * The usual setup for an HTTP test file: the app starts before the first test, every test is
 * followed by the invariant check, and everything stops after the last.
 *
 * Top-level `before` hooks run at the same time, not one after another, so a file's own
 * `before` must start with `await api.ready()`. Tests can read the fields directly.
 */
export const useTestApi = ({ invariantsAfterEach = true }: { invariantsAfterEach?: boolean } = {}): TestApi & { ready: () => Promise<TestApi> } => {
    let api: TestApi | undefined;
    let starting: Promise<TestApi> | undefined;
    const ready = () => (starting ??= startTestApi().then((a) => (api = a)));
    const started = () => { if (!api) throw new Error("useTestApi: await api.ready() in your before hook"); return api; };
    before(async () => { await ready(); });
    if (invariantsAfterEach) afterEach(async () => { await api?.assertInvariants(); });
    after(async () => { await api?.stop(); });
    return new Proxy({} as TestApi & { ready: typeof ready }, { get: (_, k) => (k === "ready" ? ready : started()[k as keyof TestApi]) });
};
