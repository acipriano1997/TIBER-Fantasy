import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const PERSONAL_USER_COOKIE = 'tiber_personal_user_v1';
export const LEGACY_DEFAULT_USER_ID = 'default_user';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

type PersonalUserScopeOptions = {
  cookieName?: string;
  idFactory?: () => string;
};

function parseCookies(rawCookieHeader?: string): Record<string, string> {
  if (!rawCookieHeader) return {};
  return rawCookieHeader.split(';').reduce<Record<string, string>>((cookies, entry) => {
    const separator = entry.indexOf('=');
    if (separator <= 0) return cookies;
    const key = entry.slice(0, separator).trim();
    const rawValue = entry.slice(separator + 1).trim();
    if (!key) return cookies;
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
    return cookies;
  }, {});
}

function isUsableUserId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value !== LEGACY_DEFAULT_USER_ID;
}

function appendSetCookie(res: Response, cookie: string) {
  const current = res.getHeader('Set-Cookie');
  if (!current) {
    res.setHeader('Set-Cookie', cookie);
    return;
  }
  const next = Array.isArray(current) ? [...current.map(String), cookie] : [String(current), cookie];
  res.setHeader('Set-Cookie', next);
}

function buildCookie(name: string, value: string, secure: boolean) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${ONE_YEAR_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : null,
  ].filter(Boolean).join('; ');
}

function queryUserId(req: Request): unknown {
  const query = req.query as Record<string, unknown> | undefined;
  return query?.user_id ?? query?.userId;
}

function bodyUserId(req: Request): unknown {
  const body = req.body as Record<string, unknown> | undefined;
  return body?.user_id ?? body?.userId;
}

function rewriteLegacyUserIds(req: Request, userId: string) {
  const query = req.query as Record<string, unknown> | undefined;
  if (query) {
    if (!isUsableUserId(query.user_id)) query.user_id = userId;
    if ('userId' in query && !isUsableUserId(query.userId)) query.userId = userId;
  }

  const body = req.body as Record<string, unknown> | undefined;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    if (!isUsableUserId(body.user_id)) body.user_id = userId;
    if ('userId' in body && !isUsableUserId(body.userId)) body.userId = userId;
  }
}

/**
 * Personal-release user isolation boundary.
 *
 * Historical Command Center surfaces send `default_user`. That value must never
 * be allowed to key shared state. This middleware transparently upgrades legacy
 * requests to a stable, browser-scoped identity while preserving any explicit
 * non-legacy user id supplied by a trusted caller.
 *
 * The cookie is an isolation key, not authentication. Human-authority and
 * provider-write boundaries remain unchanged.
 */
export function createPersonalUserScopeMiddleware(options: PersonalUserScopeOptions = {}) {
  const cookieName = options.cookieName ?? PERSONAL_USER_COOKIE;
  const idFactory = options.idFactory ?? (() => `personal_${crypto.randomUUID()}`);

  return (req: Request, res: Response, next: NextFunction) => {
    const cookies = parseCookies(req.headers.cookie);
    const cookieUserId = cookies[cookieName];
    const explicitUserId = [queryUserId(req), bodyUserId(req)].find(isUsableUserId) as string | undefined;
    const scopedUserId = explicitUserId ?? (isUsableUserId(cookieUserId) ? cookieUserId : idFactory());

    rewriteLegacyUserIds(req, scopedUserId);
    (req as Request & { tiberUserId?: string }).tiberUserId = scopedUserId;

    if (cookieUserId !== scopedUserId) {
      appendSetCookie(res, buildCookie(cookieName, scopedUserId, req.secure || process.env.NODE_ENV === 'production'));
    }

    next();
  };
}
