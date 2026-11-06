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
├── database.js         ← SQLite: tables, seeding, random picking, users, sessions, results
├── auth.js             ← Google sign-in, sessions, profile + photo routes
├── questions-bank.js   ← 219 built-in questions in 7 categories (edit to add more)
├── requirements.md     ← this guide
├── .env.example        ← list of settings (copy to .env for local Google sign-in)
├── .gitignore
├── public/             ← everything the browser downloads
│   ├── index.html      ← all screens (sign-in, home, waiting room, quiz, results) + profile panel
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
[db] Added 219 new questions to .../data/quiz.db
QuizBattle is running (219 questions in .../data/quiz.db)
  Local:    http://localhost:3000
  Network:  http://192.168.x.x:3000   (phones/computers on the same Wi-Fi)
```

Open <http://localhost:3000>. You will see the sign-in page — set up Google first (section 4b) or use the
`DEV_LOGIN` test login. Stop the server with `Ctrl+C`.
During development `npm run dev` restarts the server automatically when you save a file.

**If `npm install` fails on `better-sqlite3`:** it normally downloads a ready-made binary.
If that is not possible for your Node version, install a build toolchain
(Windows: "Desktop development with C++" from the Visual Studio Build Tools;
macOS: `xcode-select --install`; Linux: `sudo apt install build-essential python3`)
and run `npm install` again, or switch to the current Node LTS.

---

## 4b. Accounts: email + password, and Google sign-in

Players must sign in. The sign-in page has two tabs — **Sign in** (existing accounts) and **Create account**
(username, email, password) — and a **Continue with Google** button as the alternative.
Email + password works with no setup at all; Google needs the Client ID below. Players get a profile (display name, bio, location,
favorite topic, photo, game stats) with a profile button in the top-right corner of every screen.
During a quiz the profile is **view-only** (the server refuses edits too), so players stay focused.

### How email + password accounts work
- **Username:** 3–20 letters, numbers or underscores (unique, not case-sensitive). It becomes the first display name.
- **Sign in** with either the email or the username, plus the password (minimum 8 characters).
- Passwords are stored only as a salted **scrypt** hash — never as text, not even for the site owner.
- 5 wrong passwords for the same account from the same network pause sign-in for 15 minutes.
- **Emails are not verified** and there is **no "forgot password"** yet (both need an email-sending service).
  A player who forgets their password creates a new account, or uses Google. If the real owner of an email
  later signs in with Google, that account is linked to their Google login and the password is deleted.

### Get your Google Client ID (free, about 10 minutes)
1. Go to <https://console.cloud.google.com> and sign in. Create a **new project** (top bar → project picker → New Project).
2. Open **APIs & Services → OAuth consent screen** (Google now calls this area **Google Auth Platform**).
   Click **Get started**, enter an app name (e.g. QuizBattle) and your email, choose **External**, finish.
3. Open **Clients** (or **Credentials → Create credentials → OAuth client ID**) → **Create client**:
   - Application type: **Web application**
   - **Authorized JavaScript origins** — add each address you will use, exactly:
     `http://localhost:3000` and `http://localhost` (for testing on your computer) and
     `https://YOUR-APP.onrender.com` (your deployed site, no trailing slash)
   - You do **not** need any "redirect URI".
4. Click **Create** and copy the **Client ID** (ends with `.apps.googleusercontent.com`). It is not a secret.
5. **Let your friends in:** in the consent-screen settings (**Audience**) either click **Publish app**
   (fine for the basic name/email/photo scopes — no review needed) or add each friend's Gmail as a **Test user**.
   While the app is in "Testing", only test users can sign in.

Google's console wording changes now and then — follow the closest matching option.

### Run locally with Google sign-in
1. Copy `.env.example` to a new file named `.env` and put your Client ID after `GOOGLE_CLIENT_ID=`.
2. Start with `npm run local` (instead of `npm start`) and open <http://localhost:3000>.

