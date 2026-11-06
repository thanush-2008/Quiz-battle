/**
 * database.js — SQLite persistence layer for QuizBattle
 * -----------------------------------------------------------------------------
 * Responsibilities:
 *   1. Open (or create) the SQLite database file at data/quiz.db
 *   2. Create the tables if they do not exist yet
 *   3. Seed the five sample questions the first time the app runs
 *   4. Provide small helper functions used by server.js:
 *        - getRandomQuestions(limit)  -> questions for a new game
 *        - saveGameResult(game)       -> store a finished game + final scores
 *        - getRecentGames(limit)      -> read back stored results (handy for tests)
 *        - user / session / profile helpers used by auth.js (Google sign-in)
 *
 * We use the `better-sqlite3` package. It is synchronous, which keeps the code
 * simple and is perfectly fast enough for this app.
 *
 * Where is the file stored?
 *   By default:  <project>/data/quiz.db
 *   Override it with the DB_PATH environment variable, e.g. on a hosting
 *   platform where you attach a persistent disk at /var/data:
 *        DB_PATH=/var/data/quiz.db
 */
'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');

// ---------------------------------------------------------------------------
// 1. Open the database
// ---------------------------------------------------------------------------
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'quiz.db');

// Make sure the folder exists (data/ is created automatically on first run).
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // better concurrency + crash safety
db.pragma('foreign_keys = ON'); // enforce the games -> game_results relationship

// ---------------------------------------------------------------------------
// 2. Create tables
// ---------------------------------------------------------------------------
db.exec(`
  -- Quiz questions. correct_index is 0-3 and points at option_a..option_d.
  CREATE TABLE IF NOT EXISTS questions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    text          TEXT    NOT NULL,
    option_a      TEXT    NOT NULL,
    option_b      TEXT    NOT NULL,
    option_c      TEXT    NOT NULL,
    option_d      TEXT    NOT NULL,
    correct_index INTEGER NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
    category      TEXT    NOT NULL DEFAULT 'general'
  );

  -- Question text must be unique so the bank can be re-seeded safely.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_text ON questions(text);

  -- One row per completed game.
  CREATE TABLE IF NOT EXISTS games (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code       TEXT    NOT NULL,
    total_questions INTEGER NOT NULL,
    player_count    INTEGER NOT NULL,
    finished_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- One row per signed-in person. google_sub is Google's permanent id for the account.
  CREATE TABLE IF NOT EXISTS users (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id         TEXT    NOT NULL UNIQUE,   -- random id safe to put in URLs
    google_sub        TEXT    NOT NULL UNIQUE,
    email             TEXT    NOT NULL,
    display_name      TEXT    NOT NULL,
    bio               TEXT    NOT NULL DEFAULT '',
    location          TEXT    NOT NULL DEFAULT '',
    favorite_topic    TEXT    NOT NULL DEFAULT '',
    google_picture    TEXT,                      -- profile photo URL supplied by Google
    avatar            BLOB,                      -- photo uploaded by the user (JPEG)
    avatar_updated_at INTEGER,
    created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    last_login_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- Login sessions. Only a SHA-256 hash of the cookie token is stored.
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  -- One row per player per completed game (the final leaderboard).
  CREATE TABLE IF NOT EXISTS game_results (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id         INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    player_name     TEXT    NOT NULL,
    score           INTEGER NOT NULL,
    correct_answers INTEGER NOT NULL,
    final_rank      INTEGER NOT NULL,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
`);

// Older databases (from before categories existed) do not have questions.category yet.
if (!db.prepare('PRAGMA table_info(questions)').all().some((c) => c.name === 'category')) {
  db.exec("ALTER TABLE questions ADD COLUMN category TEXT NOT NULL DEFAULT 'general'");
}
db.exec('CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category)');

// Older databases (from before sign-in existed) do not have game_results.user_id yet.
if (!db.prepare('PRAGMA table_info(game_results)').all().some((c) => c.name === 'user_id')) {
  db.exec('ALTER TABLE game_results ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_results_user ON game_results(user_id)');

// Email + password accounts (added after Google sign-in). Older databases need these columns.
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userColumns.includes('username')) db.exec('ALTER TABLE users ADD COLUMN username TEXT');
if (!userColumns.includes('password_hash')) db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
// Usernames are unique ignoring upper/lower case. NULL (Google-only users) is allowed many times.
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE)');
db.exec('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE)');

