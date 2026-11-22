# Mobile patterns

This document covers the conventions the mobile app already follows. Follow them
when you add to it: a screen that matches its neighbours is easier to review than
one that is merely correct.

For tokens and components, see [Design system](design-system.md).

## Topics

- [Navigation structure](#navigation-structure)
- [Fetch data with a domain hook](#fetch-data-with-a-domain-hook)
- [Offline behaviour](#offline-behaviour)
- [Server waking up](#server-waking-up)
- [Add a screen](#add-a-screen)
- [Add a full-screen form](#add-a-full-screen-form)
- [Add a bottom sheet](#add-a-bottom-sheet)
- [Export a report](#export-a-report)
- [Investments screens](#investments-screens)
- [Charts](#charts)
- [Add a period selector](#add-a-period-selector)
- [Show an amount](#show-an-amount)
- [Days and months: zone helpers](#days-and-months-zone-helpers)
- [Toasts and haptics](#toasts-and-haptics)
- [Handle loading, empty, and error states](#handle-loading-empty-and-error-states)
- [First run](#first-run)
- [Refetch on focus](#refetch-on-focus)
- [Tests](#tests)
- [Run the app in development](#run-the-app-in-development)

## Navigation structure

Routing is file-based, through expo-router v6. A file under `apps/mobile/app/`
is a route.

| Path | Purpose |
|---|---|
| `app/_layout.tsx` | Root stack. Mounts the providers, the lock and wake gates, `Toast`, `PeekBar`, and the session gate. Registers the two modal routes. |
| `app/(auth)/` | `welcome`, `login`, `register`. Shown when `session.status !== "authed"`. |
| `app/(tabs)/` | The tab bar: **Home** (`index`), **Activity**, **Insights**, **More**. |
| `app/<name>.tsx` | A pushed route, or a modal one. Listed below. |

Pushed and modal routes, by area:

| Area | Routes |
|---|---|
| Capture | `add-transaction` (modal), `add-goal` (modal) |
| Money hubs, from More | `budget`, `bills`, `cash-flow`, `goals`, `investments`, `trips`, `review-history` |
| Detail | `investment-detail` (`?id=`), `trip-detail`, `trip-import`, `trip-wrapup`, `category-insights` |
| Reviews and insight | `review` (a month or week), `assistant` (Highlights), `health` (score breakdown) |
| Manage | `manage-accounts`, `manage-categories`, `notifications` |
| Settings and support | `settings`, `whats-new` (version history, from Settings › What's new), `whats-new/[version]` (one version's notes), `help`, `privacy-policy`, `diagnostics` (unlocked by tapping "You're on" in What's new seven times), `crash-test` (reached from Diagnostics) |

`investments` also accepts `?revalue=1`, which opens the revalue sheet on arrival;
`investment-detail` accepts `?edit=1` to open the editor. Both are how a
notification or a nudge deep-links in (`routeFor` in `lib/notifications.ts`).

Release-note links use three more params. `investments?tab=trends` opens the
Trends tab, and `investments?export=1` opens the Investments export sheet.
`insights?export=1` opens the Insights export sheet. Each one acts once its data
has loaded, and only where the screen's own control would work: Trends needs
some history, and an export needs something to export. The screen then clears
the param with `router.setParams`, so coming back doesn't open it again.

Every screen is wrapped in its own `ScreenErrorBoundary` through the Stack's
`screenLayout` (the tabs have the same on the Tabs navigator), so a screen that
throws is replaced in place and the back stack survives. `ErrorBoundary`, exported
from `_layout.tsx`, is the last resort for a crash in a layout.

A route that should slide up as a card is registered in the root stack with
`presentation: "modal"`:

```tsx
<Stack.Screen name="add-goal" options={{ presentation: "modal" }} />
```

**Important**
A native modal route is a separate view hierarchy. If the route hosts bottom
sheets, it needs its own `<BottomSheetModalProvider>` — the root provider does
not reach inside it, and sheets presented without one never appear. A route that
hosts no sheets, such as `add-goal`, must not add one.

## Fetch data with a domain hook

Every read goes through TanStack Query, behind one wrapper in
`lib/query/useApiQuery.ts` (D17 A). Each domain owns a file in `apps/mobile/lib/` that
exports a hook built on it, plus the pure helpers that derive from its data.
`lib/budgets.ts` is the reference implementation:

```ts
export const useBudgets = (month?: string) => {
  const { data, ...rest } = useApiQuery<BudgetSummary[]>(`/budgets${month ? `?month=${month}` : ""}`);
  return { items: data ?? [], ...rest };
};
```

`useApiQuery(path)` returns one shape:

| Field | Meaning |
|---|---|
| `data` | The answer, or `null` before the first one |
| `loading` | The first load: nothing to show yet |
| `refreshing` | A later load while `data` is on screen |
| `error` | The latest failure's message; cleared when a load succeeds |
| `refetch()` | Asks again (see the focus rule below) |
| `fetchedAt` | When the data on screen was fetched, in ms. For a saved copy served offline or while the server wakes, when that copy was saved |

`useApiPages(page => path)` is the paginated form (`useTransactionFeed`,
`useHighlightHistory`): the same fields plus `items`, `total`, `hasMore`, `loadingMore` and
`loadMore()`. A later page with no signal and nothing saved ends the list instead of
blanking it, and `refetch()` goes back to page one.

List hooks still return `items` instead of `data` and `useHighlights` its own fields, so
screens did not change in 2.8.3 phase 1; phase 2 moves screens onto the shape.

The rules (`lib/query/core.ts`, tested in `lib/fetchLayer.test.ts`):

- **Keys hold every param.** The key is `["api", userId, path]`, so each period, month and
  filter is its own entry, and a slow answer for one can never show under another's label.
  Stepping to a window seen before shows its saved figures at once. The user id keeps one
  account's data from the next; the cache is emptied when the account changes or signs out.
- **Once on open, again on focus only when stale.** Data younger than 30 s (`STALE_MS`) is
  reused. On refocus, `useApiQuery` refetches only what is older, or what a write made stale.
  A fetch already running is joined, never repeated.
- **`refetch()` from a screen's own `useFocusEffect`** (called within a second of focus)
  follows the same focus rule; any other call (pull to refresh, Try again, after a change)
  fetches. shortcut: the focus pass is told apart by time until phase 2 removes the screens'
  `useFocusEffect` refetches.
- **A write refreshes what it changed.** `lib/api.ts` calls `afterWrite` after every successful
  write (`lib/query/invalidate.ts`): mounted screens refetch now, the rest when next shown. Most
  writes change every read; auth, notifications, a name or push token, an import preview and
  dismissing a recurring suggestion are the exceptions. The outbox sends with
  `invalidate: false` and refreshes once after a pass that synced something.
- **When the server wakes** (D19, `onServerAwake`), every query on a mounted screen refetches
  once.
- Retries are off and queries always run: `lib/api.ts` already answers offline from the saved
  copy and retries a waking server itself.

**To add a domain hook**

1. In `apps/mobile/lib/<domain>.ts`, export `useX = () => useApiQuery<X>("/x")`. Pass `null` as
   the path to wait (no id yet) and `{ enabled }` to skip the fetch.
2. Put every parameter in the path. Pass `keepPreviousWithin` only when the previous answer may
   stay on screen while a refinement loads (Activity keeps its rows across a search, not
   across a date range).
3. Export derived helpers as pure functions in the same file — `budgetTotals`,
   `monthTitle`, `isMonthClosed`. Keep the arithmetic out of the component so a
   screen only arranges values it is handed.

Talk to the API through `lib/api.ts` (`get`, `post`, `put`, `patch`, `del`), which
attaches the token and returns the unwrapped `data` (`getFetched` also returns `fetchedAt`). It also stamps every call with
an `X-Request-Id` and `X-App-Version`; a failure throws `ApiError` whose message
ends `· Ref <id>`, the same reference the server logs and Diagnostics lists. Status
`0` means no answer at all, which is not the same as a rejection.

Some data is held in a zustand store rather than a query because many screens read
it synchronously through selectors: `store/accounts`, `store/categories`, `store/notifications`,
`store/titleSuggestions`, `store/tripNames`. They are loaded when the session
becomes `authed` and reset on `guest` (see `app/_layout.tsx`). After a mutation
that moves a balance, reload the account store
(`useAccountStore.getState().load()`), as `lib/investments.ts` does.

## Offline behaviour

The app is designed to stay readable with no signal, and to hold on to a
transaction entered without it. Four pieces cooperate.

| Piece | File | What it does |
|---|---|---|
| Read cache | `lib/offlineCache.ts`, used by `lib/api.ts` | Every successful `GET` is written to a JSON file under `documentDirectory/offline-cache/`, keyed by a hash of the path. When a `GET` gets no answer at all, `api.ts` returns the cached copy as if the request had succeeded, so no hook needs offline handling of its own. A write with no answer throws `Couldn't reach the server, so check your connection and try again` (status 0). Cleared on sign-out. |
| Connectivity | `store/connectivity.ts` | `offline` flips from `lib/api.ts` itself: any answer, even a rejection, reports online; no answer reports offline. While offline it pings `/health` every 30 s and on returning to the foreground. |
| `OfflineBanner` | `components/shell/OfflineBanner.tsx` | "Offline · showing what was saved today at 10:52 am" / "yesterday at 9:15 pm" / "on 12 Nov": the age of **this screen's** data, from the `fetchedAt` the screen passes in `ScreenScaffold`'s `states` (D18 A). A screen that passes none keeps the 2.8.2 line, "Offline — showing data from 3:42 pm" (the last time the app was online). Drawn by `ScreenStrip` under every scaffold header. |
| Outbox | `store/outbox.ts`, `lib/outbox.ts`, `lib/outboxDrain.ts`, `lib/outboxPolicy.ts` | A new transaction captured offline is queued with its `clientId` and `Idempotency-Key` (the same value) and replayed FIFO on reconnect and on launch, sending the same key every time. What happens next is decided by the error's `code` (table below). An item queued by 2.6.0 has no key; it is given one, saved to the file, before its first send. The outbox file deliberately survives sign-out. |

| Answer | Outbox does |
|---|---|
| 2xx | Removes the item, counts it as synced |
| No answer, a gateway page, an empty or garbled body, `rate_limited`, `idempotency_in_progress`, any 5xx | Keeps it queued and stops; tries again after 2 s, 4 s, 8 s … up to five minutes, never before `Retry-After` |
| `invalid_input`, `invalid_json`, `invalid_reference`, `not_found`, `duplicate`, `conflict`, `idempotency_mismatch`, any other 4xx | Marks it `failed` with the message, without blocking the rest. Retry after `idempotency_mismatch` sends a new key |
| 401 | Stops, leaves the queue as it is |
| 409 with no `code` (an API older than 2.8.0) | Removes it: that API's only 409 here means the `clientId` is already saved |

**Every create and money-moving write sends an `Idempotency-Key`.** At submit a form calls
`keyFor(method, path, body)` on a key holder. The same request gets the same key across double
taps, re-taps after an error, and closing and reopening the sheet; a changed value or another
target gets a new one; `reset()` after a success. Sheets, and screens that reopen with the
same values, take the holder for their target, `holderFor(\`goal:${id}:contribute\`)` or
`holderFor("bill:new")`, which lasts the app run. A new entry on a full-screen form (Add
Transaction, Add Goal, trip import) starts blank, so it uses `useIdempotencyKey()`, one holder
per mount. Pass it as
`post(path, body, { idempotencyKey })`; the write helpers in `lib/` take the same options last.
`lib/formKeys.test.ts` fails when a form's write goes out without one.

**Server errors keep their parts.** `ApiError` has `status`, `code`, `issues`, `requestId`,
`retryAfterMs` and `reason` (the message without the Ref). `splitIssues(err, { amount: "amount" }, fallback)`
puts each issue on the form field it names and returns what's left for the form's own error line.
A 502/503/504 or HTML page reads "The server is starting up, so try again in a minute", and an
empty or unreadable body "Something went wrong, so try again in a moment". A 2xx that isn't JSON
(a Wi-Fi sign-in page) counts as no answer, never as saved.

### Server waking up

Render's free tier sleeps, and while it boots it answers 502/503/504 or an HTML gateway page
(D19 A). For a **read**, `lib/api.ts` treats that like no answer: it returns the saved copy,
sets `useServerWaking` to `waking: true`, and starts one retry loop that asks `/health` after
2, 4, 8, 15 and then every 30 s (`WAKE_RETRY_MS`). The first real answer clears the flag.

- `ServerWakingNotice` (`components/ui/ServerWakingStrip.tsx`) shows "The server is starting
  up · showing saved data" under the header on every `ScreenScaffold` screen while the flag is
  set, unless the offline banner has the strip slot. It has no button, because the app is already retrying, and it goes by itself.
- `ServerWakingAnnouncer`, mounted once in `app/_layout.tsx`, announces it to VoiceOver.
- `onServerAwake(listener)` fires when the flag clears. `lib/query/useApiQuery.ts` subscribes:
  every query on a mounted screen refetches once, so the saved copy is replaced without a tap.
- A read with no saved copy shows `ErrorState` with the waking message.
- **Writes and exports are unchanged.** They are never answered from the cache, so an export
  during a wake-up shows "The server is starting up, so try again in a minute · Ref …" in the
  sheet.

Two rules follow.

**A file the user asks for is not served from the cache.** Export sheets disable their
CTA while `offline` and say why ("Needs a connection"): a stale statement reads as
authoritative in a way a stale screen does not.

**A write that doesn't queue says so before the tap.** Only adding a transaction queues
offline (`store/outbox.ts` posts only to `/transactions`). Every other write's main button
uses `useOnlineGate` (`lib/onlineGate.ts`): while offline it is disabled and reads "Needs a
connection" with the `cloudOff` icon, and it comes back by itself when the app is online.
What the user typed stays in the sheet.

```tsx
const gate = useOnlineGate(`Add ${formatMoney(amount)}`);
<Button label={gate.label} icon={gate.icon ?? "plus"} disabled={!gate.allowed || !valid} onPress={save} />
```

### Delete and undo

**Every record delete is confirm, then a five-second "<name> deleted · Undo" toast** (2.8.7,
gaps rows 64, 65). Nothing is sent until the window ends, so a cascade (a trip with its
expenses, a holding with its payments, a trip expense with its shares) costs the same as one
row, and Undo never touches the API. Only **deleting your account** and **restoring a backup**
keep the hold confirm (`ConfirmSheet hold`), with no undo: they aren't records.

| Record | Confirm | Key |
|---|---|---|
| Transaction | inline confirm on the detail sheet | `transaction:<id>` |
| Goal (archives), bill, category (archives, with children), account (archives) | `ConfirmSheet` | `goal:`, `bill:`, `category:`, `account:` |
| Budget | `ConfirmSheet` "Remove the Groceries budget?" | `budget:<id>` |
| Trip expense | `ConfirmSheet` | `tripExpense:<id>` |
| Trip | `ConfirmSheet`, a tap | `trip:<id>` |
| Investment | `DeleteInvestmentSheet` (keep or undo the money moved), a tap | `investment:<id>` |
| Match Splitwise plan ("Back to exact amounts") | none, it is the reverse of Save | `plan:<tripId>` |

Every one goes through `deleteWithUndo` (`lib/undo.ts`) with a target from `deleteTarget`:

```ts
deleteWithUndo({
  ...deleteTarget.trip(trip._id),               // key + the DELETE, kept on disk for a replay
  label: trip.name,                              // "Couldn't delete Goa 2026 — it's back"
  message: deletedMessage(trip.name, [[14, "expense", "expenses"]]),
  reload: reloadAfterTripDelete,                 // stores beyond the screens' reads
});
```

Screens hide what is waiting with `useVisible(kind, items, idOf?)`; `useAccounts()` and
`useCategories()` already filter theirs, and a trip page reads `useTripWhilePending`. The key
is cleared only after the commit has reloaded the screens' reads and `reload`, so a row never
flashes back. A refused commit brings the row back with "Couldn't delete <label> — it's back".

The window lives in `store/pendingDeletes.ts`: module-level timers, so navigating away does
not cancel a delete; sign-out sends whatever is still waiting (`logOut()`). Each delete is
also written to `documentDirectory/pending-deletes/<userId>.json` with its request (an
investment's `?mode=keep` included); if the app is killed inside the window, the next authed
launch or reconnect sends it with the same `Idempotency-Key`. A 404 then means it landed.
Deletes written by 2.8.6 and older carry no request; their route comes from the key.

### Edit undo

A single-record edit toasts "Changes saved · Undo" through `editWithUndo({ path, previous,
saved, message, reload })`. Undo sends `previous` (the old value of every key the save sent)
with `If-Match: <saved.updatedAt>` and a fresh Idempotency-Key. The API refuses it with 409
`conflict` when anything wrote the record since: "This changed after you saved it, so it
wasn't undone". Offline at the tap, nothing is sent: "Couldn't undo — you're offline".

Gets Undo: transactions (not split), goals, bills, budget limits, categories, accounts (a
save that only sent the account PATCH), trips, trip expenses (every share is exact paise) and
a closed trip's close date. **No Undo** (plain toast): a split expense or its owed transfers
(rescaling back can land a paisa off), an account save that also corrected the balance or
re-based a holding (undoing would add a second adjustment), archive and unarchive, close and
reopen, Match Splitwise's Save, profile, password and settings.

## Add a screen

Wrap the screen in `ScreenScaffold`. It supplies the gradient ground, the glow,
safe-area insets, the header (`ScreenHeader`), one strip under the header (`ScreenStrip`:
offline, the D19 server notice, or "Couldn't refresh"), pull-to-refresh, and a scroll view
with the standard rhythm.

```tsx
const BudgetScreen = () => {
  const { items, loading, error, refetch } = useBudgets(month);

  return (
    <ScreenScaffold
      title={screenTitles.budget}
      back
      actions={[{ kind: "new", label: "New budget", onPress: openCreate }]}
    >
      {/* content */}
    </ScreenScaffold>
  );
};
```

| Prop | Use for |
|---|---|
| `title`, `subtitle` | The header title (one line; shrinks to 24 pt, then "…"). Take screen names from `screenTitles` in `data/menu.ts`, so the menu and the title match (D3 A). |
| `back` | `true` for the back chevron, `"close"` for a modal's ✕. Every non-tab screen has one. |
| `onBack` | Override leaving, e.g. to confirm discarding a form first. |
| `actions` | Header actions as data (`HeaderAction[]`), drawn as icon circles in a fixed order. See [ScreenHeader](design-system.md#screenheader). |
| `peek` | `false` hides the eye on a screen that shows no amounts. |
| `headerRight` | Controls not yet moved onto `actions`, drawn after them. |
| `header` | A completely custom header, replacing `ScreenHeader`. Only Home uses it. |
| `scroll` | Set `false` when the screen owns its own `FlatList`. |
| `scrollEnabled` | Turn off while a row is being dragged. |
| `states` | The screen's fetch state (`{ loading, refreshing, error, hasData, refetch, fetchedAt }`). Picks the strip under the header and turns `refetch` into pull-to-refresh. See [Handle loading, empty, and error states](#handle-loading-empty-and-error-states). |
| `onRefresh` | Pull-to-refresh, defaulting to `states.refetch`. The spinner runs until its promise settles. Home passes its own, which reloads every card. |
| `refreshing` | Only for a 2.8.2 screen that still holds its own pull state. |
| `floating` | Pinned above the content, such as a `Fab`. |

### Which header

One header for every screen. Pass `title`, `back` and `actions` to the scaffold and render
the same scaffold in every state (loading, error, loaded), so the header never jumps and an
action that needs the record (Edit, Export) is passed `disabled` until it has loaded. Don't
hand-build a header row: the old `<View style={styles.head}><BackButton/>…` copies are gone.

- Tabs (Home, Activity, Insights, More) have no back button. Home keeps its greeting row
  through `header`, and that row renders `<PeekButton />` itself.
- A screen titled with a name the user typed (a trip, a holding) also shows the full name in
  its top card, because the header may cut it.
- Label every action with the thing it acts on ("New bill", "Edit trip", "Export
  investments"), since the circle carries no text.

## Add a full-screen form

Forms that need a numeric keypad or a tall picker grid are full-screen modal
routes, not sheets. `app/add-transaction.tsx` and `app/add-goal.tsx` are the
two examples, and they share one layout:

1. A live identity preview at the top — the icon chip and the name as they will
   appear once saved.
2. An amount hero: a superscript `₹`, the grouped figure at `fontSize: 46`, and
   a glowing caret.
3. A scrollable middle section of fields.
4. A fixed custom numpad, so the OS keyboard never covers the amount.
5. A single CTA whose label states the outcome, including the amount.

Validation is react-hook-form plus `@hookform/resolvers/zod`. Note that mobile
form schemas import from `zod/v4`.

```tsx
const schema = z.object({
  name: z.string().trim().min(1, "Give the goal a name").max(60),
  amount: z.string().refine((v) => parseMoney(v) > 0, "Enter an amount"),
});
```

Keep the amount in form state as the **text the user typed** and convert with
`parseMoney` at submit. Storing paise mid-edit makes a half-typed decimal
impossible to represent.

**Note**
Where a value implies a consequence, say it. The Add Goal screen turns a target
and a deadline into a pace line — `₹8,334 a month for 6 months` — because that
is the number the decision actually rests on.

## Add a bottom sheet

Sheets live in `apps/mobile/components/sheets/` and are built on `AppSheet`,
which owns the backdrop, the handle, the glass background, keyboard handling,
and `stackBehavior="push"`.

The owner holds a ref and calls `present()`:

```tsx
const limitRef = useRef<BottomSheetModal>(null);
// …
<BudgetLimitSheet ref={limitRef} month={month} onChanged={refetch} />
```

`AppSheet` props:

| Prop | Use for |
|---|---|
| `onDismiss` | Fires once the sheet has finished leaving, however it was closed. Reset form state here. |
| `scrollable` | Wraps the body in a `BottomSheetScrollView`. Use when content can outgrow the screen (a category grid, the investments export options). The scroll offset is reset on every dismiss. |
| `snapPoints` | Fixed heights such as `["78%"]`, so a picker reads as nested over the form that opened it. Turns dynamic sizing off. |
| `footer` | A CTA pinned in its own opaque bar above the keyboard and the home indicator. The body pads itself by the measured height, so scrolled content passes cleanly behind it. Export sheets put their button here. |
| `scrollResetKey` | Change it to send the body back to the top when a sheet swaps its content in place. |

Three rules apply, and each exists because breaking it produced a real bug.

### Expose your own ref, not AppSheet's caller ref

A sheet that forwards its ref straight through cannot dismiss itself reliably.
Hold an inner ref, publish it, and dismiss through it:

```tsx
const innerRef = useRef<BottomSheetModal>(null);
useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
const dismiss = () => innerRef.current?.dismiss();

return <AppSheet ref={innerRef} onDismiss={reset}>{/* … */}</AppSheet>;
```

**Warning**
Do not use `useBottomSheetModal().dismiss()`. It targets the top of the
provider-wide queue, which — while a picker sits over the form that opened it —
is not reliably the sheet you meant. Every sheet in this directory now follows
the inner-ref idiom.

### Presenting is idempotent, and AppSheet enforces it

A sheet mounts on the next frame and then springs in, so for a moment after the
tap nothing on screen acknowledges it. Taps land again, and gorhom drops a
re-`present()` of a sheet its queue already holds — leaving that sheet
registered at a stale position it can surface from later, over whatever is on
top by then. `AppSheet` therefore ignores `present()` while the sheet is up and
for the length of its close animation (`CLOSING_GUARD_MS`, 350 ms).

You get this for free. Do not reach past `AppSheet` to the underlying
`BottomSheetModal`, which would bypass the guard.

### Never render a sheet inside a conditional branch

Render sheets from one unconditional position in the tree, below the content:

```tsx
const body = error ? <ErrorState … /> : loading ? <SkeletonState … /> : <Content … />;

return (
  <ScreenScaffold title="Budget">
    {body}
    <CategoryPickerSheet ref={pickerRef} … />
    <BudgetLimitSheet ref={limitRef} … />
  </ScreenScaffold>
);
```

If a sheet sits inside the `loading` or `error` branch, a refetch triggered from
that sheet unmounts it mid-interaction. Computing the body into a variable keeps
one stable tree across every state.

Also: inside a sheet, text fields must use
`InputComponent={BottomSheetTextInput}`. See
[Input](design-system.md#input).

### The shared sheets

Reach for these before writing a new confirm or export sheet.

| Sheet | Use for |
|---|---|
| `ConfirmSheet` | Any destructive or consequential confirm: `icon`, `title`, a `body` that says what will actually happen, `confirmLabel`, `tone` (`danger` default, or `primary`). `hold` swaps the tap for a 1.5 s `HoldButton`, reserved for what has no undo (deleting your account, restoring a backup). `onConfirm` is awaited and the sheet stays open on a rejection so the message can be read. |
| `OptionSheet` | A short list of numeric choices as chips (reminder lead, auto-lock timing); picking is the decision, so there is no save button. A choice too large for chips, such as the time zone, gets its own searchable sheet (`TimeZoneSheet`). |
| `ExportSheet` | Activity, Insights and Settings exports. See [Export a report](#export-a-report). |
| `InvestmentsExportSheet` | The Investments statement. See [Export a report](#export-a-report). |

A sheet normally forwards a `BottomSheetModal` ref through the inner-ref idiom
above. `InvestmentsExportSheet` is the exception: it publishes a two-method handle
(`InvestmentsExportHandle`, `{ present, dismiss }`) because opening it must also
reset its state and fetch fresh figures, and a bare `present()` could not do that.
Follow the idiom for ordinary sheets; use a handle only when presenting has work
to do.

## Export a report

Three reports can leave the app, and they share one frame.

| Report | Sheet | Builder | Formats |
|---|---|---|---|
| Transactions | `ExportSheet` (`kind="transactions"`, the default) | `exportTransactions` in `lib/export.ts` | CSV or PDF |
| Insights | `ExportSheet` with `kind="insights"` | `exportInsightsWindow` in `lib/insightsExport.ts` | PDF only |
| Investments | `InvestmentsExportSheet` | `exportInvestments` in `lib/investmentsExport.ts` | PDF with chosen sections, or the ledger as CSV |

**`ExportSheet`** serves Activity, Insights and Settings. It opens on the page's own
range and offset (`defaultRange`, `defaultOffset`), so the span exported is the span
being looked at. `kind="insights"` drops the **All** range, shows the CSV card as
unavailable (the value of that report is its charts, which a spreadsheet cannot hold),
and takes `insightsData` so the summary already on screen is reused when the picked
span is the one in view. An empty span is a warning in the sheet, not an error: the fix
is the chips directly above it.

**`InvestmentsExportSheet`** adds four things. A **Period** row of chips: `6M`, `1Y`,
`All time`, and one chip per **financial year** the history touches (`FY 2025–26`, April
to March; `availableFys`, `fyLabel` in `lib/investmentsReportMath.ts`). A **Start from**
segmented control of **presets** (`Full statement`, `Summary`, `Ledger`), which becomes
**Custom** once the toggles stop matching any preset. A list of **section** toggles,
grouped, from `SECTIONS[scope]`: the whole portfolio and a single holding offer
different sections. And a footer line, "6 of 8 sections · about 3 pages". It is opened
with `holdingId` from a holding's own page, and with none from the hub. Choosing CSV
hides the sections: a ledger is always the contents.

**The pieces**

| File | Owns |
|---|---|
| `lib/pdfShell.ts` | The shared frame. `pdfDocument({ section, rangeLabel, meta, body, css })` renders the letterhead ("Save n Spend · *section*"), the shared CSS and the footer. `kpiCard`, `kpiRow` and `htmlEscape` build the cards. A report supplies its own CSS through `css`, loaded after the shared rules. |
| `lib/export.ts` | Transactions, plus the delivery step every report uses: `deliver(format, baseName, content)` writes the CSV, or prints the HTML to a PDF, copies it to a friendly name, and opens the OS share sheet. Also `dayStamp` and `csvEscape`. |
| `lib/insightsExport.ts` | The Insights PDF: redraws the on-screen charts as inline SVG from the same `InsightsSummary` and `lib/insights.ts` helpers, so the report cannot fall behind the screen. |
| `lib/investmentsExport.ts` | `fetchInvestmentReport()` (one `GET /investments/report`, then scope and period are applied on the phone, so changing either needs no round trip) and `exportInvestments`. |
| `lib/investmentsReportMath.ts` | The UI-free choices behind the Investments sheet: sections, presets, periods and financial years, `slicePeriod`, `ledgerCsv`, `bestWorst`, `estimatePages`. Covered by tests. |

**Rules every report follows**

- Amounts use `formatMoneyExact`, never the masked default: a file the user asked for
  must not contain `₹ ••••`.
- Days and months are read in the user's zone (`appZone()`), not the device's.
- The builder returns `{ shared: false, count: 0 }` when there is nothing to export, and
  the sheet says so rather than sharing an empty file.
- The CTA is disabled and relabelled **Needs a connection** while offline.
- On success the sheet dismisses and a toast says what was exported and as what.

### Add a fourth report

1. **Builder.** Create `lib/<thing>Export.ts`. Fetch (or accept) the data, build the body
   as HTML, and call `pdfDocument({ section: "<Thing>", rangeLabel, meta, body, css })`.
   Put anything that is a choice rather than a layout (sections, periods, labels) in a
   UI-free `lib/<thing>ReportMath.ts` with a `.test.ts` beside it. Hand the finished
   string to `deliver("pdf", baseName, html)`. For a CSV, build the text with `csvEscape`
   and a BOM, as `lib/export.ts` does.
2. **Entry point.** Return an `ExportResult` (`{ shared, count }`) so the sheet can tell
   "nothing in range" from success.
3. **Sheet.** If it is another window over transactions or insights, extend
   `ExportSheet`'s `kind`. If it has its own options, copy `InvestmentsExportSheet`:
   `AppSheet` with `scrollable` and a `footer` CTA, the `useConnectivity` offline guard,
   `FormatCards` for the format, and `Chip` rows for the choices.
4. **Entry button.** Add an export action to the screen header, disabled when there is no
   data, as Insights and Investments do.

## Investments screens

Two screens, `investments` (the hub) and `investment-detail` (one holding), share the same
two-tab body.

- **The Overview | Trends switch** is a `SegmentedControl size="sm"` with
  `InvestTab = "overview" | "trends"`. It is only shown once the trend payload has at least one
  point. The screen owns the `tab` state.
- **Overview** is the screen's own content: totals, allocation donut, this-month card,
  strongest holding, holdings grouped by kind, SIPs, and the **Update values** and
  **Invest** buttons. On a holding's page it is the value, the cost basis and that holding's
  history.
- **Trends** is `TrendsView` (`components/investments/TrendsView.tsx`), fed by
  `useInvestmentTrend()` (`GET /investments/trend`).

`TrendsView` props: `trend`, `initialScope` (`ALL_SCOPE`, or a holding id) and `locked`.

| Part | Behaviour |
|---|---|
| Scope chips | A horizontal `Chip` strip: **All**, then one chip per holding. Picking one re-scopes the charts in place. |
| Locked mode | Passed by `investment-detail` as `initialScope={id} locked`. The strip stays visible but only that holding is live (the rest are dimmed and disabled), so the screen's title and the figures under it cannot disagree. |
| Range | `6M`, `1Y`, `All time` in a `SegmentedControl size="sm"` (D5 A). Default `1Y`. It cuts the series with `lastN`. |
| Stat tiles | A `StatRow` of Profit so far, Best month, Worst month, exact to the paisa. Best and worst consider only months that had a value update. The row goes two across once a figure reaches ₹10,00,000.00. |
| Charts | `ValueHistoryChart` (value over money invested) and `ProfitChart` (profit line over monthly change bars). |

The hub screen header carries **Export** (shown once there is a holding) and **New**; the
holding's header carries **Export** and **Edit**. Both open `InvestmentsExportSheet`
(see [Export a report](#export-a-report)); the holding's passes `holdingId`.

## Charts

Charts are `react-native-svg`, in `components/charts/`. They hold no data; the screen hands
them arrays.

| Chart | Used for |
|---|---|
| `AreaChart` | Single-series trend. |
| `DualLineChart` | The period in focus against the previous one, with an optional dashed projection to period end. |
| `PairedColumns` | Income against expense per unit. |
| `DonutChart` | Category and allocation shares. |
| `CompareBars`, `ForecastLine`, `Sparkline` | This period against a faint previous bar, a forward-looking line with a zero baseline, and a no-axis line under an amount. |
| `SpendHeatmap`, `WeekdayHeatmap`, `HourlyRhythm`, `CashFlowMonthGrid` | Calendars and rhythms. |
| `InvestmentCharts` | `ValueHistoryChart` and `ProfitChart`, plus `lastN`. |

### Scrubbing and the tooltip

A chart you can read a value from follows one interaction contract, the same on Insights
and Investments:

1. **Touch or drag.** The chart owns a touch layer: a tap picks the nearest slot, and
   dragging scrubs across slots.
2. **A tick per slot.** The layer reports through `useScrubTick(active, onScrub)`
   (`lib/useScrubTick.ts`), which fires `haptics.select()` only when the index changes, so
   a drag feels like a picker rolling and not one continuous buzz. Closing a tooltip never
   ticks.
3. **A floating tooltip**, clamped to the plot, beside the touched point, with a dashed
   cursor line and a larger dot on the selected point.
4. **It persists after release.** Lifting the finger leaves the tooltip open.
5. **The screen owns it.** A chart takes `activeIndex` and `onScrub` (controlled), and the
   screen keeps a single `tip` state, so **only one tooltip is open at a time**. On Insights
   that is `{ chart, i }`; `TrendsView` does the same for its two charts.
6. **An outside tap clears it.** Wrap the page in a plain `Pressable` whose `onPress`
   clears the tip (not `PressableScale`: a squeeze and a tick over the whole page would fire
   on every stray tap). `TrendsView` also clears it when the scope or range changes.

```tsx
const [tip, setTip] = useState<{ chart: "value" | "profit"; i: number } | null>(null);

<Pressable onPress={() => setTip(null)}>
  <ValueHistoryChart
    points={points}
    activeIndex={tip?.chart === "value" ? tip.i : null}
    onScrub={(i) => setTip(i === null ? null : { chart: "value", i })}
  />
</Pressable>
```

With no tooltip open, the readout above an investments chart shows the latest month. A
month with no value update is not flagged: its gain is carried forward and it looks like
any other month, and the profit chart simply draws no change bar for it. There are no
"not updated" warnings on a chart.

For colours, the tooltip, the legend and axis tags, see [Chart conventions](design-system.md#chart-conventions).
Every chart draws its bubble with `ChartTooltip` and its key with `ChartLegend`, and carries a
one-sentence VoiceOver summary (`chartSummary`). Charts that print amounts honour privacy mode:
they call `usePrivacyMask()` and print `₹ ••••` for axis ticks, tags and tooltip figures while
masked; the summary says "Amounts hidden".

## Add a period selector

Screens that window over time — Insights, Activity, Budget — all use the same
three pieces: a signed offset in state, `PeriodNav`, and a label from
`lib/dateRange.ts`.

```tsx
// 0 = this month, negative = past, never positive — there is nothing to show
// in a month yet to happen.
const [offset, setOffset] = useState(0);
const month = monthKey(offset);

<PeriodNav
  label={rangeNavLabel("month", offset)}
  canNext={offset < 0}
  onPrev={() => setOffset((o) => o - 1)}
  onNext={() => setOffset((o) => Math.min(0, o + 1))}
/>
```

Pass the derived key to the domain hook (`useBudgets(month)`) so stepping
refetches. See [Period windowing](architecture.md#period-windowing) for why the
offset is never positive and why the math is in UTC.

**Note**
Distinguish a live period from a closed one in the copy, not just the data. The
Budget screen writes the remainder as "unspent" instead of "left" and swaps **Days left**
and **Daily limit** for **Days** and **A day** once the month has ended, because a
pace target is meaningless for a month that is already over.

## Read totals under the trips rule

From 2.8.6 every read that sums spending sends `trips=entries`: `lib/dashboard.ts`
(summary and dashboard insights), `lib/health.ts`, `lib/insights.ts`, `lib/insightsExport.ts`,
`lib/reviews.ts`, `lib/highlights.ts`, `lib/transactionQuery.ts` (Activity's list and card),
`lib/transactions.ts` (Home's Recent), `lib/export.ts` and `lib/localNotifications.ts`. The
server then counts each closed trip once, as an expense in the built-in category Trips on its
close day, so the phone adds and subtracts nothing: show the server's figure. A new read that
sums spending sends the parameter too.

- **Trips is a category.** It ranks among the categories by size with its own share
  (`lib/everydaySpend.ts` `categoryShares`, `reviewRows`), in the fixed `tripsColor` teal
  (`theme/charts.ts`), outside the ranked palette. Its row expands in place to the trips
  (`components/data/TripsList.tsx`); a trip opens `trip-detail`. Test it with `isTrips(id)`
  (`TRIPS_CATEGORY_ID` from the types package).
- **Trip rows** in a list have `kind: "trip"`; `TransactionRow` draws them as one entry with
  the trip's emoji and close day and opens the trip page. They have no account, so never
  look one up for them.
- **Counts** use `entryCount ?? txnCount` (one trip = one transaction).
- **Close day.** `components/sheets/CloseDateSheet.tsx` picks it for closing (wrap-up) and for
  changing it (trip page); the range and default live in `lib/tripClose.ts`.
- **Open trips** count nowhere; Home shows each as an `OpenTripCard` with its running share.
- Don't add a "Plus ₹X on trips" line or a "with trips" label: every total already includes
  Trips.

## Show an amount

Money is integer paise everywhere, and every screen has a privacy mode to honour.
Which helper to reach for depends on whether the amount can be tapped.

| Use | When |
|---|---|
| `<Money value={paise} />` | Default. An amount rendered on a screen. |
| `formatMoney(paise)` (default export of `lib/money.ts`) | The amount is going somewhere that can't be a component — a `sub` string, a toast, a sheet body. Masks. |
| `formatMoneyExact(paise)` | Never on screen. Files the user explicitly asked us to generate — see `lib/export.ts`. |
| `formatBalance(balance, type)`, `formatRemaining(remaining)` | A balance or a budget's remainder in words instead of a negative (D11 A): "₹12,000.00 owed", "₹3,000.00 overdrawn", "₹500.00 over". Masks. |
| `formatPct`, `formatPoints`, `formatCompact`, `formatInstant`, `formatCalendar`, `count` (`lib/format/`) | Every other figure and date. See [Formatting rules](design-system.md#formatting-rules). |
| `usePrivacyMask()` | A screen that composes amounts with `formatMoney` must call this once, to subscribe: without it a peek won't re-render the strings it computed. |
| `MASKED_MONEY` (`lib/money.ts`) | The fixed-width mask, `₹ ••••`, used for every masked amount, compact chart ticks included. Fixed so the mask cannot leak the magnitude. |

`Money` takes `value` (integer paise), `sign` (`auto` writes "−" only for a negative,
`always` also writes "+", `none` writes neither; the sign is kept while masked because a
direction says nothing about a magnitude), `weight`, `size`, `color`, `numberOfLines` and
`align`. `prefix` still exists for screens that haven't moved to `sign`. A peek, started by
tapping any masked figure or the eye in the header, un-masks everything for `PEEK_MS` (ten
seconds, `store/settings.ts`) and `PeekBar` shows a draining line and a way to hide again.

**Prefer `Money` to `formatMoney`.** With privacy mode off it is exactly
`<AppText>{formatMoney(v)}</AppText>`. With it on, the masked figure becomes its own
tap target that reveals **every** amount in the app for ten seconds. Revealing one
figure at a time would mean tapping across a screen to add two numbers up, which is
the opposite of a privacy feature anyone leaves switched on.

It is `Pressable` only *while masked*, so a transaction row's amount reveals on the
first tap and passes subsequent taps through to the row. Pass `align="right"` in a
right-aligned row: the dots are narrower than most figures, and the tap target has to
sit where the figure does.

**A component that takes a pre-formatted string cannot be masked.** `SummaryCard` used
to take `amount: string` and was handed `formatMoney(...)` by its callers — which
worked, but meant its figures could never become tappable. It takes `amount: number`
now and renders `Money` itself. If you are about to give a component a formatted
string, take the paise instead.

**The eye lives in the header.** `components/shell/PeekButton.tsx` renders nothing at
all while privacy mode is off, which is what lets `ScreenHeader` include it on every screen
unconditionally. A screen that hides figures without offering the way to reveal them is a
dead end. **Home's custom `header` includes `<PeekButton />` itself; any other custom header
would have to as well.**

## Days and months: zone helpers

The API buckets every total in the account's stored IANA zone, and the phone must agree
with it. `lib/zone.ts` is how.

| Helper | Use for |
|---|---|
| `appZone()` | The zone to interpret dates in: the account preference, else the device's. Imperative, for pure helpers that cannot hold a hook. |
| `useAppZone()` | The same, as a hook. A screen that must re-render when Settings changes the zone calls this. |
| `calendarToday(zone)` | Today's calendar date where the user is. Every range (`lib/dateRange.ts`) hangs off it. |
| `dayKey(instant, zone)`, `monthKeyOf(instant, zone)` | `YYYY-MM-DD` and `YYYY-MM` for the day or month an instant falls in. |
| `zonedParts(instant, zone)` | Year, month (1-12), day, hour, minute on a clock in that zone. |
| `startOfCalendarDay(calendar, zone)`, `instantInZone(...)` | A picked day back into the real instant to store. |
| `calendarFromKey(key)`, `calendarDaysBetween(a, b)` | A key from the API back into a calendar date, and whole days between two. |

Two kinds of value look alike and must not be mixed up. An **instant** is a real moment, what
the API stores and sends. A **calendar date** is also a `Date`, but only its UTC fields mean
anything: `getUTCDate()` and `Date.UTC` arithmetic on it are exact, and its `getTime()` is not a
moment. `calendarDate()` is the only crossing from one to the other. Never use
`new Date().getUTCDate()` for "today": in India it is already tomorrow after 6:30 pm.

Exports, labels and range helpers all read the zone this way. `exportTransactions` stamps
files with `dayStamp`, which reads `appZone()`, so a September statement is not stamped
31 August because the phone was abroad.

## Toasts and haptics

**Toasts** (`store/toast.ts`) are the app's one channel for "that happened". A store, not a
hook, so a plain async helper in `lib/` can report an outcome.

| Call | Use for |
|---|---|
| `toast.success(msg)` | It saved or finished. |
| `toast.error(msg)` / `toast.fromError(err, fallback)` | It failed. `fromError` turns a caught value into the message. |
| `toast.warning(msg)` | It worked, but read this: over budget, nothing in range. |
| `toast.info(msg)` | A neutral note. |
| `toast.action(tone, msg, { label, onPress })` | One thing to do about it: the Undo on a delete. Shown for five seconds rather than 2.8. |

One toast at a time; a new one replaces the old. Each tone fires its own haptic, so a toast and
its buzz cannot disagree. `Toast` is mounted outside `BottomSheetModalProvider` so a failed save
is readable while a sheet is up. The export and confirm sheets report a failure inline instead, because the fix is
right there in the sheet.

**Haptics** (`lib/haptics.ts`) are named by meaning, never intensity: `tap` (a press), `select`
(moving through a set: chips, tabs, a chart scrub), `toggle` and `press` (a switch, a primary
action), `heavy` (something irreversible finished), and `success`, `warning`, `error`. Calls are
fire-and-forget and swallow failure. `PressableScale` ticks for you on press; pass
`haptic={false}` where the action fires its own, as `FormatCards` does.

## Handle loading, empty, and error states

From 2.8.3 a data screen hands its fetch state to two pieces and draws nothing else for
loading or failure (U5, mockup 05, D15 A):

- `ScreenScaffold states={...}` draws the strip under the header and owns pull-to-refresh.
- `<ScreenStates state={...}>` draws the body: skeleton, full error, not found, or your content.

```tsx
const budgets = useBudgets(month); // { data, loading, refreshing, error, refetch, fetchedAt }
const state = { ...budgets, hasData: !!budgets.data };

return (
  <ScreenScaffold title={screenTitles.budget} back actions={actions} states={state}>
    <ScreenStates state={state} skeleton={<ListSkeleton rows={3} height={96} />}>
      {() => (budgets.data!.length ? <BudgetList items={budgets.data!} /> : <EmptyState ... />)}
    </ScreenStates>
    {/* Sheets beside ScreenStates, never inside: a state change must not unmount an open sheet. */}
    <BudgetLimitSheet ref={limitRef} onSaved={budgets.refetch} />
  </ScreenScaffold>
);
```

What the screen shows (`lib/screenStates.ts`, tested in `lib/screenStates.test.ts`):

| State | Body (`screenView`) | Strip (`stripFor`) |
|---|---|---|
| No answer yet | Skeleton | none (or offline / waking) |
| Failed, nothing saved | `ErrorState` with the message and Try again | none: the error screen says it |
| Data on screen, refresh failed | The data, unchanged | "Couldn't refresh · Try again", until the next success |
| Data on screen, refreshing | The data; never the skeleton again | none |
| `notFound` (a 404, or no id) | `NotFoundState`: "This trip isn't here any more" + Go back | as above |

- **One strip at a time:** offline, then "The server is starting up", then "Couldn't
  refresh", because each one explains the next. A screen that passes no `states` gets only
  the first two, as in 2.8.2.
- **`hasData` means an answer is on hand,** live or saved, even an empty list. Empty is your
  content's job (`EmptyState`), so Accounts says "No accounts yet" only once the answer is in.
- **Several fetches on one screen:** `mergeScreenStates(a, b)` has data when every part has,
  the first error, the oldest `fetchedAt`, and a `refetch` that runs them all.
- **`thing`** names the record for the not-found copy: `thing="trip"`, `thing="goal"`.
- **Activity's own list:** pass `refreshControl={useScreenRefresh(refetch)}` to the
  `FlatList` and `scroll={false}` plus `states` to the scaffold. Same spinner, same tint.

**Home cards (D16 A).** Wrap each card in `HomeCard`. While loading it draws nothing, as
before. Loaded, it draws the card (or nothing when `empty`). Failed before it ever loaded, it
keeps its place: the card's caption, "Couldn't load this · Try again" inside, at the height it
last had in this app run, else `skeletonHeight`. If the month summary itself fails, Home shows
the full `ErrorState`.

```tsx
<HomeCard title="Budgets at a glance" state={{ ...budgets, hasData: !!budgets.data }} empty={!budgets.data?.length} skeletonHeight={120}>
  <BudgetsAtAGlanceCard items={budgets.data ?? []} />
</HomeCard>
```

Give `EmptyState` a CTA only when the user can act on it. Activity shows
*"Add transaction"* when nothing has ever been recorded, and drops it when a
**search** came back empty — the fix there is a different query, not a new entry.
An empty state should reflect the situation: on a closed month, Budget says
*"Nothing budgeted in July 2026"* rather than *"No budgets yet"*.

The 2.8.2 screens not yet moved onto these still use the older rule: `ErrorState` when
`error` is set, `SkeletonState` rows while `loading && items.length === 0`, then content.

### Clear the data when the period changes

`loading && items.length === 0` is right for a refetch of the *same* question. It is
wrong when the question itself changed.

Stepping the Budget month back, or switching Activity from This Week to This Month,
changes the heading immediately and the rows a network round-trip later. In between,
the screen shows last month's limits under this month's heading — and the figures are
plausible enough that nothing looks wrong. That is worse than a skeleton: a skeleton
says "not yet", stale data makes a claim.

So a screen whose data is scoped to a period clears it when the period changes, in a
second effect beside the fetch:

```ts
useEffect(() => {
  setItems([]);
  setLoading(true);
}, [month]);          // or a range key, per the table below
```

| Hook | Clears on | Not on |
|---|---|---|
| `useBudgets` (`lib/budgets.ts`) | `month` | — |
| `useTransactionFeed` (`lib/transactions.ts`) | `startDate`/`endDate` | `category`, `search` |
| `useTransactionSummary` (`lib/transactions.ts`) | the whole filter key | — |
| `useInsights` (`lib/insights.ts`) | the window | — |

`useTransactionFeed` clears on the **range only**, deliberately. Category and search
are refinements the user can see they just made, from the chips and the field they are
typing in, and clearing on every debounced keystroke would strobe the whole list.

**A server-computed total needs its own treatment.** Activity's summary card is
computed for the range by the API, so clearing the feed does not help it — it would
keep printing last week's money beside a label reading "This Month". `SummaryCard`
takes a `pending` prop and renders **a dash** in the space the figure will occupy.
Showing `₹0` would have been a different falsehood, and a dash reflows nothing when
the real number lands.

## First run

A new account is not short of data by accident — it is short of data because the
user has not done anything yet, and the app's job on that first launch is to say
what to do rather than to render zeroes.

**The welcome tour** — [`app/(auth)/welcome.tsx`](../apps/mobile/app/(auth)/welcome.tsx),
four paged slides, shown once between *Create account* and *Login*.

It sits in `(auth)` on purpose. The root gate in
[`app/_layout.tsx`](../apps/mobile/app/_layout.tsx) sends any guest outside
`(auth)` to Login and any authed user inside it to `(tabs)`, so a welcome route
at the root would be bounced before it painted — and the same rule means the tour
**cannot be reopened once signed in**. That is why the getting-started answer in
Help exists.

Placing it after registration also means it needs no stored "seen" flag.
Registration does not open a session, so there is no first-authed-launch to hang
a tour off; a flag would either miss a reinstall or fire for every existing user
after an update. The event happens once per account, so triggering on the event
is free and cannot drift.

**The Get started checklist** — [`components/data/GetStartedCard.tsx`](../apps/mobile/components/data/GetStartedCard.tsx),
on the Dashboard, five steps, retires itself when they are all done.

Every tick is **derived** from data the screen already loads
([`lib/onboarding.ts`](../apps/mobile/lib/onboarding.ts)), never stored. A
persisted "step 3 done" flag can disagree with reality — delete your only budget
and it would still congratulate you — does not survive a reinstall, and needs a
migration the first time the list changes. Derivation is self-correcting: undo
the thing and the tick comes back off.

Two details in there are worth not re-learning:

- **"Has an account" would tick itself.** Registration creates a "Cash" account
  at zero for everybody ([`authController.ts`](../apps/api/src/controllers/authController.ts)),
  so the step tests for an account the user *added* — a second unarchived one, or a
  non-zero opening balance. It asks for a new account rather than for a balance on
  the seeded one because `updateAccountSchema` is `.strict()` with no
  `startingBalance`: that field is settable only at creation, so the obvious copy
  ("set your opening balance") would send the user to a screen where the control
  does not exist.
- **The card must not flash for an established user.** Every list hook starts at
  `loading: true` with an empty array, which for one frame is indistinguishable
  from a brand-new account. Latch a `listsReady` state once they have all settled.
  Since 2.8.3 `loading` is true only on the first load (a later one sets `refreshing`), so a
  refocus no longer turns it back on.

Dismissal is the one piece of stored onboarding state, in
`store/settings`'s `getStartedDismissed` — a list of user ids rather than a
boolean, because the flag is device-local but the checklist is per-account, and
the person who would lose theirs is the new user who needs it.

## Refetch on focus

`useApiQuery` refetches stale data when its screen regains focus, so returning from a modal
route picks up what changed there; a write there has already marked it stale. Screens still
have their own `useFocusEffect(() => refetch())` from before 2.8.3; those calls follow the
same 30 s rule and send nothing extra. Don't add new ones.

## Tests

`npm test` in `apps/mobile` runs `node --test` over `lib/*.test.ts`, executed by the **API's**
`ts-node` (the script `cd`s into `../api`). So a test must be pure TypeScript: import only
modules that do not pull in React Native, Expo or the `@/` alias. That is why logic such as
`investmentsReportMath.ts` is kept free of UI.

| File | Covers |
|---|---|
| `lib/accountOrder.test.ts` | `mergeSectionOrder`: a dragged section's order lands in place, hidden rows are still sent. |
| `lib/safeToSpend.test.ts` | `billsAgainstBudgets`: which bills count against which budgets, SIPs excluded, zone-correct months. |
| `lib/investmentsReportMath.test.ts` | Financial years, periods, sections and presets, the ledger CSV and best/worst month. |
| `lib/fetchLayer.test.ts` | The fetch layer: a late answer for an old period never shows under a new one, one request on open, refocus refetches only after 30 s, a pull joins a running load, a long list refreshes page one only, which writes refresh which reads, refetch once on server wake, the cache emptied when the account changes. |
| `lib/apiError.test.ts` | Error parsing: the envelope, older bodies without a code, gateway pages, empty bodies, Retry-After, success bodies, `splitIssues`. |
| `lib/outboxPolicy.test.ts` | The outbox's decision for every error code. |
| `lib/outboxDrain.test.ts` | Draining: 2.6.0 items get one stored key, keys survive retries and restarts, refusals don't block the queue. |
| `lib/idempotency.test.ts` | Key reuse across retries, replacement on a changed value or `reset()`. |
| `lib/formKeys.test.ts` | Every create and money-moving write in `app/` and `components/` passes a key. |
| `lib/pendingDeleteReplay.test.ts` | Deletes left on disk: key → route, replay with the delete's own key, 404 as done, kept when unreachable, refusals reported, follow-ups only after the DELETE. |
| `lib/screenStates.test.ts` | Which body and which one strip a screen shows for every fetch state; Home card states; merged states. |
| `lib/offlineBanner.test.ts` | The offline banner's age: today, yesterday, older, another year, across midnight in two zones, and the 2.8.2 fallback. |
| `lib/onlineGate.test.ts` | "Needs a connection" while offline; the button's own label online. |

Add a test beside the module as `lib/<name>.test.ts` using `node:test` and `node:assert/strict`.

## Run the app in development

Notes that have each cost time.

- **Start Metro with `npm start -- --localhost`.** The API binds `127.0.0.1` outside
  production, and the app derives the API host from Metro's. A plain `npm start` serves
  from the Mac's LAN address, which a loopback-only API refuses, so a simulator pointed at
  it cannot reach the API. See [SHIPPING](SHIPPING.md#2-day-to-day-feature-loop).
- **Metro needs Node 24.** Expo 54's bundler uses `Array.prototype.toReversed`. If the shell
  resolves an older Node: `mise exec node@24.20.0 -- npm start -- --localhost`.
- **Pick an installed simulator runtime.** The iOS 27.0 simulator runtime is not always
  installed. If `i` in Metro cannot boot a device, boot one from an iOS 26.5 runtime instead
  (`xcrun simctl list devices available`, then `xcrun simctl boot <udid>`, then press `i`).
- **Seed accounts** are in [SHIPPING](SHIPPING.md#2-day-to-day-feature-loop).
