/**
 * Golden responses: record every GET the app makes for one user, then diff two recordings field
 * by field.
 *
 *   npm run guard:golden --workspace=apps/api -- record --email sagnik.rik.das@gmail.com --out .audit/guards/baseline
 *   ... -- record --email … --out <dir> --queries-from .audit/guards/baseline     same requests as the baseline
 *   ... -- record … --api-dir /path/to/other/checkout/apps/api                     record another checkout's API
 *   ... -- compare .audit/guards/baseline <other dir>                              exit 1 on a difference not allowed
 *
 * Recording starts its own dev API (refuses any other database), looks the user up read-only,
 * and signs a 15-minute token with the API's own signer and the dev .env secret. Only GETs are
 * sent. GET /highlights is skipped for the real-data user, because it saves new highlights to
 * that user's history; throwaway users get it. The API still writes its own request log line
 * (RequestLog, kept a week) for each request, as it does for any app request.
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { API_DIR, DEV_DB, PROTECTED_EMAIL, REPO_DIR, client, dayIn, monthIn, parseArgs, startApi, str, writeJson } from "./lib";
import { openReadOnly } from "../checkInvariants";

dotenv.config({ path: path.join(API_DIR, ".env") });

type Snapshot = { meta: Record<string, unknown>; responses: Record<string, { status: number; body: unknown }> };

/** Changes agreed in .audit/plan-api-standard.md (R1): these may differ between recordings. */
export const AGREED = {
    /** Internal fields the DTOs drop. Allowed only as "present before, gone after". */
    removedFields: ["__v", "userId", "pushToken", "googleId", "totpEnabled", "authProvider", "deactivatedAt"],
    /** Envelope fields whose wording may change (B3, B8). */
    envelope: ["message"],
    /** Values that change on every call, whatever the code. */
    volatile: [/^GET \/diagnostics\/requests /, /^GET \/backup .*\.exportedAt$/, /^GET \/investments\/report data\.asOf$/, /^GET \/highlights data\.generatedAt$/],
    /** Rates computed from "now": equal when within this relative tolerance. */
    approx: { keys: ["annualReturn"], tolerance: 1e-4 },
    /** Lists whose order among ties isn't fixed by the query: compared as sets. */
    unordered: [/^GET \/transactions\/title-suggestions$/],
    /** Fields a later release adds, with the reason. */
    added: [
        [/^GET \/backup data\.goalContributionLogs$/, "S2: backups carry goal contribution logs"],
        [/^GET \/dashboard\/summary(\?.*)? data\.(tripExpenses|weekTripExpense|flowTrend\.\d+\.tripExpense)$/, "2.8.4 D21: trip shares beside the totals"],
        [/^GET \/insights\?.* data\.(incomeVsExpense\.\d+\.tripExpense|uncategorised)$/, "2.8.4 D21: trip shares and uncategorised spend"],
        [/^GET \/insights\?.* data\.byCategory\.\d+\.share$/, "2.8.4 D21: shares of everyday spending"],
        [/^GET \/insights\/category\/\w+\?.* data\.shareOfEverydaySpend$/, "2.8.4 D21: share of everyday spending"],
        [/^GET \/reviews\?.* data\.(tripExpenses|previousTripExpenses|uncategorised|categories\.\d+\.share)$/, "2.8.4 D21 and V-4: trip shares, one-decimal shares"],
        [/^GET \/dashboard\/summary(\?.*)? data\.(biggestEverydayExpense|sinceLastOpened\.tripSpent)$/, "2.8.4 D21: everyday biggest expense, trip part of spent"],
        [/^GET \/dashboard\/insights data\.everyday$/, "2.8.4 D21: everyday no-spend days, heatmap and pace"],
        [/^GET \/insights\?.* data\.((trend|previousTrend)\.\d+\.tripAmount|avgDailyEverydaySpend(Current|Previous))$/, "2.8.4 D21: trip part of the trend, everyday averages"],
        [/^GET \/trips(\/[a-f0-9]{24})? data\.(trips\.\d+|trip)\.closedOn$/, "2.8.6: a closed trip's close day (derived from closedAt when not stored)"],
        [/^GET \/goals data\.\d+\.isArchived$/, "2.8.7 row 159: a deleted goal is archived; live goals say false"],
    ] as [RegExp, string][],
    /** Values a later release changes on purpose, with the reason. */
    changed: [
        [/^GET \/dashboard\/summary(\?.*)? data\.netWorthTrend\.\d+\.total$/, "2.8.4 D24: history counts today's accounts"],
        [/^GET \/reviews\?period=month.* data\.netWorth\.(total|previousTotal)$/, "2.8.4 D24: history counts today's accounts"],
        [/^GET \/reviews\?.* data\.verdict\.(headline|detail)$/, "2.8.4 Q3: exact paise, one decimal"],
        [/^GET \/reviews\?.* data\.timeline\.\d+\.(date|kind|text)$/, "2.8.4 Q3 wording; D21 timeline's biggest expense is everyday"],
        [/^GET \/dashboard\/health data\.(pillars\.\d+\.(value|hint)|focus\.hint)$/, "2.8.4 Q3 wording; D21 buffer on everyday spending"],
        [/^GET \/dashboard\/health data\.(score|band|rating|runwayMonths|pillars\.\d+\.(score|verdict)|focus\.(key|label))$/, "2.8.4 D21: the buffer is measured on everyday spending"],
        [/^GET \/highlights data\.highlights\.\d+\.(title|body)$/, "2.8.4 Q3: exact paise, one decimal"],
        [/^GET \/dashboard\/summary(\?.*)? data\.netWorthTrend\.\d+\.label$/, "2.8.6 row 26: each point is named for the month that closed"],
        [/^GET \/dashboard\/summary(\?.*)? data\.(netWorthTrend|flowTrend)\.\d+\.label$/, "2.8.7 row 59: Sep, not Intl's Sept"],
        [/^GET \/investments\/(trend|report) data\.(trend\.)?((points|growth)|holdings\.\d+\.(points|growth))\.\d+\.label$/, "2.8.7 row 59: Sep, not Intl's Sept"],
    ] as [RegExp, string][],
    /** R2 (B5): paged lists answer {items, page, limit, hasNextPage, total}. */
    paged: /^GET \/(transactions|highlights\/history|notifications)(\?|$)/,
};

