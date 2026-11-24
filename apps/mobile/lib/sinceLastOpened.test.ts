import { test } from "node:test";
import assert from "node:assert/strict";
import { sinceCopy } from "./sinceLastOpened";

test("opened earlier today with nothing since: one line", () => {
  assert.deepEqual(sinceCopy("Today", 0, ""), {
    title: "Nothing new since you last opened",
    when: null,
    body: null,
    label: "Nothing new since you last opened. Opens Activity.",
  });
});

test("an older open, or something logged: the title, when, and what happened", () => {
  assert.deepEqual(sinceCopy("Yesterday", 0, ""), {
    title: "Since you last opened",
    when: "Yesterday",
    body: "Nothing logged since then",
    label: "Since you last opened, Yesterday: Nothing logged since then. Opens Activity.",
  });
  assert.equal(sinceCopy("Today", 4, "4 transactions · ₹1,860.00 spent").body, "4 transactions · ₹1,860.00 spent");
});
