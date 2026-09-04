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
- [Component reference](#component-reference)
- [Styling conventions](#styling-conventions)

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
| `bg` | `#0C0A16` | The app ground. |
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

### Composites

| Directory | Contents |
|---|---|
| `components/shell/` | `ScreenScaffold`, `AppHeader`, `GradientCard`, `GlowBackground`. |
| `components/data/` | `Card`, `SummaryCard`, `HealthScoreCard`, `ProgressBar`, `ShareBar`. |
| `components/rows/` | `TransactionRow`, `BudgetCategoryRow`, `BillRow`, `GoalCard`. |
| `components/charts/` | `AreaChart`, `PairedColumns` (react-native-svg). |
| `components/states/` | `EmptyState`, `ErrorState`, `SkeletonState`, `ComingSoon`. |
| `components/sheets/` | `AppSheet` and the bottom sheets built on it. See [Mobile patterns](mobile-patterns.md#add-a-bottom-sheet). |

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
