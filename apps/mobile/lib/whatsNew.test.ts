import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { RELEASES } from "../data/releaseNotes";
import type { Release, ReleaseNote } from "../data/releaseNotes";
import {
  compareVersions,
  countsOf,
  firstSentence,
  foldNotes,
  formatReleaseDate,
  highlightsOf,
  monthGroups,
  previousRelease,
  releaseFor,
  sectionsOf,
  sheetFor,
  shortVersion,
  showsNewTag,
} from "./whatsNew";

// Run from apps/api: node --require ts-node/register --test ../mobile/lib/whatsNew.test.ts

const note = (kind: ReleaseNote["kind"], title: string, over: Partial<ReleaseNote> = {}): ReleaseNote => ({ kind, title, ...over });
const rel = (version: string, date: string, notes: ReleaseNote[], over: Partial<Release> = {}): Release => ({
  version, build: 1, date, headline: `Headline ${version}`, notes, ...over,
});

const FIXTURE: Release[] = [
  rel("2.7.0", "2026-11-21", [note("new", "Seven.")]),
  rel("2.6.1", "2026-11-18", [], { quiet: true }),
  rel("2.6.0", "2026-11-14", [note("new", "Six.")]),
  rel("2.5.0", "2026-11-12", [note("new", "Five.")]),
  rel("2.4.0", "2026-10-03", [note("improved", "Four.")]),
];

test("compareVersions orders numerically, not as text", () => {
  assert.ok(compareVersions("1.10.0", "1.9.0") > 0);
  assert.ok(compareVersions("2.3.0", "2.3.1") < 0);
  assert.equal(compareVersions("2.6.0", "2.6.0"), 0);
  assert.equal(compareVersions("2.6", "2.6.0"), 0);
  assert.ok(compareVersions("10.0.0", "9.9.9") > 0);
});

test("releaseFor and previousRelease", () => {
  assert.equal(releaseFor("2.5.0", FIXTURE)?.headline, "Headline 2.5.0");
  assert.equal(releaseFor("9.9.9", FIXTURE), undefined);
  assert.equal(previousRelease("2.7.0", FIXTURE)?.version, "2.6.1");
  assert.equal(previousRelease("2.6.0", FIXTURE)?.version, "2.5.0");
  assert.equal(previousRelease("2.4.0", FIXTURE), undefined);
  // Not listed: still the newest one older than it.
  assert.equal(previousRelease("2.6.5", FIXTURE)?.version, "2.6.1");
});

test("counts and sections: New, Improved, Fixed, empty ones left out", () => {
  const r = rel("1.0.0", "2026-09-04", [
    note("fixed", "F1."), note("new", "N1."), note("new", "N2."), note("fixed", "F2."),
  ]);
  assert.deepEqual(countsOf(r), { new: 2, improved: 0, fixed: 2 });
  const sections = sectionsOf(r);
  assert.deepEqual(sections.map((s) => s.kind), ["new", "fixed"]);
  assert.deepEqual(sections[1].notes.map((n) => n.title), ["F1.", "F2."]);
});

test("foldNotes: six or fewer in full, more fold to five", () => {
  const notes = (n: number) => Array.from({ length: n }, (_, i) => note("new", `N${i}.`));
  assert.deepEqual(foldNotes(notes(6), false), { shown: notes(6), hidden: 0 });
  const folded = foldNotes(notes(10), false);
  assert.equal(folded.shown.length, 5);
  assert.equal(folded.hidden, 5);
  assert.deepEqual(foldNotes(notes(10), true), { shown: notes(10), hidden: 0 });
  assert.deepEqual(foldNotes(notes(7), false).hidden, 2);
});

test("highlightsOf: marked first, else the first three new, never on quiet", () => {
  const marked = rel("1.0.0", "2026-09-04", [
    note("new", "A."), note("improved", "B.", { highlight: true }), note("new", "C.", { highlight: true }),
  ]);
  assert.deepEqual(highlightsOf(marked).map((n) => n.title), ["B.", "C."]);

  const unmarked = rel("1.0.0", "2026-09-04", [
    note("fixed", "X."), note("new", "A."), note("new", "B."), note("new", "C."), note("new", "D."),
  ]);
  assert.deepEqual(highlightsOf(unmarked).map((n) => n.title), ["A.", "B.", "C."]);

  const tooMany = rel("1.0.0", "2026-09-04", ["A.", "B.", "C.", "D."].map((t) => note("new", t, { highlight: true })));
  assert.equal(highlightsOf(tooMany).length, 3);

  assert.deepEqual(highlightsOf(rel("1.0.0", "2026-09-04", [note("new", "A.", { highlight: true })], { quiet: true })), []);
});

test("firstSentence cuts at the first full stop or colon", () => {
  assert.equal(firstSentence("A Trends tab on Investments, once there's some history:"), "A Trends tab on Investments, once there's some history");
  assert.equal(firstSentence("Export a PDF, from any holding. Choose a period."), "Export a PDF, from any holding");
  assert.equal(firstSentence("Match Splitwise: type what it says."), "Match Splitwise");
  assert.equal(firstSentence("Fixed in 2.6.0 for good."), "Fixed in 2.6.0 for good");
  assert.equal(firstSentence('Privacy mode shows amounts as "₹ ••••". Tap any amount.'), 'Privacy mode shows amounts as "₹ ••••"');
  assert.equal(firstSentence("No full stop at all"), "No full stop at all");
});

