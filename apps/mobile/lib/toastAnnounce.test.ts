import { test } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";

const spoken: string[] = [];
fake("react-native", { AccessibilityInfo: { announceForAccessibility: (s: string) => spoken.push(s) } });
const noop = () => {};
fake("@/lib/haptics", { haptics: { success: noop, error: noop, warning: noop, tap: noop } });

const { toast, useToast, toastAnnouncement } = require("../store/toast") as typeof import("../store/toast");

test("every toast is spoken, with its action named after the message", () => {
  toast.success("Saved");
  toast.action("info", "Deleted Tea.", { label: "Undo", onPress: noop });
  useToast.getState().dismiss();
  assert.deepEqual(spoken, ["Saved", "Deleted Tea. Undo"]);
});

test("the announcement doesn't double the full stop", () => {
  assert.equal(toastAnnouncement("Deleted", { label: "Undo", onPress: noop }), "Deleted. Undo");
  assert.equal(toastAnnouncement("Deleted…", { label: "Undo", onPress: noop }), "Deleted. Undo");
  assert.equal(toastAnnouncement("Couldn't save."), "Couldn't save.");
});
