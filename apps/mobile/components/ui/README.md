# UI Primitives

The base component vocabulary for Save n Spend. Every screen is composed from
these — they never hard-code color, spacing, or type; they consume **theme
tokens** from `@/theme`.

The reference for the tokens and for every component's props now lives in
[`docs/design-system.md`](../../../../docs/design-system.md), alongside the rest
of the developer guide. See also
[`docs/mobile-patterns.md`](../../../../docs/mobile-patterns.md) for how screens,
forms, and sheets are put together.

This file used to duplicate those tables and had drifted out of date. Keeping a
single copy is the reason it no longer does.

The primitives in this directory: `AmountHeroInput`, `AppText`, `Avatar`, `Badge`, `Button`,
`CategoryForm`, `CategoryName`, `Chip`, `ColorPicker`, `DateField`, `Divider`, `DragList`, `Fab`,
`GhostTitleInput`, `HoldButton`, `Icon`, `IconPicker`, `Input`, `KeyboardDoneBar`, `Money`,
`PasswordMeter`, `PeriodNav`, `PressableScale`, `Search`, `SectionHeader`, `SegmentedControl`,
`Toggle`. Charts are not primitives: they live in `components/charts/`, and their colour,
axis and tooltip rules are in
[Chart conventions](../../../../docs/design-system.md#chart-conventions).
