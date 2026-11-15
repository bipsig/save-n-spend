import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { z } from "../schemas/z";
import { objectId, page, positiveMoney } from "../schemas/fields";
import { AppError } from "../utils/AppError";
import { validate } from "./validate";
import { toFailure } from "./errorHandler";

/** Runs the middleware; resolves with what it passed to next(). */
const run = (mw: ReturnType<typeof validate>, r: Partial<Request>) => new Promise<{ err: unknown; req: Request }>((resolve) => {
    const req = { params: {}, query: {}, originalUrl: "/api/v1/bills/x", ...r } as Request;
    mw(req, {} as Response, (err?: unknown) => resolve({ err, req }));
});

const schemas = {
    params: z.object({ id: objectId("Bill") }),
    query: z.object({ page }),
    body: z.object({ amount: positiveMoney, note: z.string().optional() }),
};
const mw = validate(schemas);
const ID = "6aa0fcbd0bd274f50c193770";

test("valid input lands on req.valid; req.query and req.body are left as sent", async () => {
    const { err, req } = await run(mw, { params: { id: ID }, query: { page: "2", utm: "x" }, body: { amount: 500 }, originalUrl: `/api/v1/bills/${ID}` });
    assert.equal(err, undefined);
    assert.deepEqual(req.valid, { params: { id: ID }, query: { page: 2 }, body: { amount: 500 } });
    assert.deepEqual(req.query, { page: "2", utm: "x" });
});

test("a malformed path id is 404 not_found, named after the resource", async () => {
    const { err } = await run(mw, { params: { id: "abc" }, body: { amount: 5 }, originalUrl: "/api/v1/bills/abc/pay" });
    assert.ok(err instanceof AppError);
    const f = toFailure(err, { originalUrl: "/api/v1/bills/abc/pay" });
    assert.deepEqual([f.status, f.code, f.message], [404, "not_found", "That bill doesn't exist any more"]);
});

test("bodies are strict: an unknown field is refused", async () => {
    const { err } = await run(mw, { params: { id: ID }, body: { amount: 5, foo: 1 } });
    const f = toFailure(err, { originalUrl: "/x" });
    assert.deepEqual([f.status, f.code, f.message], [400, "invalid_input", "This request had something the server didn't expect. Please update the app"]);
});

test("queries strip unknown parameters, even with a strict schema", async () => {
    const { err, req } = await run(validate({ query: z.strictObject({ page }) }), { query: { page: "1", other: "y" } });
    assert.equal(err, undefined);
    assert.deepEqual(req.valid?.query, { page: 1 });
});

test("a loose body (backup documents) keeps its extra fields", async () => {
    const { err, req } = await run(validate({ body: z.looseObject({ version: z.literal(1) }) }), { body: { version: 1, extra: true } });
    assert.equal(err, undefined);
    assert.deepEqual(req.valid?.body, { version: 1, extra: true });
});

test("a missing body is {}: body-less actions pass, required fields are named", async () => {
    const empty = await run(validate({ body: z.object({ letGo: z.array(z.string()).default([]) }) }), { body: undefined });
    assert.equal(empty.err, undefined);
    assert.deepEqual(empty.req.valid?.body, { letGo: [] });
    const needed = await run(mw, { params: { id: ID }, body: undefined });
    assert.equal(toFailure(needed.err, { originalUrl: "/x" }).message, "Amount is required");
});

test("the handler never runs on bad input (so no database read happens first)", async () => {
    let called = false;
    const req = { params: { id: "bad" }, query: {}, body: {}, originalUrl: "/api/v1/bills/bad" } as unknown as Request;
    await new Promise<void>((resolve) => mw(req, {} as Response, (err?: unknown) => { if (!err) called = true; resolve(); }));
    assert.equal(called, false);
});