### Try it WITHOUT Google (local testing only)
You can simply **Create account** with any username/email/password — no setup needed. Or add
`DEV_LOGIN=true` to your `.env` and run `npm run local` for a one-click "pick any name" test login. It is **ignored when `NODE_ENV=production`**, so it can never be used on the hosted site.
Open a second browser (or incognito window) to sign in as a second player.

### On the hosted site
Add the environment variable `GOOGLE_CLIENT_ID` (plus the ones in section 6). Do **not** set `DEV_LOGIN` there.
If you change your site's address, add the new address under *Authorized JavaScript origins*.

### Where profile data lives
Profiles, photos and login sessions are stored in the same SQLite file as the questions (`data/quiz.db`).
On a free host the disk is wiped on every restart/redeploy: people just sign in with Google again
(one click) and get a fresh profile (name and photo from Google), but **bio, location, uploaded photos
and stats are lost**. To keep them, attach a persistent disk and set `DB_PATH` (see section 6).

---

## 5. Test multiplayer with two browser windows

1. Open <http://localhost:3000> in a normal window → sign in as **Alice** (Google, or the DEV_LOGIN test login) → **Create Room**.
2. Note the 6-character room code. (Try **Copy invite link** too.)
3. Open a second window — a private/incognito window, or another browser —
   at <http://localhost:3000> → sign in as **Bob** → enter the code → **Join Room**.
   Alice's player list updates instantly.
4. In Alice's window press **Start Quiz**. Both windows show the same question and a 15-second timer.
5. Answer in both windows. The "x / 2 answered" counter updates live. When both have answered
   the round ends early; otherwise the server ends it at 15 s.
6. After each question the correct answer is highlighted and the leaderboard shows `+10` / `+0`.
7. After the last question the results page shows the ranking and a 🏆 for the winner.
   Alice (host) can press **Play Again** to return everyone to the waiting room.

Things worth trying: join with a wrong code, or after the quiz has started; sign in as two players with the same display name (the second is shown as "Name 2"); open the profile panel mid-quiz (it is view-only);
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
  Quiz questions from `questions-bank.js` are re-created automatically, but stored game results are lost unless you attach
  a persistent disk/volume and point `DB_PATH` at it (e.g. `DB_PATH=/var/data/quiz.db`).
  Gameplay works fine without this.
- Use the `https://` URL; the app automatically uses secure WebSockets (`wss://`).

### Test the deployed site with multiple devices
1. Open the public URL on your laptop → create a room.
2. Open the same URL on your phone using **mobile data** (not your Wi-Fi) → join with the code.
   Or send the invite link to a friend in another city.
3. Play a full game; confirm both devices see the same questions and the final leaderboard.

---

## 7. Configuration (environment variables)

Only `GOOGLE_CLIENT_ID` is required (for sign-in); everything else is optional.

| Variable | Default | Meaning |
|---|---|---|
| `GOOGLE_CLIENT_ID` | – | **Required for sign-in.** Your Google OAuth Web client id |
| `DEV_LOGIN` | – | `true` = fake test login, local only (ignored in production) |
| `PORT` | `3000` | Port to listen on (hosting platforms set this for you) |
| `NODE_ENV` | – | Set to `production` when deployed |
| `TRUST_PROXY` | `false` | `true` behind a hosting proxy so per-IP limits see real visitor IPs |
| `DB_PATH` | `./data/quiz.db` | SQLite file location |
| `MAX_PLAYERS` | `50` | Players per room |
| `MIN_PLAYERS` | `1` | Players needed to start (set `2` to require company) |
| `QUESTIONS_PER_GAME` | `10` | Questions drawn from the database per game |
| `QUESTION_SECONDS` | `15` | Time to answer |
| `REVEAL_SECONDS` | `5` | How long each result is shown |
| `MAX_ROOMS` | `500` | Cap on simultaneous rooms |
| `MAX_CONNECTIONS_PER_IP` | `120` | Cap on connections from one IP |
| `CORS_ORIGIN` | – | Only if the frontend is on a different domain |

Locally you can set one inline, e.g. macOS/Linux `QUESTION_SECONDS=30 npm start`,
Windows PowerShell `$env:QUESTION_SECONDS=30; npm start`.

