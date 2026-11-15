# Testing

Two suites, both `node:test` and `node:assert/strict`. Neither needs Atlas, a running
API or the network once the MongoDB binary has been downloaded.

```bash
cd apps/api && npm test              # API: unit + HTTP tests, coverage by folder at the end
cd apps/api && npm run test:coverage # the same, and exit 1 under the coverage gate
cd apps/mobile && npm test           # app logic (lib/*.test.ts)
npx tsc --noEmit -p apps/api         # src/
npx tsc --noEmit -p apps/api/scripts # everything outside src/: scripts/ and test/
npx tsc --noEmit -p apps/mobile
```

Use Node 24 (the repo's `mise.toml`): the API suite uses `--test-global-setup`, which is new
in Node 24.

## API suite

`npm test` runs every `*.test.ts` under `src/`, `scripts/` and `test/` (globs, so a new file
is picked up without editing `package.json`). Each file runs in its own process.

- **Unit tests** sit beside the module they test (`src/services/paceMath.test.ts`). Fixtures
  in, assertions out; no database.
- **HTTP tests** live in `test/http/`. They send real requests to the Express app, which runs
  in the test's own process on a free `127.0.0.1` port, against a MongoDB on this Mac.

### The database

`test/globalSetup.cjs` starts one in-memory MongoDB **replica set** (one member, so
transactions work) for the whole run, through `mongodb-memory-server-core`. Every test file
gets a database of its own on it, dropped when the file ends. The data lives in a temp
directory and is gone when the run stops.

- The binary is MongoDB **8.0.37**, what Atlas runs. It is downloaded once (about 80 MB) into
  `~/.cache/mongodb-binaries`; every later run is offline. `MONGOMS_VERSION` and
  `MONGOMS_DOWNLOAD_DIR` override both.
- `test/env.ts`, loaded before the app, removes `DB_USERNAME`, `DB_PASSWORD` and `DB_NAME`
  from the environment, so nothing in the process can build a working Atlas address, and the
  harness refuses any database URI that isn't `127.0.0.1`. It also sets `NODE_ENV=test`,
  `DISABLE_REMINDERS=true`, a random `JWT_SECRET`, `SALT_ROUNDS=4`, records pushes in memory
  instead of sending them to Expo, and hides the API's JSON request logs (`TEST_LOGS=1` shows
  them).
- A file run on its own (`node --require ts-node/register --test test/http/x.test.ts`) starts
  its own replica set.

### Writing an HTTP test

```ts
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { useTestApi, type TestUser } from "../harness";

const api = useTestApi();
let me: TestUser;
let bank: string;

before(async () => {
    await api.ready(); // top-level before hooks run in parallel: wait for the app first
    me = await api.user("example");
    bank = await me.account("Bank", { startingBalance: 1_000_000 });
});

test("an expense moves the balance; another user's account is refused", async () => {
    const body = { type: "expense", amount: 5_000, account: bank, category: await me.category("expense"), title: "Lunch", occurredAt: new Date().toISOString() };
    const r = await me.send("POST", "/transactions", body);
    assert.equal(r.status, 201, r.text);
    const [acc] = await api.ro.col("accounts").find<{ balance: number }>({ _id: new ObjectId(bank) });
    assert.equal(acc.balance, 995_000);

    const other = await api.user("other");
    const refused = await other.send("POST", "/transactions", { ...body, category: await other.category("expense") });
    assert.deepEqual([refused.status, refused.json.code], [400, "invalid_reference"]);
});
```

`useTestApi()` gives you:

| Field | What it is |
|---|---|
| `ready()` | Starts the app and database once; await it first in your `before`. |
| `user(tag?)` | A new user (`<tag>-…@example.test`), signed up and signed in over HTTP. Has `id`, `email`, `password`, `token`, `send` (as that user), `category(kind)` (a default top-level category) and `account(name, { type, startingBalance, investmentKind })`. Its own sign-in doesn't count against the sign-in limiter. |
| `send(method, path, body?, { token, headers, contentType, raw })` | A request with no token. `path` is after `/api/v1`. Returns `{ status, json, text, headers, ms }`. |
| `ro.col(name).find(q)` / `.count(q)` | Reads straight from this file's database. |
| `db()` | The raw database, for a state no route can make (say why in the test). |
| `problems()` / `assertInvariants()` | `scripts/invariants/rules.ts` (I1–I7, I14, I15) over every user in the database. **Runs after every test** unless `useTestApi({ invariantsAfterEach: false })`. |
| `child(env)` | The same app in a child process on the same database, for a test that kills the server (the idempotency crash test). |
| `resetLimits()` | Forgets the sign-in and restore rate-limit hits so far. |
| `sentPushes` (export) | Every push the API tried to send in this process. |

Requests carry `Content-Type: application/json` and an `X-Request-Id`, as the app sends them.

### The route matrix

`test/http/route-matrix.test.ts` reads every mounted route from the Express router and checks
each one the same way: signed out is `401` (except the commented `PUBLIC` allowlist),
malformed, missing and another user's ids are `404`, an unknown body field is `400`, and a
route that takes `Idempotency-Key` replays and refuses a reused key with another body (`422`).
**A new route fails it until you add an entry to `SPECS`** in that file: a body it accepts
and, if it takes `Idempotency-Key`, a `keyed` fixture. The routes that take a key are found by
sending one that is malformed, so the list can't drift from the code.

### Coverage

Every `npm test` measures line coverage of `src/` with Node's built-in coverage
(`--experimental-test-coverage`, source-mapped through ts-node), prints Node's per-file table,
then a per-folder summary (`scripts/coverage.ts`, from `coverage/lcov.info`).

The gate is **80% of lines** in `src/services`, `src/controllers` and `src/middleware`.
`npm run test:coverage` fails under it; `npm test` only says which folder is under. Node counts
every line inside a function that ran, comments and type-only lines included, so its numbers
run higher than a statement count would: read the per-file table and the uncovered line
ranges, not only the totals.

## Release-time checks (scripts, not tests)

These stay scripts because they need the dev copy of real data, the 2.6.0 app's requests, or
prod. Run them from `apps/api`; see `scripts/guards/README.md` for the arguments, and the
[release checklist](SHIPPING.md#release-checklist) for when.

| Check | Command | Needs |
|---|---|---|
| Golden responses: every GET the app makes returns the same values | `npm run guard:golden -- record …` then `… compare …` | A local API on the **dev** copy of Sagnik's data |
| Old-app contract: every request the app sends still means the same | `npm run guard:contract -- --label <label>` | A local API on dev; leaves a throwaway user |
| Invariants on real data | `npm run check:invariants` (dev); `-- --db save-n-spend-prod --prod-readonly` | Read-only. Prod only with Sagnik's go-ahead |
| Replay and race on dev | `npm run guard:replay -- --label <label>` | A local API on dev; leaves a throwaway user |

The race tests that used to need dev (`scripts/races/*.race.test.ts`) and the live HTTP
tests (`src/controllers/*.live.test.ts`) are now `test/http/*.test.ts`, part of `npm test`.

## App suite

`npm test` in `apps/mobile` runs `lib/*.test.ts` through the API's `ts-node`. Only pure
modules can be tested this way (runtime imports `import type` only); see
[Mobile patterns](mobile-patterns.md).
