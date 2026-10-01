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
- [X] No test runner in `apps/mobile` — `npm test` there now runs `lib/*.test.ts` through the API's ts-node (pure modules only: `import type` and nothing else at runtime). `lib/safeToSpend.test.ts` is the first; `lib/onboarding.ts` is still only covered by a throwaway harness
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
- [X] Need to fix empty/no transactions as screen is completely generic. For example no transactions for a days insight shouldn't show a weeks spending. Thus work on blank screens correctly.
- [X] Now daily notifications are rightly being fired but others like bills due notification and weekly notifcations are not being fired to the mobile (its seen within the bell icon)
- [ ] Need a filter for accounts as well on all activity page.
- [X] Safe to spend read "Over budget · ₹35,000 over" on a ₹10,000 Food budget with nothing spent — it took every unpaid bill off the budgets, SIPs (₹25,000) and unbudgeted rent (₹20,000) included. Now only non-SIP bills in a budgeted category (or a child of one) count, and a negative figure from bills alone reads "Bills ahead" in amber; "Over budget" is kept for spending that has actually passed the budgets. 16 edge cases in `lib/safeToSpend.test.ts`

## 2.0.0 — Shortcuts, Back Tap and the Action Button

Designed in docs/native-shortcuts.md. Neither Back Tap nor the Action Button is an
API the app can call — both only invoke a Shortcut — so this is routing work, not
native work, and phases 0-2 need no Swift at all.

