/**
 * server.js — QuizBattle backend (Express + Socket.IO)
 * -----------------------------------------------------------------------------
 * Table of contents
 *   1. Configuration (environment variables)
 *   2. Express app + security headers + static files
 *   3. Socket.IO server
 *   4. Room state & helper functions
 *   5. Game flow (start -> question -> reveal -> ... -> finish)
 *   6. Socket event handlers (what the browser can ask the server to do)
 *   7. Housekeeping (idle-room cleanup, graceful shutdown) and start-up
 *
 * KEY IDEA: the SERVER is the single source of truth.
 *   - The server owns the timer and decides when a question ends.
 *   - The server checks answers and calculates scores.
 *   - The correct answer is never sent to browsers until a question has ended.
 *   Browsers only display what the server tells them and send "I clicked X".
 *
 * Active rooms live in memory (a Map). Questions and finished-game results live
 * in SQLite (see database.js).
 */
'use strict';

const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const database = require('./database');

// =============================================================================
// 1. CONFIGURATION
// =============================================================================
/** Reads a positive number from an env variable, falling back to a default. */
function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const CONFIG = {
  port: envNumber('PORT', 3000), // hosting platforms set PORT for you
  maxPlayers: envNumber('MAX_PLAYERS', 20), // players per room
  minPlayersToStart: envNumber('MIN_PLAYERS', 1), // set to 2 to require company
  questionsPerGame: envNumber('QUESTIONS_PER_GAME', 10),
  questionMs: envNumber('QUESTION_SECONDS', 15) * 1000, // answer time per question
  revealMs: envNumber('REVEAL_SECONDS', 5) * 1000, // how long results are shown
  pointsPerCorrect: 10,
  maxNameLength: 20,

  lobbyGraceMs: 15 * 1000, // a lobby player who drops keeps their seat this long
  emptyRoomGraceMs: 30 * 1000, // a room with nobody connected is deleted after this
  roomIdleMs: 30 * 60 * 1000, // rooms with no activity for 30 min are closed
  maxRooms: envNumber('MAX_ROOMS', 500), // protects server memory
  maxConnectionsPerIp: envNumber('MAX_CONNECTIONS_PER_IP', 40),
  rateLimitEvents: 30, // max events per socket ...
  rateLimitWindowMs: 10 * 1000, // ... per 10 seconds

  // Set TRUST_PROXY=true when running behind a hosting platform's proxy so we
  // can see each visitor's real IP address (used for the connection limit).
  trustProxy: process.env.TRUST_PROXY === 'true',
  // Optional: only needed if the frontend is hosted on a DIFFERENT domain.
  corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) : null,
};

// Room codes use an alphabet without look-alike characters (no 0/O, 1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
// Letters (any language), combining marks (e.g. Hindi/Tamil vowel signs), digits, space . _ ' -
const NAME_PATTERN = /^[\p{L}\p{M}\p{N} ._'-]+$/u;

// =============================================================================
// 2. EXPRESS APP
// =============================================================================
const app = express();
app.disable('x-powered-by');
if (CONFIG.trustProxy) app.set('trust proxy', 1);

// Basic security headers. The Content-Security-Policy only allows scripts and
// styles from our own origin, which blocks most injected-script attacks.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
      "connect-src 'self' ws: wss:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  );
  next();
});

// Health check — hosting platforms use this to know the app is alive.
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

// Serve the frontend (public/index.html, style.css, app.js) from the same origin
// as the Socket.IO server. That is why the frontend never needs a hard-coded URL.
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  })
);
app.use((req, res) => res.status(404).type('text/plain').send('Not found'));

// =============================================================================
// 3. SOCKET.IO SERVER
// =============================================================================
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 10 * 1024, // reject any message bigger than 10 KB
  pingInterval: 25 * 1000,
  pingTimeout: 20 * 1000,
  cors: CONFIG.corsOrigin ? { origin: CONFIG.corsOrigin } : undefined,
});

// --- Connection limit per IP address ----------------------------------------
const connectionsPerIp = new Map();

function clientIp(socket) {
  if (CONFIG.trustProxy) {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
  }
  return socket.handshake.address;
}

