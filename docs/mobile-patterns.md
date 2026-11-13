# Mobile patterns

This document covers the conventions the mobile app already follows. Follow them
when you add to it: a screen that matches its neighbours is easier to review than
one that is merely correct.

For tokens and components, see [Design system](design-system.md).

## Topics

- [Navigation structure](#navigation-structure)
- [Fetch data with a domain hook](#fetch-data-with-a-domain-hook)
- [Offline behaviour](#offline-behaviour)
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
| Settings and support | `settings`, `help`, `privacy-policy`, `diagnostics` (unlocked in Settings by tapping Version seven times), `crash-test` (reached from Diagnostics) |

`investments` also accepts `?revalue=1`, which opens the revalue sheet on arrival;
`investment-detail` accepts `?edit=1` to open the editor. Both are how a
notification or a nudge deep-links in (`routeFor` in `lib/notifications.ts`).

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

There is no data-fetching library in use. `app/_layout.tsx` still mounts a
TanStack `QueryClientProvider` (`lib/queryClient.ts`), but no screen calls
`useQuery`; every domain owns a file in `apps/mobile/lib/` that exports a hook
plus the pure helpers that derive from its data. `lib/budgets.ts` is the
reference implementation.

The list-shaped hook contract is:

```ts
const { items, loading, error, refetch } = useBudgets(month);
```

A hook that fetches one document returns `data` instead of `items`:
`useInsights`, `useInvestments`, `useInvestmentTrend`, `useTrips`, `useTrip`. The
rest of the contract (`loading`, `error`, `refetch`) is identical. `lib/trips.ts`
has a small private `useFetch<T>(path)` that is the shortest example of it.

**To add a domain hook**

1. Create `apps/mobile/lib/<domain>.ts`.
2. Hold `items` (or `data`), `loading`, and `error` in `useState`.
3. Wrap the fetch in a `useCallback` named `refetch`, keyed on the parameters
   that should trigger a refetch.
4. Guard on the session before fetching, so a signed-out render does not fire a
   request that will only 401:

   ```ts
   if (useSession.getState().status !== "authed") return;
   ```

5. Run it from a `useEffect` keyed on `[status, refetch]`.
6. Export derived helpers as pure functions in the same file — `budgetTotals`,
   `monthTitle`, `isMonthClosed`. Keep the arithmetic out of the component so a
   screen only arranges values it is handed.

Talk to the API through `lib/api.ts` (`get`, `post`, `put`, `patch`, `del`), which
attaches the token and returns the unwrapped `data`. It also stamps every call with
an `X-Request-Id` and `X-App-Version`; a failure throws `ApiError` whose message
ends `· Ref <id>`, the same reference the server logs and Diagnostics lists. Status
`0` means no answer at all, which is not the same as a rejection.

Some data is held in a zustand store rather than a hook because many screens read
it: `store/accounts`, `store/categories`, `store/notifications`,
`store/titleSuggestions`, `store/tripNames`. They are loaded when the session
becomes `authed` and reset on `guest` (see `app/_layout.tsx`). After a mutation
that moves a balance, reload the account store
(`useAccountStore.getState().load()`), as `lib/investments.ts` does.

## Offline behaviour

The app is designed to stay readable with no signal, and to hold on to a
transaction entered without it. Four pieces cooperate.

| Piece | File | What it does |
|---|---|---|
| Read cache | `lib/offlineCache.ts`, used by `lib/api.ts` | Every successful `GET` is written to a JSON file under `documentDirectory/offline-cache/`, keyed by a hash of the path. When a `GET` gets no answer at all, `api.ts` returns the cached copy as if the request had succeeded, so no hook needs offline handling of its own. A write with no answer throws `You're offline — check your connection`. Cleared on sign-out. |
| Connectivity | `store/connectivity.ts` | `offline` flips from `lib/api.ts` itself: any answer, even a rejection, reports online; no answer reports offline. While offline it pings `/health` every 30 s and on returning to the foreground. |
| `OfflineBanner` | `components/shell/OfflineBanner.tsx` | "Offline — showing data from 3:42 pm". Mounted once inside `ScreenScaffold`, so every scaffold screen has it. |
| Outbox | `store/outbox.ts`, `lib/outbox.ts` | A new transaction captured offline is queued with a `clientId` and replayed FIFO on reconnect and on launch. The server dedupes on `clientId`, so a `409` counts as synced. A validation failure marks the item `failed` and surfaces it, without blocking the rest. The outbox file deliberately survives sign-out. |

Two rules follow.

**A file the user asks for is not served from the cache.** Export sheets disable their
CTA while `offline` and say why ("Needs a connection"): a stale statement reads as
authoritative in a way a stale screen does not.

**Deletes are undoable, and are not queued.** `store/pendingDeletes.ts` defers a
destructive call for five seconds. The row disappears at once (screens filter their
items against `usePendingDeletes((s) => s.keys)`), an `info` toast with an **Undo**
action is shown, and only after the window does the real call run. Undo calls
`pendingDeletes.cancel(key)` and the API is never touched. The timers are module-level,
so navigating away does not cancel a delete; a failed commit restores the row with an
error toast; and sign-out flushes any pending deletes so a confirmed delete is not
reverted. Bills, goals, categories, accounts and transactions use it.

```ts
pendingDeletes.schedule(key, name, () => deleteBill(id));
toast.action("info", `${name} deleted`, { label: "Undo", onPress: () => pendingDeletes.cancel(key) });
```

Not every delete is deferred: deleting an investment goes through
`DeleteInvestmentSheet` and calls the API directly, because it needs a chosen mode.

## Add a screen

Wrap the screen in `ScreenScaffold`. It supplies the gradient ground, the glow,
safe-area insets, the title row, the `OfflineBanner`, and a scroll view with the
standard rhythm.

```tsx
const BudgetScreen = () => {
  const { items, loading, error, refetch } = useBudgets(month);

  return (
    <ScreenScaffold title="Budget" headerRight={headerRight}>
      {/* content */}
    </ScreenScaffold>
  );
};
```

| Prop | Use for |
|---|---|
| `title`, `subtitle` | The standard title block. `PeekButton` is added to it for you. |
| `headerRight` | A trailing header action, usually a `pill` `Button`. |
| `header` | A completely custom header, replacing the title block. |
| `scroll` | Set `false` when the screen owns its own `FlatList`. |
| `scrollEnabled` | Turn off while a row is being dragged. |
| `onRefresh`, `refreshing` | Pull-to-refresh on the scaffold's own scroll view. |
| `floating` | Pinned above the content, such as a `Fab`. |

### Which header

Both shapes are in use, and which one a screen takes follows a rule:

- **`title` (and `headerRight`)** for the tab screens and for the hub screens
  opened from More that have no back chevron of their own: Home, Activity,
  Insights, More, Budget, Bills, Goals. The eye (`PeekButton`) comes with it.
- **A hand-built `header`** for every screen that needs a way back or a custom
  action row: Investments, Investment detail, Trips, Trip detail, Cash flow,
  Settings, Review, Manage accounts and categories, and so on. The shape is one
  row: `<BackButton />` (or `<BackButton variant="close" />` on a modal), the
  title as `<AppText size="xl" weight="black" numberOfLines={1}>` with `flex: 1`,
  then the actions, each a `PressableScale` with `hitSlop` and an
  `accessibilityLabel`.

```tsx
const header = (
  <View style={styles.head}>
    <BackButton />
    <AppText size="xl" weight="black" numberOfLines={1} style={styles.headTitle}>Investments</AppText>
    {/* trailing icon buttons */}
  </View>
);
return <ScreenScaffold header={header}>{/* … */}</ScreenScaffold>;
```

**Warning**
A custom `header` replaces the title row, and the title row is where the scaffold
puts `PeekButton`. A screen that shows amounts and passes its own `header` must
render `<PeekButton />` itself; of the hand-built headers, only `assistant`,
`category-insights`, `health` and `manage-accounts` do so today.

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
| `ConfirmSheet` | Any destructive or consequential confirm: `icon`, `title`, a `body` that says what will actually happen, `confirmLabel`, `tone` (`danger` default, or `primary`). `hold` swaps the tap for a 1.5 s `HoldButton`, reserved for what cannot be undone. `onConfirm` is awaited and the sheet stays open on a rejection so the message can be read. |
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

- **`OverviewTrendsTabs`** (`components/investments/OverviewTrendsTabs.tsx`) is a two-segment
  control, `Overview | Trends`, with `InvestTab = "overview" | "trends"`. It is only shown
  once the trend payload has at least one point. The screen owns the `tab` state.
- **Overview** is the screen's own content: totals, allocation donut, this-month card,
  strongest holding, holdings grouped by kind, SIPs, and the **Update values** and
  **Invest** buttons. On a holding's page it is the value, the cost basis and that holding's
  history.
- **Trends** is `TrendsView` (`components/investments/TrendsView.tsx`), fed by
  `useInvestmentTrend()` (`GET /investments/trend`).

`TrendsView` props: `trend`, `initialScope` (`ALL_SCOPE`, or a holding id) and `locked`.

| Part | Behaviour |
|---|---|
| Scope pills | A horizontal strip: **All**, then one pill per holding. Picking one re-scopes the charts in place. |
| Locked mode | Passed by `investment-detail` as `initialScope={id} locked`. The strip stays visible but only that holding is live (the rest are dimmed and disabled), so the screen's title and the figures under it cannot disagree. |
| Range pills | `6M`, `1Y`, `All time`. Default `1Y`. They cut the series with `lastN`. |
| Stat tiles | Profit so far, Best month, Worst month. Best and worst consider only months that had a value update. |
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

For colours, tooltip styling and axis tags, see [Chart conventions](design-system.md#chart-conventions).
Charts that print amounts honour privacy mode: they call `usePrivacyMask()` and, in the
Investments charts, print `••` for axis ticks, tags and tooltip figures while masked.

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
Budget screen relabels **Remaining** as **Unspent** and swaps **Days Left** and
**Daily Limit** for **Days** and **Avg/Day** once the month has ended, because a
pace target is meaningless for a month that is already over.

## Show an amount

Money is integer paise everywhere, and every screen has a privacy mode to honour.
Which helper to reach for depends on whether the amount can be tapped.

| Use | When |
|---|---|
| `<Money value={paise} />` | Default. An amount rendered on a screen. |
| `formatMoney(paise)` (default export of `lib/money.ts`) | The amount is going somewhere that can't be a component — a `sub` string, a toast, a sheet body. Masks. |
| `formatMoneyExact(paise)` | Never on screen. Files the user explicitly asked us to generate — see `lib/export.ts`. |
| `usePrivacyMask()` | A screen that composes amounts with `formatMoney` must call this once, to subscribe: without it a peek won't re-render the strings it computed. |
| `MASKED_MONEY` (`lib/money.ts`) | The fixed-width mask, `₹ ••••`. Fixed so the mask cannot leak the magnitude. Charts print a shorter `••` for tick labels and tags. |

`Money` takes `value` (integer paise), `prefix` (a sign such as `"+ "`, kept while masked
because a direction says nothing about a magnitude), `weight`, `size`, `color`,
`numberOfLines` and `align`. A peek, started by tapping any masked figure or the eye in
the header, un-masks everything for `PEEK_MS` (ten seconds, `store/settings.ts`) and
`PeekBar` shows a draining line and a way to hide again.

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

**The eye lives in the scaffold.** `components/shell/PeekButton.tsx` renders nothing at
all while privacy mode is off, which is what lets `ScreenScaffold` include it in the
default title row unconditionally. A screen that hides figures without offering the way
to reveal them is a dead end — that was the bug: the eye existed only on the dashboard,
so switching privacy mode on and opening Budget left the user with masked figures and no
control. **A screen passing a custom `header` has to include `<PeekButton />` itself.**

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

Every list screen renders four states from `components/states/`.

| State | Component | Condition |
|---|---|---|
| Error | `ErrorState` | `error` is set. Always pass `onRetry={refetch}`. |
| Loading | `SkeletonState` | `loading && items.length === 0`. Repeat one per expected row. |
| Empty | `EmptyState` | Loaded, no items. Give it an `actionLabel` and `onAction`. |
| Content | your rows | Otherwise. |

Check `loading && items.length === 0`, not `loading` alone: a refetch should
leave the existing rows on screen rather than flashing a skeleton over data the
user is already reading.

An empty state should reflect the situation. On a closed month, the Budget
screen says *"Nothing budgeted in July 2026"* and offers to record what the
limit should have been, rather than *"No budgets yet"*.

Give `EmptyState` a CTA only when the user can act on it. Activity shows
*"Add transaction"* when nothing has ever been recorded, and drops it when a
**search** came back empty — the fix there is a different query, not a new entry.

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
  from a brand-new account. Latch a `listsReady` state once they have all settled;
  do not gate on `loading` directly, because `useFocusEffect` re-enters loading on
  every focus and the card would blink off and back on each visit.

Dismissal is the one piece of stored onboarding state, in
`store/settings`'s `getStartedDismissed` — a list of user ids rather than a
boolean, because the flag is device-local but the checklist is per-account, and
the person who would lose theirs is the new user who needs it.

## Refetch on focus

Returning from a modal route should pick up what changed there. Refetch on
focus, not on mount:

```tsx
// Refresh on focus only. Stepping months already refetches inside `useBudgets`,
// so depending on `refetch` here would fire a second request for every step.
const refetchRef = useRef(refetch);
refetchRef.current = refetch;
useFocusEffect(useCallback(() => {
  refetchRef.current();
}, []));
```

**Important**
The ref indirection is load-bearing. When a hook is parameterized — as
`useBudgets(month)` is — `refetch` gets a new identity every time the parameter
changes. A `useFocusEffect` that depends on `refetch` directly then fires a
second request on top of the one the hook already made.

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
