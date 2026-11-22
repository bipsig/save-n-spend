import { RELEASES } from "../data/releaseNotes";
import type { NoteKind, Release, ReleaseNote } from "../data/releaseNotes";
import { MONTHS as MONTHS_SHORT, MONTHS_LONG } from "./format/months";

// Pure: no React, no stores, so it runs under node:test. The store and hook live in
// store/whatsNew.ts.

const KIND_ORDER: NoteKind[] = ["new", "improved", "fixed"];


/** Negative when `a` is older, positive when newer, 0 when equal. "1.10.0" is newer than "1.9.0". */
export const compareVersions = (a: string, b: string): number => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
};

export const releaseFor = (version: string, releases: Release[] = RELEASES): Release | undefined =>
  releases.find((r) => compareVersions(r.version, version) === 0);

/** The newest release older than `version`, quiet ones included. Works for a version that isn't listed. */
export const previousRelease = (version: string, releases: Release[] = RELEASES): Release | undefined =>
  releases
    .filter((r) => compareVersions(r.version, version) < 0)
    .reduce<Release | undefined>((best, r) => (!best || compareVersions(r.version, best.version) > 0 ? r : best), undefined);

export const countsOf = (release: Release): { new: number; improved: number; fixed: number } => {
  const counts = { new: 0, improved: 0, fixed: 0 };
  for (const note of release.notes) counts[note.kind]++;
  return counts;
};

export const sectionsOf = (release: Release): { kind: NoteKind; notes: ReleaseNote[] }[] =>
  KIND_ORDER
    .map((kind) => ({ kind, notes: release.notes.filter((n) => n.kind === kind) }))
    .filter((s) => s.notes.length > 0);

const FOLD_ABOVE = 6;
const FOLD_SHOWN = 5;

/** A section longer than six shows its first five and how many are hidden. */
export const foldNotes = (notes: ReleaseNote[], expanded: boolean): { shown: ReleaseNote[]; hidden: number } =>
  expanded || notes.length <= FOLD_ABOVE
    ? { shown: notes, hidden: 0 }
    : { shown: notes.slice(0, FOLD_SHOWN), hidden: notes.length - FOLD_SHOWN };

const MAX_HIGHLIGHTS = 3;

export const highlightsOf = (release: Release): ReleaseNote[] => {
  if (release.quiet) return [];
  const marked = release.notes.filter((n) => n.highlight);
  return (marked.length > 0 ? marked : release.notes.filter((n) => n.kind === "new")).slice(0, MAX_HIGHLIGHTS);
};

/** Up to the first full stop or colon that ends a sentence, without it. "2.6.0" is not cut. */
export const firstSentence = (text: string): string => {
  const match = /^(.*?)[.:](?=\s|$)/s.exec(text.trim());
  return (match ? match[1] : text).trim();
};

/** "2.4.0" -> "2.4", "2.3.1" stays. For "Also new since 2.4" and the Previous version chip. */
export const shortVersion = (version: string): string => version.replace(/\.0$/, "");

/** "14 Nov 2026", or "14 Nov" without the year. */
export const formatReleaseDate = (date: string, withYear = true): string => {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS_SHORT[month - 1]}${withYear ? ` ${year}` : ""}`;
};

// A release date is a calendar day, so it names the same month in every zone; `zone` is
// part of the signature only so callers pass what every other date label takes.
export const monthGroups = (
  releases: Release[],
  _zone: string,
): { key: string; label: string; releases: Release[] }[] => {
  const groups: { key: string; label: string; releases: Release[] }[] = [];
  for (const release of releases) {
    const key = release.date.slice(0, 7);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      const [year, month] = key.split("-").map(Number);
      group = { key, label: `${MONTHS_LONG[month - 1]} ${year}`, releases: [] };
      groups.push(group);
    }
    group.releases.push(release);
  }
  return groups;
};

/**
 * The post-update sheet for `current`, or null. `alsoNew` names the versions skipped since
 * `lastSeen`, newest first, quiet ones left out. A null `lastSeen` means no lower bound is
 * known, so nothing is named as skipped.
 */
export const sheetFor = (
  { current, lastSeen, freshInstall }: { current: string; lastSeen: string | null; freshInstall: boolean },
  releases: Release[] = RELEASES,
): null | { release: Release; alsoNew: Release[] } => {
  if (freshInstall) return null;
  const release = releaseFor(current, releases);
  if (!release || release.quiet) return null;
  if (lastSeen !== null && compareVersions(lastSeen, current) >= 0) return null;
  const alsoNew = lastSeen === null
    ? []
    : releases
      .filter((r) => !r.quiet && compareVersions(r.version, lastSeen) > 0 && compareVersions(r.version, current) < 0)
      .sort((a, b) => compareVersions(b.version, a.version));
  return { release, alsoNew };
};

/** The NEW tag on Settings › What's new. */
export const showsNewTag = (current: string, lastSeen: string | null, releases: Release[] = RELEASES): boolean => {
  const release = releaseFor(current, releases);
  if (!release || release.quiet) return false;
  return lastSeen === null || compareVersions(lastSeen, current) < 0;
};
