import { fitFontSize } from "./fitText";
import type { IconName } from "./icons";

export type HeaderActionKind = "reorder" | "markAllRead" | "export" | "edit" | "new";

export type HeaderAction = {
  kind: HeaderActionKind;
  /** What VoiceOver says. Name the thing: "New budget", "Edit trip", "Export". */
  label: string;
  onPress: () => void;
  /** Drawn dimmed, e.g. Edit while the record is still loading. */
  disabled?: boolean;
  /** Reorder only: the screen is in reorder mode, so the circle shows a filled tick. */
  selected?: boolean;
};

/** Every header action is one circle this size (mockup 01, D1 C). */
export const HEADER_ACTION_SIZE = 40;
/** Apple's minimum touch target. */
export const MIN_TARGET = 44;
/** A title that doesn't fit shrinks to this share of 30 pt (24 pt) before it ends in "…". */
export const TITLE_MIN_SCALE = 0.8;

/** A title's size: 30 pt when it fits, else just small enough, never below 24 pt (then "…"). */
export const titleFontSize = (naturalWidth: number, boxWidth: number, base: number): number =>
  fitFontSize(naturalWidth, boxWidth, base, TITLE_MIN_SCALE);

// New is last so it always sits at the right edge, whatever else the screen has.
const ORDER: HeaderActionKind[] = ["reorder", "markAllRead", "export", "edit", "new"];

export const orderHeaderActions = (actions: readonly HeaderAction[]): HeaderAction[] =>
  actions
    .map((action, i) => ({ action, i }))
    .sort((a, b) => ORDER.indexOf(a.action.kind) - ORDER.indexOf(b.action.kind) || a.i - b.i)
    .map(({ action }) => action);

const ICONS: Record<HeaderActionKind, IconName> = {
  reorder: "reorder",
  markAllRead: "doneAll",
  export: "download",
  edit: "edit",
  new: "add",
};

export const headerActionIcon = (action: Pick<HeaderAction, "kind" | "selected">): IconName =>
  action.kind === "reorder" && action.selected ? "check" : ICONS[action.kind];

/** Padding that grows a control of `size` to at least the minimum touch target. */
export const hitSlopFor = (size: number, target = MIN_TARGET): number =>
  Math.max(0, Math.ceil((target - size) / 2));
