import type { Request } from 'express';
import pkg from 'ipaddr.js';
const { isValid, parse } = pkg;

import pinoLogger from '../logger/pino.ts';
const ipLog = pinoLogger.child({ component: 'ip-utils' });

const normalizeIp = (ip: string): string =>
  ip.toLowerCase().startsWith('::ffff:') ? ip.slice(7) : ip;

export function isLocalIp(req: Request): boolean {
  const raw = req.ip || req.socket.remoteAddress || '';
  ipLog.debug('[isLocalIp] raw', { raw });
    const ip = normalizeIp(raw);
  ipLog.debug('[isLocalIp] normalized', { ip });
  console.log('[IP DEBUG] [isLocalIp] normalized:', ip);
  if (!isValid(ip)) {
    ipLog.warn('[isLocalIp] Not valid', { ip });
    console.log('[IP DEBUG] [isLocalIp] Not valid:', ip);
    return false;
  }
  const range = parse(ip).range();
  ipLog.debug('[isLocalIp] range', { ip, range });
  console.log('[IP DEBUG] [isLocalIp] range:', range);
  const result = (
    ['loopback', 'private', 'uniqueLocal', 'linkLocal', 'ipv4Mapped'].includes(range)
  );
  ipLog.info('[isLocalIp] result', { ip, range, result });
  console.log('[IP DEBUG] [isLocalIp] result:', result);
  return result;
}

export function isProxy(req: Request): boolean {
  const headers = [
    'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host', 'x-forwarded-port',
    'x-real-ip', 'forwarded', 'cf-connecting-ip', 'true-client-ip', 'fastly-client-ip',
    'x-client-ip', 'x-cluster-client-ip', 'x-original-forwarded-for', 'x-remote-addr',
    'x-proxyuser-ip'
  ];
  const found = headers.filter(h => req.headers[h] !== undefined);
  ipLog.debug('[isProxy] headers found', { found });
  console.log('[IP DEBUG] [isProxy] headers found:', found);
  return found.length > 0;
}

export function ipPublic(req: Request): string | null {
  const hdr = req.headers['x-forwarded-for'];
  ipLog.debug('[ipPublic] x-forwarded-for header', { hdr });
  console.log('[IP DEBUG] [ipPublic] x-forwarded-for header:', hdr);
  const list =
    typeof hdr === 'string'
      ? hdr.split(',')
      : Array.isArray(hdr)
        ? hdr.flatMap(h => h.split(','))
        : [];
  ipLog.debug('[ipPublic] parsed forwarded list', { list });
  console.log('[IP DEBUG] [ipPublic] parsed forwarded list:', list);
  for (const entry of list) {
    const ip = normalizeIp(entry.trim());
    ipLog.debug('[ipPublic] checking forwarded entry', { entry, ip });
    console.log('[IP DEBUG] [ipPublic] checking forwarded entry:', entry, ip);
    if (isValid(ip) && parse(ip).range() === 'unicast') {
      ipLog.info('[ipPublic] public IP found (header)', { ip });
      console.log('[IP DEBUG] [ipPublic] public IP found (header):', ip);
      return ip;
    }
  }
  const raw = req.socket.remoteAddress;
  ipLog.debug('[ipPublic] socket.remoteAddress', { raw });
  console.log('[IP DEBUG] [ipPublic] socket.remoteAddress:', raw);
  if (raw) {
    const ip = normalizeIp(raw);
    if (isValid(ip) && parse(ip).range() === 'unicast') {
      ipLog.info('[ipPublic] public IP found (socket)', { ip });
      console.log('[IP DEBUG] [ipPublic] public IP found (socket):', ip);
      return ip;
    }
  }
  ipLog.info('[ipPublic] No public IP found');
  console.log('[IP DEBUG] [ipPublic] No public IP found');
  return null;
}

