/**
 * auth.js — "Sign in with Google", sessions and user profiles
 * -----------------------------------------------------------------------------
 * How sign-in works (simple version):
 *   1. The browser shows Google's official "Sign in with Google" button.
 *   2. After the person approves, Google hands the browser a signed ID token.
 *   3. The browser sends that token to POST /auth/google.
 *   4. WE verify the token with Google's public keys (it cannot be faked), find
 *      or create the user, and set a random session cookie.
 *   5. Every later request / Socket.IO connection carries that cookie, so the
 *      server always knows who is calling. The browser never tells the server
 *      "I am Alice" — the server reads it from the verified session.
 *
 * Email + password accounts (sign up / sign in) work alongside Google:
 *   - Passwords are hashed with scrypt (built into Node) and a random salt per person.
 *     The password itself is never stored or logged.
 *   - Wrong passwords are throttled per IP + account, and unknown accounts take the
 *     same time to answer as real ones (so attackers cannot probe which exist).
 *   - Emails typed at sign-up are NOT verified (there is no email sending yet). If the real owner
 *     later signs in with Google, the password is removed from that account and Google takes over.
 *
 * Security notes:
 *   - The session cookie is HttpOnly (JavaScript cannot read it), SameSite=Lax
 *     (other websites cannot make it ride along on POST requests) and Secure
 *     on https.
 *   - Only a SHA-256 hash of the session token is stored in the database.
 *   - Uploaded photos are re-encoded to JPEG in the browser and checked here.
 *   - Profile text is always displayed with textContent in the browser.
 *
 * Environment variables:
 *   GOOGLE_CLIENT_ID  Your OAuth "Web application" client id (required for real sign-in)
 *   DEV_LOGIN=true    Local testing only: shows a fake login form. Ignored when NODE_ENV=production.
 */
'use strict';

const crypto = require('crypto');
const express = require('express');
const database = require('./database');

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const COOKIE_NAME = 'qb_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // stay signed in for 30 days
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEV_LOGIN = process.env.DEV_LOGIN === 'true' && !IS_PRODUCTION;
if (process.env.DEV_LOGIN === 'true' && IS_PRODUCTION) {
  console.warn('[auth] DEV_LOGIN is ignored because NODE_ENV=production.');
}

const LIMITS = { displayName: 20, bio: 140, location: 40, favoriteTopic: 30 };
const MAX_AVATAR_BYTES = 200 * 1024;
// Same rule as the room names in server.js (letters, numbers, space and . _ ' -)
const NAME_PATTERN = /^[\p{L}\p{M}\p{N} ._'-]+$/u;
const NAME_ERROR = `Display names must be 1–${LIMITS.displayName} characters: letters, numbers, spaces and . _ ' - only.`;

// ---- email + password accounts ------------------------------------------------
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const USERNAME_ERROR = 'Usernames are 3–20 characters: letters, numbers and underscores only.';
const RESERVED_USERNAMES = new Set(['admin', 'administrator', 'root', 'system', 'support', 'moderator', 'quizbattle', 'null', 'undefined']);
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
// scrypt settings recommended by OWASP (32 MiB of memory, about a quarter of a second per check).
const SCRYPT = { N: 1 << 15, r: 8, p: 3, keylen: 32, maxmem: 128 * 1024 * 1024 };

function scryptAsync(password, salt, params) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, params.keylen, { N: params.N, r: params.r, p: params.p, maxmem: SCRYPT.maxmem }, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

/** Returns "scrypt$N$r$p$salt$hash" (everything needed to check the password later). */
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const key = await scryptAsync(password, Buffer.from(saltB64, 'base64'), { N: Number(N), r: Number(r), p: Number(p), keylen: expected.length });
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  } catch (err) {
    return false;
  }
}

// A throw-away hash used to spend the same time when the account does not exist.
let dummyHashPromise = null;
const dummyHash = () => (dummyHashPromise = dummyHashPromise || hashPassword(crypto.randomBytes(12).toString('hex')));

let googleClient = null;
if (GOOGLE_CLIENT_ID) {
  const { OAuth2Client } = require('google-auth-library');
  googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
}

// ---------------------------------------------------------------------------
// Text cleaning
// ---------------------------------------------------------------------------
/** Collapses whitespace and strips control characters. Returns null if too long. */
function cleanText(raw, max) {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') return null;
  const text = raw
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [...text].length <= max ? text : null;
}

