import nodeTest from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import { runCommand, startProcess, terminateProcess, waitForHttp } from "./helpers.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const serverRoot = path.join(repoRoot, "apps", "fact-server");
const serverConfigPath = path.join(repoRoot, "apps", "fact-server", "config", "discord-auth.json");
const TOKEN_ENCRYPTION_KEY = "e2e-token-key";
const SESSION_SECRET = "e2e-session-secret-0123456789abcdef0123456789";

// These tests mutate shared config on disk; force serial execution to avoid race conditions.
const test = (name, fn) => nodeTest(name, { concurrency: false }, fn);

function writeFileAtomic(filePath, content) {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(
    dir,
    `.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  fs.writeFileSync(tmpPath, content, "utf8");
  fs.renameSync(tmpPath, filePath);
}

function createIsolatedServerConfig(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const configPath = path.join(dir, "discord-auth.json");
  fs.copyFileSync(serverConfigPath, configPath);
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return configPath;
}

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

function updateSessionCookie(currentCookie, response) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) return currentCookie;
  const match = setCookie.match(/connect\.sid=[^;]+/);
  return match ? match[0] : currentCookie;
}

function buildUnsignedJwt(payload) {
  const header = { alg: "none", typ: "entity-statement+jwt" };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedHeader}.${encodedPayload}.`;
}

function buildHs256Jwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += String(chunk);
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function startMockFederationProvider(options = {}) {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const authorizeRequests = [];
  const tokenRequests = [];
  const codeNonceMap = new Map();
  const oidcClientSecret = "federation-e2e-client-secret";
  const idTokenIssuerOverride =
    typeof options.idTokenIssuerOverride === "string" && options.idTokenIssuerOverride.trim()
      ? options.idTokenIssuerOverride.trim()
      : null;
  const idTokenAudienceOverride =
    typeof options.idTokenAudienceOverride === "string" && options.idTokenAudienceOverride.trim()
      ? options.idTokenAudienceOverride.trim()
      : null;
  const idTokenNonceOverride =
    typeof options.idTokenNonceOverride === "string" && options.idTokenNonceOverride.trim()
      ? options.idTokenNonceOverride.trim()
      : null;
  const omitIdTokenNonce = options.omitIdTokenNonce === true;
  const idTokenExpiresInSeconds = Number.isFinite(options.idTokenExpiresInSeconds)
    ? Number(options.idTokenExpiresInSeconds)
    : 3600;
  const idTokenNbfOffsetSeconds = Number.isFinite(options.idTokenNbfOffsetSeconds)
    ? Number(options.idTokenNbfOffsetSeconds)
    : null;

  const server = http.createServer(async (req, res) => {
    const method = req.method || "GET";
    const requestUrl = new URL(req.url || "/", baseUrl);

    if (method === "GET" && requestUrl.pathname === "/.well-known/openid-federation") {
      const payload = {
        iss: baseUrl,
        sub: baseUrl,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        metadata: {
          openid_provider: {
            issuer: baseUrl,
            authorization_endpoint: `${baseUrl}/authorize`,
            token_endpoint: `${baseUrl}/token`,
            userinfo_endpoint: `${baseUrl}/userinfo`,
            id_token_signing_alg_values_supported: ["HS256"],
            token_endpoint_auth_methods_supported: ["client_secret_basic"],
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code"],
          },
        },
      };
      res.statusCode = 200;
      res.setHeader("content-type", "application/entity-statement+jwt");
      res.end(buildUnsignedJwt(payload));
      return;
    }

    if (method === "GET" && requestUrl.pathname === "/authorize") {
      const nonce = requestUrl.searchParams.get("nonce");
      authorizeRequests.push({
        url: requestUrl.toString(),
        query: Object.fromEntries(requestUrl.searchParams.entries()),
      });

      const redirectUri = requestUrl.searchParams.get("redirect_uri");
      const state = requestUrl.searchParams.get("state");
      if (!redirectUri) {
        res.statusCode = 400;
        res.end("missing redirect_uri");
        return;
      }

      const callbackUrl = new URL(redirectUri);
      const code = `mock-code-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      callbackUrl.searchParams.set("code", code);
      if (nonce) codeNonceMap.set(code, nonce);
      if (state) callbackUrl.searchParams.set("state", state);

      res.statusCode = 302;
      res.setHeader("location", callbackUrl.toString());
      res.end();
      return;
    }

    if (method === "POST" && requestUrl.pathname === "/token") {
      const body = await readRequestBody(req);
      const params = new URLSearchParams(body);
      const code = params.get("code") || "missing-code";
      const nonceFromCode = codeNonceMap.get(code);
      tokenRequests.push({
        url: requestUrl.toString(),
        body,
        params: Object.fromEntries(params.entries()),
      });

      let clientId = params.get("client_id") || "fact-index-frontend";
      const authorization = req.headers.authorization || "";
      if (authorization.toLowerCase().startsWith("basic ")) {
        const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
        const [id] = decoded.split(":");
        if (id) clientId = id;
      }

      const now = Math.floor(Date.now() / 1000);
      const nonce = omitIdTokenNonce ? null : idTokenNonceOverride || nonceFromCode || null;
      const idToken = buildHs256Jwt(
        {
          iss: idTokenIssuerOverride || baseUrl,
          sub: `mock-user-${code}`,
          aud: idTokenAudienceOverride || clientId,
          iat: now,
          exp: now + idTokenExpiresInSeconds,
          ...(typeof idTokenNbfOffsetSeconds === "number" ? { nbf: now + idTokenNbfOffsetSeconds } : {}),
          ...(nonce ? { nonce } : {}),
          email: "mock-user@example.org",
          name: "Mock Federation User",
        },
        oidcClientSecret,
      );

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          access_token: `mock-access-${code}`,
          token_type: "Bearer",
          expires_in: 3600,
          scope: "openid profile email",
          id_token: idToken,
        }),
      );
      return;
    }

    if (method === "GET" && requestUrl.pathname === "/userinfo") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          sub: "mock-user",
          email: "mock-user@example.org",
          name: "Mock Federation User",
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });

  return {
    baseUrl,
    oidcClientSecret,
    getAuthorizeRequests: () => [...authorizeRequests],
    getTokenRequests: () => [...tokenRequests],
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

async function mintToken({
  userId,
  username,
  isAdmin,
  keysDir,
  guild = null,
  cachedGuildIds = [],
  cachedMemberRoles = [],
  hasRole = true,
}) {
  const payload = {
    type: "discord",
    id: userId,
    username,
    avatar: null,
    discriminator: null,
    guild,
    hasRole: Boolean(hasRole),
    isAdmin: Boolean(isAdmin),
    devBypass: false,
    cacheUpdatedAt: Date.now(),
    lastCheck: Date.now(),
    cachedGuildIds: Array.isArray(cachedGuildIds) ? cachedGuildIds : [],
    cachedMemberRoles: Array.isArray(cachedMemberRoles) ? cachedMemberRoles : [],
  };

  const script = [
    "import { cleanupJWKS, initializeJWKS } from './src/auth/jwks.ts';",
    "import { generateJWT } from './src/auth/jwt.ts';",
    "initializeJWKS();",
    "const payload = JSON.parse(process.env.E2E_JWT_PAYLOAD || '{}');",
    "const token = generateJWT(payload);",
    "process.stdout.write(token);",
    "cleanupJWKS();",
    "process.exit(0);",
  ].join("");

  const result = await runCommand(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-e", script],
    {
      cwd: path.join(repoRoot, "apps", "fact-server"),
      env: {
        ...process.env,
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        E2E_JWT_PAYLOAD: JSON.stringify(payload),
      },
    },
  );

  assert.equal(result.code, 0, `Failed to mint JWT\n${result.output}`);
  const output = String(result.output || "").trim();
  const tokenMatch = output.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g);
  const token = tokenMatch?.[tokenMatch.length - 1] ?? "";
  assert.ok(token.split(".").length === 3, `Invalid minted token output\n${result.output}`);
  return token;
}

async function mintTokenWithoutJti({
  userId,
  username,
  isAdmin,
  keysDir,
  guild = null,
  cachedGuildIds = [],
  cachedMemberRoles = [],
  hasRole = true,
}) {
  const payload = {
    sub: userId,
    username,
    avatar: null,
    discriminator: null,
    guild,
    hasRole: Boolean(hasRole),
    isAdmin: Boolean(isAdmin),
    devBypass: false,
    cacheUpdatedAt: Date.now(),
    last_check: Date.now(),
    cachedGuildIds: Array.isArray(cachedGuildIds) ? cachedGuildIds : [],
    cachedMemberRoles: Array.isArray(cachedMemberRoles) ? cachedMemberRoles : [],
  };

  const script = [
    "import jwt from 'jsonwebtoken';",
    "import { cleanupJWKS, initializeJWKS, getCurrentPrivateKey, getCurrentKeyId } from './src/auth/jwks.ts';",
    "initializeJWKS();",
    "const payload = JSON.parse(process.env.E2E_JWT_PAYLOAD || '{}');",
    "const token = jwt.sign(payload, getCurrentPrivateKey(), { algorithm: 'RS256', keyid: getCurrentKeyId(), expiresIn: '7d' });",
    "process.stdout.write(token);",
    "cleanupJWKS();",
    "process.exit(0);",
  ].join("");

  const result = await runCommand(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-e", script],
    {
      cwd: path.join(repoRoot, "apps", "fact-server"),
      env: {
        ...process.env,
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        E2E_JWT_PAYLOAD: JSON.stringify(payload),
      },
    },
  );

  assert.equal(result.code, 0, `Failed to mint no-jti JWT\n${result.output}`);
  const output = String(result.output || "").trim();
  const tokenMatch = output.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g);
  const token = tokenMatch?.[tokenMatch.length - 1] ?? "";
  assert.ok(token.split(".").length === 3, `Invalid minted no-jti token output\n${result.output}`);
  return token;
}

test("server e2e: casbin permission flow", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-jwks-"));

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });

  const serverConfigPath = createIsolatedServerConfig(t, "fact-e2e-config-");
  const config = JSON.parse(fs.readFileSync(serverConfigPath, "utf8"));
  const adminUserId = "repo-e2e-admin";
  config.adminUsers = Array.isArray(config.adminUsers) ? config.adminUsers : [];
  if (!config.adminUsers.includes(adminUserId)) {
    config.adminUsers.push(adminUserId);
    writeFileAtomic(serverConfigPath, JSON.stringify(config, null, 2));
  }


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
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const userToken = await mintToken({
    userId: "map-list-user-01",
    username: "repo-e2e-user",
    isAdmin: false,
    keysDir,
  });
  const adminToken = await mintToken({
    userId: adminUserId,
    username: "repo-e2e-admin",
    isAdmin: true,
    keysDir,
  });

  const userFactsRead = await fetchWithTimeout(`${baseUrl}/api/facts/subjects`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const userFactsReadBody = await userFactsRead.text();
  assert.equal(
    userFactsRead.status,
    200,
    `Expected user to read facts\nstatus=${userFactsRead.status}\nbody=${userFactsReadBody}\n${getOutput()}`,
  );

  const userAdminConfig = await fetchWithTimeout(`${baseUrl}/auth/admin/config`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const userAdminConfigBody = await userAdminConfig.text();
  assert.equal(
    userAdminConfig.status,
    403,
    `Expected user to be denied admin config\nstatus=${userAdminConfig.status}\nbody=${userAdminConfigBody}\n${getOutput()}`,
  );

  const adminAdminConfig = await fetchWithTimeout(`${baseUrl}/auth/admin/config`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminAdminConfigBody = await adminAdminConfig.text();
  assert.equal(
    adminAdminConfig.status,
    200,
    `Expected admin to read admin config\nstatus=${adminAdminConfig.status}\nbody=${adminAdminConfigBody}\n${getOutput()}`,
  );
});

test("server e2e: fact db permissions enforce read/write boundaries", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-factdb-perms-jwks-"));

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });

  const serverConfigPath = createIsolatedServerConfig(t, "fact-e2e-config-");
  const config = JSON.parse(fs.readFileSync(serverConfigPath, "utf8"));
  const adminUserId = "repo-e2e-admin-factdb-perms";
  config.adminUsers = Array.isArray(config.adminUsers) ? config.adminUsers : [];
  if (!config.adminUsers.includes(adminUserId)) {
    config.adminUsers.push(adminUserId);
    writeFileAtomic(serverConfigPath, JSON.stringify(config, null, 2));
  }


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
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const userToken = await mintToken({
    userId: "repo-e2e-factdb-user",
    username: "repo-e2e-factdb-user",
    isAdmin: false,
    keysDir,
  });
  const adminToken = await mintToken({
    userId: adminUserId,
    username: "repo-e2e-factdb-admin",
    isAdmin: true,
    keysDir,
  });

  const unauthFactsRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts`);
  const unauthFactsBody = await unauthFactsRes.text();
  assert.equal(
    unauthFactsRes.status,
    401,
    `Expected unauthenticated fact list to be denied\nstatus=${unauthFactsRes.status}\nbody=${unauthFactsBody}\n${getOutput()}`,
  );

  const readEndpoints = ["/api/facts/facts", "/api/facts/subjects", "/api/facts/audiences"];
  for (const endpoint of readEndpoints) {
    const userReadRes = await fetchWithTimeout(`${baseUrl}${endpoint}`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const userReadBody = await userReadRes.text();
    assert.equal(
      userReadRes.status,
      200,
      `Expected user read access for ${endpoint}\nstatus=${userReadRes.status}\nbody=${userReadBody}\n${getOutput()}`,
    );
  }

  const nonAdminCreateRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fact_text: "Non-admin should not create",
      source: "e2e",
      type: "permission",
      context: "factdb permissions",
      subjects: ["permissions"],
      audiences: ["qa"],
    }),
  });
  const nonAdminCreateBody = await nonAdminCreateRes.text();
  assert.equal(
    nonAdminCreateRes.status,
    403,
    `Expected non-admin create to be denied\nstatus=${nonAdminCreateRes.status}\nbody=${nonAdminCreateBody}\n${getOutput()}`,
  );

  const adminCreateRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fact_text: "Admin-created fact for permission matrix",
      source: "e2e",
      type: "permission",
      context: "factdb permissions",
      subjects: ["permissions"],
      audiences: ["qa"],
    }),
  });
  const adminCreateBody = await adminCreateRes.text();
  assert.equal(
    adminCreateRes.status,
    200,
    `Expected admin create success\nstatus=${adminCreateRes.status}\nbody=${adminCreateBody}\n${getOutput()}`,
  );

  let createdFact = null;
  try {
    createdFact = JSON.parse(adminCreateBody);
  } catch (error) {
    assert.fail(`Expected admin create JSON response\n${String(error)}\n${adminCreateBody}`);
  }

  const createdFactId = Number(createdFact?.id);
  assert.ok(Number.isInteger(createdFactId) && createdFactId > 0, `Expected created fact id\n${adminCreateBody}`);

  const userReadByIdRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts/${createdFactId}`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const userReadByIdBody = await userReadByIdRes.text();
  assert.equal(
    userReadByIdRes.status,
    200,
    `Expected user to read fact by id\nstatus=${userReadByIdRes.status}\nbody=${userReadByIdBody}\n${getOutput()}`,
  );

  const nonAdminUpdateRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts/${createdFactId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fact_text: "Non-admin update attempt" }),
  });
  const nonAdminUpdateBody = await nonAdminUpdateRes.text();
  assert.equal(
    nonAdminUpdateRes.status,
    403,
    `Expected non-admin update to be denied\nstatus=${nonAdminUpdateRes.status}\nbody=${nonAdminUpdateBody}\n${getOutput()}`,
  );

  const nonAdminDeleteRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts/${createdFactId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const nonAdminDeleteBody = await nonAdminDeleteRes.text();
  assert.equal(
    nonAdminDeleteRes.status,
    403,
    `Expected non-admin delete to be denied\nstatus=${nonAdminDeleteRes.status}\nbody=${nonAdminDeleteBody}\n${getOutput()}`,
  );

  const adminUpdateRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts/${createdFactId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fact_text: "Admin-updated fact for permission matrix" }),
  });
  const adminUpdateBody = await adminUpdateRes.text();
  assert.equal(
    adminUpdateRes.status,
    200,
    `Expected admin update success\nstatus=${adminUpdateRes.status}\nbody=${adminUpdateBody}\n${getOutput()}`,
  );

  const adminDeleteRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts/${createdFactId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminDeleteBody = await adminDeleteRes.text();
  assert.equal(
    adminDeleteRes.status,
    200,
    `Expected admin delete success\nstatus=${adminDeleteRes.status}\nbody=${adminDeleteBody}\n${getOutput()}`,
  );
});

test("server e2e: admin can grant fact db edit permissions to a specific non-admin user", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-factdb-delegation-jwks-"));

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });

  const serverConfigPath = createIsolatedServerConfig(t, "fact-e2e-config-");
  const config = JSON.parse(fs.readFileSync(serverConfigPath, "utf8"));
  const runSuffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const adminUserId = "repo-e2e-admin-factdb-delegation";
  const delegatedUserId = `repo-e2e-factdb-delegated-editor-${runSuffix}`;
  const delegatedRoleId = `role:facts:editor:e2e:${runSuffix}`;
  config.adminUsers = Array.isArray(config.adminUsers) ? config.adminUsers : [];
  if (!config.adminUsers.includes(adminUserId)) {
    config.adminUsers.push(adminUserId);
    writeFileAtomic(serverConfigPath, JSON.stringify(config, null, 2));
  }


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
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const delegatedUserToken = await mintToken({
    userId: delegatedUserId,
    username: delegatedUserId,
    isAdmin: false,
    keysDir,
  });
  const adminToken = await mintToken({
    userId: adminUserId,
    username: adminUserId,
    isAdmin: true,
    keysDir,
  });

  const preGrantCreateRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${delegatedUserToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fact_text: "Delegated user should be blocked before grant",
      source: "e2e",
      type: "permission",
      context: "delegation-pre-grant",
      subjects: ["permissions"],
      audiences: ["qa"],
    }),
  });
  const preGrantCreateBody = await preGrantCreateRes.text();
  assert.equal(
    preGrantCreateRes.status,
    403,
    `Expected delegated non-admin create to be denied before grant\nstatus=${preGrantCreateRes.status}\nbody=${preGrantCreateBody}\n${getOutput()}`,
  );

  const selfGrantAttemptRes = await fetchWithTimeout(`${baseUrl}/auth/admin/user-roles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${delegatedUserToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: delegatedUserId,
      roles: [delegatedRoleId],
    }),
  });
  const selfGrantAttemptBody = await selfGrantAttemptRes.text();
  assert.equal(
    selfGrantAttemptRes.status,
    403,
    `Expected non-admin role grant attempt to be denied\nstatus=${selfGrantAttemptRes.status}\nbody=${selfGrantAttemptBody}\n${getOutput()}`,
  );

  const createRoleRes = await fetchWithTimeout(`${baseUrl}/auth/admin/roles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      roleId: delegatedRoleId,
      name: "Delegated Fact Editor",
      type: "custom",
      description: "Can edit fact database records",
      permissions: ["facts:write"],
    }),
  });
  const createRoleBody = await createRoleRes.text();
  assert.equal(
    createRoleRes.status,
    200,
    `Expected admin to create delegated role\nstatus=${createRoleRes.status}\nbody=${createRoleBody}\n${getOutput()}`,
  );

  const assignRoleRes = await fetchWithTimeout(`${baseUrl}/auth/admin/user-roles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: delegatedUserId,
      roles: [delegatedRoleId],
    }),
  });
  const assignRoleBody = await assignRoleRes.text();
  assert.equal(
    assignRoleRes.status,
    200,
    `Expected admin to assign delegated role\nstatus=${assignRoleRes.status}\nbody=${assignRoleBody}\n${getOutput()}`,
  );

  const delegatedCreateRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${delegatedUserToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fact_text: "Delegated user-created fact",
      source: "e2e",
      type: "permission",
      context: "delegation-post-grant",
      subjects: ["permissions"],
      audiences: ["qa"],
    }),
  });
  const delegatedCreateBody = await delegatedCreateRes.text();
  assert.equal(
    delegatedCreateRes.status,
    200,
    `Expected delegated user create success after admin grant\nstatus=${delegatedCreateRes.status}\nbody=${delegatedCreateBody}\n${getOutput()}`,
  );

  let delegatedCreatedFact = null;
  try {
    delegatedCreatedFact = JSON.parse(delegatedCreateBody);
  } catch (error) {
    assert.fail(`Expected delegated create JSON response\n${String(error)}\n${delegatedCreateBody}`);
  }

  const delegatedFactId = Number(delegatedCreatedFact?.id);
  assert.ok(Number.isInteger(delegatedFactId) && delegatedFactId > 0, `Expected delegated fact id\n${delegatedCreateBody}`);

  const delegatedUpdateRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts/${delegatedFactId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${delegatedUserToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fact_text: "Delegated user-updated fact" }),
  });
  const delegatedUpdateBody = await delegatedUpdateRes.text();
  assert.equal(
    delegatedUpdateRes.status,
    200,
    `Expected delegated user update success\nstatus=${delegatedUpdateRes.status}\nbody=${delegatedUpdateBody}\n${getOutput()}`,
  );

  const delegatedDeleteRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts/${delegatedFactId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${delegatedUserToken}` },
  });
  const delegatedDeleteBody = await delegatedDeleteRes.text();
  assert.equal(
    delegatedDeleteRes.status,
    200,
    `Expected delegated user delete success\nstatus=${delegatedDeleteRes.status}\nbody=${delegatedDeleteBody}\n${getOutput()}`,
  );
});

test("server e2e: discord mapping enforces guild constraint for role-based permission grants", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-discord-mapping-guild-jwks-"));
  const runSuffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const adminUserId = "repo-e2e-admin-discord-map-guild";
  const mappedRoleId = `role-discord-map-${runSuffix}`;
  const requiredGuildId = `guild-required-${runSuffix}`;
  const mismatchedGuildId = `guild-mismatch-${runSuffix}`;

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });

  const serverConfigPath = createIsolatedServerConfig(t, "fact-e2e-config-");
  const config = JSON.parse(fs.readFileSync(serverConfigPath, "utf8"));
  config.adminUsers = Array.isArray(config.adminUsers) ? config.adminUsers : [];
  if (!config.adminUsers.includes(adminUserId)) {
    config.adminUsers.push(adminUserId);
    writeFileAtomic(serverConfigPath, JSON.stringify(config, null, 2));
  }

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
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const mismatchedGuildUserToken = await mintToken({
    userId: `repo-e2e-discord-map-mismatch-${runSuffix}`,
    username: `repo-e2e-discord-map-mismatch-${runSuffix}`,
    isAdmin: false,
    keysDir,
    guild: mismatchedGuildId,
    cachedGuildIds: [mismatchedGuildId],
    cachedMemberRoles: [mappedRoleId],
  });
  const matchingGuildUserToken = await mintToken({
    userId: `repo-e2e-discord-map-match-${runSuffix}`,
    username: `repo-e2e-discord-map-match-${runSuffix}`,
    isAdmin: false,
    keysDir,
    guild: requiredGuildId,
    cachedGuildIds: [requiredGuildId],
    cachedMemberRoles: [mappedRoleId],
  });
  const adminToken = await mintToken({
    userId: adminUserId,
    username: adminUserId,
    isAdmin: true,
    keysDir,
  });

  const createMappingRes = await fetchWithTimeout(`${baseUrl}/auth/admin/discord-mappings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      discordGuildId: requiredGuildId,
      discordRoleId: mappedRoleId,
      targetType: "action",
      targetValue: "facts:write",
    }),
  });
  const createMappingBody = await createMappingRes.text();
  assert.equal(
    createMappingRes.status,
    200,
    `Expected admin to create guild-scoped discord mapping\nstatus=${createMappingRes.status}\nbody=${createMappingBody}\n${getOutput()}`,
  );

  const mismatchedGuildWriteRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mismatchedGuildUserToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fact_text: "Guild mismatch should not grant write permission",
      source: "e2e",
      type: "permission",
      context: "discord mapping guild mismatch",
      subjects: ["permissions"],
      audiences: ["qa"],
    }),
  });
  const mismatchedGuildWriteBody = await mismatchedGuildWriteRes.text();
  assert.equal(
    mismatchedGuildWriteRes.status,
    403,
    `Expected guild-mismatched user to be denied facts:write\nstatus=${mismatchedGuildWriteRes.status}\nbody=${mismatchedGuildWriteBody}\n${getOutput()}`,
  );

  const matchingGuildWriteRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${matchingGuildUserToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fact_text: "Guild-matched mapping should grant write permission",
      source: "e2e",
      type: "permission",
      context: "discord mapping guild match",
      subjects: ["permissions"],
      audiences: ["qa"],
    }),
  });
  const matchingGuildWriteBody = await matchingGuildWriteRes.text();
  assert.equal(
    matchingGuildWriteRes.status,
    200,
    `Expected guild-matched user to receive facts:write via mapping\nstatus=${matchingGuildWriteRes.status}\nbody=${matchingGuildWriteBody}\n${getOutput()}`,
  );
});

