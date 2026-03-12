/**
 * Database and Transaction Pitfalls Test Suite
 * 
 * Tests for database transaction issues, connection cleanup, race conditions,
 * and data integrity problems.
 */

import nodeTest from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { startProcess, terminateProcess, waitForHttp } from "./helpers.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const serverRoot = path.join(repoRoot, "apps", "fact-server");
const serverConfigPath = path.join(repoRoot, "apps", "fact-server", "config", "discord-auth.json");
const TOKEN_ENCRYPTION_KEY = "e2e-token-key";
const SESSION_SECRET = "e2e-session-secret-0123456789abcdef0123456789";

const test = (name, fn) => nodeTest(name, { concurrency: false }, fn);

async function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate test port")));
        return;
      }
      const { port } = address;
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// TRANSACTION AND RACE CONDITION PITFALLS
// ============================================================================

test("pitfall: transactions - No rollback on failed update leaves partial state", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-transaction-rollback-"));

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });

  const { child, getOutput } = startProcess(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "production",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        DISCORD_AUTH_CONFIG_PATH: serverConfigPath,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "false",
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check\n${getOutput()}`);
  }

  // Create initial fact
  const createRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
    method: "POST",
    headers: {
      Authorization: "Bearer dev-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fact_text: "Original fact",
      source: "test",
      type: "test",
      subjects: ["subject1"],
      audiences: ["audience1"],
    }),
  });

  const created = await createRes.json();
  const factId = created?.id;
  assert.ok(factId, "Expected fact creation to succeed");

  // Read fact before update attempt
  const beforeRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts/${factId}`, {
    headers: { Authorization: "Bearer dev-token" },
  });
  const beforeFact = await beforeRes.json();
  const originalText = beforeFact?.fact_text;

  // Attempt update with invalid data
  const updateRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts/${factId}`, {
    method: "PUT",
    headers: {
      Authorization: "Bearer dev-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fact_text: "", // Invalid - empty
      subjects: "not-an-array", // Invalid type
    }),
  });

  // Depending on implementation, this may fail
  if (updateRes.status >= 400) {
    // After failed update, verify fact wasn't partially modified
    const afterRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts/${factId}`, {
      headers: { Authorization: "Bearer dev-token" },
    });
    const afterFact = await afterRes.json();

    assert.equal(
      afterFact?.fact_text,
      originalText,
      "Failed update should not partially modify fact"
    );
  }
});

test("pitfall: transactions - Concurrent delete and read race condition", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-concurrent-delete-"));

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });

  const { child, getOutput } = startProcess(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "production",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        DISCORD_AUTH_CONFIG_PATH: serverConfigPath,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "false",
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check\n${getOutput()}`);
  }

  // Create fact
  const createRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
    method: "POST",
    headers: {
      Authorization: "Bearer dev-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fact_text: "Deletable fact",
      source: "test",
      type: "test",
    }),
  });

  const created = await createRes.json();
  const factId = created?.id;
  assert.ok(factId, "Expected fact creation to succeed");

  // Fire concurrent delete and read simultaneously
  const deletePromise = fetchWithTimeout(`${baseUrl}/api/facts/facts/${factId}`, {
    method: "DELETE",
    headers: { Authorization: "Bearer dev-token" },
  });

  const readPromise = fetchWithTimeout(`${baseUrl}/api/facts/facts/${factId}`, {
    headers: { Authorization: "Bearer dev-token" },
  });

  const [deleteRes, readRes] = await Promise.all([deletePromise, readPromise]);

  // One should succeed, one might fail, but both should return valid status codes
  assert.ok(
    deleteRes.status < 500 && readRes.status < 500,
    `Race condition caused server error: delete=${deleteRes.status}, read=${readRes.status}`
  );

  // If read happened after delete, it should get 404
  if (deleteRes.status === 200) {
    const subsequentRead = await fetchWithTimeout(`${baseUrl}/api/facts/facts/${factId}`, {
      headers: { Authorization: "Bearer dev-token" },
    });
    assert.equal(subsequentRead.status, 404, "Deleted fact should return 404");
  }
});

// ============================================================================
// CONNECTION AND RESOURCE CLEANUP PITFALLS
// ============================================================================

test("pitfall: resources - Connection leaks on error during request", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-connection-leak-"));

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });

  const { child, getOutput } = startProcess(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "production",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        DISCORD_AUTH_CONFIG_PATH: serverConfigPath,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "false",
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check\n${getOutput()}`);
  }

  // Send many requests that will error
  const errorRequests = [];
  for (let i = 0; i < 100; i++) {
    errorRequests.push(
      fetchWithTimeout(`${baseUrl}/api/facts/facts/invalid`, {
        headers: { Authorization: "Bearer dev-token" },
      }).then(r => r.status)
    );
  }

  const results = await Promise.all(errorRequests);
  
  // All should complete successfully
  assert.equal(
    results.filter(status => status < 500).length,
    100,
    "Sequential error requests should not cause resource exhaustion"
  );

  // Server should still be healthy
  const healthRes = await fetchWithTimeout(`${baseUrl}/health`);
  assert.equal(healthRes.status, 200, "Server should still be healthy after many errors");
});