- [ ] Phase 0 — document the manual Shortcut recipe (Help FAQ + docs). Nothing to build: `savenspend:///add-transaction` is already routable because `scheme` is set and expo-router maps paths onto the route tree
- [ ] Phase 1 — cold-launch dismiss fallback for deep-linked modal routes. `add-transaction` closes by going back, and a launch that *starts* at the modal has nothing beneath it, so back lands on a blank screen
- [ ] Phase 2 — `lib/pendingLink.ts` plus two branches in the gate, so a link arriving while signed out survives the redirect to login instead of dropping the user on the dashboard. In memory only, never persisted; also the fallback if WakeGate's late mount eats the initial URL
- [ ] Phase 3 — App Intent for "Add Transaction" via expo-apple-targets, so it shows up in Shortcuts and Siri without the user assembling one. Opens the app, never writes: a background write would need Keychain sharing (paid tier) and a second copy of the paise handling in Swift
- [X] Local storage or soemthing so that the app is usable in offline mdoe as well
- [X] Auto suggest labels and titles
- [X] For You carousel cards were all different heights, and Health Score, the four summary tiles, and the recent-transactions block needed reordering — Health Score now leads, the four tiles stay together as one grid, and Income/Expenses/Savings carry the same trend sparkline Net Worth already had, for free (the net-worth reconstruction was already computing per-month income/expense internally)
- [X] Budget pace on the Budget screen was silently using today's date even when viewing a past month — `budgetPace` now takes the days-elapsed/days-in-month the caller already resolved instead of recomputing "now" itself. Goal cards got the same pace treatment: "At this pace, done around Month"
- [X] Highlights on the More screen only ever showed what's live right now — added a permanent, paginated history (`HighlightLog`), sorted newest first, that nothing can dismiss or delete
- [X] Full account Backup & Restore, from Settings — export every account, category, transaction, budget, bill, and goal as one JSON file, and restore it back later (wipes and replaces only the current account's own data, inside one transaction, behind a hold-to-confirm)
- [X] Month in Review / Week in Review — a recap of any closed week or month (verdict, a day-by-day timeline, income/expenses/saved vs the period before, categories, habits, net worth, goals, bills), browsable from More → Reviews and surfaced once as a dashboard banner the first time the app opens after a period closes
- [X] Need a good loader when trying to refresh page by slidin g it down - this should refresh the page
- [X] Create something for investments => So i want to work on a new feature called investments. as you can see on the insights screenshot how weird and outliers it seems. it is because i give sips on 5th 10th 17th. so this changes the meaning of expenseas they are currently attributed as expense. 
- [X] Form keeps populated after adding one investment
- [X] More screen doesnt respond. you have to come back each time.
- [X] Invested value and actual value edit on the investments.
- [X] On cash flow page, SIP and Income is shown with same colour.
- [X] Every icon on investments tab is shown with the same icon.
- [X] Investment accounts should not show up in transactions page — left out of every "paid from" picker (Add Transaction, Mark paid, the default account), and person accounts too wherever the money has to be real


So now i need you to give me the feasiblity how it would look and the complete desingn plan. once thats done we can then decide on the screens on how it would look and all. 


Decided against: **widgets**. Data widgets need App Groups or Keychain sharing,
both paid-tier, and a balance on the home screen renders outside AppLockGate,
contradicting App Lock and privacy mode. Reasoning kept in
docs/native-shortcuts.md § Why widgets are out in case it is ever revisited.

## 2.3.0 — Trip mode

Group trips are tracked today on WhatsApp and in Splitwise, then added as one lump ("₹10k Goa
trip") — wrong by category, wrong by date, and friends' balances aren't tracked. A trip keeps
every expense as your own share, dated, with who owes whom.

- [X] Trips screen (More): active and closed trips — name, dates, your share, open balances. New trip: name, dates, people (person accounts), optional budget
- [X] Trip screen (one long page): your share / what you paid / whole-trip cost vs budget; people with balances and Settle up (which account it went to or came from, partial amounts allowed); your share by category; spend by day; then a day-by-day journal of every expense and settlement. Trips list: every trip across all years — an all-trips summary card (total share, number of trips, average, open balances, a bar per year that jumps to it), the active trip on top, then trips grouped by year with each year's subtotal
- [X] Add an expense from inside the trip only (a dedicated sheet — Add Transaction stays unchanged): Who paid? (me from an account, or a friend) and Split (everyone equally, some, custom), each share shown live. Your share is the spending; a friend paying is charged to their person account; your own payments move money as soon as they're logged
- [X] Splitwise CSV import (live trips only): match names once (who you are, which person account is who) → review each row as New / Matches yours (apply the split to your own entries) / Break it down (lumps) / Pick the account you paid from / Is this yours? (zero rows, off by default) / Skipped (rows you're not in, payments between others) → edit, then approve. Re-import only adds new rows. Categories suggested from the description, not Splitwise's "General"
- [ ] Import fallbacks: match columns yourself if they look off; "Just my totals" (your share by category plus each person's balance) if the file is unusable
- [X] Wrap up (checklist: expenses in, categories set, balances decided, then a trip summary) and close: always allowed; each leftover balance is kept (stays on the person account) or let go (default under ₹50 — into or out of your share); locks the trip and stops tagging; can be reopened
- [X] Rest of the app: one Trips slice in Insights (tap for each trip by category); trip spending left out of category budgets (counts against the trip's budget) but in totals and savings rate; settlements never count as spending or income
- [ ] Later: trip budget alerts; trips abroad in another currency

### Trip mode — walkthrough bugs

- [X] New and edited trips save a day early — the sheet sent local midnight, every trip screen reads the dates as UTC calendar days. Trip dates are now calendar days stored as UTC midnight, with `tripDayToPicker` / `pickerToTripDay` crossing to the picker's local dates
- [X] "Day X of Y" is a day behind in India until 05:30 — counted from UTC midnight; now from today's calendar date in the app's zone
- [X] Local reminders re-fire on every launch — `local:notifiedKeys` has a colon, which SecureStore rejects (and `writeJson` swallows), so nothing was ever marked sent. Now `sns.notifiedKeys`, like the other device keys
- [X] No way to delete a trip from the app — the API supports it. "Delete trip" in the edit sheet, behind a hold-to-confirm, since it unwinds every expense and settle-up
- [X] Import settle-ups show the file's names ("Friend C paid You M.") instead of the matched people — the preview titles them "Adrita paid you" from the mapping
- [X] New trip sheet: the "Give the trip a name." error sits below every person, out of sight — now in the footer, above the button
- [X] New trip sheet rides up under the status bar while the keyboard is open — `topInset` on AppSheet, so no sheet can pass the safe area

### Trip mode — walkthrough polish

- [X] Paise where a rupee figure reads better — "a day" on the trip page and wrap-up, "open" and "avg" on the Trips list. `roundToRupee` in lib/money; balances someone will settle keep their paise
- [X] Spend by day skips quiet days — a bar for every day of the trip so far, quiet ones as a faint stub
- [X] A settle-up-only day reads "₹0" in the journal — now "Settle-ups", dimmed
- [X] The Trips list's year bar counts the active trip, the year group header doesn't — the header reads the bar's figures and says "incl. active"; picking a year keeps its active trip in view
- [X] Import review dates read "2025-12-07"; rows outside the trip's dates get no warning — now "7 Dec", in amber when outside, with a count and "check this is the right trip's file" above the rows
- [X] Approving an import is a silent ~10s spinner — a line under it says how many rows and to keep the screen open. Rows stay sequential: each moves balances the next one reads
- [X] Name matching: the "Me" chips shift as picked names change the Person chip's width — the Person chip has a fixed slot and truncates
- [X] "Delete expense" in the trip expense sheet should be the danger style
- [X] Hide "Log again today" on any trip transaction, not only trip expenses
- [X] A trip tag on Activity rows — a ✈ trip-name chip on the meta row, from a trip-name store loaded on first use (`store/tripNames.ts`)
- [X] Insights "Where it left from" — group person accounts into "Paid by friends"
- [X] Local reminders use bill wording for SIP bills — same copy as the reminder job
- [X] Found while checking the fixes: a trip with nobody else read "1 people" (now "just you"); the name error stayed up after typing a name; the Activity trip tag squeezed "Goa" to "G…"; a single settle-up day read "Settle-ups"

## 2.x — Warranties and returns

Money lost to a missed return window or a lapsed warranty is real and invisible. One date on
a transaction — no photos, so it stays within the free database.

- [ ] Mark a purchase with a return window ("return by 12 Oct") and/or a warranty ("warranty to Mar 2028"), from Add Transaction and the transaction detail sheet
- [ ] Nudges before each closes: return window a couple of days out, warranty a few weeks out — local notification plus the in-app feed
- [ ] A "Warranties & returns" list (More): what's still covered, what's about to lapse, and what's expired, each linking back to its transaction
- [ ] Mark a return done (and optionally log the refund against it) so the reminder stops

## Later — Loans and EMIs

Nowhere to track a home, car, or personal loan, or a card EMI today, though most households
carry at least one. Build later.

- [ ] Loan as its own kind of account (debt): principal, rate, tenure, start date — the EMI and the full amortization schedule worked out from those, interest vs principal per instalment
- [ ] EMIs flow in on their own: each loan's EMI appears as a recurring bill and on the cash-flow calendar; paying it splits into interest (spending) and principal (debt paid down)
- [ ] Prepayment calculator — "prepay ₹50,000 now and save ₹1.3L of interest, finishing 14 months early", with reduce-EMI vs reduce-tenure side by side
- [ ] Credit cards: statement date, due date, amount due, and a nudge before interest would be charged; card EMIs as loans
- [ ] Debt in the rest of the app: net worth net of outstanding loans, the health score's debt pillar, and a debt-free date on the loans screen
