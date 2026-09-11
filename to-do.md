# Features TODO

- [X] Add Transaction Button in All Activity Page
- [X] Budgets screen should support previous months as well
- [X] Option to view not just monthly transactions in all activity but also yearly, weekly, daily
- [X] Better Filters on All Activity Screen
- [X] Add note, location receipt not working
- [X] Transfer Button in Add Transaction
- [X] Better Category Picker in Add Transaction
- [X] Some division in All Transactions (like daily divider)
- [X] No time picker in Add Transaction. Automatically maps to 12 am
- [X] Keyboard auto opens when creating new category
- [X] Update Add Goals Screen with designed Screen
- [X] Catgory Modal auto opens sometimes when other modals are opened
- [X] Manual account balance sync — `PATCH /accounts/:id/balance` takes the figure the bank shows and records the difference as an adjustment, so the stored balance stays the sum of its history (see docs/architecture.md § The stored balance)
- [X] Add App Icon — piggy bank with a rupee coin; sources are `apps/mobile/assets/icon.svg` and `glyph.svg`, rendered by `npm run icons` (see docs/SHIPPING.md §8)
- [X] Escape and length-cap the Activity search term — it goes straight into `$regex` (transactionController.ts:89, transactionSchema.ts:42), so `(` 500s and `(a+)+b` backtracks on the database
- [X] Highlights, per docs/insights-engine.md — deterministic rules, no model; its own screen behind the More-tab hero rather than on the Insights tab, so insights stayed untouched
- [X] Fixtures for the highlight snapshot — the calendar-and-rollup half is now `highlightSnapshotMath.ts`, split out of the service so it is pure, and pinned by `highlightSnapshotMath.test.ts` (25 cases: zone-local month boundaries, the January year-cross, a DST month, the averaging divisor, backdated spend landing in a closed month)
- [X] First-run experience — a welcome tour after registration and a derived Get started checklist on the dashboard (see docs/mobile-patterns.md § First run)
- [ ] No test runner in `apps/mobile`, so `lib/onboarding.ts` is only covered by a throwaway harness. Its runtime imports are all `import type`, so `tsc` emits a dependency-free module that `node --test` can require directly — worth making permanent if a second pure module shows up
- [X] Delete account shouldn't delete the account completely. Keep everything archived — it now stamps `deactivatedAt`, and signing in again clears it and hands the account back untouched
- [X] when we change the budget month, the previous month's rows were shown instead of the skeleton
- [X] Same stale-window problem on the Activity feed and its summary card — the card now shows a dash rather than the previous range's money
- [X] privacy mode tap should be applicable to income/expense cards on dashboard as well — `components/ui/Money.tsx` existed but was imported nowhere, so the tap-to-peek promise in Settings was unkept
- [X] no eye buttons in tabs other than dashboard — extracted `components/shell/PeekButton.tsx` and put it in `ScreenScaffold`, so every screen has it
- [X] app lock works fine when taken to background but not on a cold start — the effect was keyed on `hydrated` alone, which always won the race against `/auth/me`
- [X] just like monday a notification for last week similar notification for every day for the previous day and notification for 1st day of the month. Handled the collision with a time slot each — daily 6pm, weekly 7pm, monthly 8pm, all zone-local, because the 1st can be a Monday (see docs/architecture.md § Digest notifications). Moved from the morning to the evening later, so the free-tier instance is reliably awake by the time they fire. Daily and weekly are opt-in, monthly is on by default; an empty period sends nothing
- [X] Greeting is always Good Evening => Make that something crwative, where we consider not only time of day, somedays the day of the week, some days the payday some festivals, etc, etc. It was a hardcoded default prop nothing ever overrode. Now `lib/greeting.ts`: festivals win outright, otherwise the time of day, the day of the week, the 1st and the month's last three days go in one pool picked from by a seed derived from the date — so it is stable all day (no flicker on re-render) and different tomorrow. Calendar-derived only, never money. Later: every line is a whole phrase (the bare "Morning"/"Midday" variants read as truncated labels), and `useGreeting` re-derives on the slot boundary and on foreground, since nothing on the dashboard re-renders because an hour passed. The header row itself went up a size, greeting over name, because at the spec's 10.5/14 it read as a caption rather than the screen's title. 21 marked days a year; the lunar table covers 2026 and 2027 and needs a line-per-festival top-up after that, and the solar entries in `FIXED_DAYS` are the common-year dates, so Lohri, Makar Sankranti and Poila Boishakh each want a 2028 override when that leap year comes round
- [X] Option to delete/edit bills — Edit and Delete on the row, mirroring `ManageRow`
- [X] Option to delete and edit goals
- [X] Make the app icon look mor elike ios — bright violet ground instead of near-black, one-colour white subject, a contact shadow and light/shade clipped inside the body. Alternatives kept in `assets/icon-variants/`. The Android adaptive background is still `#0C0A16`, so the icon reads dark there and violet on iOS
- [X] Recent transactions on top of dashboard. Settled as score → the month's four tiles → recent transactions: the verdict, then the figures it reads, then the three rows that answer "did that go in?"
- [X] Update insights tab with more insights like seeing more types of graphs or maybe more granulation to see sub category wise spends and all — four new cards in one scroll (cumulative pace vs the previous period, a donut with the tapped slice's sub-categories, a daily heatmap, biggest movers vs last period) plus a per-category detail screen behind each breakdown row. `byCategory` slices now carry `children`, and `GET /insights/category/:id` is the detail endpoint
- [X] A good way of closing the ios keyboard when trying to enter title,etc. as swiping down closes the bottomsheet as well. need a subtle way.
- [X] reorder categories/accounts in settings page — server-owned `order`, whole-set `PATCH /reorder`, and a header toggle that turns the rows into hold-and-drag ones (`components/ui/DragList.tsx`, measured per item so rows and whole cards work the same way). No auto-scroll while a row is held, so a move is limited to what's on screen in one pass
- [X] Clicking on networth of dashhboard shall show you how much each account holds currently
- [X] going to more sometimes launches a blank, then clicking on some othertab loads more screen for some time but goes back to the tabs elected. then going back to more screen loads it correctly (highly reproducing)
- [X] Once category is chosen and then we try to upodate the category on add transaction, it needs to be clicked twice.
- [X] Delete confirm sheets sat on a band of dead space — the pinned footer bar was a divider and a safe-area pad around two buttons on a sheet that never scrolls, so the buttons moved into the body
- [X] Summary tiles are one fixed box — even split, single-line label/amount/caption, so all four are the same size whatever they hold. A wrapping caption was stretching its row
- [X] Every dashboard tile leads to where its figure comes from — Income/Expenses open Activity filtered to that kind for the month, Savings opens Insights, Net Worth the account breakdown
- [X] Activity filters in three lines — kind (All/Expense/Income/Transfers) as a track, then categories, then sub-categories. Categories are scoped to the kind, and hidden for transfers, which have none
- [X] Pillar scores on the health screen were the raw curve output (84.17309968984512, wide enough to wrap the card's title into three lines) — rounded in `points()` in `healthService.ts`, so the number shown is the number that was scored, verdict thresholds included
- [X] Transfers read as transfers — "Transfer", "From → To", an unsigned teal amount, and a detail sheet naming both accounts, instead of a blank title over "Uncategorised" with a red minus

## 2.0.0 — Shortcuts, Back Tap and the Action Button

Designed in docs/native-shortcuts.md. Neither Back Tap nor the Action Button is an
API the app can call — both only invoke a Shortcut — so this is routing work, not
native work, and phases 0-2 need no Swift at all.

- [ ] Phase 0 — document the manual Shortcut recipe (Help FAQ + docs). Nothing to build: `savenspend:///add-transaction` is already routable because `scheme` is set and expo-router maps paths onto the route tree
- [ ] Phase 1 — cold-launch dismiss fallback for deep-linked modal routes. `add-transaction` closes by going back, and a launch that *starts* at the modal has nothing beneath it, so back lands on a blank screen
- [ ] Phase 2 — `lib/pendingLink.ts` plus two branches in the gate, so a link arriving while signed out survives the redirect to login instead of dropping the user on the dashboard. In memory only, never persisted; also the fallback if WakeGate's late mount eats the initial URL
- [ ] Phase 3 — App Intent for "Add Transaction" via expo-apple-targets, so it shows up in Shortcuts and Siri without the user assembling one. Opens the app, never writes: a background write would need Keychain sharing (paid tier) and a second copy of the paise handling in Swift
- [ ] Local storage or soemthing so that the app is usable in offline mdoe as well

Decided against: **widgets**. Data widgets need App Groups or Keychain sharing,
both paid-tier, and a balance on the home screen renders outside AppLockGate,
contradicting App Lock and privacy mode. Reasoning kept in
docs/native-shortcuts.md § Why widgets are out in case it is ever revisited.