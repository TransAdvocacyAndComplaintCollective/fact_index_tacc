import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

const serverPort = 3311;
const baseUrl = `http://127.0.0.1:${serverPort}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadCurrentSigningKey() {
  const keysPath = path.join(repoRoot, ".keys", "keys.json");
  const keys = JSON.parse(fs.readFileSync(keysPath, "utf8"));
  const currentKid = String(keys?.current?.kid || "");
  if (!currentKid) {
    throw new Error("Unable to resolve current key id from .keys/keys.json");
  }
  const privateKeyPath = path.join(repoRoot, ".keys", `${currentKid}.pem`);
  const privateKey = fs.readFileSync(privateKeyPath, "utf8");
  return { kid: currentKid, privateKey };
}

function mintJwtToken({ userId, username, isAdmin }) {
  const { kid, privateKey } = loadCurrentSigningKey();
  const now = Date.now();
  const payload = {
    sub: userId,
    username,
    avatar: null,
    discriminator: null,
    guild: null,
    hasRole: true,
    devBypass: false,
    isAdmin: Boolean(isAdmin),
    jti: crypto.randomBytes(16).toString("hex"),
    cacheUpdatedAt: now,
    last_check: now,
    cachedGuildIds: [],
    cachedMemberRoles: [],
  };

  return jwt.sign(payload, privateKey, {
    algorithm: "RS256",
    keyid: kid,
    expiresIn: "1h",
  });
}

async function waitForServerReady(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const hasExited = opts.hasExited ?? (() => false);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (hasExited()) {
      throw new Error("Server process exited before becoming ready");
    }
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry until timeout
    }
    await sleep(1000);
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

test("casbin authorization e2e", async (t) => {
  const server = spawn(
    process.execPath,
    [
      "--enable-source-maps",
      "-r",
      "tsconfig-paths/register",
      "-r",
      "@swc-node/register",
      "-r",
      "dotenv/config",
      "./apps/fact-server/src/main.ts",
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: String(serverPort),
        DEV_LOGIN_MODE: "true",
        TS_NODE_PROJECT: "tsconfig.base.json",
        TSCONFIG_PATHS_CONFIG_DIR: ".",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let serverLogs = "";
  let serverExited = false;
  server.stdout.on("data", (chunk) => {
    serverLogs += String(chunk);
  });
  server.stderr.on("data", (chunk) => {
    serverLogs += String(chunk);
  });
  server.on("exit", () => {
    serverExited = true;
  });

  t.after(async () => {
    if (!server.killed) {
      server.kill("SIGTERM");
      await sleep(1000);
      if (!server.killed) server.kill("SIGKILL");
    }
  });

  try {
    await waitForServerReady(`${baseUrl}/health`, { hasExited: () => serverExited });
  } catch (err) {
    assert.fail(`Server startup failed: ${err instanceof Error ? err.message : String(err)}\n${serverLogs}`);
  }

  const userToken = mintJwtToken({
    userId: "map-list-user-01",
    username: "e2e-user",
    isAdmin: false,
  });
  const adminToken = mintJwtToken({
    userId: "e2e-admin-1",
    username: "e2e-admin",
    isAdmin: true,
  });

  const userFactsRead = await fetch(`${baseUrl}/api/facts/subjects`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.equal(
    userFactsRead.status,
    200,
    `Expected non-admin user to read facts. logs:\n${serverLogs}`,
  );

  const publicFactsRead = await fetch(`${baseUrl}/api/facts/subjects/all`);
  assert.equal(
    publicFactsRead.status,
    200,
    `Expected public (no-login) facts read to succeed. logs:\n${serverLogs}`,
  );

  const userFactCreate = await fetch(`${baseUrl}/api/facts/facts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      fact_text: "e2e created fact",
      is_public: false,
      user_id: 123,
    }),
  });
  assert.equal(
    userFactCreate.status,
    201,
    `Expected non-admin user to create a fact. logs:\n${serverLogs}`,
  );
  const createdFact = await userFactCreate.json();
  assert.equal(typeof createdFact?.id, "number");

  const publicFactRead = await fetch(`${baseUrl}/api/facts/facts/${createdFact.id}`);
  assert.equal(
    publicFactRead.status,
    404,
    `Expected non-public fact to be hidden from public. logs:\n${serverLogs}`,
  );

  const userFactsDelete = await fetch(`${baseUrl}/api/facts/facts/1`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.equal(
    userFactsDelete.status,
    403,
    `Expected non-admin user to be denied facts delete. logs:\n${serverLogs}`,
  );

  const userAdminConfig = await fetch(`${baseUrl}/auth/admin/config`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.equal(
    userAdminConfig.status,
    403,
    `Expected non-admin user to be denied admin config. logs:\n${serverLogs}`,
  );

  const adminAdminConfig = await fetch(`${baseUrl}/auth/admin/config`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(
    adminAdminConfig.status,
    200,
    `Expected admin user to read admin config. logs:\n${serverLogs}`,
  );

  const adminFactCreate = await fetch(`${baseUrl}/api/facts/facts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      fact_text: "e2e created public fact",
      is_public: true,
      user_id: 456,
    }),
  });
  assert.equal(
    adminFactCreate.status,
    201,
    `Expected admin to create a public fact. logs:\n${serverLogs}`,
  );

  const createdPublicFact = await adminFactCreate.json();
  const publicCreatedFactRead = await fetch(`${baseUrl}/api/facts/facts/${createdPublicFact.id}`);
  assert.equal(
    publicCreatedFactRead.status,
    200,
    `Expected public to read public fact. logs:\n${serverLogs}`,
  );
  const publicCreatedFactBody = await publicCreatedFactRead.json();
  assert.equal(
    "user_id" in publicCreatedFactBody,
    false,
    `Expected public fact response to omit user_id. logs:\n${serverLogs}`,
  );
});