const PAGE_SHAPE = "page shape (R2)";

export type Difference = { request: string; path: string; before: unknown; after: unknown; allowed: string | null };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export const diffValues = (request: string, a: unknown, b: unknown, at = "", out: Difference[] = []): Difference[] => {
    const here = (p: string) => (at ? `${at}.${p}` : p);
    const volatile = (p: string) => AGREED.volatile.some((re) => re.test(`${request} ${p}`));
    if (volatile(at)) return out;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) out.push({ request, path: `${at}.length`, before: a.length, after: b.length, allowed: null });
        for (let i = 0; i < Math.min(a.length, b.length); i += 1) diffValues(request, a[i], b[i], here(String(i)), out);
        return out;
    }
    if (isObj(a) && isObj(b)) {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
            const p = here(k);
            if (volatile(p)) continue;
            if (!(k in b)) out.push({ request, path: p, before: a[k], after: undefined, allowed: AGREED.removedFields.includes(k) ? "internal field removed" : null });
            else if (!(k in a)) out.push({ request, path: p, before: undefined, after: b[k], allowed: AGREED.added.find(([re]) => re.test(`${request} ${p}`))?.[1] ?? null });
            else diffValues(request, a[k], b[k], p, out);
        }
        return out;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        const key = at.split(".").pop() ?? "";
        const close = typeof a === "number" && typeof b === "number" && AGREED.approx.keys.includes(key)
            && Math.abs(a - b) <= AGREED.approx.tolerance * Math.max(1e-9, Math.abs(a), Math.abs(b));
        if (!close) out.push({ request, path: at || "(value)", before: a, after: b, allowed: AGREED.changed.find(([re]) => re.test(`${request} ${at}`))?.[1] ?? null });
    }
    return out;
};

