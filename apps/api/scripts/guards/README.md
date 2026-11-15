# Guards

Scripts that prove an API change broke nothing. Run them from `apps/api`. Each one that needs an
API starts its own (`DISABLE_REMINDERS=true`, a free loopback port, from this tree or
`--api-dir <checkout>/apps/api`), checks the startup log says `save-n-spend-dev` before sending
anything, and stops it when done. One API at a time; never point them at prod. Results go to
`.audit/guards/` in the repo root. They are the release-time checks; the HTTP, race and
idempotency tests run in `npm test` against an in-memory database (`docs/testing.md`).

| Guard | Command | What it proves | Exit 1 when |
|---|---|---|---|
| Old-app contract | `npm run guard:contract -- --label after-w1` | Every request the 2.6.0 app (01efb7c, on the phones) and the current tree send, replayed as a new `w0-contract-…@example.test` user, still succeeds with the same meaning (status, fields the app reads, balances moved). Also writes `contract/inventory.md`, the full list of requests. | any request changed meaning |
| Golden responses | `npm run guard:golden -- record --email sagnik.rik.das@gmail.com --out ../../.audit/guards/after-w1 --queries-from ../../.audit/guards/baseline` then `npm run guard:golden -- compare ../../.audit/guards/baseline ../../.audit/guards/after-w1` | Every GET the app makes returns the same values. Allowed: internal fields removed (`__v`, `userId`, `pushToken`, `googleId`, `totpEnabled`, `authProvider`, `deactivatedAt`), envelope `message` wording; ignored: `diagnostics/requests`, backup `exportedAt`, report `asOf`, `annualReturn` within 1e-4, title-suggestion order. | a difference not allowed |
| Invariants | `npm run check:invariants -- --json ../../.audit/guards/invariants/dev.json` (`--user <email>` for one user) | I1–I7, I14, I15 from the idempotency audit, read-only (`find`/`countDocuments`). Prod only with `--db save-n-spend-prod --prod-readonly` and Sagnik's go-ahead. | a user not on the ignore list has problems |
| Replay and race | `npm run guard:replay -- --label after-w1` (`--only T4,D1`) | The audit's T1–T20 and D1–D2, sent twice and in parallel as a new `w0-replay-…@example.test` user; balances checked read-only in the dev DB. Each test names the release meant to fix it (R1, R2) or `safe`. | a `safe` test regressed |

`npx tsc --noEmit -p apps/api/scripts` typechecks these scripts (they sit outside `src/`, so the
API's build never includes them).

## Notes

- The golden recorder signs a 15-minute token for the given user with the dev `.env` secret
  (same payload as `generateAccessToken`), keeps it in memory, and only sends GETs to the
  loopback API it started. For `sagnik.rik.das@gmail.com` it skips `GET /highlights`, which saves
  new highlights to the user's history. Every request still adds the API's own `RequestLog` row.
- Throwaway users stay on dev (there is no API to erase a user). The invariant check lists
  `idem-audit@example.test` (corrupted on purpose by the audit) but never counts it.
- Baselines from the clean 207518b API: `contract/before.json`, `replay/baseline.json`,
  `baseline/responses.json`.
