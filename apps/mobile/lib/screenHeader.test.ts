import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HEADER_ACTION_SIZE,
  MIN_TARGET,
  TITLE_MIN_SCALE,
  headerActionIcon,
  hitSlopFor,
  orderHeaderActions,
  titleFontSize,
  type HeaderAction,
} from "./screenHeader";
import { appItems, moneyItems, screenTitles } from "../data/menu";

const noop = () => {};
const act = (kind: HeaderAction["kind"], label: string = kind): HeaderAction => ({ kind, label, onPress: noop });

test("New sits last at the right edge, whatever order the screen passes", () => {
  const kinds = (list: HeaderAction[]) => orderHeaderActions(list).map((a) => a.kind);
  assert.deepEqual(kinds([act("new"), act("export")]), ["export", "new"]);
  assert.deepEqual(kinds([act("edit"), act("export")]), ["export", "edit"]);
  assert.deepEqual(kinds([act("new"), act("reorder")]), ["reorder", "new"]);
  assert.deepEqual(kinds([act("new"), act("edit"), act("markAllRead"), act("export")]), ["markAllRead", "export", "edit", "new"]);
});

test("ordering keeps same-kind actions in the order given and doesn't touch the input", () => {
  const input = [act("new", "b"), act("export", "x"), act("new", "a")];
  assert.deepEqual(orderHeaderActions(input).map((a) => a.label), ["x", "b", "a"]);
  assert.deepEqual(input.map((a) => a.label), ["b", "x", "a"]);
  assert.deepEqual(orderHeaderActions([]), []);
});

test("each kind has one glyph; reorder shows a tick while the mode is on", () => {
  assert.equal(headerActionIcon({ kind: "new" }), "add");
  assert.equal(headerActionIcon({ kind: "export" }), "download");
  assert.equal(headerActionIcon({ kind: "edit" }), "edit");
  assert.equal(headerActionIcon({ kind: "reorder" }), "reorder");
  assert.equal(headerActionIcon({ kind: "markAllRead" }), "doneAll");
  assert.equal(headerActionIcon({ kind: "reorder", selected: true }), "check");
  assert.equal(headerActionIcon({ kind: "edit", selected: true }), "edit");
});

test("every header control reaches the 44 pt touch target", () => {
  assert.equal(HEADER_ACTION_SIZE + 2 * hitSlopFor(HEADER_ACTION_SIZE) >= MIN_TARGET, true);
  assert.equal(hitSlopFor(40), 2);
  assert.equal(hitSlopFor(36), 4);
  assert.equal(hitSlopFor(35), 5);
  assert.equal(hitSlopFor(44), 0);
  assert.equal(hitSlopFor(60), 0);
});

test("titles shrink from 30 pt to 24 pt before they end in an ellipsis", () => {
  assert.equal(Math.round(30 * TITLE_MIN_SCALE), 24);
});

test("a title keeps 30 pt when it fits, shrinks just enough, and stops at 24 pt", () => {
  assert.equal(titleFontSize(0, 300, 30), 30, "not measured yet");
  assert.equal(titleFontSize(200, 0, 30), 30, "box not measured yet");
  assert.equal(titleFontSize(300, 300, 30), 30);
  assert.equal(titleFontSize(330, 300, 30), 27, "27.27 rounds down to 27");
  assert.equal(titleFontSize(310, 300, 30), 29);
  assert.equal(titleFontSize(360, 300, 30), 25);
  assert.equal(titleFontSize(375, 300, 30), 24);
  assert.equal(titleFontSize(900, 300, 30), 24, "a long name stops at 24 pt and is truncated");
});

test("menu rows use the screens' own short names (D3)", () => {
  const labels = Object.fromEntries([...moneyItems, ...appItems].map((i) => [i.key, i.label]));
  assert.deepEqual(labels, {
    budget: "Budget",
    bills: "Bills",
    cashflow: "Cash flow",
    goals: "Goals",
    investments: "Investments",
    trips: "Trips",
    reviews: "Reviews",
    settings: "Settings",
    help: "Help & FAQ",
  });
  assert.equal(screenTitles.activity, "Activity");
  assert.equal(screenTitles.accounts, "Accounts");
  assert.equal(screenTitles.categories, "Categories");
});
