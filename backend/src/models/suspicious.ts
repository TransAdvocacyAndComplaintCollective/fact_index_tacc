
import pkg from "express";

type NextFunction = pkg. NextFunction;
type Response = pkg. Response;
type Request = pkg. Request;
/**
 * Duration (in milliseconds) that a suspicious IP remains blocked.
 * Currently set to 10 minutes.
 */
const BLOCK_DURATION_MS: number = 10 * 60 * 1000;

/**
 * In‑memory map of blocked IPs and the time (epoch ms) until which they remain blocked.
 *
 * NOTE: If you are running your app in a clustered environment (multiple Node
 * processes or containers), move this to a shared store (e.g. Redis) so that
 * blocks are recognised across instances.
 */
const blockedIps: Record<string, number> = {};

// ───────────────────────────────────────────────────────────────────────────────
// Utilities
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Periodically clean up expired IP blocks.
 */
function cleanupBlockedIps(): void {
  const now = Date.now();
  for (const ip in blockedIps) {
    if (blockedIps[ip] < now) delete blockedIps[ip];
  }
}

// Run every minute.
setInterval(cleanupBlockedIps, 60 * 1000);

/**
 * Block (or re‑block) an IP address.
 * @param ip – The IP address to block.
 * @param durationMs – How long to block the IP, defaults to `BLOCK_DURATION_MS`.
 */
function blockIp(ip: string, durationMs: number = BLOCK_DURATION_MS): void {
  blockedIps[ip] = Date.now() + durationMs;
}

/**
 * Check whether an IP address is currently blocked.
 */
function isIpBlocked(ip: string): boolean {
  return blockedIps[ip] !== undefined && blockedIps[ip] > Date.now();
}

/**
 * Log any suspicious activity that passes through the middleware.
 * Replace this with your own logging solution (Winston, Bunyan, Datadog…)
 * as appropriate for production.
 */
function logSuspiciousActivity(
  type: string,
  req: Request,
  ip: string,
  extra: Record<string, unknown> = {}
): void {
  const info = {
    time: new Date().toISOString(),
    type,
    ip,
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    query: req.query,
    body: req.body,
    userAgent: req.get("user-agent") ?? "",
    referrer: req.get("referer") ?? req.get("referrer") ?? "",
    cookies: req.headers.cookie ?? "",
    headers: { ...req.headers },
    ...extra,
  };

  // For demonstration we'll just output to the console.
  // eslint-disable-next-line no-console
  console.warn("[SECURITY]", JSON.stringify(info));
}

// ───────────────────────────────────────────────────────────────────────────────
// Regular‑expression patterns for common attack vectors
// ───────────────────────────────────────────────────────────────────────────────

const suspiciousCmsPaths: string[] = [
  "/wp-login.php",
  "/xmlrpc.php",
  "/wp-admin",
  "/wp-content",
  "/user/login",
  "/admin",
  "/joomla",
  "/administrator",
];

const suspiciousSqli: RegExp[] = [
  /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b)/i,
  /('|--|;|#|\/\*)/,
  /\.\.\/|\.\.\\|etc\/passwd|boot\.ini/i,
];

const suspiciousXss: RegExp[] = [
  /<script\b/i,
  /onerror\s*=\s*/i,
  /alert\s*\(/i,
  /javascript:/i,
];

// ───────────────────────────────────────────────────────────────────────────────
// Express middleware
// ───────────────────────────────────────────────────────────────────────────────

function securityMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Determine the client's IP address (respecting trusted proxy headers).
  const ip: string =
    (typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"].split(",")[0].trim() : undefined) ||
    req.ip ||
    req.connection.remoteAddress ||
    "";

  // If the IP is already blocked, verify whether the new request is also suspicious; reset block duration if so.
  if (isIpBlocked(ip)) {
    const urlToCheck = `${req.originalUrl}${JSON.stringify(req.query ?? {})}${JSON.stringify(req.body ?? {})}`;

    // Repeat checks for previously blocked IPs.
    const isSuspicious =
      suspiciousSqli.some((p) => p.test(urlToCheck)) ||
      suspiciousXss.some((p) => p.test(urlToCheck)) ||
      (req.method === "POST" &&
        (/\.php|\.asp|\.jsp$/i.test(req.originalUrl) ||
          /\.(jpg|jpeg|png|gif|svg|webp)\.[a-z]{2,5}$/i.test(req.originalUrl) ||
          (/\/uploads?\/|\/files?\/|\/tmp\//i.test(req.originalUrl) &&
            /\.(php|exe|sh|bat|cmd|pl|py|cgi)$/i.test(req.originalUrl))));

    if (isSuspicious) {
      blockIp(ip); // Reset timer
      logSuspiciousActivity(
        "Blocked IP, repeat suspicious activity resets block time",
        req,
        ip
      );
    } else {
      logSuspiciousActivity(
        "IP blocked",
        req,
        ip,
        { reason: "Previously flagged as suspicious" }
      );
    }

    res.status(429).send("Too many suspicious requests, try again later.");
    return; // Stop processing.
  }

  // ── Checks for fresh requests ────────────────────────────────────────────────

  // 1. CMS endpoint probes
  if (suspiciousCmsPaths.some((p) => req.path.toLowerCase().startsWith(p))) {
    logSuspiciousActivity("CMS path probe", req, ip);
    res.status(404).send("Not found");
    return;
  }

  // Prepare concatenated string for regex checks.
  const urlToCheck = `${req.originalUrl}${JSON.stringify(req.query ?? {})}${JSON.stringify(req.body ?? {})}`;

  // 2. SQLi / directory traversal patterns
  if (suspiciousSqli.some((p) => p.test(urlToCheck))) {
    logSuspiciousActivity("SQLi/traversal", req, ip);
    blockIp(ip);
    res.status(404).send("Not found");
    return;
  }

  // 3. XSS probes
  if (suspiciousXss.some((p) => p.test(urlToCheck))) {
    logSuspiciousActivity("XSS probe", req, ip);
    blockIp(ip);
    res.status(404).send("Not found");
    return;
  }

  // 4. Suspicious uploads (e.g. web‑shell attempts)
  const isSuspiciousUpload =
    req.method === "POST" &&
    (/\.php|\.asp|\.jsp$/i.test(req.originalUrl) ||
      /\.(jpg|jpeg|png|gif|svg|webp)\.[a-z]{2,5}$/i.test(req.originalUrl) ||
      (/\/uploads?\/|\/files?\/|\/tmp\//i.test(req.originalUrl) &&
        /\.(php|exe|sh|bat|cmd|pl|py|cgi)$/i.test(req.originalUrl)));

  if (isSuspiciousUpload) {
    logSuspiciousActivity("Suspicious upload", req, ip);
    blockIp(ip);
    res.status(404).send("Not found");
    return;
  }

  // All good – continue down the middleware chain.
  next();
}

export { securityMiddleware }
