# Build & shipping guide

How this project runs, and how to get new code onto the iPhone.

There is no paid Apple Developer account. The app reaches the phone by
**sideloading**: an unsigned `.ipa` is built on the Mac, then SideStore re-signs
it on-device with a free Apple ID certificate. Everything below follows from
that constraint.

---

## 1. What runs where

| Piece | Where it runs | Notes |
| --- | --- | --- |
| API (`apps/api`) | Render — `https://save-n-spend.onrender.com/api/v1` | Free tier, so the first request after idle takes ~35 s to cold-start. Not a bug. |
| Database | MongoDB Atlas, one cluster, two databases | `save-n-spend-dev` and `save-n-spend-prod`. See §5. |
| Mobile app (`apps/mobile`) | iPhone, sideloaded via SideStore | Also runs in the iOS Simulator and Expo Go. |
| Shared types (`packages/types`) | Compile-time only | npm workspace, `@save-n-spend/types`. |

Node is pinned to **24.20.0** via [`mise.toml`](../mise.toml). Expo 54's Metro
needs Node 20+ for `Array.prototype.toReversed`. A plain shell may resolve an
older Node and fail with `configs.toReversed is not a function` — prefix with
`mise exec node@24.20.0 --` if that happens.

---

## 2. Day-to-day feature loop

Don't rebuild the `.ipa` to test a change. Iterate on the simulator, where the
turnaround is seconds:

```bash
# terminal 1 — API against the dev database
cd apps/api && npm run dev            # :7019, NODE_ENV=development -> save-n-spend-dev

# terminal 2 — app
cd apps/mobile && npm start           # then press `i` for the simulator
```

With no `.env.development` present, [`lib/api.ts`](../apps/mobile/lib/api.ts)
derives the API host from Metro's `hostUri` and hits `:7019`. That's deliberate —
it means dev automatically talks to your local API, and only Release builds go to
Render.

Seed data (`npm run seed` in `apps/api`) gives you:

- `sagnik@email.com` / `sagnik123` — ~1 year of activity
- `bipasha@email.com` / `bipasha123` — ~4 months

The seed is **destructive** and refuses to run against a production database.

---

## 3. Shipping a change to the phone

```bash
cd apps/mobile
npm run ipa
```

That's [`scripts/build-ipa.sh`](../apps/mobile/scripts/build-ipa.sh). It runs
`expo prebuild` if `ios/` is missing, builds Release for device **unsigned**,
wraps the `.app` in `Payload/`, zips it to
`~/Desktop/savenspend-<version>.ipa`, then prints the baked `scheme` and API URL
so you can eyeball them before installing. Override the destination with
`IPA_OUT=/some/dir`.

Then, on the phone:

1. **AirDrop** the `.ipa` from the Desktop to the iPhone → *Save to Files*.
2. **Delete the old app** from the Home Screen first — the free Apple ID allows
   only 3 sideloaded apps.
3. Open **LocalDevVPN** and connect. SideStore cannot install without it.
4. **SideStore → My Apps → `+`** → pick the `.ipa` from Downloads.

Unsigned is intentional. SideStore strips and replaces any signature, so signing
locally would be wasted work — and without a paid account there's no
distribution certificate to sign with anyway.

### Keeping it alive

Free certificates expire after **7 days**. Open SideStore with LocalDevVPN
connected and tap the day counter in *My Apps* to refresh. Miss the window and
the app won't launch until you refresh it — no data is lost.

The Windows laptop was only ever needed to bootstrap SideStore itself over USB
(iLoader + iTunes). That's done. You'd only go back to it after a full device
restore, or if the pairing file goes stale — and the Mac can do both jobs too.

---

## 4. The three build flavours, and why the difference bites

| Flavour | Config loaded | API target |
| --- | --- | --- |
| `npm start` / Expo Go | none | Metro's LAN host, `:7019` |
| Simulator Release | `.env.production` | Render |
| Device `.ipa` | `.env.production` | Render |

Two consequences worth internalising:

- **`EXPO_PUBLIC_*` is inlined into the JS bundle at build time.** Editing
  [`.env.production`](../apps/mobile/.env.production) does nothing to an
  already-built app; it needs a rebuild. It's also not a secret — it ships in
  plaintext inside the bundle, which is why it's committed.
- **Dev and Release differ in how they handle a JS error.** In dev you get a red
  box. In Release the error goes through `RCTExceptionsManager.reportException`,
  a *void* TurboModule, so it resurfaces as an uncaught Objective-C exception
  and `abort()`s the process — the app dies instantly with a crash log that
  contains no exception message.

  That's how the missing `scheme` bug hid: expo-router calls
  `Linking.createURL()` on first render, which throws in a standalone build with
  no `scheme` in the Expo config. **If a sideloaded build crashes on launch and
  the `.ips` shows only `EXC_CRASH` / `SIGABRT` with no message, reproduce it as
  a Release build on the simulator** — that surfaces the real error:

  ```bash
  cd apps/mobile
  npx expo run:ios --configuration Release
  ```

`apps/mobile/ios/` is **gitignored and regenerated**. Never hand-edit it; the
durable source is [`app.json`](../apps/mobile/app.json), and `expo prebuild`
propagates from there. Anything you patch directly into `Info.plist` is lost on
the next prebuild.

---

## 5. Dev vs prod database

[`apps/api/src/config/db.ts`](../apps/api/src/config/db.ts) picks the database:

```ts
if (process.env.DB_NAME) return process.env.DB_NAME;
return process.env.NODE_ENV === 'production' ? 'save-n-spend-prod' : 'save-n-spend-dev';
```

Render sets `NODE_ENV=production`, so it would use `save-n-spend-prod` — which
has never been seeded and is empty. Correct credentials get
`401 Invalid credentials!` there, which looks like a broken server but isn't.

**Currently `DB_NAME=save-n-spend-dev` is set in Render's environment** so the
sideloaded app sees the seed data. Delete that variable to go back to prod. The
Render service is configured in the dashboard — there is no `render.yaml`, so
this is a manual change.

To confirm which database the deployed API is on, check the Render logs for
`MongoDB connected: ... (db: <name>)`.

---

## 6. Gotchas checklist

- Run `expo` commands from `apps/mobile`, never the repo root — at the root,
  `expo run:ios` scaffolds a *new* native project and rewrites `package.json`.
- `apps/mobile/build/` is Xcode derived data and reaches ~1.7 GB. Gitignored;
  don't try to commit it.
- `apps/api/.env` holds real credentials and is gitignored. Root `.gitignore`
  matches `.env` and `*.env` but **not** `.env.production` — so a future
  `apps/api/.env.production` would be tracked. Add an explicit rule if you
  create one.
- Bump `expo.version` in `app.json` when you want the `.ipa` filename to change;
  the script reads it.
