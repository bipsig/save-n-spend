import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { withAlpha } from "../theme/colors";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/colorTokens.test.ts
//
// Gaps row 121: colours live in theme/ (the app) and lib/pdfShell.ts (the paper palette).
// A hex or a tinted rgba anywhere else fails here; white and black at an alpha are allowed.

const ROOT = join(__dirname, "..");
const ALLOWED = new Set(["lib/pdfShell.ts"]);
const HEX = /#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?\b|["'`]#[0-9A-Fa-f]{3}["'`]/g;
const RGBA = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g;

const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

test("withAlpha writes a token at an alpha", () => {
  assert.equal(withAlpha("#9B8CFF", 0.55), "rgba(155,140,255,0.55)");
  assert.equal(withAlpha("#08060F", 0.5), "rgba(8,6,15,0.5)");
});

test("no hex or tinted rgba outside theme/ and the PDF palette", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts")) files.push(path);
    }
  };
  for (const dir of ["app", "components", "lib", "store"]) walk(join(ROOT, dir));
  const found: string[] = [];
  for (const file of files) {
    const rel = file.slice(ROOT.length + 1);
    if (ALLOWED.has(rel)) continue;
    const text = withoutComments(readFileSync(file, "utf8"));
    for (const m of text.matchAll(HEX)) found.push(`${rel}: ${m[0]}`);
    for (const m of text.matchAll(RGBA)) {
      const rgb = [m[1], m[2], m[3]].join(",");
      if (rgb !== "255,255,255" && rgb !== "0,0,0") found.push(`${rel}: ${m[0]}`);
    }
  }
  assert.deepEqual(found, []);
});
