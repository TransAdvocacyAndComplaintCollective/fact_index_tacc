import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { runCommand, startProcess, terminateProcess, waitForHttp } from "./helpers.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const clientRoot = path.join(repoRoot, "apps", "fact-index");

async function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate preview port")));
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

test("client e2e: build and preview routes", async (t) => {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const build = await runCommand(
    "pnpm",
    ["exec", "vite", "build", "--config", "vite.config.js"],
    { cwd: clientRoot, env: { ...process.env } },
  );

  assert.equal(build.code, 0, `Client build failed\n${build.output}`);

  const { child, getOutput } = startProcess(
    "pnpm",
    ["exec", "vite", "preview", "--config", "vite.config.js", "--host", "127.0.0.1", "--port", String(port)],
    { cwd: clientRoot, env: { ...process.env } },
  );

  t.after(async () => {
    await terminateProcess(child);
  });

  await waitForHttp(`${baseUrl}/`);

  const home = await fetchWithTimeout(`${baseUrl}/`);
  assert.equal(home.status, 200, `Expected home page 200\n${getOutput()}`);
  const homeHtml = await home.text();
  assert.match(homeHtml, /id=\"root\"/, "Expected root mount in homepage");

  const login = await fetchWithTimeout(`${baseUrl}/login`);
  assert.equal(login.status, 200, `Expected /login 200\n${getOutput()}`);

  const callback = await fetchWithTimeout(`${baseUrl}/oidc/callback`);
  assert.equal(callback.status, 200, `Expected /oidc/callback 200\n${getOutput()}`);
});