const sortedIfUnordered = (request: string, data: unknown): unknown =>
    AGREED.unordered.some((re) => re.test(request)) && Array.isArray(data) ? [...data].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))) : data;

/** Rows on the same instant in `_id` order, each run of ties sorted on its own: R2 breaks ties
 *  on `_id`, where before they came in whatever order the index held them. */
export const tiesById = (items: unknown[]): unknown[] => {
    const at = (x: unknown) => String((x as { occurredAt?: unknown; createdAt?: unknown })?.occurredAt ?? (x as { createdAt?: unknown })?.createdAt ?? "");
    const id = (x: unknown) => String((x as { _id?: unknown })?._id ?? "");
    const out: unknown[] = [];
    let run: unknown[] = [];
    const flush = () => { out.push(...run.sort((x, y) => id(x).localeCompare(id(y)))); run = []; };
    for (const x of items) {
        if (run.length && at(run[0]) !== at(x)) flush();
        run.push(x);
    }
    flush();
    return out;
};

/** An old page and a new one, as two new pages to compare, plus the agreed differences. */
export const pagePair = (request: string, a: unknown, b: unknown, out: Difference[]): [unknown, unknown] => {
    if (!isObj(a) || !isObj(b) || !Array.isArray(b.items)) return [a, b];
    let before: Record<string, unknown> = a;
    if (Array.isArray(a.docs)) {
        before = { items: a.docs, page: a.page, limit: a.limit, hasNextPage: a.hasNextPage, total: a.totalDocs };
        for (const k of Object.keys(a)) if (!(k in before)) out.push({ request, path: `data.${k}`, before: k === "docs" ? "(now data.items)" : a[k], after: undefined, allowed: PAGE_SHAPE });
    }
    else {
        for (const k of ["limit", "total"]) {
            if (!(k in a) && k in b) { out.push({ request, path: `data.${k}`, before: undefined, after: b[k], allowed: PAGE_SHAPE }); before = { ...before, [k]: b[k] }; }
        }
    }
    return [
        { ...before, items: tiesById(before.items as unknown[]) },
        { ...b, items: tiesById(b.items) },
    ];
};

export const compareSnapshots = (a: Snapshot, b: Snapshot): Difference[] => {
    const out: Difference[] = [];
    for (const key of new Set([...Object.keys(a.responses), ...Object.keys(b.responses)])) {
        const x = a.responses[key], y = b.responses[key];
        if (!x || !y) { out.push({ request: key, path: "(request)", before: x ? "recorded" : "missing", after: y ? "recorded" : "missing", allowed: null }); continue; }
        if (x.status !== y.status) out.push({ request: key, path: "(status)", before: x.status, after: y.status, allowed: null });
        const bx = x.body as Record<string, unknown> | null, by = y.body as Record<string, unknown> | null;
        if (!isObj(bx) || !isObj(by)) { diffValues(key, bx, by, "", out); continue; }
        for (const k of new Set([...Object.keys(bx), ...Object.keys(by)])) {
            if (k === "data") {
                const [da, db] = AGREED.paged.test(key) ? pagePair(key, bx.data, by.data, out) : [bx.data, by.data];
                diffValues(key, sortedIfUnordered(key, da), sortedIfUnordered(key, db), "data", out);
            }
            else if (JSON.stringify(bx[k]) !== JSON.stringify(by[k])) out.push({ request: key, path: k, before: bx[k], after: by[k], allowed: AGREED.envelope.includes(k) ? "wording" : null });
        }
    }
    return out;
};

