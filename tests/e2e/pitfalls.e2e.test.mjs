/**
 * Pitfalls Test Suite
 * 
 * Tests for common bugs, race conditions, input validation issues, 
 * and security edge cases found in code review.
 */

import nodeTest from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
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
// INPUT VALIDATION PITFALLS
// ============================================================================

test("pitfall: input validation - POST /api/facts accepts null/invalid fields", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-input-validation-"));

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

  const invalidInputs = [
    { name: "Missing required fact_text", body: { source: "test", type: "test" } },
    { name: "Empty fact_text", body: { fact_text: "", source: "test", type: "test" } },
    { name: "fact_text with only whitespace", body: { fact_text: "   ", type: "test" } },
    { name: "Excessively long fact_text", body: { fact_text: "a".repeat(50000), type: "test" } },
    { name: "null fact_text", body: { fact_text: null, source: "test" } },
    { name: "Numeric type field", body: { fact_text: "Test", type: 123 } },
    { name: "Array as source", body: { fact_text: "Test", source: ["test1", "test2"] } },
    { name: "Object as subjects", body: { fact_text: "Test", subjects: { nested: "object" } } },
  ];

  for (const invalidInput of invalidInputs) {
    const res = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
      method: "POST",
      headers: {
        Authorization: "Bearer dev-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(invalidInput.body),
    });
    
    const body = await res.text();
    const shouldFail = res.status === 400 || res.status === 422 || res.status === 500;
    
    assert.ok(
      shouldFail,
      `Expected validation failure for ${invalidInput.name}: got ${res.status}\n${body}`
    );
  }
});

test("pitfall: input validation - PUT /api/facts/:id with invalid ID format", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-invalid-id-"));

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

  const invalidIds = [
    "abc",
    "-1",
    "0",
    "999999999999999999999",
    "1.5",
    "NaN",
    "",
    "  ",
    "'; DROP TABLE facts; --",
  ];

  for (const invalidId of invalidIds) {
    const res = await fetchWithTimeout(`${baseUrl}/api/facts/facts/${invalidId}`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer dev-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fact_text: "Updated" }),
    });

    const body = await res.text();
    assert.ok(
      res.status === 400 || res.status === 404,
      `Expected 400 or 404 for invalid ID '${invalidId}': got ${res.status}\n${body}`
    );
  }
});

test("pitfall: input validation - Large payload handling", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-large-payload-"));

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

  // Test extremely large array of subjects/audiences
  const largePayload = {
    fact_text: "Test fact",
    source: "test",
    type: "test",
    subjects: Array(10000).fill("subject"),
    audiences: Array(10000).fill("audience"),
  };

  const res = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
    method: "POST",
    headers: {
      Authorization: "Bearer dev-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(largePayload),
  }, 30000);

  const body = await res.text();
  // Should either fail gracefully or succeed with reasonable limits
  assert.ok(
    res.status === 400 || res.status === 413 || res.status === 200,
    `Unexpected response for large payload: ${res.status}\n${body}`
  );
});

// ============================================================================
// CONCURRENT OPERATION PITFALLS
// ============================================================================

test("pitfall: concurrent operations - Simultaneous updates to same fact", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-concurrent-update-"));

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

  // Create a fact first
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
    }),
  });

  const created = await createRes.json();
  const factId = created?.id;
  assert.ok(factId, "Expected fact creation to succeed");

  // Fire multiple concurrent updates
  const updatePromises = [];
  for (let i = 0; i < 5; i++) {
    const promise = fetchWithTimeout(`${baseUrl}/api/facts/facts/${factId}`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer dev-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fact_text: `Updated by request ${i}`,
      }),
    });
    updatePromises.push(promise);
  }

  const results = await Promise.all(updatePromises);
  const failures = results.filter(r => r.status >= 400);

  // Some concurrent updates may fail due to contention, but at least one should succeed
  assert.ok(
    results.length - failures.length >= 1,
    `Expected at least one concurrent update to succeed, but got ${failures.length} failures out of ${results.length}`
  );
});

// ============================================================================
// NULL/UNDEFINED PITFALLS
// ============================================================================

test("pitfall: null handling - Missing fact returns 404", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-null-handling-"));

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

  // Try to access non-existent fact
  const res = await fetchWithTimeout(`${baseUrl}/api/facts/facts/999999`, {
    headers: { Authorization: "Bearer dev-token" },
  });

  assert.equal(res.status, 404, `Expected 404 for non-existent fact, got ${res.status}`);
});

// ============================================================================
// ERROR HANDLING PITFALLS
// ============================================================================

