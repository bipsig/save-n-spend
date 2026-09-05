# API reference

All endpoints are mounted under `/api/v1`. Every endpoint except
`POST /auth/register` and `POST /auth/login` requires a bearer token.

Every response uses the envelope described in
[Response envelope](architecture.md#response-envelope). The tables below
describe the contents of `data`.

**Important**
Every monetary field is an **integer number of paise**. See
[Money representation](architecture.md#money-representation).

## Topics

- [Common request headers](#common-request-headers)
- [Auth](#auth)
- [Users](#users)
- [Accounts](#accounts)
- [Categories](#categories)
- [Transactions](#transactions)
- [Budgets](#budgets)
- [Bills](#bills)
- [Goals](#goals)
- [Notifications](#notifications)
- [Dashboard](#dashboard)
- [Insights](#insights)
- [Liveness](#liveness)

## Common request headers

| Header | Value | Required |
|---|---|---|
| `Authorization` | `Bearer <token>` | Yes, except on `/auth/register` and `/auth/login`. |
| `Content-Type` | `application/json` | Yes, on requests with a body. |

**Note**
Request bodies are validated with `.strict()` Zod objects in most resources.
An unrecognized field is a 400, not a silently ignored key. This is deliberate:
it catches a renamed field at the call site instead of after the write.

## Auth

### POST /auth/register

Creates a user and returns an access token. Rate-limited.

| Field | Type | Constraints |
|---|---|---|
| `name` | string | At least 2 characters, trimmed. |
| `email` | string | Valid email. Unique — a duplicate is a 409. |
| `password` | string | At least 8 characters. |
| `timeZone` | string | Optional. IANA zone name from the device, e.g. `Asia/Kolkata`; seeds `prefs.timeZone`. Omitted or unrecognized falls back to the server default. Accepted only here — an existing account's zone changes through `PATCH /users/me`, so travelling can't re-cut a user's history. |

### POST /auth/login

Exchanges credentials for an access token. Rate-limited. Same `email` and
`password` constraints as registration.

**Note**
Tokens are valid for 7 days. There is no refresh endpoint; the app signs the
user out on the first 401 and they log in again.

### GET /auth/me

Returns the authenticated user. The mobile app calls this on boot to prove a
restored token is still valid.

## Users

### PATCH /users/me

Updates the caller's own profile and preferences. All fields optional.

| Field | Type | Constraints |
|---|---|---|
| `pushToken` | string \| null | Expo push token for this device. `null` detaches it — the app sends that on sign-out, so the account's reminders stop reaching a phone somebody else is now signed in on. |
| `prefs.defaultAccount` | string \| null | Account ID, or `null` to clear. |
| `prefs.timeZone` | string | IANA zone name, e.g. `Asia/Kolkata`. Rejected if the server can't resolve it. Every day, month, and window the API cuts is cut in this zone. |
| `prefs.notifications.enabled` | boolean | Primary notification switch. |
| `prefs.notifications.billReminderLead` | 1 \| 3 \| 7 | Days of lead time before a bill is due. |
| `prefs.notifications.budgetAlerts` | boolean | |
| `prefs.notifications.goalMilestones` | boolean | |
| `prefs.notifications.weeklySummary` | boolean | |

## Accounts

| Method | Path | Description |
|---|---|---|
| `GET` | `/accounts` | Lists the caller's accounts. |
| `POST` | `/accounts` | Creates an account. |
| `GET` | `/accounts/{id}` | Retrieves one account. |
| `PATCH` | `/accounts/{id}` | Updates an account's name, type, icon, or color. |
| `DELETE` | `/accounts/{id}` | **Archives** the account. It is not deleted. |

### POST /accounts

| Field | Type | Constraints |
|---|---|---|
| `name` | string | Required, non-empty, trimmed. |
| `type` | enum | `bank` \| `credit_card` \| `cash` \| `wallet`. |
| `startingBalance` | integer | Required. Paise. May be negative. |
| `icon` | string | Optional. Icon name from `lib/icons.ts`. |
| `color` | string | Optional. Color token. See [Design system](design-system.md). |

**Important**
`startingBalance` can be set only at creation — `updateAccountSchema` omits it.
The current `balance` is derived from transaction effects and must never be
patched directly. See
[The account balance invariant](architecture.md#the-account-balance-invariant).

Deleting archives rather than removes, because past transactions reference the
account and would otherwise lose their source.

## Categories

| Method | Path | Description |
|---|---|---|
| `GET` | `/categories` | Lists the caller's categories. |
| `POST` | `/categories` | Creates a category. |
| `GET` | `/categories/{id}` | Retrieves one category. |
| `PATCH` | `/categories/{id}` | Updates name, icon, or color. |
| `DELETE` | `/categories/{id}` | **Archives** the category. |

### POST /categories

| Field | Type | Constraints |
|---|---|---|
| `name` | string | Required, non-empty, trimmed. |
| `kind` | enum | `expense` \| `income`. |
| `parent` | string | Optional. Parent category ID, which makes this a sub-category. |
| `icon` | string | Optional. |
| `color` | string | Optional. |

Categories are one level deep: a category has an optional `parent`, and a
sub-category cannot itself be a parent.

**Note**
`kind` and `parent` are immutable — `updateCategorySchema` omits both. Changing
a category's kind would strand every transaction already filed under it.

New users are provisioned with the set in `apps/api/src/data/defaultCategories.ts`.

## Transactions

| Method | Path | Description |
|---|---|---|
| `GET` | `/transactions` | Lists transactions, filtered and paginated. |
| `POST` | `/transactions` | Creates a transaction and applies its balance effect. |
| `GET` | `/transactions/summary` | Totals for a date range. |
| `GET` | `/transactions/{id}` | Retrieves one transaction. |
| `PATCH` | `/transactions/{id}` | Updates a transaction and re-applies its effect. |
| `DELETE` | `/transactions/{id}` | Deletes a transaction and reverts its effect. |

### POST /transactions

The body is a **discriminated union on `type`**. The fields you must send depend
on which type you pick.

Fields common to every type:

| Field | Type | Constraints |
|---|---|---|
| `amount` | integer | Required. Positive paise. Direction comes from `type`, never from a sign. |
| `account` | string | Required. Account ID. |
| `occurredAt` | string | Optional ISO timestamp. Defaults to now. |
| `note` | string | Optional. |
| `location` | string | Optional. |
| `receiptUrl` | string | Optional. |
| `paymentMode` | enum | Optional. `cash` \| `upi` \| `card` \| `transfer`. |

Type-specific fields:

| `type` | Additional required fields | Notes |
|---|---|---|
| `expense`, `income` | `category`, `title` (non-empty) | A spend. `title` is what the user sees in the list. |
| `transfer` | `toAccount` | Carries no `title` and no `category` — a transfer moves money, it does not classify it. |
| `positiveAdjustment`, `negativeAdjustment` | — (`title` optional) | Reconciliation entries, for correcting a drifted balance. |

**Warning**
`amount` is always positive. Sending a negative amount fails validation. An
expense is negative because `type` is `expense`, not because the number is.

### GET /transactions

| Parameter | Type | Default | Description |
|---|---|---|---|
| `startDate` | `YYYY-MM-DD` | — | Start of the range, inclusive. |
| `endDate` | `YYYY-MM-DD` | — | End of the range. |
| `category` | string | — | Category ID. |
| `type` | enum | — | `expense` \| `income` \| `transfer`. |
| `search` | string | — | Free-text match on the title. |
| `page` | integer | `1` | 1-based page number. |
| `limit` | integer | `20` | Page size. Maximum 100. |

**Important**
`startDate` and `endDate` must be supplied together. Sending one without the
other returns `400 startDate and endDate must be provided together`.

Results are paginated with `mongoose-paginate-v2`.

### GET /transactions/summary

Accepts the same paired `startDate` and `endDate` parameters, with the same
together-or-neither rule.

## Budgets

A budget is a spending limit for one category in one month.

| Method | Path | Description |
|---|---|---|
| `GET` | `/budgets` | Lists budgets for a month with spend-to-date. |
| `POST` | `/budgets` | Creates a budget. |
| `PATCH` | `/budgets/{id}` | Changes the limit. |
| `DELETE` | `/budgets/{id}` | Deletes the budget. |

### GET /budgets

| Parameter | Type | Default | Description |
|---|---|---|---|
| `month` | `YYYY-MM` | Current month | Which month's budgets to return. |

Returns an array of `{ budget, spent }`, where `spent` is the total already
spent in that category during that month, in paise.

**Note**
Because `month` accepts any valid `YYYY-MM`, past months need no special
support server-side. The Budget screen's month navigator is a pure client
feature built on this parameter.

### POST /budgets

| Field | Type | Constraints |
|---|---|---|
| `category` | string | Required. Category ID. |
| `month` | string | Required. Must match `^\d{4}-(0[1-9]\|1[0-2])$`. |
| `limit` | integer | Required. Positive paise. |

`PATCH /budgets/{id}` accepts `limit` only. To move a budget to a different
category or month, delete it and create a new one.

The month window is computed in UTC by `utils/monthRange.ts`.

## Bills

| Method | Path | Description |
|---|---|---|
| `GET` | `/bills` | Lists bills. |
| `POST` | `/bills` | Creates a bill. |
| `PATCH` | `/bills/{id}` | Updates a bill. |
| `DELETE` | `/bills/{id}` | Deletes a bill. |
| `POST` | `/bills/{id}/pay` | Marks the bill paid and logs the expense. |
| `POST` | `/bills/{id}/skip` | Skips this cycle without logging anything. |

### POST /bills

| Field | Type | Constraints |
|---|---|---|
| `name` | string | Required, non-empty. |
| `amount` | integer | Required. Positive paise. |
| `dueDate` | date | Required. Coerced from an ISO string. |
| `category` | string \| null | Optional. |
| `account` | string | Optional. Which account it is normally paid from. |
| `recurring` | boolean | Optional. |
| `frequency` | enum | Optional. `monthly` \| `yearly`. Meaningful only when `recurring` is true. |
| `reminderDays` | integer | Optional. Days of lead time, 0 or more. |

### GET /bills

| Parameter | Type | Description |
|---|---|---|
| `status` | enum | Optional. `pending` \| `paid`. |

### POST /bills/{id}/pay

| Field | Type | Description |
|---|---|---|
| `account` | string | Optional. Overrides the bill's account for this payment. |

Paying a bill creates a real expense transaction, so it moves the account
balance through the same `applyEffects` path as any other expense. A recurring
bill's `dueDate` rolls forward by its `frequency`.

**Note**
`reminderDays` schedules a notification. It never moves money on its own.

## Goals

| Method | Path | Description |
|---|---|---|
| `GET` | `/goals` | Lists goals. |
| `POST` | `/goals` | Creates a goal. |
| `PATCH` | `/goals/{id}` | Updates a goal. |
| `DELETE` | `/goals/{id}` | Deletes a goal. |
| `POST` | `/goals/{id}/contribute` | Adds to the amount saved. |

### POST /goals

| Field | Type | Constraints |
|---|---|---|
| `name` | string | Required. 1–60 characters. |
| `target` | integer | Required. Positive paise. |
| `icon` | string | Optional. |
| `color` | string | Optional. |
| `deadline` | date | Optional. Coerced from an ISO string. |

`PATCH /goals/{id}` accepts the same fields, all optional, and additionally
allows `deadline: null` to clear a deadline.

### POST /goals/{id}/contribute

| Field | Type | Constraints |
|---|---|---|
| `amount` | integer | Required. Positive paise. |

`Goal.saved` is clamped at `target`, so a goal can reach 100% but never exceed
it. The mobile Contribute sheet validates against the remaining amount before
submitting, which turns an over-contribution into an inline message instead of
a server error.

**Note**
A contribution is not a transaction and does not move an account balance. Goals
track intent to save; they are not an account.

## Notifications

| Method | Path | Description |
|---|---|---|
| `GET` | `/notifications` | Lists the caller's notifications, newest first. |
| `PATCH` | `/notifications/{id}/read` | Marks one notification read. |
| `POST` | `/notifications/read-all` | Marks every unread notification read. |

Notifications are written by the server, never by the client — there is no
create endpoint. See
[Notifications](architecture.md#notifications) for what raises each kind.

### GET /notifications

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | `1` | 1-based page number. |
| `limit` | integer | `20` | Page size, max 50. |

| Response field | Type | Description |
|---|---|---|
| `items` | array | Notifications: `_id`, `type`, `title`, `body`, `link`, `readAt`, `pushedAt`, `createdAt`. |
| `unread` | integer | Unread count across the whole feed, not this page. Drives the bell's dot and the app icon badge. |
| `page` | integer | Echo of the requested page. |
| `hasNextPage` | boolean | Whether an older page exists. |

`type` is one of `billReminder`, `billOverdue`, `budgetWarning`,
`budgetExceeded`, `goalMilestone`, `goalDeadline`, `weeklySummary`.

`link` is `{ screen, id? }` and is what the row opens when tapped. A
notification with no `link` is informational and navigates nowhere.

**Note**
Notifications expire 90 days after they are created, through a TTL index. The
feed is a log, not a record — and the expiry is also what lets a yearly bill's
reminder fire again next year.

### PATCH /notifications/{id}/read

Takes no body. Returns `{ notification, unread }` with the updated
notification and the new unread count, so the client never has to guess the
badge. Idempotent: marking an already-read notification read again succeeds and
preserves the original `readAt`. A notification belonging to another user is a
404, not a 403.

### POST /notifications/read-all

Takes no body. Returns `{ unread: 0 }`.

## Dashboard

### GET /dashboard/summary

| Parameter | Type | Default | Description |
|---|---|---|---|
| `month` | `YYYY-MM` | Current month | Which month to summarize. |

Returns the aggregate the home screen renders in one request, rather than
having the client fan out across resources.

### GET /dashboard/health

Takes no parameters. The financial health score, always as of now: unlike the
summary it describes a trailing 90-day window rather than a named month, so
there is nothing for a caller to choose. That difference in span is also why it
is a separate request and not a field on `/dashboard/summary`.

| Field | Type | Description |
|---|---|---|
| `score` | `number \| null` | 0–100. `null` when there is not enough history to score. |
| `band` | enum | `excellent` \| `good` \| `fair` \| `attention` \| `risk` \| `unknown`. |
| `rating` | string | Human label for the band, e.g. `Needs attention`. |
| `windowDays` | integer | Trailing days the money figures are measured over (90). |
| `pillars` | array | The five components. See below. |
| `focus` | object? | `{ key, label, hint }` — the weakest pillar with something to say. |
| `reason` | string? | Why there is no score. Present only when `score` is `null`. |

Each pillar:

| Field | Type | Description |
|---|---|---|
| `key` | enum | `savings` \| `buffer` \| `bills` \| `budgets` \| `goals`. |
| `label` | string | Display name, e.g. `Safety buffer`. |
| `score` | `number \| null` | 0–100, or `null` when the pillar does not apply to this user yet. |
| `weight` | integer | Its share of the total before renormalising: 30 / 25 / 20 / 15 / 10. |
| `value` | string | The measurement, pre-formatted: `18%`, `2.4 months`, `1 of 4 late`. |
| `verdict` | string | `On track` \| `Okay` \| `Watch` \| `Off track`. |
| `hint` | string? | What to do about it. Present only below par. |

Pillars are always returned heaviest first, and an inapplicable pillar is
returned with `score: null` rather than omitted — the client shows it as "not
counted yet". The total is the weighted average of the applicable pillars only.
See [Health score](architecture.md#health-score) for the reasoning behind the
weights, the curves and the confidence gate.

## Insights

### GET /insights

| Parameter | Type | Default | Description |
|---|---|---|---|
| `period` | enum | `month` | `week` \| `month` \| `year`. |
| `offset` | integer | `0` | Whole periods back from the current one. Must be 0 or negative. |

A positive `offset` is rejected with a 400. See
[Period windowing](architecture.md#period-windowing).

## Liveness

### GET /health

Returns `{ "ok": true }`. This is the only endpoint outside `/api/v1`, the only
one with no envelope, and the only one that needs no token — it exists for the
host's health check.

The mobile app also uses it as its wake-up probe: the free Render tier suspends
an idle instance, so the app polls this endpoint at launch and shows a waking
screen until it answers. Not to be confused with
[GET /dashboard/health](#get-dashboardhealth), which is the user's financial
health score.
