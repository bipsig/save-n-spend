# API reference

All endpoints are mounted under `/api/v1`. Every endpoint except
`POST /auth/register`, `POST /auth/login` and `POST /diagnostics/client-errors`
requires a bearer token; so does nothing outside `/api/v1` but
[`GET /health`](#get-health). `apps/api/test/http/route-matrix.test.ts` reads
every mounted route from the Express router and fails if any other route answers
without a token.

Every response uses the envelope described in
[Response envelope](architecture.md#response-envelope). The tables below
describe the contents of `data`.

**Important**
Every monetary field is an **integer number of paise**. See
[Money representation](architecture.md#money-representation).

## Topics

- [Common request headers](#common-request-headers)
- [Idempotency-Key](#idempotency-key)
- [Pages](#pages)
- [Errors](#errors)
- [Auth](#auth)
- [Users](#users)
- [Accounts](#accounts)
- [Categories](#categories)
- [Transactions](#transactions)
- [Budgets](#budgets)
- [Bills](#bills)
- [Goals](#goals)
- [Notifications](#notifications)
- [Recurring suggestions](#recurring-suggestions)
- [Dashboard](#dashboard)
- [Insights](#insights)
- [Highlights](#highlights)
- [Review](#review)
- [Cash flow](#cash-flow)
- [Investments](#investments)
- [Trips](#trips)
- [Backup](#backup)
- [Diagnostics](#diagnostics)
- [Liveness](#liveness)
- [Known issues](#known-issues)

## Common request headers

| Header | Value | Required |
|---|---|---|
| `Authorization` | `Bearer <token>` | Yes, except on `/auth/register`, `/auth/login` and `/diagnostics/client-errors`. |
| `Content-Type` | `application/json` | Yes, on requests with a body. |
| `Idempotency-Key` | 1–255 characters, `A–Z a–z 0–9 _ -` | No. On the writes listed under [Idempotency-Key](#idempotency-key). |

**Note**
Every `POST`, `PATCH` and `PUT` body is checked before the handler runs
(`middleware/validate.ts`), and an unrecognized field is a `400` `invalid_input`
(`This request had something the server didn't expect. Please update the app`),
not a silently ignored key. This is deliberate: it catches a renamed field at the
call site instead of after the write. The documents inside a backup file are the
one place extra fields are kept. Three related rules hold on every route:

- A `DELETE` takes no body and ignores one if sent.
- Unknown **query** parameters are dropped, not refused.
- An id in the path that is malformed, missing or another user's is a `404`
  `not_found`, checked before the body.

## Idempotency-Key

From 2.8.0. One key per thing the user means to do: the app makes it when the
form or sheet opens and sends the same key on every retry of that write
(a re-tap after an error, an offline-queue resend), so the write lands once.
The header is optional. Without it a route behaves exactly as before, and a
write that moves money logs one `warn` line, `Money write without an
Idempotency-Key`, to stdout (not to the request log the app can read).

| Situation | Answer |
|---|---|
| First send | The route runs. A 2xx reply is stored with the key. |
| Same key, same route, path, query and body, after the first finished with a 2xx | The stored reply, byte for byte, with `Idempotent-Replayed: true`. Nothing runs again. |
| Same key with a different route, path, query or body | `422` `idempotency_mismatch`. Nothing runs. |
| Same key while the first send is still running | `409` `idempotency_in_progress` with `Retry-After` (1–5 seconds). Nothing runs. |
| The first send answered anything but a 2xx and wrote nothing | The key is released: the next send with it runs as new. |
| The write committed but the reply was never stored (the server died in between, or failed after the commit) | `409` `idempotency_in_progress` for up to 60 seconds after the first send, then `200` `{ "success": true, "statusCode": 200, "message": "This was already saved", "data": null }` with `Idempotent-Replayed: true`. The write is never run twice. Re-read the list to see what landed. |
| A malformed key (empty, over 255 characters, or other characters) | `400` `invalid_input`, issue path `Idempotency-Key`. |

Keys are per user and remembered for 90 days (`IdempotencyRecord`, TTL index).
The record is claimed before the route runs and marked committed inside the
write's own MongoDB transaction, so "this key's write landed" and the write
itself commit together. A claim whose write never committed (the server died
first) can be taken over 60 seconds after it was made; the first attempt can
then no longer commit.

On `POST /transactions`, the body `clientId` keeps working as before, with or
without the header.

**Routes that take a key.** Money moves: `POST /accounts` (an opening balance),
`PATCH /accounts/{id}/balance`, `POST /transactions`, `PATCH /transactions/{id}`,
`DELETE /transactions/{id}`, `POST /transactions/{id}/convert-to-investment`,
`POST /transactions/convert-to-investment`, `POST /bills/{id}/pay`,
`POST /goals/{id}/contribute`, `POST /backup/restore`,
`PATCH /investments/{id}/basis`, `DELETE /investments/{id}`, `DELETE /trips/{id}`,
`POST /trips/{id}/expenses`, `PATCH /trips/{id}/expenses/{expenseId}`,
`DELETE /trips/{id}/expenses/{expenseId}`, `POST /trips/{id}/settle`,
`PUT /trips/{id}/plan`, `DELETE /trips/{id}/plan`, `POST /trips/{id}/close`,
`POST /trips/{id}/import/commit`. Creates and the due-date move:
`POST /categories`, `POST /budgets`, `POST /bills`, `POST /bills/{id}/skip`,
`POST /goals`, `POST /trips`. Any other route ignores the header. Each of these
writes inside a transaction, so its record is marked committed in the same commit.

## Pages

From 2.8.0, every paged list (`GET /transactions`, `GET /highlights/history`,
`GET /notifications`) answers `Paginated<T>` from `packages/types`:

| Field | Type | Description |
|---|---|---|
| `items` | `T[]` | This page, newest first. Rows at the same instant come in the order they were saved (`_id`), so a row never shows on two pages or on none. |
| `page` | integer | The page asked for, 1-based. |
| `limit` | integer | The page size used. |
| `hasNextPage` | boolean | Whether anything follows this page. |
| `total` | integer | Every match across all pages. |

The query parameters are unchanged (`page`, default 1; `limit`, default 20).

## Errors

Every error has one shape. `message` is one plain sentence for a person (the
2.6.0 and 2.7.x apps show it, followed by ` · Ref <requestId>`); `code` is for
code to branch on; `issues` lists every field at fault.

```json
{
  "success": false,
  "statusCode": 400,
  "code": "invalid_input",
  "message": "Amount must be more than zero",
  "issues": [{ "path": "amount", "message": "Amount must be more than zero" }],
  "data": null,
  "requestId": "7K2QXB"
}
```

| Field | Type | Description |
|---|---|---|
| `code` | `ApiErrorCode` | From the closed list below, exported by `@save-n-spend/types`. |
| `message` | string | One sentence. See the rules below. For `invalid_input` it is the first issue's message. |
| `issues` | `{ path, message }[]` | Only for `invalid_input` and `invalid_reference`. `path` is the dotted path as sent: `amount`, `owedBy.1.amount`, `prefs.timeZone`; empty for an unexpected field at the top level. |
| `requestId` | string | On every error, including 429 and an unknown route. |

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_input` | The body or query fails its rules, or the request breaks a rule it decides alone (two different accounts, shares adding up). An unknown body field is refused (`This request had something the server didn't expect. Please update the app`). |
| 400 | `invalid_json` | The body isn't valid JSON, or is sent without `Content-Type: application/json`. A request with no body needs no content type. |
| 400 | `invalid_reference` | A body or query field names something that isn't one of yours: malformed, missing, someone else's, archived or the wrong kind. |
| 400 | `wrong_password` | Change-password with the wrong current password. |
| 401 | `unauthenticated` | No token, a bad or expired one, or the user is gone or closed. Carries `WWW-Authenticate: Bearer`. The apps sign out on any 401 outside `/auth/`. |
| 401 | `invalid_credentials` | Wrong email or password, only under `/auth/`. |
| 404 | `not_found` | The id in the URL is malformed, missing or someone else's. Ownership is answered as 404, never 403. |
| 404 | `route_not_found` | No such route or method. |
| 409 | `duplicate` | A unique value already exists. On `POST /transactions` a 409 only ever means "this `clientId` is already saved": the apps' offline queue drops any 409 there as saved. |
| 409 | `conflict` | The thing's current state doesn't allow this. |
| 409 | `idempotency_in_progress` | A request with this `Idempotency-Key` is still running. Carries `Retry-After`. See [Idempotency-Key](#idempotency-key). |
| 413 | `body_too_large` | The body is over 25 MB. |
| 422 | `idempotency_mismatch` | This `Idempotency-Key` was already used with a different route or body. |
| 429 | `rate_limited` | Too many tries. Carries `Retry-After` in seconds. |
| 500 | `internal` | Anything unexpected: `Something went wrong on our side. Please try again`. The real error is in the log under `requestId`. |

The API never sends 403, and never 204: every 2xx on `/api/v1` has a JSON body.

A unique-index duplicate that reaches the shared error handler (a duplicate on
restore, for one) logs the sentence it sends, `A record with this value already
exists`. From 2.8.4 (S3) Mongo's own `E11000 duplicate key error …` text, which
names the collection, index and key, is written only as a separate
`"level": "debug"` stdout line, and only when `LOG_LEVEL=debug`. It is never saved
to the request log collection.

Rolled out route by route: codes from the status (above) apply everywhere now;
the specific codes (`invalid_reference`, `wrong_password`, `duplicate`) and the
reworded messages arrive as each area is converted.

**Message rules** (helpers in `utils/messages.ts`; `styleProblems()` tests a message):

1. One plain sentence in sentence case. No `!`, no trailing full stop, and `. `
   between two sentences, never ` — `.
2. Say what's wrong in the app's words (account, person, holding, category),
   then what to do if that isn't obvious.
3. Never field names (`_id`, `toAccount`), ids, amounts (privacy mode), library
   text or HTTP words.
4. One helper per situation: `notFound("bill")` → `That bill doesn't exist any
   more`; `invalidReference("The account it goes to", "accounts")` → `The account
   it goes to isn't one of your accounts any more. Pick another`;
   `duplicate("a budget for this category this month")` → `You already have a
   budget for this category this month`; `conflict("This trip is closed",
   "Reopen it to make changes")`.

## Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | Creates a user, a default account, and the default categories. |
| `POST` | `/auth/login` | Exchanges credentials for an access token. |
| `GET` | `/auth/me` | Returns the authenticated user. |
| `POST` | `/auth/change-password` | Changes the caller's password. |

**Note**
`/auth/register`, `/auth/login` and `/auth/change-password` share one rate
limiter, `authLimiter`: 10 requests per IP per 15 minutes. Because the three
routes use the same limiter instance, they draw on one counter per IP. Over the
limit, the response is `429` `rate_limited` with a `Retry-After` header and the
message `Too many tries. Wait a few minutes and try again`. On
`/auth/change-password` the limiter runs before the token check.

A validation failure on any Auth or Users endpoint is a `400` `invalid_input`
whose `message` is the first issue's message (see [Errors](#errors)).

### POST /auth/register

Creates a user and returns **the user document**. It does **not** return an
access token. To obtain a token, call `POST /auth/login` afterwards.

| Field | Type | Constraints |
|---|---|---|
| `name` | string | At least 2 characters, trimmed. |
| `email` | string | Valid email. Stored lowercased and trimmed. A duplicate is a `409` `duplicate`, `An account with this email already exists. Sign in instead`. |
| `password` | string | At least 8 characters. Hashed with bcrypt (`SALT_ROUNDS`, default 12). |
| `timeZone` | string | Optional. IANA zone name from the device, e.g. `Asia/Kolkata`; seeds `prefs.timeZone`. Omitted falls back to the server default, `Asia/Kolkata`. A name the server cannot resolve is a `400`, `That time zone isn't recognised`. Accepted only here — an existing account's zone changes through `PATCH /users/me`, so travelling can't re-cut a user's history. |

Registration runs in one database transaction and does four things:

| Step | Result |
|---|---|
| Creates the user | `authProvider: "local"`, `currency: "INR"`. |
| Creates a default account | Named `Cash`, type `cash`, `balance` and `startingBalance` both `0`. No `icon` or `color` is set on it. |
| Seeds the default categories | The tree in `apps/api/src/data/defaultCategories.ts`, parents first. Children inherit their parent's `kind`. |
| Sets `prefs.defaultAccount` | Points at the new `Cash` account. |

**Response** — `201`, message `User registered`. `data` is the user, shaped
like `IUser` in `packages/types`. `password`, `resetToken`, `resetTokenExpiry`
and `totpSecret` are stripped from every user response by the model's `toJSON`,
and `__v`, `pushToken`, `googleId`, `totpEnabled`, `authProvider` and
`deactivatedAt` by `utils/dto.ts`.

### POST /auth/login

Exchanges credentials for an access token. `email` must be a valid email;
`password` only has to be non-empty, so sign-in never reveals the password rules.

**Response** — `200`, message `User signed in`.

| Field | Type | Description |
|---|---|---|
| `accessToken` | string | JWT, valid for 7 days. The payload carries `userId`, `name`, `email` and `loginTime`. |
| `userData` | object | `{ name, email }`. Not the full user — call `GET /auth/me` for that. |

An unknown email, an account with no password (a Google account), and a wrong
password of any length all return the same `401` `invalid_credentials`, `That
email and password don't match`, so the response does not reveal which emails
exist.

Signing in to a deactivated account clears `deactivatedAt` before the token is
issued. See [DELETE /users/me](#delete-usersme).

**Note**
Tokens are valid for 7 days. There is no refresh endpoint; the app signs the
user out on the first 401 and they log in again.

### GET /auth/me

Returns the authenticated user (`IUser`), message `User fetched`. The mobile app
calls this on boot to prove a restored token is still valid.

These are the `401` `unauthenticated` answers of every signed-in route, not only
this one (`protect` in `middleware/authMiddleware.ts`):

| Case | Message |
|---|---|
| Token missing | `Please sign in again`. |
| Token invalid, expired or signed with another secret | `Your session has ended. Please sign in again`. |
| User no longer exists | `Please sign in again`. |
| Account is deactivated | `This account was closed. Sign in to reopen it`. |

See [DELETE /users/me](#delete-usersme).

### POST /auth/change-password

Changes the password of the signed-in user. Requires a bearer token **and** the
current password.

| Field | Type | Constraints |
|---|---|---|
| `currentPassword` | string | Required, at least 1 character. |
| `newPassword` | string | At least 8 characters. Must differ from `currentPassword`. |

**Response** — `200`, message `Password changed`, `data: null`. The old
password stops working at once; the new one signs in.

| Case | Response |
|---|---|
| User no longer exists | `401` `unauthenticated`, `Please sign in again`. |
| Account has no password (signs in with Google) | `400` `invalid_input`, `This account signs in with Google, so there is no password to change`. |
| `currentPassword` is wrong | `400` `wrong_password`, `Your current password isn't right`. Not a 401: the session is fine, so the apps don't sign out. |
| `newPassword` equals `currentPassword` | `400` `invalid_input`, `Choose a password different from your current one`. |
| `newPassword` under 8 characters | `400` `invalid_input`, issue path `newPassword`. |

**Warning**
Existing tokens are not revoked. They are stateless JWTs with no server-side
record, so sessions on other devices stay signed in after the change.

## Users

| Method | Path | Description |
|---|---|---|
| `GET` | `/users/me` | Returns the caller's profile and preferences. |
| `PATCH` | `/users/me` | Updates profile, push token, and preferences. |
| `DELETE` | `/users/me` | **Deactivates** the account. |

### GET /users/me

Returns the user (`IUser`), message `Profile fetched`: the same `data` as
`GET /auth/me`. A closed account is a `401` here as on every route.

`data.prefs` is `IUserPrefs`:

| Field | Type | Default |
|---|---|---|
| `defaultAccount` | account ID \| null | `null`; set to the `Cash` account at registration. |
| `timeZone` | string | `Asia/Kolkata`. |
| `notifications.enabled` | boolean | `true` |
| `notifications.billReminderLead` | 1 \| 3 \| 7 | `3` |
| `notifications.budgetAlerts` | boolean | `true` |
| `notifications.goalMilestones` | boolean | `true` |
| `notifications.dailySummary` | boolean | `false` |
| `notifications.weeklySummary` | boolean | `false` |
| `notifications.monthlySummary` | boolean | `true` |
| `notifications.investmentReminder` | boolean | `false` |
| `notifications.investmentReminderDay` | integer 1–28 | `1` |

### PATCH /users/me

Updates the caller's own profile and preferences. All fields optional. The body
is `.strict()`: an unrecognized key at the top level, inside `prefs`, or inside
`prefs.notifications` is a `400`.

| Field | Type | Constraints |
|---|---|---|
| `name` | string | Trimmed, 2–60 characters. Email is not editable. |
| `pushToken` | string \| null | Expo push token for this device. `null` detaches it — the app sends that on sign-out, so the account's reminders stop reaching a phone somebody else is now signed in on. The stored field is unset rather than set to null. |
| `prefs.defaultAccount` | string \| null | Account ID, or `null` to clear. The account must belong to the caller and not be archived, otherwise `400` `invalid_reference`, `The default account isn't one of your accounts any more. Pick another`. |
| `prefs.timeZone` | string | IANA zone name, e.g. `Asia/Kolkata`. Rejected with `400`, `That time zone isn't recognised`, if the server can't resolve it. Every day, month, and window the API cuts is cut in this zone. |
| `prefs.notifications.enabled` | boolean | Primary notification switch. Off silences every kind. |
| `prefs.notifications.billReminderLead` | 1 \| 3 \| 7 | Days of lead time before a bill is due. |
| `prefs.notifications.budgetAlerts` | boolean | |
| `prefs.notifications.goalMilestones` | boolean | |
| `prefs.notifications.dailySummary` | boolean | Yesterday's totals, 6pm local. Defaults to **off**. |
| `prefs.notifications.weeklySummary` | boolean | The week that ended, Monday 7pm local. Defaults to **off**. |
| `prefs.notifications.monthlySummary` | boolean | The month that ended, the 1st at 8pm local, with the biggest spending category. Defaults to **on**. |
| `prefs.notifications.investmentReminder` | boolean | Monthly nudge to update investment values. Defaults to **off**. |
| `prefs.notifications.investmentReminderDay` | integer | 1–28, the day of the month the nudge fires. Capped at 28 so it lands every month. Defaults to `1`. |

Send only the notification keys you want to change; the rest keep their stored
values. `data` is the updated user (`IUser`), message `Profile updated`.

The three digests have separate switches and separate hours. See
[Digest notifications](architecture.md#digest-notifications).

### DELETE /users/me

**Deactivates** the account. Nothing is erased.

`deactivatedAt` is stamped and `pushToken` is unset. The response is `200` with
message `Account deactivated` and `data: null`. It is not a `204`: every
"no content" response in this API is a `200` envelope.

| Consequence | When |
|---|---|
| Every signed-in route returns `401` `unauthenticated`, `This account was closed. Sign in to reopen it` | Immediately, for every token issued before or after. |
| Reminders and digests stop | Immediately (`reminderJob` filters on `deactivatedAt: null`). |
| Transactions, budgets, bills, goals, accounts, categories | Untouched, indefinitely. |

Signing in again with the same credentials clears `deactivatedAt` before the
token is issued, and the account is live with all of its data. Tokens from
before the close work again too.

`protect` reads the user by primary key on every request, so a token for a
closed or deleted user stops working everywhere, not only on `/auth/me`. A
failed read is a `500`, never a `401`, so a database hiccup can't sign anyone
out.

## Accounts

An account is a place money sits. Every account has a `type`:

| `type` | Meaning |
|---|---|
| `bank` | A bank account. |
| `credit_card` | A credit card. Its balance is negative as it is used. |
| `cash` | Physical cash. |
| `wallet` | A digital wallet. |
| `person` | A receivable: its balance is what that person owes the caller, negative when the caller owes them. A split expense transfers the lent portion into one, and trip members are person accounts. |
| `investment` | A holding. `startingBalance` is the cost basis and `balance` is its current value. |

| Method | Path | Description |
|---|---|---|
| `GET` | `/accounts` | Lists the caller's live accounts, in the user's order. |
| `POST` | `/accounts` | Creates an account. |
| `PATCH` | `/accounts/reorder` | Writes the list order. |
| `GET` | `/accounts/{id}` | Retrieves one account. |
| `PATCH` | `/accounts/{id}` | Updates an account's name, type, icon, color, or investment kind. |
| `PATCH` | `/accounts/{id}/balance` | Reconciles the balance against the bank. |
| `DELETE` | `/accounts/{id}` | **Archives** the account. It is not deleted. |

Every response's `data` is an `IAccount` (or an array of them), except
reorder and archive, described below. Archived accounts are invisible to every
endpoint here: `GET /accounts/{id}`, `PATCH` and `DELETE` on one all return
`404` `not_found`, `That account doesn't exist any more`, as does an account
belonging to another user or a malformed id.

### GET /accounts

Takes no parameters. Returns every non-archived account sorted by `order`, then
`createdAt`. The `createdAt` tiebreak keeps a list nobody has reordered in the
order it was built. `data` is a plain array, not a [page](#pages); message
`Accounts fetched`.

### GET /accounts/{id}

One live account of the caller's, message `Account fetched`.

### POST /accounts

The body is `.strict()`.

| Field | Type | Constraints |
|---|---|---|
| `name` | string | Required, non-empty, trimmed. |
| `type` | enum | Required. `bank` \| `credit_card` \| `cash` \| `wallet` \| `person` \| `investment`. |
| `startingBalance` | integer | Required. Paise. May be negative. |
| `icon` | string | Optional. Icon name from `lib/icons.ts`. Defaults to `wallet`. |
| `color` | string | Optional. Color token. See [Design system](design-system.md). Defaults to `success`. |
| `investmentKind` | string | Optional. 1–40 characters, trimmed. **`investment` only.** The Investments hub's grouping key (SIP, Mutual Fund, ...). A free string, not an enum. |
| `currentValue` | integer | Optional. Paise, 0 or more. **`investment` only.** What the holding is worth today. Omitted means it is worth exactly `startingBalance`. |
| `investedSince` | date | Optional. Coerced from an ISO string; a date in the future is rejected with `The start date can't be in the future`. **`investment` only.** When the opening amount started going in. Stored as `null` if omitted. |
| `investedHow` | enum | Optional. `sip` \| `lump`. **`investment` only.** Stored as `null` if omitted. |

`investmentKind`, `currentValue`, `investedSince` and `investedHow` on any
other `type` are a `400` `invalid_input` naming the field: `Investment type is
only for investments`, `Current value is only for investments`, `Start date is
only for investments`, `How it was invested is only for investments`.

The stored `balance` starts as `startingBalance`, except on an `investment`
with `currentValue`, where it starts as `currentValue`. The gap between the two
is a gain or loss made before the holding was tracked here. It is stored
directly, not recorded as a transaction.

The new account's `order` is the number of live accounts the caller already has,
so it lands last. **Response** — `201`, message `Account created`.

**Important**
`startingBalance` can be set only at creation — `updateAccountSchema` omits it.
The current `balance` is derived from transaction effects and must never be
patched directly. See
[The account balance invariant](architecture.md#the-account-balance-invariant).

### PATCH /accounts/{id}

The body is `.strict()`. All fields optional.

| Field | Type | Constraints |
|---|---|---|
| `name` | string | Non-empty, trimmed. |
| `type` | enum | Same values as creation. From 2.8.1 a change into or out of `investment` or `person` is refused (below). Changes among `bank`, `credit_card`, `cash` and `wallet` have no checks or side effects. |
| `icon` | string | |
| `color` | string | |
| `investmentKind` | string | 1–40 characters, trimmed. Only on a holding: on any other account it is a `400`, `Investment type is only for investments`. |

`startingBalance`, `balance`, `currentValue`, `investedSince` and `investedHow`
are rejected as unrecognized keys. **Response** — `200`, message `Account
updated`, `data` is the account.

**Type changes, investments and people.** From 2.8.1, a `type` that turns an
account into an `investment` or a `person`, or one of those into anything else,
is a `400` `invalid_input` with issue path `type`: `An account can't be turned
into an investment or back. Add a new one instead` (or `… into a person or
back …`). Nothing is written. A holding's balance is its value (it can carry an
opening gain that no row explains, and it can't go below zero); a person's is
what they owe, trips and splits take only people, and trip expenses are paid
only from your own accounts. Either change would leave a balance, a trip or an
expense that breaks those rules (a trip whose members can't be saved again, an
expense that can't be edited). Sending the account's own type back, as the
app's edit sheet does on every save, is allowed.

### PATCH /accounts/reorder

Writes the user's account order: each ID's position in `ids` becomes its
`order`, from 0.

| Field | Type | Constraints |
|---|---|---|
| `ids` | string[] | Required, at least 1. Account IDs, front to back. |

| Case | Response |
|---|---|
| Success | `200`, message `Accounts reordered`, `data: { reordered: <count> }`. |
| An ID appears twice (in any letter case) | `400` `invalid_input`, `An account is in the list twice`. |
| An ID is malformed, missing, archived or another user's | `400` `invalid_reference`, `An account in the list isn't one of your accounts any more. Pick another`, issue path `ids.<n>` (or `ids`). |
| `ids` is empty | `400` `invalid_input`. |

**Note**
The code comment says the request must carry every live account, so the result
does not fall back to the `createdAt` tiebreak. The server does not enforce
that: a partial list is accepted and leaves the omitted accounts on their old
`order` numbers.

### PATCH /accounts/{id}/balance

Sets the balance to what the user's bank actually says, by recording the
difference as an adjustment transaction.

| Field | Type | Constraints |
|---|---|---|
| `balance` | integer | Required. Paise. **The target figure, not a delta.** Signed and unbounded — a credit card's balance is negative as it is used. |
| `note` | string | Optional, 1–120 chars, trimmed. Becomes the adjustment's title. Defaults to `"Balance correction"`. |

**Important**
The body is the balance the user is *reading off their banking app*. The server
computes `target - current` and writes a `positiveAdjustment` or
`negativeAdjustment` for the absolute difference, then stamps `lastSyncedAt`.
The adjustment is dated now and written, with its balance effect, in one
database transaction.

It is deliberately **not** a field on `PATCH /accounts/{id}`: this is the only
account write that moves money, and keeping it on its own path means a rename
can never carry a balance change with it.

A `$set` on `balance` would be the obvious implementation and is wrong — it
would break the invariant that the stored balance is the sum of its history.
See [The account balance invariant](architecture.md#the-account-balance-invariant).

**Responses**

| Case | Response |
|---|---|
| Difference is non-zero | `200` with the updated account. Message `"Balance updated"`. |
| Already matches | `200`, `lastSyncedAt` stamped, **no transaction written**. Message `"Balance confirmed"`. |
| Account archived, missing, malformed or not the caller's | `404` `not_found`. |
| The balance changed between the read and the write | `409` `conflict`, `This balance was just changed. Check it and try again`. |

The endpoint does not check the account's `type`, so it also applies to
`investment` and `person` accounts.

Adjustments are excluded from income and expense everywhere: the dashboard
summary, `GET /transactions/summary`, the health score, and the highlight
snapshot all match on `type: { $in: ["income", "expense"] }`. They are also
hidden from the default `GET /transactions` listing — see that endpoint.

### DELETE /accounts/{id}

**Archives** the account: `isArchived` becomes `true`. The response is `200`,
message `Account archived`, `data: null`. A second archive of the same account
is a `404`.

Deleting archives rather than removes, because past transactions reference the
account and would otherwise lose their source. Transactions already on the
account stay, and can still be edited or deleted. New transactions cannot target
it. The call does not check the balance, and does not touch the other accounts
or transactions.

**Note**
Archiving does not clear `prefs.defaultAccount` on the server. The mobile app
clears it itself, in the same delete flow, with `PATCH /users/me`. A client
that archives an account directly must do the same, or the preference keeps
naming an archived account.

## Categories

A category classifies a transaction. Each has a `kind` (`expense` or `income`)
and an optional `parent`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/categories` | Lists the caller's live categories. |
| `POST` | `/categories` | Creates a category. |
| `PATCH` | `/categories/reorder` | Writes the order of one sibling set. |
| `GET` | `/categories/{id}` | Retrieves one category. |
| `PATCH` | `/categories/{id}` | Updates name, icon, or color. |
| `DELETE` | `/categories/{id}` | **Archives** the category and its sub-categories. |

`data` is an `ICategory` (or an array of them) except where noted. Archived
categories, other users' categories and malformed ids return `404` `not_found`,
`That category doesn't exist any more`.

### GET /categories

Returns every non-archived category, parents and children
together in one flat array, sorted by `order` then `createdAt`. `order` is only
meaningful within a sibling set (top-level categories of a kind, or one parent's
children), so group by `parent` on the client before relying on it.
`?include=archived` (2.8.0 on) adds archived ones, so a row filed under one can
still print its name. Message `Categories fetched`.

### GET /categories/{id}

One live category of the caller's, a heading or a sub-category (with its
`parent`), message `Category fetched`. Archiving a heading archives its
sub-categories, so both are `404` afterwards.

### POST /categories

The body is `.strict()`.

| Field | Type | Constraints |
|---|---|---|
| `name` | string | Required, non-empty, trimmed. |
| `kind` | enum | Required. `expense` \| `income`. |
| `parent` | string | Optional. Parent category ID, which makes this a sub-category. |
| `icon` | string | Optional. Defaults to `wallet`. |
| `color` | string | Optional. Defaults to `success`. |

Rules, checked in this order:

| Rule | Failure |
|---|---|
| Names are unique per user, case-insensitively, across all live categories — whatever the `kind` or `parent`. A row shows only its bare name, so a repeat reads as ambiguous. | `409` `duplicate`, `You already have a category with that name`. |
| `parent` must be a live category of the caller's. | `400` `invalid_reference`, `Parent category isn't one of your categories any more. Pick another`. |
| Categories are one level deep: a category has an optional `parent`, and a sub-category cannot itself be a parent. | `400` `invalid_input`, `Categories can only be 2 levels deep`. |
| A sub-category's `kind` must match its parent's. | `400` `invalid_input`, `A sub-category has to be the same kind as its parent`. |

The kind rule exists because all three roll-ups sum a parent's children without
re-checking `kind` — an income child under an expense parent would subtract
from that parent's spend.

The new category's `order` is the count of live categories with the same `kind`
and `parent`, so it lands last among its siblings. **Response** — `201`,
message `Category created`.

**Note**
`kind` and `parent` are immutable — `updateCategorySchema` omits both. Changing
a category's kind would strand every transaction already filed under it.

New users are provisioned with the two-level tree in
`apps/api/src/data/defaultCategories.ts` — eight headings, each with its own
sub-categories except `Others`, which is deliberately flat.

### PATCH /categories/{id}

The body is `.strict()`. All fields optional.

| Field | Type | Constraints |
|---|---|---|
| `name` | string | Non-empty, trimmed. Subject to the same case-insensitive uniqueness rule as creation, ignoring the category itself: `409` `duplicate`, `You already have a category with that name`. |
| `icon` | string | |
| `color` | string | |

**Response** — `200`, message `Category updated`.

### PATCH /categories/reorder

Writes the order of one sibling set: each ID's position in `ids` becomes its
`order`, from 0.

| Field | Type | Constraints |
|---|---|---|
| `ids` | string[] | Required, at least 1. Category IDs, front to back. |

| Case | Response |
|---|---|
| Success | `200`, message `Categories reordered`, `data: { reordered: <count> }`. |
| An ID appears twice | `400` `invalid_input`, `The same category was listed twice`. |
| An ID is malformed | `400` `invalid_reference`, `A category in the list isn't one of your categories any more. Pick another`, issue path `ids.<n>`. |
| An ID is not a live category of the caller's | `400` `invalid_reference`, `Some of those categories no longer exist`, **with no `issues`** (the one `invalid_reference` that names no field; accounts' reorder does). |

**Note**
The server does not check that the IDs form one sibling set, or that they are
the whole set. The client must send a set it has already grouped; an ID from
another set is ranked against numbers it is never compared with.

### Sub-category roll-up

Spending filed under a sub-category counts towards its parent. Four places
implement this, and all must agree:

| Where | How |
|---|---|
| `budgetService.budgetProgress` | `spent` = the category's own transactions **+** its children's. |
| `insightsController.getCategoryBreakDown` | Buckets key on `parent ?? _id`, so a breakdown lists headings only. |
| `budgetAlertService` | A transaction is governed by a budget on its own category **or** on its parent. |
| `GET /transactions?category=` | A parent ID also matches transactions filed under any of its children. |

A budget on a parent therefore already covers every child, which is why the
mobile picker excludes the other level once either is budgeted.

### DELETE /categories/{id}

Archiving a parent archives its sub-categories in the same call — an orphaned
child is filtered out of `GET /categories` and becomes unresolvable in the app.
Transactions filed under an archived category are untouched; archiving only
hides the category from pickers.

```json
{ "data": { "archivedChildren": 3 }, "message": "Category archived" }
```

`archivedChildren` is `0` when the target is itself a sub-category. It counts
only children that were not already archived.

## Transactions

| Method | Path | Description |
|---|---|---|
| `GET` | `/transactions` | Lists transactions, filtered and paginated. |
| `POST` | `/transactions` | Creates a transaction and applies its balance effect. |
| `POST` | `/transactions/convert-to-investment` | Converts a batch of expenses into investment contributions. |
| `GET` | `/transactions/summary` | Income, expense and savings totals over the list's filters. |
| `GET` | `/transactions/title-suggestions` | Frequently used titles, for autosuggest. |
| `GET` | `/transactions/{id}` | Retrieves one transaction. |
| `PATCH` | `/transactions/{id}` | Updates a transaction and re-applies its effect. |
| `POST` | `/transactions/{id}/convert-to-investment` | Converts one expense into an investment contribution. |
| `DELETE` | `/transactions/{id}` | Deletes a transaction and reverts its effect. |

Every transaction response's `data` is an `ITransaction` (or an array or page of
them). Another user's transaction, a missing one or a malformed id is a `404`
`not_found`, `That transaction doesn't exist any more`. A field that names an
account, person or category that isn't one of the caller's (missing, someone
else's, archived or the wrong kind) is a `400` `invalid_reference` whose issue
path is that field (`account`, `toAccount`, `owedBy.1.account`, `category`).

A validation failure on any Transactions endpoint is a `400` `invalid_input` (it was a `500` before the error handler recognised `zod/v4`).

### Transaction types and balance effects

`type` is one of five values. `amount` is always a positive integer in paise;
direction comes from `type`, never from a sign.

| `type` | Effect on balances | Counts as income or expense? |
|---|---|---|
| `expense` | `account` −`amount`. | Expense. |
| `income` | `account` +`amount`. | Income. |
| `transfer` | `account` −`amount`, `toAccount` +`amount`. | Neither. |
| `positiveAdjustment` | `account` +`amount`. | Neither. |
| `negativeAdjustment` | `account` −`amount`. | Neither. |

Every write applies its effect through `applyEffects` with an atomic `$inc`
inside a database transaction, so the stored account `balance` always equals the
sum of its history. Creating **adds** the effect, deleting **reverts** it, and
editing **reverts the old effect, applies the edit, then adds the new effect**,
so changing `amount`, `account` or `toAccount` moves the money correctly. See
[The account balance invariant](architecture.md#the-account-balance-invariant).

Adjustments are bookkeeping written by `PATCH /accounts/{id}/balance` (and by
trip settlements). The create endpoint also accepts them directly.

### POST /transactions

The body is a **discriminated union on `type`** and is `.strict()` per variant.
The fields you must send depend on which type you pick.

Fields common to every type:

| Field | Type | Constraints |
|---|---|---|
| `amount` | integer | Required. Positive paise. |
| `account` | string | Required. Account ID. Must be a live account of the caller's, otherwise `400` `invalid_reference`. |
| `occurredAt` | string | Optional timestamp, parsed with `new Date()`. Defaults to now. The schema does not validate the format. |
| `note` | string | Optional. |
| `location` | string | Optional. |
| `receiptUrl` | string | Optional. |
| `paymentMode` | enum | Optional. `cash` \| `upi` \| `card` \| `transfer`. |
| `clientId` | string | Optional, 8–64 characters. An idempotency key — see below. |

Type-specific fields:

| `type` | Additional fields | Notes |
|---|---|---|
| `expense` | `category` (required), `title` (required, non-empty), `owedBy` (optional) | A spend. `title` is what the user sees in the list. |
| `income` | `category` (required), `title` (required, non-empty) | |
| `transfer` | `toAccount` (required) | Carries no `title` and no `category` — a transfer moves money, it does not classify it. `account` and `toAccount` must differ, otherwise `400` `invalid_input`, `Pick two different accounts`. Both must be live accounts of the caller's. |
| `positiveAdjustment`, `negativeAdjustment` | `title` (optional, non-empty) | Reconciliation entries, for correcting a drifted balance. |

`category` must be one of the caller's categories of the matching `kind`
(`income` for income, `expense` for an expense), otherwise `400`
`invalid_reference`. An archived category is accepted.

`tripId` and `tripExpenseId` cannot be sent; trips write them. A body carrying
them is rejected as an unrecognized key.

**Warning**
`amount` is always positive. A negative or zero amount fails validation (`400`
`invalid_input`). An expense is negative because `type` is
`expense`, not because the number is.

**Redemptions** — a `transfer` whose source `account` is an `investment` cannot
exceed that holding's recorded value: `400`, `You can't redeem more than this
holding is worth. Update its value first if it has grown`. Other account types
may overdraw.

**Response** — `201`, message `Transaction created`. `data` is the created
transaction. After commit, if the type is `expense`, the server checks the
category's budget (and its parent's) and may raise a budget notification; this
never fails the request.

#### Split expenses

An `expense` may carry `owedBy` to record that other people owe part of it.

| Field | Type | Constraints |
|---|---|---|
| `owedBy` | array | 1–10 rows. |
| `owedBy[].account` | string | The person who owes. Must be a live `person` account of the caller's. |
| `owedBy[].amount` | integer | Positive paise. |

`amount` on the expense is the caller's **own share**. For each `owedBy` row the
server also creates a `transfer` from `account` to `owedBy[].account` for that
row's amount, with `note` set to the expense's `title`. The expense and all its
transfers share a `splitGroupId` and the same `occurredAt`, and are written in
one database transaction. The response contains only the expense; the transfers
appear in later listings.

| Rule | Failure |
|---|---|
| A person may appear once, and may not be the source `account`. | `400` `invalid_input`, `Each person can be in the split only once`. |
| Every row's account must be a live person account of the caller's. | `400` `invalid_reference`, `A person in the split isn't one of your people any more. Pick another`, issue path `owedBy.<n>.account`. |

#### Idempotency with `clientId`

An offline-queued create sends a `clientId`. A partial unique index on
`{ userId, clientId }` makes a replay after a lost response a no-op instead of
a duplicate: a `clientId` already saved answers `200` "Transaction already
saved" with the saved row, including two sends at once. `POST /transactions`
never answers `409` for anything else, because the 2.6.0 offline queue drops any
409 there as saved. The `Idempotency-Key` header works alongside it.

The index applies only when `clientId` is a string, so ordinary transactions
never collide. `clientId` is stored on the transaction and returned in `data`.
It cannot be set by `PATCH`.

### GET /transactions

| Parameter | Type | Default | Description |
|---|---|---|---|
| `startDate` | `YYYY-MM-DD` | — | Start of the range, inclusive. |
| `endDate` | `YYYY-MM-DD` | — | End of the range, inclusive. |
| `category` | string | — | Category ID, or several separated by commas. A parent ID also matches its children. |
| `account` | string | — | Account ID, or several separated by commas. Matches a transaction whose `account` **or** `toAccount` is one of them, so a transfer into an account is included. |
| `type` | enum | — | `expense` \| `income` \| `transfer`. |
| `search` | string | — | Free-text, case-insensitive match on the title. Trimmed, at most 80 chars. Regex-escaped, so `(` is a literal bracket rather than a 500 and `(a+)+b` can't be handed to the database as a backtracking bomb. |
| `trips` | enum | — | `exclude` \| `only`. See below. Unset returns trip rows and everyday rows together. |
| `page` | integer | `1` | 1-based page number. |
| `limit` | integer | `20` | Page size. Maximum 100. |

**Important**
`startDate` and `endDate` must be supplied together. Sending one without the
other returns `400` `invalid_input`. The range is cut at
the **user's** midnights in `prefs.timeZone`, not UTC's, so a purchase made late
last night stays in "Today".

With no `type`, the listing excludes `positiveAdjustment` and
`negativeAdjustment` — balance corrections are bookkeeping, not activity, and a
user reconciling an account should not find a row in their feed they can't
explain. The `type` parameter accepts only `expense`, `income` and `transfer`, so
adjustments cannot be requested through this endpoint at all: filtering for
`positiveAdjustment` is a validation failure. The controller's comment says
exports still carry them, but the mobile export (`lib/export.ts`) calls this same
listing without `type`, so it omits them too.

**`trips` filter**

| Value | Rows returned |
|---|---|
| `exclude` | Only rows with no `tripId` — the everyday list. Trip rows are real money and still move balances, but they are read on the trip and in Activity's Trips view. |
| `only` | Only rows with a `tripId`, **minus** the transfers a trip expense generates for what each friend owes (`type: transfer` with a `tripExpenseId`). One row per trip expense, its share. |
| unset | Everything. What an export needs. |

Results are sorted by `occurredAt`, newest first, and come as a
[page](#pages): `{ items, page, limit, hasNextPage, total }` (`Paginated<ITransaction>`).

### GET /transactions/summary

Income, expense and savings over the rows `GET /transactions` returns for the
same filters. Only `income` and `expense` transactions are counted; transfers
and adjustments never are.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `startDate` | `YYYY-MM-DD` | — | Start of the range. |
| `endDate` | `YYYY-MM-DD` | — | End of the range. |
| `category` | string | — | As on the list: comma-separated IDs, a parent also matches its children. |
| `account` | string | — | As on the list: matches `account` or `toAccount`. The transfers it adds to the list add nothing here. |
| `type` | enum | — | `expense` \| `income` \| `transfer`. With `transfer` every figure is `0`. |
| `search` | string | — | As on the list. |
| `trips` | enum | — | `exclude` \| `only`. Narrows `income` and `expenses`, not `savings`. |

The list and the summary build their filter in one place
(`services/transactionFilter.ts`), so the card's figures add up to the rows
beneath it under any combination. `startDate` and `endDate` follow the same
together-or-neither rule and the same zone-local day bounds as the list. With
neither, the totals cover all time. Bad filters fail as they do on the list.
`savings` and `tripExpenses` are over the filtered rows, trips included.

| Response field | Type | Description |
|---|---|---|
| `income` | integer | Paise of income in view. |
| `expenses` | integer | Paise of expense in view. |
| `savings` | integer | `income − expenses` over **all** rows in the range, whatever `trips` says. |
| `tripExpenses` | integer | Paise of expense rows that belong to a trip, in the range, whatever `trips` says. |

How `trips` changes the figures:

| `trips` | `income` and `expenses` count | `savings` | `tripExpenses` |
|---|---|---|---|
| unset | Every row. | Real figure. | Trip expense total. |
| `exclude` | Rows with no `tripId`. | Real figure, trips included. | Trip expense total, so the card can name the trip spending the everyday view leaves out. |
| `only` | Rows with a `tripId`. | Real figure, trips included. | Trip expense total. |

Savings stays the real figure in every view: a trip was money spent, and
dropping it would show the month as better saved than it was. There is no named
type for this response in `packages/types`.

### GET /transactions/title-suggestions

Takes no parameters. Returns the titles the caller has actually used, for the
add-transaction form's autosuggest and the Quick Log chips. `data` is an array
of `ITitleSuggestion`, most frequent first, at most 150 entries.

| Field | Type | Description |
|---|---|---|
| `title` | string | The most recent spelling of the title. |
| `type` | `expense` \| `income` | |
| `category` | string \| null | Category ID of the group. |
| `count` | integer | How many transactions are in the group. |
| `lastAmount` | integer | Paise amount of the most recent transaction in the group. |
| `lastTransactionId` | string | ID of that transaction, so a "repeat this" chip needs no second request. |

Rules:

- Considers only `expense` and `income` rows with a non-empty title, in the last
  12 months by calendar arithmetic on the server clock.
- Groups on `type`, the trimmed lowercase title and the `category`. The same
  title filed under two categories is two suggestions.
- Excludes rows with a `tripId`, because a trip's share is a one-off and
  repeating it would make an everyday expense of it.

### GET /transactions/{id}

Retrieves one transaction, message `Transaction fetched`.

### PATCH /transactions/{id}

Updates a transaction. The body is `.strict()`; all fields optional.

| Field | Type | Constraints |
|---|---|---|
| `amount` | integer | Positive paise. |
| `account` | string | Must be a live account of the caller's, otherwise `400` `invalid_reference`. |
| `toAccount` | string | Same check. |
| `category` | string | Checked like on create, but only when it changes: the app sends the category back on every save, and a row filed under a category archived since stays editable. |
| `title` | string | Non-empty. |
| `note` | string | |
| `location` | string | |
| `receiptUrl` | string | |
| `paymentMode` | enum | `cash` \| `upi` \| `card` \| `transfer`. |
| `occurredAt` | string | |

`type`, `clientId`, `owedBy`, `splitGroupId`, `tripId` and `tripExpenseId`
cannot be changed (unrecognized keys). The edited row is then checked against
the create rules for its type, so a field that doesn't fit is a `400`
`invalid_input`: no `toAccount` on an expense or income, no `category` or
`title` on a transfer, and `account` can't equal `toAccount`.

The old effect is reverted, the edit is applied, and the new effect is added in
one database transaction. If the result is a `transfer` out of an `investment`,
the redemption guard from creation is applied against the holding's value
**with this transfer's old effect already reverted**, so editing a small
redemption into a huge one is rejected with the same `400`, and nothing is
written.

If the transaction is an `expense`, the budget check runs afterwards, because
raising an amount or re-filing it can cross a limit.

**Response** — `200`, message `Transaction updated`, `data` is the updated
transaction.

**Warning**
A transaction with a `tripExpenseId` — a trip expense's share, or the transfer
recording what a friend owes on it — cannot be edited here: `409` `conflict`,
`This is part of a trip expense. Change it from the trip`. The same applies to
deleting and converting. Editing one row would leave the rest of the trip
expense disagreeing. One transfer of a split can change its amount but not its
account or date (`409`, `This is part of a split. Change the date or account on
the expense itself`); edit the expense and every transfer follows it.

Adjustments created by a balance sync can be edited through this endpoint like
any other row.

### DELETE /transactions/{id}

Deletes a transaction and reverts its balance effect, in one database
transaction. **Response** — `200`, message `Transaction deleted`, `data: null`.

| Case | Behaviour |
|---|---|
| Ordinary transaction | Reverts its effect and deletes it. |
| Split expense (`type: expense` with a `splitGroupId`) | Reverts and deletes the **whole group** — the expense and every transfer — because transfers left behind would claim someone owes money for a purchase that no longer exists. |
| One transfer of a split group | Deletes only that transfer. This is how a person is taken off a split after the fact. |
| Has a `tripExpenseId` | `409` `conflict`, `This is part of a trip expense. Change it from the trip`. |

Deleting an adjustment reverts the correction it made.

### POST /transactions/{id}/convert-to-investment

Reclassifies an old expense (for instance a SIP logged as spending) as a
contribution to an investment. It becomes a `transfer` into the chosen
investment account, so the money stays removed from the source, net worth rises
by that amount, and the row leaves the spending charts. It exists as its own
endpoint because `PATCH` cannot change `type` or clear `category`.

| Field | Type | Constraints |
|---|---|---|
| `toAccount` | string | Required. A live `investment` account of the caller's. |

| Case | Response |
|---|---|
| Success | `200`, message `Transaction converted`, `data` is the updated transaction (now `type: transfer`, `category: null`). |
| Has a `tripExpenseId` | `409` `conflict`, `This is part of a trip expense. Change it from the trip`. |
| Transaction is not an `expense` | `409` `conflict`, `Only an expense can be converted to an investment`. |
| Expense has a `splitGroupId` | `409` `conflict`, `This expense is part of a split. Remove it from the split first`. |
| `toAccount` is not a live investment account of the caller's | `400` `invalid_reference`, `The investment isn't one of your holdings any more. Pick another`. |
| `toAccount` is the transaction's own `account` | `400` `invalid_input`, `Pick two different accounts`. |

The checks run in that order.

The balance move is revert, then flip to a transfer, then add, in one database
transaction. The source account is unchanged overall; the investment gains the
amount.

### POST /transactions/convert-to-investment

The batch form, for moving past payments after a SIP is set up from a
recurring suggestion.

| Field | Type | Constraints |
|---|---|---|
| `transactionIds` | string[] | Required, 1–60 IDs. A malformed one is `400` `invalid_reference`, issue path `transactionIds.<n>`. |
| `toAccount` | string | Required. A live `investment` account of the caller's, otherwise `400` `invalid_reference`, `The investment isn't one of your holdings any more. Pick another`. |

Only caller-owned plain expenses are converted: ones with no `splitGroupId`, no
`tripExpenseId`, and an `account` other than `toAccount`. **Anything else is
skipped silently** — an unknown ID, a non-expense, a split member, a trip row,
an already-converted row — rather than failing the batch. All conversions land
in one database transaction.

**Response** — `200`, message `Transactions converted`, `data: { converted: <count> }`.
Compare `converted` with the number of IDs sent to see whether any were skipped.
Unlike the single form, the batch does not run the budget check, and it does
not say which IDs were skipped.

## Budgets

A budget is a spending limit for one category in one month.

| Method | Path | Description |
|---|---|---|
| `GET` | `/budgets` | Lists budgets for a month with spend-to-date. |
| `POST` | `/budgets` | Creates a budget. |
| `PATCH` | `/budgets/{id}` | Changes the limit. |
| `DELETE` | `/budgets/{id}` | Deletes the budget. |

All four require a bearer token.

### GET /budgets

| Parameter | Type | Default | Description |
|---|---|---|---|
| `month` | `YYYY-MM` | The current month **in the caller's zone** | Which month's budgets to return. Must match `^\d{4}-(0[1-9]\|1[0-2])$`. |

`data` is an array of `{ budget, spent }`. It is `[]` when the month has no
budgets.

| Field | Type | Description |
|---|---|---|
| `budget` | object | The stored budget: `_id`, `userId`, `category` (category ID, not populated), `month`, `limit`, `createdAt`, `updatedAt`. |
| `spent` | integer | Paise spent against this budget's category in that month. |

`spent` is the sum of `expense` transactions in the zone-local month whose
`tripId` is empty, grouped by category, with the category's sub-categories added
to their parent. A budget set directly on a sub-category still counts that
sub-category on its own. Transfers, income and adjustments never count.

**Important**
Trip spending is excluded from `spent` on purpose: a holiday should not blow the
Food budget. It still counts in the dashboard totals and the savings rate. See
[Known issues: planning, insights and operations](#planning-insights-and-operations) for where the
endpoints disagree about this.

**Note**
`month` accepts any valid `YYYY-MM`, so past and future months need no special
support. The Budget screen's month navigator is a client feature built on this
parameter.

The month window is cut in the user's zone by `utils/monthRange.ts`, which
delegates to `utils/timezone.ts`. See [Time zones](architecture.md#time-zones).
The same `budgetProgress` service feeds this endpoint, the budget alert and the
health score's budgets pillar, so the three never disagree about `spent`.

### POST /budgets

| Field | Type | Constraints |
|---|---|---|
| `category` | string | Required. Category ID. Must be the caller's and not archived, or the request fails with `400` `invalid_reference`, `Category isn't one of your categories any more. Pick another`. |
| `month` | string | Required. `YYYY-MM`, same pattern as above. |
| `limit` | integer | Required. Positive paise. |

Returns `201` with the created budget, message `Budget created`. There is a
unique index on `(userId, category, month)`, so a second budget for the same
category and month is a `409` `duplicate`, `You already have a budget for this
category this month`.

**Note**
The server does not check the category's `kind` or whether its parent or a child
already carries a budget. Both rules are enforced only by the mobile picker.

### PATCH /budgets/{id}

| Field | Type | Constraints |
|---|---|---|
| `limit` | integer | Required. Positive paise. |

`limit` is the only field. To move a budget to another category or month, delete
it and create a new one. Returns `200` with the updated budget (`Budget
updated`), or `404` `not_found`, `That budget doesn't exist any more`. Changing
a limit does not raise or retract a budget notification; alerts are evaluated
only when an expense is written.

### DELETE /budgets/{id}

Returns `200` with `data: null` (`Budget deleted`), or `404` `not_found`.

## Bills

| Method | Path | Description |
|---|---|---|
| `GET` | `/bills` | Lists bills, with a derived `status`. |
| `POST` | `/bills` | Creates a bill. |
| `PATCH` | `/bills/{id}` | Updates a bill. |
| `DELETE` | `/bills/{id}` | Deletes a bill. |
| `POST` | `/bills/{id}/pay` | Settles the bill and writes the money movement. |
| `POST` | `/bills/{id}/skip` | Rolls a recurring bill forward without logging anything. |

A bill whose `toInvestment` is set is a **SIP**: paying it moves money into an
investment account as a transfer instead of spending it. The wire shape is
`IBill` in `packages/types/src/index.ts` (the model also stores `createdAt` and
`updatedAt`).

### GET /bills

| Parameter | Type | Description |
|---|---|---|
| `status` | enum | Optional. `pending` \| `overdue` \| `paid`. Filters on the **derived** status below, the one each item is returned with. |

Bills are sorted by `dueDate` ascending. Each item's `status` is **derived per
request** in the caller's zone, not read from the document:

| Condition (checked in this order) | Item returned with |
|---|---|
| `lastPaidAt` falls in the same period as now (same zone-local month, or year for `yearly`) | `status: "paid"` |
| Stored status is `paid` (a one-off settled in an earlier period) | Omitted from the response. |
| `dueDate` is before the start of today in the zone | `status: "overdue"` |
| Otherwise | `status: "pending"` |

`status` therefore has three values on the wire: `pending`, `paid`, `overdue`
(`BillStatus`). The stored value only ever holds `pending` or `paid`.

**Important**
A recurring bill is never stored as `paid` — its `dueDate` rolls forward when
paid. Its evidence of being settled is `lastPaidAt` in the current period, which
is what makes it read `paid` here. A one-off bill disappears from the list
entirely once the period it was paid in has ended.

### POST /bills

| Field | Type | Constraints |
|---|---|---|
| `name` | string | Required, non-empty. |
| `amount` | integer | Required. Positive paise. |
| `dueDate` | date | Required. Coerced from an ISO string. |
| `category` | string \| null | Optional. If set, must be the caller's non-archived category (`400` `invalid_reference`). |
| `account` | string | Optional. Which account it is normally paid from. Must be the caller's and not archived (`400` `invalid_reference`). |
| `recurring` | boolean | Optional. Defaults to `false`. |
| `frequency` | enum | `monthly` \| `yearly`. **Required when `recurring` is true** (`400` `invalid_input`, `Pick how often this bill repeats`). |
| `reminderDays` | integer | Optional. 0 or more. Overrides the user's `billReminderLead` for this bill. |
| `toInvestment` | string \| null | Optional. Investment account ID that makes this a SIP. Must be the caller's, non-archived, `type: "investment"` (`400` `invalid_reference`, `Investment isn't one of your holdings any more. Pick another`). |

The body is `.strict()`. Returns `201` with the created bill (`Bill created`);
stored `status` is `pending` and `lastPaidAt` is `null`.

`reminderDays` drives the bill reminder: the job uses
`bill.reminderDays ?? prefs.notifications.billReminderLead ?? 3`. It never moves
money. See [Notifications](architecture.md#notifications).

### PATCH /bills/{id}

Same fields as `POST /bills`, all optional, `.strict()`. `category`, `account`
and `toInvestment` are re-validated when truthy; sending `toInvestment: null`
turns a SIP back into an ordinary bill. The `recurring`-needs-`frequency` rule
is checked on the bill as it would be after the update. Returns `200` with the
updated bill (`Bill updated`), or `404` `not_found`, `That bill doesn't exist any
more`.

### DELETE /bills/{id}

Returns `200` with `data: null` (`Bill deleted`), or `404` `not_found`.
Transactions already written by earlier payments are untouched.

### POST /bills/{id}/pay

| Field | Type | Description |
|---|---|---|
| `account` | string | Optional. Account to charge for this payment. Must be the caller's and not archived, or `400` `invalid_reference`. |

The body may be omitted. The charged account is the first that resolves of:

1. `account` from the request (an unresolvable one is an error, not a fallthrough).
2. The bill's own `account`, if it still exists and is not archived.
3. `prefs.defaultAccount` of the user.

If none resolves: `400` `invalid_input`, `Pick an account to pay this bill from`.
The account's `type` is not checked.

What gets written, in one MongoDB transaction:

| Bill | Money movement | Bill document afterwards |
|---|---|---|
| One-off, not a SIP | An `expense` of `bill.amount`, `title` = bill name, `category` = bill category, `occurredAt` = now. | `status: "paid"`, `lastPaidAt` = now. |
| Recurring, not a SIP | The same `expense`. | `dueDate` advanced one `frequency` step (`yearly` adds a year; anything else adds a month), `lastPaidAt` = now. `status` stays `pending`. |
| SIP (`toInvestment` set) | A `transfer` from the charged account to the investment, no `title`, no `category`, `occurredAt` = now. It never reaches the spending charts. | Same as the matching row above. |

Balances move through `applyEffects`, like any other transaction. The bill is
claimed with a conditional update first (status `pending` for a one-off, the
current `dueDate` for a recurring one), so a double tap or an offline-queue
replay cannot double-debit: the loser gets `409` `conflict`, `This bill is
already paid for this period`, and nothing is written.

The response is the bill as stored (`200`, `Bill paid`). For a
recurring bill that means `status: "pending"` and the **new** `dueDate`, not the
derived `paid` that `GET /bills` would show.

| Status | Message | Cause |
|---|---|---|
| 409 `conflict` | `This bill is already paid for this period` | Stored status is `paid`, or a recurring bill's `dueDate` is already in a later period than now. |
| 409 `conflict` | `This bill's holding isn't there any more. Edit the bill to pick another` | The SIP target was archived or deleted since creation. |
| 404 `not_found` | `That bill doesn't exist any more` | Malformed, missing or not the caller's. |

**Important**
`occurredAt` is always the moment of payment, not the due date.

**Known issue**
Paying a bill does not run `checkBudgetAlerts`, so an expense written this way
never raises a budget warning. Only `POST` and `PATCH /transactions` do.

### POST /bills/{id}/skip

Takes no body (`{}` is accepted; any field is a `400`). Advances a recurring
bill's `dueDate` by one `frequency` step and saves. It writes no transaction and
does **not** set `lastPaidAt`.

| Status | Message | Cause |
|---|---|---|
| 409 `conflict` | `Only recurring bills can be skipped` | `recurring` is false. |
| 409 `conflict` | `This bill is already paid for this period` | `dueDate` is already in a later period than now. |
| 404 `not_found` | `That bill doesn't exist any more` | Malformed, missing or not the caller's. |

Returns `200` with the updated bill (`Bill skipped`).

**Note**
Each pay or skip advances the due date by exactly one step, so a bill that is
several periods behind needs several calls to catch up. During the catch-up the
list can show `paid` (because `lastPaidAt` is in the current period) while the
`dueDate` is still in the past.

## Goals

| Method | Path | Description |
|---|---|---|
| `GET` | `/goals` | Lists goals, oldest first. |
| `POST` | `/goals` | Creates a goal. |
| `PATCH` | `/goals/{id}` | Updates a goal. |
| `DELETE` | `/goals/{id}` | Deletes a goal. |
| `POST` | `/goals/{id}/contribute` | Adds to the amount saved. |

Goals are returned as stored: `IGoal` in `packages/types/src/index.ts`
(`_id`, `userId`, `name`, `target`, `saved`, `icon?`, `color?`, `deadline?`,
`createdAt`) plus `updatedAt`. `saved` starts at `0`.

### POST /goals

| Field | Type | Constraints |
|---|---|---|
| `name` | string | Required. 1–60 characters. |
| `target` | integer | Required. Positive paise. |
| `icon` | string | Optional. |
| `color` | string | Optional. |
| `deadline` | date | Optional. Coerced from an ISO string. |

The body is `.strict()`; `saved` cannot be set. Returns `201` (`Goal created`).

### PATCH /goals/{id}

The same fields, all optional, and `deadline: null` clears the deadline. Returns
`200` with the updated goal (`Goal updated`), or `404` `not_found`, `That goal
doesn't exist any more`.

**Note**
`saved` is not re-clamped when `target` is lowered, so a goal can hold
`saved > target` until the next contribution.

### DELETE /goals/{id}

Returns `200` with `data: null` (`Goal deleted`), or `404` `not_found`. Past
contribution logs are kept; a review that still references them names the goal
`Goal`.

### POST /goals/{id}/contribute

| Field | Type | Constraints |
|---|---|---|
| `amount` | integer | Required. Positive paise. `.strict()`. |

`saved` becomes `min(saved + amount, target)`, so a goal reaches 100% and never
exceeds it. The mobile Contribute sheet validates against the remaining amount
and turns an over-contribution into an inline message instead of a server error.
Returns `200` with the updated goal (`Contribution added`).

Side effects:

| Effect | Detail |
|---|---|
| Contribution log | One `GoalContributionLog` row with the amount **actually applied** (after clamping; `0` for an already-full goal). Best-effort: a failure is logged and does not roll the contribution back. Month and week reviews read it. |
| Milestone notification | The highest of 25 / 50 / 75 / 100% that this contribution crossed raises one `goalMilestone` notification, once per goal and milestone. Gated by `prefs.notifications.goalMilestones`. Failures are swallowed. |

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
create endpoint. See [Notifications](architecture.md#notifications) for what
raises each kind, and [Dedupe keys](architecture.md#dedupe-keys).

### GET /notifications

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | `1` | 1-based page number. Positive. |
| `limit` | integer | `20` | Page size. Positive, maximum 50. |

`data` is `NotificationFeed` in `packages/types/src/index.ts`: a [page](#pages)
plus `unread`.

| Field | Type | Description |
|---|---|---|
| `items` | array | Notification documents, newest first. Each carries `_id`, `type`, `title`, `body`, `link?`, `dedupeKey`, `pushedAt`, `readAt`, `createdAt` and `updatedAt`. |
| `unread` | integer | Unread count across the whole feed, not this page. Drives the bell's dot and the app icon badge. |
| `page` | integer | Echo of the requested page. |
| `limit` | integer | The page size used. From 2.8.0. |
| `hasNextPage` | boolean | Whether an older page exists. |
| `total` | integer | Every notification in the feed. From 2.8.0. |

`type` is one of `billReminder`, `billOverdue`, `budgetWarning`,
`budgetExceeded`, `goalMilestone`, `goalDeadline`, `dailySummary`,
`weeklySummary`, `monthlySummary`, `revalueInvestments`, `recurringFound`
(`NotificationType`).

`link` is `{ screen, id? }` and is what the row opens when tapped. A
notification with no `link` is informational and navigates nowhere. `pushedAt`
is `null` when the notification stayed in-app (no push token, or the push failed).

**Note**
Notifications expire 90 days after they are created, through a TTL index. The
feed is a log, not a record — and the expiry is also what lets a yearly bill's
reminder fire again next year.

A bad `page` or `limit` (for example `?limit=500` or `?page=abc`) is a `400`
`invalid_input`.

### PATCH /notifications/{id}/read

Takes no body (`{}` is accepted; any field is a `400`). Returns
`{ notification, unread }` with the updated notification and the new unread
count, so the client never has to guess the badge (`Notification marked as
read`). Idempotent: marking an already-read notification read again succeeds and
preserves the original `readAt`. A notification belonging to another user, a
missing one or a malformed id is a `404` `not_found`, `That notification doesn't
exist any more`, not a 403.

### POST /notifications/read-all

Takes no body (`{}` is accepted; any field is a `400`). Returns `{ unread: 0 }`
(`Notifications marked as read`).

## Recurring suggestions

Repeating payments the server spotted in the transaction history. Nothing is
written except a dismissal.

| Method | Path | Description |
|---|---|---|
| `GET` | `/recurring` | Lists detected recurring expenses and income. |
| `POST` | `/recurring/dismiss` | Hides one suggestion permanently ("not recurring"). |

### GET /recurring

Takes no parameters. `data` is `RecurringSuggestionsPayload`.

| Field | Type | Description |
|---|---|---|
| `expenses` | `RecurringPattern[]` | Recurring expenses that are **not already a bill** and have not been dismissed. |
| `income` | `RecurringPattern[]` | Recurring income, not dismissed. Never filtered against bills. |

Each `RecurringPattern`:

| Field | Type | Description |
|---|---|---|
| `key` | string | `expense:<normalised title>` or `income:<normalised title>`. A second stream under the same title gets `:<amount in rupees>` appended. What a dismissal is stored against. |
| `kind` | enum | `expense` \| `income`. |
| `title` | string | The most recent title as typed. |
| `amount` | integer | Median amount across occurrences, paise. |
| `category`, `categoryName` | string \| null | Most common category (name falls back to the latest row's). |
| `account` | string \| null | The account used most often. |
| `occurrences` | integer | Distinct months it appeared in. |
| `lastAt` | string | ISO instant of the latest occurrence. |
| `nextExpectedAt` | string | `lastAt` plus one month, as an ISO instant. |
| `looksLikeSip` | boolean | Expenses only. The title or category matches `sip`, `mutual fund(s)`, `mf`, `elss`, `ppf`, `nps`, `index fund`, `nifty` or `sensex`. |
| `transactionIds` | string[] | Expenses only: matching non-split expense transaction IDs, newest first. `[]` for income. |

Detection (`services/recurringMath.ts`) is deliberately strict, because a wrong
suggestion costs more trust than a missed one:

| Rule | Value |
|---|---|
| Lookback | From the start of the zone-local month 6 months ago. |
| Rows considered | `expense` and `income` with a title and **no `tripId`**. Transfers and adjustments are ignored. |
| Grouping | Same `type` and normalised title (lowercased, digits and punctuation dropped), then split into streams of amounts within a tolerance band. |
| Minimum | At least 3 distinct months; no more than one extra row beyond one per month. |
| Cadence | Consecutive months 20–40 days apart. One gap of 50–70 days is tolerated, once. |
| Amount | Every monthly amount within 15% (expense) or 20% (income) of the median. |
| Still running | Last occurrence no more than 45 days ago. |
| Bill match | An expense is dropped when a bill has the same normalised name, or the same category at an amount within 15%. |

Results are sorted largest amount first. Notices about newly found patterns come
from the `recurring_found` highlight and the `recurringFound` notification; see
[Highlights](#highlights).

### POST /recurring/dismiss

| Field | Type | Constraints |
|---|---|---|
| `key` | string | Required. 1–200 characters. `.strict()`. |

Idempotent upsert into `RecurringDismissal` (unique on user and key). The key is
not checked against current suggestions. Returns `200` with `data: null`
(`Suggestion dismissed`). A dismissal is per account, so it holds on every
device, and it also removes an income pattern from the
[cash flow](#cash-flow) projection. There is no endpoint to undo it.

## Dashboard

| Method | Path | Description |
|---|---|---|
| `GET` | `/dashboard/summary` | The home screen aggregate for one month. |
| `GET` | `/dashboard/health` | The financial health score, as of now. |
| `GET` | `/dashboard/insights` | The "For You" carousel and the pace chart. |

### GET /dashboard/summary

| Parameter | Type | Default | Description |
|---|---|---|---|
| `month` | `YYYY-MM` | Current month in the caller's zone | Which month the monthly figures cover. |
| `since` | string | — | Optional ISO 8601 datetime: the moment the app was last opened. Adds `sinceLastOpened`. |

Returns the aggregate the home screen renders in one request, rather than having
the client fan out across resources. `data` is `DashboardSummary`.

| Field | Type | Description |
|---|---|---|
| `month` | string | The month the figures cover, `YYYY-MM`. |
| `income` | integer | Paise. Sum of `income` transactions in the month. |
| `expenses` | integer | Paise. Sum of `expense` transactions in the month, **trips included**. |
| `tripExpenses` | integer | 2.8.4. Paise. The part of `expenses` that is your trip shares (rows with a `tripId`). Everyday spending is `expenses - tripExpenses`. |
| `savings` | integer | `income - expenses`. May be negative. Always includes trips. |
| `netWorth` | integer | Paise. Sum of `balance` over all of the caller's non-archived accounts of every type (cards negative, investments and person accounts included). Always *now*, whatever `month` says. |
| `netWorthTrend` | `{ label, total }[]` | Oldest first. The current total plus up to 3 prior month-start boundaries, floored to actual history, so length 1 for an account younger than a complete month. Labels read like `Nov 2026`. Anchored on now, not on `month`. From 2.8.4 every point counts the same accounts as `netWorth` (see [Net-worth history](#net-worth-history)). |
| `flowTrend` | `{ label, income, expense, tripExpense }[]` | Oldest first, as long as `netWorthTrend`: the complete month before each of its boundaries (up to 3, labelled like `Nov 2026`), then the requested month's own totals last. `expense` includes trips; `tripExpense` (2.8.4) is the trip part of it. Income and expense count every account's rows, archived ones included, like `income` and `expenses`. Before 2.8.1 the current month appeared twice and the oldest month not at all. |
| `currentStreak` | integer | Consecutive zone-local days with at least one logged transaction, ending today or yesterday. Anything except an adjustment counts (transfers and trip rows included). Looks back 400 days. |
| `weekIncome`, `weekExpense` | integer | Paise for the current Monday-start zone-local week, regardless of `month`. `weekExpense` includes trips. |
| `weekTripExpense` | integer | 2.8.4. Paise. The trip part of `weekExpense`. |
| `biggestExpense` | object \| null | `{ title, amount, occurredAt }` — the single largest expense in the month, trips included. `null` when the month has no expenses. |
| `biggestEverydayExpense` | object \| null | 2.8.4. The same, everyday spending only (no `tripId`), so it never names a trip share. `null` when the month has no everyday expenses. |
| `sinceLastOpened` | object? | `{ transactions, spent, tripSpent }` — count and paise of **expense** transactions at or after `since`; `spent` includes trips, `tripSpent` (2.8.4) is the trip part of it. Absent (not zero) when `since` was not sent. |

Only `income` and `expense` rows reach the totals. Transfers and the two
adjustment types are excluded, so a balance correction never reads as income or
spend. They do move `netWorth`, through the account balance.

#### Net-worth history

Account balances are running totals with no stored history, so each past point
is today's `netWorth` minus what later rows did to the accounts it counts. From
2.8.4 (D24) those are the same accounts as today's figure: the non-archived
ones. Income and positive adjustments add, expenses and negative adjustments
subtract, when they sit on one of those accounts; a transfer counts only the legs
that land on one (so between two of them it nets to zero, and money moved to or
from an archived account counts on the day it moved). Archiving an account then
changes no past point. Up to 2.8.3 the walk-back used every account's income,
expense and adjustments and ignored transfers, so every past point moved when an
account with rows in the window was archived. The same rule gives
[`GET /reviews`](#get-reviews) `netWorth`. Read-only: no stored data changes.

#### Trip totals (2.8.4, D21)

"Spent" or "Expenses" alone means everyday spending, without trips; a figure
that includes trips says so. Every 2.8.1 field keeps its meaning (`expenses`
still includes trips, so the 2.8.1 app shows what it showed), and the new
`trip…` fields carry the trip part beside it, so the app can show everyday
spending with a "Plus ₹X on trips" line. Savings and net worth always include
trips. Budgets, pace, recurring and cash flow already leave trips out.

**Warning**
A malformed `month` or `since` is a `400` `invalid_input`. UNVERIFIED: `since` uses `z.iso.datetime()`, which in zod v4 accepts
the UTC `Z` form by default and rejects numeric offsets; this was read, not
executed.

**Known issue**
The last `flowTrend` entry is labelled with the `YYYY-MM` key (`2026-11`), while
every earlier entry and every `netWorthTrend` label uses the `Nov 2026` form.
When `month` names a past month, that month's figures are appended after a
history that still ends at the current month.

### GET /dashboard/health

Takes no parameters. The financial health score, always as of now: unlike the
summary it describes a trailing 90-day window rather than a named month, so
there is nothing for a caller to choose. That difference in span is also why it
is a separate request and not a field on `/dashboard/summary`. `data` is
`HealthScore`.

| Field | Type | Description |
|---|---|---|
| `score` | `number \| null` | 0–100. `null` when there is not enough history to score. |
| `band` | enum | `excellent` \| `good` \| `fair` \| `attention` \| `risk` \| `unknown`. |
| `rating` | string | Human label: `Excellent` (80+), `Good` (65+), `Fair` (50+), `Needs attention` (35+), `At risk`, or `Not enough data`. |
| `windowDays` | integer | Trailing days the money figures are measured over (90). |
| `pillars` | array | The five components, or `[]` when there is no score. See below. |
| `focus` | object? | `{ key, label, hint }` — the weakest scored pillar that has a hint. Ties go to the heavier pillar. |
| `reason` | string? | Why there is no score. Present only when `score` is `null`. |
| `runwayMonths` | `number \| null` | Raw months of runway behind the buffer pillar. `null` exactly when that pillar is `null`. |

Each pillar:

| Field | Type | Description |
|---|---|---|
| `key` | enum | `savings` \| `buffer` \| `bills` \| `budgets` \| `goals`. |
| `label` | string | Display name, e.g. `Safety buffer`. |
| `score` | `number \| null` | 0–100 (whole), or `null` when the pillar does not apply to this user yet. |
| `weight` | integer | Its share of the total before renormalising: 30 / 25 / 20 / 15 / 10. |
| `value` | string | The measurement, pre-formatted: `18.0%`, `2.4 months`, `1 of 4 late`. Before 2.8.4 a percentage was whole (`18%`). |
| `verdict` | string | `On track` (80+) \| `Okay` (60+) \| `Watch` (40+) \| `Off track`. |
| `hint` | string? | What to do about it. Present only below 65. Written like every [server sentence](#server-written-sentences). |

From 2.8.4 (D21) the buffer pillar (and `runwayMonths`) measures runway against
**everyday** spending in the window: trip shares are left out of the monthly
expense rate, since a holiday is a one-off, not the rate to plan a buffer on.
This moves the buffer's score, value and hint, and through them the total, for
anyone with trip spending in the last 90 days. The savings pillar still counts
trips, as savings always do, and its hint says so ("Keeping 5.0% of what comes
in, including trips.", "You are spending more than you earn over the last 90
days, including trips.") when the window had any trip spending.

Pillars are returned heaviest first, and a pillar that does not apply is
omitted from the array when its builder returns nothing: savings needs income in
the window, buffer needs spending, bills needs at least one bill, budgets needs
a non-zero budget this month, goals needs a goal with a deadline. The total is
the weighted average of the pillars that are present, rounded; if any pillar
scores under 25 the total is capped at 79 so the headline cannot read
"Excellent" over a failing pillar.

No score is produced when the account has no transactions, or when its first
transaction is under 30 days old. Then `score` is `null`, `band` is `unknown`,
`pillars` is `[]` and `reason` says what is missing (including how many days
remain).

**Note**
Earlier drafts of this reference said an inapplicable pillar is returned with
`score: null`. The code filters those pillars out of the array; the type still
allows `score: null`, but the endpoint does not emit it.

See [Health score](architecture.md#health-score) for the reasoning behind the
weights, the curves and the confidence gate.

### GET /dashboard/insights

Takes no parameters. The "For You" carousel's genuinely-new slides plus the
pace-versus-average chart, always for the current zone-local month. Kept off
`/dashboard/summary` because these figures are ranked, omit-shaped or
series-shaped, not scalars. `data` is `DashboardInsights`.

| Field | Type | Description |
|---|---|---|
| `forYou.goalWatch` | object \| null | `{ goalName, monthsNeeded, projectedDate, saved, target }` for the unfinished goal closest to finishing at its own pace (`saved ÷ months since creation`, minimum 1 month). Goals with and without a deadline both count. `null` when no goal has a positive saving rate. `projectedDate` is an ISO instant. |
| `forYou.noSpendDays` | integer \| null | Days elapsed this month with no `expense`. `null` before day 5 of the month. |
| `forYou.weekdayHeatmap` | array \| null | Seven `{ day, total, intensity }` cells, `Mon`..`Sun`, Monday first. `intensity` is 0–1 against the heaviest weekday. `null` before day 14 of the month. |
| `pace` | object \| null | `null` for an account younger than one complete month. |

`pace` is `{ current, average, monthsAveraged }`:

| Field | Type | Description |
|---|---|---|
| `current` | `{ date, amount }[]` | One point per elapsed day this month (`YYYY-MM-DD`, paise of expense for that day). |
| `average` | `{ date, amount }[]` | The per-day-of-month average over the last `monthsAveraged` complete months (up to 3). May run longer than `current`. Dated like `current` where they overlap and `day-N` past the end of a shorter current month. |
| `monthsAveraged` | integer | 1–3, floored to actual history. |

| `everyday` | object | 2.8.4. `{ noSpendDays, weekdayHeatmap, pace }`, the same three with trip spending left out: a day with only a trip share is a no-spend day, and the heatmap and both pace series count everyday spending. Same shapes and the same `null` rules as above. |

`forYou.noSpendDays`, `forYou.weekdayHeatmap` and `pace` count every `expense`
transaction, trips included, as in 2.8.1; `everyday` is what "spending" means in
the 2.8.4 app (D21).

## Insights

| Method | Path | Description |
|---|---|---|
| `GET` | `/insights` | Spending overview for one window, with the window before it. |
| `GET` | `/insights/category/{id}` | One category over the same window. |

Both take the same query parameters.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `period` | enum | `month` | `day` \| `week` \| `month` \| `year`. |
| `offset` | integer | `0` | Whole periods back from the current one. Must be 0 or negative. |

A positive `offset` is rejected with a 400. See
[Period windowing](architecture.md#period-windowing). Windows are zone-local:
`week` starts on Monday, and a window is `[periodStart, periodEnd)`. The
"previous" window is the same-length period immediately before.

### GET /insights

`data` is `InsightsSummary`. All figures exclude transfers and adjustments.

| Field | Type | Description |
|---|---|---|
| `period` | enum | Echo. |
| `timeZone` | string | The zone every bucket below was cut in. |
| `periodStart`, `periodEnd` | string | ISO instants; end exclusive. |
| `trend` | `{ date, amount, tripAmount }[]` | Expense per bucket, dense and ordered, zeros included. `amount` includes trips; `tripAmount` (2.8.4) is the trip part, so the everyday line is `amount - tripAmount`. Buckets are hours (`YYYY-MM-DDTHH`) for `day`, days (`YYYY-MM-DD`) for `week` and `month`, months (`YYYY-MM`) for `year`. A running window stops at the current bucket. |
| `previousTrend` | `{ date, amount, tripAmount }[]` | The same buckets for the previous window, not stopped early. Compared with `trend` by index, not by date. |
| `incomeVsExpense` | `{ periodStart, income, expense, tripExpense }[]` | Always 6 entries, oldest to newest, zero-filled; the last is the current window, the one before it the previous. `periodStart` is a zone-local `YYYY-MM-DD`. `expense` includes trips; `tripExpense` (2.8.4) is the trip part, so everyday spending is `expense - tripExpense`. |
| `byCategory` | `InsightsCategorySlice[]` | Expense per top-level category, children rolled in, biggest first. `children` carries the sub-category split (already counted in `total`, so never sum both levels). Includes archived categories' names. From 2.8.4 every slice except Trips carries `share`: its share of everyday spending, 0–100 to one decimal (see below). |
| `uncategorised` | `{ total, share }` | 2.8.4. Everyday spending filed under no category (bill payments, older rows): in no slice, but part of the everyday spending the shares divide by. `{ total: 0, share: 0 }` when there is none. |
| `categoryCompare` | array | `{ categoryId, name, current, previous }`, one row per category with spend in either window, ordered by the size of the change, not the size of the spend. |
| `byAccount` | `{ accountId, name, total }[]` | Expense per account, biggest first. Spend charged to a `person` account (a trip share a friend paid) is merged into one slice `{ accountId: "friends", name: "Paid by friends" }`. |
| `avgDailySpendCurrent` | integer | Paise per day. A running window divides by days elapsed including today; a finished one by its full length. |
| `avgDailySpendPrevious` | integer | Paise per day over the previous window. |
| `avgDailyEverydaySpendCurrent`, `avgDailyEverydaySpendPrevious` | integer | 2.8.4. The same averages without trip spending, for the projection. Rounded separately, so not exactly `avgDailySpend* - trips ÷ days`. |
| `topCategory` | string \| null | Name of the biggest `byCategory` slice, skipping a category named `Others`. |
| `txnCount` | integer | Count of `income` and `expense` transactions in the window. |

**Important**
`byCategory` excludes trip spending from the real categories and adds **one**
extra slice instead: `{ categoryId: "trips", name: "Trips", total, children }`,
with each trip as a child. `"trips"` is not a category ID. The app routes a tap on
it to Trips, and `GET /insights/category/trips` does not resolve (a malformed id
in the path is a `404` `not_found`, `That category doesn't exist any more`). Other
figures in the same response, listed in
[Known issues: planning, insights and operations](#planning-insights-and-operations), still include trips;
from 2.8.4 each of them that the app shows as spending carries its trip part or an everyday twin
beside it (`incomeVsExpense[].tripExpense`, `trend[].tripAmount`, `avgDailyEverydaySpend*`).
`byAccount` keeps trips with no split: it answers "how much left this account", and a trip
share did leave it.

**Shares (2.8.4).** `share` divides by everyday spending in the window: every
`expense` row without a `tripId`, uncategorised ones included, which is
`incomeVsExpense[5].expense - incomeVsExpense[5].tripExpense`. The shares are
rounded together (largest remainder), so the slices' shares plus
`uncategorised.share` add up to exactly 100.0 whenever there is any everyday
spending, and each is within 0.1 of its true value. The Trips slice has no
`share`; the "with trips" total is `incomeVsExpense[5].expense`.

### GET /insights/category/{id}

`data` is `InsightsCategoryDetail`. Every figure is rolled up (the category plus
its children), matching the row that led here and what a budget on the category
governs. Archived categories are allowed; another user's, an unknown one or a
malformed id is a `404` `not_found`, `That category doesn't exist any more`.

| Field | Type | Description |
|---|---|---|
| `categoryId`, `name` | string | The category. |
| `parentName` | string? | Present only when the category is itself a sub-category. |
| `period`, `timeZone`, `periodStart`, `periodEnd` | | As above. |
| `total` | integer | Paise, expenses in the window, `tripId` empty. |
| `previousTotal` | integer | Same, previous window. |
| `shareOfSpend` | number | `total ÷ all expense spend in the window × 100`. The denominator includes trip spending, the numerator does not. |
| `shareOfEverydaySpend` | number | 2.8.4. `total ÷ everyday spend in the window × 100` (trips left out of both, uncategorised spend counted). Not rounded; the breakdown's `share` for the same row is this to one decimal, give or take the 0.1 the rounding together can move it. |
| `txnCount` | integer | Expense transactions counted in `total`. |
| `trend` | `{ date, amount }[]` | Same bucketing and early stop as `InsightsSummary.trend`, narrowed to this category and its children, trips excluded. |
| `children` | `InsightsCategorySlice[]` | Sub-categories with spend, biggest first. Empty for a sub-category. A child with no resolvable name reads `Uncategorised`. |

See [Insights engine](insights-engine.md) for the rule-based layer that sits on
top of these figures.

## Highlights

The deterministic assistant: ranked, plain-language observations computed by
rules. There is no LLM. See [The rules](insights-engine.md#the-rules) and
[Ranking and noise control](insights-engine.md#ranking-and-noise-control).

| Method | Path | Description |
|---|---|---|
| `GET` | `/highlights` | The current top highlights. |
| `GET` | `/highlights/history` | Every highlight ever raised, newest first. |

### GET /highlights

Takes no parameters. `data` is `HighlightsPayload`.

| Field | Type | Description |
|---|---|---|
| `highlights` | `IHighlight[]` | Already ranked by `materiality` (paise at stake) and capped at 4. Render in order. |
| `generatedAt` | string | ISO instant. |
| `timeZone` | string | The zone the day-counts in the copy were cut in. |
| `warmingUp` | string? | Present instead of a full list while the account is too new. |

Each `IHighlight`:

| Field | Type | Description |
|---|---|---|
| `ruleId` | string | One of `budget_pace`, `budget_comfortable`, `bill_vs_balance`, `bill_cluster`, `category_spike`, `category_drop`, `savings_rate_move`, `goal_pace`, `health_focus`, `catch_all_heavy`, `logging_streak`, `investment_stale`, `investment_milestone`, `investing_streak`, `recurring_found`. |
| `key` | string | Stable per subject and month (for example `budget_pace:<categoryId>:<YYYY-MM>`). What the client dismisses by. |
| `severity` | enum | `urgent` \| `warning` \| `notice` \| `win`. |
| `title`, `body` | string | Fully composed copy, money already formatted in the user's currency (default `INR`), as every [server sentence](#server-written-sentences). |
| `materiality` | integer | Paise at stake. |
| `screen` | enum? | `budgets` \| `bills` \| `goals` \| `health` \| `activity` \| `investments`. Where tapping the card lands. |

**Cold start.** With no transactions, under 14 days of history, or fewer than 10
expense transactions, the response is `warmingUp` plus at most the
`logging_streak` highlight: a streak is as true on day 3 as on day 300, so it is
exempt from the gate. See [Cold start](insights-engine.md#cold-start).

**Important**
Although the engine is described as read-only, this endpoint **writes**. Every
call upserts one `HighlightLog` row per fired rule key with `$setOnInsert` — the
whole ranked list, not just the 4 shown. A logging failure never fails the
request.

### GET /highlights/history

The permanent record the live endpoint never keeps. One row per distinct `key`,
written at first occurrence in its first wording and never edited or removed;
nothing dismisses or deletes it.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | `1` | 1-based. |
| `limit` | integer | `20` | Maximum 100. |

`data` is a [page](#pages), newest first (`HighlightHistoryPage`, which is
`Paginated<IHighlightLog>`). Each item is the `IHighlight` fields plus
`createdAt` (when the key was first seen) and the stored `_id`. `screen` is
`null` when unset.

The history is the source for the review timeline's highlight entries, so a
period with no `/highlights` poll has none.

## Review

A recap of one **closed** week or month, computed on demand rather than stored,
so it stays correct if a past transaction is later edited.

| Method | Path | Description |
|---|---|---|
| `GET` | `/reviews` | The review for one closed period. |

The path is plural: `/reviews`, not `/review`.

### GET /reviews

| Parameter | Type | Default | Description |
|---|---|---|---|
| `period` | enum | `month` | `week` \| `month`. `day` and `year` are rejected. |
| `offset` | integer | `-1` | Whole periods back. Must be `-1` or lower: `0` (the running period) is rejected with a 400. |

`data` is `ReviewPayload`. The window is cut with the same `parsePeriod` as
[Insights](#insights), in the caller's zone, and the currency for the copy comes
from the user document (default `INR`).

| Field | Type | Description |
|---|---|---|
| `period`, `offset` | | Echo. |
| `periodLabel` | string | `August 2026` for a month; `Aug 18 – 24` (or `Aug 28 – Sep 3`) for a week. |
| `periodStart`, `periodEnd` | string | ISO; end exclusive. |
| `verdict` | `{ headline, detail }` | `headline` is `<amount> saved this period` (`₹33,909.80 saved this period`); `detail` compares with the previous period (`Up 6.0% from last time.`, `Down 5.9% …`, `About the same as last time.` when the change rounds to 0.0%, or `No prior period with any saving to compare against yet.` when the previous saved amount was 0). Whole rupees and whole percentages before 2.8.4. |
| `income`, `expenses`, `saved` | integer | Paise. `income` and `expense` rows only; trips included in `expenses` and `saved`. |
| `tripExpenses` | integer | 2.8.4. The trip part of `expenses`; everyday spending is `expenses - tripExpenses`. |
| `previousIncome`, `previousExpenses`, `previousSaved` | integer | Same for the window before. |
| `previousTripExpenses` | integer | 2.8.4. The trip part of `previousExpenses`, so a change in spending can compare everyday with everyday. |
| `categories` | `ReviewCategorySlice[]` | Top 5 of the insights `byCategory` breakdown (so the single `Trips` slice can appear). `pct` is the whole-number share of the breakdown's total (all slices, Trips included, uncategorised spend left out). From 2.8.4 every slice but Trips also carries `share`: its share of everyday spending to one decimal, computed over every slice (not only the five sent) and uncategorised spend, exactly as on [Insights](#get-insights). |
| `uncategorised` | `{ total, share }` | 2.8.4. Everyday spending in the period with no category, and its share. With it the everyday slices' `share` add up to 100.0 (when all of them are in the top five). |
| `biggestExpense` | object \| null | `{ title, amount, occurredAt }`, everyday spending only (`tripId` empty). |
| `timeline` | `ReviewMoment[]` | Dated, sorted ascending, short on purpose. See below. |
| `habits` | object | `streakAtEnd` (streak ending on the period's last day), `activeDays` (days with any non-adjustment transaction), `totalDays`, `noSpendDays` (`totalDays - activeDays`). |
| `netWorth` | object \| null | `{ total, previousTotal }` at the period's two boundaries. Month only; `null` for a week, or when history does not reach back. Counts the same accounts as today's net worth from 2.8.4 ([Net-worth history](#net-worth-history)). |
| `goals` | `ReviewGoalContribution[]` | Goals with a logged contribution in the period, biggest first. Name falls back to `Goal` for a deleted goal. |
| `bills` | `ReviewBillSummary` | `paidCount` (bills with `lastPaidAt` in the period, recurring included), `dueCount` and `late` (one-off bills only; a recurring bill's past due dates are not recoverable). |
| `investments` | `ReviewInvestments \| null` | `contributed` (transfers into non-archived holdings), `portfolioChange` (net of value adjustments), `biggestGainer`. `null` when the user has no investment accounts. |

`timeline` holds only what is real: the biggest expense, up to 5 highlight
titles first seen in the period (from `HighlightLog`), each one-off bill paid
late, the largest goal contribution, for a month the heaviest or lightest week,
and a closing "Period closes" entry. From 2.8.4 the biggest expense is the
everyday one, the same row as `biggestExpense` (before, it could be a trip
share). The heaviest or lightest week ("₹X spent") counts everyday spending only
from 2.8.4 too, so a trip week no longer reads as the heaviest. Every moment's
text is a [server sentence](#server-written-sentences); a highlight's title is
copied as it was stored when first seen, so one stored before 2.8.4 keeps whole
rupees.

#### Server-written sentences

The review's verdict and timeline, highlights, Health hints and values, and the
notifications the server sends (bill, goal, budget and digest) are composed on
the server in `utils/money.ts`. From 2.8.4 (Q3) they follow the app's rules:
exact paise (`₹33,909.80`), one decimal on a measured percentage (`6.0%`,
`100.0%`), and the true minus `−` (U+2212) on a negative (`−₹30.00 saved`). A
figure that rounds to zero is unsigned (`₹0.00`, `0.0%`). A budget warning's
percentage is floored to a tenth, so it never reads `100.0%` short of the limit.
Fixed thresholds in the wording stay as written: `The usual target is 20%`, and
a goal's `25%`/`50%`/`75%` milestones. The wording is otherwise unchanged.
Rows already stored (notifications, highlight history) keep the text they were
written with.

**Important**
`habits.noSpendDays` means "days with no transaction of any non-adjustment kind".
The dashboard's `forYou.noSpendDays` means "days with no expense". The two
differ for a day that has only income or a transfer.

## Cash flow

| Method | Path | Description |
|---|---|---|
| `GET` | `/cash-flow` | A day-by-day balance projection from today to the end of next month. |

### GET /cash-flow

Takes no parameters. `data` is `CashFlowPayload`.

| Field | Type | Description |
|---|---|---|
| `startBalance` | integer | Paise. Sum of `balance` over non-archived `bank`, `cash` and `wallet` accounts. Credit cards, investments and person accounts are left out. |
| `dailySpend` | integer | Paise per day of typical spending, subtracted from every day after today. |
| `days` | `CashFlowDay[]` | One entry per zone-local day, today through the last day of next month. |
| `lowest` | `{ date, balance }` | The day with the lowest projected balance. |
| `endBalance` | integer | Balance at the end of the last day. |

Each `CashFlowDay` is `{ date, items, balance }`, where `date` is `YYYY-MM-DD`
and `balance` is the projected end-of-day balance. Each item:

| Field | Type | Description |
|---|---|---|
| `kind` | enum | `bill` \| `sip` \| `income`. `sip` is a bill with `toInvestment`; it leaves the liquid balance like any bill. |
| `name` | string | Bill name, or the income pattern's title. |
| `amount` | integer | Positive paise. `kind` gives the direction. |
| `billId` | string? | Bill and SIP items. |
| `patternKey` | string? | Income items: the recurring key, for "not a regular income" (`POST /recurring/dismiss`). |
| `basedOnMonths` | integer? | Income items: months the estimate rests on. |
| `overdue` | boolean? | A bill already past due, carried onto today. |

How the projection is built (`balance(day) = balance(day − 1) + income − bills −
dailySpend`):

| Input | Rule |
|---|---|
| Bills | Stored-`paid` one-offs are skipped. An unpaid bill past its due date lands **today** with `overdue: true`. A recurring bill then repeats by its frequency counted from the stored due date (so month-end bills do not drift). |
| Income | Detected recurring income (see [Recurring suggestions](#recurring-suggestions)), placed at `lastAt` plus 1, 2, … months. An expected date up to 7 days in the past is placed today; older is treated as skipped. |
| `dailySpend` | Average expense per day over the last 90 days, trips excluded, leaving out titles that match a bill or a bill-matched recurring expense (they have their own day). The divisor is the days covered, floored at 14 and capped at 90. A recurring expense that is not a bill stays in the average. |
| Today | Carries its items but no day of `dailySpend`; part of today is already in the starting balance. |

## Investments

An investment is an account of `type: "investment"`. There is no market data:
every figure is typed in by the user. Funding a holding is a `transfer` **into**
it, redeeming is a `transfer` **out** of it, and revaluing it is a
`positiveAdjustment` or `negativeAdjustment` on it (the balance-sync call in
[PATCH /accounts/{id}/balance](#patch-accountsidbalance)). Holdings are created
and archived through `/accounts`; the endpoints below read them and manage their
cost basis and deletion.

| Method | Path | Description |
|---|---|---|
| `GET` | `/investments` | The hub: holdings, totals, allocation, this month. |
| `GET` | `/investments/trend` | Month-end history of every holding and of the portfolio. |
| `GET` | `/investments/report` | One-read payload for the exported statement. |
| `GET` | `/investments/{id}/history` | One holding's raw transactions, newest first. |
| `PATCH` | `/investments/{id}/basis` | Sets what was invested, since when, and how. |
| `DELETE` | `/investments/{id}` | Removes a holding and everything on it. |

Every endpoint reads only the caller's **non-archived** investment accounts,
except where noted. Archived holdings vanish from the hub, the trend, and the
report.

### The model

| Quantity | Definition |
|---|---|
| `invested` | `startingBalance` (the cost basis when the holding was added) + transfers in − transfers out. |
| `current` | The account's stored `balance`. |
| `gain` | `current − invested`. |
| value (history) | `invested + gain`, as of a month end. |

**Important**
When a holding is created with `currentValue`, `balance` is set to that value
and `startingBalance` stays the cost. The difference is the **opening gain**.
That value is *not* saved as a transaction, so the history recovers it:
`opening = balance − (startingBalance + Σ flows + Σ updates)`. Everything the
trend and the report say about the past is therefore anchored on today's
balance. Changing the cost through
[PATCH /investments/{id}/basis](#patch-investmentsidbasis) moves `startingBalance`
but not `balance`, so the opening gain restates by exactly the correction.

Rules the history follows:

- **It starts where the records start.** The first point is the month of the
  holding's creation, or of its earliest transfer or update if that is earlier.
  Nothing before that is known, so nothing before it is drawn.
- **A value update is any adjustment on the holding**, including a plain
  balance reconciliation. Money moved is a transfer.
- **A month with no update carries the last gain forward.** Money added in that
  month counts at cost; nothing is assumed to have grown or fallen. The point is
  flagged `upd: false`.
- **Growth is the change in gain, never the money added.**
  `growth = (value − invested) − (previous value − previous invested)`.
  Adding money, or taking it out, moves `value` and `invested` together and
  leaves growth at 0.
- **The current month is `partial`** and takes every record on file, so its
  point equals today's balance exactly. That includes future-dated records.
- **Months are cut in the user's zone** (`prefs.timeZone`), not UTC. See
  [Time zones](architecture.md#time-zones). A record at 1:30am on the 1st in
  Delhi belongs to the new month.
- **The first month's growth is `null` and `opening: true`.** The opening gain
  is where the history starts, not growth.
- **Percentages are percentages.** `pct` is `15.0` for 15%, unlike
  `annualReturn`, which is a fraction.

### GET /investments

Returns the hub payload. Nothing is stored for it; it is computed per request.

With no holdings the response is `holdings: []`, `allocation: []`, all-zero
`totals` with `annualReturn: null` / `annualReturnStatus: "unavailable"`, and a
zeroed `thisMonth`.

| Field | Type | Meaning |
|---|---|---|
| `holdings` | InvestmentHolding[] | In the account's `order`, then creation time. |
| `totals` | object | Sums across `holdings`, plus a combined yearly return. |
| `allocation` | `{ kind, current }[]` | Current value per `kind`, biggest first. |
| `thisMonth` | object | The zone-local month so far. |

**`holdings[]`**

| Field | Type | Meaning |
|---|---|---|
| `accountId` | string | |
| `name` | string | |
| `icon` | string \| undefined | |
| `color` | string \| undefined | |
| `kind` | string | `investmentKind`, or `"Other"` when unset. A free string (SIP, Mutual Fund, FD, ...), not an enum. |
| `invested` | integer | Paise. Cost basis net of redemptions. |
| `current` | integer | Paise. The stored balance. |
| `gain` | integer | Paise. `current − invested`; includes the opening gain. May be negative. |
| `lastUpdatedAt` | ISO string \| null | The latest adjustment on the holding, of any kind. `null` if it was never revalued. |
| `investedSince` | ISO string \| null | When the opening amount started going in. |
| `investedHow` | `"sip"` \| `"lump"` \| null | |
| `annualReturn` | number \| null | See [Yearly return](#yearly-return). |
| `annualReturnStatus` | enum | See [Yearly return](#yearly-return). |

**`totals`**

| Field | Type | Meaning |
|---|---|---|
| `invested` | integer | Sum of the holdings' `invested`. Paise. |
| `current` | integer | Sum of `current`. Paise. |
| `gain` | integer | Sum of `gain`. Paise. |
| `annualReturn` | number \| null | The portfolio's combined yearly return. |
| `annualReturnStatus` | enum | As below. |

**`thisMonth`**

| Field | Type | Meaning |
|---|---|---|
| `contributed` | integer | Every transfer **into** a holding this month. Redemptions are not subtracted. Paise. |
| `portfolioChange` | integer | Net of this month's adjustments on holdings (gains minus losses). Paise. |
| `income` | integer | Every `income` transaction this month, into **any** account. The denominator for "what share did I invest". Paise. |

**Note**
`allocation` sums `current` per kind and can include a negative slice if a
holding's balance is negative.

### Yearly return

`annualReturn` is a money-weighted return (XIRR), reported as a **fraction**:
`0.124` is 12.4% a year. It credits each rupee only for the time it was
invested, so a SIP's recent instalments do not dilute the figure.

The cash flows, from the investor's side, are: the opening amount (negative,
dated `investedSince`), each contribution (negative, dated its `occurredAt`),
each redemption (positive), and today's value (positive, now) when `current > 0`.
A holding with `investedHow: "sip"` spreads its opening amount evenly over the
months from `investedSince` to the holding's creation (at least 1), the
remainder on the last instalment. Any other `investedHow` puts it on one day.

`annualReturn` is `null` unless `annualReturnStatus` is `ok`:

| `annualReturnStatus` | `annualReturn` | Why |
|---|---|---|
| `ok` | number | Computed. |
| `noStartDate` | `null` | There is an opening amount (`startingBalance > 0`) but no `investedSince` to date it. |
| `tooEarly` | `null` | The money-weighted average age of the invested rupees is under 90 days. Annualising a short period is noise. |
| `unavailable` | `null` | Nothing was put in on record, the flows are all one sign, or the solver found no rate. |

For `totals`, the combined figure is `noStartDate` as soon as any holding with a
positive `current` has no start date: the portfolio return is unknowable, not
merely smaller. A holding whose `current` is 0 or less and has no start date is
left out of the combined figure instead.

### GET /investments/trend

Month-end history, worked out on read from the transfers and the value updates
already stored. No history is stored. Returns a `PortfolioTrend`. With no
holdings: `{ points: [], growth: [], holdings: [] }`.

| Field | Type | Meaning |
|---|---|---|
| `points` | PortfolioPoint[] | Oldest first, from the earliest holding to the current month. |
| `growth` | PortfolioGrowth[] | One entry per point, same months. |
| `holdings` | HoldingTrend[] | Each holding on its own, in hub order. |

**`HoldingTrend`**

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Account id. |
| `name`, `icon`, `color` | | As on the hub. |
| `startedAt` | ISO string | The earlier of the creation time and the earliest record. |
| `lastUpdatedAt` | ISO string \| null | The latest update; `null` if none. |
| `monthsSinceUpdate` | integer | Whole months since the last month flagged `upd`. `0` is this month. A holding never updated counts from its first month, which is flagged `upd`. |
| `points` | MonthPoint[] | |
| `growth` | GrowthPoint[] | |
| `updates` | UpdateEntry[] | Newest first. |

**`MonthPoint`**

| Field | Type | Meaning |
|---|---|---|
| `month` | string | `YYYY-MM` in the user's zone. |
| `label` | string | `Sep`, or `Sep ’25` on the first point and on every January. |
| `value` | integer | `invested + opening gain + Σ updates` up to the month end. Paise. |
| `invested` | integer | `startingBalance + Σ flows` up to the month end. Paise. |
| `upd` | boolean | A value update was recorded in that month. The first month always counts (the value typed on adding). `false` means the gain is carried forward. |
| `contrib` | integer | Money in net of money out **within** the month. Paise. |
| `partial` | `true` \| absent | Only on the last point: the month is not finished, and `value` is today's balance. |

**`GrowthPoint`**

| Field | Type | Meaning |
|---|---|---|
| `month`, `label` | string | As on `MonthPoint`. |
| `growth` | integer \| null | Change in gain since the previous month. `null` for the first month. Paise. `0` in a carried-forward month. |
| `pct` | number \| null | `growth` over the money working that month: previous `value` plus this month's `contrib`. `0` when that base is not positive. `null` for the first month. |
| `upd` | boolean | As on `MonthPoint`. |
| `cover` | integer | For an updated month, how many months the change spans (`1` = no gap; an update after a three-month silence books the whole change in its own month with `cover: 3`). `0` for a carried-forward month. `1` for the first month. |
| `opening` | `true` \| absent | Only on the first month. |

**`UpdateEntry`**

| Field | Type | Meaning |
|---|---|---|
| `at` | ISO string | When the adjustment was dated. |
| `value` | integer | The holding's value right after it: cost to that instant plus gain. Paise. |
| `change` | integer | The signed adjustment. Positive means it was worth more than the carried value. Paise. |

The opening gain is not an `UpdateEntry`.

**`PortfolioPoint`** is a `MonthPoint` with the holdings summed, plus:

| Field | Type | Meaning |
|---|---|---|
| `updated` | integer | How many of the holdings that existed in the month had a value given. |
| `existing` | integer | How many holdings existed in the month. |
| `parts` | `{ id, value }[]` | Each existing holding's value. |

`upd` is true when any holding was updated. `partial` is on the last point. A
holding added mid-history is absent from earlier months.

**`PortfolioGrowth`** is a `GrowthPoint` plus:

| Field | Type | Meaning |
|---|---|---|
| `parts` | `{ id, growth, upd, cover }[]` | Each contributing holding's growth. |

Only holdings that already existed the previous month are summed: one added this
month has an opening value, not growth. `cover` is the largest of the parts. If
no holding qualifies, the entry is `growth: null`, `pct: null`, `upd: true`,
`cover: 1`, `opening: true`, `parts: []`. This is always the first month, and
can recur when holdings were all added in the same month.

### GET /investments/report

Everything the exported statement needs, in one read. The app chooses the scope
and period; it needs no second request.

| Field | Type | Meaning |
|---|---|---|
| `asOf` | ISO string | When the report was computed. |
| `holdings` | InvestmentHolding[] | As on `GET /investments`. |
| `totals` | object | As on `GET /investments`. |
| `allocation` | `{ kind, current }[]` | As on `GET /investments`. |
| `trend` | PortfolioTrend | As on `GET /investments/trend`. |
| `ledger` | LedgerEntry[] | Every entry on every holding, **oldest first**. |

`thisMonth` is not part of the report.

**`LedgerEntry`**

| Field | Type | Meaning |
|---|---|---|
| `at` | ISO string | |
| `holdingId` | string | |
| `holdingName` | string | |
| `kind` | `added` \| `in` \| `out` \| `update` | `added` is one line per holding, dated its creation. `in`/`out` are transfers (a zero amount reads as `in`). |
| `amount` | integer | Its effect on the value: money in (+), money out (−), value change (±). For `added`, the value it started at. Paise. |
| `valueAfter` | integer | The holding's value once this entry was applied. The last entry of each holding equals `current`. Paise. |

Within one instant the order is `added`, then `in`/`out`, then `update`.

### GET /investments/{id}/history

Returns the holding's raw transactions, newest first by `occurredAt`: every
transaction where the account is `account` or `toAccount`, which includes
contributions, redemptions, **and value updates**. The ordinary
`GET /transactions` list hides adjustments, which is why this exists. Capped at
the latest 200; there is no pagination.

The response is an array of transaction documents, not a shaped payload, message
`Investment history fetched`.

| Case | Response |
|---|---|
| A holding of the caller's, live or archived | `200`, newest first. `[]` if nothing is recorded on it. |
| Malformed id, missing, another user's, or an account that isn't a holding | `404` `not_found`, `That holding doesn't exist any more`. |

### PATCH /investments/{id}/basis

Sets what has been invested, since when, and how. Only the cost basis moves;
today's value (the balance) is untouched, so the gain restates by exactly the
correction. All fields optional; unknown fields are a `400`.

| Field | Type | Constraints |
|---|---|---|
| `invested` | integer | Paise, at least 0. The **total** invested, not the opening amount. |
| `investedSince` | date \| null | Not in the future. `null` clears it. |
| `investedHow` | `"sip"` \| `"lump"` \| null | `null` clears it. |

When `invested` is sent, the server computes
`opening = invested − (transfers in − transfers out)` over every transfer that
touches the holding and stores it as `startingBalance`. If `opening` would be
negative the request fails with `400` `invalid_input`,
`Invested can't be less than what's already been added here` (no amount: the
message may show while privacy mode is on).

| Case | Response |
|---|---|
| Success | `200`, message `Holding updated`, data is the whole updated account document. |
| Malformed id, not an investment, archived, or not the caller's | `404` `not_found`, `That holding doesn't exist any more`. |
| `opening < 0`, a future `investedSince`, or a bad field | `400` `invalid_input`. |

**Note**
`investedSince` and `investedHow` feed the
[yearly return](#yearly-return). `invested` moves the opening gain used by the
history, as described under [The model](#the-model).

### DELETE /investments/{id}

Removes a holding and everything recorded on it, for starting over after a
mistake. This is different from `DELETE /accounts/{id}`, which archives and keeps
history. It runs in one database transaction.

| Query | Type | Constraints |
|---|---|---|
| `mode` | enum | **Required.** `undo` \| `keep`. A missing or unknown value is a `400`. |

The only decision is what the money moves into and out of the holding become,
because the other side of each is a real account.

| Mode | A transfer into or out of the holding becomes | Effect on the other account |
|---|---|---|
| `undo` | Reverted and deleted. | Its balance goes back to where it was before the transfer. |
| `keep` | A balance correction on the other account: a `negativeAdjustment` for money that went in (`Moved into <name> (deleted)`), a `positiveAdjustment` for money that came out (`Redeemed from <name> (deleted)`). | Its balance does not move. Like any correction, it stays out of Activity and Insights. |

In both modes:

- Value updates and any other transaction on the holding are deleted.
- SIP bills that fund it (`toInvestment`) are **deleted**.
- Bills paid *from* it lose their `account`.
- If it was the user's `prefs.defaultAccount`, that is set to `null`.
- The account document is deleted.

**Responses**

| Case | Response |
|---|---|
| Success | `200`, message `Holding deleted`, `{ "removedTransactions": 4, "removedBills": 1 }`. |
| Malformed id, or no such holding for the caller | `404` `not_found`, `That holding doesn't exist any more`. |
| `mode` missing or not `undo` / `keep` | `400` `invalid_input`. |

`removedTransactions` counts deleted rows only. Transfers rewritten as
corrections in `keep` mode are not counted.

**Warning**
This is irreversible. Unlike [PATCH /investments/{id}/basis](#patch-investmentsidbasis)
it also works on an **archived** holding, since its lookup does not filter on
`isArchived`.

## Trips

A trip is a stretch of dates, the people on it, and an optional budget. What is
spent on it is recorded as **ordinary transactions** tagged with the trip's id,
so account balances, cash flow, and totals stay true. The rest of the app treats
them specially: Insights shows all trips as one `Trips` slice, and budgets and
the everyday Activity list leave them out.

| Method | Path | Description |
|---|---|---|
| `GET` | `/trips` | Lists trips with totals. |
| `POST` | `/trips` | Creates a trip. |
| `GET` | `/trips/{id}` | The trip's full detail. |
| `PATCH` | `/trips/{id}` | Edits the trip's name, dates, people, or budget. |
| `DELETE` | `/trips/{id}` | Deletes the trip and undoes everything on it. |
| `POST` | `/trips/{id}/expenses` | Adds a shared expense. |
| `PATCH` | `/trips/{id}/expenses/{expenseId}` | Replaces an expense. |
| `DELETE` | `/trips/{id}/expenses/{expenseId}` | Deletes an expense and its transactions. |
| `POST` | `/trips/{id}/settle` | Records a friend paying you back, or you paying them. |
| `PUT` | `/trips/{id}/plan` | Saves what each person will actually pay. |
| `DELETE` | `/trips/{id}/plan` | Back to the exact amounts. |
| `POST` | `/trips/{id}/close` | Closes the trip. |
| `POST` | `/trips/{id}/reopen` | Reopens a closed trip. |
| `POST` | `/trips/{id}/import/preview` | Reads a Splitwise CSV and says what it means. Saves nothing. |
| `POST` | `/trips/{id}/import/commit` | Applies the approved rows. |

A malformed, missing or another user's `id` is `404` `not_found` (`That trip
doesn't exist any more`).

### People and accounts

Everyone on a trip other than you is a **person account** (`type: "person"`).
`members` holds those account ids; you are never in it. In an expense, **`null`
means you** (`paidBy: null`, `shares[].account: null`).

A person account's balance is what the user and that person owe each other
overall: **positive means they owe you, negative means you owe them**. A trip
balance is the same quantity restricted to the trip's transactions. The member
check is enforced when a trip is created or edited, and again on each expense:
everyone in a split, and whoever paid, must be on the trip.

### How an expense becomes ledger rows

**Your spending is your share, whoever paid.** An expense stores the whole bill,
who paid, and everyone's share, but is never counted itself. It writes
transactions, all inside one database transaction and all tagged with `tripId`
and `tripExpenseId`, at the expense's `occurredAt`.

| Who paid | Rows written | Effect on balances |
|---|---|---|
| You (`paidBy: null`), from `paidFrom` | An `expense` of **your share** on `paidFrom` (if your share is above 0), plus a `transfer` from `paidFrom` to each friend for **their** share (if above 0). The transfer's note is the expense title. | Your account drops by the whole bill. Each friend's person balance rises by their share: they owe you. |
| A friend (`paidBy: <person>`) | One `expense` of **your share**, charged to the **friend's person account** (if your share is above 0). | The friend's balance falls by your share: you owe them. What the other friends owe the payer is theirs, and is not recorded. |

An expense with a 0 share for you writes no `expense` row. Editing an expense
removes its rows (reverting their balance effects) and writes the new set;
deleting removes them. Rows from one expense are therefore never inconsistent.

`category` is stamped on the `expense` row only.

**Hidden from everyday Activity.** `GET /transactions?trips=exclude` returns
only rows with no `tripId`. `trips=only` returns the trip rows, and drops the
`transfer` rows that belong to an expense (`tripExpenseId` set), so one expense
reads as one line, its share. With no `trips` param everything is returned,
which is what an export needs. The same parameter is accepted by
`GET /transactions/summary`. Trip rows are also left out of title suggestions.

**Important**
Rows with a `tripExpenseId` cannot be edited or deleted through
`/transactions/{id}`: `PATCH` and `DELETE` there return `409` `conflict`,
`This is part of a trip expense. Change it from the trip`. Settle-up,
let-go, and plan rows carry a `tripId` but no `tripExpenseId`.

### Split modes

There is no split-mode field. The client chooses the `shares`, which are exact
paise per person; the server only checks they are valid and sum to `cost`:

| Rule | Error |
|---|---|
| `cost` is a positive integer. | `Enter the amount` |
| At least one share. | `Pick who it's split between` |
| Each share is an integer of 0 or more. | `Each share must be zero or more` |
| No person appears twice (you count as one). | `Someone is in the split twice` |
| Every share's account is `null` or a trip member. | `Everyone in the split must be on the trip` |
| Shares sum to `cost` exactly. | `The shares must add up to the amount` |
| You paid: `paidFrom` is set. | `Pick the account you paid from` |
| A friend paid: they are on the trip. | `Whoever paid must be on the trip` |

An even split is the client's job. The server provides no split helper to
clients (its own `splitEvenly` is internal), so a client that wants "even" must
give the remainder paise to the first few people itself. Unequal splits and exact
amounts are the same request with different numbers; a share of `0` is allowed.

### Trip objects

**`Trip`** (`ITrip`), as returned by the list and the detail:

| Field | Type | Meaning |
|---|---|---|
| `_id` | string | |
| `name` | string | |
| `emoji` | string | Default `🧳`. |
| `color` | string | Colour token, default `teal`. |
| `startDate`, `endDate` | ISO string | |
| `members` | string[] | Person account ids, not you. |
| `budget` | integer \| null | Paise. `null` for none. |
| `status` | `active` \| `closed` | |
| `closedAt` | ISO string \| null | |
| `createdAt` | ISO string | |

**`TripTotals`**, all paise:

| Field | Meaning |
|---|---|
| `myShare` | Sum of the trip's `expense` rows: what counts as your spending. Includes a let-go charged at close. |
| `paid` | Sum of `cost` of expenses **you** paid: the whole bill, before friends' shares are owed back. |
| `wholeTrip` | Sum of every expense's `cost`. |
| `balance` | Net of every member's balance: positive means you are owed overall. |

**`TripExpense`**, as returned inside `GET /trips/{id}`:

| Field | Type | Meaning |
|---|---|---|
| `_id`, `tripId` | string | |
| `title` | string | |
| `occurredAt` | ISO string | |
| `category` | string \| null | |
| `cost` | integer | Paise. The whole bill. |
| `paidBy` | string \| null | `null` means you. |
| `paidFrom` | string \| null | Your account it came out of, when you paid. |
| `shares` | `{ account: string \| null, amount }[]` | `null` is you. |
| `source` | `manual` \| `splitwise` | |
| `createdAt` | ISO string | |

### GET /trips

Returns every trip of the caller. Active trips first, then newest `startDate`.

| Field | Type | Meaning |
|---|---|---|
| `trips` | TripListItem[] | A `Trip`, plus `totals` and `openBalances`. |
| `trips[].totals` | TripTotals | |
| `trips[].openBalances` | integer | How many members have a non-zero trip balance. |
| `allTime.myShare` | integer | Sum of `myShare` over all trips. Paise. |
| `allTime.trips` | integer | Trip count. |
| `allTime.open` | integer | Sum of the **absolute** balance of every person on every trip, so "owed 500" and "owe 500" do not cancel. Paise. |
| `allTime.openTrips` | integer | Trips with at least one open balance. |
| `byYear` | `{ year, myShare, trips }[]` | Grouped by the **UTC** year of each trip's `startDate`, newest first. |

### POST /trips

Creates a trip. `201`, message `Trip created`.

| Field | Type | Constraints |
|---|---|---|
| `name` | string | Required, trimmed, 1 to 60 characters. |
| `emoji` | string | Optional, at most 8 characters. |
| `color` | string | Optional, at most 20 characters. |
| `startDate` | date | Required. |
| `endDate` | date | Required. Before `startDate` is `400` `invalid_input`, `The trip can't end before it starts`. |
| `members` | string[] | Required, at most 30 ids. Each must be one of the caller's non-archived person accounts, else `400` `invalid_reference`, issue path `members.<n>`. Duplicates are collapsed. May be empty. |
| `budget` | integer \| null | Optional. Paise, at least 0. |

The response data is the stored trip document, minus `userId` and `__v` (as
every reply, `utils/dto.ts`): the `Trip` fields plus `updatedAt`.

### GET /trips/{id}

Returns the trip's detail. Dates grouped by day use the user's zone.

| Field | Type | Meaning |
|---|---|---|
| `trip` | Trip | |
| `totals` | TripTotals | |
| `members` | TripMemberBalance[] | One per member. |
| `byCategory` | `{ category: string \| null, total }[]` | Your share per category, biggest first. `null` is uncategorised. |
| `byDay` | `{ date: "YYYY-MM-DD", total }[]` | Your share per zone-local day, oldest first. |
| `entries` | TripEntry[] | The timeline, newest first. |
| `expenses` | TripExpense[] | Newest first. |
| `plan` | TripPlan \| null | `null` on a trip nobody has matched. |

**`members[]`**

| Field | Meaning |
|---|---|
| `account` | Person account id. |
| `name` | Their name (`Someone` if the account can't be read). |
| `balance` | Positive: they owe you; negative: you owe them. After a plan is saved this is what they will actually pay. |
| `exact` | The balance the ledger gives before any plan. |
| `routed` | `balance − exact`: what the plan moved to or away from them. |

**`entries[]`** (`TripEntry`)

| Field | Type | Meaning |
|---|---|---|
| `kind` | `expense` \| `settlement` \| `letGo` | |
| `id` | string | The expense id, or the transaction id for the other two. |
| `occurredAt` | ISO string | |
| `title` | string | |
| `category` | string \| null | `null` for the non-expense kinds. |
| `amount` | integer | Your share for an expense; the amount moved for the others. Paise. |
| `cost`, `paidBy` | | Expenses only. |
| `person`, `direction`, `account` | | `person`: the friend. `direction`: `received` or `paid`. `account`: your account it landed in or left from (settlements only). |

Plan rows are bookkeeping and never appear in `entries`.

### PATCH /trips/{id}

Same fields and limits as `POST /trips`, all optional, unknown fields rejected.
`200`, message `Trip updated`, with the stored trip document.

- The end may not precede the start, comparing the sent value against the stored
  other date.
- A person cannot be removed from `members` if they are the payer of, or in the
  shares of, any expense, or are the account on any transaction of the trip:
  `409` `conflict`, `Someone you're removing is already in this trip's expenses`.
- Allowed on a closed trip.

A malformed, missing or another user's trip id is a `404` `not_found`, `That
trip doesn't exist any more`, on every route below; a malformed or foreign
expense id is `That expense doesn't exist any more`. Changes to a closed trip's
expenses or an import are a `409` `conflict`, `This trip is closed. Reopen it to
make changes`.

### DELETE /trips/{id}

Deletes the trip and undoes everything: every transaction on it (expense rows,
settle-ups, let-gos, plan rows) is reverted and removed, then the expenses and
the trip. Balances end as if the trip was never logged. `200`, `data: null`,
message `Trip deleted`. Allowed on a closed trip.

### POST /trips/{id}/expenses

Adds an expense. `201`, message `Expense added`, with the stored `TripExpense`.
Refused with `409` on a closed trip.

| Field | Type | Constraints |
|---|---|---|
| `title` | string | Required, trimmed, 1 to 80 characters. |
| `occurredAt` | date | Required. |
| `category` | string \| null | Optional. Must be one of the caller's `expense` categories, else `400` `invalid_reference`. |
| `cost` | integer | Required. Paise, above 0. |
| `paidBy` | string \| null | **Required key.** `null` means you; otherwise a trip member (`400` `invalid_reference` if not). |
| `paidFrom` | string \| null | Required, non-null, when you paid (`400`, `Pick the account you paid from`): one of your live `bank`, `cash`, `wallet`, or `credit_card` accounts, else `400` `invalid_reference`, `The account you paid from isn't one of your accounts any more. Pick another`. Ignored (stored `null`) when a friend paid. |
| `shares` | `{ account: string \| null, amount: integer }[]` | 1 to 31 entries, adding up to `cost` (`The shares must add up to the amount`), nobody twice. See [Split modes](#split-modes). |

The source is set to `manual`.

### PATCH /trips/{id}/expenses/{expenseId}

Replaces an expense, despite the method: the body is the **full** expense body
above, not a partial one. The old ledger rows are removed and new ones written
in one transaction. `200`, message `Expense updated`, with the stored
`TripExpense`. `404` if the expense is not on this trip; `409` on a closed
trip. `source` and the import fingerprint are unchanged.

### DELETE /trips/{id}/expenses/{expenseId}

Reverts and deletes the expense's rows, then the expense. `200`, `data: null`,
message `Expense deleted`. `404` if not found; `409` on a closed trip.

### POST /trips/{id}/settle

Records money changing hands between you and a friend. It is a `transfer`
between your account and their person account, never spending. `200`,
`data: null`, message `Settle-up saved` (`Settle-up already saved` when a
`clientId` that already landed is sent again).

| Field | Type | Constraints |
|---|---|---|
| `person` | string | Required. Must be on the trip, else `400` `invalid_reference`, `Person isn't one of your people on this trip any more. Pick another`. |
| `account` | string | Required. One of your own accounts (as for `paidFrom`). |
| `amount` | integer | Required. Paise, above 0. |
| `direction` | enum | `received`: they paid you, into `account`. `paid`: you paid them, from `account`. |
| `occurredAt` | date | Optional. Defaults to now. |
| `clientId` | string | Optional, 8–64 characters, not starting `sw:` or `plan:`. Makes a resend land once. |

The row's note is `<Name> paid you back` or `You paid <Name> back`.

**Note**
Allowed on a closed trip, since balances stay open to be settled after closing.
The amount is not capped by the person's balance; overpaying simply flips the
sign of their balance.

### PUT /trips/{id}/plan

Splitwise has a "simplify debts" setting that re-routes who pays whom: Jai's
debt to you can become Phani paying you more. A person's **exact** balance (what
the ledger says between you and them) then differs from what they will actually
pay. The plan is that second set of numbers, typed in by the user. It never
fetches anything from Splitwise.

| Field | Type | Constraints |
|---|---|---|
| `entries` | `{ account: string, amount: integer }[]` | At most 30. `amount` is signed paise: positive means they pay you, negative means you pay them. Anyone **left out** pays 0. |

Validation, each a `400` (`invalid_input` unless noted):

| Rule | Message |
|---|---|
| Every account is a trip member. | `invalid_reference`, `A person in the plan isn't one of your people on this trip any more. Pick another` |
| No account twice. | `Someone is in the plan twice` |
| Amounts are integers. | `Amounts must be whole paise` |
| The amounts sum to the trip's overall balance (the sum of exact balances). | `The amounts must add up to what you're owed overall` |

On success, in one transaction: any earlier plan's rows are removed, then for
each person whose exact balance differs from the plan, one adjustment is
written on their person account (a `positiveAdjustment` when they owe more than
their exact share, a `negativeAdjustment` when less), with the note
`Matched to Splitwise`. The rows are tagged with the trip and keyed by
`clientId` `plan:<tripId>:<person>`. The adjustments net to zero, so the total
never changes. Saving again replaces the plan rather than stacking. The trip
stores `plan = { savedAt, entries, signature }`, where `signature` fingerprints
the expenses' ids, costs, payers, and shares (not settle-ups, which move the
exact and planned balance by the same amount).

`200`, `data: null`, message `Plan saved`. Allowed on a closed trip.

`GET /trips/{id}` reports it as `plan`:

| Field | Meaning |
|---|---|
| `savedAt` | ISO. |
| `stale` | `true` when expenses were added, removed, or changed since it was saved. The rows are not recomputed; the user must save again. |
| `entries` | `{ account, amount }[]`, as saved. |

**Note**
Plan rows count in `members[].balance`, `totals.balance`, and the list's
`openBalances`, but are excluded from `members[].exact` and from `entries`. They
are adjustments, so they stay out of Activity and spending totals.

### DELETE /trips/{id}/plan

Removes the plan's rows and unsets `plan`, leaving balances as the exact ledger
has them. `200`, `data: null`, message `Plan cleared`. Not an error
if there was no plan. Allowed on a closed trip.

### POST /trips/{id}/close

Closes the trip. `200`, `data: null`, message `Trip closed`. `409` `conflict`,
`This trip is already closed`, if already closed. A `letGo` id that isn't on
the trip is `400` `invalid_reference`, issue path `letGo.<n>`.

| Field | Type | Constraints |
|---|---|---|
| `letGo` | string[] | Optional, default `[]`, at most 30 person ids. People whose leftover balance is **let go** instead of kept. |

For each id in `letGo`, using that person's trip balance (plan rows included):

| Their balance | Row written |
|---|---|
| Positive: they owed you | An `expense` of that amount **charged to their person account**, title `Let go: <name>`, no category. It becomes part of your share, as if you had paid it. |
| Negative: you owed them | A `positiveAdjustment` on their account, note `Let go: <name>`. The app has no negative spending, so your share is unchanged. |
| 0 | Nothing. |

Balances not in `letGo` stay open on the person accounts, to be settled later.
Let-gos appear in `entries` as `letGo`. After closing, adding, editing, and
deleting expenses, and importing, are refused; settle, plan, edit, and delete of
the trip are still allowed.

### POST /trips/{id}/reopen

Sets `status` back to `active` and clears `closedAt`. `200`, `data: null`,
message `Trip reopened`.

**Known issue**
Reopening does **not** undo let-gos, and it is not an error on a trip that is
already active. A reopened trip keeps the `Let go:` rows written at close, and
closing it again with the same people writes only whatever balance remains.

### Splitwise import

Imports a Splitwise **group** CSV export into an existing active trip. It is two
calls, and nothing is saved by the first.

The file is one row per expense and one column per person:

```
Date,Description,Category,Cost,Currency,<Person A>,<Person B>,...
2025-12-07,Munnar Stay,General,11877.00,INR,9501.60,-2375.40,...
2026-09-27,Total balance, , ,INR,1952.00,3642.40,...
```

Each person's cell is the row's effect on their balance: positive means they paid
more than their share, negative means they owe their share. A `Payment` category
row is a settle-up. The `Total balance` row is read as a check and not imported.

Limits and format rules:

| Rule | Detail |
|---|---|
| Size | `csv` is a non-empty string of at most 2,000,000 characters. |
| Header | Must start with `Date, Description, Category, Cost, Currency` (case-insensitive, in that order) and then at least two people, else `400` `invalid_input`, issue path `csv`: `This doesn't look like a Splitwise export. It should start with Date, Description, Category, Cost, Currency` or `No people found in the file`. |
| Rows | Every row needs a `YYYY-MM-DD` date and a cost above 0, else `400`, `Line N couldn't be read`. One bad row fails the whole file. |
| Amounts | Rupees with up to two decimals, rounded to paise. The `Currency` column is read but **not checked**: everything is treated as INR. |
| Trip | Must exist and be open: `409` `conflict`, `This trip is closed. Reopen it to make changes`. |

#### POST /trips/{id}/import/preview

Message `Import previewed`. Nothing is written by either form.

| Field | Type | Constraints |
|---|---|---|
| `csv` | string | Required. |
| `mapping` | object | Optional. File name (at most 80 characters) to `"me"`, `"new"`, or a person account id; anything else is `400` `invalid_reference`, `A person in the file isn't one of your people any more. Pick another`. |

**Without `mapping`**, it returns the names in file order and a guess:

```json
{ "needsMapping": true, "people": ["Sagnik", "Jai"], "suggested": { "Sagnik": "me", "Jai": "<accountId>" } }
```

`suggested` matches you by your profile name and friends by their live person
account names: first by the whole name, ignoring case, spaces and punctuation,
then by the first word alone (`Ravi` finds `Ravi Kumar`, `Test R.` finds `Test
Runner`). No match, or only an archived person, is `"new"`.

**With `mapping`**, one name must map to `"me"` (else `400` `invalid_input`, issue path `mapping`, `Pick which name is you`). It returns:

| Field | Type | Meaning |
|---|---|---|
| `needsMapping` | `false` | |
| `rows` | ReviewRow[] | One per file row. |
| `myShare` | integer | Your share across rows not already imported. Paise. |
| `balance` | integer | Your net balance from every row's effect on you, ignoring rows you are not in and payments between others. Paise. |
| `fileBalance` | integer \| null | Your figure on the file's `Total balance` line, or `null` if there is none. |
| `matchesFile` | boolean | `true` when `fileBalance` is `null`, or `balance` is within 100 paise of it. A `false` means the file did not read as expected. |

**`rows[]`** (`ReviewRow`)

| Field | Type | Meaning |
|---|---|---|
| `key` | string | The row's fingerprint, `date|lowercased description|cost|lowercased category`. What a commit decision refers to. |
| `line` | integer | 1-based line in the file. |
| `date` | string | `YYYY-MM-DD`. |
| `title` | string | The description. For a settlement, rewritten in your names (`Priya paid you`, `You paid Priya`). |
| `splitwiseCategory` | string | |
| `cost` | integer | Paise. |
| `status` | enum | See below. |
| `myShare` | integer | Your share, paise. `0` for rows that are not spending. |
| `payer` | string \| null | `"me"`, a person account id or `"new"` from your mapping, or the raw name if unmapped. |
| `suggestedCategory` | string \| null | One of your expense category ids: from how you titled the same thing in your recent 400 categorised expenses, else from a keyword hint (stay, food, transport, activities, shopping). |
| `matches` | `{ id, title, cost }[]` | `matchesYours` only. |
| `direction`, `counterparty` | | `settlement` only. `counterparty` is the mapped account or `null`. |
| `reason` | string | `skipped` only. |

**`status`** (what the row means for you; checked in this order):

| Status | Meaning | Decision needs |
|---|---|---|
| `alreadyIn` | Imported before (its key is on an earlier expense, or on a settle-up's `clientId`). | Nothing; skip it. |
| `skipped` | One of: `You're not in this one`, `A payment between others`, or `More than one person paid — add it by hand`. See `reason`. | Nothing. |
| `isThisYours` | Moves nobody's balance (someone's own expense logged in the group). Off unless you say it is yours. | `account` to import it as your own expense. |
| `settlement` | Someone paid you back, or you paid them. | `account`: where it landed or left. |
| `matchesYours` | You paid, and it lines up (within 100 paise) with a **single** unsplit manual entry of yours, or with all your remaining unsplit entries when there are several and they add up to it. Each entry matches one row at most, in file order. An entry already split with someone never matches. | `action: "apply"` to give those entries this row's split, or `"import"` to add it new (also needs `account`). |
| `pickAccount` | You paid and nothing of yours matches. | `account` you paid from. |
| `lump` | A friend paid and the description is vague (`expense`, `misc`, `other`, `stuff`, `everything`, `group`) with no category guess. | Optionally `parts` to break it down. |
| `ready` | A friend paid. Your share becomes spending, charged to them. | Nothing beyond `import`. |

#### POST /trips/{id}/import/commit

Applies only what you approved: a row with no decision is **not** imported.

| Field | Type | Constraints |
|---|---|---|
| `csv` | string | The same file. It is parsed again. |
| `mapping` | object | **Required.** As for the preview. |
| `decisions` | Decision[] | At most 1000. |

**`decisions[]`**

| Field | Type | Constraints |
|---|---|---|
| `key` | string | At most 300. A row's `key`. An unknown key is ignored. |
| `action` | enum | `import` \| `skip` \| `apply`. On a you-paid row, `apply` gives the row's split to whichever of your entries match it **at commit time** (the same rule as the preview, among entries not yet imported); if none match, the row is not imported. On any other row it behaves as `import`. |
| `title` | string | Optional, at most 80, trimmed. |
| `category` | string \| null | Optional. |
| `account` | string \| null | Where you paid from (`pickAccount`, `isThisYours`, `matchesYours` imported as new) or where a settlement went. A row that needs one and has none is silently skipped. |
| `parts` | `{ title, category, cost }[]` | Optional, at most 20. Breaks a row into several expenses. Each part's cost is split in the row's own proportions. |

What commit does, in order:

1. Names mapped to `"new"` become new person accounts, and everyone mapped
   (other than you) joins the trip's `members`.
2. Each decision is applied by kind:
   - settlement: a settle-up, with `clientId` `sw:<tripId>:<key>`
   - friend paid: an expense `paidBy` that friend, `source: "splitwise"`, `importKey` the row key
   - you paid, imported: an expense paid from `account`
   - `isThisYours`: an expense of yours, paid from `account`, all yours
   - `apply`: the matched manual entries are rewritten with this row's split in proportion to the file's shares, and keep their own title, category, and amount; the key is stored on them
3. Each expense's occurred time is `<date>T12:00:00Z` (noon UTC).

Each share is the row's file share for that person, scaled to the piece's cost,
to the paisa (the last person takes the remainder).

Response, `200`, message `Import saved`:

| Field | Type | Meaning |
|---|---|---|
| `added` | integer | Expenses created (each `part` counts). |
| `applied` | integer | Manual entries rewritten by `apply`. |
| `settled` | integer | Settle-ups written. |
| `matchSplitwise` | boolean | `true` when some person's exact balance differs from their line on the file's `Total balance` by more than 100 paise, meaning Splitwise's simplification may have re-routed things and the user should be offered [PUT /trips/{id}/plan](#put-tripsidplan). `false` when they all agree, or when the file has no totals line. |

**Idempotency.** Expenses carry the row key as `importKey`, and settle-ups carry
it in their `clientId`. The **preview** marks any row seen before as `alreadyIn`,
so importing the same file again offers only new rows. The commit skips them
too: a decision whose key is already on this trip is left out, and a commit whose
chosen rows are all in already writes nothing and answers `200` with zeros.

The whole commit is one MongoDB transaction: new people, members, expenses,
applied splits and settle-ups land together or not at all, and every ownership
check runs before anything is written. New expenses, their rows and the balance
changes are written in bulk (one insert of expenses, one of rows, one balance
update per account), so a 975 + 25 row file commits in about 2 seconds.

## Backup

| Method | Path | Description |
|---|---|---|
| `GET` | `/backup` | Exports everything the user entered, as one JSON document. |
| `POST` | `/backup/restore` | **Replaces** the caller's data with a backup. Rate-limited. |

### GET /backup

Takes no parameters. Not rate-limited. `data` is the backup document (it has no
type in `packages/types`).

| Field | Type | Description |
|---|---|---|
| `version` | `1` | Format version. |
| `exportedAt` | string | ISO instant. |
| `preferences` | object | `{ currency, timeZone, notifications, defaultAccount }` — `defaultAccount` is `null` when unset. |
| `accounts`, `categories`, `transactions`, `budgets`, `bills`, `goals`, `trips`, `tripExpenses` | array | Every document of that kind owned by the caller, as stored (`.lean()`): `_id`, `userId`, timestamps and `__v` included. Archived accounts and categories are included. |
| `goalContributionLogs` | array | From 2.8.0. Every contribution to the caller's goals (`_id`, `goalId`, `amount`, `createdAt`), as stored. |

Excluded on purpose: the profile and credentials (`name`, `email`, `password`,
reset and TOTP fields, `googleId`), `pushToken`, notifications, highlight
history, recurring dismissals and request logs. The
derived ones regenerate after a restore; restoring a stale copy would not be
real data.

**Note**
Account `balance` values are exported and restored as stored. A restore does not
replay transactions through `applyEffects`, so the balance invariant holds only
because the backup was taken while it held. See
[The account balance invariant](architecture.md#the-account-balance-invariant).

### POST /backup/restore

Rate limit: **5 requests per IP per hour** (`restoreLimiter`). It runs after
`protect`, so requests without a valid session don't spend the budget.
The 429 is `rate_limited` with `Retry-After` and the message `Too many restores.
Try again in an hour`, and it sends the standard `RateLimit-*` headers. The request body limit is 25 MB for the whole API
(`express.json`), which is what lets a lifetime of transactions fit in one body.

| Field | Type | Constraints |
|---|---|---|
| `confirm` | `true` | Required, literal `true`. The server half of the destructive-action guard, alongside the app's hold-to-confirm. |
| `version` | `1` | Required. |
| `exportedAt` | string | Required. ISO datetime. |
| `preferences` | object | Required: `currency` (string), `timeZone` (string), `notifications` (object), optional `defaultAccount` (24-hex ID or `null`). Extra keys are kept. |
| `accounts`, `categories`, `transactions`, `budgets`, `bills`, `goals` | array | Required. Each element is a loose object that must carry a 24-hex `_id`. |
| `trips`, `tripExpenses` | array | Optional, so a backup from before trips still restores. |
| `goalContributionLogs` | array | Optional. Present: it replaces the caller's logs. Absent (any backup made before 2.8.0): the caller's logs are left as they are. |

Validation is deliberately loose per document; the Mongoose model schemas are
the real validator once `insertMany` runs.

What it does, inside one MongoDB transaction (any failure rolls back to the
pre-restore state):

1. Deletes every account, category, transaction, budget, bill, goal, trip and
   trip expense owned by the caller, and their goal contribution logs when the
   file carries `goalContributionLogs`. It never merges.
2. Inserts the backup's documents with their original `_id`s, so cross
   references (`Transaction.account`, `Budget.category`, …) need no remapping,
   and with `userId` rewritten to the caller's. This is what makes restoring an
   old backup into a different account after a reinstall safe. `createdAt` and
   `updatedAt` are preserved, which matters for goal pace.
3. Overwrites `currency`, `prefs.timeZone`, `prefs.notifications` and
   `prefs.defaultAccount` on the user. Nothing else on the user changes.

Returns `200` (`Backup restored`) with `{ counts, user }`:

| Field | Type | Description |
|---|---|---|
| `counts` | object | Documents inserted per kind: `accounts`, `categories`, `transactions`, `budgets`, `bills`, `goals`, `trips`, `tripExpenses`, and `goalContributionLogs` when the file has it. |
| `user` | object | The user document, read fresh after commit. The app swaps it into its session, because `appZone()` reads `prefs.timeZone` from it. Stripped like every user reply (see [POST /auth/register](#post-authregister)), `pushToken` included. |

**Warning**
This wipes the caller's data. A failure after the 400-level checks rolls back,
but a successful restore cannot be undone by the API. Notifications and
highlight history are **not** wiped, nor are goal contribution logs when an
older file has none, so they can reference documents the backup no longer
contains.

**Warning**
A body that fails validation, including a missing `confirm`, is a `400`
`invalid_input` (`That doesn't look like a Save n Spend backup file`). Validation runs before the
transaction opens, so nothing is deleted. UNVERIFIED: restoring a backup whose
`_id`s already belong to **another** account's documents would presumably fail
on a duplicate key (`409`, rolled back); this was inferred, not read.

## Diagnostics

Crash reports from the phone, and the caller's own recent request log. Both
write to or read from `RequestLog`, which keeps rows for 7 days and never stores
request bodies, query strings or responses; amounts like `₹12,000` in messages
are masked to `₹…`.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/diagnostics/client-errors` | None (token optional) | Reports an error the app hit. |
| `GET` | `/diagnostics/requests` | Bearer token | The caller's last 50 log rows. |

### POST /diagnostics/client-errors

Open without a token, because a crash can happen on the login screen. It is
therefore capped **per IP: 30 requests per hour**, so a crash loop on one phone
cannot flood the log. Over the cap: `429` `rate_limited`, `Too many reports`,
with `Retry-After` and `RateLimit-*` headers.

If an `Authorization: Bearer` header is present and valid, the report is
attributed to that user. An invalid or expired token is ignored rather than
rejected.

| Field | Type | Constraints |
|---|---|---|
| `message` | string | Required. 1–500 characters. |
| `stack` | string | Optional. Up to 4000 characters. |
| `screen` | string | Optional. Up to 120 characters, e.g. `/investment-detail`. Stored as the log's `route`; `unknown screen` when absent. |
| `requestId` | string | Optional. Up to 12 characters. Used only if it is exactly six characters from the reference alphabet (no `0`, `1`, `I`, `L`, `O`); otherwise the server's own ID for this request is used. |
| `appVersion` | string | Optional. Up to 20 characters. Falls back to the `X-App-Version` header. |

The body is `.strict()`. Returns `200` with `{ requestId }` and message
`Report received`. The entry is written as `source: "app"`, to stdout as one JSON line
and to `RequestLog` once the database is connected. The message is capped at 300
characters and the stack at 6 lines and 1200 characters.

### GET /diagnostics/requests

Takes no parameters and has no extra rate limit. Returns the **caller's own**
last 50 rows, newest first; nobody else's, whatever the caller sends. `data` is
an array of:

| Field | Type | Description |
|---|---|---|
| `requestId` | string \| null | The reference the user saw, e.g. `7K2QXB`. |
| `source` | enum | `api` (one per request), `app` (a client error report) or `job` (a notification the server tried to raise). |
| `route` | string | `GET /api/v1/bills/:id` for `api` (route pattern, 24-hex IDs replaced by `:id`); the screen for `app`; e.g. `notify:dailySummary` for `job`. |
| `status` | integer \| null | HTTP status for `api` rows. |
| `durationMs` | integer \| null | |
| `message` | string \| null | Error message for failed requests; the outcome for jobs. |
| `stack` | string \| null | A few lines, for a 500 or an app error. |
| `appVersion` | string \| null | From `X-App-Version`. |
| `createdAt` | string | ISO instant. |

`_id` and `userId` are not returned.

## Liveness

### GET /health

Returns `{ "ok": true, "db": "connected" }`, or `"db": "connecting"` while the
database handshake is still in progress. This is the only endpoint outside
`/api/v1`, the only one with no envelope, and one of the only unauthenticated
ones — it exists for the host's health check and the uptime pinger.

It answers `200` as soon as the port is bound, **whether or not the database is
up**. That is deliberate: both consumers need a 2xx to make progress, and a 503
during the Atlas handshake would register as a failed ping and hold the app
behind its splash for a database it is not about to query. `db` is there so the
real state is still legible. It is not written to the request log, but the
`X-Request-Id` response header is still set.

The mobile app also uses it as its wake-up probe: the free Render tier suspends
an idle instance, so the app polls this endpoint at launch and shows a waking
screen until it answers. See [Cold-start gate](architecture.md#cold-start-gate).
Not to be confused with [GET /dashboard/health](#get-dashboardhealth), which is
the user's financial health score.

### Other unauthenticated routes

Every route under `/api/v1` requires a bearer token except these three. With
`GET /health` they are the allowlist in `apps/api/test/http/route-matrix.test.ts`,
which fails if any other mounted route answers without a token:

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Rate-limited, see [Auth](#auth). |
| `POST` | `/api/v1/auth/login` | Rate-limited, see [Auth](#auth). |
| `POST` | `/api/v1/diagnostics/client-errors` | Rate-limited per IP, see [Diagnostics](#diagnostics). |

An unknown path or method anywhere returns the standard error envelope with
`404` `route_not_found`, `This part of the app needs an update`.

## Known issues

These are verified against the code and have **not** been fixed. They are listed so a client does not build on behaviour that is about to change. Each group comes from the section it was found in.

### Accounts, categories, transactions and auth

1. **Fixed: validation errors from `zod/v4` schemas returned 500.** The error handler now recognises zod v3 and v4 by name; bad input on these routes is a `400` `invalid_input`.
2. **`POST /auth/register` returns the user, not a token**, and `DELETE /users/me` returns `200` with a body, not `204`. The old reference said otherwise on both. `response.noContent` sends `200`.
3. **Registration accepts a bad `timeZone` as a 400**, not a fallback to the server default as the old reference stated. Only an omitted `timeZone` falls back.
4. **Reorder endpoints do not enforce completeness.** Both reorder controllers' comments say the request must carry the whole list or set; the code checks only that each ID is live and owned, and not duplicated. Category reorder does not check that the IDs share a parent and kind.
5. **Fixed in 2.8.0: `POST /transactions` checks `category`** (owner and `kind`) and that every `owedBy[].account` is a `person` account.
6. **Fixed in 2.8.0: `PATCH /transactions/{id}` checks the edited row against its type's create rules**: no `toAccount` on an expense, no `category` or `title` on a transfer, `account` ≠ `toAccount`. `occurredAt` must be a readable date on both create and patch.
7. **`authLimiter` is one shared counter** across register, login and change-password (10 per IP per 15 min), so a few failed logins exhaust the allowance for changing a password from the same IP.
8. **Fixed in 2.8.0: a closed account's token is refused everywhere.** `protect` reads the user on every request; a closed account is `401` on every signed-in route, not only `GET /auth/me`.
9. **Archiving an account does not clear `prefs.defaultAccount`** in `archiveAccount`. The mobile app clears it with a separate `PATCH /users/me`.
10. **Fixed in 2.8.0: `POST /accounts` refuses `investmentKind`, `currentValue`, `investedSince` and `investedHow` on any other `type`** (`400`, `… is only for investments`).
11. **Bulk convert skips ineligible IDs silently** and returns only a count, so a caller cannot tell which IDs were skipped.
12. **`GET /transactions` cannot return adjustments.** `type` allows only `expense`, `income` and `transfer`, yet the old reference said to pass `type` to see them, and the controller comment says exports still carry them. The mobile export omits them too, so a CSV or PDF ledger does not add up to account balances after a sync.
13. **`PATCH /categories/reorder` names no field on a foreign or missing id.** It is the one `invalid_reference` answer without `issues` (`Some of those categories no longer exist`); accounts' reorder carries the path.

### Planning, insights and operations

Verified in code; none of these were changed.

**1. Fixed: `zod/v4` schemas turned bad input into a 500.** Both zod versions are now recognised by name in `middleware/errorHandler.ts`; `GET /dashboard/summary`, `GET /notifications` and `POST /backup/restore` answer `400` `invalid_input`.

**2. Trip rows are included or excluded inconsistently.** Excluded
(`tripId: null`): budget `spent` (`services/budgetService.ts:50`); insights
`byCategory`, with a separate `Trips` slice (`controllers/insightsController.ts:258`,
`:262`); the category detail's `total` (`:100`-`:102`) and its trend (`:534`);
review `biggestExpense` (`services/reviewService.ts:109`); recurring detection
and typical daily spend (`services/recurringService.ts:23`, `:111`). Included:

| Where | File:line |
|---|---|
| Dashboard `expenses`, `income`, `savings` | `controllers/dashboardController.ts:40` |
| Dashboard week totals | `controllers/dashboardController.ts:56` |
| Dashboard `biggestExpense` | `controllers/dashboardController.ts:65` |
| Dashboard `sinceLastOpened` | `controllers/dashboardController.ts:72` |
| Dashboard insights (`noSpendDays`, heatmap, pace) | `controllers/dashboardController.ts:158`, `:162`, `:227` |
| Insights `trend` and `previousTrend` (overall) | `controllers/insightsController.ts:42`, `:45`, `:531` |
| Insights `byAccount`, `avgDailySpend*`, `incomeVsExpense`, `txnCount` | `controllers/insightsController.ts:354`, `:411`, `:473`, `:56` |
| Category detail `shareOfSpend` denominator | `controllers/insightsController.ts:135` |
| Review `income`, `expenses`, `saved` | `services/reviewService.ts:23` |
| Health score income and expenses | `services/healthService.ts:402` |

Visible effects: the insights `trend` sums to more than the `byCategory` totals
when a trip exists; `shareOfSpend` shares do not add to 100; the health score's
budgets pillar excludes trips while its savings pillar does not. The budget
comment calls the inclusion in totals intentional.

2.8.4 (D21) keeps every included figure as it was and adds the trip part beside
the ones the app shows as "spent" (`tripExpenses`, `weekTripExpense`,
`flowTrend[].tripExpense`, `incomeVsExpense[].tripExpense`, the review's
`tripExpenses` and `previousTripExpenses`), plus shares of everyday spending
(`share`, `uncategorised`, `shareOfEverydaySpend`). The review timeline's
biggest expense now leaves trips out, so it and `biggestExpense` name the same
row. The second 2.8.4 pass covers the rest: `biggestEverydayExpense`,
`sinceLastOpened.tripSpent`, the dashboard insights' `everyday` block,
`trend[].tripAmount`, `avgDailyEverydaySpend*`; the review's heaviest or
lightest week, the Health buffer and the `catch_all_heavy` highlight now use
everyday spending outright (server-composed text and scores). `byAccount` keeps
trips on purpose: a trip share is money that left that account.

**3. Adjustment rows.** `positiveAdjustment` and `negativeAdjustment` are
excluded from every income, expense and spend figure here (they match
`type: "expense"` or `{ $in: ["income", "expense"] }`), and from streaks and
`activeDays` by `type: { $nin: [...] }` (`services/highlightSnapshotService.ts:63`,
`services/reviewService.ts:42`, `:56`). They do move `netWorth` and the
reconstructed `netWorthTrend` (`services/netWorthHistoryService.ts:63`). Transfers
are the odd one: they count as a logged day for the streak and `activeDays`, but
not for the dashboard's `noSpendDays`, so the two no-spend definitions differ
(`controllers/dashboardController.ts:194` against `services/reviewMath.ts:8`).

**4. Fixed in 2.8.0: `GET /bills` filters on the status it shows.**
`?status=paid` includes a recurring bill paid this period, and `?status=overdue`
works. One-off bills still leave the list after the period they were paid in.

**5. Bill catch-up.** `isFuturePeriod` is the only guard on pay and skip
(`controllers/billController.ts`), so a bill several periods behind
advances one step per call, and the list reads `paid` while the due date is
still in the past.

**6. Paying a bill raises no budget alert.** `markBillPaid` writes an expense
through `applyEffects` but never calls `checkBudgetAlerts` (only `POST` and
`PATCH /transactions` do). The charged account's `type` is not validated; a
bill's own `account` is, on create and update.

**7. `flowTrend` label mismatch.** `controllers/dashboardController.ts:93`
appends the current month under the `YYYY-MM` key while
`services/netWorthHistoryService.ts:21` labels the rest `Mon YYYY`. With a
past `month`, the appended point is that month's but the history still ends now.

**8. `GET /highlights` writes.** `controllers/highlightController.ts:89` and
`:104` upsert `HighlightLog` on every call, while the header comment and
`docs/insights-engine.md` describe the engine as read-only by construction.

**9. Budget creation is permissive.** `controllers/budgetController.ts:25` only
checks the category exists and is not archived; an income category, or a child
of a category that already has a budget, is accepted.

**10. Fixed: goal `deadline: null` on create** is kept as `null`
(`schemas/goalSchema.ts` uses `.nullable()` on create and update).

**11. Restore leaves some collections alone.** `Notification`, `HighlightLog`,
`RecurringDismissal`, and `GoalContributionLog` when the file has none, are not
touched. (Fixed: the limiter now runs after `protect`, and its message says "in
an hour".)

**12. Stale statements in the previous reference.** `/health` returned only
`{ ok: true }` (it now includes `db`); the budget month window was said to be UTC
(it is zone-local); `GET /insights` omitted `period=day`; `/reviews`,
`/highlights`, `/recurring`, `/cash-flow`, `/backup` and `/diagnostics` were not
documented; two notification types were missing; the health pillar list claimed
inapplicable pillars are returned with `score: null`.

### Investments and trips

These are real behaviours found while documenting, not changes made.

1. **Fixed in 2.8.0: import commit idempotency.** Commit skips rows already on
   the trip and runs as one transaction (see the commit section).
2. **Fixed in 2.8.0: import commit trusted mapped account ids.** Every mapped id
   must be one of the caller's live person accounts (`400` `invalid_reference`
   otherwise), checked before anything is written.
3. **Identical file rows collapse.** Two rows with the same date, description,
   cost, and category share one `key`. Commit keeps one of them (the key map is
   built from rows), and preview treats both as imported once one is.
4. **Fixed in 2.8.0: repeated commits with `"new"` created duplicate people.**
   A commit whose chosen rows are all imported already writes nothing, people
   included.
5. **Fixed in 2.8.0: `GET /investments/{id}/history` checks the account.** A
   malformed, missing, foreign or non-holding id is `404`; an archived holding
   still answers. It silently caps at 200 rows.
6. **`DELETE /investments/{id}` ignores `isArchived`; `PATCH .../basis` requires it
   be false.** An archived holding can be deleted but not re-based.
7. **`lastUpdatedAt` counts any adjustment**, including a plain balance
   reconciliation, not only deliberate value updates. The history treats them
   all as value updates too.
8. **Stale comment in `investmentService.ts`.** It says `gain = Σ of its
   adjustments`. Gain is `current − invested` and also contains the opening gain
   (the value typed at creation minus the cost), which is not an adjustment.
   `packages/types` repeats the same wording on `InvestmentsPayload`.
9. **`GET /trips` groups `byYear` by UTC year** of `startDate` (`getUTCFullYear`),
   not the user's zone, unlike the rest of the API. A trip starting at 1am on 1
   January in India lands in the previous year. The `ITrip` comment says dates
   are "zone-local day starts", but nothing on the server normalises them.
10. **Reopen does not undo let-gos**, and reopening an already active trip is a
    silent no-op `200`.
11. **`PATCH /trips/{id}` and `DELETE /trips/{id}` are allowed on a closed trip**,
    though expenses and import are not. Settle and plan are also allowed, which
    appears intentional (documented in code).
12. **Fixed: trip create and update drop `userId` and `__v`** like every reply
    (`utils/dto.ts`). They still return the stored document (with `updatedAt`,
    and `plan` on `PATCH`), while list and detail return the `ITrip` DTO.
13. **A row with a non-positive cost fails the whole Splitwise file** with
    `Line N couldn't be read`, since the parser rejects any `cost` of 0 or less.
14. **`settleUp` loads the person with `Account.findById(body.person)`**, with no
    `userId` filter. It is reached only after the member check, so it is not
    exploitable today, but it relies on that earlier check.
15. **Trip expense categories are not checked for `isArchived`**, only for
    `kind: "expense"` and ownership.
16. **Ledger `added` row ordering.** A transfer dated before the holding's
    `createdAt` sorts before the `added` row, so the `added` entry's `valueAfter`
    includes it rather than being the value originally typed.
