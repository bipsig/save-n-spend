# Shortcuts, Back Tap and the Action Button

This document describes how Save n Spend becomes reachable from outside the app —
a double-tap on the back of the phone, the Action Button on an iPhone 15 Pro or
later, or a Siri phrase — so that recording a transaction does not require finding
the icon first.

Designed, not built. Planned for 2.0.0. Widgets were considered and dropped; see
[Why widgets are out](#why-widgets-are-out).

## Topics

- [The reframe that shapes everything](#the-reframe-that-shapes-everything)
- [What the user actually does](#what-the-user-actually-does)
- [Link targets are an allowlist](#link-targets-are-an-allowlist)
- [The four ways a deep link can go wrong](#the-four-ways-a-deep-link-can-go-wrong)
- [Pending-link replay](#pending-link-replay)
- [The App Intent](#the-app-intent)
- [Parameters](#parameters)
- [Why widgets are out](#why-widgets-are-out)
- [Testing](#testing)
- [Phasing](#phasing)

## The reframe that shapes everything

**Neither Back Tap nor the Action Button is an API an app can call.** There is no
entitlement to request and no delegate to implement. Both are settings the *user*
configures, and both can only invoke a **Shortcut**.

So the app never claims the button. Its only job is to be *invocable from
Shortcuts*, and everything below follows from that. It is why this feature is
mostly routing work rather than native work, and why the first phase ships as
documentation with no code at all.

## What the user actually does

The app already declares `scheme: "savenspend"` in
[`app.json`](../apps/mobile/app.json), and expo-router maps a URL path onto the
route tree without any `Linking` code. That is enough today:

1. Shortcuts app → new shortcut → one **Open URL** action →
   `savenspend:///add-transaction`
2. Settings → Accessibility → Touch → **Back Tap** → Double Tap → pick that
   shortcut. Or Settings → **Action Button** → Shortcut → pick it.

Three slashes, not two: the form is `scheme://<host>/<path>` and there is no host.

**Note**
The `scheme` value is already load-bearing for a different reason —
[`scripts/build-ipa.sh`](../apps/mobile/scripts/build-ipa.sh) sanity-checks it in
the packaged `.ipa` because expo-router calls `Linking.createURL` on first render
and a missing scheme crashes the app on launch. Do not rename it casually; a
rename silently breaks every shortcut a user has already built.

## Link targets are an allowlist

**Decision: a short, explicit list of link targets, not "any route".**

A deep link is the one way into the app that arrives with **no back stack and no
prior screen**. Every route is reachable by tapping through the UI, but only a
route that has been checked against a cold launch is safe to link to.

| Target | Why it earns a slot |
|---|---|
| `/add-transaction` | The headline. The whole point of a two-tap gesture is capturing a spend before you forget it. |
| `/bills` | The other thing people check away from their desk. |
| `/goals` | Cheap to include; it is a plain pushed route with no cold-launch problem. |

Everything else stays out until someone wants it. Adding a target is not free —
each one is a new cold-launch path to verify.

## The four ways a deep link can go wrong

These were checked against the existing gate in
[`app/_layout.tsx`](../apps/mobile/app/_layout.tsx). Two need no work; two do.

| Situation | Behaviour today | Verdict |
|---|---|---|
| Authed, app warm | The gate sees `authed` and `segments[0] !== "(auth)"`, so it leaves the route alone. The link survives. | **Works.** No change. |
| App Lock on | `AppLockGate` renders *over* the stack rather than navigating, so unlocking restores whatever was underneath — which is the linked route. | **Works by accident of a good decision.** No change. |
| Signed out | The gate calls `router.replace("/(auth)/login")` and the link is gone. After login it replaces to `/(tabs)`, so the user lands on the dashboard wondering what happened. | **Needs [pending-link replay](#pending-link-replay).** |
| Server asleep | `WakeGate` renders *in place of* the Stack, so the navigator mounts late and may never see the initial URL. | **Needs verifying on device.** The same replay mechanism is the fallback. |

There is also a fifth problem that is not about the gate at all:

**A cold-launched modal has nothing to dismiss to.** `add-transaction` is
registered with `presentation: "modal"` and closes by going back. Reached by
tapping through the app that is correct. Reached from a Back Tap on a cold launch
there is nothing beneath it, and back lands on a blank screen. Any modal route on
the allowlist must fall back when the stack is empty:

```tsx
const close = () => {
  if (router.canGoBack()) router.back();
  else router.replace("/(tabs)");
};
```

This is the cheapest bug in the feature to fix and the most likely to ship
unnoticed, because it only appears on a launch that starts at the modal.

## Pending-link replay

**Decision: hold the intended path in memory only, and replay it from the gate.**

```ts
// lib/pendingLink.ts — deliberately not a store and deliberately not persisted.
let pending: string | null = null;
export const setPendingLink = (path: string) => { pending = path; };
export const takePendingLink = () => { const p = pending; pending = null; return p; };
```

Two decisions inside that:

**Not persisted.** A link intent is only meaningful for the launch that carried
it. Write it to storage and an app killed at the login screen will replay a
days-old intent on some unrelated launch — the user taps the icon and lands on a
half-filled Add Transaction form for no reason they can see.

**Replayed from the gate, nowhere else.** The gate in `_layout.tsx` is already
documented as *the only place the app swaps between `(auth)` and `(tabs)`*. A
second place that navigates on session change would race it. So the gate captures
on the way out and consumes on the way back in:

```tsx
if (status === "guest" && !inAuth) {
  setPendingLink(currentPath);          // remember where they were headed
  router.replace("/(auth)/login");
}
else if (status === "authed" && inAuth) {
  const next = takePendingLink();
  router.replace(next ?? "/(tabs)");    // resume, or the normal landing
}
```

`takePendingLink` clears as it reads, so a replay cannot happen twice — which
matters because the gate's effect reruns on every `segments` change.

**Note**
This one mechanism also covers the `WakeGate` case. If device testing shows
expo-router drops the initial URL when the navigator mounts late, read it once at
boot with `Linking.getInitialURL()` and push it into the same slot. No second code
path.

## The App Intent

Phase 0 asks the user to build a Shortcut by hand. An **App Intent** puts *Add
Transaction* in Shortcuts and Siri automatically, so there is nothing to assemble
and "Hey Siri, add a transaction" works.

**Decision: the intent opens the app. It never writes.**

`openAppWhenRun = true`, it routes, and that is all. A background intent that
posts the transaction from Swift would have to:

- read the JWT out of expo-secure-store, which is a Keychain item in another
  process — that needs Keychain Sharing, a **paid-tier capability**
- reimplement the integer-paise money handling, category resolution, and error
  and offline behaviour in a second language, where it will drift from the
  TypeScript version

The intent's job is to *route*, not to transact. This also keeps the feature on
the free-account signing path: App Intents does not appear in Apple's tier-gated
capability matrix at all, unlike Siri, so it needs no entitlement.

Mechanically it needs a native target, which means
[`expo-apple-targets`](https://github.com/EvanBacon/expo-apple-targets). Targets
live in `apps/mobile/targets/` and are re-linked on every prebuild, which keeps
the existing rule intact: `apps/mobile/ios/` is generated and never hand-edited.
Its constraints — Xcode 16, SDK 53+, and a CommonJS-only target config — are worth
reading before starting.

## Parameters

**Decision: `amount` only, as a prefill, never auto-saved.**

`savenspend:///add-transaction?amount=250` lands on the form with 250 already
entered and the user still has to confirm. The route already reads params — it
takes `?id=` for editing — so this is a small addition.

A shortcut that silently writes money is the one bug class a user cannot undo from
the home screen: they would not know it happened, and a stray Back Tap in a pocket
becomes a phantom transaction. Confirmation stays.

**Category is deliberately excluded.** A shortcut can only pass a category *name*,
and resolving a name to an id needs the user's category tree — so a typo or a
renamed category either fails or, worse, silently picks the wrong one. Revisit
only if the intent can offer a real picker rather than free text.

## Why widgets are out

Considered for 2.0.0 and dropped, for three reasons in increasing order of
severity.

1. **No React Native in a widget.** A widget is a separate process running a
   SwiftUI `TimelineProvider`. None of `Card`, `AppText`, the `theme/` tokens or
   `formatMoney` can be reused, so every widget is a second, parallel UI
   implementation to keep visually in sync by hand. That upkeep is permanent.
2. **The data channel is paid-tier.** The widget cannot call the app's JS. Sharing
   a snapshot needs **App Groups**; fetching the API directly needs the token, so
   **Keychain Sharing**. Both are tier-gated capabilities, and each extension also
   consumes one of the ten App IDs a free account gets per week.
3. **It would defeat App Lock and privacy mode.** A widget reading `₹42,310`
   renders on the lock screen and in the app switcher, outside `AppLockGate`
   entirely. `privacyMode` exists precisely so amounts can be hidden in public.
   Putting a balance on the home screen contradicts a guarantee the app already
   makes.

If widgets are ever revisited, the version that survives point 3 shows
**structure, not amounts** — "3 bills due this week", a progress ring with no
figure on it — and the version that survives point 2 is a **link-only widget**
carrying no data at all, just tap targets into the routes above. That one needs no
App Group, and it is really this feature wearing a different hat.

## Testing

A deep link is awkward to test because the interesting cases are all cold
launches. Kill the app between every attempt — a warm relaunch proves nothing.

```bash
# Simulator
xcrun simctl openurl booted "savenspend:///add-transaction"
```

The matrix worth walking, because each row exercises a different one of the
failure modes above:

| Case | Expect |
|---|---|
| Cold launch, authed, App Lock off | Lands on Add Transaction. |
| Cold launch, App Lock on | Face ID, then Add Transaction — not the dashboard. |
| Cold launch, signed out | Login, then Add Transaction after signing in. |
| Cold launch while the server is asleep | The waking screen, then Add Transaction. |
| Close the cold-launched modal | The dashboard, not a blank screen. |
| Warm app, already on Add Transaction | No duplicate modal stacked on itself. |

## Phasing

| Phase | Scope | Native code | Blocked on |
|---|---|---|---|
| 0 | Document the manual Shortcut recipe, in Help and here. Works against the current build. | none | nothing |
| 1 | Cold-launch dismiss fallback for modal link targets. | none | nothing |
| 2 | `lib/pendingLink.ts` plus the two branches in the gate. | none | nothing |
| 3 | App Intent for *Add Transaction* via `expo-apple-targets`. | first Swift in the repo | nothing |

Phases 0 to 2 are ordinary TypeScript and carry no signing or tooling risk.
Phase 3 introduces a native target and is the point at which the build gets
harder, so it is deliberately last and separable — 0 to 2 are useful shipped
alone.

**The cheapest possible first step costs nothing.** Build the Shortcut by hand on
a real phone against the current build and bind it to Back Tap. If the modal
opens, phases 0 to 3 are all de-risked at once. If it does not, that is the only
thing worth fixing first.
