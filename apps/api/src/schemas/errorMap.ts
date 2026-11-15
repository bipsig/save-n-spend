import { MESSAGES } from "../utils/messages";

// One error map for every zod schema, v3 and v4 alike: each issue becomes a labelled plain
// sentence. A message a schema writes itself (`.min(2, "Name needs …")`) always wins; this only
// replaces zod's own text ("Required", "Expected number, received string", …), which must never
// reach a person. Installed globally by schemas/z.ts.

/** What a field is called in the app. Dotted paths without list indexes win over plain keys. */
const LABELS: Record<string, string> = {
    "owedBy.account": "A person in the split", "owedBy.amount": "What each person owes",
    "shares.account": "A person in the split", "shares.amount": "Each share",
    "parts.title": "Each part's name", "parts.category": "Each part's category", "parts.cost": "Each part's amount",
    "entries.account": "A person in the plan", "entries.amount": "Each amount in the plan",
    "decisions.category": "A category", "decisions.account": "An account", "decisions.key": "A row of the file", "decisions.action": "A choice",
    "prefs.defaultAccount": "The default account", "prefs.timeZone": "Time zone", "preferences.timeZone": "Time zone",

    amount: "Amount", account: "Account", toAccount: "The account it goes to", category: "Category", title: "Title",
    note: "Note", location: "Location", receiptUrl: "Receipt", paymentMode: "Payment method", occurredAt: "Date",
    clientId: "The save reference", type: "Type", name: "Name", startingBalance: "Opening balance", icon: "Icon", color: "Colour",
    investmentKind: "Investment type", currentValue: "Current value", investedSince: "Start date", investedHow: "How it was invested",
    ids: "The list", balance: "Balance", invested: "Amount invested", mode: "What to do with its money",
    email: "Email", password: "Password", currentPassword: "Current password", newPassword: "New password",
    timeZone: "Time zone", pushToken: "Notifications", defaultAccount: "Default account", prefs: "Settings", notifications: "Notification settings",
    enabled: "Notifications", billReminderLead: "Bill reminder", budgetAlerts: "Budget alerts", goalMilestones: "Goal milestones",
    dailySummary: "Daily summary", weeklySummary: "Weekly summary", monthlySummary: "Monthly summary",
    investmentReminder: "Investment reminder", investmentReminderDay: "Investment reminder day",
    limit: "Limit", month: "Month", dueDate: "Due date", recurring: "Repeats", frequency: "How often it repeats", reminderDays: "Reminder",
    toInvestment: "Investment", target: "Target", deadline: "Target date", saved: "Saved", key: "Suggestion",
    startDate: "Start date", endDate: "End date", members: "People on the trip", budget: "Budget", emoji: "Emoji",
    cost: "Amount", paidBy: "Who paid", paidFrom: "The account you paid from", shares: "The split", person: "Person",
    direction: "Direction", letGo: "People to let go", entries: "The plan", csv: "The file", mapping: "Names", decisions: "Choices",
    parts: "Parts", period: "Period", offset: "Period", page: "Page", search: "Search", trips: "Trip filter", since: "Since",
    status: "Status", confirm: "Confirmation", kind: "Kind", parent: "Parent category", transactionIds: "Payments",
    message: "Report", stack: "Report", screen: "Report", requestId: "Report", appVersion: "Report",
    version: "The backup file", exportedAt: "The backup file", preferences: "The backup file", currency: "The backup file",
    accounts: "The backup file", categories: "The backup file", transactions: "The backup file", budgets: "The backup file",
    bills: "The backup file", goals: "The backup file", tripExpenses: "The backup file",
};

const FALLBACK = "Something in the request";

/** The label for a path as zod reports it (`["owedBy", 1, "amount"]`). */
export const labelFor = (path: readonly PropertyKey[] | undefined): string => {
    const keys = (path ?? []).filter((p): p is string => typeof p === "string");
    for (let i = 0; i < keys.length; i += 1) {
        const dotted = keys.slice(i).join(".");
        if (LABELS[dotted]) return LABELS[dotted];
    }
    const last = keys[keys.length - 1];
    return (last && LABELS[last]) || FALLBACK;
};