export function ipPrivate(req: Request): string | null {
  const raw = req.socket.remoteAddress || null;
  ipLog.debug('[ipPrivate] remoteAddress', { raw });
  console.log('[IP DEBUG] [ipPrivate] remoteAddress:', raw);
  if (!raw) {
    ipLog.warn('[ipPrivate] No remoteAddress found');
    console.log('[IP DEBUG] [ipPrivate] No remoteAddress found');
    return null;
  }
  const ip = normalizeIp(raw);
  ipLog.debug('[ipPrivate] normalized', { ip });
  console.log('[IP DEBUG] [ipPrivate] normalized:', ip);
  if (!isValid(ip)) {
    ipLog.warn('[ipPrivate] Not valid', { ip });
    console.log('[IP DEBUG] [ipPrivate] Not valid:', ip);
    return null;
  }
  const range = parse(ip).range();
  ipLog.debug('[ipPrivate] range', { ip, range });
  console.log('[IP DEBUG] [ipPrivate] range:', range);
  if (['loopback', 'private', 'uniqueLocal', 'linkLocal',"loopback", 'ipv4Mapped'].includes(range)) {
    ipLog.info('[ipPrivate] Private IP detected', { ip, range });
    console.log('[IP DEBUG] [ipPrivate] Private IP detected:', ip, range);
    return ip;
  } else {
    ipLog.info('[ipPrivate] Public IP detected', { ip, range });
    console.log('[IP DEBUG] [ipPrivate] Public IP detected:', ip, range);
    return null;
  }
}

export function isPrivateIp(ip: string): boolean {
  const normalized = normalizeIp(ip);
  ipLog.debug('[isPrivateIp] normalized', { ip, normalized });
  console.log('[IP DEBUG] [isPrivateIp] normalized:', normalized);
  if (!isValid(normalized)) {
    ipLog.warn('[isPrivateIp] Not valid', { normalized });
    console.log('[IP DEBUG] [isPrivateIp] Not valid:', normalized);
    return false;
  }
  const range = parse(normalized).range();
  ipLog.debug('[isPrivateIp] range', { normalized, range });
  console.log('[IP DEBUG] [isPrivateIp] range:', range);
  const result = ['loopback', 'private', 'uniqueLocal', 'linkLocal', 'ipv4Mapped'].includes(range);
  ipLog.info('[isPrivateIp] result', { normalized, range, result });
  console.log('[IP DEBUG] [isPrivateIp] result:', result);
  return result;
}

export function isPublicIp(ip: string): boolean {
  const normalized = normalizeIp(ip);
  ipLog.debug('[isPublicIp] normalized', { ip, normalized });
  console.log('[IP DEBUG] [isPublicIp] normalized:', normalized);
  if (!isValid(normalized)) {
    ipLog.warn('[isPublicIp] Not valid', { normalized });
    console.log('[IP DEBUG] [isPublicIp] Not valid:', normalized);
    return false;
  }
  const range = parse(normalized).range();
  ipLog.debug('[isPublicIp] range', { normalized, range });
  console.log('[IP DEBUG] [isPublicIp] range:', range);
  const result = range === 'unicast';
  ipLog.info('[isPublicIp] result', { normalized, range, result });
  console.log('[IP DEBUG] [isPublicIp] result:', result);
  return result;
}

export function isLoopbackIp(ip: string): boolean {
  const normalized = normalizeIp(ip);
  ipLog.debug('[isLoopbackIp] normalized', { ip, normalized });
  console.log('[IP DEBUG] [isLoopbackIp] normalized:', normalized);
  if (!isValid(normalized)) {
    ipLog.warn('[isLoopbackIp] Not valid', { normalized });
    console.log('[IP DEBUG] [isLoopbackIp] Not valid:', normalized);
    return false;
  }
  const range = parse(normalized).range();
  ipLog.debug('[isLoopbackIp] range', { normalized, range });
  console.log('[IP DEBUG] [isLoopbackIp] range:', range);
  const result = range === 'loopback';
  ipLog.info('[isLoopbackIp] result', { normalized, range, result });
  console.log('[IP DEBUG] [isLoopbackIp] result:', result);
  return result;
}

export function isValidIpv4(ip: string): boolean {
  const normalized = normalizeIp(ip);
  ipLog.debug('[isValidIpv4] normalized', { ip, normalized });
  console.log('[IP DEBUG] [isValidIpv4] normalized:', normalized);
  const valid = isValid(normalized) && parse(normalized).kind() === 'ipv4';
  ipLog.info('[isValidIpv4] result', { normalized, valid });
  console.log('[IP DEBUG] [isValidIpv4] result:', valid);
  return valid;
}

export function isValidIpv6(ip: string): boolean {
  const normalized = normalizeIp(ip);
  ipLog.debug('[isValidIpv6] normalized', { ip, normalized });
  console.log('[IP DEBUG] [isValidIpv6] normalized:', normalized);
  const valid = isValid(normalized) && parse(normalized).kind() === 'ipv6';
  ipLog.info('[isValidIpv6] result', { normalized, valid });
  console.log('[IP DEBUG] [isValidIpv6] result:', valid);
  return valid;
}