// ---------------------------------------------------------------------------
// 3. Question bank (questions-bank.js)
//    Every start-up inserts any bank questions that are not in the database
//    yet (matched by question text), so adding a line to questions-bank.js and
//    restarting is enough. Questions you INSERT yourself are never touched.
// ---------------------------------------------------------------------------
const { CATEGORIES, QUESTIONS: QUESTION_BANK } = require('./questions-bank');

function seedQuestions() {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO questions (text, option_a, option_b, option_c, option_d, correct_index, category)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  );
  // Questions that already exist (from an older version) get their category filled in / corrected.
  const setCategory = db.prepare('UPDATE questions SET category = ? WHERE text = ? AND category <> ?');
  // In the bank file the correct answer is first, so correct_index = 0 here.
  // The answers are shuffled every time a game starts (see getRandomQuestions).
  const insertAll = db.transaction(() => {
    let added = 0;
    for (const [category, rows] of Object.entries(QUESTION_BANK)) {
      for (const [text, a, b, c, d] of rows) {
        added += insert.run(text, a, b, c, d, category).changes;
        setCategory.run(category, text, category);
      }
    }
    return added;
  });
  return insertAll();
}

const seeded = seedQuestions();
if (seeded > 0) console.log(`[db] Added ${seeded} new questions to ${DB_PATH}`);

// ---------------------------------------------------------------------------
// 4. Helper functions used by server.js
// ---------------------------------------------------------------------------
const insertGame = db.prepare(
  'INSERT INTO games (room_code, total_questions, player_count) VALUES (?, ?, ?)'
);
const insertResult = db.prepare(
  `INSERT INTO game_results (game_id, player_name, score, correct_answers, final_rank, user_id)
   VALUES (?, ?, ?, ?, ?, ?)`
);

/** Fisher–Yates shuffle (returns a new array). */
function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Turns a database row into the game shape, shuffling the 4 answers. */
function toQuestion(row) {
  const options = [row.option_a, row.option_b, row.option_c, row.option_d].map((text, i) => ({
    text,
    isCorrect: i === row.correct_index,
  }));
  const mixed = shuffle(options);
  return {
    id: row.id,
    text: row.text,
    options: mixed.map((o) => o.text),
    correctIndex: mixed.findIndex((o) => o.isCorrect),
  };
}

/** "mixed" (or nothing) means every category. */
const MIXED = 'mixed';

/**
 * Returns up to `limit` random questions with shuffled answers.
 * @param {number}   limit
 * @param {number[]} excludeIds question ids to avoid (already played in this room).
 *        If the rest of the category is too small, the shortfall is filled from the excluded ones.
 * @param {string}   category   a category id, or "mixed" for all
 */
function getRandomQuestions(limit, excludeIds = [], category = MIXED) {
  const ids = excludeIds.filter(Number.isInteger);
  const useCategory = category && category !== MIXED;
  const marks = ids.map(() => '?').join(',');
  const catSql = useCategory ? ' AND category = ?' : '';
  const catArg = useCategory ? [category] : [];

  let rows = db
    .prepare(`SELECT * FROM questions WHERE 1 = 1${ids.length ? ` AND id NOT IN (${marks})` : ''}${catSql} ORDER BY RANDOM() LIMIT ?`)
    .all(...ids, ...catArg, limit);
  if (rows.length < limit && ids.length) {
    const extra = db
      .prepare(`SELECT * FROM questions WHERE id IN (${marks})${catSql} ORDER BY RANDOM() LIMIT ?`)
      .all(...ids, ...catArg, limit - rows.length);
    rows = rows.concat(extra);
  }
  return shuffle(rows).map(toQuestion);
}

/** The categories people can choose from, with how many questions each has. "Mixed" is first. */
function getCategories() {
  const counts = new Map(db.prepare('SELECT category, COUNT(*) AS n FROM questions GROUP BY category').all().map((r) => [r.category, r.n]));
  const list = [];
  const known = new Set();
  for (const c of CATEGORIES) {
    known.add(c.id);
    if (counts.get(c.id)) list.push({ id: c.id, label: c.label, description: c.description, count: counts.get(c.id) });
  }
  // Questions you added yourself with another / no category still show up.
  for (const [id, n] of counts) {
    if (!known.has(id)) list.push({ id, label: id === 'general' ? 'General' : id, description: '', count: n });
  }
  const total = list.reduce((sum, c) => sum + c.count, 0);
  return [{ id: MIXED, label: 'Mixed', description: 'A bit of everything', count: total }, ...list];
}

