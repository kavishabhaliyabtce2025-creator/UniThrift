'use strict';
const crypto = require('crypto');

const SECRET = process.env.CT_SECRET || 'unithrift-dev-secret-2026';
const COOKIE = 'ct_session';

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const calc = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(calc, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Stateless token: base64url({uid, exp}) . base64url(signature)
function signToken(uid, ttlMs = 1000 * 60 * 60 * 24 * 7) {
  const payload = Buffer.from(JSON.stringify({ uid, exp: Date.now() + ttlMs })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expect = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.uid || Date.now() > data.exp) return null;
    return data.uid;
  } catch {
    return null;
  }
}

const cookieHeader = (value) =>
  `${COOKIE}=${value}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`;

const clearCookieHeader = () =>
  `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

module.exports = {
  COOKIE,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  cookieHeader,
  clearCookieHeader,
  parseCookies,
};