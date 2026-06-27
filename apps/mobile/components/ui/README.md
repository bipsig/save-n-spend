# UI Primitives

The base component vocabulary for Save n Spend. Every screen is composed from
these — they never hard-code color/spacing, they consume **theme tokens**.

- Import primitives from `@/components/ui/<Name>` (most are **default** exports;
  `AppText` is a **named** export).
- Import tokens from `@/theme` (`colors`, `spacing`, `radius`, `fontFamily`,
  `fontSize`, `shadows`) or the namespaced `theme` object.
- Color props take **role tokens** (`primary`, `success`, `danger`, `warning`,
  `info`, `ink`, `gray500`, …) — never raw hex.

---

## Theme tokens (`@/theme`)

| Token group | Keys |
|---|---|
| `colors` | `primary` `primaryInk` `accent` `accentSoft` · `success`/`successInk`/`successSoft` · `danger`/`dangerInk`/`dangerSoft` · `warning`/`warningSoft` · `info`/`infoSoft` · `ink` `inkSecondary` · `gray700`→`gray300` · `line` `lineSoft` · `bg` `surface` `surface2` · `darkBg` (reserved) |
| `spacing` | `xs:4` `sm:8` `md:12` `lg:16` `xl:24` `2xl:32` `3xl:48` |
| `radius` | `sm:12` `md:18` `lg:24` `full:9999` |
| `fontFamily` | `regular` `bold` `black` (Lato) |
| `fontSize` | `xs:11` `sm:13` `md:16` `lg:19` `xl:24` `2xl:32` |
| `shadows` | `sm` `md` `lg` (spread into a style) |

```tsx
import { colors, spacing, shadows } from '@/theme'
<View style={{ backgroundColor: colors.surface, padding: spacing.lg, ...shadows.md }} />
```

---

## AppText  · `import { AppText } from '@/components/ui/AppText'`

Themed text. Use instead of RN's `<Text>`.

| Prop | Type | Default |
|---|---|---|
| `weight` | `regular \| bold \| black` | `regular` |
| `size` | `xs \| sm \| md \| lg \| xl \| 2xl` | `md` |
| `color` | `ColorToken` | `ink` |
| `style`, …`TextProps` | — | — |

```tsx
<AppText weight="black" size="2xl">Good Evening</AppText>
<AppText size="sm" color="gray500">Subtitle</AppText>
```

---

## Button  · `import Button from '@/components/ui/Button'`

| Prop | Type | Default |
|---|---|---|
| `label` | `string` | — |
| `variant` | `primary \| secondary \| ghost \| danger` | `primary` |
| `size` | `sm \| md \| lg` | `md` |
| `loading` | `boolean` | `false` |
| `disabled` | `boolean` | — |
| `onPress` | `() => void` | — |

```tsx
<Button label="Add Transaction" onPress={save} />
<Button label="Delete" variant="danger" size="sm" />
<Button label="Saving…" loading />
```

---

## Icon  · `import Icon from '@/components/ui/Icon'`

Renders a glyph from the `lib/icons.ts` semantic map (`name="food"` → MaterialIcons `restaurant`).

| Prop | Type | Default |
|---|---|---|
| `name` | `IconName` (semantic) | — |
| `size` | `number` | `24` |
| `color` | `ColorToken` | `ink` |
| `container` | `none \| circle \| square` | `none` |
| `containerColor` | `ColorToken` | `accentSoft` |

```tsx
<Icon name="bell" size={28} color="gray500" />
<Icon name="food" container="circle" containerColor="accentSoft" color="primary" />
```

To add an icon: add a `semanticName: 'material-glyph'` line to `lib/icons.ts`.

---

## Input  · `import Input from '@/components/ui/Input'`

Text field with label, focus border, and error state. Extends `TextInputProps`.

| Prop | Type | Default |
|---|---|---|
| `label` | `string` | — |
| `error` | `string` | — |
| `size` | `sm \| md \| lg` | `md` |
| `value` / `onChangeText` | controlled (string) | — |
| …`TextInputProps` | `placeholder`, `keyboardType`, `secureTextEntry`, … | — |

```tsx
<Input label="Amount" placeholder="0.00" keyboardType="numeric"
       value={amount} onChangeText={setAmount} />
<Input label="Password" secureTextEntry error="Required" />
```

---

## Search  · `import Search from '@/components/ui/Search'`

Pill search field with a leading magnifier. Extends `TextInputProps`.

```tsx
<Search value={query} onChangeText={setQuery} placeholder="Search transactions" />
```

---

## Badge  · `import Badge from '@/components/ui/Badge'`

Status pill (uppercase).

| Prop | Type | Default |
|---|---|---|
| `label` | `string` | — |
| `status` | `paid \| pending \| overdue \| onTrack` | `onTrack` |
| `size` | `sm \| md` | `md` |
| `invert` | `boolean` (solid fill + white text) | `false` |

```tsx
<Badge label="Paid" status="paid" />
<Badge label="Overdue" status="overdue" invert />
```

---

## Chip  · `import Chip from '@/components/ui/Chip'`

Selectable filter chip. Extends `PressableProps`.

| Prop | Type | Default |
|---|---|---|
| `label` | `string` | — |
| `selected` | `boolean` | `false` |
| `disabled` | `boolean` | — |
| `onPress` | `() => void` | — |

```tsx
<Chip label="Food" selected={active === 'food'} onPress={() => setActive('food')} />
```

---

## Divider  · `import Divider from '@/components/ui/Divider'`

| Prop | Type | Default |
|---|---|---|
| `orientation` | `horizontal \| vertical` | `horizontal` |
| `color` | `ColorToken` | `line` |

```tsx
<Divider />
<Divider orientation="vertical" />   {/* needs a fixed-height row parent */}
```

---

## Avatar  · `import Avatar from '@/components/ui/Avatar'`

Type is inferred from which prop you pass: `uri` → photo, `initials` → initials, else `iconName`.

| Prop | Type | Default |
|---|---|---|
| `size` | `sm:32 \| md:44 \| lg:64` | `md` |
| `uri` | `string` (photo) | — |
| `initials` | `string` (first 2 chars) | — |
| `iconName` | `IconName` | `home` |
| `background` | `ColorToken` | `accentSoft` |

```tsx
<Avatar initials="JD" size="lg" />
<Avatar uri="https://…/me.jpg" />
<Avatar iconName="food" />
```

---

### Conventions
- **Static styles** → `StyleSheet.create` at the bottom of the file.
- **Dynamic / token- or state-driven styles** → inline in the component.
- No `:hover`/`:focus`/`:active` in RN — interaction state comes from
  `Pressable`'s `({ pressed })` callback or `useState` + `onFocus`/`onBlur`.
