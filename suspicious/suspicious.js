const BLOCK_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const blockedIps = {};

// Utility: Clean up expired blocks occasionally
function cleanupBlockedIps() {
  const now = Date.now();
  for (const ip in blockedIps) {
    if (blockedIps[ip] < now) delete blockedIps[ip];
  }
}
setInterval(cleanupBlockedIps, 60 * 1000);

// Utility to block an IP (will also update time if already blocked)
function blockIp(ip, durationMs = BLOCK_DURATION_MS) {
  blockedIps[ip] = Date.now() + durationMs;
}

// Utility to check if IP is blocked
function isIpBlocked(ip) {
  return blockedIps[ip] && blockedIps[ip] > Date.now();
}

// Utility to log suspicious request attempts
function logSuspiciousActivity(type, req, ip, extra = {}) {
  const info = {
    time: new Date().toISOString(),
    type,
    ip,
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    query: req.query,
    body: req.body,
    userAgent: req.get('user-agent') || '',
    referrer: req.get('referer') || req.get('referrer') || '',
    cookies: req.headers.cookie || '',
    headers: {
      ...req.headers,
    },
    ...extra,
  };
  console.warn(`[${info.time}] Blocked ${type}: ${info.method} ${info.url} from ${info.ip} - UA: "${info.userAgent}" Ref: "${info.referrer}"`);
}

// Express middleware
function securityMiddleware(req, res, next) {
  // Get IP (X-Forwarded-For or remote address)
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || req.connection.remoteAddress;

  // If IP is already blocked, check for more suspicious behavior
  if (isIpBlocked(ip)) {
    // **If this new request is also suspicious, reset block time!**
    // We will check all suspicious patterns again for blocked IPs, and if matched, reset timer.
    const urlToCheck = req.originalUrl + JSON.stringify(req.query || {}) + JSON.stringify(req.body || {});

    const suspiciousSqli = [
      /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b)/i,
      /('|--|;|#|\/\*)/,
      /\.\.\/|\.\.\\|etc\/passwd|boot\.ini/i
    ];
    const suspiciousXss = [
      /<script\b/i, /onerror\s*=/i, /alert\s*\(/i, /javascript:/i
    ];
    const isSuspicious =
      suspiciousSqli.some(pattern => pattern.test(urlToCheck)) ||
      suspiciousXss.some(pattern => pattern.test(urlToCheck)) ||
      (
        req.method === 'POST' &&
        (
          /(\.php|\.asp|\.jsp)$/i.test(req.originalUrl) ||
          /\.(jpg|jpeg|png|gif|svg|webp)\.[a-z]{2,5}$/i.test(req.originalUrl) ||
          (/\/uploads?\/|\/files?\/|\/tmp\//i.test(req.originalUrl) &&
            /\.(php|exe|sh|bat|cmd|pl|py|cgi)$/i.test(req.originalUrl))
        )
      );

    if (isSuspicious) {
      blockIp(ip); // <-- this resets the timer
      logSuspiciousActivity('Blocked IP, repeat suspicious activity resets block time', req, ip);
    } else {
      logSuspiciousActivity('IP blocked', req, ip, { reason: 'Previously flagged as suspicious' });
    }
    return res.status(429).send('Too many suspicious requests, try again later.');
  }

  // Proceed with regular suspicious activity checks for non-blocked IPs
  const suspiciousCmsPaths = [
    '/wp-login.php', '/xmlrpc.php', '/wp-admin', '/wp-content',
    '/user/login', '/admin', '/joomla', '/administrator'
  ];
  if (suspiciousCmsPaths.some(p => req.path.toLowerCase().startsWith(p))) {
    logSuspiciousActivity('CMS path probe', req, ip);
    return res.status(404).send('Not found');
  }

  const suspiciousSqli = [
    /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b)/i,
    /('|--|;|#|\/\*)/,
    /\.\.\/|\.\.\\|etc\/passwd|boot\.ini/i
  ];
  const urlToCheck = req.originalUrl + JSON.stringify(req.query || {}) + JSON.stringify(req.body || {});
  if (suspiciousSqli.some(pattern => pattern.test(urlToCheck))) {
    logSuspiciousActivity('SQLi/traversal', req, ip);
    blockIp(ip);  // Block and set time (or reset if already blocked)
    return res.status(404).send('Not found');
  }

  const suspiciousXss = [
    /<script\b/i, /onerror\s*=/i, /alert\s*\(/i, /javascript:/i
  ];
  if (suspiciousXss.some(pattern => pattern.test(urlToCheck))) {
    logSuspiciousActivity('XSS probe', req, ip);
    blockIp(ip);
    return res.status(404).send('Not found');
  }

  if (
    req.method === 'POST' &&
    (
      /(\.php|\.asp|\.jsp)$/i.test(req.originalUrl) ||
      /\.(jpg|jpeg|png|gif|svg|webp)\.[a-z]{2,5}$/i.test(req.originalUrl) ||
      (/\/uploads?\/|\/files?\/|\/tmp\//i.test(req.originalUrl) &&
        /\.(php|exe|sh|bat|cmd|pl|py|cgi)$/i.test(req.originalUrl))
    )
  ) {
    logSuspiciousActivity('suspicious upload', req, ip);
    blockIp(ip);
    return res.status(404).send('Not found');
  }

  next();
}

export { securityMiddleware };
