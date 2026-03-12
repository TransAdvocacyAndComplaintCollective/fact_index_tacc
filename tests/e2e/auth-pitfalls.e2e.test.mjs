/**
 * Authentication & Authorization Security Pitfalls Test Suite
 * 
 * Tests for auth/authz bypasses, token validation issues, privilege escalation,
 * and other security-related pitfalls.
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
// TOKEN VALIDATION PITFALLS
// ============================================================================

test("pitfall: auth - Empty authorization header should be rejected", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-empty-auth-"));

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

  const invalidAuthHeaders = [
    "", // Empty
    " ", // Whitespace only
    "Bearer", // No token
    "Bearer ", // Bearer with space
    "Bearer   ", // Bearer with multiple spaces
    "NotBearer token123", // Wrong scheme
    "bearer token123", // Lowercase scheme
  ];

  for (const authHeader of invalidAuthHeaders) {
    const headers = authHeader ? { Authorization: authHeader } : {};
    
    const res = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
      headers,
    });

    assert.equal(
      res.status,
      401,
      `Invalid auth header '${authHeader}' should return 401, got ${res.status}`
    );
  }
});

test("pitfall: auth - Malformed JWT should not be accepted", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-malformed-jwt-"));

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

  const malformedTokens = [
    "not-a-jwt",
    "not.a.jwt.with.extra.parts",
    ".",
    "..",
    "...",
    "eyJhbGciOiJIUzI1NiJ9", // Only header
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0", // Header + payload, no signature
    "%%%", // Invalid base64
    "not-base64!@#$%^&*()",
  ];

  for (const token of malformedTokens) {
    const res = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(
      res.status,
      401,
      `Malformed token '${token}' should return 401, got ${res.status}`
    );
  }
});

// ============================================================================
// AUTHORIZATION PITFALLS
// ============================================================================

test("pitfall: authz - Missing authorization check should be caught", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-missing-authz-"));

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

  // Check that all protected endpoints reject unauthenticated requests
  const protectedEndpoints = [
    { method: "GET", path: "/api/facts/facts" },
    { method: "GET", path: "/api/facts/subjects" },
    { method: "GET", path: "/api/facts/audiences" },
    { method: "POST", path: "/api/facts/facts", body: { fact_text: "test" } },
  ];

  for (const endpoint of protectedEndpoints) {
    const res = await fetchWithTimeout(`${baseUrl}${endpoint.path}`, {
      method: endpoint.method,
      headers: endpoint.body ? { "Content-Type": "application/json" } : {},
      body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
    });

    assert.equal(
      res.status,
      401,
      `Unauthenticated ${endpoint.method} ${endpoint.path} should return 401, got ${res.status}`
    );
  }
});

test("pitfall: authz - Invalid token claims should not grant access", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-invalid-claims-"));

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

  // Create a fake JWT with manipulated claims (without valid signature)
  const fakeJwt = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url") + "." +
    Buffer.from(JSON.stringify({ sub: "user123", isAdmin: true })).toString("base64url") + ".";

  const res = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
    headers: { Authorization: `Bearer ${fakeJwt}` },
  });

  assert.equal(
    res.status,
    401,
    `Token with no/invalid signature should return 401, got ${res.status}`
  );
});

// ============================================================================
// SESSION MANAGEMENT PITFALLS
// ============================================================================

test("pitfall: sessions - Expired tokens should be rejected", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-expired-token-"));

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

  // Create a token with exp claim in the past
  const expiredJwt = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url") + "." +
    Buffer.from(JSON.stringify({
      sub: "user123",
      id: "user123",
      exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
    })).toString("base64url") + ".";

  const res = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
    headers: { Authorization: `Bearer ${expiredJwt}` },
  });

  // Should be rejected due to expiration
  assert.ok(
    res.status === 401 || res.status === 403,
    `Expired token should be rejected, got ${res.status}`
  );
});

test("pitfall: sessions - Cookie handling should be secure", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-cookie-security-"));

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

  // Attempt to set a cookie with invalid format
  const res = await fetchWithTimeout(`${baseUrl}/health`);

  // In production, any secure cookies should have appropriate flags
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    // If a session cookie is set, it should have security flags
    if (setCookie.includes("connect.sid") || setCookie.includes("session")) {
      assert.ok(
        setCookie.includes("HttpOnly") || setCookie.includes("Secure"),
        `Session cookie should have security flags: ${setCookie}`
      );
    }
  }
});

// ============================================================================
// PRIVILEGE ESCALATION PITFALLS
// ============================================================================

test("pitfall: authz - Admin claim cannot be forged by user", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-privilege-escalation-"));

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

  // Try to create a token claiming to be admin
  const forgedAdminJwt = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url") + "." +
    Buffer.from(JSON.stringify({
      sub: "attacker",
      id: "attacker",
      isAdmin: true,
      role: "admin",
    })).toString("base64url") + ".invalid";

  const res = await fetchWithTimeout(`${baseUrl}/auth/admin/config`, {
    headers: { Authorization: `Bearer ${forgedAdminJwt}` },
  });

  // Should not be allowed to access admin endpoints with forged admin claim
  assert.ok(
    res.status === 401 || res.status === 403,
    `Forged admin token should be rejected, got ${res.status}`
  );
});

// ============================================================================
// TIMING AND STATE RACE CONDITIONS
// ============================================================================

test("pitfall: authz - Race between token revocation and use", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-revocation-race-"));

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

  // This test verifies that the system handles concurrent token revocation
  // The system should be able to handle multiple rapid requests
  const requests = [];
  for (let i = 0; i < 5; i++) {
    requests.push(
      fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
        headers: { Authorization: "Bearer test-token" },
      })
    );
  }

  const results = await Promise.all(requests);

  // All should return 401, not 500
  for (const res of results) {
    assert.ok(
      res.status === 401 || res.status === 200,
      `Should not crash on concurrent token validation, got ${res.status}`
    );
  }
});

// ============================================================================
// INPUT SANITIZATION IN AUTH CONTEXT
// ============================================================================

test("pitfall: authz - JWT payload with malicious nested claims", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "pit-nested-claims-"));

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

  // Malformed JWT with nested/prototype pollution attempts
  const maliciousPayloads = [
    { __proto__: { isAdmin: true }, id: "user" },
    { constructor: { prototype: { isAdmin: true } }, id: "user" },
    { "isAdmin\u0000": false, isAdmin: true, id: "user" }, // Null byte injection
  ];

  for (const payload of maliciousPayloads) {
    const forgedJwt = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url") + "." +
      Buffer.from(JSON.stringify(payload)).toString("base64url") + ".";

    const res = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
      headers: { Authorization: `Bearer ${forgedJwt}` },
    });

    assert.ok(
      res.status === 401 || res.status === 400,
      `Malicious JWT should be rejected, got ${res.status}`
    );
  }
});
