// One sentence per situation, so the same case always reads the same. The rules (also in
// docs/design-system.md → "Server messages"): one plain sentence in sentence case; no "!", no
// trailing full stop; ". " between two sentences, never " — "; the app's words (account,
// person, holding, category); never field names, ids, amounts, library or HTTP text.

/** `notFound("bill")` → "That bill doesn't exist any more". For an id in the URL. */
export const notFound = (thing: string): string => `That ${thing} doesn't exist any more`;

/** A body field naming something that isn't the user's (missing, someone else's, archived,
 *  malformed or the wrong kind). `invalidReference("The account it goes to", "accounts")`. */
export const invalidReference = (label: string, things?: string): string =>
    `${label} isn't one of ${things ? `your ${things}` : "yours"} any more. Pick another`;

/** `duplicate("a budget for this category this month")` → "You already have a budget …". */
export const duplicate = (thing: string): string => `You already have ${thing}`;

/** The thing's current state doesn't allow this. `conflict("This trip is closed", "Reopen it
 *  to make changes")` → "This trip is closed. Reopen it to make changes". */
export const conflict = (what: string, whatToDo?: string): string => (whatToDo ? `${what}. ${whatToDo}` : what);

export const MESSAGES = {
    internal: "Something went wrong on our side. Please try again",
    routeNotFound: "This part of the app needs an update",
    invalidJson: "The request couldn't be read. Please update the app",
    bodyTooLarge: "That's too big to send",
    unexpectedField: "This request had something the server didn't expect. Please update the app",
    missingBody: "Something was missing from the request. Please update the app",
    duplicateGeneric: "A record with this value already exists",
    rateLimitedAuth: "Too many tries. Wait a few minutes and try again",
    rateLimitedRestore: "Too many restores. Try again in an hour",
    rateLimitedReports: "Too many reports",
    idempotencyInProgress: "This is still being saved. Wait a moment and try again",
    idempotencyMismatch: "This doesn't match what was sent before. Please update the app",
    alreadySaved: "This was already saved",
} as const;

/**
 * What breaks the message rules, or [] when it reads right. For tests: every message helper,
 * error-map sentence and handler default is checked with it, and area workers can check theirs.
 */
export const styleProblems = (message: string): string[] => {
    const out: string[] = [];
    if (!message.trim()) out.push("empty");
    if (message.includes("!")) out.push('has "!"');
    if (/\.\s*$/.test(message)) out.push("ends with a full stop");
    if (/ [—–-]{1,2} /.test(message)) out.push('uses " — " between sentences');
    if (!/^[A-Z"“‘']/.test(message)) out.push("doesn't start with a capital");
    if (/\b[a-f0-9]{24}\b/i.test(message)) out.push("has an id");
    if (/₹\s?\d|\b\d{4,}\b/.test(message)) out.push("has an amount");
    if (/\b(_id|[a-z]+[A-Z][A-Za-z]*)\b/.test(message)) out.push("has a field name");
    if (/\b(zod|mongoose|BSON|ObjectId|Cast to|E11000|enum value|Expected [a-z]+, received|Unrecognized key|HTTP|status code)\b/i.test(message)) out.push("has library or HTTP text");
    return out;
};
