import { test } from "node:test";
import assert from "node:assert/strict";
import User from "../models/User";
import Account from "../models/Account";
import { INTERNAL_FIELDS, toDTO, toDTOs } from "./dto";

test("a lean object loses the internal fields and keeps everything else", () => {
    const lean = { _id: "a1", name: "Bank", balance: 500, userId: "u1", __v: 3 };
    assert.deepEqual(toDTO(lean), { _id: "a1", name: "Bank", balance: 500 });
    assert.deepEqual(toDTOs([lean, { ...lean, _id: "a2" }]).map((d) => d._id), ["a1", "a2"]);
});

test("a document goes through its own toJSON (User still hides the password)", () => {
    const user = new User({ name: "A", email: "a@example.test", password: "secret-hash", pushToken: "ExponentPushToken[x]", googleId: null });
    const dto = toDTO(user) as Record<string, unknown>;
    for (const f of [...INTERNAL_FIELDS, "password", "totpSecret"]) assert.equal(f in dto, false, f);
    assert.equal(dto.email, "a@example.test");
    assert.ok(dto.prefs);
});

test("the JSON the app reads is unchanged apart from the dropped fields", () => {
    const account = new Account({ userId: "6aa0fcbd0bd274f50c193770", name: "Cash", type: "cash", startingBalance: 0, balance: 0 });
    const before = JSON.parse(JSON.stringify(account));
    const after = JSON.parse(JSON.stringify(toDTO(account)));
    for (const f of INTERNAL_FIELDS) delete before[f];
    assert.deepEqual(after, before);
});
