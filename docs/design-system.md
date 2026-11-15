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
  on the right of the plot in a fixed 46 px gutter, and amounts use `compactMoney` (`₹1.2L`,
  `₹3.4Cr`, `₹850`), never the full figure.
- Time labels run under the plot. The Investments charts label every month; `AreaChart` samples a
  long series to first, quarters and last (`sampleTicks`) so it does not crowd.
- **Last-value tag.** A small filled tag on the right edge at the latest value, in the series
  colour with `colors.bg` text (`LastTag` in `InvestmentCharts`): how a price chart shows "now".
- Wrap a section title above a chart in the uppercase label idiom: `size="xs"
  weight="semibold" color="inkDim"` with `letterSpacing: 1`.

**Tooltip**

- A floating bubble beside the touched point, width about 108-124, clamped inside the plot.
- Dark violet plate (`#241E42`, or `rgba(32,28,60,0.96)` on the Investments charts), a 1 px
  `glassBorder`, radius 10-12, padding 6 by 9-10.
- A title line in `xs` bold `inkDim` (the month or day), then one line per figure in `xs` black, toned
  `success` / `danger` / `inkDim` where the figure is a gain, loss or nothing.
- A figure line takes a role token (`success`, `danger`, `warning`, `inkDim`), as everywhere else.
- It stays open after release and closes on an outside tap. See the contract in
  [Charts](mobile-patterns.md#scrubbing-and-the-tooltip).

**Privacy**

Any chart that prints an amount calls `usePrivacyMask()` and prints `••` for tick labels, tags and
tooltip figures while masked.

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
`ghost`, and `dangerGhost` are glass fills. Use `pill` for the small glowing
header actions such as **+ New**.

```tsx
<Button label="Save Expense" onPress={submit} loading={submitting} />
<Button label="Remove from budget" variant="dangerGhost" onPress={remove} />
<Button label="+ New" pill size="sm" onPress={openCreate} />
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
| `Badge` | Uppercase status pill: `paid`, `pending`, `overdue`, `onTrack`. |
| `Chip` | Selectable filter chip. `grow` makes it fill a row evenly. |
| `ColorPicker` | Gradient swatch row over `PICKER_COLORS`. |
| `DateField` | Glass strip that opens a date, or date-and-time, picker. |
| `Divider` | Hairline, horizontal or vertical. |
| `Fab` | Floating action button. |
| `IconPicker` | Three-row horizontally-paged icon grid. |
| `PeriodNav` | Chevron-flanked period label. See [Mobile patterns](mobile-patterns.md#add-a-period-selector). |
| `Search` | Pill search field with a leading magnifier. |
| `SectionHeader` | Section title with an optional trailing action. |
| `SegmentedControl` | Mutually exclusive segments (Expense / Income / Transfer). |
| `Money` | An amount that honours privacy mode and is a tap target while masked. See [Mobile patterns](mobile-patterns.md#show-an-amount). |
| `PressableScale` | The press affordance for anything tappable that is not a `Button`: a spring squeeze and a light tick. `scaleTo` for how deep, `haptic={false}` where the action ticks itself. |
| `Toggle` | The native switch in Midnight Glass colours; buzzes on every flip. |
| `HoldButton` | A tap-and-hold CTA for the one action that cannot be undone; used through `ConfirmSheet hold`. |
| `DragList` | Long-press-to-reorder list, used with `ReorderToggle` on Manage accounts and categories. |
| `GhostTitleInput` | A title field with an inline suggestion suffix (`lib/titleSuggestions.ts`). |
| `PasswordMeter` | The 0-4 strength bar under any new-password field. |
| `KeyboardDoneBar` | One instance mounted at the root; a field opts in through `inputAccessoryViewID`. |
| `CategoryName`, `CategoryForm` | How a category is named outside a tree, and the shared create/edit form. |

### Composites

| Directory | Contents |
|---|---|
| `components/shell/` | `ScreenScaffold`, `BackButton`, `AppHeader` (the Home greeting row), `PeekButton`, `PeekBar`, `OfflineBanner`, `Toast`, `GradientCard`, `GlowBackground`, `ReorderToggle`, plus the gates and boundaries (`AppLockGate`, `WakeGate`, `ScreenErrorBoundary`, `CrashScreen`). |
| `components/data/` | `Card`, `SummaryCard`, `HealthScoreCard`, `ProgressBar`, `ShareBar`, and the Home and Insights cards and slides (`PaceCard`, `SafeToSpendCard`, `HighlightCard`, `ForYouCarousel`, `GetStartedCard`, and others). |
| `components/rows/` | `TransactionRow`, `BudgetCategoryRow`, `BillRow`, `GoalCard`, `ManageRow`, `NotificationRow`, `SettingsRow`, `RowActions`. |
| `components/charts/` | `AreaChart`, `DualLineChart`, `PairedColumns`, `DonutChart`, `CompareBars`, `ForecastLine`, `Sparkline`, `SpendHeatmap`, `WeekdayHeatmap`, `HourlyRhythm`, `CashFlowMonthGrid`, `InvestmentCharts` (react-native-svg). See [Chart conventions](#chart-conventions). |
| `components/investments/` | `OverviewTrendsTabs`, `TrendsView`. See [Investments screens](mobile-patterns.md#investments-screens). |
| `components/states/` | `EmptyState`, `ErrorState`, `SkeletonState`, `ComingSoon`. |
| `components/sheets/` | `AppSheet` and the bottom sheets built on it, including `ConfirmSheet`, `OptionSheet`, `ExportSheet` and `InvestmentsExportSheet`. See [Mobile patterns](mobile-patterns.md#add-a-bottom-sheet). |

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
