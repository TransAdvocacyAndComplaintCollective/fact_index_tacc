import type { Request } from 'express';
import pkg from 'ipaddr.js';
const { isValid, parse } = pkg;

import pinoLogger from '../logger/pino.js';
const ipLog = pinoLogger.child({ component: 'ip-utils' });

const normalizeIp = (ip: string): string =>
  ip.toLowerCase().startsWith('::ffff:') ? ip.slice(7) : ip;

export function isLocalIp(req: Request): boolean {
  const raw = req.ip || req.socket.remoteAddress || '';
  ipLog.debug({ raw }, '[isLocalIp] raw');
    const ip = normalizeIp(raw);
  ipLog.debug({ ip }, '[isLocalIp] normalized');
  console.log('[IP DEBUG] [isLocalIp] normalized:', ip);
  if (!isValid(ip)) {
    ipLog.warn({ ip }, '[isLocalIp] Not valid');
    console.log('[IP DEBUG] [isLocalIp] Not valid:', ip);
    return false;
  }
  const range = parse(ip).range();
  ipLog.debug({ ip, range }, '[isLocalIp] range');
  console.log('[IP DEBUG] [isLocalIp] range:', range);
  const result = (
    ['loopback', 'private', 'uniqueLocal', 'linkLocal', 'ipv4Mapped'].includes(range)
  );
  ipLog.info({ ip, range, result }, '[isLocalIp] result');
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
  ipLog.debug({ found }, '[isProxy] headers found');
  console.log('[IP DEBUG] [isProxy] headers found:', found);
  return found.length > 0;
}

export function ipPublic(req: Request): true | false  {
  const hdr = req.headers['x-forwarded-for'];
  ipLog.debug({ hdr }, '[ipPublic] x-forwarded-for header');
  console.log('[IP DEBUG] [ipPublic] x-forwarded-for header:', hdr);
  const list =
    typeof hdr === 'string'
      ? hdr.split(',')
      : Array.isArray(hdr)
        ? hdr.flatMap(h => h.split(','))
        : [];
  ipLog.debug({ list }, '[ipPublic] parsed forwarded list');
  console.log('[IP DEBUG] [ipPublic] parsed forwarded list:', list);
  for (const entry of list) {
    const ip = normalizeIp(entry.trim());
    ipLog.debug({ entry, ip }, '[ipPublic] checking forwarded entry');
    console.log('[IP DEBUG] [ipPublic] checking forwarded entry:', entry, ip);
    if (isValid(ip) && parse(ip).range() === 'unicast') {
      ipLog.info({ ip }, '[ipPublic] public IP found (header)');
      console.log('[IP DEBUG] [ipPublic] public IP found (header):', ip);
      return true;
    }
  }
  const raw = req.socket.remoteAddress;
  ipLog.debug({ raw }, '[ipPublic] socket.remoteAddress');
  console.log('[IP DEBUG] [ipPublic] socket.remoteAddress:', raw);
  if (raw) {
    const ip = normalizeIp(raw);
    if (isValid(ip) && parse(ip).range() === 'unicast') {
      ipLog.info({ ip }, '[ipPublic] public IP found (socket)');
      console.log('[IP DEBUG] [ipPublic] public IP found (socket):', ip);
      return Boolean(ip);
    }
  }
  ipLog.info('[ipPublic] No public IP found');
  console.log('[IP DEBUG] [ipPublic] No public IP found');
  return false;
}

export function ipPrivate(req: Request): boolean {
  
  const raw = req.socket.remoteAddress || null;
  ipLog.debug({ raw }, '[ipPrivate] remoteAddress');
  console.log('[IP DEBUG] [ipPrivate] remoteAddress:', raw);
  if (!raw) {
    ipLog.warn('[ipPrivate] No remoteAddress found');
    console.log('[IP DEBUG] [ipPrivate] No remoteAddress found');
    return false;
  }
  const ip = normalizeIp(raw);
  ipLog.debug({ ip }, '[ipPrivate] normalized');
  console.log('[IP DEBUG] [ipPrivate] normalized:', ip);
  if (!isValid(ip)) {
    ipLog.warn({ ip }, '[ipPrivate] Not valid');
    console.log('[IP DEBUG] [ipPrivate] Not valid:', ip);
    return false;
  }
  const range = parse(ip).range();
  ipLog.debug({ ip, range }, '[ipPrivate] range');
  console.log('[IP DEBUG] [ipPrivate] range:', range);
  if (['loopback', 'private', 'uniqueLocal', 'linkLocal',"loopback", 'ipv4Mapped'].includes(range)) {
    ipLog.info({ ip, range }, '[ipPrivate] Private IP detected');
    console.log('[IP DEBUG] [ipPrivate] Private IP detected:', ip, range);
    return  Boolean(ip);;
  } else {
    ipLog.info({ ip, range }, '[ipPrivate] Public IP detected');
    console.log('[IP DEBUG] [ipPrivate] Public IP detected:', ip, range);
    return false;
  }
}

