import { test } from "node:test";
import assert from "node:assert/strict";
import { byFolder, failures } from "./coverage";

const record = (file: string, found: number, hit: number) => `TN:\nSF:${file}\nDA:1,1\nLF:${found}\nLH:${hit}\nend_of_record`;

test("byFolder sums lines per first folder under src/; the gate names each folder under its floor", () => {
    const lcov = [
        record("src/services/a.ts", 100, 90), record("src/services/b.ts", 100, 60),
        record("/abs/apps/api/src/controllers/c.ts", 10, 9), record("src/app.ts", 4, 4),
    ].join("\n");
    const t = byFolder(lcov);
    assert.deepEqual([t.get("services")!.found, t.get("services")!.hit], [200, 150]);
    assert.deepEqual([t.get("controllers")!.hit, t.get("(src)")!.found], [9, 4]);
    assert.deepEqual(failures(t, { services: 80, controllers: 80, middleware: 80 }), ["services 75.0% < 80%", "middleware 0.0% < 80%"]);
    assert.deepEqual(failures(t, { controllers: 90 }), []);
});