io.use((socket, next) => {
  const ip = clientIp(socket);
  const current = connectionsPerIp.get(ip) || 0;
  if (current >= CONFIG.maxConnectionsPerIp) {
    return next(new Error('Too many connections from your network. Please try again later.'));
  }
  connectionsPerIp.set(ip, current + 1);
  socket.data.ip = ip;
  next();
});

// --- Per-socket rate limit (stops one client from flooding the server) -------
function withinRateLimit(socket) {
  const now = Date.now();
  const bucket = socket.data.bucket;
  if (!bucket || now > bucket.resetAt) {
    socket.data.bucket = { count: 1, resetAt: now + CONFIG.rateLimitWindowMs };
    return true;
  }
  bucket.count += 1;
  return bucket.count <= CONFIG.rateLimitEvents;
}

// =============================================================================
// 4. ROOM STATE & HELPERS
// =============================================================================
/**
 * rooms: Map<roomCode, room>
 *
 * room = {
 *   code, createdAt, lastActivity,
 *   state: 'lobby' | 'question' | 'reveal' | 'finished',
 *   hostId,                       // player id of the host
 *   players: Map<playerId, player>,
 *   nextJoinOrder,                // counter used for stable ordering / tie-break
 *   questions: [...],             // questions for the current game (with answers!)
 *   currentIndex,                 // index of the current question
 *   answers: Map<playerId, {choice, at}>,   // answers for the current question
 *   deadline,                     // ms timestamp when the current question ends
 *   revealEndsAt,
 *   timer,                        // the ONE server timer for this room
 *   emptyTimer,                   // delete-room timer when nobody is connected
 *   lastResult, finalResults      // cached payloads (used when someone reconnects)
 * }
 *
 * player = {
 *   id,            // public id (safe to share with other players)
 *   token,         // PRIVATE secret that lets this browser re-join after a drop
 *   name, socketId, connected, joinOrder,
 *   score, correctCount, lastPoints, lastChoice, graceTimer
 * }
 */
const rooms = new Map();

const touch = (room) => {
  room.lastActivity = Date.now();
};

function connectedPlayers(room) {
  return [...room.players.values()].filter((p) => p.connected).sort((a, b) => a.joinOrder - b.joinOrder);
}

/** Validates a room code typed by a user. Returns the clean code or null. */
function normalizeRoomCode(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  return CODE_PATTERN.test(code) ? code : null;
}

/** Validates and cleans a display name. Returns the clean name or null. */
function sanitizeName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  const length = [...name].length; // counts characters, not UTF-16 units
  if (length < 1 || length > CONFIG.maxNameLength) return null;
  if (!NAME_PATTERN.test(name)) return null;
  return name;
}
const NAME_ERROR = `Names must be 1–${CONFIG.maxNameLength} characters: letters, numbers, spaces and . _ ' - only.`;

/** Unpredictable room code from the OS's cryptographically secure generator. */
function generateRoomCode() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
  return null;
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// ---- Building the data we send to browsers ----------------------------------

/**
 * Ranked leaderboard. TIE RULE: players with the same score share the same rank
 * (1, 1, 3 ...). Within a tie, players are listed in the order they joined, so
 * the order is always the same for everyone.
 */
function buildLeaderboard(room, { withChoices = false } = {}) {
  const sorted = [...room.players.values()].sort((a, b) => b.score - a.score || a.joinOrder - b.joinOrder);
  let previousScore = null;
  let previousRank = 0;
  return sorted.map((p, index) => {
    const rank = p.score === previousScore ? previousRank : index + 1;
    previousScore = p.score;
    previousRank = rank;
    const entry = {
      id: p.id,
      name: p.name,
      score: p.score,
      rank,
      pointsEarned: p.lastPoints,
      correctCount: p.correctCount,
      connected: p.connected,
    };
    // Individual choices are only revealed AFTER a question has ended.
    if (withChoices) entry.choice = p.lastChoice;
    return entry;
  });
}

