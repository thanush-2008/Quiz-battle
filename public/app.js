/**
 * app.js — QuizBattle frontend
 * -----------------------------------------------------------------------------
 * Table of contents
 *   1. Setup (constants, DOM references, state)
 *   2. Small helpers (DOM builder, toasts, clipboard, storage, requests)
 *   3. View switching
 *   4. Home: create / join a room
 *   5. Waiting room (lobby)
 *   6. Quiz: question, timer, answering, results
 *   7. Leaderboards & final results
 *   8. Socket.IO event listeners (everything the server tells us)
 *   8b. Account: Google sign-in, profile panel, photo upload
 *   9. Start-up
 *
 * IMPORTANT: this file only DISPLAYS what the server tells it. The server owns
 * the timer, checks the answers and calculates the scores. The countdown here
 * is purely visual.
 *
 * No server address is written anywhere in this file: `io()` connects to the
 * same address the page was loaded from, so it works on localhost, on your Wi-Fi
 * and on a deployed https:// site without any changes.
 */
(() => {
  'use strict';

  /* =========================================================================
   * 1. SETUP
   * ======================================================================= */
  const SESSION_KEY = 'quizbattle.session'; // survives page refreshes (this tab only)
  const NAME_PATTERN = /^[\p{L}\p{M}\p{N} ._'-]+$/u;
  const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
  const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
  const MAX_NAME_LENGTH = 20;

  const $ = (id) => document.getElementById(id);
  const el = {
    banner: $('connection-banner'),
    bannerText: $('connection-text'),
    toasts: $('toasts'),
    // header + account
    profileBtn: $('btn-profile'),
    headerAvatar: $('header-avatar'),
    headerName: $('header-name'),
    // sign-in
    googleButton: $('google-button'),
    signinStatus: $('signin-status'),
    signinError: $('signin-error'),
    signinInvite: $('signin-invite'),
    tabLogin: $('tab-login'),
    tabSignup: $('tab-signup'),
    loginForm: $('login-form'),
    signupForm: $('signup-form'),
    loginId: $('login-id'),
    loginPassword: $('login-password'),
    signupUsername: $('signup-username'),
    signupEmail: $('signup-email'),
    signupPassword: $('signup-password'),
    signupConfirm: $('signup-confirm'),
    showPasswords: $('show-passwords'),
    btnLogin: $('btn-login'),
    btnSignup: $('btn-signup'),
    devLogin: $('dev-login'),
    devName: $('dev-name'),
    // profile dialog
    dlg: $('profile-dialog'),
    dlgClose: $('profile-close'),
    dlgLock: $('profile-lock'),
    dlgAvatar: $('profile-avatar'),
    dlgEmail: $('profile-email'),
    photoActions: $('photo-actions'),
    btnPhoto: $('btn-photo'),
    btnPhotoRemove: $('btn-photo-remove'),
    photoInput: $('photo-input'),
    profileForm: $('profile-form'),
    pfName: $('pf-name'),
    pfBio: $('pf-bio'),
    pfBioCount: $('pf-bio-count'),
    pfLocation: $('pf-location'),
    pfTopic: $('pf-topic'),
    profileError: $('profile-error'),
    btnSave: $('btn-save-profile'),
    btnSignOut: $('btn-signout'),
    statGames: $('stat-games'),
    statWins: $('stat-wins'),
    statBest: $('stat-best'),
    statCorrect: $('stat-correct'),
    // home
    homeAvatar: $('home-avatar'),
    homeName: $('home-name'),
    btnEditProfile: $('btn-edit-profile'),
    btnCreate: $('btn-create'),
    joinForm: $('join-form'),
    codeInput: $('room-code-input'),
    btnJoin: $('btn-join'),
    homeError: $('home-error'),
    // lobby
    lobbyCode: $('lobby-code'),
    btnCopyCode: $('btn-copy-code'),
    btnCopyLink: $('btn-copy-link'),
    playerCount: $('player-count'),
    lobbyPlayers: $('lobby-players'),
    btnStart: $('btn-start'),
    lobbyWait: $('lobby-wait'),
    btnLeaveLobby: $('btn-leave-lobby'),
    // quiz
    quizProgress: $('quiz-progress'),
    qNumber: $('q-number'),
    qTotal: $('q-total'),
    answeredCount: $('answered-count'),
    timer: $('timer'),
    timerFill: $('timer-fill'),
    timerText: $('timer-text'),
    questionText: $('question-text'),
    options: $('options'),
    quizStatus: $('quiz-status'),
    quizNext: $('quiz-next'),
    liveLeaderboard: $('live-leaderboard'),
    btnLeaveQuiz: $('btn-leave-quiz'),
    // results
    trophyHero: $('trophy-hero'),
    resultsSubtitle: $('results-subtitle'),
    resultsMe: $('results-me'),
    finalLeaderboard: $('final-leaderboard'),
    btnPlayAgain: $('btn-play-again'),
    btnLeaveResults: $('btn-leave-results'),
    resultsWait: $('results-wait'),
  };

  const state = {
    user: null, // the signed-in account (from /api/me), or null
    config: null, // { googleClientId, devLogin } from /api/config
    session: null, // { code, playerId, token } — who am I and where
    room: null, // latest 'room:update' from the server
    view: 'home',
    phase: 'idle', // 'idle' | 'question' | 'reveal' | 'finished'
    question: null, // the question currently displayed
    answered: false,
    selected: null,
    timerEndsAt: 0, // performance.now() value when the visual countdown hits zero
    timerDuration: 1,
    timerId: null,
    revealId: null,
    wasDisconnected: false,
  };

  /* =========================================================================
   * 2. HELPERS
   * ======================================================================= */
  /** Creates an element. Text is always set with textContent (never innerHTML),
   *  so a player name like "<script>" can never run as code. */
  function h(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function toast(message, type = 'info', duration = 4200) {
    const node = h('div', `toast toast-${type}`, message);
    el.toasts.appendChild(node);
    setTimeout(() => {
      node.classList.add('toast-out');
      setTimeout(() => node.remove(), 320);
    }, duration);
  }

  function legacyCopy(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.className = 'sr-only';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    if (!copied) throw new Error('copy failed');
  }

  async function copyText(text, successMessage) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else legacyCopy(text); // plain http:// pages (e.g. testing over Wi-Fi) have no clipboard API
      toast(successMessage, 'success', 2500);
    } catch (err) {
      toast('Could not copy automatically — please copy it by hand.', 'error');
    }
  }

  function loadSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY));
    } catch (err) {
      return null;
    }
  }
  function saveSession(session) {
    state.session = session;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (err) {
      /* storage unavailable (private mode) — re-joining after a refresh just won't work */
    }
  }
  function clearSession() {
    state.session = null;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (err) {
      /* ignore */
    }
  }

  /** Sends an event and waits for the server's reply. Always resolves (never throws). */
  function request(event, payload = {}) {
    return new Promise((resolve) => {
      if (!socket.connected) {
        resolve({ ok: false, local: true, error: 'Not connected to the server yet. Please wait a moment and try again.' });
        return;
      }
      socket.timeout(8000).emit(event, payload, (err, response) => {
        if (err) resolve({ ok: false, local: true, error: 'The server took too long to answer. Please try again.' });
        else resolve(response || { ok: false, error: 'Unexpected reply from the server.' });
      });
    });
  }

  function setBusy(button, busy) {
    button.classList.toggle('is-busy', busy);
    button.disabled = busy;
  }

  const myId = () => (state.session ? state.session.playerId : null);

  /* =========================================================================
   * 3. VIEW SWITCHING
   * ======================================================================= */
  const VIEW_NAMES = ['signin', 'home', 'lobby', 'quiz', 'results'];

  function showView(name) {
    const changed = state.view !== name;
    state.view = name;
    for (const view of VIEW_NAMES) $(`view-${view}`).hidden = view !== name;
    if (changed) {
      const heading = $(`view-${name}`).querySelector('h1');
      if (heading) heading.focus({ preventScroll: true }); // tells screen readers where they are
      window.scrollTo({ top: 0 });
    }
    el.profileBtn.hidden = !state.user || name === 'signin';
    // When the quiz starts, close the profile panel so nothing distracts from the game;
    // if it is opened again during the quiz it is view-only.
    if (changed && name === 'quiz' && el.dlg.open) {
      el.dlg.close();
      toast('The quiz started — profile is view-only until it ends.', 'info', 3000);
    }
    applyProfileLock();
  }

  function resetToHome(message, type = 'info') {
    stopTimer();
    stopRevealCountdown();
    clearSession();
    state.room = null;
    state.question = null;
    state.phase = 'idle';
    state.answered = false;
    state.selected = null;
    showView('home');
    if (message) toast(message, type);
  }

  /* =========================================================================
   * 4. HOME: CREATE / JOIN
   * ======================================================================= */
  function setHomeError(message) {
    el.homeError.textContent = message || '';
  }

  /** Your name comes from your profile (the server uses the signed-in account, not this value). */
  function getValidName() {
    if (!state.user) {
      setHomeError('Please sign in first.');
      return null;
    }
    return state.user.displayName;
  }

  function getValidCode() {
    const code = el.codeInput.value.toUpperCase().replace(/[\s-]/g, '');
    if (!CODE_PATTERN.test(code)) {
      setHomeError('Room codes are 6 characters long, like K7P2XM.');
      el.codeInput.focus();
      return null;
    }
    return code;
  }

  function enterRoom(response) {
    saveSession({ code: response.code, playerId: response.playerId, token: response.token });
    setHomeError('');
    history.replaceState(null, '', location.pathname); // drop ?room=CODE from the address bar
    showView('lobby');
  }

  async function onCreateRoom() {
    setHomeError('');
    const name = getValidName();
    if (!name) return;
    setBusy(el.btnCreate, true);
    const response = await request('room:create', { name });
    setBusy(el.btnCreate, false);
    if (!response.ok) return setHomeError(response.error);
    enterRoom(response);
    return toast('Room created! Share the code with your friends.', 'success');
  }

  async function onJoinRoom(event) {
    event.preventDefault();
    setHomeError('');
    const name = getValidName();
    if (!name) return;
    const code = getValidCode();
    if (!code) return;
    setBusy(el.btnJoin, true);
    const response = await request('room:join', { name, code });
    setBusy(el.btnJoin, false);
    if (!response.ok) return setHomeError(response.error);
    enterRoom(response);
    return toast(`Joined room ${response.code}.`, 'success');
  }

  async function leaveRoom() {
    await request('room:leave');
    resetToHome('You left the room.');
  }

  /* =========================================================================
   * 5. WAITING ROOM
   * ======================================================================= */
  /** Gives each name its own stable avatar colour. */
  function hueFor(name) {
    let hue = 0;
    for (const ch of name) hue = (hue * 31 + ch.codePointAt(0)) % 360;
    return hue;
  }

  function renderLobby() {
    const room = state.room;
    if (!room) return;
    const me = myId();

    el.lobbyCode.textContent = room.code;
    el.playerCount.textContent = `${room.players.length} / ${room.maxPlayers}`;

    el.lobbyPlayers.replaceChildren();
    for (const player of room.players) {
      const item = h('li', 'player');
      if (!player.connected) item.classList.add('is-away');
      const avatar = h('span', 'avatar');
      paintAvatar(avatar, player.name, player.avatar);
      avatar.setAttribute('aria-hidden', 'true');
      const name = h('span', 'player-name', player.name);
      if (player.id === me) name.append(h('span', 'tag', 'You'));
      if (player.isHost) name.append(h('span', 'tag tag-host', 'Host'));
      if (!player.connected) name.append(h('span', 'tag tag-away', 'Reconnecting…'));
      item.append(avatar, name);
      el.lobbyPlayers.appendChild(item);
    }

    const isHost = room.hostId === me;
    const host = room.players.find((p) => p.id === room.hostId);
    el.btnStart.hidden = !isHost || room.state !== 'lobby';
    if (isHost) {
      el.lobbyWait.textContent =
        room.players.length < 2
          ? 'You can start alone to try it out, or wait for friends to join.'
          : 'Everyone here? Press Start Quiz when you are ready.';
    } else {
      el.lobbyWait.textContent = host ? `Waiting for ${host.name} to start the quiz…` : 'Waiting for the host…';
    }
  }

  async function onStartQuiz() {
    setBusy(el.btnStart, true);
    const response = await request('game:start');
    setBusy(el.btnStart, false);
    if (!response.ok) toast(response.error, 'error');
  }

  /* =========================================================================
   * 6. QUIZ
   * ======================================================================= */
  function renderQuestion(question) {
    el.qNumber.textContent = question.number;
    el.qTotal.textContent = question.total;
    el.questionText.textContent = question.text;
    el.options.replaceChildren();
    question.options.forEach((text, index) => {
      const button = h('button', 'option');
      button.type = 'button';
      button.dataset.index = String(index);
      button.append(h('span', 'option-key', OPTION_LETTERS[index]), h('span', 'option-text', text));
      button.addEventListener('click', () => submitAnswer(index));
      el.options.appendChild(button);
    });
  }

  const optionButtons = () => [...el.options.querySelectorAll('.option')];

  function setOptionsDisabled(disabled) {
    for (const button of optionButtons()) button.disabled = disabled;
  }

  function setStatus(message, tone) {
    el.quizStatus.textContent = message;
    el.quizStatus.classList.toggle('is-good', tone === 'good');
    el.quizStatus.classList.toggle('is-bad', tone === 'bad');
  }

  // ---- The visual countdown (the server's timer is the official one) ----------
  function stopTimer() {
    clearInterval(state.timerId);
    state.timerId = null;
  }

  function tick() {
    const left = Math.max(0, state.timerEndsAt - performance.now());
    el.timerFill.style.transform = `scaleX(${left / state.timerDuration})`;
    el.timerText.textContent = String(Math.ceil(left / 1000));
    el.timer.classList.toggle('is-danger', left <= 5000);
    if (left === 0) {
      stopTimer();
      if (state.phase === 'question') {
        setOptionsDisabled(true);
        if (!state.answered) setStatus("Time's up! Waiting for the results…", 'bad');
      }
    }
  }

  function startTimer(remainingMs, durationMs) {
    stopTimer();
    state.timerDuration = Math.max(1, durationMs);
    state.timerEndsAt = performance.now() + remainingMs;
    tick();
    if (remainingMs > 0) state.timerId = setInterval(tick, 100);
  }

  function stopRevealCountdown() {
    clearInterval(state.revealId);
    state.revealId = null;
    el.quizNext.textContent = '';
  }

  function startRevealCountdown(ms, isLast) {
    stopRevealCountdown();
    const endsAt = performance.now() + ms;
    const update = () => {
      const seconds = Math.max(0, Math.ceil((endsAt - performance.now()) / 1000));
      el.quizNext.textContent = isLast ? `Final results in ${seconds}s…` : `Next question in ${seconds}s…`;
    };
    update();
    state.revealId = setInterval(update, 250);
  }

  async function submitAnswer(index) {
    if (state.phase !== 'question' || state.answered || !state.question) return;
    if (performance.now() >= state.timerEndsAt) return; // visual timer already hit zero

    // Lock the buttons straight away so a double-click cannot send two answers.
    state.answered = true;
    state.selected = index;
    setOptionsDisabled(true);
    optionButtons()[index].classList.add('selected');
    setStatus(`You chose ${OPTION_LETTERS[index]}. Sending…`);

    const questionIndex = state.question.index;
    const response = await request('answer:submit', { questionIndex, choice: index });

    // The reply can arrive after the question already ended (or a new one began).
    // In that case the result screen owns the display, so leave it alone.
    if (state.phase !== 'question' || !state.question || state.question.index !== questionIndex) return;

    if (response.ok || response.code === 'already_answered') {
      setStatus(`Answer ${OPTION_LETTERS[index]} locked in! Waiting for the others…`);
    } else if (response.local && performance.now() < state.timerEndsAt) {
      // The message never reached the server (connection problem): let the player try again.
      state.answered = false;
      state.selected = null;
      optionButtons()[index].classList.remove('selected');
      setOptionsDisabled(false);
      setStatus('');
      toast(response.error, 'error');
    } else {
      setStatus(response.error, 'bad');
      toast(response.error, 'error');
    }
  }

  function showQuestion(question) {
    stopRevealCountdown();
    state.question = question;
    state.phase = 'question';
    state.answered = false;
    state.selected = null;
    renderQuestion(question);
    setStatus('Pick your answer — press 1–4 or A–D on a keyboard.');
    el.answeredCount.textContent = '0 / 0 answered';
    showView('quiz');
    el.quizProgress.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
    startTimer(question.remainingMs, question.durationMs);
    if (state.room) renderLeaderboard(el.liveLeaderboard, state.room.leaderboard, { showDelta: false });
  }

  function showResult(result) {
    stopTimer();
    state.phase = 'reveal';
    showView('quiz');

    // If we joined late (re-connected), the question may not be on screen yet.
    if (!state.question || state.question.index !== result.index) {
      state.question = { index: result.index, number: result.number, total: result.total, text: result.text, options: result.options };
      renderQuestion(state.question);
    }

    const mine = result.leaderboard.find((entry) => entry.id === myId());
    const choice = mine ? mine.choice : null;
    state.answered = true;
    state.selected = choice;

    const buttons = optionButtons();
    buttons.forEach((button, index) => {
      button.disabled = true;
      button.classList.remove('selected');
      if (index === result.correctIndex) {
        button.classList.add('correct');
        button.append(h('span', 'option-tag', '✓ Correct'));
      } else if (index === choice) {
        button.classList.add('wrong');
        button.append(h('span', 'option-tag', '✗ Your answer'));
      } else {
        button.classList.add('dim');
      }
    });

    const correctLetter = OPTION_LETTERS[result.correctIndex];
    if (choice === null) setStatus(`No answer this time. The correct answer was ${correctLetter}.`, 'bad');
    else if (choice === result.correctIndex) setStatus(`Correct! +${mine.pointsEarned} points`, 'good');
    else setStatus(`Not quite — the correct answer was ${correctLetter}.`, 'bad');

    el.timerFill.style.transform = 'scaleX(0)';
    el.timerText.textContent = '0';
    el.timer.classList.remove('is-danger');

    renderLeaderboard(el.liveLeaderboard, result.leaderboard, { showDelta: true });
    startRevealCountdown(result.revealMs, result.isLast);
  }

  /* =========================================================================
   * 7. LEADERBOARDS & FINAL RESULTS
   * ======================================================================= */
  function renderLeaderboard(list, entries, { showDelta = false, final = false, winnerIds = [], total = 0 } = {}) {
    list.replaceChildren();
    list.classList.toggle('show-delta', showDelta);
    for (const entry of entries) {
      const item = h('li', 'lb-row');
      const isWinner = final && winnerIds.includes(entry.id);
      if (entry.id === myId()) item.classList.add('is-me');
      if (!entry.connected) item.classList.add('is-away');
      if (isWinner) item.classList.add('is-winner');

      const rank = h('span', 'lb-rank', isWinner ? '🏆' : String(entry.rank));
      if (isWinner) {
        rank.setAttribute('role', 'img');
        rank.setAttribute('aria-label', `Rank ${entry.rank}, winner`);
      } else {
        rank.setAttribute('aria-label', `Rank ${entry.rank}`);
      }

      const avatar = h('span', 'avatar avatar-sm lb-avatar');
      paintAvatar(avatar, entry.name, entry.avatar);
      avatar.setAttribute('aria-hidden', 'true');

      const name = h('span', 'lb-name');
      const line = h('span', 'lb-name-line', entry.name);
      if (entry.id === myId()) line.append(h('span', 'tag', 'You'));
      if (!entry.connected) line.append(h('span', 'tag tag-away', 'Offline'));
      name.append(line);
      if (final) name.append(h('span', 'lb-sub', `${entry.correctCount} of ${total} correct`));

      item.append(rank, avatar, name);
      if (showDelta) {
        const gained = entry.pointsEarned > 0;
        item.append(h('span', `lb-delta${gained ? ' gain' : ''}`, `+${entry.pointsEarned}`));
      }
      item.append(h('span', 'lb-score', String(entry.score)));
      list.appendChild(item);
    }
  }

  function renderResultsControls() {
    const isHost = state.room && state.room.hostId === myId();
    el.btnPlayAgain.disabled = !isHost;
    el.resultsWait.textContent = isHost ? 'Play Again sends everyone back to the waiting room.' : 'Waiting for the host to start a new game…';
  }

  function showFinalResults(results) {
    stopTimer();
    stopRevealCountdown();
    state.phase = 'finished';
    state.question = null;
    showView('results');

    renderLeaderboard(el.finalLeaderboard, results.leaderboard, {
      final: true,
      winnerIds: results.winnerIds,
      total: results.totalQuestions,
    });

    const winners = results.leaderboard.filter((entry) => results.winnerIds.includes(entry.id));
    el.trophyHero.hidden = winners.length === 0;
    if (winners.length === 0) {
      el.resultsSubtitle.textContent = 'Nobody scored this time — better luck next round!';
    } else if (winners.length === 1) {
      const [winner] = winners;
      el.resultsSubtitle.textContent =
        winner.id === myId() ? `You won with ${winner.score} points! 🎉` : `${winner.name} wins with ${winner.score} points!`;
    } else {
      el.resultsSubtitle.textContent = `It's a tie! ${winners.map((w) => w.name).join(', ')} share first place with ${winners[0].score} points.`;
    }

    const mine = results.leaderboard.find((entry) => entry.id === myId());
    el.resultsMe.textContent = mine ? `You finished #${mine.rank} with ${mine.score} points (${mine.correctCount} of ${results.totalQuestions} correct).` : '';
    renderResultsControls();
  }

  async function onPlayAgain() {
    setBusy(el.btnPlayAgain, true);
    const response = await request('game:playAgain');
    setBusy(el.btnPlayAgain, false);
    if (!response.ok) toast(response.error, 'error');
  }

  /* =========================================================================
   * 8. SOCKET.IO EVENTS
   * ======================================================================= */
  if (typeof io !== 'function') {
    el.bannerText.textContent = 'Could not load the connection library. Please refresh the page.';
    el.banner.hidden = false;
    return;
  }
  const socket = io({ autoConnect: false }); // same origin as the page; we connect after sign-in

  socket.on('connect', async () => {
    el.banner.hidden = true;
    if (state.wasDisconnected) {
      state.wasDisconnected = false;
      toast('Back online.', 'success', 2500);
    }
    // If we were in a room (page refresh or network drop), ask for our seat back.
    if (!state.session) return;
    const response = await request('room:rejoin', { code: state.session.code, token: state.session.token });
    if (response.ok) {
      state.session.playerId = response.playerId;
      if (state.view === 'home') showView('lobby');
    } else if (!response.local) {
      resetToHome(response.error || 'Could not rejoin your room.');
    }
  });

  socket.on('disconnect', (reason) => {
    state.wasDisconnected = true;
    el.bannerText.textContent = 'Connection lost. Trying to reconnect…';
    el.banner.hidden = false;
    if (reason === 'io server disconnect') socket.connect();
  });

  socket.on('connect_error', (err) => {
    if (err && err.message === 'unauthorized') {
      // Our login cookie is missing or expired.
      el.banner.hidden = true;
      clearSession();
      showSignin('Your session ended. Please sign in again.');
      return;
    }
    state.wasDisconnected = true;
    el.bannerText.textContent = err && err.message && err.message.startsWith('Too many') ? err.message : "Can't reach the server. Retrying…";
    el.banner.hidden = false;
  });

  socket.on('room:update', (room) => {
    const previous = state.room;
    state.room = room;

    if (previous && previous.code === room.code) {
      if (previous.hostId !== room.hostId) {
        const host = room.players.find((p) => p.id === room.hostId);
        if (host) toast(host.id === myId() ? 'You are now the host.' : `${host.name} is now the host.`, 'info');
      }
      if (state.view === 'lobby') {
        const before = new Set(previous.players.map((p) => p.id));
        const now = new Set(room.players.map((p) => p.id));
        for (const p of room.players) if (!before.has(p.id) && p.id !== myId()) toast(`${p.name} joined the room.`, 'info', 2500);
        for (const p of previous.players) if (!now.has(p.id)) toast(`${p.name} left the room.`, 'info', 2500);
      }
    }

    renderLobby();
    if (state.view === 'quiz' && state.phase === 'question') renderLeaderboard(el.liveLeaderboard, room.leaderboard, { showDelta: false });
    if (state.view === 'results') renderResultsControls();
  });

  socket.on('question:new', showQuestion);

  socket.on('answers:count', ({ answered, total }) => {
    el.answeredCount.textContent = `${answered} / ${total} answered`;
  });

  socket.on('answer:locked', ({ index, choice }) => {
    // Sent after a reconnect: the server already has our answer for this question.
    if (!state.question || state.question.index !== index) return;
    state.answered = true;
    state.selected = choice;
    setOptionsDisabled(true);
    const button = optionButtons()[choice];
    if (button) button.classList.add('selected');
    setStatus(`Answer ${OPTION_LETTERS[choice]} locked in! Waiting for the others…`);
  });

  socket.on('question:result', showResult);
  socket.on('game:finished', showFinalResults);

  socket.on('room:reset', () => {
    stopTimer();
    stopRevealCountdown();
    state.phase = 'idle';
    state.question = null;
    showView('lobby');
    toast('Back in the waiting room.', 'info', 2500);
  });

  socket.on('room:closed', ({ reason }) => resetToHome(reason || 'The room was closed.'));

  /* =========================================================================
   * 8b. ACCOUNT: GOOGLE SIGN-IN, PROFILE PANEL, PHOTO UPLOAD
   * ======================================================================= */
  /** Fetch wrapper: always resolves to { ok, status, data } and never throws. */
  async function api(path, { method = 'GET', json, body, headers = {} } = {}) {
    try {
      const options = { method, credentials: 'same-origin', headers: { ...headers } };
      if (json !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(json);
      } else if (body !== undefined) {
        options.body = body;
      }
      const res = await fetch(path, options);
      let data = {};
      try {
        data = await res.json();
      } catch (err) {
        /* empty body */
      }
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return { ok: false, status: 0, data: { error: 'Could not reach the server. Check your connection.' } };
    }
  }

  /** Draws a profile picture, or a coloured circle with the first letter if there is none. */
  function paintAvatar(node, name, picture) {
    const initial = ([...(name || '?')][0] || '?').toUpperCase();
    node.replaceChildren();
    node.style.setProperty('--hue', hueFor(name || '?'));
    if (!picture) {
      node.textContent = initial;
      return;
    }
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => node.replaceChildren(document.createTextNode(initial)));
    img.src = picture;
    node.appendChild(img);
  }

  /** Updates every place that shows "me": header button, home card, profile panel. */
  function renderUser() {
    const user = state.user;
    if (!user) return;
    paintAvatar(el.headerAvatar, user.displayName, user.picture);
    el.headerName.textContent = user.displayName;
    el.profileBtn.setAttribute('aria-label', `Open my profile (${user.displayName})`);
    paintAvatar(el.homeAvatar, user.displayName, user.picture);
    el.homeName.textContent = user.displayName;
    el.profileBtn.hidden = state.view === 'signin';

    paintAvatar(el.dlgAvatar, user.displayName, user.picture);
    el.dlgEmail.textContent = user.username ? `${user.email} · @${user.username}` : user.email;
    el.btnPhotoRemove.hidden = !user.hasCustomPicture;
    const stats = user.stats || {};
    el.statGames.textContent = String(stats.games || 0);
    el.statWins.textContent = String(stats.wins || 0);
    el.statBest.textContent = String(stats.bestScore || 0);
    el.statCorrect.textContent = String(stats.correctAnswers || 0);
  }

  // ---- Sign-in screen -------------------------------------------------------
  let googleLoading = null;
  function loadGoogleScript() {
    if (googleLoading) return googleLoading;
    googleLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Google script blocked'));
      document.head.appendChild(script);
    });
    return googleLoading;
  }

  async function onGoogleCredential(response) {
    el.signinError.textContent = '';
    const result = await api('/auth/google', { method: 'POST', json: { credential: response.credential } });
    if (!result.ok) {
      el.signinError.textContent = result.data.error || 'Google sign-in failed. Please try again.';
      return;
    }
    signedIn(result.data.user);
  }

  async function showSignin(message) {
    state.user = null;
    showView('signin');
    el.signinError.textContent = message || '';

    const code = new URLSearchParams(location.search).get('room');
    el.signinInvite.hidden = !code;
    if (code) el.signinInvite.textContent = `You were invited to room ${code.toUpperCase().slice(0, 6)}. Sign in to join it.`;

    if (!state.config) {
      const config = await api('/api/config');
      state.config = config.ok ? config.data : { googleClientId: null, devLogin: false };
    }
    el.devLogin.hidden = !state.config.devLogin;

    if (!state.config.googleClientId) {
      el.signinStatus.textContent = state.config.devLogin
        ? 'Google sign-in is not configured (no GOOGLE_CLIENT_ID). Use the test login below.'
        : 'Google sign-in is not set up on this server yet. The site owner needs to add GOOGLE_CLIENT_ID.';
      return;
    }
    try {
      await loadGoogleScript();
      window.google.accounts.id.initialize({
        client_id: state.config.googleClientId,
        callback: onGoogleCredential,
        auto_select: false,
      });
      el.googleButton.replaceChildren();
      window.google.accounts.id.renderButton(el.googleButton, {
        theme: 'filled_black',
        size: 'medium', // compact: Google's 32 px-high button (the logo scales with it)
        text: 'continue_with',
        shape: 'rectangular',
        width: Math.min(260, Math.max(200, el.googleButton.clientWidth || 260)),
      });
      el.signinStatus.textContent = '';
    } catch (err) {
      el.signinStatus.textContent = 'Could not load Google sign-in. Disable ad blockers for this site and refresh.';
    }
  }

  function signedIn(user) {
    state.user = user;
    renderUser();
    showView('home'); // if we were in a room, the re-join on connect moves us to the right screen
    if (state.session) {
      el.bannerText.textContent = 'Reconnecting to your room…';
      el.banner.hidden = false;
    }
    if (!socket.connected) socket.connect();
  }

  async function bootstrap() {
    const me = await api('/api/me');
    if (me.ok && me.data.user) signedIn(me.data.user);
    else showSignin();
  }

  // ---- Profile panel -------------------------------------------------------
  /** During a quiz the panel is view-only so players stay focused on the game. */
  const isQuizRunning = () => state.view === 'quiz';

  function applyProfileLock() {
    const locked = isQuizRunning();
    for (const field of [el.pfName, el.pfBio, el.pfLocation, el.pfTopic]) field.readOnly = locked;
    el.photoActions.hidden = locked;
    el.btnSave.hidden = locked;
    el.btnSignOut.hidden = locked;
    el.dlgLock.hidden = !locked;
    el.dlgLock.textContent = locked ? '🔒 Quiz in progress — your profile is view-only. Focus on the game!' : '';
  }

  function fillProfileForm() {
    const user = state.user;
    if (!user) return;
    el.pfName.value = user.displayName;
    el.pfBio.value = user.bio;
    el.pfLocation.value = user.location;
    el.pfTopic.value = user.favoriteTopic;
    el.pfBioCount.textContent = String([...user.bio].length);
    el.profileError.textContent = '';
    renderUser();
  }

  async function openProfile() {
    if (!state.user) return;
    fillProfileForm();
    applyProfileLock();
    if (!el.dlg.open) el.dlg.showModal();
    el.dlg.scrollTop = 0; // always start at the top (the photo and stats)
    // Refresh the stats in the background (they change after every game).
    const me = await api('/api/me');
    if (me.ok && me.data.user && state.user) {
      state.user.stats = me.data.user.stats;
      renderUser();
    }
  }

  async function onSaveProfile(event) {
    event.preventDefault();
    if (isQuizRunning()) return;
    el.profileError.textContent = '';
    const displayName = el.pfName.value.replace(/\s+/g, ' ').trim();
    if (!displayName || [...displayName].length > MAX_NAME_LENGTH || !NAME_PATTERN.test(displayName)) {
      el.profileError.textContent = `Display names must be 1–${MAX_NAME_LENGTH} characters: letters, numbers, spaces and . _ ' - only.`;
      el.pfName.focus();
      return;
    }
    setBusy(el.btnSave, true);
    const result = await api('/api/profile', {
      method: 'PUT',
      json: { displayName, bio: el.pfBio.value, location: el.pfLocation.value, favoriteTopic: el.pfTopic.value },
    });
    setBusy(el.btnSave, false);
    if (!result.ok) {
      el.profileError.textContent = result.data.error || 'Could not save your profile.';
      return;
    }
    state.user = result.data.user;
    fillProfileForm();
    toast('Profile saved.', 'success', 2500);
  }

  // ---- Photo upload: crop to a square, shrink to 256 px, send as a small JPEG ------
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read failed'));
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error('decode failed'));
        img.src = reader.result; // a data: URL (allowed by our security policy)
      };
      reader.readAsDataURL(file);
    });
  }

  async function imageToSquareJpeg(file, size = 256) {
    let picture;
    try {
      const bitmap = await createImageBitmap(file); // also applies the photo's rotation
      picture = { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch (err) {
      picture = await loadImage(file);
    }
    const side = Math.min(picture.width, picture.height);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // PNGs with transparency get a white background
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(picture.source, (picture.width - side) / 2, (picture.height - side) / 2, side, side, 0, 0, size, size);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/jpeg', 0.85);
    });
  }

  async function onPhotoChosen() {
    const file = el.photoInput.files && el.photoInput.files[0];
    el.photoInput.value = ''; // lets the same file be chosen again later
    if (!file || isQuizRunning()) return;
    el.profileError.textContent = '';
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      el.profileError.textContent = 'Please choose a JPEG, PNG or WebP image.';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      el.profileError.textContent = 'That image is too large (10 MB maximum).';
      return;
    }
    setBusy(el.btnPhoto, true);
    try {
      const blob = await imageToSquareJpeg(file);
      const result = await api('/api/profile/avatar', { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
      if (!result.ok) throw new Error(result.data.error || 'Upload failed.');
      state.user = result.data.user;
      renderUser();
      toast('Photo updated.', 'success', 2500);
    } catch (err) {
      el.profileError.textContent = err.message === 'decode failed' ? 'We could not read that image.' : err.message || 'Could not upload the photo.';
    } finally {
      setBusy(el.btnPhoto, false);
    }
  }

  async function onRemovePhoto() {
    if (isQuizRunning()) return;
    const result = await api('/api/profile/avatar', { method: 'DELETE' });
    if (!result.ok) {
      el.profileError.textContent = result.data.error || 'Could not remove the photo.';
      return;
    }
    state.user = result.data.user;
    renderUser();
    toast('Photo removed.', 'info', 2500);
  }

  async function onSignOut() {
    if (isQuizRunning()) return;
    setBusy(el.btnSignOut, true);
    await api('/auth/logout', { method: 'POST' });
    clearSession();
    try {
      if (window.google && window.google.accounts) window.google.accounts.id.disableAutoSelect();
    } catch (err) {
      /* ignore */
    }
    location.assign(location.pathname); // fresh start on the sign-in screen
  }

  // ---- Email + password: tabs, sign up, sign in ----------------------------------
  function setAuthTab(which) {
    const signup = which === 'signup';
    el.loginForm.hidden = signup;
    el.signupForm.hidden = !signup;
    el.tabLogin.classList.toggle('is-active', !signup);
    el.tabSignup.classList.toggle('is-active', signup);
    el.tabLogin.setAttribute('aria-selected', String(!signup));
    el.tabSignup.setAttribute('aria-selected', String(signup));
    el.tabLogin.tabIndex = signup ? -1 : 0;
    el.tabSignup.tabIndex = signup ? 0 : -1;
    el.signinError.textContent = '';
  }

  async function onLogin(event) {
    event.preventDefault();
    el.signinError.textContent = '';
    const identifier = el.loginId.value.trim();
    const password = el.loginPassword.value;
    if (!identifier || !password) {
      el.signinError.textContent = 'Enter your email (or username) and your password.';
      return;
    }
    setBusy(el.btnLogin, true);
    const result = await api('/auth/login', { method: 'POST', json: { identifier, password } });
    setBusy(el.btnLogin, false);
    if (!result.ok) {
      el.signinError.textContent = result.data.error || 'Sign-in failed. Please try again.';
      el.loginPassword.select();
      return;
    }
    el.loginPassword.value = '';
    signedIn(result.data.user);
  }

  async function onSignup(event) {
    event.preventDefault();
    el.signinError.textContent = '';
    const username = el.signupUsername.value.trim();
    const email = el.signupEmail.value.trim();
    const password = el.signupPassword.value;
    let problem = '';
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) problem = 'Usernames are 3–20 characters: letters, numbers and underscores only.';
    else if (!/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(email)) problem = 'Please enter a valid email address.';
    else if (password.length < 8) problem = 'Your password must be at least 8 characters.';
    else if (password !== el.signupConfirm.value) problem = 'The two passwords do not match.';
    if (problem) {
      el.signinError.textContent = problem;
      return;
    }
    setBusy(el.btnSignup, true);
    const result = await api('/auth/signup', { method: 'POST', json: { username, email, password } });
    setBusy(el.btnSignup, false);
    if (!result.ok) {
      el.signinError.textContent = result.data.error || 'Could not create the account. Please try again.';
      return;
    }
    el.signupPassword.value = '';
    el.signupConfirm.value = '';
    signedIn(result.data.user);
    toast(`Welcome, ${result.data.user.displayName}! Your account is ready.`, 'success', 3500);
  }

  async function onDevLogin(event) {
    event.preventDefault();
    el.signinError.textContent = '';
    const result = await api('/auth/dev', { method: 'POST', json: { name: el.devName.value } });
    if (!result.ok) {
      el.signinError.textContent = result.data.error || 'Test sign-in failed.';
      return;
    }
    signedIn(result.data.user);
  }

  el.profileBtn.addEventListener('click', openProfile);
  el.btnEditProfile.addEventListener('click', openProfile);
  el.dlgClose.addEventListener('click', () => el.dlg.close());
  el.dlg.addEventListener('click', (event) => {
    if (event.target === el.dlg) el.dlg.close(); // click on the dark backdrop
  });
  el.profileForm.addEventListener('submit', onSaveProfile);
  el.btnPhoto.addEventListener('click', () => el.photoInput.click());
  el.photoInput.addEventListener('change', onPhotoChosen);
  el.btnPhotoRemove.addEventListener('click', onRemovePhoto);
  el.btnSignOut.addEventListener('click', onSignOut);
  el.devLogin.addEventListener('submit', onDevLogin);
  el.loginForm.addEventListener('submit', onLogin);
  el.signupForm.addEventListener('submit', onSignup);
  el.tabLogin.addEventListener('click', () => setAuthTab('login'));
  el.tabSignup.addEventListener('click', () => setAuthTab('signup'));
  for (const tab of [el.tabLogin, el.tabSignup]) {
    tab.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const next = tab === el.tabLogin ? el.tabSignup : el.tabLogin;
        setAuthTab(next === el.tabSignup ? 'signup' : 'login');
        next.focus();
      }
    });
  }
  el.showPasswords.addEventListener('change', () => {
    const type = el.showPasswords.checked ? 'text' : 'password';
    for (const input of [el.loginPassword, el.signupPassword, el.signupConfirm]) input.type = type;
  });
  el.pfBio.addEventListener('input', () => {
    el.pfBioCount.textContent = String([...el.pfBio.value].length);
  });

  /* =========================================================================
   * 9. START-UP: wire up the buttons
   * ======================================================================= */
  el.btnCreate.addEventListener('click', onCreateRoom);
  el.joinForm.addEventListener('submit', onJoinRoom);
  el.btnStart.addEventListener('click', onStartQuiz);
  el.btnPlayAgain.addEventListener('click', onPlayAgain);
  el.btnLeaveLobby.addEventListener('click', leaveRoom);
  el.btnLeaveResults.addEventListener('click', leaveRoom);
  el.btnLeaveQuiz.addEventListener('click', () => {
    if (window.confirm('Leave the game? You will not be able to rejoin this round.')) leaveRoom();
  });
  el.btnCopyCode.addEventListener('click', () => state.room && copyText(state.room.code, 'Room code copied!'));
  el.btnCopyLink.addEventListener('click', () => {
    if (state.room) copyText(`${location.origin}/?room=${state.room.code}`, 'Invite link copied!');
  });

  // Keep the code box tidy: uppercase, no spaces.
  el.codeInput.addEventListener('input', () => {
    el.codeInput.value = el.codeInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  });

  // Keyboard shortcuts while a question is open: 1-4 or A-D.
  document.addEventListener('keydown', (event) => {
    if (el.dlg.open) return; // typing in the profile panel must never answer a question
    if (state.view !== 'quiz' || state.phase !== 'question' || state.answered || !state.question) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const keyMap = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };
    const index = keyMap[event.key.toLowerCase()];
    if (index !== undefined && index < state.question.options.length) {
      event.preventDefault();
      submitAnswer(index);
    }
  });

  // An invite link like  https://site/?room=K7P2XM  pre-fills the room code.
  const invited = new URLSearchParams(location.search).get('room');
  if (invited) {
    el.codeInput.value = invited.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setHomeError('');
  }
  state.session = loadSession(); // a re-join is attempted as soon as the socket connects
  bootstrap();
})();
