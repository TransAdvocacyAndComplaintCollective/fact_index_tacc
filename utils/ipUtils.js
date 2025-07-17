// ./lib/network.js
import ipaddr from 'ipaddr.js';

/**
 * Normalize IP string:
 * - Remove IPv4-mapped IPv6 prefix "::ffff:" if present
 * - Return as-is otherwise
 * @param {string} ipStr
 * @returns {string}
 */
function normalizeIp(ipStr) {
  if (!ipStr) return '';
  if (ipStr.startsWith('::ffff:')) return ipStr.slice(7);
  return ipStr;
}

/**
 * Check if the given IP address is local (loopback or private)
 * Supports both IPv4 and IPv6.
 * @param {object} req - Express request object
 * @returns {boolean}
 */
export function isLocalIp(req) {
  let ipStr = req.ip || req.connection?.remoteAddress || '';
  ipStr = normalizeIp(ipStr);

  if (!ipaddr.isValid(ipStr)) return false;

  const addr = ipaddr.parse(ipStr);

  // Loopback check
  if (addr.range() === 'loopback') return true;

  // Private IP check (IPv4 private or IPv6 unique local address)
  if (addr.range() === 'private') return true;

  // Additional check for IPv4 127.0.0.0/8 range (just in case)
  if (addr.kind() === 'ipv4' && ipStr.startsWith('127.')) return true;

  return false;
}

/**
 * Checks if the request came through a proxy by inspecting common proxy headers.
 * @param {object} req - Express request object
 * @returns {boolean}
 */
export function isProxy(req) {
  const proxyHeaders = [
    'x-forwarded-for',
    'x-forwarded-proto',
    'x-forwarded-host',
    'x-forwarded-port',
    'x-real-ip',
    'forwarded',
    'cf-connecting-ip',
    'true-client-ip',
    'fastly-client-ip',
    'x-client-ip',
    'x-cluster-client-ip',
    'x-original-forwarded-for',
    'x-remote-addr',
    'x-proxyuser-ip',
  ];
  return proxyHeaders.some(header => header in req.headers);
}

/**
 * Retrieves the public IP address of the client, preferring the first IP in
 * 'x-forwarded-for' if available, else falling back to connection info.
 * Returns null if IP is invalid.
 * @param {object} req - Express request object
 * @returns {string|null}
 */
export function ipPublic(req) {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (typeof xForwardedFor === 'string') {
    const ips = xForwardedFor.split(',').map(ip => ip.trim());
    for (const ipStr of ips) {
      if (ipaddr.isValid(ipStr)) {
        return normalizeIp(ipStr);
      }
    }
  }

  const fallbackIp = req.connection?.remoteAddress || req.socket?.remoteAddress || null;
  if (fallbackIp && ipaddr.isValid(normalizeIp(fallbackIp))) {
    return normalizeIp(fallbackIp);
  }
  return null;
}

/**
 * Retrieves the private IP address of the client (typically connection IP).
 * Returns null if IP is invalid.
 * @param {object} req - Express request object
 * @returns {string|null}
 */
export function ipPrivate(req) {
  const ipStrRaw = req.connection?.remoteAddress || req.socket?.remoteAddress || null;
  if (!ipStrRaw) return null;

  const ipStr = normalizeIp(ipStrRaw);
  if (!ipaddr.isValid(ipStr)) return null;

  return ipStr;
}

/**
 * Check if the given IP address (string) is private.
 * @param {string} ipStr
 * @returns {boolean}
 */
export function isPrivateIp(ipStr) {
  if (!ipStr || !ipaddr.isValid(ipStr)) return false;

  const addr = ipaddr.parse(ipStr);
  return addr.range() === 'private';
}

/**
 * Check if the given IP address (string) is public.
 * @param {string} ipStr
 * @returns {boolean}
 */
export function isPublicIp(ipStr) {
  if (!ipStr || !ipaddr.isValid(ipStr)) return false;

  const addr = ipaddr.parse(ipStr);
  return addr.range() === 'unicast' || addr.range() === 'global';
}

/**
 * Check if the given IP address (string) is loopback.
 * @param {string} ipStr
 * @returns {boolean}
 */
export function isLoopbackIp(ipStr) {
  if (!ipStr || !ipaddr.isValid(ipStr)) return false;

  const addr = ipaddr.parse(ipStr);
  return addr.range() === 'loopback';
}

/**
 * Check if the given IP address (string) is a valid IPv4 address.
 * @param {string} ipStr
 * @returns {boolean}
 */
export function isValidIpv4(ipStr) {
  if (!ipStr || !ipaddr.isValid(ipStr)) return false;

  const addr = ipaddr.parse(ipStr);
  return addr.kind() === 'ipv4';
}
/**
 * Check if the given IP address (string) is a valid IPv6 address.
 * @param {string} ipStr
 * @returns {boolean}
 */
export function isValidIpv6(ipStr) {
  if (!ipStr || !ipaddr.isValid(ipStr)) return false;

  const addr = ipaddr.parse(ipStr);
  return addr.kind() === 'ipv6';
}