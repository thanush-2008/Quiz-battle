# QuizBattle — Setup, Testing & Deployment Guide

A real-time multiplayer quiz: players join a shared room with a code, answer the same
questions at the same time, and compete on a live leaderboard.

**Stack:** HTML/CSS/JavaScript · Node.js + Express · Socket.IO · SQLite (`better-sqlite3`)

---

## 1. Project structure (where every file goes)

```
QuizBattle/
├── package.json        ← dependencies and the `npm start` command
├── server.js           ← Express + Socket.IO server, all game rules
├── database.js         ← SQLite: tables, sample questions, saving results
├── requirements.md     ← this guide
├── .env.example        ← list of optional settings (documentation only)
├── .gitignore
├── public/             ← everything the browser downloads
│   ├── index.html      ← all 4 screens (home, waiting room, quiz, results)
│   ├── style.css       ← dark purple/cyan theme, responsive layout
│   └── app.js          ← browser logic, talks to the server with Socket.IO
└── data/
    └── quiz.db         ← created automatically the first time you run the server
```

`package-lock.json` and `node_modules/` are created by `npm install`.

---

## 2. Install Node.js

You need **Node.js 20 or newer** (the current LTS release is best).

| System | How |
|---|---|
| Windows / macOS | Download the **LTS** installer from <https://nodejs.org> and run it with the default options. |
| Linux | Use your package manager's recent Node, or `nvm`: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh \| bash` then `nvm install --lts`. |

Check it worked (open a **new** terminal first):

```bash
node -v    # should print v20.x or higher
npm -v
```

---

## 3. Open the project in Visual Studio Code

1. Install VS Code from <https://code.visualstudio.com>.
2. Put the `QuizBattle` folder somewhere easy, e.g. your Documents folder.
3. In VS Code: **File → Open Folder…** and choose `QuizBattle`
   (or, from a terminal inside the folder, run `code .`).
