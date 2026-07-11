// Metro config for this Expo app inside the monorepo.
// Reanimated/Worklets and other deps are hoisted to the workspace root, so Metro
// must (1) watch the root and (2) resolve modules from both the app's and the
// root's node_modules. Without this, hoisted native modules fail to initialize.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from the app first, then the hoisted root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
