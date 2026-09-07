# Save n Spend Developer Guide

Save n Spend is a personal finance tracker for Indian rupees. You record
transactions against accounts, cap spending with per-category monthly budgets,
track recurring bills, and save toward goals. The product ships as an iOS app
backed by a REST API.

This guide is for developers who build, extend, or operate Save n Spend. It
assumes you are comfortable with TypeScript, React Native, and Express.

## Documentation map

| Document | Read it when you want to |
|---|---|
| [Architecture](architecture.md) | Understand how the repository, the API, and the app fit together, and which invariants you must not break. |
| [API reference](api-reference.md) | Call an endpoint: its path, request body, query parameters, and response shape. |
| [Design system](design-system.md) | Style a screen with the correct tokens, or add a component that matches the rest of the app. |
| [Mobile patterns](mobile-patterns.md) | Add a screen, a bottom sheet, or a period selector, and follow the conventions the existing screens already use. |
| [Insights engine](insights-engine.md) | Highlights — the rule set, the ranking, the cold-start gate, and why there is no LLM. |
| [Shortcuts and Back Tap](native-shortcuts.md) | Reach the app from outside it — Back Tap, the Action Button, Siri — and why widgets are out. |
| [Shipping](SHIPPING.md) | Build an `.ipa` and get it onto a physical iPhone. |

## Prerequisites

Before you start, install the following.

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 24.20.0 | Pinned in `mise.toml`. Run `mise install` if you use mise. |
| npm | 10 or later | Ships with Node 24. The repository uses npm workspaces. |
| MongoDB Atlas cluster | — | Replica set required. The API uses multi-document transactions. |
| Xcode | 16 or later | iOS builds only. See [Shipping](SHIPPING.md). |

## Set up a development environment

**To run Save n Spend locally**

1. Install dependencies from the repository root. npm workspaces links
   `packages/types` into both applications for you.

   ```bash
   npm install
   ```

2. Create `apps/api/.env` with your own values.

   ```
   PORT=7019
   DB_USERNAME=<atlas cluster user>
   DB_PASSWORD=<atlas cluster password>
   JWT_SECRET=<a long random string>
   SALT_ROUNDS=10
   NODE_ENV="development"
   DISABLE_REMINDERS=true
   ```

   **Important**
   `apps/api/.env` holds real credentials and is excluded from version
   control. Never commit it. `NODE_ENV` is what picks the database —
   `production` resolves to `save-n-spend-prod` and anything else to
   `save-n-spend-dev`, both on the same cluster — so leave it `development`
   locally. See
   [Configuration reference](architecture.md#configuration-reference).

   `DISABLE_REMINDERS=true` keeps the hourly reminder job from scheduling. Leave
   it on unless you are working on the job itself. The job writes notifications
   and sends push for real, and because it claims a dedupe key when it does, a
   development run that reaches a shared database also stops the deployed
   instance from sending that same reminder. To exercise it, drop the flag and
   call `runReminders(new Date(...))` directly rather than waiting an hour. See
   [Notifications](architecture.md#notifications).

3. Start the API.

   ```bash
   npm run dev:api
   ```

4. Start the mobile app in a second terminal.

   ```bash
   npm run dev:mobile
   ```

5. (Optional) Seed the development database with sample data.

   ```bash
   npm run seed --workspace=apps/api
   ```

   **Warning**
   Seeding **deletes every user, account, category, transaction, budget, bill,
   and goal** in the database it connects to, then rebuilds two test users. It
   refuses to run when `NODE_ENV=production` or when the resolved database name
   contains `prod`. Treat that guard as a backstop, not a substitute for
   confirming which database you are pointed at.

## Verify a change

Run the type checker for each workspace you touched, and the API's tests.

```bash
npx tsc --noEmit --project apps/mobile
npx tsc --noEmit --project apps/api
npm test --workspace=apps/api
```

The suite is `node:test` and `node:assert/strict` — standard library, **zero
dependencies**, which on a free-tier deploy matters more than nicer matchers.
`tsconfig.build.json` keeps test files out of `dist/`, so nothing test-related
ships to Render.

It covers the two pure halves of the highlights engine: `highlightRules.test.ts`
(the sentences, the thresholds, the ranking) and `highlightSnapshotMath.test.ts`
(the calendar window and the category rollup). Both are fixtures in, assertions
out — no database, no network, no clock. See
[Testing](insights-engine.md#testing).

`apps/mobile` has no runner. Anything genuinely testable there should be a pure
module with `import type`-only runtime imports, which `tsc` emits as something
`node --test` can require directly.

A release build hides JavaScript errors behind a bare `EXC_CRASH`/`SIGABRT`
with no message, so reproduce runtime problems in a release configuration
before you build an `.ipa`. See [Troubleshoot a launch
crash](SHIPPING.md) for the procedure.
