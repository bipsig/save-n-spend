import { test } from "node:test";
import assert from "node:assert/strict";
import type { Model } from "mongoose";
import { pageOf, paginate, withOldPageFields } from "./paginate";

test("withOldPageFields (temporary): before 2.8.0, or with no version, also docs and totalDocs", () => {
    const page = pageOf(["a", "b"], 1, 2, 5);
    for (const v of [undefined, "", "2.6.0", "2.7.1", "1.9.9", "garbage"]) {
        assert.deepEqual(withOldPageFields(page, v), { ...page, docs: ["a", "b"], totalDocs: 5 }, String(v));
    }
    for (const v of ["2.8.0", "2.8.1", "2.10.0", "3.0.0"]) assert.deepEqual(withOldPageFields(page, v), page, v);
});

test("pageOf: hasNextPage is whether anything follows this page", () => {
    assert.deepEqual(pageOf(["a", "b"], 1, 2, 5), { items: ["a", "b"], page: 1, limit: 2, hasNextPage: true, total: 5 });
    assert.equal(pageOf(["e"], 3, 2, 5).hasNextPage, false);
    assert.equal(pageOf(["c", "d"], 2, 2, 4).hasNextPage, false);
    assert.equal(pageOf([], 1, 20, 0).hasNextPage, false);
    assert.equal(pageOf([], 9, 20, 3).total, 3, "a page past the end still counts every match");
});

test("paginate: ties broken on _id, skip and limit from the page, total over every match", async () => {
    const calls: Record<string, unknown> = {};
    let leaned = false;
    const query = {
        sort(s: unknown) { calls.sort = s; return query; },
        skip(n: number) { calls.skip = n; return query; },
        limit(n: number) { calls.limit = n; return query; },
        lean() { leaned = true; return Promise.resolve(["x"]); },
        then(resolve: (v: unknown) => void) { resolve(["x"]); },
    };
    const model = {
        find(f: unknown) { calls.find = f; return query; },
        countDocuments(f: unknown) { calls.count = f; return Promise.resolve(41); },
    } as unknown as Model<unknown>;

    const page = await paginate(model, { userId: "u" }, { page: 3, limit: 20, sort: { occurredAt: -1 } });
    assert.deepEqual(calls, { find: { userId: "u" }, sort: { occurredAt: -1, _id: 1 }, skip: 40, limit: 20, count: { userId: "u" } });
    assert.deepEqual(page, { items: ["x"], page: 3, limit: 20, hasNextPage: false, total: 41 });

    await paginate(model, {}, { page: 1, limit: 5, sort: { createdAt: -1 }, lean: true });
    assert.equal(leaned, true);
});
