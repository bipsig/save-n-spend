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
| API (`apps/api`) | Render — `https://save-n-spend.onrender.com/api/v1` | Free tier, so the first request after idle takes about 35 s to cold-start, and up to ~50 s on a bad day. Not a bug — the app shows a waking screen for it. See [Cold-start gate](architecture.md#cold-start-gate). |
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
cd apps/mobile && npm start -- --localhost   # then press `i` for the simulator
```

With no `.env.development` present, [`lib/api.ts`](../apps/mobile/lib/api.ts)
derives the API host from Metro's `hostUri` and hits `:7019`. That's deliberate —
it means dev automatically talks to your local API, and only Release builds go to
Render.

Outside production the API binds to `127.0.0.1`, so only this machine can reach it —
it holds the dev database. That has one consequence: the app finds the API at Metro's
host, and a plain `npm start` serves from the Mac's LAN address, which a loopback-only
server refuses. Pick one:

- `npm start -- --localhost` — Metro hands out `localhost`, the simulator reaches the API
  there. Preferred, and the form used above.
- `HOST=0.0.0.0 npm run dev` — the API listens on every interface. Needed to reach it
  from a phone on the same Wi-Fi; only do that on a network you trust.

The deployed API is unaffected: `NODE_ENV=production`, or Render's own `RENDER`
variable, keeps the bind on every interface, which Render needs to route traffic in.

**Simulator runtime.** The iOS 27.0 simulator runtime is not always installed. If Metro's `i`
cannot boot a device, boot one from the iOS 26.5 runtime instead
(`xcrun simctl list devices available`, then `xcrun simctl boot <udid>`) and press `i` again.

Seed data (`npm run seed` in `apps/api`) gives you:

- `sagnik@email.com` / `sagnik123` — ~1 year of activity
- `bipasha@email.com` / `bipasha123` — ~4 months

The seed is **destructive** and refuses to run against a production database.

---

## 3. Shipping a change to the phone

**Push first, so Render deploys the API before you install.** The sideloaded app talks to the
deployed API, and a build that expects an endpoint or a field the API does not have yet fails in
ways that look like an app bug. Render deploys from the pushed branch, so get the API change onto
it, wait for the deploy to finish (the first request after it can take ~50 s, see
[Cold-start gate](architecture.md#cold-start-gate)), and only then build and install the `.ipa`.
An API change that is not pushed cannot be seen by the phone, whatever the local build contains.

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

### Version and build number

Two fields in [`app.json`](../apps/mobile/app.json) carry them, and a release bumps both in one
commit titled `chore(mobile): bump version to X.Y.Z`:

| Field | Now | Used by |
|---|---|---|
| `expo.version` | `2.8.0` | The `.ipa` filename (`build-ipa.sh` reads it with `node -p`), the app's own `X-App-Version` header and error reports (`Constants.expoConfig.version`, in `lib/errorReporting.ts`), and the iOS marketing version. |
| `expo.ios.buildNumber` | `23` | The iOS `CFBundleVersion`. The script does not read it; it is bumped by hand, by one per release. |

A bump, in order:

1. **Write the release notes.** Add the version to the top of `RELEASES` in
   [`data/releaseNotes.ts`](../apps/mobile/data/releaseNotes.ts) with the same version, build
   number and today's date. The app reads only that file. See
   [Release notes](#release-notes).
2. Set `expo.version` and `expo.ios.buildNumber` in `app.json`.
3. Write the same two values into `ios/SavenSpend/Info.plist` (below).
4. `npm test` in `apps/mobile`: it checks the notes (order, highlights, links, no amounts).
5. Commit as `chore(mobile): bump version to X.Y.Z`.

A version with no entry in `RELEASES` still runs; it just shows no sheet and no NEW tag.

`eas.json` is not part of this flow: the sideload route never uses EAS builds, and its
`appVersionSource: "remote"` and `autoIncrement` apply only to a cloud `production` build.

**The version in the filename is not proof of the version inside.** `build-ipa.sh` runs
`expo prebuild` only when `ios/` is missing, and `ios/SavenSpend/Info.plist` holds the version
and build number as literal values written at prebuild. Bumping `app.json` and running
`npm run ipa` renames the file; whether the native `CFBundleShortVersionString` and
`CFBundleVersion` follow depends on `ios/` being regenerated. After a bump, check the two keys in
`ios/SavenSpend/Info.plist`, or re-run `npx expo prebuild --platform ios` (with Node 24 active, see
below) before `npm run ipa`.

`build-ipa.sh` does not regenerate `ios/`, so a version bump in `app.json` does not reach `ios/SavenSpend/Info.plist` on its own. After bumping, write the same values into it (`CFBundleShortVersionString` and `CFBundleVersion`, for example with `/usr/libexec/PlistBuddy`) or run a fresh prebuild, then verify the built `.ipa` reports the new version.

The API deploys to Render from the pushed branch. Render is configured in its dashboard (there is no `render.yaml`), so the trigger is not visible from the repo — confirm the deploy finished in the dashboard before installing a build that needs a new endpoint.

### Release notes

Settings › What's new lists every version, and the first open after an update shows a
sheet with the new version's highlights. Both read `RELEASES` in
[`data/releaseNotes.ts`](../apps/mobile/data/releaseNotes.ts), bundled with the app, newest
first.

- **Group by what the user sees:** `new`, `improved`, `fixed`. Order within a release is the
  order shown.
- **Split each note** into `title`, its first sentence with its full stop or colon, and
  `detail`, the rest. The sheet and the timeline show only the title.
- **No amounts.** No ₹ figures, examples or thresholds. A masked "₹ ••••" is fine.
- **No times.** Name the period ("daily", "each month"), never the hour something runs.
- **`highlight: true` on at most 3 notes.** Unmarked, a release shows its first three new notes.
- **`link` only to a screen that exists today**, as an expo-router href (`/trips`,
  `/bills?suggestions=1`). The test fails on a link with no file under `app/`.
- **`quiet: true`** for a version that only changed things behind the scenes. It keeps its
  timeline entry, with no highlights, no NEW tag and no sheet.
- **Leave out what users can't notice**, such as server-side checks they could never reach
  from the app.

### The Node version reaches further than the shell

`expo prebuild` writes `ios/.xcode.env.local` from whatever `command -v node`
resolved to at the time, and Xcode's script phases source that file. So an `ios/`
generated from a shell on Node 18 keeps bundling with Node 18 no matter how the
build is launched — `mise exec node@24.20.0 -- npm run ipa` does not fix it — and
fails ten minutes in with `configs.toReversed is not a function`. `npm run ipa`
now checks both the PATH Node and the baked one up front and stops. Either fix
the one line in `ios/.xcode.env.local` or re-run prebuild with Node 24 active.

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
| `npm start -- --localhost` / Expo Go | none | Metro's host (`localhost` with `--localhost`), `:7019` |
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

**Exception, and a real trap:** `build-ipa.sh` only runs `expo prebuild` when
`ios/` is *missing* — so in practice, hand-edits to native files (Swift,
`project.pbxproj`) survive every normal `npm run ipa` build. They are only
wiped the next time something forces a fresh prebuild (a new native
dependency, `--clean`, or deleting `ios/`). `SceneDelegate.swift` and the
matching `AppDelegate.swift`/`project.pbxproj` changes (added to fix
`UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` — Expo SDK 54
has no built-in Scene support, so this is hand-rolled, not a config plugin)
are exactly this kind of file: gone on the next forced prebuild, with the
crash returning silently unless someone remembers to redo them. The
`UIApplicationSceneManifest` Info.plist entry is safe either way — it's also
in `app.json`'s `ios.infoPlist`, which prebuild regenerates correctly. If this
recurs, either turn the Swift/pbxproj changes into a proper Expo config
plugin, or upgrade past the Expo SDK version that lacks Scene support.

---

## 5. Dev vs prod database

[`apps/api/src/config/db.ts`](../apps/api/src/config/db.ts) picks the database:

```ts
if (process.env.DB_NAME) return process.env.DB_NAME;
return process.env.NODE_ENV === 'production' ? 'save-n-spend-prod' : 'save-n-spend-dev';
```

Render sets `NODE_ENV=production` and no `DB_NAME`, so the deployed API — and
therefore the sideloaded app — uses `save-n-spend-prod`, which holds the real
data. Local runs use `save-n-spend-dev`.

**Important**
Never write to `save-n-spend-prod`. Experiment on dev; when you need realistic
data, copy prod into dev with a read-only pass over prod and work on the copy.
The seed script wipes whichever database it reaches, which is why it refuses
anything named `prod`.

The Render service is configured in the dashboard — there is no `render.yaml`,
so its environment is not visible from the repo.

To confirm which database the deployed API is on, check the Render logs for
`MongoDB connected: ... (db: <name>)`.

---

## 6. Push notifications

Push needs three things the rest of the app doesn't. The in-app notification feed
works without any of them — see
[Notifications](architecture.md#notifications) — so nothing below blocks a build.

1. **A native rebuild.** `expo-notifications` has native code. Any build made
   before it was installed will not have it, so run `npm run ipa` (or
   `npx expo prebuild --clean` then `expo run:ios`) once.

2. **An EAS project id.** `getExpoPushTokenAsync` cannot issue a token without
   one, and `app.json` has no `extra.eas.projectId` until you link the project:

   ```bash
   cd apps/mobile
   npx eas init
   ```

   Until then `registerForPush` logs `[push] no EAS project id` and returns
   `null`. That is the designed fallback, not a failure.

3. **A real device.** The iOS Simulator has no APNs registration and can never
   produce a push token. Test the feed, the bell dot, and the badge in the
   simulator; test delivery on hardware.

**Note**
`DISABLE_REMINDERS` must be **unset** on the deployed API or the hourly reminder
job never schedules — and set locally, so a development run cannot claim a
dedupe key that belongs to the deployed instance.

**To verify push end to end**

1. Sideload a build made after `eas init`, sign in, and accept the permission
   prompt.
2. Confirm the token reached the account — the app sends it with
   `PATCH /users/me` on launch.
3. Create a bill due today, then trigger the job on the API rather than waiting
   for the hour to turn:

   ```ts
   // node -e, or a scratch script inside apps/api
   await runReminders(new Date());
   ```

4. The notification should appear on the phone **and** under the bell. If it is
   only under the bell, push is the part that failed — check the API logs for
   `[push]`.

---

## 7. Gotchas checklist

- Run `expo` commands from `apps/mobile`, never the repo root — at the root,
  `expo run:ios` scaffolds a *new* native project and rewrites `package.json`.
- `apps/mobile/build/` is Xcode derived data and reaches ~1.7 GB. Gitignored;
  don't try to commit it.
- `apps/api/.env` holds real credentials and is gitignored. Root `.gitignore`
  matches `.env` and `*.env` but **not** `.env.production` — so a future
  `apps/api/.env.production` would be tracked. Add an explicit rule if you
  create one.
- Bump `expo.version` **and** `expo.ios.buildNumber` in `app.json` for a release; the script reads
  only the version, for the `.ipa` filename. See [Version and build number](#version-and-build-number).
- Write the version's release notes before the bump. See [Release notes](#release-notes).
- Push before you build: the phone talks to the deployed API. See §3.

---

## 8. The app icon

The sources are **`assets/icon.svg`** (full bleed, opaque — the iOS icon) and
**`assets/glyph.svg`** (transparent — the Android adaptive foreground and the splash
logo). The PNGs beside them are build output that happens to be committed, because
Expo's config can only point at raster files and a fresh clone has to build without
librsvg installed.

```bash
cd apps/mobile
npm run icons          # needs: brew install librsvg
```

Then **prebuild, or the change never reaches the app** — the icon is baked into
`ios/SavenSpend/Images.xcassets/AppIcon.appiconset/` at prebuild time, and
`build-ipa.sh` only prebuilds when `ios/` is missing:

```bash
npx expo prebuild --platform ios
npm run ipa
```

Three constraints worth knowing before editing the artwork:

- **The iOS icon must be opaque and square.** No alpha channel, no rounded corners —
  iOS applies its own squircle mask, and pre-rounding shows dark wedges inside it.
  `build-icons.sh` fails the build if `icon.png` picks up an alpha channel.
- **`glyph.svg` is scaled to 85%** because an Android launcher can crop everything
  outside the central 66% of an adaptive icon. The wrapping transform is the only
  intended difference between the two files; the artwork inside them must stay in
  sync by hand.
- **The ₹ is a `<text>` element**, so rendering needs Arial or Helvetica installed.
  Build-time only — the committed PNGs have no such dependency.

Judge any change at **40–60px**, not at 1024. That is the size the Home Screen
actually draws, and it is where thin strokes and small details disappear.