export function isPrivateIp(ip: string): boolean {
  const normalized = normalizeIp(ip);
  ipLog.debug({ ip, normalized }, '[isPrivateIp] normalized');
  console.log('[IP DEBUG] [isPrivateIp] normalized:', normalized);
  if (!isValid(normalized)) {
    ipLog.warn({ normalized }, '[isPrivateIp] Not valid');
    console.log('[IP DEBUG] [isPrivateIp] Not valid:', normalized);
    return false;
  }
  const range = parse(normalized).range();
  ipLog.debug({ normalized, range }, '[isPrivateIp] range');
  console.log('[IP DEBUG] [isPrivateIp] range:', range);
  const result = ['loopback', 'private', 'uniqueLocal', 'linkLocal', 'ipv4Mapped'].includes(range);
  ipLog.info({ normalized, range, result }, '[isPrivateIp] result');
  console.log('[IP DEBUG] [isPrivateIp] result:', result);
  return result;
}

export function isPublicIp(ip: string): boolean {
  const normalized = normalizeIp(ip);
  ipLog.debug({ ip, normalized }, '[isPublicIp] normalized');
  console.log('[IP DEBUG] [isPublicIp] normalized:', normalized);
  if (!isValid(normalized)) {
    ipLog.warn({ normalized }, '[isPublicIp] Not valid');
    console.log('[IP DEBUG] [isPublicIp] Not valid:', normalized);
    return false;
  }
  const range = parse(normalized).range();
  ipLog.debug({ normalized, range }, '[isPublicIp] range');
  console.log('[IP DEBUG] [isPublicIp] range:', range);
  const result = range === 'unicast';
  ipLog.info({ normalized, range, result }, '[isPublicIp] result');
  console.log('[IP DEBUG] [isPublicIp] result:', result);
  return result;
}

export function isLoopbackIp(ip: string): boolean {
  const normalized = normalizeIp(ip);
  ipLog.debug({ ip, normalized }, '[isLoopbackIp] normalized');
  console.log('[IP DEBUG] [isLoopbackIp] normalized:', normalized);
  if (!isValid(normalized)) {
    ipLog.warn({ normalized }, '[isLoopbackIp] Not valid');
    console.log('[IP DEBUG] [isLoopbackIp] Not valid:', normalized);
    return false;
  }
  const range = parse(normalized).range();
  ipLog.debug({ normalized, range }, '[isLoopbackIp] range');
  console.log('[IP DEBUG] [isLoopbackIp] range:', range);
  const result = range === 'loopback';
  ipLog.info({ normalized, range, result }, '[isLoopbackIp] result');
  console.log('[IP DEBUG] [isLoopbackIp] result:', result);
  return result;
}

export function isValidIpv4(ip: string): boolean {
  const normalized = normalizeIp(ip);
  ipLog.debug({ ip, normalized }, '[isValidIpv4] normalized');
  console.log('[IP DEBUG] [isValidIpv4] normalized:', normalized);
  const valid = isValid(normalized) && parse(normalized).kind() === 'ipv4';
  ipLog.info({ normalized, valid }, '[isValidIpv4] result');
  console.log('[IP DEBUG] [isValidIpv4] result:', valid);
  return valid;
}

export function isValidIpv6(ip: string): boolean {
  const normalized = normalizeIp(ip);
  ipLog.debug({ ip, normalized }, '[isValidIpv6] normalized');
  console.log('[IP DEBUG] [isValidIpv6] normalized:', normalized);
  const valid = isValid(normalized) && parse(normalized).kind() === 'ipv6';
  ipLog.info({ normalized, valid }, '[isValidIpv6] result');
  console.log('[IP DEBUG] [isValidIpv6] result:', valid);
  return valid;
}
