import { spawn } from "child_process";
import { randomBytes } from "crypto";
import fs from "fs";
import net from "net";
import path from "path";

// Shared plumbing for the guard scripts. Every guard talks to a LOCAL API it starts itself
// (dev database only, checked from the startup log) or, for the read-only invariant check,
// straight to the dev database.

export const API_DIR = path.resolve(__dirname, "../..");
export const REPO_DIR = path.resolve(API_DIR, "../..");
export const GUARDS_OUT = path.join(REPO_DIR, ".audit/guards");
export const DEV_DB = "save-n-spend-dev";
/** The real-data copy. Guards may read it; nothing may write to it. */
export const PROTECTED_EMAIL = "sagnik.rik.das@gmail.com";

export type Args = Record<string, string | true>;

export const parseArgs = (argv = process.argv.slice(2)): { args: Args; positional: string[] } => {
    const args: Args = {};
    const positional: string[] = [];
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (!a.startsWith("--")) { positional.push(a); continue; }
        const [key, inline] = a.slice(2).split("=", 2);
        if (inline !== undefined) args[key] = inline;
        else if (argv[i + 1] && !argv[i + 1].startsWith("--")) args[key] = argv[++i];
        else args[key] = true;
    }
    return { args, positional };
};

export const str = (args: Args, key: string, fallback?: string): string | undefined =>
    typeof args[key] === "string" ? (args[key] as string) : fallback;

const freePort = (): Promise<number> => new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
        const { port } = srv.address() as net.AddressInfo;
        srv.close(() => resolve(port));
    });
});

export type RunningApi = { base: string; port: number; stop: () => Promise<void>; logTail: () => string };

/**
 * Starts `src/server.ts` from `apiDir` on a free loopback port with reminders off, waits until
 * it says which database it connected to, and refuses to go on unless that is the dev one.
 * The caller must `stop()` it (the guards do so in a `finally`).
 */
export const startApi = async ({ apiDir = API_DIR, timeoutMs = 120_000, env: extra = {} }: { apiDir?: string; timeoutMs?: number; env?: Record<string, string> } = {}): Promise<RunningApi> => {
    const port = await freePort();
    const env: NodeJS.ProcessEnv = { ...process.env, ...extra, DISABLE_REMINDERS: "true", PORT: String(port), NODE_ENV: "development" };
    delete env.DB_NAME;
    delete env.HOST;
    delete env.RENDER;
    const child = spawn(process.execPath, ["-r", "ts-node/register", "src/server.ts"], { cwd: apiDir, env, stdio: ["ignore", "pipe", "pipe"] });
    const lines: string[] = [];
    const keep = (chunk: Buffer) => {
        for (const line of chunk.toString().split("\n")) if (line.trim()) lines.push(line);
        if (lines.length > 400) lines.splice(0, lines.length - 400);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);

    const stop = () => new Promise<void>((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) return resolve();
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
        setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 5_000).unref();
    });

    const started = Date.now();
    for (;;) {
        const text = lines.join("\n");
        const db = /MongoDB connected: .* \(db: ([^)]+)\)/.exec(text)?.[1];
        const bound = text.includes(`Server has started on 127.0.0.1:${port}`);
        if (db && db !== DEV_DB) {
            await stop();
            throw new Error(`API connected to "${db}", not ${DEV_DB}. Stopped it; nothing was sent.`);
        }
        if (db === DEV_DB && bound) break;
        if (/Server has started on (?!127\.0\.0\.1)/.test(text)) {
            await stop();
            throw new Error("API bound something other than 127.0.0.1. Stopped it; nothing was sent.");
        }
        if (child.exitCode !== null) throw new Error(`API exited early:\n${lines.slice(-30).join("\n")}`);
        if (Date.now() - started > timeoutMs) {
            await stop();
            throw new Error(`API did not come up within ${timeoutMs / 1000}s:\n${lines.slice(-30).join("\n")}`);
        }
        await new Promise((r) => setTimeout(r, 250));
    }
    return { base: `http://127.0.0.1:${port}`, port, stop, logTail: () => lines.slice(-60).join("\n") };
};

export const assertLoopback = (base: string): void => {
    const u = new URL(base);
    if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") throw new Error(`Refusing ${base}: guards only talk to a local API`);
};

// ---- HTTP, sent the way the 2.7.x app sends it (lib/api.ts) -------------------------------

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const requestId = (): string => [...randomBytes(6)].map((b) => ALPHABET[b % ALPHABET.length]).join("");

export type Reply = { status: number; json: any; text: string; headers: Headers; ms: number };
export type Send = (method: string, pathAndQuery: string, body?: unknown, opts?: { contentType?: string | null; raw?: string; token?: string | null; headers?: Record<string, string> }) => Promise<Reply>;

export const client = (base: string, getToken: () => string | null = () => null): Send => {
    assertLoopback(base);
    return async (method, pathAndQuery, body, opts = {}) => {
        const token = opts.token === undefined ? getToken() : opts.token;
        const headers: Record<string, string> = { "X-Request-Id": requestId(), "X-App-Version": "2.6.0" };
        // The app sends this header on every request, GETs and body-less POSTs included.
        if (opts.contentType !== null) headers["Content-Type"] = opts.contentType ?? "application/json";
        if (token) headers.Authorization = `Bearer ${token}`;
        Object.assign(headers, opts.headers ?? {});
        const started = Date.now();
        const res = await fetch(`${base}/api/v1${pathAndQuery}`, {
            method,
            headers,
            ...(opts.raw !== undefined ? { body: opts.raw } : body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        const text = await res.text();
        let json: any = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        return { status: res.status, json, text, headers: res.headers, ms: Date.now() - started };
    };
};

export const THROWAWAY_PASSWORD = "guard-pass-1234";

/** A new user on the dev API, signed in. The email is unique per run. */
export const throwawayUser = async (base: string, prefix: string) => {
    const email = `${prefix}-${Date.now().toString(36)}-${randomBytes(2).toString("hex")}@example.test`;
    let token: string | null = null;
    const send = client(base, () => token);
    const reg = await send("POST", "/auth/register", { name: "Guard Runner", email, password: THROWAWAY_PASSWORD, timeZone: "Asia/Kolkata" });
    if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${reg.text.slice(0, 200)}`);
    const login = await send("POST", "/auth/login", { email, password: THROWAWAY_PASSWORD });
    if (login.status !== 200) throw new Error(`login failed: ${login.status} ${login.text.slice(0, 200)}`);
    token = login.json.data.accessToken;
    return { email, send, setToken: (t: string | null) => { token = t; }, token: () => token };
};

// ---- Small helpers ------------------------------------------------------------------------

export const writeJson = (file: string, data: unknown): void => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
};

export const stamp = (): string => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

/** Today's calendar day in a zone, `YYYY-MM-DD`. */
export const dayIn = (zone: string, offsetDays = 0): string => {
    const d = new Date(Date.now() + offsetDays * 86_400_000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};
export const monthIn = (zone: string, offsetMonths = 0): string => {
    const [y, m] = dayIn(zone).split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + offsetMonths, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
