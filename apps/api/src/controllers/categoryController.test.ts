import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { validate } from "../middleware/validate";
import { toFailure } from "../middleware/errorHandler";
import { listCategoriesSchemas } from "../schemas/categorySchema";
import { listFilter } from "./categoryController";

const mw = validate(listCategoriesSchemas);
const includeOf = (req: Request) => (req.valid?.query as { include?: "archived" }).include;

const run = (query: Record<string, string>) => new Promise<{ err: unknown; req: Request }>((resolve) => {
    const req = { params: {}, query, originalUrl: "/api/v1/categories" } as unknown as Request;
    mw(req, {} as Response, (err?: unknown) => resolve({ err, req }));
});

test("GET /categories without include lists live categories only, as before", async () => {
    const { err, req } = await run({});
    assert.equal(err, undefined);
    assert.deepEqual(listFilter("u1", includeOf(req)), { userId: "u1", isArchived: false });
});

test("an unknown query parameter is dropped, so the reply is unchanged", async () => {
    const { err, req } = await run({ utm: "x" });
    assert.equal(err, undefined);
    assert.deepEqual(req.valid?.query, {});
});

test("include=archived lists live and archived together", async () => {
    const { err, req } = await run({ include: "archived" });
    assert.equal(err, undefined);
    assert.deepEqual(listFilter("u1", includeOf(req)), { userId: "u1" });
});

test("any other include value is refused with 400", async () => {
    const { err } = await run({ include: "everything" });
    const f = toFailure(err, { originalUrl: "/api/v1/categories" });
    assert.deepEqual([f.status, f.code], [400, "invalid_input"]);
});
