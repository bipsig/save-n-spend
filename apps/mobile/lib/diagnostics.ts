// Turns log rows into what the Diagnostics screen shows: plain-words labels ("Couldn't save a
// bill"), the today summary, filters, and time groups. Pure, so the screen stays layout-only.

export type LogKind = "ok" | "rejected" | "failed" | "noReply" | "appError" | "notification";

export type DiagRow = {
  requestId: string | null;
  source: "api" | "app" | "job";
  method: string | null;
  /** Route pattern without the `/api/v1` prefix, e.g. `/bills/:id/pay`. For app rows the
   *  screen; for job rows e.g. `notify:dailySummary`. */
  route: string;
  status: number | null;
  durationMs: number | null;
  message: string | null;
  at: string;
};

/** Over this, a call counts as slow. A cold start is ~50s; a normal call is under half a second. */
export const SLOW_MS = 1000;

export const kindOf = (row: DiagRow): LogKind => {
  if (row.source === "app") return "appError";
  if (row.source === "job") return "notification";
  if (row.status === 0) return "noReply";
  if ((row.status ?? 0) >= 500) return "failed";
  if ((row.status ?? 0) >= 400) return "rejected";
  return "ok";
};

export const isFailure = (row: DiagRow): boolean => {
  const k = kindOf(row);
  return k === "failed" || k === "rejected" || k === "noReply" || k === "appError"
    || (k === "notification" && !!row.message?.startsWith("failed"));
};

// What each resource is called, plural and singular.
const NOUNS: Record<string, [string, string]> = {
  bills: ["bills", "a bill"],
  transactions: ["transactions", "a transaction"],
  investments: ["investments", "an investment"],
  accounts: ["accounts", "an account"],
  categories: ["categories", "a category"],
  goals: ["goals", "a goal"],
  budgets: ["budgets", "a budget"],
  notifications: ["notifications", "a notification"],
  highlights: ["highlights", "a highlight"],
  insights: ["insights", "insights"],
  reviews: ["reviews", "a review"],
  recurring: ["recurring suggestions", "a suggestion"],
  "cash-flow": ["cash flow", "cash flow"],
  dashboard: ["the dashboard", "the dashboard"],
  backup: ["the backup", "a backup"],
  diagnostics: ["diagnostics", "diagnostics"],
  users: ["your profile", "your profile"],
};

// Calls with a name of their own, matched on method + pattern.
const SPECIAL: Record<string, string> = {
  "POST /bills/:id/pay": "mark a bill paid",
  "POST /bills/:id/skip": "skip a bill",
  "POST /goals/:id/contribute": "add to a goal",
  "PATCH /accounts/:id/balance": "update a balance",
  "PATCH /investments/:id/basis": "update what's invested",
  "POST /transactions/convert-to-investment": "move payments to an investment",
  "POST /transactions/:id/convert-to-investment": "move a payment to an investment",
  "POST /recurring/dismiss": "dismiss a suggestion",
  "POST /auth/login": "sign in",
  "POST /auth/register": "create an account",
  "GET /auth/me": "check your session",
  "GET /dashboard/summary": "load the dashboard",
  "GET /dashboard/health": "load the health score",
  "GET /transactions/summary": "load totals",
  "GET /transactions/title-suggestions": "load title suggestions",
  "GET /investments/:id/history": "load an investment's history",
  "POST /diagnostics/client-errors": "report an app error",
  "GET /diagnostics/requests": "load the server log",
};

const past: Record<string, string> = {
  load: "Loaded", add: "Added", save: "Saved", delete: "Deleted", mark: "Marked", skip: "Skipped",
  update: "Updated", move: "Moved", dismiss: "Dismissed", sign: "Signed", create: "Created",
  check: "Checked", report: "Reported",
};

