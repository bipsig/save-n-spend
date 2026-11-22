import { test } from "node:test";
import assert from "node:assert/strict";
import { duePhrase as shared } from "@save-n-spend/types";
import { duePhrase } from "./duePhrase";

test("the API's due phrase is the app's, word for word", () => {
    for (let d = -40; d <= 40; d += 1) assert.equal(duePhrase(d), shared(d), `days ${d}`);
    assert.deepEqual([-3, -1, 0, 1, 3].map(duePhrase), ["overdue by 3 days", "overdue by 1 day", "due today", "due tomorrow", "due in 3 days"]);
});
