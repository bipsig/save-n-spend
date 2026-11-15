/**
 * Builds the unique index behind "one live category per kind, parent and name" (the
 * idempotency audit's N11 and I7), after checking that no user already breaks it.
 *
 *   node -r ts-node/register scripts/buildCategoryIndex.ts                           dev, dry run
 *   ... -- --apply                                                                  dev, build it if there are no duplicates
 *   ... -- --db save-n-spend-prod --prod-approved                                   prod, dry run (read-only)
 *   ... -- --db save-n-spend-prod --prod-approved --apply                           prod, build it (Sagnik's go-ahead first)
 *
 * Without --apply only `aggregate`, `find` and `listIndexes` run. With it, the only write is
 * `createIndex`, and only when the duplicate check found nothing. Existing documents are never
 * changed: duplicates are listed for a person to resolve. Exit 0: clean (or built, or already
 * there); 1: duplicates found or a different index already has the name; 2: error.
 *
 * Built here rather than declared on the model, so Mongoose's autoIndex never tries it at boot
 * (where a failed build is an unhandled error; N20). Names compare as the category controller
 * compares them: collation en, strength 2 (case-insensitive). Archived categories don't count.
 */
import path from "path";
import dotenv from "dotenv";
import { MongoClient, type Db, type Document } from "mongodb";
import { buildUri } from "../src/config/db";
import { parseArgs } from "./guards/lib";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

export const DEV_DB = "save-n-spend-dev";
export const PROD_DB = "save-n-spend-prod";

export const INDEX_NAME = "live_category_name_unique";
export const INDEX_KEY = { userId: 1, kind: 1, parent: 1, name: 1 } as const;
export const COLLATION = { locale: "en", strength: 2 } as const;
export const INDEX_OPTIONS = {
    name: INDEX_NAME,
    unique: true,
    partialFilterExpression: { isArchived: false },
    collation: COLLATION,
} as const;

/** Which database, or why not. Prod needs --prod-approved even for a dry run. */
export const pickDb = (opts: { db?: string; prodApproved?: boolean }): string => {
    const db = opts.db ?? DEV_DB;
    if (db === DEV_DB) return db;
    if (db === PROD_DB && opts.prodApproved) return db;
    if (db === PROD_DB) throw new Error("Refusing prod without --prod-approved (and Sagnik's go-ahead)");
    throw new Error(`Refusing unknown database "${db}"`);
};

/** One group per {user, kind, parent, name}; a missing parent counts as null, as in the index. */
export const DUPLICATES_PIPELINE: Document[] = [
    { $match: { isArchived: false } },
    {
        $group: {
            _id: { userId: "$userId", kind: "$kind", parent: { $ifNull: ["$parent", null] }, name: "$name" },
            count: { $sum: 1 },
            rows: { $push: { _id: "$_id", name: "$name", createdAt: "$createdAt" } },
        },
    },
    { $match: { count: { $gt: 1 } } },
];

type Group = { _id: { userId: unknown; kind: string; parent: unknown; name: string }; count: number; rows: { _id: unknown; name: string; createdAt?: Date }[] };

/** Is an existing index the one this script builds? */
export const sameIndex = (ix: Document): boolean =>
    JSON.stringify(ix.key) === JSON.stringify(INDEX_KEY)
    && ix.unique === true
    && JSON.stringify(ix.partialFilterExpression) === JSON.stringify(INDEX_OPTIONS.partialFilterExpression)
    && ix.collation?.locale === COLLATION.locale && ix.collation?.strength === COLLATION.strength;

const findDuplicates = async (db: Db): Promise<Group[]> =>
    db.collection("categories").aggregate<Group>(DUPLICATES_PIPELINE, { collation: COLLATION }).toArray();

const describe = async (db: Db, groups: Group[]): Promise<string[]> => {
    const userIds = [...new Set(groups.map((g) => String(g._id.userId)))];
    const parentIds = groups.map((g) => g._id.parent).filter(Boolean);
    const [users, parents] = await Promise.all([
        db.collection("users").find({ _id: { $in: groups.map((g) => g._id.userId) as never[] } }, { projection: { email: 1 } }).toArray(),
        db.collection("categories").find({ _id: { $in: parentIds as never[] } }, { projection: { name: 1 } }).toArray(),
    ]);
    const email = new Map(users.map((u) => [String(u._id), String(u.email)]));
    const parentName = new Map(parents.map((p) => [String(p._id), String(p.name)]));
    const lines: string[] = [];
    for (const id of userIds) {
        for (const g of groups.filter((x) => String(x._id.userId) === id)) {
            const where = g._id.parent ? `under "${parentName.get(String(g._id.parent)) ?? String(g._id.parent)}"` : "top level";
            lines.push(`${email.get(id) ?? id}: ${g.count} live ${g._id.kind} categories named "${g._id.name}" (${where})`);
            for (const r of g.rows) lines.push(`    ${String(r._id)}  "${r.name}"  created ${r.createdAt ? new Date(r.createdAt).toISOString() : "?"}`);
        }
    }
    return lines;
};

const main = async (): Promise<number> => {
    const { args } = parseArgs();
    const dbName = pickDb({ db: typeof args.db === "string" ? args.db : undefined, prodApproved: args["prod-approved"] === true });
    const apply = args.apply === true;

    const client = new MongoClient(buildUri(), { readPreference: "primary", appName: "buildCategoryIndex" });
    await client.connect();
    try {
        const db = client.db(dbName);
        console.log(`Database: ${dbName}. Mode: ${apply ? "apply (builds the index if there are no duplicates)" : "dry run (reads only)"}`);

        const existing = (await db.collection("categories").listIndexes().toArray()).find((ix) => ix.name === INDEX_NAME);
        if (existing && sameIndex(existing)) {
            console.log(`Index ${INDEX_NAME} is already there. Nothing to do.`);
            return 0;
        }
        if (existing) {
            console.log(`An index named ${INDEX_NAME} exists with a different definition: ${JSON.stringify(existing)}. Not touching it.`);
            return 1;
        }

        const groups = await findDuplicates(db);
        if (groups.length) {
            console.log(`\nRefusing to build: ${groups.length} sets of live categories share a kind, parent and name (case-insensitive).`);
            for (const line of await describe(db, groups)) console.log(line);
            console.log("\nResolve these first (rename or archive one of each set), then run again.");
            return 1;
        }

        console.log("No duplicates: every live category is unique per kind, parent and name.");
        if (!apply) {
            console.log(`Dry run: would create ${INDEX_NAME} on categories ${JSON.stringify(INDEX_KEY)} ${JSON.stringify(INDEX_OPTIONS)}. Run with --apply to build it.`);
            return 0;
        }
        await db.collection("categories").createIndex(INDEX_KEY, INDEX_OPTIONS);
        console.log(`Built ${INDEX_NAME}.`);
        return 0;
    }
    finally {
        await client.close();
    }
};

if (require.main === module) {
    main().then((code) => process.exit(code)).catch((e) => {
        console.error(`buildCategoryIndex: ${(e as Error).message.replace(/mongodb:\/\/[^@]+@/, "mongodb://***@")}`);
        process.exit(2);
    });
}
