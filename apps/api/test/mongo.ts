import os from "os";
import path from "path";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";

/** What Atlas runs (buildInfo on the dev cluster, 16 Nov 2026). */
export const MONGOD_VERSION = process.env.MONGOMS_VERSION ?? "8.0.37";
/** Downloaded once, then every run is offline. */
export const MONGOD_CACHE = process.env.MONGOMS_DOWNLOAD_DIR ?? path.join(os.homedir(), ".cache", "mongodb-binaries");

/** Set by globalSetup.ts for every test file it runs. */
export const URI_ENV = "TEST_MONGO_URI";

/**
 * A one-member replica set on 127.0.0.1 (a replica set, so transactions work), its data in a
 * temp directory that goes when it stops.
 */
export const startReplSet = (): Promise<MongoMemoryReplSet> =>
    MongoMemoryReplSet.create({
        binary: { version: MONGOD_VERSION, downloadDir: MONGOD_CACHE },
        replSet: { count: 1, storageEngine: "wiredTiger", ip: "127.0.0.1" },
    });

export const isLoopbackUri = (uri: string): boolean => /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?[/,?]/.test(uri);
