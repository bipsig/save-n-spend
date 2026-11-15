// Lets lib/*.test.ts load app modules under node: "@/" resolves to apps/mobile as Metro does,
// and a test can put a fake in place of a native module or a store before it requires the
// module under test. The test script runs ts-node transpile-only; `tsc` in apps/mobile checks
// these files' types.
import Module from "node:module";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

type Loader = {
  _resolveFilename: (request: string, ...rest: unknown[]) => string;
  _cache: Record<string, unknown>;
};
const loader = Module as unknown as Loader;
const resolve = loader._resolveFilename;
const fakes = new Map<string, unknown>();

loader._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
  if (fakes.has(request)) {
    const id = `fake:${request}`;
    loader._cache[id] = { id, filename: id, loaded: true, exports: fakes.get(request), children: [], paths: [] };
    return id;
  }
  return resolve.call(this, request.startsWith("@/") ? join(ROOT, request.slice(2)) : request, ...rest);
};

/** What `require(specifier)` returns from now on. Call before requiring the module under test. */
export const fake = (specifier: string, exports: object): void => {
  fakes.set(specifier, exports);
  delete loader._cache[`fake:${specifier}`];
};

/** Drops app modules from the require cache, so the next require starts them fresh: what a
 *  relaunch does to module state. Fakes, and whatever they hold, are kept. */
export const relaunch = (): void => {
  for (const id of Object.keys(loader._cache)) {
    if (id.startsWith(ROOT) && !id.includes("node_modules") && !id.startsWith(join(ROOT, "test"))) delete loader._cache[id];
  }
};

/** An in-memory stand-in for `expo-file-system/legacy`, the part of it the app uses. */
export const memoryFileSystem = () => {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  /** Paths whose next write or delete throws, as a full disk would. */
  const failing = new Set<string>();
  const documentDirectory = "file:///doc/";
  const asDir = (path: string) => (path.endsWith("/") ? path : `${path}/`);
  const check = (path: string) => {
    if (failing.has(path)) throw new Error(`disk error on ${path}`);
  };

  const api = {
    documentDirectory,
    cacheDirectory: "file:///cache/",
    EncodingType: { UTF8: "utf8", Base64: "base64" },
    getInfoAsync: async (path: string) => ({
      exists: files.has(path) || dirs.has(asDir(path)) || [...files.keys()].some((f) => f.startsWith(asDir(path))),
    }),
    readAsStringAsync: async (path: string) => {
      const text = files.get(path);
      if (text === undefined) throw new Error(`no file ${path}`);
      return text;
    },
    writeAsStringAsync: async (path: string, text: string) => {
      check(path);
      files.set(path, text);
    },
    makeDirectoryAsync: async (path: string) => {
      dirs.add(asDir(path));
    },
    readDirectoryAsync: async (path: string) => {
      const dir = asDir(path);
      return [...files.keys()].filter((f) => f.startsWith(dir) && !f.slice(dir.length).includes("/")).map((f) => f.slice(dir.length));
    },
    deleteAsync: async (path: string, opts: { idempotent?: boolean } = {}) => {
      check(path);
      if (!files.delete(path) && !opts.idempotent) throw new Error(`no file ${path}`);
    },
  };
  return { api, files, failing, documentDirectory };
};
