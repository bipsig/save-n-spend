import { test } from "node:test";
import assert from "node:assert/strict";
import { RELEASES } from "../data/releaseNotes";
import { linkDestination } from "./whatsNewLinks";

// Run from apps/api: node --require ts-node/register --test ../mobile/lib/whatsNewLinks.test.ts

test("every release-note link names where it goes, for its accessibility label", () => {
  for (const r of RELEASES) {
    for (const n of r.notes) {
      if (!n.link) continue;
      assert.ok(linkDestination(n.link), `${r.version}: ${n.link} has no destination name`);
    }
  }
});

test("an unknown link has no name", () => {
  assert.equal(linkDestination("/nowhere"), undefined);
});