/** Everything the lobby / live scoreboard needs. Never contains answers. */
function publicState(room) {
  return {
    code: room.code,
    state: room.state,
    hostId: room.hostId,
    maxPlayers: CONFIG.maxPlayers,
    totalQuestions: room.questions.length || CONFIG.questionsPerGame,
    players: [...room.players.values()]
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map((p) => ({ id: p.id, name: p.name, connected: p.connected, isHost: p.id === room.hostId })),
    leaderboard: buildLeaderboard(room),
  };
}

function broadcastRoom(room) {
  io.to(room.code).emit('room:update', publicState(room));
}

/** The question as players see it. NOTE: no correct answer in here! */
function questionPayload(room) {
  const q = room.questions[room.currentIndex];
  return {
    index: room.currentIndex,
    number: room.currentIndex + 1,
    total: room.questions.length,
    text: q.text,
    options: q.options,
    durationMs: CONFIG.questionMs,
    // We send "time remaining", not a clock time, so a wrong clock on the
    // player's phone can never skew the countdown.
    remainingMs: Math.max(0, room.deadline - Date.now()),
  };
}

function answersCount(room) {
  const connected = connectedPlayers(room);
  const answered = connected.filter((p) => room.answers.has(p.id)).length;
  return { answered, total: connected.length };
}

function resultPayload(room) {
  return { ...room.lastResult, revealMs: Math.max(0, room.revealEndsAt - Date.now()) };
}

function allConnectedAnswered(room) {
  const connected = connectedPlayers(room);
  return connected.length > 0 && connected.every((p) => room.answers.has(p.id));
}

/** If the host is gone, make the longest-present connected player the host. */
function ensureHost(room) {
  const host = room.players.get(room.hostId);
  if (host && host.connected) return;
  const next = connectedPlayers(room)[0];
  if (next) room.hostId = next.id;
}

// ---- Creating and destroying rooms ------------------------------------------
function createRoom(code) {
  const room = {
    code,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    state: 'lobby',
    hostId: null,
    players: new Map(),
    nextJoinOrder: 0,
    questions: [],
    usedQuestionIds: new Set(), // question ids already played in this room
    currentIndex: -1,
    answers: new Map(),
    deadline: 0,
    revealEndsAt: 0,
    timer: null,
    emptyTimer: null,
    lastResult: null,
    finalResults: null,
  };
  rooms.set(code, room);
  return room;
}

/** Stops every timer belonging to the room and forgets it (no leaks). */
function destroyRoom(room) {
  clearTimeout(room.timer);
  clearTimeout(room.emptyTimer);
  for (const p of room.players.values()) clearTimeout(p.graceTimer);
  rooms.delete(room.code);
}

function closeRoom(room, reason) {
  io.to(room.code).emit('room:closed', { reason });
  io.in(room.code).socketsLeave(room.code);
  destroyRoom(room);
}

function scheduleEmptyRoomCleanup(room) {
  if (room.emptyTimer) return;
  room.emptyTimer = setTimeout(() => {
    room.emptyTimer = null;
    if (rooms.has(room.code) && connectedPlayers(room).length === 0) destroyRoom(room);
  }, CONFIG.emptyRoomGraceMs);
}

function cancelEmptyRoomCleanup(room) {
  clearTimeout(room.emptyTimer);
  room.emptyTimer = null;
}

// ---- Players joining / leaving ----------------------------------------------
function addPlayer(room, name, socket) {
  const player = {
    id: crypto.randomBytes(6).toString('hex'),
    token: crypto.randomBytes(24).toString('hex'),
    name,
    socketId: socket.id,
    connected: true,
    joinOrder: room.nextJoinOrder++,
    score: 0,
    correctCount: 0,
    lastPoints: 0,
    lastChoice: null,
    graceTimer: null,
  };
  room.players.set(player.id, player);
  socket.join(room.code);
  socket.data.roomCode = room.code;
  socket.data.playerId = player.id;
  cancelEmptyRoomCleanup(room);
  touch(room);
  return player;
}

/** Finds the room + player this socket belongs to (or null). */
function getContext(socket) {
  const room = rooms.get(socket.data.roomCode);
  const player = room && room.players.get(socket.data.playerId);
  if (!room || !player || player.socketId !== socket.id) return null;
  return { room, player };
}

