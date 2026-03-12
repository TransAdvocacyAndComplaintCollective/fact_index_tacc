import { spawn } from "node:child_process";

export async function waitForHttp(url, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export function terminateProcess(child) {
  return new Promise((resolve) => {
    if (!child) return resolve();
    if (child.exitCode !== null || child.signalCode !== null || child.killed) return resolve();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    child.once("exit", finish);

    const killTarget = child.pid;
    const killSafely = (signal) => {
      if (!killTarget) return;
      try {
        process.kill(killTarget, signal);
      } catch {
        // process already gone
      }
    };

    const gracefulTimeout = 3000;
    const forceTimeout = 2000;

    killSafely("SIGTERM");
    setTimeout(() => {
      if (child.exitCode !== null || child.signalCode !== null) {
        finish();
        return;
      }
      killSafely("SIGKILL");
      setTimeout(() => {
        finish();
      }, forceTimeout);
    }, gracefulTimeout);
  });
}

export function startProcess(cmd, args, options = {}) {
  const detached = options.detached ?? false;
  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached,
    ...options,
  });

  let output = "";
  child.stdout?.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    output += String(chunk);
  });

  return {
    child,
    getOutput: () => output,
  };
}

export function runCommand(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const { child, getOutput } = startProcess(cmd, args, options);
    child.once("error", (err) => {
      resolve({
        code: 1,
        output: `${getOutput()}\n${String(err)}`,
      });
    });
    child.on("exit", (code) => {
      resolve({
        code: code ?? 1,
        output: getOutput(),
      });
    });
  });
}