/** The verb phrase, e.g. "save a bill", or null when the route isn't one we know. */
const action = (method: string, route: string): string | null => {
  const special = SPECIAL[`${method} ${route}`];
  if (special) return special;
  const resource = route.split("/")[1] ?? "";
  const noun = NOUNS[resource];
  if (!noun) return null;
  const hasId = route.includes(":id");
  if (method === "GET") return `load ${hasId ? noun[1] : noun[0]}`;
  if (method === "POST") return `add ${noun[1]}`;
  if (method === "DELETE") return `delete ${noun[1]}`;
  return `save ${noun[1]}`;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Loaded bills", "Couldn't save a bill", "No reply: cash flow", "App error on Investment detail". */
export const labelOf = (row: DiagRow): string => {
  if (row.source === "app") {
    const screen = row.route.replace(/^\//, "").replace(/[-_]/g, " ") || "home";
    return `App error on ${screen}`;
  }
  if (row.source === "job") {
    const type = row.route.replace(/^notify:/, "").replace(/([A-Z])/g, " $1").toLowerCase();
    return `Notification: ${type}`;
  }
  const phrase = action(row.method ?? "GET", row.route) ?? `${row.method} ${row.route}`;
  const k = kindOf(row);
  if (k === "noReply") return `No reply: ${phrase.replace(/^(load|add|save|delete) /, "")}`;
  if (k === "rejected" || k === "failed") return `Couldn't ${phrase}`;
  const [verb, ...rest] = phrase.split(" ");
  return past[verb] ? `${past[verb]} ${rest.join(" ")}` : cap(phrase);
};

/** What a failure box says: the server's message, or what "no reply" usually means. */
export const detailOf = (row: DiagRow): string | null => {
  if (kindOf(row) === "noReply") return "Server asleep or you're offline";
  return row.message;
};

export type DiagFilter = "all" | "failed" | "slow" | "app" | "notify";

export const applyFilter = (rows: DiagRow[], filter: DiagFilter): DiagRow[] => {
  if (filter === "failed") return rows.filter(isFailure);
  if (filter === "slow") return rows.filter((r) => (r.durationMs ?? 0) > SLOW_MS);
  if (filter === "app") return rows.filter((r) => r.source === "app");
  if (filter === "notify") return rows.filter((r) => r.source === "job");
  return rows;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Today's calls: how many, how many failed, the typical (median) time, and the slowest. */
export const summarise = (rows: DiagRow[]) => {
  const today = rows.filter((r) => new Date(r.at).getTime() >= startOfToday() && r.source === "api");
  const timed = today.map((r) => r.durationMs).filter((ms): ms is number => ms !== null).sort((a, b) => a - b);
  const typical = timed.length ? timed[Math.floor(timed.length / 2)] : null;
  // A no-reply is a timeout, not a measure of speed — it would always "win".
  const slowest = today
    .filter((r) => kindOf(r) !== "noReply")
    .reduce<DiagRow | null>((max, r) => ((r.durationMs ?? 0) > (max?.durationMs ?? -1) ? r : max), null);
  return {
    calls: today.length,
    failed: today.filter(isFailure).length,
    typical,
    slowest: slowest && (slowest.durationMs ?? 0) > 0 ? slowest : null,
  };
};

/** "Just now" · "12 min ago" · "Earlier today" · "Yesterday" · "25 Sep". Rows arrive newest
 *  first, so groups come out in order. */
export const groupByTime = (rows: DiagRow[]): { label: string; rows: DiagRow[] }[] => {
  const now = Date.now();
  const today = startOfToday();
  const labelFor = (iso: string): string => {
    const t = new Date(iso).getTime();
    const mins = Math.floor((now - t) / 60_000);
    if (mins < 2) return "Just now";
    if (mins < 60) return `${Math.floor(mins / 5) * 5 || mins} min ago`;
    if (t >= today) return "Earlier today";
    if (t >= today - 86_400_000) return "Yesterday";
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };
  const groups: { label: string; rows: DiagRow[] }[] = [];
  for (const row of rows) {
    const label = labelFor(row.at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }
  return groups;
};

/** "1.9 s" / "85 ms". */
export const formatMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