/**
 * Called whenever someone leaves or loses their connection.
 *  - permanent = true  -> they clicked "Leave" (can never re-join with their token)
 *  - permanent = false -> connection dropped (they may come back)
 * In the lobby a dropped player keeps their seat for a few seconds; during a game
 * they stay on the leaderboard (marked offline) so final scores stay complete.
 */
function detachPlayer(room, player, permanent) {
  player.connected = false;
  player.socketId = null;
  if (permanent) player.token = null;

  if (room.state === 'lobby') {
    if (permanent) {
      room.players.delete(player.id);
    } else {
      clearTimeout(player.graceTimer);
      player.graceTimer = setTimeout(() => {
        if (!player.connected && room.players.get(player.id) === player) {
          room.players.delete(player.id);
          membershipChanged(room);
        }
      }, CONFIG.lobbyGraceMs);
    }
  }
  membershipChanged(room);
}

function leaveCurrentRoom(socket, permanent) {
  const ctx = getContext(socket);
  const code = socket.data.roomCode;
  if (code) socket.leave(code);
  socket.data.roomCode = null;
  socket.data.playerId = null;
  if (ctx) detachPlayer(ctx.room, ctx.player, permanent);
}

/** Re-checks host, "everyone answered?", empty rooms — then tells everybody. */
function membershipChanged(room) {
  if (!rooms.has(room.code)) return;
  touch(room);
  if (room.players.size === 0) return destroyRoom(room);

  if (connectedPlayers(room).length === 0) {
    scheduleEmptyRoomCleanup(room);
    return undefined;
  }
  cancelEmptyRoomCleanup(room);
  ensureHost(room);

  if (room.state === 'question') {
    if (allConnectedAnswered(room)) {
      endQuestion(room); // also broadcasts the room state
      return undefined;
    }
    io.to(room.code).emit('answers:count', answersCount(room));
  }
  broadcastRoom(room);
  return undefined;
}

// =============================================================================
// 5. GAME FLOW
// =============================================================================
/** Host pressed Start. Returns an error string, or null on success. */
function startGame(room) {
  // Avoid repeating questions this room has already played. Once most of the
  // bank has been used, start over so a long-running room never runs dry.
  if (room.usedQuestionIds.size > database.countQuestions() - CONFIG.questionsPerGame) {
    room.usedQuestionIds.clear();
  }
  const questions = database.getRandomQuestions(CONFIG.questionsPerGame, [...room.usedQuestionIds]);
  for (const q of questions) room.usedQuestionIds.add(q.id);
  if (questions.length === 0) return 'There are no quiz questions in the database.';

  // Anyone still in their "dropped connection" grace period is removed now.
  for (const p of [...room.players.values()]) {
    if (!p.connected) {
      clearTimeout(p.graceTimer);
      room.players.delete(p.id);
    }
  }
  ensureHost(room);

  room.questions = questions;
  room.currentIndex = -1;
  room.lastResult = null;
  room.finalResults = null;
  for (const p of room.players.values()) {
    p.score = 0;
    p.correctCount = 0;
    p.lastPoints = 0;
    p.lastChoice = null;
  }
  nextQuestion(room);
  return null;
}

function nextQuestion(room) {
  room.currentIndex += 1;
  if (room.currentIndex >= room.questions.length) {
    finishGame(room);
    return;
  }
  room.state = 'question';
  room.answers = new Map();
  room.deadline = Date.now() + CONFIG.questionMs;
  for (const p of room.players.values()) {
    p.lastPoints = 0;
    p.lastChoice = null;
  }
  touch(room);

  broadcastRoom(room); // fresh scoreboard first ...
  io.to(room.code).emit('question:new', questionPayload(room)); // ... then the question
  io.to(room.code).emit('answers:count', answersCount(room));

  // The one official timer. When it fires the question is over, whatever clients think.
  clearTimeout(room.timer);
  room.timer = setTimeout(() => endQuestion(room), CONFIG.questionMs);
}

