# Design system

Save n Spend uses a dark-first design system called **Midnight Glass**: a deep
charcoal-violet ground, translucent glass surfaces, and vivid gradient accents.
This document is the reference for its tokens and its component vocabulary.

**Important**
Never hard-code a color, a radius, or a font size in a screen. Every visual
value comes from `@/theme`, and every component prop that takes a color takes a
**role token** (`primary`, `success`, `danger`, `ink`, …), never a hex string.
The one sanctioned exception is the low-alpha `rgba(255,255,255,…)` glass fills
and hairlines inside a component's own `StyleSheet`.

## Topics

- [Import tokens](#import-tokens)
- [Color tokens](#color-tokens)
- [Spacing and radius](#spacing-and-radius)
- [Typography](#typography)
- [Gradients](#gradients)
- [Shadows](#shadows)
- [Chart palette](#chart-palette)
- [Chart conventions](#chart-conventions)
- [Component reference](#component-reference)
- [Formatting rules](#formatting-rules)
- [Styling conventions](#styling-conventions)
- [Server messages](#server-messages)

## Import tokens

```tsx
import { colors, spacing, radius, fontSize, fontWeight, shadows } from "@/theme";
import type { ColorToken, IconName } from "@/theme";
```

The namespaced `theme` object is also exported, and is what `AppText` reads
internally. Prefer the named imports in screen code.

## Color tokens

Defined in `apps/mobile/theme/colors.ts`.

### Text

| Token | Value | Use for |
|---|---|---|
| `ink` | `#F5F4FC` | Primary text. |
| `inkSecondary` | `#D8D5E8` | Secondary body copy. |
| `inkDim` | `rgba(245,244,252,0.58)` | Subtitles, meta, captions, field labels. |
| `gray700`–`gray300` | `#BAB6CE` → `#524F68` | Descending greys for fine detail. |

### Surfaces

| Token | Value | Use for |
|---|---|---|
| `bg` | `#0C0A16` | The app ground. `darkBg` is the same value, kept as a separate name. |
| `surface` | `#FFFFFF` | Opaque **foreground** on a colored or gradient surface — not a background. |
| `surface2` | `rgba(255,255,255,0.06)` | Subtle glass: inputs, chips, search. |
| `glass` | `rgba(255,255,255,0.10)` | Card glass fill. |
| `glassBorder` | `rgba(255,255,255,0.14)` | Card hairline. |
| `line` | `rgba(255,255,255,0.10)` | Dividers, field borders. |
| `lineSoft` | `rgba(255,255,255,0.06)` | Fainter dividers. |

**Note**
`surface` is white. On a gradient card, `color="surface"` is how you get legible
white text — it does not mean "the card background".

### Brand and semantic

| Token | Value | Meaning |
|---|---|---|
| `primary` | `#9B8CFF` | Brand violet. Primary actions. |
| `primaryInk` | `#4B3BB8` | Deep violet, used as a progress track on gradient cards. |
| `accent` | `#7B68EE` | Default entity accent (categories, goals). |
| `accentLight` | `#9F8FFF` | |
| `accentSoft` | `rgba(155,140,255,0.18)` | Tinted chip background. |
| `success` / `successInk` / `successSoft` | `#34E0A1` / `#0E7A50` / 16% tint | Income, on-track, positive confirm. |
| `danger` / `dangerInk` / `dangerSoft` | `#FF6B74` / `#B1060F` / 16% tint | Expense, over budget, destructive. |
| `warning` / `warningSoft` | `#FFB15C` / 16% tint | Approaching a limit. |
| `info` / `infoSoft` | `#68A8FF` / 16% tint | Neutral informational. |

### Extended palette

`teal` `#2DD4BF` · `pink` `#F472B6` · `lime` `#A3E635` · `orange` `#FB923C` ·
`indigo` `#818CF8`.

These are the extra choices offered by `ColorPicker` for user-created
categories and goals. `PICKER_COLORS` is the canonical order:
`accent`, `info`, `success`, `warning`, `danger`, `teal`, `pink`, `lime`,
`orange`, `indigo`.

## Spacing and radius

From `apps/mobile/theme/spacing.ts`.

| `spacing` token | Value |
|---|---|
| `xs` | 4 |
| `sm` | 8 |
| `md` | 12 |
| `lg` | 16 |
| `xl` | 24 |
| `2xl` | 32 |
| `3xl` | 48 |

| `radius` token | Value | Applies to |
|---|---|---|
| `sm` | 15 | Icon chips. |
| `md` | 20 | Buttons, inputs, glass strips. |
| `lg` | 26 | Cards, sheet corners. |
| `full` | 9999 | Pills, circular avatars. |

**Note**
Radii are the design spec's values scaled ×1.25. The spec mock is drawn in a
302 px phone frame; a real device is about 390 pt wide, so unscaled values read
noticeably tighter than the approved design.

## Typography

From `apps/mobile/theme/typography.ts`. The app uses the **system font** — SF Pro
on iOS, Roboto on Android. There is no custom family, and there is no
`fontFamily` token. Hierarchy is carried by **weight**.

| `fontWeight` token | Value | Use for |
|---|---|---|
| `regular` | 400 | Body. |
| `medium` | 500 | |
| `semibold` | 600 | Meta, field values. |
| `bold` | 700 | Names, row titles. |
| `black` | 800 | Screen titles, amounts, hero figures. |

| `fontSize` token | Value | Use for |
|---|---|---|
| `xs` | 13 | Uppercase field labels, captions. |
| `sm` | 15 | Subtitles, meta. |
| `md` | 18 | Card and row names. Default. |
| `lg` | 21 | Tile amounts, sheet titles. |
| `xl` | 30 | Screen titles, card heroes. |
| `2xl` | 33 | Large heroes. |

`AppText` applies `letterSpacing: -0.02 × fontSize` automatically at
`weight="black"`, per the spec's tight display tracking. Do not add your own.

Two idioms recur and are not tokens, because they are one-off display sizes:

- **Uppercase field label** — `size="xs" weight="bold" color="inkDim"` plus
  `letterSpacing: 1.3`.
- **Amount hero** — `fontSize: 46`, `letterSpacing: -1.4`, with a superscript
  `₹` and a glowing caret. See `app/add-transaction.tsx` and `app/add-goal.tsx`.

## Gradients

From `apps/mobile/theme/gradients.ts`. Rendered with `expo-linear-gradient`.

| Group | Tokens | Purpose |
|---|---|---|
| `gradients` | `brand`, `health`, `danger` | Button and card fills. Primary and confirm actions are always a gradient with a glow, never a flat fill. |
| `chipGradients` | `blue` `green` `violet` `amber` `red` `teal` `pink` `lime` `orange` `indigo` | Vivid icon-chip fills. |
| `chipInk` | same keys | Deep-ink glyph color that sits on each chip gradient. |
| `chipGlow` | same keys | Shadow color for each chip. |
| `barGradients` | same keys | Chart bar fills. |

`chipTintFor(colorToken)` maps a semantic role token to its chip tint, so you can
pass either to `Icon`'s `gradient` prop:

```tsx
<Icon name="food" container="square" gradient="success" />   // → green chip
<Icon name="food" container="square" gradient="violet" />    // → tint directly
```

## Shadows

`shadows.sm`, `shadows.md`, `shadows.lg` — spread into a style object.

```tsx
<View style={{ ...shadows.md }} />
```

## Chart palette

`theme/charts.ts` exports `chartPalette`, `chartOthers`, `incomeColor`, and
`expenseColor`. The palette is ordered so that adjacent series stay
distinguishable under the common forms of color vision deficiency. Take series
colors from it in order rather than picking your own.

| Export | Value |
|---|---|
| `chartPalette` | `#0FA873` · `#8E7DE3` · `#C98500` · `#3572D9` · `#E65A64` |
| `chartOthers` | `#767489`, a neutral grey where the tail beyond five folds into "Others" |
| `incomeColor` | `#0FA873` |
| `expenseColor` | `#E65A64` |

The palette is for chart **marks** only, assigned by rank. Values and labels stay in `ink`.
`allocationSlices` in `lib/investments.ts` and the category donut on Insights both assign
`chartPalette[i]`, falling back to `chartOthers`, so a slice keeps its colour whichever screen
shows it.

## Chart conventions

These hold for every chart in `components/charts/`. For how a chart is wired into a screen, see
[Charts](mobile-patterns.md#charts).

**Colour**

- **Categorical series** come from `chartPalette`, in order, then `chartOthers`.
- **Income and expense** are `incomeColor` and `expenseColor` (paired columns, legends, the PDF
  reports). They are the palette's green and red, tuned to be told apart.
- **Profit and loss** on the Investments charts use the **role tokens** `colors.success` and
  `colors.danger`: green above zero, red below, per segment. Text beside them uses
  `color="success"` / `"danger"`, and `inkDim` for zero or "no change". Do not use red and
  green for anything that is not a gain or a loss.
- **Value against invested** on Investments: value is the brand violet (`#B0A2FF`), money put in
  is `colors.teal`, drawn as a step. Both appear in a legend under the chart.
- **Gridlines** are `colors.line`; a zero or baseline rule is `colors.inkDim` at 40-50% opacity.
- **Selected state** is carried by size and a cursor line, not by a new hue: the touched dot grows
  (r 3 to 5), unselected bars dim to about 60%, and a dashed `colors.ink` line at 25% opacity marks
  the slot.

**Axis**

- Tick labels are `size="xs"`, `color="inkDim"`, one line. On the Investments charts they sit
  on the right of the plot in a fixed 46 px gutter, and amounts use `formatCompact`
  (`lib/format/compact.ts`: `₹1.2L`, `₹3.4Cr`, `₹850`). Axis ticks are the only place a
  compact figure is allowed; every figure someone reads (tags, tooltips, readouts) is exact.
- Time labels run under the plot. The Investments charts label every month; `AreaChart` samples a
  long series to first, quarters and last (`sampleTicks`) so it does not crowd.
- **Last-value tag.** A small filled tag on the right edge at the latest value, in the series
  colour with `colors.bg` text (`LastTag` in `InvestmentCharts`): how a price chart shows "now".
  The figure is exact and the tag is anchored to the right edge so it never runs off the plot.
- A section title above a chart is a `Caps` caption (see [Caps](#caps)).

**Legend**

One `ChartLegend` (`components/ui/ChartLegend.tsx`) for every chart. Sizes come from
`chartLegend` in `theme/charts.ts`.

| Prop | Type | Default |
|---|---|---|
| `items` | `{ label, color, mark?: "dot" \| "line" \| "dashed", value?: string }[]` | — |
| `layout` | `row \| column` | `row` |

`dot` (9 pt) marks areas and bars, `line` (14 × 3) lines and steps, `dashed` a projection.
`column` stacks one item per line with `value` right-aligned, as beside the Investments
allocation donut, so the shares line up.

**Tooltip**

One `ChartTooltip` (`components/ui/ChartTooltip.tsx`), styled from `chartTooltip` in
`theme/charts.ts`: 164 pt wide (exact paise need the room), plate `#241E42`, 1 px border
`rgba(255,255,255,0.14)`, radius 12, padding 6 by 10.

| Prop | Type | Notes |
|---|---|---|
| `x`, `chartWidth` | number | The touched point's centre and the chart's measured width; the bubble is clamped inside. |
| `rightInset` | number | Keeps it clear of a right-hand axis. |
| `top` | number | — |
| `title` | string | The month or day, `xs` bold `inkDim`. |
| `lines` | `{ label?, value, tone?, dot?, hollow? }[]` | One per figure. `value` is already formatted (and masked). `dot` is the series colour when there is more than one series; `hollow` for a projection. |

A figure line takes a role token (`success`, `danger`, `warning`, `inkDim`), as everywhere else.
It stays open after release and closes on an outside tap, on Category insights too. See the
contract in [Charts](mobile-patterns.md#scrubbing-and-the-tooltip).

**VoiceOver**

Every chart is one accessible element whose label is a single sentence (D20 A), built with
`chartSummary({ title, parts, masked })` from `lib/chartSummary.ts`: "Spending this month, chart.
₹42,318.40 so far, highest ₹4,200.00 on 12 Nov." While masked the body is "Amounts hidden". Spread
`chartA11y(summary)` on the chart's root. The per-chart builders live in `lib/chartSummaries.ts`
(`areaSummary`, `dualLineSummary`, `pairedSummary`, `donutSummary`, `valueHistorySummary`,
`profitSummary`, `forecastSummary`); `peakPhrase` and `extremeIndex` help a new one.

**Privacy**

Any chart that prints an amount calls `usePrivacyMask()`. Tick labels, tags and tooltip figures
print the standard mask (`₹ ••••`, through `formatCompact` and `formatMoney`) while masked.

**Carried values**

A month nobody updated is drawn like any other: its value is carried forward and the profit chart
shows no change bar. Charts carry no "not updated" or "stale" warnings.

## Component reference

Import primitives from `@/components/ui/<Name>`. All are **default** exports
except `AppText`, which is **named**.

### AppText

Themed text. Use this instead of React Native's `<Text>`.

| Prop | Type | Default |
|---|---|---|
| `size` | `xs \| sm \| md \| lg \| xl \| 2xl` | `md` |
| `weight` | `regular \| medium \| semibold \| bold \| black` | `regular` |
| `color` | `ColorToken` | `ink` |
| …`TextProps` | `numberOfLines`, `style`, … | — |

```tsx
<AppText size="xl" weight="black">Good Evening</AppText>
<AppText size="sm" color="inkDim">Subtitle</AppText>
```

### Button

| Prop | Type | Default |
|---|---|---|
| `label` | string | — |
| `variant` | `primary \| success \| secondary \| ghost \| danger \| dangerGhost` | `primary` |
| `size` | `sm \| md \| lg` | `md` |
| `pill` | boolean | `false` |
| `icon` | `IconName` | — |
| `loading` | boolean | `false` |
| `disabled` | boolean | — |
| `onPress` | `() => void` | — |

`primary`, `success`, and `danger` render as gradients with a glow. `secondary`,
`ghost`, and `dangerGhost` are glass fills. Header actions are not buttons: they are
`IconButton` circles drawn by `ScreenHeader` (see [Screen header](#screenheader)).
`Button` sets its own `accessibilityRole`, `accessibilityState` (`disabled`, `busy` while
`loading`) and label, so callers don't.

```tsx
<Button label="Save expense" onPress={submit} loading={submitting} />
<Button label="Remove from budget" variant="dangerGhost" onPress={remove} />
```

**Note**
Make the CTA label say what will happen, including the amount when you know it —
`Create · ₹50,000 by 4 Mar 2027` rather than `Create`. The existing forms do
this consistently and it is a deliberate part of the design.

### Icon

Renders a glyph from the semantic map in `lib/icons.ts` (`name="food"` →
MaterialIcons `restaurant`).

| Prop | Type | Default |
|---|---|---|
| `name` | `IconName` | — |
| `size` | number | `24` |
| `color` | `ColorToken` | `ink` |
| `container` | `none \| circle \| square` | `none` |
| `containerColor` | `ColorToken` | `accentSoft` |
| `containerSize` | number | `size × 1.8` |
| `containerRadius` | number | `radius.sm` |
| `glow` | boolean | `false` |
| `gradient` | `ChipTint \| ColorToken` | — |

`gradient` overrides `containerColor` and `color`, and requires
`container !== "none"`.

```tsx
<Icon name="savings" size={30} containerSize={64} containerRadius={21}
      container="square" gradient="accent" />
```

To add an icon, add a `semanticName: 'material-glyph'` entry to `lib/icons.ts`.
Adding it to `PICKER_ICONS` in the same file also offers it in `IconPicker`.

### Input

Text field with an uppercase label, a focus border, and an error state. Extends
`TextInputProps`.

| Prop | Type | Default |
|---|---|---|
| `label` | string | — |
| `error` | string | — |
| `size` | `sm \| md \| lg` | `md` |
| `rightSlot` | `React.ReactNode` | — |
| `InputComponent` | `React.ComponentType<TextInputProps>` | `TextInput` |

**Important**
Inside a bottom sheet, pass `InputComponent={BottomSheetTextInput}`. With the
plain `TextInput`, the keyboard and the sheet fight each other and the field
ends up hidden behind the keyboard.

```tsx
<Input label="Name" placeholder="e.g. Europe Trip"
       value={value} onChangeText={onChange} error={errors.name?.message} />
```

### Other primitives

| Component | Purpose |
|---|---|
| `AmountHeroInput` | Large in-sheet amount field. Uses `BottomSheetTextInput`. |
| `Avatar` | Photo, initials, or icon. Type inferred from which prop you pass. |
| `Badge` | Status pill. `tone`: `success`, `warning`, `danger`, `info`, `neutral` (bright text on a soft fill), or `onGradient` for a tag on a gradient band (white on a dark plate: the trip card band, the What's new version band). `status` (`paid`, `pending`, `overdue`, `onTrack`) is kept for bills until they move to `tone`. |
| `Caps` | The one small uppercase caption. See [Caps](#caps). |
| `Chip` | Selectable filter chip, for filters and long scrolling choices (Trends' holding scope). `grow` makes it fill a row evenly. Sets `selected` for VoiceOver. |
| `ColorPicker` | Gradient swatch row over `PICKER_COLORS`. |
| `DateField` | Glass strip that opens a date, or date-and-time, picker. Its `label` is written in sentence case and drawn as a `Caps` caption inside the strip, the same size as the other in-row captions (Category, Paid from). Dates go through `formatCalendar` / `formatInstant` in the account zone. |
| `Divider` | Hairline, horizontal or vertical. |
| `Fab` | Floating action button. Add transaction only. |
| `IconButton` | A 40 pt glass circle (44 pt target) with one glyph. See [IconButton](#iconbutton). |
| `IconPicker` | Three-row horizontally-paged icon grid. |
| `PeriodNav` | Chevron-flanked period label. See [Mobile patterns](mobile-patterns.md#add-a-period-selector). |
| `Search` | Pill search field with a leading magnifier. |
| `SectionHeader` | Section title with an optional trailing action. Built on `Caps`. |
| `SegmentedControl` | Pick one of up to about five (Expense / Income / Transfer, Day … All). `size="sm"` for a range or a pair of tabs inside a screen (Trends' 6M / 1Y / All time, Investments' Overview \| Trends, both export sheets' span). Each segment has a 44 pt target and reads as a tab with its selected state. |
| `StatTile`, `StatRow` | A caption over a figure, with an optional change line. See [StatTile and StatRow](#stattile-and-statrow). |
| `ChartLegend`, `ChartTooltip` | The one legend and the one tooltip for every chart. See [Chart conventions](#chart-conventions). |
| `ServerWakingNotice` | The D19 strip, "The server is starting up · showing saved data" (`components/ui/ServerWakingStrip.tsx`). `ScreenScaffold` places it under the header; `ServerWakingAnnouncer`, mounted once in `app/_layout.tsx`, says it to VoiceOver. See [Mobile patterns](mobile-patterns.md#server-waking-up). |
| `Money` | An amount that honours privacy mode and is a tap target while masked. Takes `sign` (`auto`, `always`, `none`). See [Mobile patterns](mobile-patterns.md#show-an-amount). |
| `PressableScale` | The press affordance for anything tappable that is not a `Button`: a spring squeeze and a light tick. `scaleTo` for how deep, `haptic={false}` where the action ticks itself. It sets `accessibilityRole="button"` and `disabled` state; a control with no text (an icon, a swatch) must also pass an `accessibilityLabel`. |
| `Toggle` | The native switch in Midnight Glass colours; buzzes on every flip. Takes `label`, which VoiceOver reads with the on/off value. |
| `HoldButton` | A tap-and-hold CTA for the one action that cannot be undone; used through `ConfirmSheet hold`. VoiceOver users confirm it through its "confirm" accessibility action. |
| `DragList` | Long-press-to-reorder list, used on Manage accounts and categories with the header's Reorder circle. |
| `GhostTitleInput` | A title field with an inline suggestion suffix (`lib/titleSuggestions.ts`). |
| `PasswordMeter` | The 0-4 strength bar under any new-password field. |
| `KeyboardDoneBar` | One instance mounted at the root; a field opts in through `inputAccessoryViewID`. |
| `CategoryName`, `CategoryForm` | How a category is named outside a tree, and the shared create/edit form. |

### ScreenHeader

`components/shell/ScreenHeader.tsx`. The one header for every in-app screen except Home (which
keeps its greeting row). Screens get it through `ScreenScaffold` props rather than rendering it
themselves; the scaffold draws the same header in the loading, error and loaded states.

| Prop | Type | Default |
|---|---|---|
| `title` | string | — |
| `subtitle` | string | — |
| `back` | `boolean \| "back" \| "close"` | `false` (tabs) |
| `onBack` | `() => void` | `goBackOrHome` |
| `actions` | `HeaderAction[]` | `[]` |
| `peek` | boolean | `true` |
| `children` | node | — |

- **Title.** 30 pt black, one line. A title that doesn't fit shrinks to `TITLE_MIN_SCALE` (0.8,
  so 24 pt) and then ends in "…" (D1). VoiceOver reads the full string, and screens titled with
  a name the user typed (a trip, a holding) also show the full name in their top card.
- **Back.** Every non-tab screen has one, Budget, Bills and Goals included (D2). `"close"` is the
  ✕ circle on a full-screen modal. `BackButton` is a 28 pt chevron with `hitSlop={8}` (44 pt
  target), labelled "Go back" or "Close".
- **Eye.** `PeekButton` sits before the actions. It draws nothing while privacy mode is off, and
  is labelled "Show amounts" / "Hide amounts".
- **Actions** are data, so each kind has exactly one look (D1 C): every action is an
  `IconButton` circle, New is the gradient circle, and `orderHeaderActions` sorts them
  `reorder`, `markAllRead`, `export`, `edit`, `new`, so New is always at the right edge.

`HeaderAction` (`lib/screenHeader.ts`):

| Field | Type | Notes |
|---|---|---|
| `kind` | `reorder \| markAllRead \| export \| edit \| new` | Picks the glyph and the tone. |
| `label` | string | What VoiceOver says. Name the thing: "New budget", "Edit trip", "Export insights". |
| `onPress` | `() => void` | — |
| `disabled` | boolean | Dimmed, e.g. Edit while the record is still loading. |
| `selected` | boolean | Reorder only: the circle shows a filled tick while reorder mode is on. |

Show an action only when it can do something: Notifications offers Mark all read only while
something is unread, Investments offers Export only once there is a holding.

### IconButton

`components/ui/IconButton.tsx`. A 40 pt circle with one glyph and a 44 pt touch target.

| Prop | Type | Default |
|---|---|---|
| `icon` | `IconName` | — |
| `onPress` | `() => void` | — |
| `accessibilityLabel` | string | required |
| `accessibilityRole` | `AccessibilityRole` | required |
| `accessibilityHint` | string | — |
| `tone` | `glass \| brand` | `glass` |
| `selected` | boolean | `false` |
| `disabled` | boolean | — |
| `size` | number | `40` |
| `haptic` | boolean | `true` |

`brand` is the gradient fill, kept for New. Don't hand-build a header circle: pass a
`HeaderAction` instead.

### Caps

`components/ui/Caps.tsx`. The one small uppercase caption, used for section titles, stat-tile
labels, field labels and chart titles. Write the text in sentence case (`<Caps>Who's going
(besides you)</Caps>`): the capitals come from `textTransform`, so the source stays readable.

| Prop | Type | Default |
|---|---|---|
| `size` | `md \| sm` | `md` |
| `color` | `ColorToken` | `inkDim` (`onGradientDim` on a gradient) |
| `header` | boolean | `false`. Marks a caption that opens a section as a VoiceOver heading. |

The sizes are tokens (`caps` in `theme/typography.ts`): `md` is `xs` with letter-spacing 1.3,
`sm` is 11.5 pt with 1.0, for tight slots such as three stat tiles across. No screen sets its own
letter-spacing for a caption.

### StatTile and StatRow

`components/ui/StatTile.tsx`. A caption above a figure, with an optional change line under it
(D4 A).

| Prop | Type | Notes |
|---|---|---|
| `label` | string | Sentence case; drawn as `Caps`. |
| `amount` | number | Integer paise. Masked in privacy mode; tapping the tile then peeks. |
| `text` | string | A figure that isn't money ("30.0%"). Ignored when `amount` is set. |
| `signed` | boolean | Writes "+" or "−" in front of `amount`, kept while masked. |
| `format` | `(paise) => string` | Defaults to the exact formatter. |
| `tone` | `ColorToken` | Figure colour. |
| `change` | `{ text, tone? } \| null` | The line under the figure ("+6.8% vs last month"). |
| `size` | `sm \| md \| lg` | `md`. The figure may shrink to 13 / 15 / 17 pt. |
| `surface` | `card \| plain \| gradient` | `card`. |

`StatRow` lays tiles side by side at equal widths (`items`, `size`, `surface`, `columns`, `gap`).
It measures itself, and when the widest figure won't fit its share even at the minimum size it
drops a column at a time (3 → 2 + 1 → 1), the short last row's tiles growing to fill it. On a
402 pt phone, Trends' three tiles stay three across up to "+₹9,99,999.99" and go two across from
"+₹10,00,000.00".

### Composites

| Directory | Contents |
|---|---|
| `components/shell/` | `ScreenHeader`, `ScreenScaffold`, `BackButton`, `AppHeader` (the Home greeting row), `PeekButton`, `PeekBar`, `OfflineBanner`, `Toast`, `GradientCard`, `GlowBackground`, plus the gates and boundaries (`AppLockGate`, `WakeGate`, `ScreenErrorBoundary`, `CrashScreen`). |
| `components/data/` | `Card`, `SummaryCard`, `HealthScoreCard`, `ProgressBar`, `ShareBar`, and the Home and Insights cards and slides (`PaceCard`, `SafeToSpendCard`, `HighlightCard`, `ForYouCarousel`, `GetStartedCard`, and others). |
| `components/rows/` | `TransactionRow`, `BudgetCategoryRow`, `BillRow`, `GoalCard`, `ManageRow`, `NotificationRow`, `SettingsRow`, `RowActions`. |
| `components/charts/` | `AreaChart`, `DualLineChart`, `PairedColumns`, `DonutChart`, `CompareBars`, `ForecastLine`, `Sparkline`, `SpendHeatmap`, `WeekdayHeatmap`, `HourlyRhythm`, `CashFlowMonthGrid`, `InvestmentCharts` (react-native-svg). See [Chart conventions](#chart-conventions). |
| `components/investments/` | `TrendsView`. The Overview \| Trends switch is a `SegmentedControl size="sm"`. See [Investments screens](mobile-patterns.md#investments-screens). |
| `components/states/` | `EmptyState`, `ErrorState` (the same 64 pt disc as `EmptyState`, from `StateDisc`; "Couldn't load this", the `lib/apiError.ts` message, and "Try again"), `SkeletonState`, `ComingSoon`. |
| `components/sheets/` | `AppSheet` and the bottom sheets built on it, including `ConfirmSheet`, `OptionSheet`, `ExportSheet` and `InvestmentsExportSheet`. See [Mobile patterns](mobile-patterns.md#add-a-bottom-sheet). |

## Formatting rules

Every figure the user reads goes through `lib/format/` (or the masked wrappers in `lib/money.ts`).
No screen builds a sign, picks a precision or formats a date by hand. The rules come from
decisions D6 to D14 (`.audit/plan-ui-consistency.md`).

| Rule | Decision | What it means |
|---|---|---|
| True minus | D6 A | Negatives use "−" (U+2212, `MINUS`), with no space: `−₹450.00`. CSV files keep "-" for spreadsheets. A figure that rounds to zero has no sign and is drawn neutral. |
| Signed rows | D7 A | Transaction rows are signed: `−₹100.00` in red, `+₹500.00` in green, transfers plain. Pass `sign="always"` to `Money`. |
| Signs, not arrows | D8 A | Changes are written `+₹2,000.00`, `−4.5% vs last month`. No ▲ / ▼. |
| One decimal on every percentage | D9 C | `formatPct(n, { kind })`: `share` is unsigned (`24.7%`, `100.0%`), `return` and `change` are signed (`+8.4%`, `−4.5%`). Never drop the decimal (`0.0%`). Rate changes are points: `formatPoints` → `+5.0 pts`. A change from zero is "—". |
| Exact paise everywhere | D10 B | `formatMoney` / `formatMoneyExact` always print two decimals, averages and per-day figures included: `₹52,400.00`, `₹1,433.33 a day`. The only compact figures are chart axis ticks (`formatCompact`: rounds first, then picks k / L / Cr, so ₹99,960 is "₹1L"). |
| Words for a direction | D11 A | Where the label already names a direction, use a word instead of a negative: `formatBalance` gives `₹12,000.00 owed` (card), `₹3,000.00 overdrawn` (any other account), `₹45,000.00 available`; persons read `Owes you ₹500.00` / `You owe ₹500.00` / `Settled up`. `formatRemaining` gives `₹2,000.00 left` / `₹500.00 over`. |
| "Sep" | D12 A | One month table (`MONTHS`, `MONTHS_LONG` in `lib/format/date.ts`), never `Intl`, so iOS and the server can't disagree ("Sept"). |
| "3:58 pm" | D13 A | `formatClock` / the `time` shape: lower-case am/pm with a space, built by hand. |
| Greeting by the device clock | D14 A | `lib/greeting.ts` reads the phone's clock on purpose. Everything else reads the account zone. |

Dates (`lib/format/date.ts`) have two typed entry points so the zone can't be forgotten:

- `formatInstant(at, shape, zone = appZone())` for a moment, read in the account zone.
- `formatCalendar(day, shape)` for a calendar day (`YYYY-MM-DD` / `YYYY-MM` key).

| Shape | Example |
|---|---|
| `day` | "12 Mar"; the year is added when it isn't this year ("5 Mar 2025") |
| `dayYear` | "12 Mar 2026" |
| `dayLong` | "20 November" |
| `weekday` | "Mon, 16 Nov" |
| `month`, `monthLong` | "Sep 2026", "September 2026" |
| `time` (instants) | "3:58 pm" |
| `dayTime` (instants) | "Today, 3:58 pm", "Yesterday, 9:12 am", else `day` |
| `relativeDay` (instants) | "today", "yesterday", "tomorrow", else `day` ("Paid today") |
| `relative` (instants) | "just now", "12 min ago", "3 h ago", "yesterday", "3 days ago", else `day` |

Relative words are lower case; `capitalise` them only at the start of a line ("Insights for last
week", "No activity in last month"). `formatSpan(start, end)` and `relativePeriod(key, offset)`
(`lib/format/period.ts`) name ranges. `count(n, "day")` (`lib/format/count.ts`) pluralises, so
nothing prints "1 days".

## Styling conventions

- Put static styles in a `StyleSheet.create` block at the **bottom** of the file.
- Keep dynamic, token-driven, or state-driven styles inline.
- React Native has no `:hover`, `:focus`, or `:active`. Interaction state comes
  from `Pressable`'s `({ pressed })` callback, or from `useState` with
  `onFocus`/`onBlur`.
- Spell colors as role tokens. If you find yourself reaching for a hex value,
  the token you want either exists or should be added to `theme/colors.ts`.
- Comments in this codebase explain *why*, and cite the design spec where a
  value comes from one (`// spec .flabel`). Match that density — do not narrate
  what the code already says.

## Server messages

The app shows an API error's `message` as it is (followed by ` · Ref <id>`), so
the server writes it like app copy. The rules, enforced by
`styleProblems()` in `apps/api/src/utils/messages.ts`:

1. One plain sentence in sentence case. No `!`, no trailing full stop, and `. `
   between two sentences, never ` — `.
2. Say what's wrong in the app's words (account, person, holding, category,
   bill), then what to do if that isn't obvious: `This trip is closed. Reopen it
   to make changes`.
3. Never a field name (`_id`, `toAccount`), an id, an amount (privacy mode hides
   amounts, and a message would leak one), library text (`Required`, `Expected
   number, received string`) or HTTP words.
4. One helper per situation, so the same case always reads the same:
   `notFound(thing)`, `invalidReference(label, things)`, `duplicate(thing)`,
   `conflict(what, whatToDo)`.
5. Field-level sentences come from one error map (`schemas/errorMap.ts`) that
   labels each field in the app's words (`occurredAt` is "Date", `owedBy.1.amount`
   is "What each person owes"), so a schema needs its own message only when the
   generic one wouldn't say enough.

Like the app's own copy, a server message never names a schedule time.