test("server e2e: all admin endpoints enforce permissions", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-admin-perms-jwks-"));

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });

  const serverConfigPath = createIsolatedServerConfig(t, "fact-e2e-config-");
  const config = JSON.parse(fs.readFileSync(serverConfigPath, "utf8"));
  const adminUserId = "repo-e2e-admin-all-endpoints";
  config.adminUsers = Array.isArray(config.adminUsers) ? config.adminUsers : [];
  if (!config.adminUsers.includes(adminUserId)) {
    config.adminUsers.push(adminUserId);
    writeFileAtomic(serverConfigPath, JSON.stringify(config, null, 2));
  }


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
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const userToken = await mintToken({
    userId: "repo-e2e-non-admin-all-endpoints",
    username: "repo-e2e-non-admin",
    isAdmin: false,
    keysDir,
  });
  const adminToken = await mintToken({
    userId: adminUserId,
    username: "repo-e2e-admin-all-endpoints",
    isAdmin: true,
    keysDir,
  });

  const testCases = [
    { method: "GET", path: "/auth/admin/user-roles" },
    {
      method: "POST",
      path: "/auth/admin/user-roles",
      body: { userId: "matrix-user", roles: ["role:facts:contributor"] },
    },
    { method: "DELETE", path: "/auth/admin/user-roles/matrix-user" },
    { method: "POST", path: "/auth/admin/whitelist", body: { userId: "matrix-whitelist-user" } },
    { method: "DELETE", path: "/auth/admin/whitelist/matrix-whitelist-user" },
    { method: "POST", path: "/auth/admin/admin-users", body: { userId: "matrix-admin-user" } },
    { method: "DELETE", path: "/auth/admin/admin-users/matrix-admin-user" },
    {
      method: "POST",
      path: "/auth/admin/guilds",
      body: { guildId: "matrix-guild-1", requiredRole: ["matrix-role-1"], name: "Matrix Guild" },
    },
    { method: "DELETE", path: "/auth/admin/guilds/matrix-guild-1" },
    {
      method: "POST",
      path: "/auth/admin/discord-mappings",
      body: { discordUserId: "matrix-user-1", targetType: "action", targetValue: "facts:read" },
    },
    { method: "DELETE", path: "/auth/admin/discord-mappings/matrix-discord-map" },
    {
      method: "POST",
      path: "/auth/admin/openid-mappings",
      body: {
        idType: "provider_domain",
        domain: "matrix.example.org",
        targetType: "action",
        targetValue: "facts:read",
      },
    },
    { method: "DELETE", path: "/auth/admin/openid-mappings/matrix-openid-map" },
    {
      method: "POST",
      path: "/auth/admin/roles",
      body: {
        roleId: "matrix-role-custom",
        name: "Matrix Role",
        type: "custom",
        description: "Role for admin matrix",
        permissions: ["facts:read"],
      },
    },
    { method: "DELETE", path: "/auth/admin/roles/matrix-role-custom" },
    { method: "GET", path: "/auth/admin/config" },
    {
      method: "POST",
      path: "/auth/admin/federation/policy",
      body: {
        namingConstraints: ["example.org"],
        allowSubdomains: true,
        allowedEntityTypes: ["openid_provider", "oauth_client"],
        maxPathLength: 2,
        trustAnchorEntityId: "https://trust-anchor.example.org",
      },
    },
    {
      method: "POST",
      path: "/auth/admin/federation/trust-superior",
      body: { trustAnchorEntityId: "https://superior.example.org" },
    },
    { method: "GET", path: "/auth/admin/federation/subordinates" },
    {
      method: "POST",
      path: "/auth/admin/federation/subordinates",
      body: {
        subordinateEntityId: `https://matrix-subordinate-${Date.now()}.example.org`,
        metadata: { federation_entity: { organization_name: "Matrix Subordinate" } },
      },
    },
    {
      method: "POST",
      path: "/auth/admin/federation/trust-marks",
      body: {
        requiredTrustMarks: ["https://trustmark.example.org/basic"],
        claimChecks: [{ claim: "assurance_level", operator: "equals", value: "high" }],
      },
    },
  ];

  for (const entry of testCases) {
    const bodyText = entry.body ? JSON.stringify(entry.body) : undefined;
    const headers = {
      Authorization: `Bearer ${userToken}`,
      ...(bodyText ? { "Content-Type": "application/json" } : {}),
    };
    const userRes = await fetchWithTimeout(`${baseUrl}${entry.path}`, {
      method: entry.method,
      headers,
      body: bodyText,
    });
    const userBody = await userRes.text();
    assert.equal(
      userRes.status,
      403,
      `Expected non-admin to be denied for ${entry.method} ${entry.path}\nstatus=${userRes.status}\nbody=${userBody}\n${getOutput()}`,
    );

    const adminHeaders = {
      Authorization: `Bearer ${adminToken}`,
      ...(bodyText ? { "Content-Type": "application/json" } : {}),
    };
    const adminRes = await fetchWithTimeout(`${baseUrl}${entry.path}`, {
      method: entry.method,
      headers: adminHeaders,
      body: bodyText,
    });
    const adminBody = await adminRes.text();
    assert.equal(
      adminRes.status,
      200,
      `Expected admin access for ${entry.method} ${entry.path}\nstatus=${adminRes.status}\nbody=${adminBody}\n${getOutput()}`,
    );
  }
});