/** Ends the current question: calculates scores and reveals the correct answer. */
function endQuestion(room) {
  if (room.state !== 'question') return; // already ended (timer vs. "all answered" race)
  clearTimeout(room.timer);
  room.state = 'reveal';
  touch(room);

  const question = room.questions[room.currentIndex];
  for (const player of room.players.values()) {
    const answer = room.answers.get(player.id);
    player.lastChoice = answer ? answer.choice : null;
    player.lastPoints = 0;
    // SCORING happens here, on the server, and only here.
    if (answer && answer.choice === question.correctIndex) {
      player.score += CONFIG.pointsPerCorrect;
      player.correctCount += 1;
      player.lastPoints = CONFIG.pointsPerCorrect;
    }
  }

  const isLast = room.currentIndex >= room.questions.length - 1;
  room.lastResult = {
    index: room.currentIndex,
    number: room.currentIndex + 1,
    total: room.questions.length,
    text: question.text,
    options: question.options,
    correctIndex: question.correctIndex, // safe to send now: the question is over
    isLast,
    leaderboard: buildLeaderboard(room, { withChoices: true }),
  };
  room.revealEndsAt = Date.now() + CONFIG.revealMs;

  io.to(room.code).emit('question:result', resultPayload(room));
  broadcastRoom(room);

  room.timer = setTimeout(() => (isLast ? finishGame(room) : nextQuestion(room)), CONFIG.revealMs);
}

function finishGame(room) {
  clearTimeout(room.timer);
  room.state = 'finished';
  touch(room);

  const leaderboard = buildLeaderboard(room);
  const topScore = leaderboard.length ? leaderboard[0].score : 0;
  room.finalResults = {
    leaderboard,
    // Everyone tied for first shares the trophy. If nobody scored there is no winner.
    winnerIds: topScore > 0 ? leaderboard.filter((e) => e.rank === 1).map((e) => e.id) : [],
    totalQuestions: room.questions.length,
    maxScore: room.questions.length * CONFIG.pointsPerCorrect,
  };

  // Persist the completed game. A database problem must never crash a live game.
  try {
    database.saveGameResult({
      roomCode: room.code,
      totalQuestions: room.questions.length,
      players: leaderboard.map((e) => ({
        name: e.name,
        score: e.score,
        correctCount: e.correctCount,
        rank: e.rank,
      })),
    });
  } catch (err) {
    console.error('[db] Could not save game result:', err);
  }

  io.to(room.code).emit('game:finished', room.finalResults);
  broadcastRoom(room);
}

/** Host chose "Play Again": everyone returns to the waiting room. */
function resetRoom(room) {
  clearTimeout(room.timer);
  room.state = 'lobby';
  room.questions = [];
  room.currentIndex = -1;
  room.answers = new Map();
  room.lastResult = null;
  room.finalResults = null;
  for (const p of [...room.players.values()]) {
    if (!p.connected) {
      clearTimeout(p.graceTimer);
      room.players.delete(p.id);
      continue;
    }
    p.score = 0;
    p.correctCount = 0;
    p.lastPoints = 0;
    p.lastChoice = null;
  }
  ensureHost(room);
  touch(room);
  io.to(room.code).emit('room:reset');
  broadcastRoom(room);
}

/** After a (re)connect, send a player whatever they need to catch up. */
function sendCurrentState(socket, room, player) {
  if (room.state === 'question') {
    socket.emit('question:new', questionPayload(room));
    socket.emit('answers:count', answersCount(room));
    const answer = room.answers.get(player.id);
    if (answer) socket.emit('answer:locked', { index: room.currentIndex, choice: answer.choice });
  } else if (room.state === 'reveal') {
    socket.emit('question:result', resultPayload(room));
  } else if (room.state === 'finished') {
    socket.emit('game:finished', room.finalResults);
  }
}

// =============================================================================
// 6. SOCKET EVENT HANDLERS
// =============================================================================
const ok = (ack, data = {}) => ack({ ok: true, ...data });
const fail = (ack, error, code) => ack({ ok: false, error, code });

/**
 * Registers an event handler with built-in safety: rate limiting, payload
 * shape checking and error catching. Handlers always reply through `ack`.
 */
