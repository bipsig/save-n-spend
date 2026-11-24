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

The primitives in this directory: `AmountHeroInput`, `AppText`, `ArchivedMark`, `Avatar`, `Badge`, `Button`,
`Caps`, `CategoryForm`, `CategoryName`, `ChartLegend`, `ChartTooltip`, `Chip`, `ColorPicker`,
`DateField`, `Divider`, `DragList`, `Fab`, `FieldError`, `FieldRow`, `FormError`, `GhostTitleInput`, `HoldButton`, `Icon`, `IconButton`,
`IconPicker`, `Input`, `KeyboardDoneBar`, `ListEnd`, `Money`, `PasswordMeter`, `PeriodNav`, `PressableScale`,
`Search`, `SectionHeader`, `SegmentedControl`, `ServerWakingStrip` (`ServerWakingNotice`,
`ServerWakingAnnouncer`), `StatTile` (`StatTile`, `StatRow`), `Toggle`.

The 2.8.2 shared pieces, in one line each (props and rules in the design system):

| Piece | What it is for |
|---|---|
| `components/shell/ScreenHeader` | The one header: title (one line, shrinks to 24 pt, then "…"), back or close, the privacy eye, and actions passed as data. Screens get it through `ScreenScaffold`'s `title`, `back`, `actions` and `peek` props. |
| `IconButton` | The 40 pt header circle (44 pt target), with a required VoiceOver label. |
| `FieldRow` (2.8.7) | The "tap to pick" row: icon or chip, caps label over the value, chevron. Read-only without `onPress`; `dim` for a closed toggle; `error` under the row. `DateField` is one. |
| `FieldError`, `FormError` (2.8.7) | A field's problem under it; the form's problem in the sheet footer (`SheetFooter`). Both xs bold danger. |
| `Caps` | The small uppercase caption. Write sentence case; the style adds the capitals. `size="sm"` for tight slots; `weight="black"` for a caption on a filled badge (the transaction detail sheet's category). 2.8.8 moved `Input`'s label and `CategoryForm`'s captions onto it. |
| `ListEnd` (2.8.8) | The foot of every paged list: spinner while a page loads, "Couldn't load more · Try again", "That's everything" after a second page. Rule in `lib/listEnd.ts`. |
| `StatTile`, `StatRow` | Caption above an exact figure, optional change line; the row drops columns when a figure won't fit. |
| `ChartLegend` | Dot, line or dashed marks; `layout="column"` with right-aligned values beside a donut. |
| `ChartTooltip` | The 164 pt bubble every chart uses. |
| `SegmentedControl size="sm"` | Ranges and in-screen tabs (Trends, Overview \| Trends, export spans). |
| `ServerWakingNotice` | "The server is starting up · showing saved data" while Render wakes (D19). |
| `lib/format/` | Money, compact axis ticks, percentages, dates, periods and counts, following D6 to D14. |
| `lib/chartSummary.ts` | The one-sentence VoiceOver summary every chart carries. |

The 2.8.3 state pieces (how a screen adopts them:
[Handle loading, empty, and error states](../../../../docs/mobile-patterns.md#handle-loading-empty-and-error-states)):

| Piece | What it is for |
|---|---|
| `ScreenScaffold` `states` | The fetch state `{ loading, refreshing, error, hasData, refetch, fetchedAt }`: picks the one strip under the header and makes `refetch` the pull-to-refresh. |
| `components/shell/ScreenStrip` | The strip slot: offline (with this screen's data age), else "The server is starting up", else "Couldn't refresh · Try again" (`RefreshFailedStrip`). |
| `components/shell/ScreenRefresh` | `useScreenRefresh(onRefresh)`: the one brand-tinted `RefreshControl`, for the scaffold and for Activity's `FlatList`. |
| `components/states/ScreenStates` | The body: skeleton before the first answer, `ErrorState` only with nothing to show, `NotFoundState`, else the content. `ListSkeleton` is its default skeleton. |
| `components/states/NotFoundState` | "This trip isn't here any more" + Go back; `thing` names the record. |
| `components/states/HomeCard` | A Home card that fails keeps its caption and height and says "Couldn't load this · Try again" (D16 A). |
| `lib/onlineGate.ts` | `useOnlineGate(label)`: a write that doesn't queue is disabled and reads "Needs a connection" while offline. |

Charts are not primitives: they live in `components/charts/`, and their colour, axis, legend,
tooltip and VoiceOver rules are in
[Chart conventions](../../../../docs/design-system.md#chart-conventions). Formatting rules are in
[Formatting rules](../../../../docs/design-system.md#formatting-rules).
