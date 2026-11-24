import { test } from "node:test";
import assert from "node:assert/strict";
import { iconMap } from "./icons";
import { defaultCategories } from "../../api/src/data/defaultCategories";
import { ACCOUNT_LOOK, CATEGORY_LOOK } from "../../api/src/constants";

test("every icon the server gives a new user's categories and accounts is one the app can draw", () => {
  const given = [
    ...defaultCategories.flatMap((c) => [c.icon, ...(c.children ?? []).map((child) => child.icon)]),
    ...Object.values(ACCOUNT_LOOK).map((look) => look.icon),
    CATEGORY_LOOK.icon,
  ];
  assert.deepEqual(given.filter((icon) => !(icon in iconMap)), []);
});