function cleanDisplayName(raw) {
  const name = cleanText(raw, LIMITS.displayName);
  if (!name || !NAME_PATTERN.test(name)) return null;
  return name;
}

/** Turns a Google account name into something that passes our name rules. */
function nameFromGoogle(name, email) {
  const tidy = (s) =>
    [...String(s || '').normalize('NFC')]
      .filter((ch) => NAME_PATTERN.test(ch))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  let result = [...tidy(name)].slice(0, LIMITS.displayName).join('').trim();
  if (!result) result = [...tidy(String(email || '').split('@')[0])].slice(0, LIMITS.displayName).join('').trim();
  return result || 'Player';
}

function isGooglePicture(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.endsWith('.googleusercontent.com');
  } catch (err) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// What the browser (and other players) get to see
// ---------------------------------------------------------------------------
/** The picture to show: the uploaded one if there is one, otherwise Google's. */
function avatarUrlFor(user) {
  if (user.avatar_updated_at) return `/avatars/${user.public_id}?v=${user.avatar_updated_at}`;
  return user.google_picture || null;
}

function toClientUser(user, { withStats = false } = {}) {
  const out = {
    id: user.public_id,
    email: user.email,
    displayName: user.display_name,
    username: user.username || null,
    bio: user.bio,
    location: user.location,
    favoriteTopic: user.favorite_topic,
    picture: avatarUrlFor(user),
    hasCustomPicture: Boolean(user.avatar_updated_at),
    memberSince: user.created_at,
  };
  if (withStats) out.stats = database.getUserStats(user.id);
  return out;
}

