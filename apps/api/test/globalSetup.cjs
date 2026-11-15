// `node --test --test-global-setup=test/globalSetup.cjs`: one replica set for the whole run.
// Each test file runs in its own process, inherits the URI and uses a database of its own.
// CommonJS because the runner imports this file natively; mongo.ts goes through ts-node.
require("ts-node/register");
const { URI_ENV, startReplSet } = require("./mongo.ts");

let replSet;

module.exports = {
    async globalSetup() {
        replSet = await startReplSet();
        process.env[URI_ENV] = replSet.getUri();
    },
    async globalTeardown() {
        await replSet?.stop();
    },
};
