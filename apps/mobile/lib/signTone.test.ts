import { test } from "node:test";
import assert from "node:assert/strict";
import { signTone, toneSoft } from "./signTone";

test("a net or gain: positive is income colour, negative is expense colour, zero neutral", () => {
  assert.equal(signTone(277000), "success");
  assert.equal(signTone(-277000), "danger");
  assert.equal(signTone(0), "inkDim");
  assert.equal(signTone(-0), "inkDim");
});

test("spending, where a rise is bad news", () => {
  assert.equal(signTone(12, { goodWhen: "down" }), "danger");
  assert.equal(signTone(-12, { goodWhen: "down" }), "success");
  assert.equal(signTone(0, { goodWhen: "down" }), "inkDim");
});

test("the neutral colour can be chosen, and a missing figure is neutral", () => {
  assert.equal(signTone(0, { neutral: "ink" }), "ink");
  assert.equal(signTone(Number.NaN, { neutral: "ink" }), "ink");
});

test("each tone has its pill background", () => {
  assert.equal(toneSoft("success"), "successSoft");
  assert.equal(toneSoft("danger"), "dangerSoft");
  assert.equal(toneSoft("inkDim"), "surface2");
});