test("server e2e: high-risk routes fail closed when token revocation check is unavailable", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-revocation-fail-closed-jwks-"));
  const sqliteDbPath = path.join(
    os.tmpdir(),
    `fact-e2e-revocation-fail-closed-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite3`,
  );

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });

  const serverConfigPath = createIsolatedServerConfig(t, "fact-e2e-config-");
  const config = JSON.parse(fs.readFileSync(serverConfigPath, "utf8"));
  const adminUserId = "repo-e2e-revocation-admin";
  config.adminUsers = Array.isArray(config.adminUsers) ? config.adminUsers : [];
  if (!config.adminUsers.includes(adminUserId)) {
    config.adminUsers.push(adminUserId);
    writeFileAtomic(serverConfigPath, JSON.stringify(config, null, 2));
  }

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
        SQLITE_DB: sqliteDbPath,
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
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const noJtiAdminToken = await mintTokenWithoutJti({
    userId: adminUserId,
    username: adminUserId,
    isAdmin: true,
    keysDir,
  });

  const lowRiskReadRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
    headers: { Authorization: `Bearer ${noJtiAdminToken}` },
  });
  const lowRiskReadBody = await lowRiskReadRes.text();
  assert.equal(
    lowRiskReadRes.status,
    200,
    `Expected low-risk facts:read to remain available with legacy no-jti token\nstatus=${lowRiskReadRes.status}\nbody=${lowRiskReadBody}\n${getOutput()}`,
  );

  const highRiskAdminRes = await fetchWithTimeout(`${baseUrl}/auth/admin/config`, {
    headers: { Authorization: `Bearer ${noJtiAdminToken}` },
  });
  const highRiskAdminBody = await highRiskAdminRes.text();
  assert.equal(
    highRiskAdminRes.status,
    401,
    `Expected high-risk admin route to fail closed without token jti\nstatus=${highRiskAdminRes.status}\nbody=${highRiskAdminBody}\n${getOutput()}`,
  );
  assert.match(
    highRiskAdminBody,
    /Revocation check unavailable/i,
    `Expected high-risk denial to explain revocation check requirement\n${highRiskAdminBody}`,
  );

  const highRiskWriteRes = await fetchWithTimeout(`${baseUrl}/api/facts/facts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${noJtiAdminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fact_text: "Should fail closed without jti",
      source: "e2e",
      type: "permission",
      context: "revocation fail closed",
      subjects: ["security"],
      audiences: ["qa"],
    }),
  });
  const highRiskWriteBody = await highRiskWriteRes.text();
  assert.equal(
    highRiskWriteRes.status,
    401,
    `Expected high-risk facts:write route to fail closed without token jti\nstatus=${highRiskWriteRes.status}\nbody=${highRiskWriteBody}\n${getOutput()}`,
  );

  const revocationCheckableAdminToken = await mintToken({
    userId: adminUserId,
    username: `${adminUserId}-checkable`,
    isAdmin: true,
    keysDir,
  });

  const preDropAdminRes = await fetchWithTimeout(`${baseUrl}/auth/admin/config`, {
    headers: { Authorization: `Bearer ${revocationCheckableAdminToken}` },
  });
  const preDropAdminBody = await preDropAdminRes.text();
  assert.equal(
    preDropAdminRes.status,
    200,
    `Expected revocation-checkable token to work before blacklist-store failure\nstatus=${preDropAdminRes.status}\nbody=${preDropAdminBody}\n${getOutput()}`,
  );

  const dropBlacklistScript = [
    "import { initializeDb, getDb } from './src/db/schema.ts';",
    "await initializeDb();",
    "await getDb().schema.dropTable('jwt_token_blacklist').ifExists().execute();",
    "process.exit(0);",
  ].join("");
  const dropBlacklistRes = await runCommand(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-e", dropBlacklistScript],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        TS_NODE_PROJECT: "tsconfig.json",
        SQLITE_DB: sqliteDbPath,
      },
    },
  );
  assert.equal(
    dropBlacklistRes.code,
    0,
    `Expected blacklist table drop helper to succeed\n${dropBlacklistRes.output}`,
  );

  const postDropAdminRes = await fetchWithTimeout(`${baseUrl}/auth/admin/config`, {
    headers: { Authorization: `Bearer ${revocationCheckableAdminToken}` },
  });
  const postDropAdminBody = await postDropAdminRes.text();
  assert.equal(
    postDropAdminRes.status,
    401,
    `Expected high-risk admin route to fail closed when revocation store is unavailable\nstatus=${postDropAdminRes.status}\nbody=${postDropAdminBody}\n${getOutput()}`,
  );
});

test("server e2e: dev login is rejected when DEV_LOGIN_MODE is disabled", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-dev-disabled-jwks-"));

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
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const devLoginRes = await fetchWithTimeout(`${baseUrl}/auth/dev?user=blocked-user&admin=true`, {
    redirect: "manual",
  });
  const devLoginBody = await devLoginRes.text();
  assert.equal(
    devLoginRes.status,
    404,
    `Expected /auth/dev to be unavailable when DEV_LOGIN_MODE=false\nstatus=${devLoginRes.status}\nbody=${devLoginBody}\n${getOutput()}`,
  );
  assert.equal(
    devLoginRes.headers.get("location"),
    null,
    `Dev login should not redirect when disabled\nstatus=${devLoginRes.status}\nbody=${devLoginBody}`,
  );
  assert.equal(
    devLoginRes.headers.get("set-cookie"),
    null,
    `Dev login should not set auth cookie when disabled\nstatus=${devLoginRes.status}\nbody=${devLoginBody}`,
  );

  const availableRes = await fetchWithTimeout(`${baseUrl}/auth/available`);
  const availableBody = await availableRes.text();
  assert.ok(
    availableRes.status === 200 || availableRes.status === 503,
    `Expected /auth/available to return 200 or 503\nstatus=${availableRes.status}\nbody=${availableBody}\n${getOutput()}`,
  );

  let availableJson = null;
  try {
    availableJson = JSON.parse(availableBody);
  } catch (error) {
    assert.fail(`Expected /auth/available JSON\n${String(error)}\n${availableBody}`);
  }

  const providers = Array.isArray(availableJson?.providers) ? availableJson.providers : [];
  assert.equal(
    providers.some((provider) => provider?.name === "dev"),
    false,
    `Expected dev provider to be absent when DEV_LOGIN_MODE=false\n${availableBody}`,
  );
});

test("server e2e: dev login honors admin override and does not grant admin on admin=false", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-dev-admin-override-jwks-"));

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
        NODE_ENV: "development",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        DEV_LOGIN_MODE: "true",
        DEV_IS_ADMIN: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
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
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const nonAdminLoginRes = await fetchWithTimeout(`${baseUrl}/auth/dev?user=dev-non-admin&admin=false`, {
    redirect: "manual",
  });
  const nonAdminSetCookie = nonAdminLoginRes.headers.get("set-cookie") || "";
  const nonAdminTokenMatch = nonAdminSetCookie.match(/auth_token=([^;]+)/);
  const nonAdminToken = nonAdminTokenMatch ? decodeURIComponent(nonAdminTokenMatch[1]) : "";
  assert.ok(nonAdminToken, `Expected auth_token cookie from non-admin dev login\n${nonAdminSetCookie}\n${getOutput()}`);

  const nonAdminConfigRes = await fetchWithTimeout(`${baseUrl}/auth/admin/config`, {
    headers: { Authorization: `Bearer ${nonAdminToken}` },
  });
  const nonAdminConfigBody = await nonAdminConfigRes.text();
  assert.equal(
    nonAdminConfigRes.status,
    401,
    `Expected dev login with admin=false to fail closed on high-risk admin route without revocation-checkable token\nstatus=${nonAdminConfigRes.status}\nbody=${nonAdminConfigBody}\n${getOutput()}`,
  );
  assert.match(
    nonAdminConfigBody,
    /Revocation check unavailable/i,
    `Expected revocation fail-closed reason for non-admin dev token\n${nonAdminConfigBody}`,
  );

  const adminLoginRes = await fetchWithTimeout(`${baseUrl}/auth/dev?user=dev-admin&admin=true`, {
    redirect: "manual",
  });
  const adminSetCookie = adminLoginRes.headers.get("set-cookie") || "";
  const adminTokenMatch = adminSetCookie.match(/auth_token=([^;]+)/);
  const adminToken = adminTokenMatch ? decodeURIComponent(adminTokenMatch[1]) : "";
  assert.ok(adminToken, `Expected auth_token cookie from admin dev login\n${adminSetCookie}\n${getOutput()}`);

  const adminConfigRes = await fetchWithTimeout(`${baseUrl}/auth/admin/config`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminConfigBody = await adminConfigRes.text();
  assert.equal(
    adminConfigRes.status,
    200,
    `Expected dev login with admin=true to access admin config\nstatus=${adminConfigRes.status}\nbody=${adminConfigBody}\n${getOutput()}`,
  );
});

test("server e2e: logout revokes cookie-authenticated JWT and clears auth cookie", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-logout-cookie-jwks-"));
  const isolatedConfigPath = createIsolatedServerConfig(t, "fact-e2e-logout-cookie-config-");

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
        NODE_ENV: "development",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        DISCORD_AUTH_CONFIG_PATH: isolatedConfigPath,
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
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const cookieUserToken = await mintToken({
    userId: "repo-e2e-cookie-logout-user",
    username: "repo-e2e-cookie-logout-user",
    isAdmin: false,
    keysDir,
  });

  const authCookieHeader = `auth_token=${encodeURIComponent(cookieUserToken)}`;
  const beforeLogoutRes = await fetchWithTimeout(`${baseUrl}/auth/me`, {
    headers: { Cookie: authCookieHeader },
  });
  const beforeLogoutBody = await beforeLogoutRes.text();
  assert.equal(
    beforeLogoutRes.status,
    200,
    `Expected cookie-authenticated token to work before logout\nstatus=${beforeLogoutRes.status}\nbody=${beforeLogoutBody}\n${getOutput()}`,
  );

  const logoutRes = await fetchWithTimeout(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: { Cookie: authCookieHeader },
  });
  assert.equal(
    logoutRes.status,
    204,
    `Expected logout success for cookie-authenticated token\nstatus=${logoutRes.status}\n${getOutput()}`,
  );

  const logoutSetCookie = logoutRes.headers.get("set-cookie") || "";
  assert.match(
    logoutSetCookie,
    /auth_token=;/,
    `Expected logout to clear auth_token cookie\nset-cookie=${logoutSetCookie}\n${getOutput()}`,
  );

  const revokedCookieRes = await fetchWithTimeout(`${baseUrl}/auth/me`, {
    headers: { Cookie: authCookieHeader },
  });
  const revokedCookieBody = await revokedCookieRes.text();
  assert.equal(
    revokedCookieRes.status,
    401,
    `Expected revoked cookie token to be rejected after logout\nstatus=${revokedCookieRes.status}\nbody=${revokedCookieBody}\n${getOutput()}`,
  );

  let revokedJson = null;
  try {
    revokedJson = JSON.parse(revokedCookieBody);
  } catch (error) {
    assert.fail(`Expected revoked /auth/me response to be JSON\n${String(error)}\n${revokedCookieBody}`);
  }
  assert.equal(
    revokedJson?.error,
    "token_revoked",
    `Expected token_revoked reason after cookie logout\n${revokedCookieBody}`,
  );
});

test("server e2e: discord oauth fails closed when strategy is unconfigured", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-discord-unconfigured-jwks-"));

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
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const oauthRes = await fetchWithTimeout(`${baseUrl}/auth/discord`, { redirect: "manual" });
  const oauthBody = await oauthRes.text();
  assert.equal(
    oauthRes.status,
    503,
    `Expected /auth/discord to fail closed when strategy is missing\nstatus=${oauthRes.status}\nbody=${oauthBody}\n${getOutput()}`,
  );

  let oauthJson = null;
  try {
    oauthJson = JSON.parse(oauthBody);
  } catch (error) {
    assert.fail(`Expected JSON body for unconfigured strategy\n${String(error)}\n${oauthBody}`);
  }
  assert.match(
    String(oauthJson?.error || ""),
    /not configured/i,
    `Expected strategy-not-configured error\n${oauthBody}`,
  );
});

test("server e2e: discord callback rejects missing or invalid state before provider errors", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-discord-state-guard-jwks-"));

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
        NODE_ENV: "development",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
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
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const missingStateRes = await fetchWithTimeout(
    `${baseUrl}/auth/discord/callback?error=access_denied&error_description=user%20denied`,
    { redirect: "manual" },
  );
  assert.equal(
    missingStateRes.status,
    302,
    `Expected redirect for missing state\nstatus=${missingStateRes.status}\n${getOutput()}`,
  );
  const missingStateLocation = new URL(missingStateRes.headers.get("location") || "", baseUrl);
  assert.equal(missingStateLocation.pathname, "/login", `Expected /login redirect\n${missingStateLocation.toString()}`);
  assert.equal(
    missingStateLocation.searchParams.get("reasonCode"),
    "missing_state",
    `Expected missing_state reason code\n${missingStateLocation.toString()}`,
  );
  assert.equal(
    missingStateLocation.searchParams.get("error"),
    "csrf_failure",
    `Expected csrf_failure for missing state\n${missingStateLocation.toString()}`,
  );

  const invalidStateRes = await fetchWithTimeout(
    `${baseUrl}/auth/discord/callback?error=access_denied&state=not-a-valid-state`,
    { redirect: "manual" },
  );
  assert.equal(
    invalidStateRes.status,
    302,
    `Expected redirect for invalid state\nstatus=${invalidStateRes.status}\n${getOutput()}`,
  );
  const invalidStateLocation = new URL(invalidStateRes.headers.get("location") || "", baseUrl);
  assert.equal(invalidStateLocation.pathname, "/login", `Expected /login redirect\n${invalidStateLocation.toString()}`);
  assert.equal(
    invalidStateLocation.searchParams.get("reasonCode"),
    "invalid_state",
    `Expected invalid_state reason code\n${invalidStateLocation.toString()}`,
  );
  assert.equal(
    invalidStateLocation.searchParams.get("error"),
    "csrf_failure",
    `Expected csrf_failure for invalid state\n${invalidStateLocation.toString()}`,
  );

  const duplicateStateRes = await fetchWithTimeout(
    `${baseUrl}/auth/discord/callback?state=state-a&state=state-b&error=access_denied`,
    { redirect: "manual" },
  );
  assert.equal(
    duplicateStateRes.status,
    302,
    `Expected redirect for duplicate state query\nstatus=${duplicateStateRes.status}\n${getOutput()}`,
  );
  const duplicateStateLocation = new URL(duplicateStateRes.headers.get("location") || "", baseUrl);
  assert.equal(
    duplicateStateLocation.pathname,
    "/login",
    `Expected /login redirect for duplicate state\n${duplicateStateLocation.toString()}`,
  );
  assert.equal(
    duplicateStateLocation.searchParams.get("reasonCode"),
    "invalid_request",
    `Expected invalid_request reason code for duplicate state\n${duplicateStateLocation.toString()}`,
  );
  assert.equal(
    duplicateStateLocation.searchParams.get("error"),
    "csrf_failure",
    `Expected csrf_failure for duplicate state\n${duplicateStateLocation.toString()}`,
  );

  const ambiguousCallbackRes = await fetchWithTimeout(
    `${baseUrl}/auth/discord/callback?state=state-a&code=oauth-code&error=access_denied`,
    { redirect: "manual" },
  );
  assert.equal(
    ambiguousCallbackRes.status,
    302,
    `Expected redirect for callback with both code and error\nstatus=${ambiguousCallbackRes.status}\n${getOutput()}`,
  );
  const ambiguousLocation = new URL(ambiguousCallbackRes.headers.get("location") || "", baseUrl);
  assert.equal(
    ambiguousLocation.pathname,
    "/login",
    `Expected /login redirect for callback with both code and error\n${ambiguousLocation.toString()}`,
  );
  assert.equal(
    ambiguousLocation.searchParams.get("reasonCode"),
    "invalid_request",
    `Expected invalid_request reason code for callback with both code and error\n${ambiguousLocation.toString()}`,
  );
  assert.equal(
    ambiguousLocation.searchParams.get("error"),
    "csrf_failure",
    `Expected csrf_failure for callback with both code and error\n${ambiguousLocation.toString()}`,
  );
});

test("server e2e: discord oauth request includes state and required scopes", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-discord-authz-jwks-"));

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
        NODE_ENV: "development",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        DEV_LOGIN_MODE: "false",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "false",
        DISCORD_CLIENT_ID: "discord-e2e-client-id",
        DISCORD_CLIENT_SECRET: "discord-e2e-client-secret",
        DISCORD_CALLBACK_URL: `${baseUrl}/auth/discord/callback`,
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const oauthRes = await fetchWithTimeout(`${baseUrl}/auth/discord`, { redirect: "manual" });
  assert.equal(oauthRes.status, 302, `Expected Discord auth redirect\n${getOutput()}`);

  const locationHeader = oauthRes.headers.get("location") || "";
  const authorizeUrl = new URL(locationHeader);
  assert.ok(
    authorizeUrl.origin === "https://discord.com" || authorizeUrl.origin === "https://discordapp.com",
    `Expected redirect to Discord OAuth endpoint\n${locationHeader}`,
  );
  assert.match(authorizeUrl.pathname, /oauth2\/authorize/i, `Expected OAuth authorize endpoint\n${locationHeader}`);
  assert.equal(authorizeUrl.searchParams.get("response_type"), "code", `Expected auth code flow\n${locationHeader}`);
  assert.equal(
    authorizeUrl.searchParams.get("client_id"),
    "discord-e2e-client-id",
    `Expected configured client_id\n${locationHeader}`,
  );

  const state = authorizeUrl.searchParams.get("state");
  assert.ok(
    typeof state === "string" && state.split(".").length === 3,
    `Expected signed JWT OAuth state\n${locationHeader}`,
  );

  const scope = authorizeUrl.searchParams.get("scope") || "";
  const scopeSet = new Set(scope.split(/\s+/).filter(Boolean));
  assert.ok(scopeSet.has("identify"), `Expected identify scope\n${locationHeader}`);
  assert.ok(scopeSet.has("guilds"), `Expected guilds scope\n${locationHeader}`);
  assert.ok(scopeSet.has("guilds.members.read"), `Expected guilds.members.read scope\n${locationHeader}`);
});

test("server e2e: discord callback requires session-bound state and rejects replay", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-discord-state-session-jwks-"));

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
        NODE_ENV: "development",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        DEV_LOGIN_MODE: "false",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "false",
        DISCORD_CLIENT_ID: "discord-e2e-client-id",
        DISCORD_CLIENT_SECRET: "discord-e2e-client-secret",
        DISCORD_CALLBACK_URL: `${baseUrl}/auth/discord/callback`,
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  let sessionCookie = null;
  const oauthRes = await fetchWithTimeout(`${baseUrl}/auth/discord`, { redirect: "manual" });
  sessionCookie = updateSessionCookie(sessionCookie, oauthRes);
  assert.equal(oauthRes.status, 302, `Expected Discord auth redirect\n${getOutput()}`);

  const authorizeUrl = new URL(oauthRes.headers.get("location") || "");
  const callbackState = authorizeUrl.searchParams.get("state");
  assert.ok(callbackState, `Expected state in Discord authorize redirect\n${authorizeUrl.toString()}`);

  const callbackUrl = new URL(`${baseUrl}/auth/discord/callback`);
  callbackUrl.searchParams.set("error", "access_denied");
  callbackUrl.searchParams.set("state", callbackState);

  const firstCallbackRes = await fetchWithTimeout(callbackUrl.toString(), {
    redirect: "manual",
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
  });
  sessionCookie = updateSessionCookie(sessionCookie, firstCallbackRes);
  assert.equal(firstCallbackRes.status, 302, `Expected redirect on Discord error callback`);
  const firstCallbackLocation = new URL(firstCallbackRes.headers.get("location") || "", baseUrl);
  assert.equal(
    firstCallbackLocation.searchParams.get("reasonCode"),
    "discord_denied",
    `Expected discord_denied for provider callback error\n${firstCallbackLocation.toString()}`,
  );
  assert.equal(
    firstCallbackLocation.searchParams.get("error"),
    "discord",
    `Expected discord error namespace\n${firstCallbackLocation.toString()}`,
  );

  const replayRes = await fetchWithTimeout(callbackUrl.toString(), { redirect: "manual" });
  assert.equal(replayRes.status, 302, `Expected redirect for replayed callback`);
  const replayLocation = new URL(replayRes.headers.get("location") || "", baseUrl);
  assert.equal(
    replayLocation.searchParams.get("reasonCode"),
    "invalid_state",
    `Expected invalid_state on replayed callback\n${replayLocation.toString()}`,
  );
  assert.equal(
    replayLocation.searchParams.get("error"),
    "csrf_failure",
    `Expected csrf_failure on replayed callback\n${replayLocation.toString()}`,
  );
});

test("server e2e: federation IdP and IdC providers are discoverable", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-federation-jwks-"));
  const idpEntityId = "https://partner-idp.example.org";
  const idcEntityId = "https://issuer-idc.example.org";

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
        ENABLE_FEDERATION_LOGIN: "true",
        FEDERATION_OPS: JSON.stringify([
          {
            name: "Partner IdP",
            entityId: idpEntityId,
          },
        ]),
        FEDERATION_IDCS: JSON.stringify([
          {
            name: "Partner IdC",
            entityId: idcEntityId,
            opEntityId: idpEntityId,
            credentialType: "UniversityDegreeCredential",
          },
        ]),
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const availableRes = await fetchWithTimeout(`${baseUrl}/auth/available`);
  const availableBody = await availableRes.text();
  assert.equal(
    availableRes.status,
    200,
    `Expected /auth/available 200\nstatus=${availableRes.status}\nbody=${availableBody}\n${getOutput()}`,
  );

  let payload = null;
  try {
    payload = JSON.parse(availableBody);
  } catch (error) {
    assert.fail(`Expected JSON payload from /auth/available\n${String(error)}\nbody=${availableBody}`);
  }

  const providers = Array.isArray(payload?.providers) ? payload.providers : [];
  const idpProvider = providers.find(
    (provider) =>
      provider &&
      provider.type === "federation-idp" &&
      provider.entityId === idpEntityId,
  );
  assert.ok(idpProvider, `Expected federation-idp provider for ${idpEntityId}\n${availableBody}`);

  const idcProvider = providers.find(
    (provider) =>
      provider &&
      provider.type === "federation-idc" &&
      provider.entityId === idcEntityId,
  );
  assert.ok(idcProvider, `Expected federation-idc provider for ${idcEntityId}\n${availableBody}`);

  const idcUrl = new URL(String(idcProvider.url || ""), baseUrl);
  assert.equal(idcUrl.pathname, "/auth/federation/login", `Unexpected IdC login path\n${idcUrl.toString()}`);
  assert.equal(
    idcUrl.searchParams.get("op"),
    idpEntityId,
    `Expected IdC provider to point at its OP entity\n${idcUrl.toString()}`,
  );
  assert.equal(
    idcUrl.searchParams.get("idc"),
    idcEntityId,
    `Expected IdC provider URL to include idc entity\n${idcUrl.toString()}`,
  );
  assert.equal(
    idcUrl.searchParams.get("credential_type"),
    "UniversityDegreeCredential",
    `Expected IdC provider URL to include credential_type\n${idcUrl.toString()}`,
  );
  assert.equal(
    idcUrl.searchParams.get("login_hint"),
    "discord",
    `Expected IdC provider URL to include login_hint=discord\n${idcUrl.toString()}`,
  );
});

test("server e2e: federation login works for mock IdP and IdC", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const frontendUrl = "http://127.0.0.1:4300";
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-federation-login-jwks-"));
  const mockProvider = await startMockFederationProvider();
  const mockIdcEntityId = `${mockProvider.baseUrl}/idc/factdatabase`;
  const idcAdminUserId = "repo-e2e-idc-admin-flow";

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });
  t.after(async () => {
    await mockProvider.close();
  });

  const serverConfigPath = createIsolatedServerConfig(t, "fact-e2e-config-");
  const config = JSON.parse(fs.readFileSync(serverConfigPath, "utf8"));
  config.adminUsers = Array.isArray(config.adminUsers) ? config.adminUsers : [];
  if (!config.adminUsers.includes(idcAdminUserId)) {
    config.adminUsers.push(idcAdminUserId);
    writeFileAtomic(serverConfigPath, JSON.stringify(config, null, 2));
  }

  const { child, getOutput } = startProcess(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "development",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        FRONTEND_URL: frontendUrl,
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        DISCORD_AUTH_CONFIG_PATH: serverConfigPath,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "true",
        OIDC_CLIENT_ID: "fact-index-frontend",
        OIDC_CLIENT_SECRET: mockProvider.oidcClientSecret,
        OIDC_REDIRECT_URI: `${baseUrl}/auth/federation/callback`,
        FEDERATION_AUTHORIZATION_DETAILS: "",
        FEDERATION_OPS: JSON.stringify([
          {
            name: "Mock Saver IdP",
            entityId: mockProvider.baseUrl,
          },
        ]),
        FEDERATION_IDCS: JSON.stringify([
          {
            name: "FactDatabase IdC",
            entityId: mockIdcEntityId,
            opEntityId: mockProvider.baseUrl,
            credentialType: "FactCredential",
          },
        ]),
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const idcAccessToken = await mintToken({
    userId: idcAdminUserId,
    username: idcAdminUserId,
    isAdmin: true,
    keysDir,
  });

  const availableRes = await fetchWithTimeout(`${baseUrl}/auth/available`);
  const availableText = await availableRes.text();
  assert.equal(availableRes.status, 200, `Expected /auth/available 200\n${availableText}\n${getOutput()}`);

  let availableJson = null;
  try {
    availableJson = JSON.parse(availableText);
  } catch (error) {
    assert.fail(`Expected JSON from /auth/available\n${String(error)}\n${availableText}`);
  }

  const providers = Array.isArray(availableJson?.providers) ? availableJson.providers : [];
  const idpProvider = providers.find(
    (provider) =>
      provider &&
      provider.type === "federation-idp" &&
      provider.entityId === mockProvider.baseUrl,
  );
  const idcProvider = providers.find(
    (provider) =>
      provider &&
      provider.type === "federation-idc" &&
      provider.entityId === mockIdcEntityId,
  );

  assert.ok(idpProvider, `Expected mock IdP provider in /auth/available\n${availableText}`);
  assert.ok(idcProvider, `Expected FactDatabase IdC provider in /auth/available\n${availableText}`);

  async function runFederationFlow(providerUrl, flowName, initialHeaders = {}) {
    let sessionCookie = null;

    const loginRes = await fetchWithTimeout(`${baseUrl}${providerUrl}`, {
      redirect: "manual",
      headers: initialHeaders,
    });
    sessionCookie = updateSessionCookie(sessionCookie, loginRes);
    assert.equal(
      loginRes.status,
      302,
      `Expected federation login redirect for ${flowName}\nstatus=${loginRes.status}\n${getOutput()}`,
    );

    const authorizeLocation = loginRes.headers.get("location") || "";
    assert.ok(
      authorizeLocation.startsWith(`${mockProvider.baseUrl}/authorize`),
      `Expected redirect to mock authorize endpoint for ${flowName}\nlocation=${authorizeLocation}`,
    );

    const authorizeRes = await fetchWithTimeout(authorizeLocation, { redirect: "manual" });
    assert.equal(
      authorizeRes.status,
      302,
      `Expected authorize endpoint redirect for ${flowName}\nstatus=${authorizeRes.status}`,
    );

    const callbackLocation = authorizeRes.headers.get("location") || "";
    assert.ok(
      callbackLocation.startsWith(`${baseUrl}/auth/federation/callback`),
      `Expected callback redirect for ${flowName}\nlocation=${callbackLocation}`,
    );

    const callbackRes = await fetchWithTimeout(callbackLocation, {
      redirect: "manual",
      headers: sessionCookie ? { Cookie: sessionCookie } : {},
    });
    sessionCookie = updateSessionCookie(sessionCookie, callbackRes);
    assert.equal(
      callbackRes.status,
      302,
      `Expected callback success redirect for ${flowName}\nstatus=${callbackRes.status}`,
    );

    const frontendRedirect = callbackRes.headers.get("location") || "";
    assert.equal(
      frontendRedirect,
      frontendUrl,
      `Expected callback to redirect to frontend for ${flowName}\nlocation=${frontendRedirect}`,
    );

    const meRes = await fetchWithTimeout(`${baseUrl}/api/me`, {
      headers: sessionCookie ? { Cookie: sessionCookie } : {},
    });
    const meBody = await meRes.text();
    assert.equal(meRes.status, 200, `Expected /api/me 200 for ${flowName}\n${meBody}`);

    let meJson = null;
    try {
      meJson = JSON.parse(meBody);
    } catch (error) {
      assert.fail(`Expected /api/me JSON for ${flowName}\n${String(error)}\n${meBody}`);
    }

    assert.ok(meJson?.user, `Expected session user for ${flowName}\n${meBody}`);
    assert.equal(
      meJson?.user?.federationContext?.issuerEntityId,
      mockProvider.baseUrl,
      `Expected issuerEntityId to match mock IdP for ${flowName}\n${meBody}`,
    );
  }

  const requestCountBeforeIdp = mockProvider.getAuthorizeRequests().length;
  await runFederationFlow(idpProvider.url, "IdP");
  const idpAuthorizeRequest = mockProvider.getAuthorizeRequests()[requestCountBeforeIdp];
  assert.ok(idpAuthorizeRequest, "Expected authorize request for IdP flow");
  assert.equal(
    typeof idpAuthorizeRequest.query.authorization_details,
    "undefined",
    `Did not expect authorization_details for plain IdP flow\n${JSON.stringify(idpAuthorizeRequest, null, 2)}`,
  );

  const requestCountBeforeIdc = mockProvider.getAuthorizeRequests().length;
  await runFederationFlow(idcProvider.url, "IdC", {
    Authorization: `Bearer ${idcAccessToken}`,
  });
  const idcAuthorizeRequest = mockProvider.getAuthorizeRequests()[requestCountBeforeIdc];
  assert.ok(idcAuthorizeRequest, "Expected authorize request for IdC flow");
  assert.ok(
    typeof idcAuthorizeRequest.query.authorization_details === "string",
    `Expected authorization_details for IdC flow\n${JSON.stringify(idcAuthorizeRequest, null, 2)}`,
  );
  assert.equal(
    idcAuthorizeRequest.query.login_hint,
    "discord",
    `Expected IdC flow to forward login_hint=discord\n${JSON.stringify(idcAuthorizeRequest, null, 2)}`,
  );

  let idcAuthorizationDetails = [];
  try {
    idcAuthorizationDetails = JSON.parse(idcAuthorizeRequest.query.authorization_details);
  } catch (error) {
    assert.fail(
      `Expected IdC authorization_details JSON\n${String(error)}\n${idcAuthorizeRequest.query.authorization_details}`,
    );
  }

  const openidCredentialEntry = idcAuthorizationDetails.find(
    (entry) => entry && entry.type === "openid_credential",
  );
  assert.ok(
    openidCredentialEntry,
    `Expected openid_credential entry in IdC authorization_details\n${JSON.stringify(idcAuthorizationDetails, null, 2)}`,
  );
  assert.deepEqual(
    openidCredentialEntry.locations,
    [mockIdcEntityId],
    `Expected IdC location in authorization_details\n${JSON.stringify(openidCredentialEntry, null, 2)}`,
  );
  assert.equal(
    openidCredentialEntry.credential_type,
    "FactCredential",
    `Expected IdC credential_type in authorization_details\n${JSON.stringify(openidCredentialEntry, null, 2)}`,
  );
});

test("server e2e: idc login requires discord auth with idc permission and supports admin grant", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-idc-perm-gate-jwks-"));
  const mockProvider = await startMockFederationProvider();
  const mockIdcEntityId = `${mockProvider.baseUrl}/idc/factdatabase`;
  const adminUserId = "repo-e2e-idc-admin";

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });
  t.after(async () => {
    await mockProvider.close();
  });

  const serverConfigPath = createIsolatedServerConfig(t, "fact-e2e-config-");
  const config = JSON.parse(fs.readFileSync(serverConfigPath, "utf8"));
  config.adminUsers = Array.isArray(config.adminUsers) ? config.adminUsers : [];
  if (!config.adminUsers.includes(adminUserId)) {
    config.adminUsers.push(adminUserId);
    writeFileAtomic(serverConfigPath, JSON.stringify(config, null, 2));
  }

  const { child, getOutput } = startProcess(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "development",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        FRONTEND_URL: "http://127.0.0.1:4300",
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        DISCORD_AUTH_CONFIG_PATH: serverConfigPath,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "true",
        OIDC_CLIENT_ID: "fact-index-frontend",
        OIDC_CLIENT_SECRET: mockProvider.oidcClientSecret,
        OIDC_REDIRECT_URI: `${baseUrl}/auth/federation/callback`,
        FEDERATION_OPS: JSON.stringify([
          {
            name: "Mock Saver IdP",
            entityId: mockProvider.baseUrl,
          },
        ]),
        FEDERATION_IDCS: JSON.stringify([
          {
            name: "FactDatabase IdC",
            entityId: mockIdcEntityId,
            opEntityId: mockProvider.baseUrl,
            credentialType: "FactCredential",
          },
        ]),
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const availableRes = await fetchWithTimeout(`${baseUrl}/auth/available`);
  const availableBody = await availableRes.text();
  assert.equal(availableRes.status, 200, `Expected /auth/available 200\n${availableBody}\n${getOutput()}`);

  let availableJson = null;
  try {
    availableJson = JSON.parse(availableBody);
  } catch (error) {
    assert.fail(`Expected JSON from /auth/available\n${String(error)}\n${availableBody}`);
  }

  const providers = Array.isArray(availableJson?.providers) ? availableJson.providers : [];
  const idcProvider = providers.find(
    (provider) =>
      provider &&
      provider.type === "federation-idc" &&
      provider.entityId === mockIdcEntityId,
  );
  assert.ok(idcProvider, `Expected IdC provider in /auth/available\n${availableBody}`);

  const idcLoginPath = String(idcProvider.url || "");
  assert.ok(idcLoginPath, `Expected IdC login URL\n${availableBody}`);
  const idcLoginUrl = new URL(idcLoginPath, baseUrl);

  const unauthRes = await fetchWithTimeout(`${baseUrl}${idcLoginPath}`, { redirect: "manual" });
  const unauthBody = await unauthRes.text();
  assert.equal(
    unauthRes.status,
    401,
    `Expected unauthenticated IdC login request to be rejected\nstatus=${unauthRes.status}\nbody=${unauthBody}\n${getOutput()}`,
  );

  const runSuffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const delegatedUserId = `repo-e2e-idc-delegated-${runSuffix}`;
  const delegatedRoleId = `role:idc:login:e2e:${runSuffix}`;
  const forgedAdminUserId = `repo-e2e-idc-forged-admin-${runSuffix}`;
  const mappedGuildId = `guild-idc-login-${runSuffix}`;
  const mappedRoleId = `role:idc:mapping:${runSuffix}`;

  const delegatedUserToken = await mintToken({
    userId: delegatedUserId,
    username: delegatedUserId,
    isAdmin: false,
    keysDir,
  });
  const delegatedUserTokenWithoutJti = await mintTokenWithoutJti({
    userId: `${delegatedUserId}-legacy`,
    username: `${delegatedUserId}-legacy`,
    isAdmin: false,
    keysDir,
  });
  const forgedAdminToken = await mintToken({
    userId: forgedAdminUserId,
    username: forgedAdminUserId,
    isAdmin: true,
    keysDir,
  });
  const adminToken = await mintToken({
    userId: adminUserId,
    username: adminUserId,
    isAdmin: true,
    keysDir,
  });
  const mappedGuildUserToken = await mintToken({
    userId: `repo-e2e-idc-mapped-${runSuffix}`,
    username: `repo-e2e-idc-mapped-${runSuffix}`,
    isAdmin: false,
    keysDir,
    guild: mappedGuildId,
    cachedGuildIds: [mappedGuildId],
    cachedMemberRoles: [mappedRoleId],
  });
  const mismatchedMappedGuildUserToken = await mintToken({
    userId: `repo-e2e-idc-mapped-mismatch-${runSuffix}`,
    username: `repo-e2e-idc-mapped-mismatch-${runSuffix}`,
    isAdmin: false,
    keysDir,
    guild: `${mappedGuildId}-mismatch`,
    cachedGuildIds: [`${mappedGuildId}-mismatch`],
    cachedMemberRoles: [mappedRoleId],
  });

  const bypassIdcGuardUrl = new URL(`${baseUrl}/auth/federation/login`);
  bypassIdcGuardUrl.searchParams.set("op", mockProvider.baseUrl);
  bypassIdcGuardUrl.searchParams.set(
    "authorization_details",
    JSON.stringify([
      {
        type: "openid_credential",
        locations: [mockIdcEntityId],
        credential_type: "FactCredential",
      },
    ]),
  );
  const bypassIdcGuardRes = await fetchWithTimeout(bypassIdcGuardUrl.toString(), {
    redirect: "manual",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const bypassIdcGuardBody = await bypassIdcGuardRes.text();
  assert.equal(
    bypassIdcGuardRes.status,
    400,
    `Expected openid_credential authorization_details without idc parameter to be rejected\nstatus=${bypassIdcGuardRes.status}\nbody=${bypassIdcGuardBody}\n${getOutput()}`,
  );
  let bypassIdcGuardJson = null;
  try {
    bypassIdcGuardJson = JSON.parse(bypassIdcGuardBody);
  } catch {
    // ignore parse errors - status assertion above is the hard requirement
  }
  assert.equal(
    bypassIdcGuardJson?.error,
    "invalid_authorization_details",
    `Expected invalid_authorization_details when idc parameter is missing\n${bypassIdcGuardBody}`,
  );

  const noJtiIdcRes = await fetchWithTimeout(`${baseUrl}${idcLoginPath}`, {
    redirect: "manual",
    headers: { Authorization: `Bearer ${delegatedUserTokenWithoutJti}` },
  });
  const noJtiIdcBody = await noJtiIdcRes.text();
  assert.equal(
    noJtiIdcRes.status,
    401,
    `Expected IdC login to fail closed when revocation check is unavailable (no jti)\nstatus=${noJtiIdcRes.status}\nbody=${noJtiIdcBody}\n${getOutput()}`,
  );
  let noJtiIdcJson = null;
  try {
    noJtiIdcJson = JSON.parse(noJtiIdcBody);
  } catch {
    // ignore parse errors - status assertion above is the hard requirement
  }
  assert.match(
    String(noJtiIdcJson?.error_description || noJtiIdcBody),
    /Revocation check unavailable/i,
    `Expected missing-jti IdC denial reason\n${noJtiIdcBody}`,
  );

  const unknownIdcUrl = new URL(idcLoginUrl.toString());
  unknownIdcUrl.searchParams.set("idc", "https://rogue-idc.example.org");
  const unknownIdcRes = await fetchWithTimeout(unknownIdcUrl.toString(), {
    redirect: "manual",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const unknownIdcBody = await unknownIdcRes.text();
  assert.equal(
    unknownIdcRes.status,
    400,
    `Expected unknown IdC entity to be rejected\nstatus=${unknownIdcRes.status}\nbody=${unknownIdcBody}\n${getOutput()}`,
  );
  let unknownIdcJson = null;
  try {
    unknownIdcJson = JSON.parse(unknownIdcBody);
  } catch {
    // ignore parse errors - status assertion above is the hard requirement
  }
  assert.equal(
    unknownIdcJson?.error,
    "unknown_idc",
    `Expected unknown_idc error for rogue IdC\n${unknownIdcBody}`,
  );

  const mismatchedOpUrl = new URL(idcLoginUrl.toString());
  mismatchedOpUrl.searchParams.set("op", "https://wrong-op.example.org");
  const mismatchedOpRes = await fetchWithTimeout(mismatchedOpUrl.toString(), {
    redirect: "manual",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const mismatchedOpBody = await mismatchedOpRes.text();
  assert.equal(
    mismatchedOpRes.status,
    400,
    `Expected mismatched IdC OP to be rejected\nstatus=${mismatchedOpRes.status}\nbody=${mismatchedOpBody}\n${getOutput()}`,
  );
  let mismatchedOpJson = null;
  try {
    mismatchedOpJson = JSON.parse(mismatchedOpBody);
  } catch {
    // ignore parse errors - status assertion above is the hard requirement
  }
  assert.equal(
    mismatchedOpJson?.error,
    "invalid_idc_op",
    `Expected invalid_idc_op error for mismatched op\n${mismatchedOpBody}`,
  );

  const mismatchedLocationDetailsUrl = new URL(idcLoginUrl.toString());
  mismatchedLocationDetailsUrl.searchParams.set(
    "authorization_details",
    JSON.stringify([
      {
        type: "openid_credential",
        locations: ["https://rogue-idc.example.org"],
        credential_type: "FactCredential",
      },
    ]),
  );
  const mismatchedLocationDetailsRes = await fetchWithTimeout(mismatchedLocationDetailsUrl.toString(), {
    redirect: "manual",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const mismatchedLocationDetailsBody = await mismatchedLocationDetailsRes.text();
  assert.equal(
    mismatchedLocationDetailsRes.status,
    400,
    `Expected mismatched authorization_details location to be rejected\nstatus=${mismatchedLocationDetailsRes.status}\nbody=${mismatchedLocationDetailsBody}\n${getOutput()}`,
  );
  let mismatchedLocationDetailsJson = null;
  try {
    mismatchedLocationDetailsJson = JSON.parse(mismatchedLocationDetailsBody);
  } catch {
    // ignore parse errors - status assertion above is the hard requirement
  }
  assert.equal(
    mismatchedLocationDetailsJson?.error,
    "invalid_authorization_details",
    `Expected invalid_authorization_details for mismatched IdC location\n${mismatchedLocationDetailsBody}`,
  );

  const invalidCredentialTypeUrl = new URL(idcLoginUrl.toString());
  invalidCredentialTypeUrl.searchParams.set("credential_type", "TamperedCredentialType");
  const invalidCredentialTypeRes = await fetchWithTimeout(invalidCredentialTypeUrl.toString(), {
    redirect: "manual",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const invalidCredentialTypeBody = await invalidCredentialTypeRes.text();
  assert.equal(
    invalidCredentialTypeRes.status,
    400,
    `Expected mismatched credential_type to be rejected\nstatus=${invalidCredentialTypeRes.status}\nbody=${invalidCredentialTypeBody}\n${getOutput()}`,
  );
  let invalidCredentialTypeJson = null;
  try {
    invalidCredentialTypeJson = JSON.parse(invalidCredentialTypeBody);
  } catch {
    // ignore parse errors - status assertion above is the hard requirement
  }
  assert.equal(
    invalidCredentialTypeJson?.error,
    "invalid_credential_type",
    `Expected invalid_credential_type for tampered credential_type\n${invalidCredentialTypeBody}`,
  );

  const forgedAdminRes = await fetchWithTimeout(`${baseUrl}${idcLoginPath}`, {
    redirect: "manual",
    headers: { Authorization: `Bearer ${forgedAdminToken}` },
  });
  const forgedAdminBody = await forgedAdminRes.text();
  assert.equal(
    forgedAdminRes.status,
    403,
    `Expected forged isAdmin JWT claim without configured admin grant to be denied for IdC login\nstatus=${forgedAdminRes.status}\nbody=${forgedAdminBody}\n${getOutput()}`,
  );

  const forbiddenRes = await fetchWithTimeout(`${baseUrl}${idcLoginPath}`, {
    redirect: "manual",
    headers: { Authorization: `Bearer ${delegatedUserToken}` },
  });
  const forbiddenBody = await forbiddenRes.text();
  assert.equal(
    forbiddenRes.status,
    403,
    `Expected non-permitted Discord user to be forbidden for IdC login\nstatus=${forbiddenRes.status}\nbody=${forbiddenBody}\n${getOutput()}`,
  );

  const createGuildScopedMappingRes = await fetchWithTimeout(`${baseUrl}/auth/admin/discord-mappings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      discordGuildId: mappedGuildId,
      discordRoleId: mappedRoleId,
      targetType: "action",
      targetValue: "idc:login",
    }),
  });
  const createGuildScopedMappingBody = await createGuildScopedMappingRes.text();
  assert.equal(
    createGuildScopedMappingRes.status,
    200,
    `Expected admin to create guild-scoped idc:login mapping\nstatus=${createGuildScopedMappingRes.status}\nbody=${createGuildScopedMappingBody}\n${getOutput()}`,
  );

  const mismatchedMappedGuildRes = await fetchWithTimeout(`${baseUrl}${idcLoginPath}`, {
    redirect: "manual",
    headers: { Authorization: `Bearer ${mismatchedMappedGuildUserToken}` },
  });
  const mismatchedMappedGuildBody = await mismatchedMappedGuildRes.text();
  assert.equal(
    mismatchedMappedGuildRes.status,
    403,
    `Expected guild-mismatched mapped user to be forbidden for IdC login\nstatus=${mismatchedMappedGuildRes.status}\nbody=${mismatchedMappedGuildBody}\n${getOutput()}`,
  );

  const mappedGuildAllowedRes = await fetchWithTimeout(`${baseUrl}${idcLoginPath}`, {
    redirect: "manual",
    headers: { Authorization: `Bearer ${mappedGuildUserToken}` },
  });
  assert.equal(
    mappedGuildAllowedRes.status,
    302,
    `Expected guild-matched mapped user to initiate IdC login\nstatus=${mappedGuildAllowedRes.status}\n${getOutput()}`,
  );
  const mappedGuildAllowedLocation = mappedGuildAllowedRes.headers.get("location") || "";
  assert.ok(
    mappedGuildAllowedLocation.startsWith(`${mockProvider.baseUrl}/authorize`),
    `Expected mapped guild user redirect to mock authorize endpoint\nlocation=${mappedGuildAllowedLocation}`,
  );

  const createRoleRes = await fetchWithTimeout(`${baseUrl}/auth/admin/roles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      roleId: delegatedRoleId,
      name: "IdC Login Delegate",
      type: "custom",
      description: "Can initiate IdC login",
      permissions: ["idc:login"],
    }),
  });
  const createRoleBody = await createRoleRes.text();
  assert.equal(
    createRoleRes.status,
    200,
    `Expected admin to create idc login role\nstatus=${createRoleRes.status}\nbody=${createRoleBody}\n${getOutput()}`,
  );

  const assignRoleRes = await fetchWithTimeout(`${baseUrl}/auth/admin/user-roles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: delegatedUserId,
      roles: [delegatedRoleId],
    }),
  });
  const assignRoleBody = await assignRoleRes.text();
  assert.equal(
    assignRoleRes.status,
    200,
    `Expected admin to assign idc login role\nstatus=${assignRoleRes.status}\nbody=${assignRoleBody}\n${getOutput()}`,
  );

  const tamperedLoginHintUrl = new URL(idcLoginUrl.toString());
  tamperedLoginHintUrl.searchParams.set("login_hint", "attacker-hint");
  const permittedRes = await fetchWithTimeout(tamperedLoginHintUrl.toString(), {
    redirect: "manual",
    headers: { Authorization: `Bearer ${delegatedUserToken}` },
  });
  assert.equal(
    permittedRes.status,
    302,
    `Expected delegated Discord user to initiate IdC login\nstatus=${permittedRes.status}\n${getOutput()}`,
  );
  const permittedLocation = permittedRes.headers.get("location") || "";
  assert.ok(
    permittedLocation.startsWith(`${mockProvider.baseUrl}/authorize`),
    `Expected redirect to mock authorize endpoint after permission grant\nlocation=${permittedLocation}`,
  );
  const permittedAuthorizeUrl = new URL(permittedLocation);
  assert.equal(
    permittedAuthorizeUrl.searchParams.get("login_hint"),
    "discord",
    `Expected IdC login_hint override attempt to be ignored\n${permittedLocation}`,
  );

  const logoutRes = await fetchWithTimeout(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${delegatedUserToken}` },
  });
  assert.equal(
    logoutRes.status,
    204,
    `Expected logout to return 204 for delegated user\nstatus=${logoutRes.status}\n${getOutput()}`,
  );

  const revokedTokenRes = await fetchWithTimeout(`${baseUrl}${idcLoginPath}`, {
    redirect: "manual",
    headers: { Authorization: `Bearer ${delegatedUserToken}` },
  });
  const revokedTokenBody = await revokedTokenRes.text();
  assert.equal(
    revokedTokenRes.status,
    401,
    `Expected revoked token to be rejected for IdC login\nstatus=${revokedTokenRes.status}\nbody=${revokedTokenBody}\n${getOutput()}`,
  );
});

test("server e2e: federation callback rejects state mismatch", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-federation-state-jwks-"));
  const mockProvider = await startMockFederationProvider();

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });
  t.after(async () => {
    await mockProvider.close();
  });

  const { child, getOutput } = startProcess(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "development",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        FRONTEND_URL: "http://127.0.0.1:4300",
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "true",
        OIDC_CLIENT_ID: "fact-index-frontend",
        OIDC_CLIENT_SECRET: mockProvider.oidcClientSecret,
        OIDC_REDIRECT_URI: `${baseUrl}/auth/federation/callback`,
        FEDERATION_OPS: JSON.stringify([
          {
            name: "Mock Saver IdP",
            entityId: mockProvider.baseUrl,
          },
        ]),
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  let sessionCookie = null;
  const loginRes = await fetchWithTimeout(
    `${baseUrl}/auth/federation/login?op=${encodeURIComponent(mockProvider.baseUrl)}`,
    { redirect: "manual" },
  );
  sessionCookie = updateSessionCookie(sessionCookie, loginRes);
  assert.equal(loginRes.status, 302, `Expected login redirect\n${getOutput()}`);

  const authorizeLocation = loginRes.headers.get("location") || "";
  const authorizeRes = await fetchWithTimeout(authorizeLocation, { redirect: "manual" });
  assert.equal(authorizeRes.status, 302, `Expected authorize redirect`);

  const callbackLocation = authorizeRes.headers.get("location") || "";
  const tamperedCallback = new URL(callbackLocation);
  tamperedCallback.searchParams.set("state", "tampered-state");
  const callbackRes = await fetchWithTimeout(tamperedCallback.toString(), {
    redirect: "manual",
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
  });
  const callbackBody = await callbackRes.text();
  assert.equal(
    callbackRes.status,
    400,
    `Expected callback rejection for state mismatch\nstatus=${callbackRes.status}\nbody=${callbackBody}\n${getOutput()}`,
  );

  let callbackJson = null;
  try {
    callbackJson = JSON.parse(callbackBody);
  } catch (error) {
    assert.fail(`Expected callback JSON\n${String(error)}\n${callbackBody}`);
  }
  assert.equal(callbackJson?.error, "invalid_state", `Expected invalid_state error\n${callbackBody}`);

  const replayAfterFailureRes = await fetchWithTimeout(callbackLocation, {
    redirect: "manual",
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
  });
  const replayAfterFailureBody = await replayAfterFailureRes.text();
  assert.equal(
    replayAfterFailureRes.status,
    400,
    `Expected callback replay to fail after invalid_state clears session\nstatus=${replayAfterFailureRes.status}\nbody=${replayAfterFailureBody}\n${getOutput()}`,
  );
  let replayAfterFailureJson = null;
  try {
    replayAfterFailureJson = JSON.parse(replayAfterFailureBody);
  } catch (error) {
    assert.fail(`Expected replay-after-failure JSON\n${String(error)}\n${replayAfterFailureBody}`);
  }
  assert.equal(
    replayAfterFailureJson?.error,
    "invalid_session",
    `Expected invalid_session after failed callback attempt\n${replayAfterFailureBody}`,
  );
});

test("server e2e: federation callback rejects responses containing both code and error", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-federation-code-error-jwks-"));
  const mockProvider = await startMockFederationProvider();

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });
  t.after(async () => {
    await mockProvider.close();
  });

  const { child, getOutput } = startProcess(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "development",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        FRONTEND_URL: "http://127.0.0.1:4300",
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "true",
        OIDC_CLIENT_ID: "fact-index-frontend",
        OIDC_CLIENT_SECRET: mockProvider.oidcClientSecret,
        OIDC_REDIRECT_URI: `${baseUrl}/auth/federation/callback`,
        FEDERATION_OPS: JSON.stringify([
          {
            name: "Mock Saver IdP",
            entityId: mockProvider.baseUrl,
          },
        ]),
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  let sessionCookie = null;
  const loginRes = await fetchWithTimeout(
    `${baseUrl}/auth/federation/login?op=${encodeURIComponent(mockProvider.baseUrl)}`,
    { redirect: "manual" },
  );
  sessionCookie = updateSessionCookie(sessionCookie, loginRes);
  assert.equal(loginRes.status, 302, `Expected login redirect\n${getOutput()}`);

  const authorizeLocation = loginRes.headers.get("location") || "";
  assert.ok(authorizeLocation, `Expected authorize redirect location\n${getOutput()}`);
  const authorizeUrl = new URL(authorizeLocation);
  const state = authorizeUrl.searchParams.get("state");
  assert.ok(state, `Expected state parameter in authorize URL\n${authorizeLocation}`);

  const ambiguousCallbackUrl = new URL(`${baseUrl}/auth/federation/callback`);
  ambiguousCallbackUrl.searchParams.set("code", "mock-code");
  ambiguousCallbackUrl.searchParams.set("error", "access_denied");
  ambiguousCallbackUrl.searchParams.set("state", state);

  const ambiguousCallbackRes = await fetchWithTimeout(ambiguousCallbackUrl.toString(), {
    redirect: "manual",
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
  });
  const ambiguousCallbackBody = await ambiguousCallbackRes.text();
  assert.equal(
    ambiguousCallbackRes.status,
    400,
    `Expected ambiguous callback to be rejected\nstatus=${ambiguousCallbackRes.status}\nbody=${ambiguousCallbackBody}\n${getOutput()}`,
  );

  let ambiguousCallbackJson = null;
  try {
    ambiguousCallbackJson = JSON.parse(ambiguousCallbackBody);
  } catch (error) {
    assert.fail(`Expected ambiguous callback response JSON\n${String(error)}\n${ambiguousCallbackBody}`);
  }
  assert.equal(
    ambiguousCallbackJson?.error,
    "invalid_request",
    `Expected invalid_request for code+error callback\n${ambiguousCallbackBody}`,
  );

  const replayAfterAmbiguousRes = await fetchWithTimeout(
    `${baseUrl}/auth/federation/callback?code=mock-code-2&state=${encodeURIComponent(state)}`,
    {
      redirect: "manual",
      headers: sessionCookie ? { Cookie: sessionCookie } : {},
    },
  );
  const replayAfterAmbiguousBody = await replayAfterAmbiguousRes.text();
  assert.equal(
    replayAfterAmbiguousRes.status,
    400,
    `Expected session to be cleared after ambiguous callback rejection\nstatus=${replayAfterAmbiguousRes.status}\nbody=${replayAfterAmbiguousBody}\n${getOutput()}`,
  );

  let replayAfterAmbiguousJson = null;
  try {
    replayAfterAmbiguousJson = JSON.parse(replayAfterAmbiguousBody);
  } catch (error) {
    assert.fail(`Expected replay-after-ambiguous JSON\n${String(error)}\n${replayAfterAmbiguousBody}`);
  }
  assert.equal(
    replayAfterAmbiguousJson?.error,
    "invalid_session",
    `Expected invalid_session after ambiguous callback clears session\n${replayAfterAmbiguousBody}`,
  );
});

test("server e2e: federation callback rejects duplicate state parameters", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-federation-dup-state-jwks-"));
  const mockProvider = await startMockFederationProvider();

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });
  t.after(async () => {
    await mockProvider.close();
  });

  const { child, getOutput } = startProcess(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "development",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        FRONTEND_URL: "http://127.0.0.1:4300",
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "true",
        OIDC_CLIENT_ID: "fact-index-frontend",
        OIDC_CLIENT_SECRET: mockProvider.oidcClientSecret,
        OIDC_REDIRECT_URI: `${baseUrl}/auth/federation/callback`,
        FEDERATION_OPS: JSON.stringify([
          {
            name: "Mock Saver IdP",
            entityId: mockProvider.baseUrl,
          },
        ]),
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  let sessionCookie = null;
  const loginRes = await fetchWithTimeout(
    `${baseUrl}/auth/federation/login?op=${encodeURIComponent(mockProvider.baseUrl)}`,
    { redirect: "manual" },
  );
  sessionCookie = updateSessionCookie(sessionCookie, loginRes);
  assert.equal(loginRes.status, 302, `Expected login redirect\n${getOutput()}`);

  const authorizeLocation = loginRes.headers.get("location") || "";
  const authorizeRes = await fetchWithTimeout(authorizeLocation, { redirect: "manual" });
  assert.equal(authorizeRes.status, 302, `Expected authorize redirect`);
  const callbackLocation = authorizeRes.headers.get("location") || "";
  assert.ok(
    callbackLocation.startsWith(`${baseUrl}/auth/federation/callback`),
    `Expected callback redirect to local server\n${callbackLocation}`,
  );

  const duplicateStateUrl = new URL(callbackLocation);
  duplicateStateUrl.searchParams.append("state", "attacker-state");
  const duplicateStateRes = await fetchWithTimeout(duplicateStateUrl.toString(), {
    redirect: "manual",
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
  });
  const duplicateStateBody = await duplicateStateRes.text();
  assert.equal(
    duplicateStateRes.status,
    400,
    `Expected duplicate state query to be rejected\nstatus=${duplicateStateRes.status}\nbody=${duplicateStateBody}\n${getOutput()}`,
  );

  let duplicateStateJson = null;
  try {
    duplicateStateJson = JSON.parse(duplicateStateBody);
  } catch (error) {
    assert.fail(`Expected duplicate state response JSON\n${String(error)}\n${duplicateStateBody}`);
  }
  assert.equal(
    duplicateStateJson?.error,
    "invalid_parameter",
    `Expected invalid_parameter for duplicate callback state\n${duplicateStateBody}`,
  );
  assert.match(
    String(duplicateStateJson?.error_description || ""),
    /state/i,
    `Expected error description to mention state\n${duplicateStateBody}`,
  );
});

test("server e2e: federation callback rejects issuer mismatch", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const frontendUrl = "http://127.0.0.1:4300";
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-federation-issuer-jwks-"));
  const mockProvider = await startMockFederationProvider({
    idTokenIssuerOverride: "http://127.0.0.1:65500",
  });

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });
  t.after(async () => {
    await mockProvider.close();
  });

  const { child, getOutput } = startProcess(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "development",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        FRONTEND_URL: frontendUrl,
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "true",
        OIDC_CLIENT_ID: "fact-index-frontend",
        OIDC_CLIENT_SECRET: mockProvider.oidcClientSecret,
        OIDC_REDIRECT_URI: `${baseUrl}/auth/federation/callback`,
        FEDERATION_OPS: JSON.stringify([
          {
            name: "Mock Saver IdP",
            entityId: mockProvider.baseUrl,
          },
        ]),
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  let sessionCookie = null;
  const loginRes = await fetchWithTimeout(
    `${baseUrl}/auth/federation/login?op=${encodeURIComponent(mockProvider.baseUrl)}`,
    { redirect: "manual" },
  );
  sessionCookie = updateSessionCookie(sessionCookie, loginRes);
  assert.equal(loginRes.status, 302, `Expected login redirect\n${getOutput()}`);

  const authorizeLocation = loginRes.headers.get("location") || "";
  const authorizeRes = await fetchWithTimeout(authorizeLocation, { redirect: "manual" });
  assert.equal(authorizeRes.status, 302, `Expected authorize redirect`);

  const callbackLocation = authorizeRes.headers.get("location") || "";
  const callbackRes = await fetchWithTimeout(callbackLocation, {
    redirect: "manual",
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
  });
  assert.equal(callbackRes.status, 302, `Expected frontend redirect on failure`);

  const failureRedirect = new URL(callbackRes.headers.get("location") || "", frontendUrl);
  assert.equal(failureRedirect.origin, new URL(frontendUrl).origin, `Expected redirect to frontend origin`);
  assert.equal(
    failureRedirect.searchParams.get("error"),
    "token_exchange_failed",
    `Expected token_exchange_failed error in redirect\n${failureRedirect.toString()}\n${getOutput()}`,
  );
});

test("server e2e: federation login rejects unknown OP when dynamic providers are disabled", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-federation-op-allowlist-jwks-"));
  const mockProvider = await startMockFederationProvider();

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });
  t.after(async () => {
    await mockProvider.close();
  });

  const { child, getOutput } = startProcess(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "development",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        FRONTEND_URL: "http://127.0.0.1:4300",
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "true",
        OIDC_CLIENT_ID: "fact-index-frontend",
        OIDC_CLIENT_SECRET: mockProvider.oidcClientSecret,
        OIDC_REDIRECT_URI: `${baseUrl}/auth/federation/callback`,
        ALLOW_DYNAMIC_FEDERATION_OPS: "false",
        FEDERATION_OPS: JSON.stringify([
          {
            name: "Mock Saver IdP",
            entityId: mockProvider.baseUrl,
          },
        ]),
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const unknownOpRes = await fetchWithTimeout(
    `${baseUrl}/auth/federation/login?op=${encodeURIComponent("https://unknown-op.example.org")}`,
    { redirect: "manual" },
  );
  const unknownOpBody = await unknownOpRes.text();
  assert.equal(
    unknownOpRes.status,
    400,
    `Expected unknown OP to be rejected\nstatus=${unknownOpRes.status}\nbody=${unknownOpBody}\n${getOutput()}`,
  );

  let errorJson = null;
  try {
    errorJson = JSON.parse(unknownOpBody);
  } catch (error) {
    assert.fail(`Expected unknown OP response JSON\n${String(error)}\n${unknownOpBody}`);
  }
  assert.equal(errorJson?.error, "unknown_provider", `Expected unknown_provider error\n${unknownOpBody}`);
});

test("server e2e: federation login rejects duplicate sensitive query parameters", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-federation-param-pollution-jwks-"));
  const mockProvider = await startMockFederationProvider();

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });
  t.after(async () => {
    await mockProvider.close();
  });

  const { child, getOutput } = startProcess(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "development",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        FRONTEND_URL: "http://127.0.0.1:4300",
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "true",
        OIDC_CLIENT_ID: "fact-index-frontend",
        OIDC_CLIENT_SECRET: mockProvider.oidcClientSecret,
        OIDC_REDIRECT_URI: `${baseUrl}/auth/federation/callback`,
        FEDERATION_OPS: JSON.stringify([
          {
            name: "Mock Saver IdP",
            entityId: mockProvider.baseUrl,
          },
        ]),
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const duplicateOpRes = await fetchWithTimeout(
    `${baseUrl}/auth/federation/login?op=${encodeURIComponent(mockProvider.baseUrl)}&op=${encodeURIComponent("https://rogue-op.example.org")}`,
    { redirect: "manual" },
  );
  const duplicateOpBody = await duplicateOpRes.text();
  assert.equal(
    duplicateOpRes.status,
    400,
    `Expected duplicate op query parameter to be rejected\nstatus=${duplicateOpRes.status}\nbody=${duplicateOpBody}\n${getOutput()}`,
  );

  let duplicateOpJson = null;
  try {
    duplicateOpJson = JSON.parse(duplicateOpBody);
  } catch (error) {
    assert.fail(`Expected duplicate op rejection JSON\n${String(error)}\n${duplicateOpBody}`);
  }
  assert.equal(
    duplicateOpJson?.error,
    "invalid_parameter",
    `Expected invalid_parameter for duplicate op\n${duplicateOpBody}`,
  );
  assert.match(
    String(duplicateOpJson?.error_description || ""),
    /op/i,
    `Expected error description to mention op\n${duplicateOpBody}`,
  );
});

test("server e2e: federation login rejects unavailable OP and IdC providers", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-federation-unavailable-jwks-"));
  const unavailableOpEntityId = "https://unavailable-op.example.org";
  const unavailableIdcEntityId = "https://unavailable-idc.example.org";

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
        NODE_ENV: "development",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        FRONTEND_URL: "http://127.0.0.1:4300",
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "true",
        OIDC_CLIENT_ID: "fact-index-frontend",
        OIDC_CLIENT_SECRET: "federation-e2e-client-secret",
        OIDC_REDIRECT_URI: `${baseUrl}/auth/federation/callback`,
        ALLOW_DYNAMIC_FEDERATION_OPS: "false",
        FEDERATION_OPS: JSON.stringify([
          {
            name: "Unavailable OP",
            entityId: unavailableOpEntityId,
            available: false,
          },
        ]),
        FEDERATION_IDCS: JSON.stringify([
          {
            name: "Unavailable IdC",
            entityId: unavailableIdcEntityId,
            opEntityId: unavailableOpEntityId,
            credentialType: "FactCredential",
            available: false,
          },
        ]),
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const unavailableOpRes = await fetchWithTimeout(
    `${baseUrl}/auth/federation/login?op=${encodeURIComponent(unavailableOpEntityId)}`,
    { redirect: "manual" },
  );
  const unavailableOpBody = await unavailableOpRes.text();
  assert.equal(
    unavailableOpRes.status,
    400,
    `Expected unavailable OP to be rejected\nstatus=${unavailableOpRes.status}\nbody=${unavailableOpBody}\n${getOutput()}`,
  );

  let unavailableOpJson = null;
  try {
    unavailableOpJson = JSON.parse(unavailableOpBody);
  } catch (error) {
    assert.fail(`Expected unavailable OP response JSON\n${String(error)}\n${unavailableOpBody}`);
  }
  assert.equal(
    unavailableOpJson?.error,
    "provider_unavailable",
    `Expected provider_unavailable error\n${unavailableOpBody}`,
  );

  const unavailableIdcRes = await fetchWithTimeout(
    `${baseUrl}/auth/federation/login?op=${encodeURIComponent(unavailableOpEntityId)}&idc=${encodeURIComponent(unavailableIdcEntityId)}`,
    { redirect: "manual" },
  );
  const unavailableIdcBody = await unavailableIdcRes.text();
  assert.equal(
    unavailableIdcRes.status,
    400,
    `Expected unavailable IdC to be rejected\nstatus=${unavailableIdcRes.status}\nbody=${unavailableIdcBody}\n${getOutput()}`,
  );

  let unavailableIdcJson = null;
  try {
    unavailableIdcJson = JSON.parse(unavailableIdcBody);
  } catch (error) {
    assert.fail(`Expected unavailable IdC response JSON\n${String(error)}\n${unavailableIdcBody}`);
  }
  assert.equal(
    unavailableIdcJson?.error,
    "idc_unavailable",
    `Expected idc_unavailable error\n${unavailableIdcBody}`,
  );
});

test("server e2e: federation auth request includes PKCE, state, and nonce protections", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-federation-auth-params-jwks-"));
  const mockProvider = await startMockFederationProvider();

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });
  t.after(async () => {
    await mockProvider.close();
  });

  const { child, getOutput } = startProcess(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "development",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        FRONTEND_URL: "http://127.0.0.1:4300",
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "true",
        OIDC_CLIENT_ID: "fact-index-frontend",
        OIDC_CLIENT_SECRET: mockProvider.oidcClientSecret,
        OIDC_REDIRECT_URI: `${baseUrl}/auth/federation/callback`,
        FEDERATION_OPS: JSON.stringify([
          {
            name: "Mock Saver IdP",
            entityId: mockProvider.baseUrl,
          },
        ]),
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const loginUrl = new URL(`${baseUrl}/auth/federation/login`);
  loginUrl.searchParams.set("op", mockProvider.baseUrl);
  loginUrl.searchParams.set("state", "attacker-state");
  loginUrl.searchParams.set("nonce", "attacker-nonce");
  loginUrl.searchParams.set("response_type", "token");

  const loginRes = await fetchWithTimeout(loginUrl.toString(), { redirect: "manual" });
  assert.equal(loginRes.status, 302, `Expected federation login redirect\n${getOutput()}`);

  const authorizeLocation = loginRes.headers.get("location") || "";
  const authorizeUrl = new URL(authorizeLocation);

  assert.equal(authorizeUrl.origin, mockProvider.baseUrl, `Expected redirect to mock OP\n${authorizeLocation}`);
  assert.equal(authorizeUrl.pathname, "/authorize", `Expected OP authorize endpoint\n${authorizeLocation}`);
  assert.equal(authorizeUrl.searchParams.get("response_type"), "code", `Expected authorization code flow\n${authorizeLocation}`);
  assert.equal(
    authorizeUrl.searchParams.get("code_challenge_method"),
    "S256",
    `Expected PKCE S256\n${authorizeLocation}`,
  );

  const codeChallenge = authorizeUrl.searchParams.get("code_challenge");
  assert.ok(
    typeof codeChallenge === "string" && codeChallenge.length >= 40,
    `Expected PKCE code_challenge\n${authorizeLocation}`,
  );

  const oauthState = authorizeUrl.searchParams.get("state");
  assert.ok(
    typeof oauthState === "string" && oauthState.length >= 10 && oauthState !== "attacker-state",
    `Expected generated non-attacker state\n${authorizeLocation}`,
  );

  const oauthNonce = authorizeUrl.searchParams.get("nonce");
  assert.ok(
    typeof oauthNonce === "string" && oauthNonce.length >= 10 && oauthNonce !== "attacker-nonce",
    `Expected generated non-attacker nonce\n${authorizeLocation}`,
  );

  assert.equal(
    authorizeUrl.searchParams.get("redirect_uri"),
    `${baseUrl}/auth/federation/callback`,
    `Expected callback redirect_uri\n${authorizeLocation}`,
  );
  assert.equal(
    authorizeUrl.searchParams.get("scope"),
    "openid profile email",
    `Expected default OIDC scopes\n${authorizeLocation}`,
  );
});

test("server e2e: federation callback rejects nonce mismatch", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const frontendUrl = "http://127.0.0.1:4300";
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-federation-nonce-jwks-"));
  const mockProvider = await startMockFederationProvider({
    idTokenNonceOverride: "tampered-nonce",
  });

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });
  t.after(async () => {
    await mockProvider.close();
  });

  const { child, getOutput } = startProcess(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "development",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        FRONTEND_URL: frontendUrl,
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "true",
        OIDC_CLIENT_ID: "fact-index-frontend",
        OIDC_CLIENT_SECRET: mockProvider.oidcClientSecret,
        OIDC_REDIRECT_URI: `${baseUrl}/auth/federation/callback`,
        FEDERATION_OPS: JSON.stringify([
          {
            name: "Mock Saver IdP",
            entityId: mockProvider.baseUrl,
          },
        ]),
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  let sessionCookie = null;
  const loginRes = await fetchWithTimeout(
    `${baseUrl}/auth/federation/login?op=${encodeURIComponent(mockProvider.baseUrl)}`,
    { redirect: "manual" },
  );
  sessionCookie = updateSessionCookie(sessionCookie, loginRes);
  assert.equal(loginRes.status, 302, `Expected login redirect\n${getOutput()}`);

  const authorizeLocation = loginRes.headers.get("location") || "";
  const authorizeRes = await fetchWithTimeout(authorizeLocation, { redirect: "manual" });
  assert.equal(authorizeRes.status, 302, `Expected authorize redirect`);

  const callbackLocation = authorizeRes.headers.get("location") || "";
  const callbackRes = await fetchWithTimeout(callbackLocation, {
    redirect: "manual",
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
  });
  assert.equal(callbackRes.status, 302, `Expected frontend redirect on nonce failure`);

  const failureRedirect = new URL(callbackRes.headers.get("location") || "", frontendUrl);
  assert.equal(failureRedirect.origin, new URL(frontendUrl).origin, `Expected redirect to frontend origin`);
  assert.equal(
    failureRedirect.searchParams.get("error"),
    "token_exchange_failed",
    `Expected token_exchange_failed for nonce mismatch\n${failureRedirect.toString()}\n${getOutput()}`,
  );
  assert.match(
    decodeURIComponent(failureRedirect.searchParams.get("error_description") || ""),
    /nonce mismatch/i,
    `Expected nonce mismatch detail\n${failureRedirect.toString()}\n${getOutput()}`,
  );
});

test("server e2e: federation callback rejects audience mismatch", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const frontendUrl = "http://127.0.0.1:4300";
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-federation-aud-jwks-"));
  const mockProvider = await startMockFederationProvider({
    idTokenAudienceOverride: "unexpected-client-id",
  });

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });
  t.after(async () => {
    await mockProvider.close();
  });

  const { child, getOutput } = startProcess(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "development",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        FRONTEND_URL: frontendUrl,
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "true",
        OIDC_CLIENT_ID: "fact-index-frontend",
        OIDC_CLIENT_SECRET: mockProvider.oidcClientSecret,
        OIDC_REDIRECT_URI: `${baseUrl}/auth/federation/callback`,
        FEDERATION_OPS: JSON.stringify([
          {
            name: "Mock Saver IdP",
            entityId: mockProvider.baseUrl,
          },
        ]),
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  let sessionCookie = null;
  const loginRes = await fetchWithTimeout(
    `${baseUrl}/auth/federation/login?op=${encodeURIComponent(mockProvider.baseUrl)}`,
    { redirect: "manual" },
  );
  sessionCookie = updateSessionCookie(sessionCookie, loginRes);
  assert.equal(loginRes.status, 302, `Expected login redirect\n${getOutput()}`);

  const authorizeLocation = loginRes.headers.get("location") || "";
  const authorizeRes = await fetchWithTimeout(authorizeLocation, { redirect: "manual" });
  assert.equal(authorizeRes.status, 302, `Expected authorize redirect`);

  const callbackLocation = authorizeRes.headers.get("location") || "";
  const callbackRes = await fetchWithTimeout(callbackLocation, {
    redirect: "manual",
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
  });
  assert.equal(callbackRes.status, 302, `Expected frontend redirect on audience failure`);

  const failureRedirect = new URL(callbackRes.headers.get("location") || "", frontendUrl);
  assert.equal(failureRedirect.origin, new URL(frontendUrl).origin, `Expected redirect to frontend origin`);
  assert.equal(
    failureRedirect.searchParams.get("error"),
    "token_exchange_failed",
    `Expected token_exchange_failed for audience mismatch\n${failureRedirect.toString()}\n${getOutput()}`,
  );
  assert.match(
    decodeURIComponent(failureRedirect.searchParams.get("error_description") || ""),
    /audience mismatch/i,
    `Expected audience mismatch detail\n${failureRedirect.toString()}\n${getOutput()}`,
  );
});

test("server e2e: federation callback rejects invalid ID token time claims", async (t) => {
  const testCases = [
    {
      name: "expired id_token",
      providerOptions: { idTokenExpiresInSeconds: -30 },
      expectedError: /token is expired/i,
    },
    {
      name: "future nbf id_token",
      providerOptions: { idTokenNbfOffsetSeconds: 3600 },
      expectedError: /not yet valid/i,
    },
  ];

  for (const testCase of testCases) {
    const port = await allocatePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const frontendUrl = "http://127.0.0.1:4300";
    const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), `fact-e2e-federation-time-${Date.now()}-jwks-`));
    const mockProvider = await startMockFederationProvider(testCase.providerOptions);

    t.after(() => {
      fs.rmSync(keysDir, { recursive: true, force: true });
    });
    t.after(async () => {
      await mockProvider.close();
    });

    const { child, getOutput } = startProcess(
      "node",
      ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
      {
        cwd: serverRoot,
        env: {
          ...process.env,
          NODE_ENV: "development",
          TS_NODE_PROJECT: "tsconfig.json",
          DOTENV_CONFIG_PATH: "apps/fact-server/.env",
          PORT: String(port),
          FRONTEND_URL: frontendUrl,
          DEV_LOGIN_MODE: "true",
          SESSION_SECRET,
          TOKEN_ENCRYPTION_KEY,
          KEYS_DIR: keysDir,
          ENABLE_FEDERATION: "false",
          ENABLE_FEDERATION_PROVIDER: "false",
          ENABLE_FEDERATION_LOGIN: "true",
          OIDC_CLIENT_ID: "fact-index-frontend",
          OIDC_CLIENT_SECRET: mockProvider.oidcClientSecret,
          OIDC_REDIRECT_URI: `${baseUrl}/auth/federation/callback`,
          FEDERATION_OPS: JSON.stringify([
            {
              name: "Mock Saver IdP",
              entityId: mockProvider.baseUrl,
            },
          ]),
        },
      },
    );

    t.after(async () => {
      await terminateProcess(child);
    });

    try {
      await waitForHttp(`${baseUrl}/health`);
    } catch (error) {
      assert.fail(`Server failed health check at ${baseUrl}/health (${testCase.name})\n${String(error)}\n${getOutput()}`);
    }

    let sessionCookie = null;
    const loginRes = await fetchWithTimeout(
      `${baseUrl}/auth/federation/login?op=${encodeURIComponent(mockProvider.baseUrl)}`,
      { redirect: "manual" },
    );
    sessionCookie = updateSessionCookie(sessionCookie, loginRes);
    assert.equal(loginRes.status, 302, `Expected login redirect (${testCase.name})\n${getOutput()}`);

    const authorizeLocation = loginRes.headers.get("location") || "";
    const authorizeRes = await fetchWithTimeout(authorizeLocation, { redirect: "manual" });
    assert.equal(authorizeRes.status, 302, `Expected authorize redirect (${testCase.name})`);

    const callbackLocation = authorizeRes.headers.get("location") || "";
    const callbackRes = await fetchWithTimeout(callbackLocation, {
      redirect: "manual",
      headers: sessionCookie ? { Cookie: sessionCookie } : {},
    });
    assert.equal(callbackRes.status, 302, `Expected frontend redirect on time-claim failure (${testCase.name})`);

    const failureRedirect = new URL(callbackRes.headers.get("location") || "", frontendUrl);
    assert.equal(failureRedirect.origin, new URL(frontendUrl).origin, `Expected frontend origin (${testCase.name})`);
    assert.equal(
      failureRedirect.searchParams.get("error"),
      "token_exchange_failed",
      `Expected token_exchange_failed (${testCase.name})\n${failureRedirect.toString()}\n${getOutput()}`,
    );
    assert.match(
      decodeURIComponent(failureRedirect.searchParams.get("error_description") || ""),
      testCase.expectedError,
      `Expected time-claim error detail (${testCase.name})\n${failureRedirect.toString()}\n${getOutput()}`,
    );
  }
});

test("server e2e: federation callback cannot be replayed after successful login", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const frontendUrl = "http://127.0.0.1:4300";
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-federation-replay-jwks-"));
  const mockProvider = await startMockFederationProvider();

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });
  t.after(async () => {
    await mockProvider.close();
  });

  const { child, getOutput } = startProcess(
    "node",
    ["-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-r", "dotenv/config", "./src/main.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: "development",
        TS_NODE_PROJECT: "tsconfig.json",
        DOTENV_CONFIG_PATH: "apps/fact-server/.env",
        PORT: String(port),
        FRONTEND_URL: frontendUrl,
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "true",
        OIDC_CLIENT_ID: "fact-index-frontend",
        OIDC_CLIENT_SECRET: mockProvider.oidcClientSecret,
        OIDC_REDIRECT_URI: `${baseUrl}/auth/federation/callback`,
        FEDERATION_OPS: JSON.stringify([
          {
            name: "Mock Saver IdP",
            entityId: mockProvider.baseUrl,
          },
        ]),
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  let sessionCookie = null;
  const loginRes = await fetchWithTimeout(
    `${baseUrl}/auth/federation/login?op=${encodeURIComponent(mockProvider.baseUrl)}`,
    { redirect: "manual" },
  );
  sessionCookie = updateSessionCookie(sessionCookie, loginRes);
  assert.equal(loginRes.status, 302, `Expected login redirect\n${getOutput()}`);

  const authorizeLocation = loginRes.headers.get("location") || "";
  const authorizeRes = await fetchWithTimeout(authorizeLocation, { redirect: "manual" });
  assert.equal(authorizeRes.status, 302, `Expected authorize redirect`);

  const callbackLocation = authorizeRes.headers.get("location") || "";
  const firstCallbackRes = await fetchWithTimeout(callbackLocation, {
    redirect: "manual",
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
  });
  sessionCookie = updateSessionCookie(sessionCookie, firstCallbackRes);
  assert.equal(firstCallbackRes.status, 302, `Expected callback success redirect`);
  assert.equal(
    firstCallbackRes.headers.get("location"),
    frontendUrl,
    `Expected successful callback redirect to frontend\n${getOutput()}`,
  );

  const tokenRequest = mockProvider.getTokenRequests()[0];
  assert.ok(tokenRequest, `Expected token exchange request to mock OP\n${getOutput()}`);
  assert.ok(
    typeof tokenRequest?.params?.code_verifier === "string" && tokenRequest.params.code_verifier.length > 20,
    `Expected PKCE code_verifier during token exchange\n${JSON.stringify(tokenRequest, null, 2)}`,
  );

  const replayCallbackRes = await fetchWithTimeout(callbackLocation, {
    redirect: "manual",
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
  });
  const replayBody = await replayCallbackRes.text();
  assert.equal(
    replayCallbackRes.status,
    400,
    `Expected replay callback rejection\nstatus=${replayCallbackRes.status}\nbody=${replayBody}\n${getOutput()}`,
  );

  let replayJson = null;
  try {
    replayJson = JSON.parse(replayBody);
  } catch (error) {
    assert.fail(`Expected replay rejection JSON\n${String(error)}\n${replayBody}`);
  }
  assert.equal(replayJson?.error, "invalid_session", `Expected invalid_session on replay\n${replayBody}`);
});

test("server e2e: federation login rejects HTTP OP in production", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-federation-prod-http-jwks-"));
  const mockProvider = await startMockFederationProvider();

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });
  t.after(async () => {
    await mockProvider.close();
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
        FRONTEND_URL: "http://127.0.0.1:4300",
        DEV_LOGIN_MODE: "true",
        SESSION_SECRET,
        TOKEN_ENCRYPTION_KEY,
        KEYS_DIR: keysDir,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "true",
        OIDC_CLIENT_ID: "fact-index-frontend",
        OIDC_CLIENT_SECRET: mockProvider.oidcClientSecret,
        OIDC_REDIRECT_URI: `${baseUrl}/auth/federation/callback`,
        FEDERATION_OPS: JSON.stringify([
          {
            name: "Mock Saver IdP",
            entityId: mockProvider.baseUrl,
          },
        ]),
      },
    },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  try {
    await waitForHttp(`${baseUrl}/health`);
  } catch (error) {
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const loginRes = await fetchWithTimeout(
    `${baseUrl}/auth/federation/login?op=${encodeURIComponent(mockProvider.baseUrl)}`,
    { redirect: "manual" },
  );
  const loginBody = await loginRes.text();
  assert.equal(
    loginRes.status,
    500,
    `Expected HTTP OP rejection in production\nstatus=${loginRes.status}\nbody=${loginBody}\n${getOutput()}`,
  );

  let loginJson = null;
  try {
    loginJson = JSON.parse(loginBody);
  } catch (error) {
    assert.fail(`Expected JSON response for production HTTP rejection\n${String(error)}\n${loginBody}`);
  }
  assert.equal(loginJson?.error, "federation_error", `Expected federation_error\n${loginBody}`);
  assert.match(
    String(loginJson?.error_description || ""),
    /must use HTTPS/i,
    `Expected HTTPS requirement error\n${loginBody}`,
  );
});

test("server e2e: admin can add trust subordinate", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-subordinate-jwks-"));
  const subordinateEntityId = `https://inferior-${Date.now()}.example.org`;

  t.after(() => {
    fs.rmSync(keysDir, { recursive: true, force: true });
  });

  const serverConfigPath = createIsolatedServerConfig(t, "fact-e2e-config-");
  const config = JSON.parse(fs.readFileSync(serverConfigPath, "utf8"));
  const adminUserId = "repo-e2e-admin-subordinate";
  config.adminUsers = Array.isArray(config.adminUsers) ? config.adminUsers : [];
  if (!config.adminUsers.includes(adminUserId)) {
    config.adminUsers.push(adminUserId);
    writeFileAtomic(serverConfigPath, JSON.stringify(config, null, 2));
  }


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
    assert.fail(`Server failed health check at ${baseUrl}/health\n${String(error)}\n${getOutput()}`);
  }

  const adminToken = await mintToken({
    userId: adminUserId,
    username: "repo-e2e-admin-subordinate",
    isAdmin: true,
    keysDir,
  });

  const createSubordinateRes = await fetchWithTimeout(`${baseUrl}/auth/admin/federation/subordinates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subordinateEntityId,
      metadata: {
        federation_entity: {
          organization_name: "E2E Inferior",
        },
      },
    }),
  });
  const createSubordinateBody = await createSubordinateRes.text();
  assert.equal(
    createSubordinateRes.status,
    200,
    `Expected subordinate create success\nstatus=${createSubordinateRes.status}\nbody=${createSubordinateBody}\n${getOutput()}`,
  );

  let createSubordinateJson = null;
  try {
    createSubordinateJson = JSON.parse(createSubordinateBody);
  } catch (error) {
    assert.fail(`Expected subordinate create JSON\n${String(error)}\n${createSubordinateBody}`);
  }

  assert.equal(
    createSubordinateJson?.subordinate?.subordinateId,
    subordinateEntityId,
    `Expected subordinateEntityId in create response\n${createSubordinateBody}`,
  );
  assert.ok(
    typeof createSubordinateJson?.statementJwt === "string" &&
      createSubordinateJson.statementJwt.split(".").length === 3,
    `Expected subordinate statement JWT in create response\n${createSubordinateBody}`,
  );

  const listSubordinatesRes = await fetchWithTimeout(`${baseUrl}/auth/admin/federation/subordinates`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });
  const listSubordinatesBody = await listSubordinatesRes.text();
  assert.equal(
    listSubordinatesRes.status,
    200,
    `Expected subordinate list success\nstatus=${listSubordinatesRes.status}\nbody=${listSubordinatesBody}\n${getOutput()}`,
  );

  let listSubordinatesJson = null;
  try {
    listSubordinatesJson = JSON.parse(listSubordinatesBody);
  } catch (error) {
    assert.fail(`Expected subordinate list JSON\n${String(error)}\n${listSubordinatesBody}`);
  }

  const subordinates = Array.isArray(listSubordinatesJson?.subordinates)
    ? listSubordinatesJson.subordinates
    : [];
  const subordinate = subordinates.find((entry) => entry?.subordinateId === subordinateEntityId);
  assert.ok(
    subordinate,
    `Expected subordinate in list response\n${listSubordinatesBody}`,
  );
});
