import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import { runCommand } from "./helpers.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const serverRoot = path.join(repoRoot, "apps", "fact-server");

async function runServerScript(script, env = {}) {
  return runCommand(
    "node",
    ["--input-type=module", "-r", "tsconfig-paths/register", "-r", "@swc-node/register", "-e", script],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        ENABLE_FEDERATION: "false",
        ENABLE_FEDERATION_PROVIDER: "false",
        ENABLE_FEDERATION_LOGIN: "false",
        ...env,
      },
    },
  );
}

test("server e2e: branch coverage edge paths", async (t) => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fact-e2e-branches-"));
  const sqliteDbRelativePath = path.join(
    "tmp",
    `e2e-branches-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite3`,
  );
  const sqliteDbAbsolutePath = path.join(repoRoot, sqliteDbRelativePath);
  const tokenEncryptionKey = "e2e-branch-coverage-key";

  t.after(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(sqliteDbAbsolutePath, { force: true });
    fs.rmSync(path.join(serverRoot, ".keys"), { recursive: true, force: true });
  });

  const keysDirMain = path.join(tmpRoot, "keys-main");
  fs.mkdirSync(keysDirMain, { recursive: true });

  const mainScript = `
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { generateKeyPairSync } from 'node:crypto';
import { initializeDb, createSchema, getDb } from './src/db/schema.ts';
import {
  initializeJWKS,
  getCurrentPrivateKey,
  getCurrentKeyId,
  getPublicJWKS,
  getKeyById,
  getAllValidKeys,
  cleanupJWKS,
} from './src/auth/jwks.ts';
import {
  encryptToken,
  revokeToken,
  isTokenRevoked,
  revokeAllUserTokens,
  cleanupExpiredBlacklistedTokens,
  generateJWT,
  verifyJWT,
  refreshAccessToken,
  generateState,
  validateState,
  verifyOAuthStateJWT,
  initializePassportJWTStrategy,
} from './src/auth/jwt.ts';

const originalFetch = global.fetch;
const originalNow = Date.now;

try {
  await initializeDb();
  await createSchema(getDb());
  const db = getDb();

  initializeJWKS();
  const currentKid = getCurrentKeyId();
  const initialJwks = getPublicJWKS();
  const nextKid = initialJwks.keys.find((k) => k.kid !== currentKid)?.kid;
  assert.ok(nextKid);
  assert.ok(getKeyById(nextKid));
  assert.ok(getAllValidKeys().length >= 2);

  const encryptedOnlyAccess = encryptToken(JSON.stringify({ accessToken: 'solo-access' }));
  const minimalDiscordUser = {
    type: 'discord',
    id: 'discord-minimal',
    username: '',
    avatar: null,
    discriminator: null,
    guild: null,
    encryptedTokens: encryptedOnlyAccess,
    cacheUpdatedAt: 12345,
  };
  const minimalToken = generateJWT(minimalDiscordUser);
  const minimalVerified = verifyJWT(minimalToken);
  assert.equal(minimalVerified?.type, 'discord');
  assert.equal(minimalVerified?.username, '');
  assert.equal(minimalVerified?.hasRole, false);
  assert.equal(minimalVerified?.isAdmin, false);
  assert.equal(minimalVerified?.devBypass, false);
  assert.equal(minimalVerified?.refreshToken, null);

  const fallbackLastCheckToken = jwt.sign(
    {
      sub: 'discord-fallback-last-check',
      username: '',
      devBypass: false,
      hasRole: false,
      isAdmin: false,
      cacheUpdatedAt: 777,
    },
    getCurrentPrivateKey(),
    { algorithm: 'RS256', keyid: currentKid, expiresIn: '1h' },
  );
  const fallbackLastCheckUser = verifyJWT(fallbackLastCheckToken);
  assert.equal(fallbackLastCheckUser?.lastCheck, 777);
  assert.equal(fallbackLastCheckUser?.username, '');

  const devNoUsername = {
    type: 'dev',
    id: 'dev-no-username',
    username: '',
    avatar: null,
    discriminator: null,
    guild: null,
    hasRole: false,
    isAdmin: false,
    devBypass: true,
  };
  const devNoUsernameToken = generateJWT(devNoUsername);
  const devNoUsernameVerified = verifyJWT(devNoUsernameToken);
  assert.equal(devNoUsernameVerified?.type, 'dev');
  assert.equal(devNoUsernameVerified?.username, '');

  const { privateKey: wrongPrivateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const invalidSignatureToken = jwt.sign(
    {
      sub: 'invalid-signature',
      username: 'invalid',
      devBypass: false,
      hasRole: false,
      isAdmin: false,
    },
    wrongPrivateKey,
    { algorithm: 'RS256', keyid: currentKid, expiresIn: '1h' },
  );
  assert.equal(verifyJWT(invalidSignatureToken), null);

  const refreshUser = {
    type: 'discord',
    id: 'refresh-user',
    username: 'refresh-user',
    avatar: null,
    discriminator: null,
    guild: null,
    hasRole: false,
    isAdmin: false,
    devBypass: false,
    refreshToken: 'keep-refresh-token',
    scope: 'identify',
  };

  global.fetch = async () => ({
    ok: false,
    status: 429,
    headers: new Headers(),
    text: async () => 'slow down',
  });
  await assert.rejects(() => refreshAccessToken(refreshUser), /rate limit/i);

  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ access_token: 'new-access-token' }),
    text: async () => '',
  });
  const refreshedWithoutOptional = await refreshAccessToken(refreshUser);
  assert.equal(refreshedWithoutOptional.refreshToken, 'keep-refresh-token');
  assert.equal(refreshedWithoutOptional.expiresAt, null);

  Date.now = () => 2_000_000;
  const staleState = generateState();
  Date.now = () => 2_000_000 + 11 * 60 * 1000;
  const freshState = generateState();
  assert.equal(validateState(freshState), true);
  assert.equal(validateState(staleState), false);
  Date.now = originalNow;

  const badStateSignature = jwt.sign(
    { type: 'oauth_state', nonce: 'bad-signature' },
    wrongPrivateKey,
    { algorithm: 'RS256', keyid: currentKid, expiresIn: '10m' },
  );
  assert.equal(verifyOAuthStateJWT(badStateSignature), null);

  initializePassportJWTStrategy();
  const jwtStrategy = passport._strategies?.jwt;
  assert.ok(jwtStrategy);
  const verifyStrategy = jwtStrategy._verify || jwtStrategy.verify;

  await new Promise((resolve, reject) => {
    verifyStrategy({ sub: 'dev-no-name', devBypass: true, hasRole: false, isAdmin: false }, (err, user) => {
      if (err) return reject(err);
      try {
        assert.equal(user?.type, 'dev');
        assert.equal(user?.username, '');
      } catch (assertErr) {
        return reject(assertErr);
      }
      resolve();
    });
  });

  await new Promise((resolve, reject) => {
    verifyStrategy({ sub: 'discord-no-name', devBypass: false, hasRole: false, isAdmin: false }, (err, user) => {
      if (err) return reject(err);
      try {
        assert.equal(user?.type, 'discord');
        assert.equal(user?.username, '');
      } catch (assertErr) {
        return reject(assertErr);
      }
      resolve();
    });
  });

  await db.insertInto('users').values({ discord_name: 'refresh-user', email: 'refresh-user@example.com' }).execute();
  const nowSeconds = Math.floor(Date.now() / 1000);

  await revokeToken('branch-jti-no-reason', 'refresh-user', nowSeconds + 300);
  assert.equal(await isTokenRevoked('branch-jti-no-reason'), true);
  assert.equal(await revokeAllUserTokens('refresh-user'), 1);

  const cleanupNoRows = await cleanupExpiredBlacklistedTokens();
  assert.equal(Number(cleanupNoRows), 0);

  await db.schema.dropTable('jwt_token_blacklist').execute();
  await assert.rejects(() => revokeToken('branch-jti-db-fail', 'refresh-user', nowSeconds + 600), /.+/);
  assert.equal(await isTokenRevoked('branch-jti-db-fail'), true);
  assert.equal(Number(await cleanupExpiredBlacklistedTokens()), 0);

  await db.schema.dropTable('users').execute();
  await assert.rejects(() => revokeAllUserTokens('refresh-user'), /.+/);

  console.log('E2E_BRANCH_MAIN_OK');
} finally {
  Date.now = originalNow;
  global.fetch = originalFetch;
  cleanupJWKS();
}
`;

  const mainRun = await runServerScript(mainScript, {
    NODE_ENV: "development",
    TOKEN_ENCRYPTION_KEY: tokenEncryptionKey,
    KEYS_DIR: keysDirMain,
    SQLITE_DB: sqliteDbRelativePath,
  });
  assert.equal(mainRun.code, 0, `main branch script failed\n${mainRun.output}`);
  assert.match(mainRun.output, /E2E_BRANCH_MAIN_OK/, `main branch script did not finish\n${mainRun.output}`);

  const strategyFailureScript = `
import { initializePassportJWTStrategy } from './src/auth/jwt.ts';
initializePassportJWTStrategy();
console.log('E2E_PASSPORT_INIT_FAILURE_PATH_OK');
`;

  const strategyFailureRun = await runServerScript(strategyFailureScript, {
    NODE_ENV: "development",
    TOKEN_ENCRYPTION_KEY: tokenEncryptionKey,
    KEYS_DIR: path.join(tmpRoot, "passport-failure-keys"),
  });
  assert.equal(strategyFailureRun.code, 0, `strategy failure-path script failed\n${strategyFailureRun.output}`);
  assert.match(
    strategyFailureRun.output,
    /E2E_PASSPORT_INIT_FAILURE_PATH_OK/,
    `strategy failure-path marker missing\n${strategyFailureRun.output}`,
  );

  const jwtDevFallbackScript = `
import assert from 'node:assert/strict';
import { initializeJWKS, cleanupJWKS } from './src/auth/jwks.ts';
import { encryptToken, decryptToken } from './src/auth/jwt.ts';
initializeJWKS();
const encrypted = encryptToken('dev-fallback-token');
assert.equal(decryptToken(encrypted), 'dev-fallback-token');
cleanupJWKS();
console.log('E2E_JWT_DEV_FALLBACK_OK');
`;

  const jwtDevFallbackRun = await runServerScript(jwtDevFallbackScript, {
    NODE_ENV: "development",
    TOKEN_ENCRYPTION_KEY: "",
    KEYS_DIR: "",
  });
  assert.equal(jwtDevFallbackRun.code, 0, `jwt dev fallback script failed\n${jwtDevFallbackRun.output}`);
  assert.match(
    jwtDevFallbackRun.output,
    /E2E_JWT_DEV_FALLBACK_OK/,
    `jwt dev fallback marker missing\n${jwtDevFallbackRun.output}`,
  );

  const jwtProdMissingKeyScript = `
import './src/auth/jwt.ts';
console.log('UNEXPECTED_PROD_SUCCESS');
`;

  const jwtProdMissingKeyRun = await runServerScript(jwtProdMissingKeyScript, {
    NODE_ENV: "production",
    TOKEN_ENCRYPTION_KEY: "",
  });
  assert.notEqual(
    jwtProdMissingKeyRun.code,
    0,
    `expected production missing-key import to fail\n${jwtProdMissingKeyRun.output}`,
  );
  assert.match(
    jwtProdMissingKeyRun.output,
    /TOKEN_ENCRYPTION_KEY/,
    `expected production error output to mention TOKEN_ENCRYPTION_KEY\n${jwtProdMissingKeyRun.output}`,
  );

  const invalidJsonDir = path.join(tmpRoot, "keys-invalid-json");
  fs.mkdirSync(invalidJsonDir, { recursive: true });
  fs.writeFileSync(path.join(invalidJsonDir, "keys.json"), "{not-valid-json", "utf8");
  fs.writeFileSync(path.join(invalidJsonDir, "orphan-key.pem"), "orphan", "utf8");

  const jwksInvalidJsonScript = `
import assert from 'node:assert/strict';
import { initializeJWKS, getPublicJWKS, cleanupJWKS } from './src/auth/jwks.ts';
initializeJWKS();
const jwks = getPublicJWKS();
assert.ok(Array.isArray(jwks.keys));
cleanupJWKS();
console.log('E2E_JWKS_INVALID_JSON_OK');
`;

  const jwksInvalidJsonRun = await runServerScript(jwksInvalidJsonScript, {
    NODE_ENV: "development",
    TOKEN_ENCRYPTION_KEY: tokenEncryptionKey,
    KEYS_DIR: invalidJsonDir,
  });
  assert.equal(jwksInvalidJsonRun.code, 0, `jwks invalid json script failed\n${jwksInvalidJsonRun.output}`);
  assert.match(
    jwksInvalidJsonRun.output,
    /E2E_JWKS_INVALID_JSON_OK/,
    `jwks invalid json marker missing\n${jwksInvalidJsonRun.output}`,
  );
  assert.equal(fs.existsSync(path.join(invalidJsonDir, "orphan-key.pem")), false);

  const missingCurrentPemDir = path.join(tmpRoot, "keys-missing-current-pem");
  fs.mkdirSync(missingCurrentPemDir, { recursive: true });
  fs.writeFileSync(
    path.join(missingCurrentPemDir, "keys.json"),
    JSON.stringify({ current: { kid: "missing-current", iat: Math.floor(Date.now() / 1000) } }, null, 2),
    "utf8",
  );

  const jwksMissingCurrentPemScript = `
import assert from 'node:assert/strict';
import { initializeJWKS, getCurrentKeyId, cleanupJWKS } from './src/auth/jwks.ts';
initializeJWKS();
assert.notEqual(getCurrentKeyId(), 'missing-current');
cleanupJWKS();
console.log('E2E_JWKS_MISSING_CURRENT_PEM_OK');
`;

  const jwksMissingCurrentPemRun = await runServerScript(jwksMissingCurrentPemScript, {
    NODE_ENV: "development",
    TOKEN_ENCRYPTION_KEY: tokenEncryptionKey,
    KEYS_DIR: missingCurrentPemDir,
  });
  assert.equal(
    jwksMissingCurrentPemRun.code,
    0,
    `jwks missing current pem script failed\n${jwksMissingCurrentPemRun.output}`,
  );
  assert.match(
    jwksMissingCurrentPemRun.output,
    /E2E_JWKS_MISSING_CURRENT_PEM_OK/,
    `jwks missing current pem marker missing\n${jwksMissingCurrentPemRun.output}`,
  );

  const keyDirAsFile = path.join(tmpRoot, "keys-as-file");
  fs.writeFileSync(keyDirAsFile, "not-a-directory", "utf8");

  const jwksFilePathScript = `
import assert from 'node:assert/strict';
import { initializeJWKS, getPublicJWKS, cleanupJWKS } from './src/auth/jwks.ts';
initializeJWKS();
const jwks = getPublicJWKS();
assert.ok(Array.isArray(jwks.keys));
cleanupJWKS();
console.log('E2E_JWKS_FILE_PATH_OK');
`;

  const jwksFilePathRun = await runServerScript(jwksFilePathScript, {
    NODE_ENV: "development",
    TOKEN_ENCRYPTION_KEY: tokenEncryptionKey,
    KEYS_DIR: keyDirAsFile,
    KEY_ROTATION_INTERVAL_DAYS: "1",
  });
  assert.equal(jwksFilePathRun.code, 0, `jwks file path script failed\n${jwksFilePathRun.output}`);
  assert.match(
    jwksFilePathRun.output,
    /E2E_JWKS_FILE_PATH_OK/,
    `jwks file path marker missing\n${jwksFilePathRun.output}`,
  );

  const nonExistingKeysDir = path.join(tmpRoot, "keys-do-not-exist", "nested");

  const jwksNonExistingDirScript = `
import assert from 'node:assert/strict';
import { initializeJWKS, getPublicJWKS, cleanupJWKS } from './src/auth/jwks.ts';
initializeJWKS();
const jwks = getPublicJWKS();
assert.ok(Array.isArray(jwks.keys));
cleanupJWKS();
console.log('E2E_JWKS_NON_EXISTING_DIR_OK');
`;

  const jwksNonExistingDirRun = await runServerScript(jwksNonExistingDirScript, {
    NODE_ENV: "development",
    TOKEN_ENCRYPTION_KEY: tokenEncryptionKey,
    KEYS_DIR: nonExistingKeysDir,
    KEY_ROTATION_INTERVAL_DAYS: "1",
  });
  assert.equal(
    jwksNonExistingDirRun.code,
    0,
    `jwks non-existing dir script failed\n${jwksNonExistingDirRun.output}`,
  );
  assert.match(
    jwksNonExistingDirRun.output,
    /E2E_JWKS_NON_EXISTING_DIR_OK/,
    `jwks non-existing dir marker missing\n${jwksNonExistingDirRun.output}`,
  );

  const eddsaKeysDir = path.join(tmpRoot, "keys-eddsa");
  fs.mkdirSync(eddsaKeysDir, { recursive: true });
  const eddsaKid = "eddsa-current";
  const { privateKey: eddsaPrivatePem } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  fs.writeFileSync(path.join(eddsaKeysDir, `${eddsaKid}.pem`), eddsaPrivatePem, "utf8");
  fs.writeFileSync(
    path.join(eddsaKeysDir, "keys.json"),
    JSON.stringify({ current: { kid: eddsaKid, iat: Math.floor(Date.now() / 1000) } }, null, 2),
    "utf8",
  );

  const jwksEddsaScript = `
import assert from 'node:assert/strict';
import { initializeJWKS, getPublicJWKS, getAllValidKeys, cleanupJWKS } from './src/auth/jwks.ts';
initializeJWKS();
const jwks = getPublicJWKS();
assert.equal(Array.isArray(jwks.keys), true);
assert.equal(jwks.keys.length, 0);
assert.equal(getAllValidKeys().length, 1);
cleanupJWKS();
console.log('E2E_JWKS_EDDSA_OK');
`;

  const jwksEddsaRun = await runServerScript(jwksEddsaScript, {
    NODE_ENV: "development",
    TOKEN_ENCRYPTION_KEY: tokenEncryptionKey,
    KEYS_DIR: eddsaKeysDir,
  });
  assert.equal(jwksEddsaRun.code, 0, `jwks eddsa script failed\n${jwksEddsaRun.output}`);
  assert.match(
    jwksEddsaRun.output,
    /E2E_JWKS_EDDSA_OK/,
    `jwks eddsa marker missing\n${jwksEddsaRun.output}`,
  );