function handle(socket, event, handler) {
  socket.on(event, (payload, ack) => {
    if (typeof payload === 'function') {
      ack = payload;
      payload = {};
    }
    if (typeof ack !== 'function') ack = () => {};
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) payload = {};

    if (!withinRateLimit(socket)) {
      return fail(ack, 'You are sending requests too quickly. Please slow down.', 'rate_limited');
    }
    try {
      return handler(payload, ack);
    } catch (err) {
      console.error(`[${event}] handler error:`, err);
      return fail(ack, 'Something went wrong on the server. Please try again.');
    }
  });
}

io.on('connection', (socket) => {
  // ---------------------------------------------------------------- create room
  handle(socket, 'room:create', (payload, ack) => {
    const name = sanitizeName(payload.name);
    if (!name) return fail(ack, NAME_ERROR, 'invalid_name');
    if (rooms.size >= CONFIG.maxRooms) {
      return fail(ack, 'The server is very busy right now. Please try again in a few minutes.', 'server_full');
    }
    leaveCurrentRoom(socket, true); // a socket can only be in one room at a time

    const code = generateRoomCode();
    if (!code) return fail(ack, 'Could not create a room. Please try again.');
    const room = createRoom(code);
    const player = addPlayer(room, name, socket);
    room.hostId = player.id; // the creator is the host

    ok(ack, { code, playerId: player.id, token: player.token });
    broadcastRoom(room);
    return undefined;
  });

  // ------------------------------------------------------------------ join room
  handle(socket, 'room:join', (payload, ack) => {
    const name = sanitizeName(payload.name);
    if (!name) return fail(ack, NAME_ERROR, 'invalid_name');
    const code = normalizeRoomCode(payload.code);
    if (!code) return fail(ack, 'Room codes are 6 characters long, like K7P2XM.', 'invalid_code');

    const room = rooms.get(code);
    if (!room) return fail(ack, `Room ${code} was not found. Check the code and try again.`, 'room_not_found');
    if (room.state !== 'lobby') {
      return fail(ack, 'That quiz has already started. Ask the host to start a new game.', 'game_started');
    }
    if (room.players.size >= CONFIG.maxPlayers) {
      return fail(ack, `That room is full (${CONFIG.maxPlayers} players maximum).`, 'room_full');
    }
    const lower = name.toLowerCase();
    if ([...room.players.values()].some((p) => p.name.toLowerCase() === lower)) {
      return fail(ack, 'Someone in that room already uses this name. Please pick another.', 'name_taken');
    }

    leaveCurrentRoom(socket, true);
    const player = addPlayer(room, name, socket);
    ok(ack, { code, playerId: player.id, token: player.token });
    membershipChanged(room);
    return undefined;
  });

  // ----------------------------------------------------- re-join after a drop
  handle(socket, 'room:rejoin', (payload, ack) => {
    const code = normalizeRoomCode(payload.code);
    const token = typeof payload.token === 'string' ? payload.token : '';
    const room = code ? rooms.get(code) : null;
    if (!room) return fail(ack, 'That room no longer exists.', 'room_closed');

    const player = [...room.players.values()].find((p) => p.token && safeEqual(p.token, token));
    if (!player) return fail(ack, 'Your seat in that room is no longer available.', 'rejoin_failed');

    // If this socket is sitting in some other room, leave it first.
    const current = getContext(socket);
    if (current && current.player !== player) leaveCurrentRoom(socket, true);

    // If an old (half-dead) socket still holds this seat, release it.
    if (player.socketId && player.socketId !== socket.id) {
      const old = io.sockets.sockets.get(player.socketId);
      if (old) {
        old.leave(room.code);
        old.data.roomCode = null;
        old.data.playerId = null;
        old.emit('room:closed', { reason: 'You joined this room from another tab or device.' });
      }
    }

    clearTimeout(player.graceTimer);
    player.connected = true;
    player.socketId = socket.id;
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;

    ok(ack, { code: room.code, playerId: player.id, token: player.token });
    sendCurrentState(socket, room, player);
    membershipChanged(room);
    return undefined;
  });

  // ------------------------------------------------------------ leave room
  handle(socket, 'room:leave', (payload, ack) => {
    leaveCurrentRoom(socket, true);
    return ok(ack);
  });

  // ------------------------------------------------------------ start the quiz
  handle(socket, 'game:start', (payload, ack) => {
    const ctx = getContext(socket);
    if (!ctx) return fail(ack, 'You are not in a room.', 'not_in_room');
    const { room, player } = ctx;
    if (player.id !== room.hostId) return fail(ack, 'Only the host can start the quiz.', 'not_host');
    if (room.state !== 'lobby') return fail(ack, 'The quiz has already started.', 'bad_state');
    if (connectedPlayers(room).length < CONFIG.minPlayersToStart) {
      return fail(ack, `At least ${CONFIG.minPlayersToStart} players are needed to start.`, 'not_enough_players');
    }
    const error = startGame(room);
    if (error) return fail(ack, error);
    return ok(ack);
  });

  // ------------------------------------------------------------ submit answer
  handle(socket, 'answer:submit', (payload, ack) => {
    const ctx = getContext(socket);
    if (!ctx) return fail(ack, 'You are not in a room.', 'not_in_room'); // must belong to the room
    const { room, player } = ctx;

    if (room.state !== 'question') return fail(ack, 'There is no active question right now.', 'bad_state');
    if (Date.now() > room.deadline) return fail(ack, 'Too late — time ran out for this question.', 'too_late');
    if (payload.questionIndex !== room.currentIndex) {
      return fail(ack, 'That answer was for a different question.', 'wrong_question');
    }
    const { choice } = payload;
    if (!Number.isInteger(choice) || choice < 0 || choice >= room.questions[room.currentIndex].options.length) {
      return fail(ack, 'Invalid answer choice.', 'invalid_choice');
    }
    if (room.answers.has(player.id)) return fail(ack, 'You already answered this question.', 'already_answered');

    room.answers.set(player.id, { choice, at: Date.now() });
    touch(room);
    // We only say "received". Whether it was right is revealed when the question ends.
    ok(ack);

    io.to(room.code).emit('answers:count', answersCount(room));
    if (allConnectedAnswered(room)) endQuestion(room); // everyone answered -> move on early
    return undefined;
  });

  // ------------------------------------------------------------ play again
  handle(socket, 'game:playAgain', (payload, ack) => {
    const ctx = getContext(socket);
    if (!ctx) return fail(ack, 'You are not in a room.', 'not_in_room');
    const { room, player } = ctx;
    if (player.id !== room.hostId) return fail(ack, 'Only the host can start a new game.', 'not_host');
    if (room.state !== 'finished') return fail(ack, 'The current game is not finished yet.', 'bad_state');
    resetRoom(room);
    return ok(ack);
  });

  // ------------------------------------------------------------ disconnects
  socket.on('disconnect', () => {
    const count = (connectionsPerIp.get(socket.data.ip) || 1) - 1;
    if (count <= 0) connectionsPerIp.delete(socket.data.ip);
    else connectionsPerIp.set(socket.data.ip, count);

    const ctx = getContext(socket);
    if (ctx) detachPlayer(ctx.room, ctx.player, false);
  });
});

// =============================================================================
// 7. HOUSEKEEPING & START-UP
// =============================================================================
// Every minute, close rooms that nobody has touched for a long time.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const room of [...rooms.values()]) {
    if (now - room.lastActivity > CONFIG.roomIdleMs) {
      closeRoom(room, 'This room was closed because it was inactive for too long.');
    }
  }
}, 60 * 1000);
sweeper.unref();

function shutdown(signal) {
  console.log(`\n[server] ${signal} received, shutting down...`);
  for (const room of [...rooms.values()]) destroyRoom(room);
  io.close(() => {
    try {
      database.close();
    } catch (err) {
      /* already closed */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.listen(CONFIG.port, () => {
  console.log(`QuizBattle is running (${database.countQuestions()} questions in ${database.DB_PATH})`);
  console.log(`  Local:    http://localhost:${CONFIG.port}`);
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal);
  for (const i of addresses) {
    console.log(`  Network:  http://${i.address}:${CONFIG.port}   (phones/computers on the same Wi-Fi)`);
  }
});