function isValidCategory(id) {
  return typeof id === 'string' && getCategories().some((c) => c.id === id);
}
function getCategoryLabel(id) {
  const found = getCategories().find((c) => c.id === id);
  return found ? found.label : 'Mixed';
}
/** How many questions of this category the room has NOT played yet. */
function countFreshQuestions(category, excludeIds = []) {
  const ids = excludeIds.filter(Number.isInteger);
  const useCategory = category && category !== MIXED;
  const sql = `SELECT COUNT(*) AS n FROM questions WHERE 1 = 1${useCategory ? ' AND category = ?' : ''}${
    ids.length ? ` AND id NOT IN (${ids.map(() => '?').join(',')})` : ''
  }`;
  return db.prepare(sql).get(...(useCategory ? [category] : []), ...ids).n;
}

const saveGameTransaction = db.transaction((game) => {
  const info = insertGame.run(game.roomCode, game.totalQuestions, game.players.length);
  const gameId = Number(info.lastInsertRowid);
  for (const p of game.players) {
    insertResult.run(gameId, p.name, p.score, p.correctCount, p.rank, p.userId ?? null);
  }
  return gameId;
});

/**
 * Stores a finished game.
 * @param {{roomCode:string, totalQuestions:number,
 *          players:Array<{name:string, score:number, correctCount:number, rank:number, userId?:number}>}} game
 * @returns {number} the new game id
 */
function saveGameResult(game) {
  return saveGameTransaction(game);
}

/** Returns the most recent finished games, each with its player results. */
function getRecentGames(limit = 10) {
  const games = db.prepare('SELECT * FROM games ORDER BY id DESC LIMIT ?').all(limit);
  const resultsFor = db.prepare(
    'SELECT player_name, score, correct_answers, final_rank FROM game_results WHERE game_id = ? ORDER BY final_rank, id'
  );
  return games.map((g) => ({ ...g, results: resultsFor.all(g.id) }));
}

// ---------------------------------------------------------------------------
// 5. Users, sessions and profiles (used by auth.js)
// ---------------------------------------------------------------------------
// We never SELECT the photo BLOB together with the other columns (it is large).
const USER_COLUMNS = `id, public_id, google_sub, email, display_name, username, bio, location,
  favorite_topic, google_picture, avatar_updated_at, created_at, last_login_at`;

const q = {
  userBySub: db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE google_sub = ?`),
  userById: db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`),
  userByPublicId: db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE public_id = ?`),
  insertUser: db.prepare(
    `INSERT INTO users (public_id, google_sub, email, display_name, google_picture)
     VALUES (?, ?, ?, ?, ?)`
  ),
  userByUsername: db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE username = ? COLLATE NOCASE`),
  // For sign-in by email: prefer the account that actually has a password.
  userByEmail: db.prepare(
    `SELECT ${USER_COLUMNS} FROM users WHERE email = ? COLLATE NOCASE
      ORDER BY (password_hash IS NOT NULL) DESC, id LIMIT 1`
  ),
  passwordHash: db.prepare('SELECT password_hash FROM users WHERE id = ?'),
  insertPasswordUser: db.prepare(
    `INSERT INTO users (public_id, google_sub, email, display_name, username, password_hash)
     VALUES (?, ?, ?, ?, ?, ?)`
  ),
  // A person who signed up with a password later proves the same email through Google:
  // attach the Google identity and DELETE the password, so nobody who merely typed
  // someone else's email at sign-up can keep access.
  linkGoogle: db.prepare(
    `UPDATE users SET google_sub = ?, google_picture = COALESCE(?, google_picture), password_hash = NULL,
            last_login_at = datetime('now') WHERE id = ?`
  ),
  touchUser: db.prepare(
    `UPDATE users SET email = ?, google_picture = ?, last_login_at = datetime('now') WHERE id = ?`
  ),
  updateProfile: db.prepare(
    `UPDATE users SET display_name = ?, bio = ?, location = ?, favorite_topic = ? WHERE id = ?`
  ),
  setAvatar: db.prepare('UPDATE users SET avatar = ?, avatar_updated_at = ? WHERE id = ?'),
  clearAvatar: db.prepare('UPDATE users SET avatar = NULL, avatar_updated_at = NULL WHERE id = ?'),
  getAvatar: db.prepare('SELECT avatar FROM users WHERE public_id = ? AND avatar IS NOT NULL'),
  insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
  sessionUser: db.prepare(
    `SELECT ${USER_COLUMNS.split(',').map((c) => 'u.' + c.trim()).join(', ')}
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`
  ),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  stats: db.prepare(
    `SELECT COUNT(*)                                                  AS games,
            COALESCE(SUM(CASE WHEN final_rank = 1 AND score > 0 THEN 1 ELSE 0 END), 0) AS wins,
            COALESCE(MAX(score), 0)                                   AS bestScore,
            COALESCE(SUM(correct_answers), 0)                         AS correctAnswers,
            COALESCE(SUM(score), 0)                                   AS totalPoints
       FROM game_results WHERE user_id = ?`
  ),
};