const resolverEdgeScript = `
import assert from 'node:assert/strict';
import {
  resolveOpenIdProviderViaTrustAnchor,
  resolveOpenIdProviderDirect,
  resolveFederatedOpenIdProvider,
} from './src/federation/resolver.ts';

const originalFetch = global.fetch;
const originalNodeEnv = process.env.NODE_ENV;
const originalTrustAnchorEntityId = process.env.FEDERATION_TRUST_ANCHOR_ENTITY_ID;
const originalTrustAnchorResolveEndpoint = process.env.FEDERATION_TRUST_ANCHOR_RESOLVE_ENDPOINT;
const originalFederationEntityId = process.env.FEDERATION_ENTITY_ID;
const validOpMetadata = {
  issuer: 'https://issuer.example.org',
  authorization_endpoint: 'https://issuer.example.org/authorize',
  token_endpoint: 'https://issuer.example.org/token',
};
const makeUnsignedJwt = (payload) => {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return header + '.' + body + '.sig';
};

try {
  process.env.NODE_ENV = 'production';
  delete process.env.FEDERATION_TRUST_ANCHOR_ENTITY_ID;
  delete process.env.FEDERATION_TRUST_ANCHOR_RESOLVE_ENDPOINT;
  delete process.env.FEDERATION_ENTITY_ID;
  await assert.rejects(
    () => resolveFederatedOpenIdProvider({ opEntityId: 'not-a-valid-url' }),
    /opEntityId must be a valid absolute URL/i,
  );
  await assert.rejects(
    () => resolveOpenIdProviderViaTrustAnchor({ opEntityId: 'https://op.example.org' }),
    /Missing trust anchor entity id/i,
  );
  await assert.rejects(
    () =>
      resolveOpenIdProviderViaTrustAnchor({
        opEntityId: 'https://op.example.org',
        trustAnchorEntityId: 'http://remote-trust-anchor.example.org',
      }),
    /trust anchor entity id must use HTTPS/i,
  );

  process.env.NODE_ENV = 'development';
  process.env.FEDERATION_TRUST_ANCHOR_ENTITY_ID = 'http://127.0.0.1:9901/';
  delete process.env.FEDERATION_TRUST_ANCHOR_RESOLVE_ENDPOINT;
  let capturedResolveUrl = '';
  global.fetch = async (url) => {
    capturedResolveUrl = String(url);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        metadata: { openid_provider: validOpMetadata },
      }),
      text: async () => '',
    };
  };
  const resolvedViaTrustAnchor = await resolveOpenIdProviderViaTrustAnchor({
    opEntityId: 'https://op.example.org',
  });
  assert.equal(resolvedViaTrustAnchor.issuer, 'https://issuer.example.org');
  assert.match(capturedResolveUrl, /127\\.0\\.0\\.1:9901\\/federation\\/resolve/);
  assert.match(capturedResolveUrl, /trust_anchor=http%3A%2F%2F127\\.0\\.0\\.1%3A9901/);

  global.fetch = async () => ({
    ok: false,
    status: 502,
    statusText: 'Bad Gateway',
    headers: new Headers(),
    json: async () => ({}),
    text: async () => '',
  });
  await assert.rejects(
    () =>
      resolveOpenIdProviderViaTrustAnchor({
        opEntityId: 'https://op.example.org',
        trustAnchorEntityId: 'http://127.0.0.1:9910',
      }),
    /Federation resolve failed: 502 Bad Gateway/i,
  );

  global.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    json: async () => ({ openid_provider: validOpMetadata }),
    text: async () => '',
  });
  const headerlessContentType = await resolveOpenIdProviderViaTrustAnchor({
    opEntityId: 'https://op.example.org',
    trustAnchorEntityId: 'http://127.0.0.1:9911',
  });
  assert.equal(headerlessContentType.issuer, validOpMetadata.issuer);

  global.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ metadata: { openid_provider: { issuer: validOpMetadata.issuer } } }),
    text: async () => '',
  });
  await assert.rejects(
    () =>
      resolveOpenIdProviderViaTrustAnchor({
        opEntityId: 'https://op.example.org',
        trustAnchorEntityId: 'http://127.0.0.1:9912',
      }),
    /Resolve response missing required OP metadata/i,
  );

  process.env.NODE_ENV = 'production';
  process.env.FEDERATION_TRUST_ANCHOR_ENTITY_ID = 'https://trust-anchor.example.org';
  process.env.FEDERATION_TRUST_ANCHOR_RESOLVE_ENDPOINT = 'https://trust-anchor.example.org/federation/resolve';
  global.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/entity-statement+jwt' }),
    text: async () => 'header.payload.sig',
    json: async () => ({}),
  });
  await assert.rejects(
    () => resolveOpenIdProviderViaTrustAnchor({ opEntityId: 'https://op.example.org' }),
    /Refusing JWT federation resolve response in production/i,
  );
  await assert.rejects(
    () => resolveOpenIdProviderDirect('https://issuer.example.org'),
    /Refusing direct federation JWT metadata in production/i,
  );

  process.env.NODE_ENV = 'development';
  delete process.env.FEDERATION_TRUST_ANCHOR_ENTITY_ID;
  delete process.env.FEDERATION_TRUST_ANCHOR_RESOLVE_ENDPOINT;
  delete process.env.FEDERATION_ENTITY_ID;

  global.fetch = async (url) => {
    const resolved = String(url);
    if (resolved.includes('/federation/resolve')) {
      return {
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'down' }),
        text: async () => '',
      };
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      text: async () => makeUnsignedJwt({ metadata: { openid_provider: validOpMetadata } }),
      json: async () => ({}),
    };
  };
  const fallbackAfterTrustAnchorFailure = await resolveFederatedOpenIdProvider({
    opEntityId: 'http://127.0.0.1:8998',
    trustAnchorEntityId: 'http://127.0.0.1:9902',
    trustAnchorResolveEndpoint: 'http://127.0.0.1:9902/federation/resolve',
  });
  assert.equal(fallbackAfterTrustAnchorFailure.issuer, validOpMetadata.issuer);

  global.fetch = async () => {
    throw new Error('simulated network failure');
  };
  const developmentFallback = await resolveFederatedOpenIdProvider({ opEntityId: 'http://127.0.0.1:8999' });
  assert.equal(developmentFallback.issuer, 'http://127.0.0.1:8999');
  await assert.rejects(
    () => resolveFederatedOpenIdProvider({ opEntityId: 'https://remote-op.example.org' }),
    /simulated network failure/i,
  );

  global.fetch = async () => ({
    ok: false,
    status: 404,
    statusText: 'Not Found',
    headers: new Headers(),
    text: async () => '',
    json: async () => ({}),
  });
  await assert.rejects(
    () => resolveOpenIdProviderDirect('http://127.0.0.1:9001'),
    /Entity configuration fetch failed: 404 Not Found/i,
  );

  global.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    text: async () => 'not-a-jwt',
    json: async () => ({}),
  });
  await assert.rejects(
    () => resolveOpenIdProviderDirect('http://127.0.0.1:9002'),
    /Failed to decode JWT/i,
  );
  global.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    text: async () => {
      const notJsonPayload = Buffer.from('not-json', 'utf8').toString('base64url');
      return 'header.' + notJsonPayload + '.sig';
    },
    json: async () => ({}),
  });
  await assert.rejects(
    () => resolveOpenIdProviderDirect('http://127.0.0.1:9003'),
    /Failed to decode JWT/i,
  );
  global.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    text: async () => makeUnsignedJwt({ metadata: { openid_provider: { issuer: validOpMetadata.issuer } } }),
    json: async () => ({}),
  });
  await assert.rejects(
    () => resolveOpenIdProviderDirect('http://127.0.0.1:9004'),
    /Entity configuration missing required OP metadata/i,
  );

  console.log('E2E_RESOLVER_EDGE_OK');
} finally {
  global.fetch = originalFetch;
  process.env.NODE_ENV = originalNodeEnv;
  if (originalTrustAnchorEntityId === undefined) delete process.env.FEDERATION_TRUST_ANCHOR_ENTITY_ID;
  else process.env.FEDERATION_TRUST_ANCHOR_ENTITY_ID = originalTrustAnchorEntityId;
  if (originalTrustAnchorResolveEndpoint === undefined) delete process.env.FEDERATION_TRUST_ANCHOR_RESOLVE_ENDPOINT;
  else process.env.FEDERATION_TRUST_ANCHOR_RESOLVE_ENDPOINT = originalTrustAnchorResolveEndpoint;
  if (originalFederationEntityId === undefined) delete process.env.FEDERATION_ENTITY_ID;
  else process.env.FEDERATION_ENTITY_ID = originalFederationEntityId;
}
`;

  const resolverEdgeRun = await runServerScript(resolverEdgeScript, {
    NODE_ENV: "development",
    TOKEN_ENCRYPTION_KEY: tokenEncryptionKey,
  });
  assert.equal(
    resolverEdgeRun.code,
    0,
    `resolver edge script failed\\n${resolverEdgeRun.output}`,
  );
  assert.match(
    resolverEdgeRun.output,
    /E2E_RESOLVER_EDGE_OK/,
    `resolver edge marker missing\\n${resolverEdgeRun.output}`,
  );
});
