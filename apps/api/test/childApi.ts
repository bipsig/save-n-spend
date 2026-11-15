import "./env";
import mongoose from "mongoose";
import app from "../src/app";
import { URI_ENV, isLoopbackUri } from "./mongo";

// The app in its own process, on the test database the parent names (TestApi.child), for a
// test that needs the server to die. Prints `listening <port>` once it can take requests.

const main = async () => {
    const uri = process.env[URI_ENV];
    const dbName = process.env.TEST_DB_NAME;
    if (!uri || !dbName || !isLoopbackUri(uri)) throw new Error("childApi: needs the in-memory database from the test harness");
    await mongoose.connect(uri, { dbName, writeConcern: { w: "majority" } });
    const server = app.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as { port: number };
        console.log(`listening ${port}`);
    });
    process.on("SIGTERM", () => { server.close(); void mongoose.disconnect().then(() => process.exit(0)); });
};

main().catch((e) => { console.error((e as Error).message); process.exit(1); });
