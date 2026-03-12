#!/usr/bin/env node

const { spawnSync } = require("child_process");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..", "..", "..");
const nxBinary = path.join(
  workspaceRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "nx.cmd" : "nx"
);

const args = process.argv.slice(2);

const result = spawnSync(nxBinary, args, {
  cwd: workspaceRoot,
  stdio: "inherit",
});

process.exit(result.status ?? 0);
