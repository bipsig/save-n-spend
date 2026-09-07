# Mobile patterns

This document covers the conventions the mobile app already follows. Follow them
when you add to it: a screen that matches its neighbours is easier to review than
one that is merely correct.

For tokens and components, see [Design system](design-system.md).

## Topics

- [Navigation structure](#navigation-structure)
- [Fetch data with a domain hook](#fetch-data-with-a-domain-hook)
- [Add a screen](#add-a-screen)
- [Add a full-screen form](#add-a-full-screen-form)
- [Add a bottom sheet](#add-a-bottom-sheet)
- [Add a period selector](#add-a-period-selector)
- [Show an amount](#show-an-amount)
- [Handle loading, empty, and error states](#handle-loading-empty-and-error-states)
- [First run](#first-run)
- [Refetch on focus](#refetch-on-focus)

## Navigation structure

Routing is file-based, through expo-router v6. A file under `apps/mobile/app/`
is a route.

| Path | Purpose |
|---|---|
| `app/_layout.tsx` | Root stack. Registers every modal route and the session gate. |
| `app/(auth)/` | Login and register. Shown when `session.status !== "authed"`. |
| `app/(tabs)/` | The tab bar: Home, Activity, Insights, Profile. |
| `app/<name>.tsx` | A pushed or modal route — `budget`, `goals`, `bills`, `add-transaction`, `add-goal`. |

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

There is no data-fetching library. Each domain owns a file in
`apps/mobile/lib/` that exports a hook plus the pure helpers that derive from
its data. `lib/budgets.ts` is the reference implementation.

The hook contract is always the same:

```ts
const { items, loading, error, refetch } = useBudgets(month);
```

**To add a domain hook**

1. Create `apps/mobile/lib/<domain>.ts`.
2. Hold `items`, `loading`, and `error` in `useState`.
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

Talk to the API through `lib/api.ts` (`get`, `post`, `patch`, `del`), which
attaches the token and returns the unwrapped `data`.

## Add a screen

Wrap the screen in `ScreenScaffold`. It supplies the gradient ground, the glow,
safe-area insets, the title row, and a scroll view with the standard rhythm.

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
| `title`, `subtitle` | The standard title block. |
| `headerRight` | A trailing header action, usually a `pill` `Button`. |
| `header` | A completely custom header, replacing the title block. |
| `scroll` | Set `false` when the screen owns its own `FlatList`. |
| `floating` | Pinned above the content, such as a `Fab`. |

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
for the length of its close animation (`REPRESENT_GUARD_MS`).

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
