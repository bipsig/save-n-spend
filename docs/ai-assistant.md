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
- [Write actions](#write-actions)
- [Cost and abuse limits](#cost-and-abuse-limits)
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

It is **not** a general-purpose chatbot, and it is not a second way to enter
transactions. Its value is that it can join data the existing screens keep
apart — a budget, a bill due next week, and a savings rate are three screens
today, and the question "can I afford this?" needs all three.

## Stack

| Concern | Choice | Package |
|---|---|---|
| Model (answering) | Claude Sonnet 5 | `claude-sonnet-5` |
| Model (cheap classification) | Claude Haiku 4.5 | `claude-haiku-4-5-20251001` |
| Server SDK | Anthropic TypeScript SDK | `@anthropic-ai/sdk` |
| Data access | Tool use against the service layer | — |
| Transport | SSE over `POST` | `expo/fetch` on the client |
| Persistence | Mongoose model | `mongoose` |

No new infrastructure. The assistant is another Express controller behind the
existing `authMiddleware`, and the mobile side is another screen using the
existing session token.

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
          → rate + spend guard
          → load conversation, truncate to last N turns
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

All read-only. Each one is a plain async function taking `(userId, args, zone)` —
no `Request`, no `Response`.

| Tool | Backed by | Arguments |
|---|---|---|
| `get_spending_summary` | *needs extracting* from `getTransactionSummary` | `startDate`, `endDate` |
| `get_category_breakdown` | *needs extracting* from `getInsights` | `startDate`, `endDate`, `kind` |
| `list_transactions` | *needs extracting* from `filterTransactions` | range, `category`, `account`, `search`, `limit` ≤ 50 |
| `get_upcoming_bills` | *needs extracting* from `listBills` | `withinDays` |
| `get_budget_status` | `budgetService.budgetProgress` ✅ | `month` |
| `get_health_score` | `healthService.healthScore` ✅ | — |
| `get_goals` | `Goal.find` — trivial | — |
| `get_accounts` | `Account.find` — trivial | — |

Deliberately excluded from v1: anything that writes, anything touching `User`
beyond preferences, and any free-text filter that reaches a `$where` or a regex
the model composed.

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
3. Leave the controllers as thin wrappers: parse, call the service, `reply.ok`.

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

Only the last N turns are sent to the model (N ≈ 10, tuned against cost). The
title comes from a Haiku call on the first exchange.

## Write actions

**v1 is read-only.** The assistant cannot create, edit, or delete anything.

When writes arrive, they arrive as *proposals*, never as executed actions. The
model returns a structured `proposed_action` block; the app renders it as a card
with the numbers filled in and a button that opens the **existing** sheet
prefilled. The user confirms in the same UI they would have used anyway.

The reason is [the account balance invariant](architecture.md#the-account-balance-invariant):
a transaction moves a balance, and a wrong one silently corrupts every total,
budget and insight downstream. A model that misreads "spent 500 on lunch, no
wait 600" must not have already written the 500. Confirmation is not friction
here; it is the only thing standing between a parsing slip and bad books.

## Cost and abuse limits

| Guard | Value | Enforced |
|---|---|---|
| Feature flag | `AI_ASSISTANT_ENABLED` | Server, at route mount |
| Messages per user per day | 50 | Server, per `userId` |
| Requests per minute | 6 | `express-rate-limit`, keyed on `userId` not IP |
| Tool rounds per message | 5 | Loop counter — a runaway loop is the real cost risk |
| Max output tokens | 1024 | Request parameter |
| History sent | last 10 turns | Truncation before the call |

Keyed on `userId` rather than IP, unlike `authLimiter`: mobile users share
carrier NAT addresses, so an IP limit would throttle strangers together.

**Note**
Verify current per-token pricing before setting the daily cap — do not carry a
number from this document into a billing assumption. The cap exists so a bug or
a bored user cannot produce an unbounded bill, not as a tuned budget.

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
| Prompt injection via a transaction note | Contained by the fixed tool set and server-side scoping; no tool can widen its own access |
| Model states an unsupported number | Mitigated by the grounding contract, not eliminated — this is the residual risk of the feature |

## Out of scope

Receipt OCR, bank/SMS import, investment advice, and anything phrased as a
recommendation to buy a financial product. The last is a regulatory line, not a
technical one: the assistant describes the user's own data and arithmetic on it,
and does not advise.

## Phasing

| Phase | Scope |
|---|---|
| P0a | Extract the four aggregations into services; no AI code at all |
| P0b | Read-only Q&A: tool set, streaming, persistence, opt-in, limits |
| P1 | `proposed_action` cards for adding a transaction, budget, or goal |
| P2 | Proactive nudges reusing the [notification](architecture.md#notifications) pipeline |

P0a ships behind no flag and changes no behaviour — it is a refactor the codebase
wants anyway, and doing it first means the assistant is never the reason a query
got duplicated. P0b is the whole feature as far as a user is concerned. P1 and P2
should not start until P0b's answers are trusted, because a wrong proposal is
worse than no proposal.

## Configuration reference

| Variable | Where | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `apps/api/.env` | Server-side only. Never an `EXPO_PUBLIC_*` name. |
| `AI_ASSISTANT_ENABLED` | `apps/api/.env` | Kill switch; the route is not mounted when false |
| `AI_ASSISTANT_DAILY_CAP` | `apps/api/.env` | Messages per user per day |

**Important**
`apps/api/.env` holds real credentials and is gitignored. The Anthropic key goes
there and into the Render dashboard — never into `apps/mobile/.env.production`,
which is committed.