// ---------------------------------------------------------------------------
// Cookies & sessions
// ---------------------------------------------------------------------------
function parseCookies(header) {
  const out = {};
  if (typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key) out[key] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function startSession(req, res, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  database.createSession(hashToken(token), user.id, Date.now() + SESSION_MS);
  const secure = req.secure || IS_PRODUCTION;
  res.append(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; Max-Age=${Math.floor(SESSION_MS / 1000)}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
  );
}

function clearCookie(req, res) {
  const secure = req.secure || IS_PRODUCTION;
  res.append('Set-Cookie', `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
}

function userFromCookieHeader(header) {
  const token = parseCookies(header)[COOKIE_NAME];
  if (!token || token.length > 100) return { token: null, user: null };
  return { token, user: database.getUserBySessionHash(hashToken(token)) };
}

// ---------------------------------------------------------------------------
// A tiny per-IP rate limiter for the HTTP routes
// ---------------------------------------------------------------------------
function rateLimit(max, windowMs) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (now > entry.resetAt) hits.delete(key);
  }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    const entry = hits.get(req.ip);
    if (!entry || now > entry.resetAt) {
      hits.set(req.ip, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    return next();
  };
}

// ---------------------------------------------------------------------------
// The router
// ---------------------------------------------------------------------------
/**
 * @param {object}   hooks
 * @param {(userId:number)=>boolean} hooks.isUserInActiveGame  true while the user is in a running quiz
 * @param {(userId:number)=>void}    hooks.onSignOut            called after logout (kick their sockets)
 * @param {(userId:number)=>void}    hooks.onProfileChanged     called after a profile / photo change
 */
function createAuth(hooks) {
  const router = express.Router();
  const limiter = rateLimit(60, 60 * 1000);
  const loginLimiter = rateLimit(30, 10 * 60 * 1000); // per IP
  const signupLimiter = rateLimit(30, 60 * 60 * 1000); // per IP (friends may share one Wi-Fi)

  // Wrong-password tracking: 5 mistakes for the same IP + account = 15 minute pause.
  const failures = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of failures) if (now > v.until && now - v.last > 15 * 60 * 1000) failures.delete(k);
  }, 5 * 60 * 1000).unref();
  const failureWaitSeconds = (key) => {
    const entry = failures.get(key);
    return entry && entry.until > Date.now() ? (entry.until - Date.now()) / 1000 : 0;
  };
  const recordFailure = (key) => {
    const entry = failures.get(key) || { count: 0, until: 0, last: 0 };
    entry.count += 1;
    entry.last = Date.now();
    if (entry.count >= 5) {
      entry.until = Date.now() + 15 * 60 * 1000;
      entry.count = 0;
    }
    failures.set(key, entry);
  };
  const clearFailures = (key) => failures.delete(key);
  const json = express.json({ limit: '10kb' });

  /** Middleware: attaches req.user or answers 401. */
  function requireUser(req, res, next) {
    const { token, user } = userFromCookieHeader(req.headers.cookie);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    req.user = user;
    req.sessionToken = token;
    return next();
  }

  /** Blocks profile changes while the person is playing a quiz. */
  function requireNotInGame(req, res, next) {
    if (hooks.isUserInActiveGame(req.user.id)) {
      return res.status(423).json({ error: 'Your profile is view-only during a quiz. Focus on the game!' });
    }
    return next();
  }

  // ---- public config (the Google client id is NOT a secret) ----------------
  router.get('/api/config', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      googleClientId: GOOGLE_CLIENT_ID || null,
      devLogin: DEV_LOGIN,
      categories: database.getCategories(), // quiz topics the host can choose from
    });
  });

  // ---- sign in with Google ---------------------------------------------------
  router.post('/auth/google', limiter, json, async (req, res) => {
    if (!googleClient) return res.status(503).json({ error: 'Google sign-in is not set up on this server yet.' });
    const credential = req.body && req.body.credential;
    if (typeof credential !== 'string' || credential.length < 20 || credential.length > 4096) {
      return res.status(400).json({ error: 'Missing Google credential.' });
    }
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
      const p = ticket.getPayload();
      if (!p || !p.sub || !p.email || p.email_verified !== true) {
        return res.status(401).json({ error: 'Your Google account email is not verified.' });
      }
      const user = database.upsertUser({
        sub: String(p.sub),
        email: String(p.email).toLowerCase(),
        name: nameFromGoogle(p.name, p.email),
        picture: p.picture && isGooglePicture(p.picture) ? p.picture : null,
      });
      startSession(req, res, user);
      return res.json({ user: toClientUser(user, { withStats: true }) });
    } catch (err) {
      console.warn('[auth] Google token rejected:', err.message);
      return res.status(401).json({ error: 'Google sign-in failed. Please try again.' });
    }
  });

  // ---- fake login for local testing only (never active in production) -----
  router.post('/auth/dev', limiter, json, (req, res) => {
    if (!DEV_LOGIN) return res.status(404).json({ error: 'Not found' });
    const name = cleanDisplayName(req.body && req.body.name);
    if (!name) return res.status(400).json({ error: NAME_ERROR });
    const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@dev.local`;
    const user = database.upsertUser({ sub: `dev:${email}`, email, name, picture: null });
    startSession(req, res, user);
    return res.json({ user: toClientUser(user, { withStats: true }) });
  });

  // ---- email + password: create account -------------------------------------------
  router.post('/auth/signup', signupLimiter, json, async (req, res) => {
    const body = req.body || {};
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!USERNAME_PATTERN.test(username) || RESERVED_USERNAMES.has(username.toLowerCase())) {
      return res.status(400).json({ error: USERNAME_ERROR });
    }
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      return res.status(400).json({ error: `Passwords must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.` });
    }
    const lowerPassword = password.toLowerCase();
    if (lowerPassword === username.toLowerCase() || lowerPassword === email || lowerPassword === email.split('@')[0]) {
      return res.status(400).json({ error: 'Your password must not be the same as your username or email.' });
    }
    try {
      const passwordHash = await hashPassword(password);
      // Everything below is synchronous, so two sign-ups can never slip in between the check and the insert.
      if (database.getUserByUsername(username)) return res.status(409).json({ error: 'That username is already taken.' });
      if (database.getUserByEmail(email)) {
        return res.status(409).json({ error: 'That email is already registered. Sign in instead, or use Google.' });
      }
      const user = database.createPasswordUser({ username, email, passwordHash });
      startSession(req, res, user);
      return res.status(201).json({ user: toClientUser(user, { withStats: true }) });
    } catch (err) {
      console.error('[auth] sign-up failed:', err);
      return res.status(500).json({ error: 'Could not create the account. Please try again.' });
    }
  });

  // ---- email + password: sign in ---------------------------------------------------
  router.post('/auth/login', loginLimiter, json, async (req, res) => {
    const body = req.body || {};
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!identifier || identifier.length > 254 || !password || password.length > PASSWORD_MAX) {
      return res.status(400).json({ error: 'Enter your email (or username) and your password.' });
    }

    const key = `${req.ip}|${identifier}`;
    const wait = failureWaitSeconds(key);
    if (wait > 0) {
      return res.status(429).json({ error: `Too many wrong attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` });
    }

    const user = identifier.includes('@') ? database.getUserByEmail(identifier) : database.getUserByUsername(identifier);
    const storedHash = user ? database.getPasswordHash(user.id) : null;
    // Always do one hash comparison, even for unknown accounts, so the timing reveals nothing.
    const valid = await verifyPassword(password, storedHash || (await dummyHash()));

    if (user && !storedHash) {
      return res.status(401).json({ error: 'This account uses Google. Please use the "Sign in with Google" button.' });
    }
    if (!user || !valid) {
      recordFailure(key);
      return res.status(401).json({ error: 'Incorrect email/username or password.' });
    }
    clearFailures(key);
    startSession(req, res, user);
    return res.json({ user: toClientUser(user, { withStats: true }) });
  });

  // ---- sign out ------------------------------------------------------------------
  router.post('/auth/logout', requireUser, (req, res) => {
    database.deleteSession(hashToken(req.sessionToken));
    clearCookie(req, res);
    hooks.onSignOut(req.user.id);
    res.json({ ok: true });
  });

  // ---- who am I? --------------------------------------------------------------------
  router.get('/api/me', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const { user } = userFromCookieHeader(req.headers.cookie);
    if (!user) return res.json({ user: null }); // 200 on purpose: being signed out is normal, not an error
    return res.json({ user: toClientUser(user, { withStats: true }), locked: hooks.isUserInActiveGame(user.id) });
  });

  // ---- edit profile text --------------------------------------------------------------
  router.put('/api/profile', limiter, requireUser, requireNotInGame, json, (req, res) => {
    const body = req.body || {};
    const displayName = cleanDisplayName(body.displayName);
    if (!displayName) return res.status(400).json({ error: NAME_ERROR });
    const bio = cleanText(body.bio, LIMITS.bio);
    const location = cleanText(body.location, LIMITS.location);
    const favoriteTopic = cleanText(body.favoriteTopic, LIMITS.favoriteTopic);
    if (bio === null) return res.status(400).json({ error: `Bio can be at most ${LIMITS.bio} characters.` });
    if (location === null) return res.status(400).json({ error: `Location can be at most ${LIMITS.location} characters.` });
    if (favoriteTopic === null) {
      return res.status(400).json({ error: `Favorite topic can be at most ${LIMITS.favoriteTopic} characters.` });
    }
    const user = database.updateUserProfile(req.user.id, { displayName, bio, location, favoriteTopic });
    hooks.onProfileChanged(user.id);
    return res.json({ user: toClientUser(user, { withStats: true }) });
  });

  // ---- upload / remove the profile photo ------------------------------------------------
  router.put(
    '/api/profile/avatar',
    limiter,
    requireUser,
    requireNotInGame,
    express.raw({ type: 'image/jpeg', limit: MAX_AVATAR_BYTES }),
    (req, res) => {
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || buf.length < 200) return res.status(415).json({ error: 'Please upload a JPEG image.' });
      const looksLikeJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;
      if (!looksLikeJpeg) return res.status(415).json({ error: 'That file is not a valid JPEG image.' });
      const user = database.setUserAvatar(req.user.id, buf);
      hooks.onProfileChanged(user.id);
      return res.json({ user: toClientUser(user, { withStats: true }) });
    }
  );

  router.delete('/api/profile/avatar', limiter, requireUser, requireNotInGame, (req, res) => {
    const user = database.clearUserAvatar(req.user.id);
    hooks.onProfileChanged(user.id);
    res.json({ user: toClientUser(user, { withStats: true }) });
  });

  // ---- serve uploaded photos (signed-in people only) ----------------------------------------
  router.get('/avatars/:publicId', requireUser, (req, res) => {
    const buf = /^[a-f0-9]{16}$/.test(req.params.publicId) ? database.getAvatarByPublicId(req.params.publicId) : null;
    if (!buf) return res.status(404).type('text/plain').send('Not found');
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    return res.send(buf);
  });

  // Friendly JSON errors for the routes above (e.g. photo too large).
  router.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'That file is too large.' });
    }
    if (err && (err.type === 'entity.parse.failed' || err.status === 400)) {
      return res.status(400).json({ error: 'Invalid request.' });
    }
    return next(err);
  });

  /** Socket.IO middleware: only signed-in people may connect. */
  function socketMiddleware(socket, next) {
    const { user } = userFromCookieHeader(socket.request.headers.cookie);
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = user.id;
    return next();
  }

  return { router, socketMiddleware };
}

module.exports = { createAuth, avatarUrlFor };