test("shortVersion and formatReleaseDate", () => {
  assert.equal(shortVersion("2.4.0"), "2.4");
  assert.equal(shortVersion("2.3.1"), "2.3.1");
  assert.equal(shortVersion("1.10.0"), "1.10");
  assert.equal(formatReleaseDate("2026-11-14"), "14 Nov 2026");
  assert.equal(formatReleaseDate("2026-09-04", false), "4 Sep");
});

test("monthGroups keeps order and labels each month", () => {
  const groups = monthGroups(FIXTURE, "America/Los_Angeles");
  assert.deepEqual(groups.map((g) => g.label), ["November 2026", "October 2026"]);
  assert.deepEqual(groups[0].releases.map((r) => r.version), ["2.7.0", "2.6.1", "2.6.0", "2.5.0"]);
  // A calendar day doesn't move with the zone: 1 Oct is October even west of Greenwich.
  assert.equal(monthGroups([rel("1.0.0", "2026-10-01", [])], "Pacific/Honolulu")[0].label, "October 2026");
});

test("sheetFor: an upgrade shows the current release", () => {
  const sheet = sheetFor({ current: "2.6.0", lastSeen: "2.5.0", freshInstall: false }, FIXTURE);
  assert.equal(sheet?.release.version, "2.6.0");
  assert.deepEqual(sheet?.alsoNew, []);
});

test("sheetFor: skipped versions are named, quiet ones left out", () => {
  const sheet = sheetFor({ current: "2.7.0", lastSeen: "2.4.0", freshInstall: false }, FIXTURE);
  assert.deepEqual(sheet?.alsoNew.map((r) => r.version), ["2.6.0", "2.5.0"]);
});

test("sheetFor: null on fresh install, when seen, on a quiet or unknown current", () => {
  assert.equal(sheetFor({ current: "2.7.0", lastSeen: null, freshInstall: true }, FIXTURE), null);
  assert.equal(sheetFor({ current: "2.7.0", lastSeen: "2.7.0", freshInstall: false }, FIXTURE), null);
  assert.equal(sheetFor({ current: "2.6.0", lastSeen: "2.7.0", freshInstall: false }, FIXTURE), null);
  assert.equal(sheetFor({ current: "2.6.1", lastSeen: "2.6.0", freshInstall: false }, FIXTURE), null);
  assert.equal(sheetFor({ current: "3.0.0", lastSeen: "2.7.0", freshInstall: false }, FIXTURE), null);
});

test("sheetFor: no lastSeen still shows the sheet, with nothing named as skipped", () => {
  const sheet = sheetFor({ current: "2.7.0", lastSeen: null, freshInstall: false }, FIXTURE);
  assert.equal(sheet?.release.version, "2.7.0");
  assert.deepEqual(sheet?.alsoNew, []);
});

test("showsNewTag", () => {
  assert.equal(showsNewTag("2.7.0", "2.6.0", FIXTURE), true);
  assert.equal(showsNewTag("2.7.0", null, FIXTURE), true);
  assert.equal(showsNewTag("2.7.0", "2.7.0", FIXTURE), false);
  assert.equal(showsNewTag("2.6.1", "2.6.0", FIXTURE), false);
  assert.equal(showsNewTag("3.0.0", "2.7.0", FIXTURE), false);
});

// The bundled notes themselves.

test("RELEASES: newest first, unique, dated, with no amounts", () => {
  for (let i = 1; i < RELEASES.length; i++) {
    assert.ok(compareVersions(RELEASES[i - 1].version, RELEASES[i].version) > 0, `${RELEASES[i - 1].version} before ${RELEASES[i].version}`);
    assert.ok(RELEASES[i - 1].build > RELEASES[i].build);
    assert.ok(RELEASES[i - 1].date >= RELEASES[i].date);
  }
  assert.equal(RELEASES[RELEASES.length - 1].version, "1.0.0");
  for (const r of RELEASES) {
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.quiet || r.notes.length > 0, `${r.version} has notes`);
    assert.ok(r.notes.filter((n) => n.highlight).length <= 3, `${r.version} has at most 3 highlights`);
    for (const n of r.notes) {
      const text = `${n.title} ${n.detail ?? ""}`;
      assert.doesNotMatch(text, /₹\s?\d|₹X/, `${r.version}: "${n.title}" quotes an amount`);
      assert.doesNotMatch(text, /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i, `${r.version}: "${n.title}" names a time`);
    }
  }
});

test("RELEASES: every link opens a screen that exists", () => {
  const app = join(__dirname, "..", "app");
  const routeFile = (path: string) => {
    const name = path === "/" ? "index" : path.slice(1);
    return ["", "(tabs)"].some((group) =>
      existsSync(join(app, group, `${name}.tsx`)) || existsSync(join(app, group, name, "index.tsx")));
  };
  for (const r of RELEASES) {
    for (const n of r.notes) {
      if (!n.link) continue;
      const path = n.link.split("?")[0];
      assert.ok(routeFile(path), `${r.version}: ${n.link} has no screen`);
    }
  }
});

test("2.6.0 highlights are Trends, the statement export and Insights exports", () => {
  const titles = highlightsOf(releaseFor("2.6.0")!).map((n) => firstSentence(n.title));
  assert.deepEqual(titles, [
    "A Trends tab on Investments, once there's some history",
    "Export an Investments statement as a PDF, from Investments or from any holding",
    "Insights exports through the same screen as Activity, as a PDF for a day, week, month or year",
  ]);
});