test("pitfall: error handling - Server error responses are consistent", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-error-consistency-"));

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
        DEV_LOGIN_MODE: "false",
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

  // Missing auth should return 401, not 500
  const noAuthRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts`);
  const noAuthBody = await noAuthRes.text();

  assert.equal(noAuthRes.status, 401, `Expected 401 for missing auth, got ${noAuthRes.status}`);
  assert.ok(
    noAuthBody.includes("Unauthorized") || noAuthBody.includes("unauthorized"),
    `Expected 'Unauthorized' in error message, got: ${noAuthBody}`
  );
});

// ============================================================================
// RESPONSE FORMAT PITFALLS
// ============================================================================

test("pitfall: response formats - Consistent error response structure", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-response-format-"));

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

  // Test various error scenarios
  const scenarios = [
    {
      name: "Invalid ID format",
      method: "GET",
      path: "/api/facts/facts/invalid",
    },
    {
      name: "Non-existent resource",
      method: "GET",
      path: "/api/facts/facts/999999",
    },
    {
      name: "Invalid request body",
      method: "POST",
      path: "/api/facts/facts",
      body: "not json",
    },
  ];

  for (const scenario of scenarios) {
    const res = await fetchWithTimeout(`${baseUrl}${scenario.path}`, {
      method: scenario.method,
      headers: {
        Authorization: "Bearer dev-token",
        "Content-Type": "application/json",
      },
      body: scenario.body,
    });

    const body = await res.text();
    
    // All error responses should be JSON
    let bodyJson = null;
    try {
      bodyJson = JSON.parse(body);
    } catch {
      assert.fail(
        `Expected JSON error response for ${scenario.name}, got: ${body}`
      );
    }

    // Should have error field
    assert.ok(
      bodyJson.error,
      `Expected 'error' field in ${scenario.name} response: ${body}`
    );
  }
});

// ============================================================================
// SECURITY PITFALLS
// ============================================================================

test("pitfall: security - SQL injection via query parameters", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-sql-injection-"));

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

  const sqlInjectionPayloads = [
    "'; DROP TABLE facts; --",
    "' OR '1'='1",
    "1 UNION SELECT * FROM users",
    "1; DELETE FROM facts WHERE 1=1; --",
  ];

  for (const payload of sqlInjectionPayloads) {
    const res = await fetchWithTimeout(`${baseUrl}/api/facts/facts?q=${encodeURIComponent(payload)}`, {
      headers: { Authorization: "Bearer dev-token" },
    });

    const body = await res.text();
    
    // Should not crash, should return valid JSON response
    assert.ok(
      res.status === 200 || res.status === 400,
      `SQL injection payload caused unexpected status: ${res.status}\nPayload: ${payload}`
    );

    // Should be able to parse response
    try {
      JSON.parse(body);
    } catch {
      assert.fail(`Invalid JSON response to SQL injection attempt: ${body}`);
    }
  }
});

test("pitfall: security - XSS via response fields", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-xss-"));

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

  const xssPayloads = [
    "<script>alert('xss')</script>",
    "<img src=x onerror=alert('xss')>",
    "javascript:alert('xss')",
  ];

  for (const payload of xssPayloads) {
    const res = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
      method: "POST",
      headers: {
        Authorization: "Bearer dev-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fact_text: payload,
        source: "test",
        type: "test",
      }),
    });

    const body = await res.text();
    
    // Response should be properly escaped/encoded JSON
    assert.ok(
      res.status === 200 || res.status === 400 || res.status === 500,
      `Unexpected status for XSS payload: ${res.status}`
    );

    // Should not contain unescaped script tags
    assert.ok(
      !body.includes("<script>"),
      `Response contains unescaped script tag: ${body}`
    );
  }
});

// ============================================================================
// TYPE SAFETY PITFALLS
// ============================================================================

test("pitfall: type safety - Function parameters with wrong types", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-type-safety-"));

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

  // Test sending various wrong types
  const wrongTypes = [
    { subjects: "string-instead-of-array", fact_text: "Test" },
    { audiences: 123, fact_text: "Test" },
    { type: true, fact_text: "Test" },
    { source: { nested: "object" }, fact_text: "Test" },
  ];

  for (const wrongType of wrongTypes) {
    const res = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
      method: "POST",
      headers: {
        Authorization: "Bearer dev-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(wrongType),
    });

    const body = await res.text();
    
    // Should either succeed with type coercion or fail with 400
    assert.ok(
      res.status === 200 || res.status === 400 || res.status === 422,
      `Unexpected status for type validation: ${res.status}\nPayload: ${JSON.stringify(wrongType)}\nResponse: ${body}`
    );
  }
});