const record = async (args: Record<string, string | true>) => {
    const email = str(args, "email");
    const outDir = path.resolve(process.cwd(), str(args, "out") ?? "");
    if (!email || !str(args, "out")) throw new Error("record needs --email and --out");
    const reuse = str(args, "queries-from");

    // Who: read-only lookup, dev only.
    const ro = await openReadOnly(DEV_DB);
    const [user] = await ro.col("users").find<{ _id: unknown; name: string; email: string; prefs?: { timeZone?: string } }>({ email });
    await ro.close();
    if (!user) throw new Error(`no user ${email} in ${DEV_DB}`);
    const zone = user.prefs?.timeZone ?? "Asia/Kolkata";
    const protectedUser = email === PROTECTED_EMAIL;

    const api = await startApi({ apiDir: str(args, "api-dir") });
    const responses: Snapshot["responses"] = {};
    try {
        if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing from apps/api/.env");
        // The payload generateAccessToken builds, signed with the same library and dev secret,
        // but valid for 15 minutes. It stays in memory and only goes to the loopback API above.
        const token = jwt.sign({ userId: user._id, name: user.name, email: user.email, loginTime: new Date().toISOString() }, process.env.JWT_SECRET, { expiresIn: 15 * 60 });
        const send = client(api.base, () => token);
        const get = async (p: string) => {
            if (protectedUser && p.startsWith("/highlights") && !p.startsWith("/highlights/history")) return null;
            const r = await send("GET", p);
            responses[`GET ${p}`] = { status: r.status, body: r.json ?? r.text };
            return r.status === 200 ? r.json?.data : null;
        };

        let queries: string[];
        if (reuse) {
            const base: Snapshot = JSON.parse(fs.readFileSync(path.join(path.resolve(process.cwd(), reuse), "responses.json"), "utf8"));
            queries = Object.keys(base.responses).map((k) => k.replace(/^GET /, ""));
            for (const q of queries) await get(q);
        }
        else {
            const start = `${monthIn(zone)}-01`, today = dayIn(zone);
            const prevStart = `${monthIn(zone, -1)}-01`;
            const since = str(args, "since") ?? new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10) + "T00:00:00.000Z";
            const fixed = [
                "/auth/me", "/accounts", "/categories", "/transactions/title-suggestions",
                "/dashboard/summary", `/dashboard/summary?since=${encodeURIComponent(since)}`, "/dashboard/insights", "/dashboard/health",
                "/transactions?trips=exclude", "/transactions?page=1&limit=20&trips=exclude", `/transactions?page=1&limit=20&startDate=${prevStart}&endDate=${today}&trips=exclude`,
                `/transactions?page=1&limit=20&type=expense&trips=exclude`, `/transactions?page=1&limit=20&search=a&trips=exclude`,
                `/transactions?search=a&startDate=${prevStart}&endDate=${today}&trips=only&limit=50`,
                `/transactions/summary?startDate=${start}&endDate=${today}&trips=exclude`, `/transactions/summary?startDate=${prevStart}&endDate=${start}&trips=exclude`,
                `/transactions/summary?startDate=${dayIn(zone, -1)}&endDate=${dayIn(zone, -1)}`,
                "/budgets", `/budgets?month=${monthIn(zone)}`, `/budgets?month=${monthIn(zone, -1)}`, "/bills", "/goals",
                ...["day", "week", "month", "year"].flatMap((p) => [`/insights?period=${p}&offset=0`, `/insights?period=${p}&offset=-1`]),
                "/reviews?period=month&offset=-1", "/reviews?period=week&offset=-1", "/reviews?period=month&offset=-2",
                "/highlights", "/highlights/history?page=1&limit=20", "/notifications?page=1&limit=20",
                "/investments", "/investments/trend", "/investments/report", "/recurring", "/cash-flow", "/trips", "/backup", "/diagnostics/requests",
            ];
            for (const q of fixed) await get(q);
            const accounts = (responses["GET /accounts"]?.body as { data?: { _id: string; type: string }[] })?.data ?? [];
            for (const a of accounts.filter((x) => x.type === "investment")) await get(`/investments/${a._id}/history`);
            const trips = (responses["GET /trips"]?.body as { data?: { trips: { _id: string }[] } })?.data?.trips ?? [];
            for (const t of trips) await get(`/trips/${t._id}`);
            const insights = (responses["GET /insights?period=month&offset=0"]?.body as { data?: { byCategory?: { categoryId?: string }[] } })?.data?.byCategory ?? [];
            for (const c of insights.slice(0, 12)) { const id = c.categoryId; if (id && /^[a-f0-9]{24}$/.test(id)) await get(`/insights/category/${id}?period=month&offset=0`); }
            const page = (responses["GET /transactions?page=1&limit=20&trips=exclude"]?.body as { data?: { docs?: { _id: string }[]; items?: { _id: string }[] } })?.data;
            const feed = page?.items ?? page?.docs ?? [];
            for (const t of feed.slice(0, 5)) await get(`/transactions/${t._id}`);
            for (let page = 1; page <= 500; page += 1) {
                const d = await get(`/transactions?page=${page}&limit=100&trips=exclude`);
                if (!d?.hasNextPage) break;
            }
            for (let page = 1; page <= 500; page += 1) {
                const d = await get(`/transactions?page=${page}&limit=100&trips=exclude&startDate=${prevStart}&endDate=${today}`);
                if (!d?.hasNextPage) break;
            }
        }
    }
    finally {
        await api.stop();
    }
    const failed = Object.entries(responses).filter(([, r]) => r.status !== 200).map(([k, r]) => `${k} → ${r.status}`);
    fs.mkdirSync(outDir, { recursive: true });
    writeJson(path.join(outDir, "responses.json"), {
        meta: { email, recordedAt: new Date().toISOString(), apiDir: str(args, "api-dir") ?? path.relative(REPO_DIR, API_DIR), requests: Object.keys(responses).length, notOk: failed, skipped: protectedUser ? ["GET /highlights (writes the user's highlight history)"] : [] },
        responses,
    });
    console.log(`Recorded ${Object.keys(responses).length} GETs for ${email} into ${path.relative(process.cwd(), outDir)}${failed.length ? `; not 200: ${failed.join(", ")}` : ""}`);
    if (failed.length) process.exit(1);
};