4. Open the built-in terminal: **Terminal → New Terminal** (shortcut ``Ctrl+` ``).

---

## 4. Install and run

In the VS Code terminal (you should be inside the `QuizBattle` folder):

```bash
npm install     # downloads Express, Socket.IO and better-sqlite3
npm start       # starts the server
```

You should see:

```
[db] Seeded 5 sample questions into .../data/quiz.db
QuizBattle is running (5 questions in .../data/quiz.db)
  Local:    http://localhost:3000
  Network:  http://192.168.x.x:3000   (phones/computers on the same Wi-Fi)
```

Open <http://localhost:3000>. Stop the server with `Ctrl+C`.
During development `npm run dev` restarts the server automatically when you save a file.

**If `npm install` fails on `better-sqlite3`:** it normally downloads a ready-made binary.
If that is not possible for your Node version, install a build toolchain
(Windows: "Desktop development with C++" from the Visual Studio Build Tools;
macOS: `xcode-select --install`; Linux: `sudo apt install build-essential python3`)
and run `npm install` again, or switch to the current Node LTS.

---

## 5. Test multiplayer with two browser windows

1. Open <http://localhost:3000> in a normal window → enter the name **Alice** → **Create Room**.
2. Note the 6-character room code. (Try **Copy invite link** too.)
3. Open a second window — a private/incognito window, or another browser —
   at <http://localhost:3000> → name **Bob** → enter the code → **Join Room**.
   Alice's player list updates instantly.
4. In Alice's window press **Start Quiz**. Both windows show the same question and a 15-second timer.
5. Answer in both windows. The "x / 2 answered" counter updates live. When both have answered
   the round ends early; otherwise the server ends it at 15 s.
6. After each question the correct answer is highlighted and the leaderboard shows `+10` / `+0`.
7. After question 5 the results page shows the ranking and a 🏆 for the winner.
   Alice (host) can press **Play Again** to return everyone to the waiting room.

Things worth trying: join with a wrong code, a duplicate name, or after the quiz has started;
close Bob's tab mid-quiz (he shows as *Offline*, the game continues); refresh Bob's tab
(he is put straight back in the room); close Alice's tab in the waiting room (Bob becomes host).

### Testing with phones on your Wi-Fi
Use the `Network:` address printed at start-up (e.g. `http://192.168.1.20:3000`) in the phone's browser.
Your computer's firewall may ask to allow Node.js — allow it for private networks.
(The **Copy** buttons use a fallback on plain `http://` pages, so they work here too.)

---

## 6. Deploy online

QuizBattle needs a host that runs a **long-lived Node.js process with WebSocket support**.
Serverless platforms (e.g. Vercel/Netlify functions) do **not** work for this.
Render, Railway, Fly.io and similar services do. Their dashboards change over time,
so treat the steps below as a checklist and follow the host's current docs for the exact clicks.

The app is already deployment-ready: it reads `PORT` from the environment, serves the frontend
and Socket.IO from the same origin, and contains no `localhost` addresses.

### Example: Render (Web Service)
1. Push the project to a GitHub repository (`.gitignore` already excludes `node_modules` and the database).
2. In Render: **New → Web Service** → connect the repository.
3. Settings:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Health check path:** `/healthz`
   - **Environment variables:** `NODE_ENV=production`, `TRUST_PROXY=true`
4. Deploy. You get a public `https://your-app.onrender.com` URL — that is the link everyone uses.

Railway and Fly.io work the same way: build `npm install`, start `npm start`, set the same variables.

### Important deployment notes
- **Run exactly one instance.** Active rooms live in server memory, so do not scale to several instances.
- **Free plans may "sleep"** after inactivity; the first visit then takes a while to wake up. Restarting the server ends any game in progress.
- **Saving results permanently:** on most platforms the disk is wiped on each deploy/restart.
  Quiz questions are re-created automatically, but stored game results are lost unless you attach
  a persistent disk/volume and point `DB_PATH` at it (e.g. `DB_PATH=/var/data/quiz.db`).
  Gameplay works fine without this.
- Use the `https://` URL; the app automatically uses secure WebSockets (`wss://`).

### Test the deployed site with multiple devices
1. Open the public URL on your laptop → create a room.
2. Open the same URL on your phone using **mobile data** (not your Wi-Fi) → join with the code.
   Or send the invite link to a friend in another city.
3. Play a full game; confirm both devices see the same questions and the final leaderboard.

---

## 7. Configuration (environment variables, all optional)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port to listen on (hosting platforms set this for you) |
| `NODE_ENV` | – | Set to `production` when deployed |
| `TRUST_PROXY` | `false` | `true` behind a hosting proxy so per-IP limits see real visitor IPs |
| `DB_PATH` | `./data/quiz.db` | SQLite file location |
| `MAX_PLAYERS` | `20` | Players per room |
| `MIN_PLAYERS` | `1` | Players needed to start (set `2` to require company) |
| `QUESTIONS_PER_GAME` | `5` | Questions drawn from the database per game |
| `QUESTION_SECONDS` | `15` | Time to answer |
| `REVEAL_SECONDS` | `5` | How long each result is shown |
| `MAX_ROOMS` | `500` | Cap on simultaneous rooms |
| `MAX_CONNECTIONS_PER_IP` | `40` | Cap on connections from one IP |
| `CORS_ORIGIN` | – | Only if the frontend is on a different domain |

Locally you can set one inline, e.g. macOS/Linux `QUESTION_SECONDS=30 npm start`,
Windows PowerShell `$env:QUESTION_SECONDS=30; npm start`.

### Adding your own questions
Install any SQLite tool (e.g. the "SQLite Viewer" VS Code extension or DB Browser for SQLite), open `data/quiz.db`
and insert rows. `correct_index` is 0–3 and points at `option_a`…`option_d`:

```sql
INSERT INTO questions (text, option_a, option_b, option_c, option_d, correct_index)
VALUES ('Which ocean is the largest?', 'Atlantic', 'Indian', 'Pacific', 'Arctic', 2);
```

Each game picks `QUESTIONS_PER_GAME` random questions, so more questions = more variety.
Finished games are stored in the `games` and `game_results` tables.

---

## 8. How the game works (rules)

- **Scoring:** correct = 10 points; wrong or no answer = 0. All scoring happens on the server.
- **Timer:** 15 seconds, controlled by the server. The countdown in the browser is only visual.
- **Early finish:** a question ends as soon as every connected player has answered.
- **Answers:** one per player per question; buttons lock after answering; late answers are rejected.
- **Correct answers** are never sent to browsers until the question has ended.
- **Ties:** players with equal scores share the same rank (1, 1, 3 …) and all tied for first get the 🏆.
  Within a tie, players are listed in the order they joined. If nobody scores, there is no winner.
- **Rooms:** max 20 players; nobody can join after the quiz starts; codes are 6 characters from a
  look-alike-free alphabet (no `0/O/1/I`) generated with a cryptographically secure random source.
- **Disconnects:** in the waiting room a dropped player keeps their seat for 15 s; mid-game they stay on
  the leaderboard marked *Offline* and can re-join (same tab) with a private token. If the host leaves,
  the longest-present player becomes host. Rooms with nobody connected are deleted after 30 s, and rooms
  idle for 30 minutes are closed; all timers are cleared with them.

### Socket.IO events

| Browser → server | Purpose |
|---|---|
| `room:create {name}` | Create a room (caller becomes host) |
| `room:join {name, code}` | Join a room in the waiting state |
| `room:rejoin {code, token}` | Recover your seat after a refresh/drop |
| `room:leave` | Leave for good |
| `game:start` | Host only |
| `answer:submit {questionIndex, choice}` | One answer per question |
| `game:playAgain` | Host only, after the final results |

| Server → browser | Purpose |
|---|---|
| `room:update` | Players, host, state, ranked leaderboard (no answers) |
| `question:new` | Question, 4 options, time remaining (no correct answer) |
| `answers:count` | "x / y answered" |
| `question:result` | Correct answer, per-player points, ranking |
| `game:finished` | Final ranking and winner(s) |
| `room:reset` / `room:closed` / `answer:locked` | Back to lobby / room gone / your answer was already recorded |

---

## 9. Security & reliability measures

- Names, room codes, choices and game state are validated **on the server**; the browser never sets scores.
- Player names are rendered with `textContent` (never `innerHTML`), and a strict Content-Security-Policy is sent.
- Only the host can start or restart; only players in the room can answer; duplicate and late answers are rejected.
- Per-socket rate limit (30 events / 10 s), per-IP connection cap, 10 KB message size limit, room cap.
- Private re-join tokens are never broadcast to other players.
- No passwords or accounts exist, so nothing sensitive is stored. If you add logins later, hash passwords
  (e.g. with `bcrypt` or `argon2`) — never store them in plain text.

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| `EADDRINUSE` / port already in use | Another program uses port 3000: stop it, or run with `PORT=3001`. |
| Phone can't open the Network address | Same Wi-Fi? Allow Node.js through the firewall; some guest Wi-Fi networks isolate devices. |
| "Can't reach the server. Retrying…" banner | The server stopped or the connection dropped; it reconnects automatically. |
| Deployed site works but players can't connect | Make sure the host supports WebSockets and runs a single always-on instance. |
| "Too many connections from your network" | Many players behind one IP hit the cap: raise `MAX_CONNECTIONS_PER_IP` and set `TRUST_PROXY=true` on a hosting platform. |