### Quiz topics (categories)
When creating a room the host picks a topic: **Technology, Geography, Science & Nature, History, Sports,
Entertainment, Society & Culture** — or **Mixed** (everything). The host can change the topic again in the
waiting room (e.g. before pressing *Play Again*). Each game draws `QUESTIONS_PER_GAME` random questions from that
topic, and a room never repeats a question until the topic is used up.

### Adding your own questions
Questions live in `questions-bank.js`, grouped by category. To add one, put a line inside the category you want:
`['Question?', 'CORRECT answer', 'wrong 1', 'wrong 2', 'wrong 3'],` and restart the server.
To add a whole **new category**, add `{ id: 'music', label: 'Music', description: '...' }` to `CATEGORIES`
and a `music: [ ... ]` list to `QUESTIONS` (same lowercase id).
Questions you insert by hand with SQL get the category `general` (they appear in *Mixed* only) unless you set one:
`UPDATE questions SET category = 'technology' WHERE id = 123;`

New questions are added to the database automatically and nothing is duplicated. The correct answer is
written first in the file, but the four answers are shuffled every game.

**Or use a SQLite tool:** install any SQLite tool (e.g. the "SQLite Viewer" VS Code extension or DB Browser for SQLite), open `data/quiz.db`
and insert rows. `correct_index` is 0–3 and points at `option_a`…`option_d`:

```sql
INSERT INTO questions (text, option_a, option_b, option_c, option_d, correct_index)
VALUES ('Which ocean is the largest?', 'Atlantic', 'Indian', 'Pacific', 'Arctic', 2);
```

Each game picks `QUESTIONS_PER_GAME` random questions and answer positions are shuffled. A room never repeats a question until most of the bank has been played, so more questions = more variety.
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
- **Rooms:** max 50 players; nobody can join after the quiz starts; codes are 6 characters from a
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

- Passwords: scrypt hash with a random salt per person, constant-time comparison, throttling after wrong
  attempts, and identical answers for "wrong password" and "no such account".
- Google ID tokens are verified on the server (signature, audience, verified email). Sessions use a random
  HttpOnly, SameSite=Lax (Secure on https) cookie; only its SHA-256 hash is stored. The server takes each
  player's name, photo and identity from the signed-in account, never from the browser.
- Profile text is length-checked on the server; uploaded photos are re-encoded to a 256 px JPEG in the browser
  and validated (type, size ≤ 200 KB) on the server. Photos are only served to signed-in users.
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
| Sign-in button missing / "Could not load Google sign-in" | Disable ad blockers for the site; check `GOOGLE_CLIENT_ID` is set and your site address is listed under *Authorized JavaScript origins*. |
| Google says "Access blocked" / "origin_mismatch" | The exact address in the browser bar must be listed under *Authorized JavaScript origins* (https, no trailing slash). In "Testing" mode add the person as a Test user or Publish the app. |
| "Too many connections from your network" | Many players behind one IP hit the cap: raise `MAX_CONNECTIONS_PER_IP` and set `TRUST_PROXY=true` on a hosting platform. |

---

## 11. Updating your live site (GitHub → Render)

Every time you change files on your computer:

```bash
git status                          # (optional) see what changed
git add .
git commit -m "Describe your change"
git push
```

Render redeploys automatically after each push (about 2–5 minutes). Watch the **Logs** tab until it says
`QuizBattle is running`, then refresh your site (use Ctrl+F5 to bypass the browser cache).

- **New environment variable?** Add it in Render → your service → **Environment**, then **Save** (it redeploys).
- **Keep `package-lock.json`** in the repo — it is created by `npm install` and makes builds reproducible.
- **Never commit `.env`** (it is already listed in `.gitignore`).
- **No Git?** On github.com open your repo → **Add file → Upload files**, drag in the changed files
  (same names and folders, e.g. `public/app.js`) and click **Commit changes**. Render redeploys from that too.
- **Made a mistake?** In Render open **Events/Deploys** and roll back to the previous deploy, or `git revert HEAD` and push.