const compare = (dirA: string, dirB: string) => {
    const load = (d: string): Snapshot => JSON.parse(fs.readFileSync(path.join(path.resolve(process.cwd(), d), "responses.json"), "utf8"));
    const diffs = compareSnapshots(load(dirA), load(dirB));
    const bad = diffs.filter((d) => !d.allowed);
    const allowed = diffs.length - bad.length;
    for (const d of bad.slice(0, 200)) console.log(`  ✗ ${d.request}  ${d.path}: ${JSON.stringify(d.before)?.slice(0, 80)} → ${JSON.stringify(d.after)?.slice(0, 80)}`);
    if (bad.length > 200) console.log(`  … and ${bad.length - 200} more`);
    const kinds = [...new Set(diffs.filter((d) => d.allowed).map((d) => d.allowed))];
    console.log(`${bad.length} differences not allowed, ${allowed} allowed${kinds.length ? ` (${kinds.join(", ")})` : ""}`);
    writeJson(path.join(path.resolve(process.cwd(), dirB), `diff-vs-${path.basename(path.resolve(process.cwd(), dirA))}.json`), diffs);
    process.exit(bad.length ? 1 : 0);
};

if (require.main === module) {
    const { args, positional } = parseArgs();
    const [cmd, a, b] = positional;
    (cmd === "record" ? record(args) : cmd === "compare" && a && b ? Promise.resolve(compare(a, b)) : Promise.reject(new Error("usage: golden.ts record --email <e> --out <dir> | compare <dirA> <dirB>")))
        .catch((e) => { console.error(`golden: ${(e as Error).message}`); process.exit(2); });
}