/** The two zod versions' issue fields this map reads, under one shape. */
export type AnyIssue = {
    code: string;
    path?: readonly PropertyKey[];
    /** v3 */ expected?: unknown; received?: unknown; type?: string; validation?: unknown;
    /** v4 */ input?: unknown; origin?: string; format?: string;
    minimum?: number | bigint; maximum?: number | bigint; inclusive?: boolean;
};

const n = (v: number | bigint | undefined) => Number(v ?? 0);

/** The sentence for one zod issue. Never includes values, ids or field names. */
export const messageFor = (issue: AnyIssue): string => {
    const path = issue.path ?? [];
    const label = labelFor(path);
    const key = [...path].reverse().find((p): p is string => typeof p === "string");
    const kind = issue.origin ?? issue.type; // what was too small/big: string, number, array, date
    // Anything wrong with a backup file's own fields: one sentence for the whole file.
    if (label === LABELS.version && issue.code !== "unrecognized_keys") return "That doesn't look like a Save n Spend backup file";
    switch (issue.code) {
        case "invalid_type": {
            const missing = issue.received === "undefined" || ("input" in issue && issue.input === undefined && issue.received === undefined);
            if (missing) return path.length === 0 ? MESSAGES.missingBody : `${label} is required`;
            if (issue.received === "null" || ("input" in issue && issue.input === null)) return `${label} can't be empty`;
            switch (issue.expected) {
                case "number": case "nan": return issue.received === "float" ? `${label} must be a whole number` : `${label} must be a number`;
                case "int": case "integer": case "bigint": return `${label} must be a whole number`;
                case "string": return `${label} must be text`;
                case "boolean": return `${label} must be on or off`;
                case "array": return `${label} must be a list`;
                case "date": return `${label} isn't a valid date`;
                case "object": return path.length === 0 ? MESSAGES.missingBody : `${label} isn't in the right form. Please update the app`;
                default: return `${label} isn't valid`;
            }
        }
        case "too_small":
            if (kind === "string") return n(issue.minimum) <= 1 ? `${label} can't be empty` : `${label} needs at least ${n(issue.minimum)} characters`;
            if (kind === "array" || kind === "set") return n(issue.minimum) <= 1 ? `${label} needs at least one item` : `${label} needs at least ${n(issue.minimum)} items`;
            if (kind === "date") return `${label} is too early`;
            if (n(issue.minimum) === 0) return issue.inclusive === false ? `${label} must be more than zero` : `${label} can't be negative`;
            return `${label} is too small`;
        case "too_big":
            if (kind === "string") return `${label} can be at most ${n(issue.maximum)} characters`;
            if (kind === "array" || kind === "set") return `${label} can have at most ${n(issue.maximum)} items`;
            if (kind === "date") return `${label} is too late`;
            if (key === "offset") return "That period hasn't finished yet";
            return `${label} is too big`;
        case "invalid_string": // v3
        case "invalid_format": { // v4
            const format = issue.format ?? (typeof issue.validation === "string" ? issue.validation : "regex");
            if (format === "email") return "Enter a valid email";
            if (/date|time/.test(format)) return `${label} isn't a valid date`;
            return `${label} isn't valid`;
        }
        case "invalid_date": return `${label} isn't a valid date`;
        case "invalid_enum_value": case "invalid_literal": case "invalid_value": case "invalid_union_discriminator":
            return `${label} isn't one of the options`;
        case "invalid_union": {
            // v4 reports a missing discriminator (`type`) with the whole object as input.
            const input = issue.input as Record<string, unknown> | undefined;
            if (key && input && typeof input === "object" && input[key] === undefined) return `${label} is required`;
            return `${label} isn't one of the options`;
        }
        case "unrecognized_keys": return MESSAGES.unexpectedField;
        case "not_multiple_of": return `${label} must be a whole number`;
        default: return `${label} isn't valid`;
    }
};