// ============================================================================
// DATA INTEGRITY PITFALLS
// ============================================================================

test("pitfall: data integrity - Update preserves unmodified fields", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-data-integrity-"));

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });

  const { child, getOutput } = startProcess(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "production",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        DISCORD_AUTH_CONFIG_PATH: serverConfigPath,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "false",
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check\n${getOutput()}`);
  }

  // Create fact with all fields populated
  const createRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
    method: "POST",
    headers: {
      Authorization: "Bearer dev-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fact_text: "Original text",
      source: "original-source",
      type: "original-type",
      context: "original-context",
      subjects: ["subject1", "subject2"],
      audiences: ["audience1"],
    }),
  });

  const created = await createRes.json();
  const factId = created?.id;
  assert.ok(factId, "Expected fact creation to succeed");

  // Update only the fact_text
  const updateRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts/${factId}`, {
    method: "PUT",
    headers: {
      Authorization: "Bearer dev-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fact_text: "Updated text",
    }),
  });

  // Read it back
  const readRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts/${factId}`, {
    headers: { Authorization: "Bearer dev-token" },
  });

  const updated = await readRes.json();

  // Verify updated field changed
  assert.equal(updated?.fact_text, "Updated text", "fact_text should be updated");

  // Verify other fields were preserved
  assert.equal(updated?.source, "original-source", "source should be preserved on partial update");
  assert.equal(updated?.type, "original-type", "type should be preserved on partial update");
  assert.equal(updated?.context, "original-context", "context should be preserved on partial update");
});

test("pitfall: data integrity - Bulk operations maintain consistency", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-bulk-consistency-"));

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });

  const { child, getOutput } = startProcess(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "production",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        DISCORD_AUTH_CONFIG_PATH: serverConfigPath,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "false",
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check\n${getOutput()}`);
  }

  // Create multiple facts
  const factIds = [];
  for (let i = 0; i < 5; i++) {
    const res = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
      method: "POST",
      headers: {
        Authorization: "Bearer dev-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fact_text: `Fact ${i}`,
        source: `source-${i}`,
        type: "test",
      }),
    });

    const created = await res.json();
    if (created?.id) {
      factIds.push(created.id);
    }
  }

  assert.equal(factIds.length, 5, "Should create 5 facts");

  // Read all facts
  const listRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
    headers: { Authorization: "Bearer dev-token" },
  });

  const allFacts = await listRes.json();

  // Should be able to query for created facts
  assert.ok(Array.isArray(allFacts) || allFacts?.facts, "List should return facts array");
  
  const factsArray = Array.isArray(allFacts) ? allFacts : allFacts?.facts || [];
  assert.ok(
    factsArray.length >= 5,
    `Should have at least 5 facts, got ${factsArray.length}`
  );
});

// ============================================================================
// ASYNC/AWAIT PITFALLS
// ============================================================================

test("pitfall: async errors - Unhandled promise rejection in async handler", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-unhandled-rejection-"));

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });

  const { child, getOutput } = startProcess(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "production",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        DISCORD_AUTH_CONFIG_PATH: serverConfigPath,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "false",
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check\n${getOutput()}`);
  }

  // Make several requests that might trigger async errors
  const requests = [];
  for (let i = 0; i < 10; i++) {
    requests.push(
      fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
        headers: { Authorization: "Bearer dev-token" },
      }).catch(err => ({
        error: true,
        message: err.message,
      }))
    );
  }

  const results = await Promise.all(requests);

  // Check if server crashed
  const healthRes = await fetchWithTimeout(`${baseUrl}/health`).catch(() => null);
  
  assert.ok(
    healthRes && healthRes.status === 200,
    "Server should not crash from async errors"
  );
});

// ============================================================================
// FIELD VALIDATION PITFALLS
// ============================================================================

test("pitfall: field validation - Numeric IDs should be validated as integers", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-id-validation-"));

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });

  const { child, getOutput } = startProcess(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "production",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        DISCORD_AUTH_CONFIG_PATH: serverConfigPath,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "false",
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check\n${getOutput()}`);
  }

  // Test various invalid ID formats
  const invalidIds = [
    "1.5", // Float
    "1e2", // Scientific notation
    "0x1F", // Hex
    "+1", // Sign
    " 1 ", // Whitespace
  ];

  for (const id of invalidIds) {
    const res = await fetchWithTimeout(`${baseUrl}/api/facts/facts/${id}`, {
      headers: { Authorization: "Bearer dev-token" },
    });

    assert.equal(
      res.status,
      400,
      `Invalid ID '${id}' should return 400, got ${res.status}`
    );
  }
});
