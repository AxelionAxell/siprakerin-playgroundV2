# Siprakerin Playground V2

A web-based internship attendance dashboard — daily journal
submission (single-date and batch modes), history tracking.

> V1 run for a single date absen.

> V2 is batch-absen, example: 1-30 day absen in 5 sec

## Features

- **Login** — login page, each user signs in with their own
  `username@siprakerin.com` account.
- **Dashboard** — attendance rate, journal entry count, present days, internship
  progress, quick actions, and latest system logs.
- **Single-date attendance** — submit a journal for any date
  (no upper date limit; lower bound is Jan 5, 2026).
- **Batch Attendance** — fill many dates at once, processed sequentially
  one by one with live per-date progress + success/failure summary.
- **Automatic izin lanjutan** — if yesterday (H-1) was marked `izin`, yesterday's
  permission letter photo is reused automatically. You can still upload a fresh
  letter if you want.
- **Surat izin upload** — uploads to Supabase Storage (bucket `izin`), following
  the exact flow of the original platform.
- **History** — table of all submitted journals, status filter, search,
  record deletion.
- **System logs** — live terminal of all server activity, searchable and
  exportable to `.txt`.

## Requirements

- Node.js 18+
- A Supabase account (project URL + anon key)
- `username@siprakerin.com` user account registered in Supabase Auth

## How to Use

### Run locally (on your own machine)

**1. Clone & install**

```bash
git clone https://github.com/AxelionAxell/siprakerinplayground-main.git
cd siprakerin-playgroundV2

# install UI dependencies
cd ui && npm install && cd ..

# (optional) install automasi CLI dependencies
cd automasi && npm install && cd ..
```

**2. Fill in `.env`**

Create a `.env` file in the **root folder** (next to the `ui` folder), for example:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_anon_key_here
```
> Get ENV Here: https://grafikarsa.com/4rgandull/siprakerin-playground

> The V2 web app does **not** need `USER_EMAIL`/`USER_PASSWORD` in `.env` —
> every user logs in through the login page. The `.env` credentials are only
> used if you run the automasi CLI (`node automasi/index.js`).

**3. Build the CSS (required before the first run)**

```bash
cd ui
npm run build:css
```

Skipping this step will break the page styling.

**4. Run it**

```bash
cd ui
npm run dev      # dev mode (auto-restart)
# or
npm start        # production mode
```

Open `http://localhost:3000` — you will be redirected to the login page.
Enter your **username** (without `@siprakerin.com`, it is appended automatically)
and **password**, then sign in.

## Project Structure

```text
siprakerinplayground-v2/
├── automasi/
│   ├── index.js            # automasi CLI (daily cron, single-user via .env)
│   ├── src/
│   │   ├── auth.js         # CLI login + loginAs/createUserClient (web multi-user)
│   │   ├── config.js       # reads .env (SUPABASE_URL/KEY required, rest optional)
│   │   ├── journal.js      # all journal operations (used by CLI & web)
│   │   ├── requestContext.js # per-request Supabase client (AsyncLocalStorage)
│   │   └── utils.js        # batch helpers: buildBatchDates, runSequentialBatch
│   └── test/
│       └── batch.test.js
├── ui/
│   ├── server.js           # Express server: sessions, login/logout, API, rendering
│   ├── views/
│   │   ├── login.ejs       # login page
│   │   └── index.ejs       # main app
│   ├── src/input.css       # Tailwind source
│   └── public/output.css   # built CSS
└── README.md
```

### How the multi-user session works (in short)

Every authenticated request carries that user's own Supabase client
(created at login, stored in the session). `journal.js` automatically uses
the active client via `requestContext`, so every query/insert runs as the
logged-in user — never mixed up. CLI mode keeps using the legacy global
client like V1.

## Available Scripts

Run these inside the `ui` folder:

| Script              | What it does                          |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Dev server (nodemon, auto-restart)    |
| `npm start`         | Production server                     |
| `npm run build:css` | One-time Tailwind build               |
| `npm run watch:css` | Auto-rebuild CSS on changes           |

Run these inside the `automasi` folder:

| Script          | What it does                                  |
| --------------- | --------------------------------------------- |
| `npm test`      | Unit tests (batch dates, delay, sequential)   |
| `node index.js` | Daily automasi CLI (cron 16:00 WIB, Mon–Fri)  |


## Disclaimer

If you customize or modify the source code for personal gain, I am not responsible for any consequences that may arise.

## Credits

V1 was originally created by [Arga-12](https://github.com/Arga-12).
V2 AxelionAxell continues and expands on that work.