/**
 * Creates the user on first sign-in, or refreshes email/photo on later sign-ins.
 * The display name is only set the FIRST time, so a name the user edited is never overwritten.
 */
function upsertUser({ sub, email, name, picture }) {
  const existing = q.userBySub.get(sub);
  if (existing) {
    q.touchUser.run(email, picture || null, existing.id);
    return q.userById.get(existing.id);
  }
  // Same email already registered with a password? Google has verified the email, so link them.
  const byEmail = q.userByEmail.get(email);
  if (byEmail && byEmail.google_sub.startsWith('local:')) {
    q.linkGoogle.run(sub, picture || null, byEmail.id);
    q.deleteUserSessions.run(byEmail.id); // sign out anything that used the old password
    return q.userById.get(byEmail.id);
  }
  const publicId = crypto.randomBytes(8).toString('hex');
  const info = q.insertUser.run(publicId, sub, email, name, picture || null);
  return q.userById.get(Number(info.lastInsertRowid));
}

/** Creates an email + password account. The caller has already checked username/email are free. */
function createPasswordUser({ username, email, passwordHash }) {
  const publicId = crypto.randomBytes(8).toString('hex');
  const info = q.insertPasswordUser.run(publicId, `local:${publicId}`, email, username, username, passwordHash);
  return q.userById.get(Number(info.lastInsertRowid));
}
const getUserByUsername = (username) => q.userByUsername.get(username) || null;
const getUserByEmail = (email) => q.userByEmail.get(email) || null;
const getPasswordHash = (userId) => (q.passwordHash.get(userId) || {}).password_hash || null;

const getUserById = (id) => q.userById.get(id) || null;
const getUserByPublicId = (publicId) => q.userByPublicId.get(publicId) || null;

function updateUserProfile(id, { displayName, bio, location, favoriteTopic }) {
  q.updateProfile.run(displayName, bio, location, favoriteTopic, id);
  return q.userById.get(id);
}
function setUserAvatar(id, jpegBuffer) {
  q.setAvatar.run(jpegBuffer, Date.now(), id);
  return q.userById.get(id);
}
function clearUserAvatar(id) {
  q.clearAvatar.run(id);
  return q.userById.get(id);
}
function getAvatarByPublicId(publicId) {
  const row = q.getAvatar.get(publicId);
  return row ? row.avatar : null;
}

function createSession(tokenHash, userId, expiresAt) {
  q.insertSession.run(tokenHash, userId, expiresAt);
}
function getUserBySessionHash(tokenHash) {
  return q.sessionUser.get(tokenHash, Date.now()) || null;
}
const deleteSession = (tokenHash) => q.deleteSession.run(tokenHash);
const deleteUserSessions = (userId) => q.deleteUserSessions.run(userId);
const purgeExpiredSessions = () => q.purgeSessions.run(Date.now()).changes;
const getUserStats = (userId) => q.stats.get(userId);

purgeExpiredSessions();

function countQuestions() {
  return db.prepare('SELECT COUNT(*) AS count FROM questions').get().count;
}

function close() {
  db.close();
}

module.exports = {
  DB_PATH,
  getRandomQuestions,
  saveGameResult,
  getRecentGames,
  countQuestions,
  getCategories,
  isValidCategory,
  getCategoryLabel,
  countFreshQuestions,
  MIXED,
  close,
  // users / sessions / profiles
  upsertUser,
  createPasswordUser,
  getUserByUsername,
  getUserByEmail,
  getPasswordHash,
  getUserById,
  getUserByPublicId,
  updateUserProfile,
  setUserAvatar,
  clearUserAvatar,
  getAvatarByPublicId,
  createSession,
  getUserBySessionHash,
  deleteSession,
  deleteUserSessions,
  purgeExpiredSessions,
  getUserStats,
};
