# AI Assistant

This document describes the design of the AI Assistant, the stack chosen for it,
and the reasoning behind each decision. Nothing here is built yet:
`apps/mobile/app/assistant.tsx` is still a `ComingSoon` placeholder.

## Topics

- [What it is](#what-it-is)
- [Stack](#stack)
- [How a question flows](#how-a-question-flows)
- [The tool set](#the-tool-set)
- [Grounding contract](#grounding-contract)
- [Streaming](#streaming)
- [Conversation persistence](#conversation-persistence)
- [It never writes](#it-never-writes)
- [Staying free](#staying-free)
- [Privacy](#privacy)
- [Failure modes](#failure-modes)
- [Out of scope](#out-of-scope)
- [Phasing](#phasing)
- [Configuration reference](#configuration-reference)

## What it is

A chat surface that answers questions about the user's own money, in their own
words, using their real data:

- *"How much did I spend on food last month?"*
- *"Why is my health score down?"*
- *"Am I going to blow my Shopping budget?"*
- *"What's the biggest thing I could cut?"*

It reads and explains, and that is all it does — it cannot change a single
document in the database. It is not a general-purpose chatbot and not a second way
to enter transactions.

Its value is that it can join data the existing screens keep apart. A budget, a
bill due next week and a savings rate are three screens today, and the question
"can I afford this?" needs all three at once.

## Stack

| Concern | Choice | Package |
|---|---|---|
| Model | Claude Haiku 4.5 | `claude-haiku-4-5-20251001` |
| Server SDK | Anthropic TypeScript SDK | `@anthropic-ai/sdk` |
| Data access | Tool use against the service layer, **read-only** | — |
| Transport | SSE over `POST` | `expo/fetch` on the client |
| Persistence | Mongoose model | `mongoose` |

No new infrastructure. The assistant is another Express controller behind the
existing `authMiddleware`, and the mobile side is another screen using the
existing session token.

Two constraints outrank everything else in this document, and every decision
below is downstream of them:

1. **The assistant never writes.** Not in v1, not later. It reads and explains.
2. **The product stays free to the user, always.** No paywall, no credits, no
   "upgrade for more messages".

### Decision: Haiku 4.5, not Sonnet

Sonnet 5 was the obvious first choice and is rejected on cost, because the model
here does not do the hard part.

Every number comes from an aggregation the API already runs. The model picks which
tool to call and then narrates the result in a sentence — a routing-and-phrasing
job, not a reasoning job. Sonnet rates per message buy very little on top of that,
and under a fixed ceiling every rupee spent per message is messages other users
don't get.

Escalating stays available if grounded answers prove unreliable in practice; the
SDK call is one string different. Measure before spending it.

### Decision: the model is called from the API, never from the app

Every model call goes out from `apps/api`. The app never holds an Anthropic key.

This is not a preference. Mobile configuration reaches the app through
`EXPO_PUBLIC_*` variables, which Expo **inlines into the JavaScript bundle** —
that is why `apps/mobile/.env.production` is committed on purpose. There is no
mechanism for the app to hold a secret, so a client-side key would be a
published key.

Server-side calling also buys the three things that matter more than latency:
the user's identity is established by our own JWT before a single token is
spent, tool results are computed from the database rather than trusted from the
client, and the spend cap lives somewhere the user cannot edit.

### Decision: tool use, not prompt stuffing, and never generated queries

Three ways to get a user's data in front of a model:

| Approach | Verdict |
|---|---|
| Summarise everything into the system prompt | Rejected as the primary path |
| Give the model read-only tools it can call | **Chosen** |
| Let the model emit a Mongo query we execute | Rejected outright |

Prompt stuffing fails on size and on staleness. A two-year-old account has
thousands of transactions; any summary small enough to send is too lossy to
answer *"what did I spend at that restaurant in March"*. It also pays for the
full context on every message, including "hi".

Generated queries are rejected on security grounds and not revisited. A model
emitting `find()` filters is one prompt injection away from reading another
user's documents, and the injection vector is real: transaction titles, notes
and category names are all attacker-controlled free text that ends up in the
context window. A fixed tool set with server-supplied scoping has no such
opening.

**Important**
`userId` comes from `req.user.userId` and is passed *into* each tool by the
controller. It is never part of a tool's input schema, so it is not something the
model can supply, hallucinate, or be talked into changing. Any account or
category id the model does pass is verified to belong to that user before it
reaches a query. This is the single most important invariant in the feature.

A small context preamble is still sent with each conversation (today's date in
the user's zone, currency, account names, the category tree, the current health
score). It is bounded, it is what nearly every question needs, and it saves a
tool round-trip on the common case.

## How a question flows

```
assistant screen
  → POST /api/v1/assistant/messages        (SSE response)
      → authMiddleware                     (userId from JWT)
      → assistantController
          → daily cap + monthly ceiling guard
          → load conversation, truncate to last 8 turns
          → build preamble (zone, currency, accounts, category tree)
          → Anthropic messages.stream(tools: READ_TOOLS)
              ↕ tool_use / tool_result loop, max 5 rounds
                  → assistantTools.ts   (arg validation, userId injection)
                      → the service layer, same code the REST routes call
                      → Mongo, scoped to userId
          → stream text deltas to the client as they arrive
          → persist the finished turn
```

The tool loop lives entirely inside one request. The client sees text arriving
and, optionally, a `tool` event naming what is being looked up — *"Checking your
budgets…"* — which is honest progress rather than a spinner.

## The tool set

Eight tools, all reads. Each is a plain async function taking `(userId, args, zone)`
— no `Request`, no `Response`. The registry is the complete list of everything the
assistant can do.

| # | Tool | Returns | Answers |
|---|---|---|---|
| 1 | `get_spending_summary` | Income, expense and net totals for a date range | "How much did I spend last month?" |
| 2 | `get_category_breakdown` | Spend per parent category for a range, descending | "Where does my money go?" |
| 3 | `list_transactions` | Individual transactions, newest first, max 50 | "What did I buy at that restaurant in March?" |
| 4 | `get_budget_status` | Each budget with its limit, spend and remaining | "Am I going to blow my Shopping budget?" |
| 5 | `get_upcoming_bills` | Unpaid bills due within N days, with amounts | "What's due before payday?" |
| 6 | `get_goals` | Goals with target, saved so far and progress | "How close am I on the laptop fund?" |
| 7 | `get_health_score` | The score and its five pillar breakdowns | "Why is my health score down?" |
| 8 | `get_accounts` | Accounts with current balances | "How much do I actually have?" |

### Arguments and backing code

| Tool | Arguments | Backed by |
|---|---|---|
| `get_spending_summary` | `startDate`, `endDate` | *needs extracting* from `getTransactionSummary` |
| `get_category_breakdown` | `startDate`, `endDate`, `kind` | *needs extracting* from `getInsights` |
| `list_transactions` | range, `category`, `account`, `search`, `limit` ≤ 50 | *needs extracting* from `filterTransactions` |
| `get_budget_status` | `month` | `budgetService.budgetProgress` ✅ |
| `get_upcoming_bills` | `withinDays` | *needs extracting* from `listBills` |
| `get_goals` | — | `Goal.find` — trivial |
| `get_health_score` | — | `healthService.healthScore` ✅ |
| `get_accounts` | — | `Account.find` — trivial |

Tools 4 and 7 are callable today. Tools 6 and 8 are one-line queries. The other
four need the refactor below.

**Important**
There is no ninth tool, and no write tool. The registry is not a starting point to
be grown — it is the boundary of the feature. Anything the assistant should be able
to *do* rather than *say* belongs in a screen, not here. See
[It never writes](#it-never-writes).

Also excluded: anything reading `User` beyond `prefs`, so `password`,
`resetToken`, `resetTokenExpiry` and `totpSecret` are unreachable by construction
rather than by filtering.

**Important**
Tool 3's `search` argument needs work in the existing code before it is exposed to
a model. `filterTransactions` passes the term straight into `$regex` with no
escaping and no length cap:

```ts
// transactionController.ts:89
if (search) {
    filters.title = { $regex: search, $options: "i" };   // unescaped
}
// transactionSchema.ts:42
search: z.string().optional(),                            // uncapped
```

So `(` returns a 500 from an invalid regex, `.` and `*` silently behave as
metacharacters, and a pattern like `(a+)+b` is catastrophic backtracking executed
on the database. This is reachable from the Activity screen's search box today —
it is not introduced by the assistant — but a model choosing the search string
makes it far easier to hit by accident. Escape the term and cap it at ~64
characters as part of [P0a](#phasing).

### Prerequisite: the aggregations are fused to `req`

Only two of the eight are callable today. `budgetProgress` and `healthScore` are
real services with plain signatures — those two work as-is. The other
aggregations live **inside the controllers**, not in the service layer, and each
one is welded to the request object in three separate ways:

```ts
export const getTransactionSummary = async (req: Request, res: Response) => {
    const { startDate, endDate } = transactionSummaryQuerySchema.parse(req.query);
    const match = { userId: new mongoose.Types.ObjectId(req.user!.userId), … };
    const zone = await resolveZone(req);            // also takes a Request
```

Args come from `req.query`, identity from `req.user`, and the zone from a helper
that itself takes a `Request`. A tool cannot call this without fabricating a fake
`Request`, which is the kind of shortcut that works on Friday and is load-bearing
by Monday.

So P0 starts with a refactor, not with the model:

1. Move each aggregation into its service — `transactionService.summarise(userId, range, zone)`,
   `insightsService.categoryBreakdown(...)`, and so on. Plain arguments, no Express types.
2. Add `resolveZoneForUser(userId)` and let the existing `resolveZone(req)` call
   it. The comment in `utils/userZone.ts` already claims the zone is resolvable
   "by the reminder job at 3am with no request in sight" — this makes that true.
3. Escape and cap the `search` term, per the note above.
4. Leave the controllers as thin wrappers: parse, call the service, `reply.ok`.

This is worth doing on its own merits, and it is what keeps the tools honest:
the assistant and the REST endpoints then run *the same* query, so an answer in
chat cannot disagree with the number on the screen behind it. Duplicating the
aggregation into a tool layer would guarantee they eventually drift.

**Note**
`get_category_breakdown` returns parent headings only, because the underlying
aggregation buckets on `parent ?? _id`. The system prompt has to say so, or the
model will confidently report that the user spent nothing on Groceries. See
[Sub-category roll-up](api-reference.md#sub-category-roll-up).

## Grounding contract

The system prompt is where this feature is won or lost. Four facts are not
optional:

| Fact | Why it must be stated |
|---|---|
| Amounts are integer **paise** | Without it the model reports ₹840,000 for a ₹8,400 expense. |
| Today's date **in the user's zone** | "This month" is otherwise resolved in UTC, and an Asia/Kolkata user loses the first 5½ hours of every month. See [Time zones](architecture.md#time-zones). |
| Sub-category spend rolls into the parent | Otherwise breakdowns get misread as gaps. |
| Never state a number a tool did not return | A finance assistant that estimates is worse than one that says it doesn't know. |

The zone is resolved once per request and passed to every tool, so date ranges are
clamped in the account's zone exactly as the REST endpoints clamp them. The model
is given a date, never a timezone calculation to perform.

## Streaming

Responses stream as SSE. A grounded answer takes two model calls and a database
round-trip; 6–15 seconds behind a spinner reads as broken.

React Native's global `fetch` cannot stream a response body — Hermes has no
`ReadableStream` on it, and `res.body` is null. Two viable routes:

| Option | Verdict |
|---|---|
| `expo/fetch` (WinterCG fetch, SDK 52+) | **Chosen** — real `ReadableStream`, no new dependency |
| `XMLHttpRequest` progressive `responseText` | Fallback if `expo/fetch` disappoints on device |

Expo 54 is already the pinned SDK, so `import { fetch } from "expo/fetch"` costs
nothing — and the API is confirmed present in the installed copy, not just in the
release notes:

```
node_modules/expo/fetch.js                       → src/winter/fetch/index
build/winter/fetch/FetchResponse.d.ts:14
  get body(): ReadableStream<Uint8Array<ArrayBuffer>> | null
```

What remains unverified is device behaviour under a long-lived SSE connection —
backgrounding, network handover, and whether deltas arrive promptly or buffered.
Smoke-test that before building the chat UI on it. The XHR route is the escape
hatch and needs no server change.

Event types: `text` (delta), `tool` (name only, for the progress line), `done`
(with the persisted message id), `error` (a message safe to show).

The [cold-start gate](architecture.md#cold-start-gate) already covers the case
where the Render instance is asleep when the user opens the tab.

## Conversation persistence

A `Conversation` model on the server, not history held by the client.

```
Conversation { userId, title, lastMessageAt }
Message      { conversationId, userId, role, content, toolCalls?, tokens? }
```

Client-held history was rejected for two reasons. A client that sends its own
prior turns can forge assistant turns — *"Earlier you told me I have ₹50,000
spare"* — and injections then persist across a conversation. And history that
lives on one device is lost on reinstall, which is exactly when someone would
want to look back at what they were told.

Only the last 8 turns are sent to the model, truncated before the call.

The conversation title is the first user message, trimmed to ~40 characters — not
a model-generated summary. A title call is a whole extra request per conversation
to make a list look tidier, and *"How much did I spend on food…"* is a perfectly
good label for a conversation that starts with those words.

## It never writes

**The assistant is read-only, permanently.** It cannot create, edit, archive, or
delete anything. This is a product decision, not a phasing decision — there is no
later milestone where writes arrive.

The reason is [the account balance invariant](architecture.md#the-account-balance-invariant):
a transaction moves an account balance, and a wrong one silently corrupts every
total, budget, insight and health score downstream. Corruption of that kind is
not obvious when it happens — it surfaces weeks later as a balance that doesn't
match the bank, with no way to tell which row was wrong. A model that misreads
"spent 500 on lunch, no wait 600" must never have been able to write the 500.

Entering data is what the app's forms are for, and they are fast. The assistant's
job is the thing the forms can't do: joining a budget, a bill due next week and a
savings rate into one answer.

**Important**
Read-only is enforced structurally, not by instruction. The tool registry contains
only read functions, so there is no write path for a prompt to reach — the model
cannot be talked into calling a tool that was never registered. Do not add a write
tool "behind a confirmation" later; a confirmation is a UI promise, while an absent
tool is a guarantee.

Rejected on the way here: a `proposed_action` block that prefills an existing
sheet for the user to confirm. It is a defensible design and a common one, and it
was in an earlier draft of this document. It is out because it makes the assistant
a second entry path into the ledger, and the ledger is the one thing in this app
that must have exactly one.

## Staying free

The user pays nothing, ever. That does not make the tokens free — it moves the
cost onto whoever operates the API, which means the cost has to be *bounded* by
construction rather than watched.

Be clear about what "free no matter what" can and cannot mean. Two honest
readings:

| Reading | Consequence |
|---|---|
| Free to the user, bill absorbed by the operator | Needs a ceiling, or one viral week produces a bill nobody can pay |
| Free to the user **and** the bill cannot exceed a fixed figure | The assistant must be allowed to *pause* when the ceiling is hit |

**This design takes the second.** A feature that silently becomes unaffordable
gets switched off in a hurry and never comes back; a feature that pauses politely
at a known ceiling stays shipped forever. So the ceiling is a first-class part of
the design, not an alarm.

### Guards

| Guard | Value | Enforced |
|---|---|---|
| Global monthly spend ceiling | `AI_MONTHLY_TOKEN_CEILING` | Server, checked before every call |
| Messages per user per day | 30 | Server, per `userId` |
| Requests per minute | 6 | `express-rate-limit`, keyed on `userId` not IP |
| Tool rounds per message | 5 | Loop counter — a runaway loop is the real cost risk |
| Max output tokens | 600 | Request parameter |
| History sent | last 8 turns | Truncation before the call |
| Feature flag | `AI_ASSISTANT_ENABLED` | Server, at route mount |

Keyed on `userId` rather than IP, unlike `authLimiter`: mobile users share carrier
NAT addresses, so an IP limit would throttle strangers together.

The two levers that actually move the bill are **prompt caching** and **output
length**. The system prompt and the context preamble are byte-identical across a
user's whole conversation, so they should be marked cacheable — that is most of the
input tokens on every message after the first. And an assistant answering "how
much did I spend on food" needs two sentences, not six paragraphs; the system
prompt should ask for brevity and `max_tokens` should enforce it.

### When the ceiling is reached

The assistant enters a resting state. It says so plainly — *"I'm resting until the
1st. Everything else in the app works normally."* — and the rest of the app is
untouched.

This is why the assistant must stay a **leaf feature**: nothing in the dashboard,
insights, budgets or notifications may ever call it or depend on it. If the
assistant is the only path to some number, pausing it breaks the product and the
ceiling becomes unusable. Every question it answers must have a screen that
answers it too, more slowly.

**Note**
Set the ceiling from current per-token pricing when you build this — do not carry
a number out of this document into a billing assumption. Size it so the worst
month you would tolerate is the ceiling, then let the resting state handle the
rest.

## Privacy

Using the assistant sends the user's financial data to Anthropic. That is a
material change in where their money data goes, so:

- **Explicit opt-in on first use**, on a screen that says plainly what leaves the
  device and lets them decline and keep using the app.
- A **settings toggle** to turn it off and delete stored conversations.
- `password`, `resetToken`, `resetTokenExpiry` and `totpSecret` are never in
  scope for any tool — the same rule the REST API already follows.
- `security.*` settings stay device-local and are never sent, as today.

Privacy mode is a **display** concern and stays that way: the model receives
real amounts, and the chat transcript masks them on render like every other
amount in the app. Masking the model's input would produce answers about
`₹ ••••`.

## Failure modes

| Failure | Behaviour |
|---|---|
| Anthropic unreachable or 5xx | Stream an `error` event; the user's message stays in the box so it isn't lost |
| Rate limit hit | Explain which limit and when it resets — never a bare 429 |
| Tool throws | Return the error to the model as a `tool_result`; it can say what it couldn't check |
| Tool loop hits 5 rounds | Stop, answer with what was gathered, say the answer is partial |
| Prompt injection via a transaction note | Contained by the fixed tool set and server-side scoping; no tool can widen its own access, and no tool writes |
| Monthly ceiling reached | Resting state, explained in the chat; the rest of the app is unaffected |
| Model states an unsupported number | Mitigated by the grounding contract, not eliminated — this is the residual risk of the feature |

## Out of scope

Permanently, not "not yet":

| Not building | Why |
|---|---|
| Any write, edit, or delete | [It never writes](#it-never-writes) |
| Proactive AI nudges | Tokens spent with nobody asking is the worst possible cost profile under a fixed ceiling. The existing rule-based [notifications](architecture.md#notifications) already cover budget and bill alerts for free. |
| Receipt OCR, bank/SMS import | Large scope, and both are write paths |
| Investment or product advice | A regulatory line, not a technical one — the assistant describes the user's own data and arithmetic on it, and does not advise |

## Phasing

| Phase | Scope |
|---|---|
| P0a | Extract the four aggregations into services; no AI code at all |
| P0b | Read-only Q&A: tool set, streaming, persistence, opt-in, guards |

P0a ships behind no flag and changes no behaviour — it is a refactor the codebase
wants anyway, and doing it first means the assistant is never the reason a query
got duplicated. P0b is the feature, whole. There is no P1: the two things that
would have been in it are now [out of scope](#out-of-scope) on purpose.

## Configuration reference

| Variable | Where | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `apps/api/.env` | Server-side only. Never an `EXPO_PUBLIC_*` name. |
| `AI_ASSISTANT_ENABLED` | `apps/api/.env` | Kill switch; the route is not mounted when false |
| `AI_ASSISTANT_DAILY_CAP` | `apps/api/.env` | Messages per user per day |
| `AI_MONTHLY_TOKEN_CEILING` | `apps/api/.env` | Global ceiling; the assistant rests once it is reached |

**Important**
`apps/api/.env` holds real credentials and is gitignored. The Anthropic key goes
there and into the Render dashboard — never into `apps/mobile/.env.production`,
which is committed.
