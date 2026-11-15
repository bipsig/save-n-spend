/**
 * Line coverage per folder of src/, from the lcov file `npm test` writes.
 *
 *   node --require ts-node/register scripts/coverage.ts [coverage/lcov.info]
 *   COVERAGE_GATE=1 ...      exit 1 when a gated folder is under its floor (npm run test:coverage)
 */
import fs from "fs";
import path from "path";

/** Lines covered, as a percentage, that these folders may not drop under. */
export const GATE: Record<string, number> = { services: 80, controllers: 80, middleware: 80 };
const SHOWN = ["services", "controllers", "middleware", "utils", "schemas"];

export type Totals = Map<string, { found: number; hit: number; files: { file: string; found: number; hit: number }[] }>;

/** `SF:src/<folder>/...` records summed by folder (the file's first directory under src/). */
export const byFolder = (lcov: string): Totals => {
    const out: Totals = new Map();
    let file = "";
    let found = 0;
    let hit = 0;
    for (const line of lcov.split("\n")) {
        if (line.startsWith("SF:")) { file = line.slice(3).replace(/\\/g, "/"); found = 0; hit = 0; }
        else if (line.startsWith("LF:")) found = Number(line.slice(3));
        else if (line.startsWith("LH:")) hit = Number(line.slice(3));
        else if (line === "end_of_record") {
            const rel = file.slice(file.lastIndexOf("src/") + 4);
            const folder = rel.includes("/") ? rel.split("/")[0] : "(src)";
            const t = out.get(folder) ?? { found: 0, hit: 0, files: [] };
            t.found += found; t.hit += hit; t.files.push({ file: rel, found, hit });
            out.set(folder, t);
        }
    }
    return out;
};

export const pct = (hit: number, found: number): number => (found ? (100 * hit) / found : 100);

/** The gated folders under their floor, as `folder 71.2% < 80%`. */
export const failures = (totals: Totals, gate = GATE): string[] =>
    Object.entries(gate).flatMap(([folder, floor]) => {
        const t = totals.get(folder);
        const p = t ? pct(t.hit, t.found) : 0;
        return p < floor ? [`${folder} ${p.toFixed(1)}% < ${floor}%`] : [];
    });

const main = () => {
    const file = path.resolve(process.argv[2] ?? "coverage/lcov.info");
    const totals = byFolder(fs.readFileSync(file, "utf8"));
    const rows = [...SHOWN, ...[...totals.keys()].filter((k) => !SHOWN.includes(k)).sort()];
    console.log(`\nLine coverage by folder (src/), from ${path.relative(process.cwd(), file)}`);
    for (const folder of rows) {
        const t = totals.get(folder);
        if (!t) continue;
        const floor = GATE[folder] ? `  (gate ${GATE[folder]}%)` : "";
        console.log(`  ${folder.padEnd(12)} ${pct(t.hit, t.found).toFixed(1).padStart(5)}%  ${String(t.hit).padStart(5)}/${String(t.found).padEnd(5)}${floor}`);
    }
    const under = failures(totals);
    if (process.env.COVERAGE_GATE === "1") {
        if (under.length) { console.error(`\nCoverage gate failed: ${under.join(", ")}`); process.exit(1); }
        console.log("\nCoverage gate passed");
    }
    else if (under.length) console.log(`\nUnder the gate (npm run test:coverage fails): ${under.join(", ")}`);
};

if (require.main === module) main();
