# Falkirk Fury Basketball — Fixtures

A tiny, phone-friendly web app that turns the season fixtures spreadsheet into a clear list of games for **your** team — and lets you add them to your calendar (iPhone or anything else) in one tap.

No more scrolling across eight spreadsheet tabs to find when and where your team plays.

[![CI & Deploy](https://github.com/cameronmd/FalkirkFuryBasketballClub/actions/workflows/deploy.yml/badge.svg)](https://github.com/cameronmd/FalkirkFuryBasketballClub/actions/workflows/deploy.yml)

**Live app:** https://cameronmd.github.io/FalkirkFuryBasketballClub/

---

## Contents

- [What it does](#what-it-does)
- [Quick start (use it now)](#quick-start-use-it-now)
- [How the spreadsheet is read](#how-the-spreadsheet-is-read)
- [Architecture](#architecture)
- [Running locally](#running-locally)
- [Updating the fixtures](#updating-the-fixtures)
- [Testing](#testing)
- [CI/CD & deployment](#cicd--deployment)
- [Adding to your iPhone](#adding-to-your-iphone)
- [Notes & assumptions](#notes--assumptions)

---

## What it does

1. **Opens with this season's fixtures already loaded** — the bundled schedule appears straight away, no upload needed.
2. **Pick your team** — U14 Boys, U16 Girls, Senior Men, and so on.
3. **See the games** as clean cards, sorted by date: opponent, home/away, time, venue and round.
4. **Add to your calendar** — a single game, or all of them at once, as a standard `.ics` file. On iPhone this opens Apple Calendar with an "Add All" prompt. Each event uses the fixture's own venue, gets a reminder before tip-off, and a 2-hour block.

### Nice extras

- **Works offline & installable (PWA).** After the first visit it runs with no connection, and can be added to your home screen as an app.
- **Runs entirely in your browser.** Nothing is uploaded anywhere.
- **Home / away at a glance** — every card is colour-coded and each calendar event carries the real venue with a tappable Google Maps link.
- **View everyone** — opens on _All teams — every fixture_ (the whole club schedule) by default; pick a team to narrow it.
- **Filter** — show/hide **home** or **away** games, and hide games that have already passed.
- **Also playing today** — tap any game to see which other Fury teams are out on the same day (yours is highlighted) — handy for car-sharing and clashes.
- **Share** — send the whole season as a link (others open it ready to go, no spreadsheet needed), or share the fixtures on screen as text.
- **Upload a new spreadsheet** — when a fresh season sheet lands, tap **Change file** to load it; it replaces the bundled data on your device.
- **Remembers** your chosen team and any uploaded/shared fixtures, so next time you just open it.
- **Next game** shown at a glance.

---

## Quick start (use it now)

Open the [live app](https://cameronmd.github.io/FalkirkFuryBasketballClub/) (or `index.html` locally). This season's fixtures are already there — just pick your team from the dropdown. That's it.

---

## How the spreadsheet is read

The Fury fixtures workbook has **one sheet per team / age-group** (`U14MD1`, `U16W`, `SMD1`, …). Each sheet is a simple table:

| AGEGROUP | DATE (DD/MM/YY) | TIME (HH:MM) | LOCATION (FACILITY) | HOME | AWAY | ROUND |
| -------- | --------------- | ------------ | ------------------- | ---- | ---- | ----- |

The parser matches columns **by name** (not by position), so it survives small layout changes between seasons. For each row it reads the date, time, venue, round, and both sides. The club's own team is whichever side contains "**Fury**" — the other side becomes the **opposition**, and whether Fury are listed at home tells the app it's a **home** or **away** game.

Real-world quirks it handles:

- **`TBC`** dates, times and venues — the fixture is kept and shown as _TBC_, and simply isn't eligible for calendar export until it firms up.
- **String dates** like `20/03/27` as well as native Excel dates.
- **The sponsor name** — the team is listed as _"Signs Express Fury"_ in the sheet; detection keys off "Fury", so a sponsor change won't break it.
- **The friendly team names** (`U16W` → _U16 Girls_, `SMD1` → _Senior Men Div 1_) are derived from the sheet code in [`fixtures.js`](fixtures.js) (`teamLabel`).

If a future season changes the layout dramatically, the detection lives in [`parser.js`](parser.js) (`findHeaderRow` / `buildTeam`) and is covered by tests.

---

## Architecture

Plain HTML/CSS/vanilla JS — **no framework, no build step**. Logic is split into small pure modules (usable in both the browser and Node, so they're unit-testable) plus a thin DOM layer.

| File                   | Responsibility                                                        | Pure? |
| ---------------------- | --------------------------------------------------------------------- | :---: |
| `index.html`           | Page structure, loads scripts                                         |  —    |
| `styles.css`           | Mobile-first styling                                                  |  —    |
| `parser.js`            | Spreadsheet → data model (teams + fixtures, home/away, venues)        |  ✅   |
| `fixtures.js`          | Team labels, home/away logic, filtering/sorting, same-day teams       |  ✅   |
| `calendar.js`          | `.ics` generation (RFC 5545: floating local time, folding, VALARM)    |  ✅   |
| `share.js`             | Fixtures serialize/deserialize (share links + bundled data) + text    |  ✅   |
| `app.js`               | UI glue — DOM, events, persistence, settings, share links, files      |  —    |
| `sw.js`                | Service worker — offline app-shell cache                              |  —    |
| `manifest.webmanifest` | PWA manifest (name, icons, theme)                                     |  —    |
| `data/fixtures.json`   | The bundled season, generated from the spreadsheet by `tools/build-data.js` | — |

The spreadsheet library ([SheetJS](https://sheetjs.com/)) is vendored in `vendor/` so the app works offline.

**Data model** (produced by `parser.js`):

```js
{
  club: 'Falkirk Fury',
  season: '2026/27',
  teams: [
    { id: 'U16W', fixtures: [
      { row: 1, date: Date, time: { h: 15, m: 0 }, location: 'Grangemouth Sports Complex',
        home: 'Signs Express Fury', away: 'West Lothian Wolves',
        isHome: true, opponent: 'West Lothian Wolves', round: 3, rawDate: '', rawTime: '' },
      // …
    ] },
    // …
  ]
}
```

**Share links & the bundled season** use the same compact format (`share.js`). A share link encodes the whole season into the URL fragment (`#d=…`): the model is serialized, gzip-compressed via the browser's `CompressionStream`, and base64url-encoded. Opening such a link decodes it back with no spreadsheet needed. The bundled `data/fixtures.json` is that same serialized model, generated at build time and loaded on first visit. Nothing is ever sent to a server.

```
 spreadsheet ──▶ parser.js ──▶ model ──▶ fixtures.js ──▶ games ──▶ app.js ──▶ DOM
                     │                       │                       │
   tools/build-data.js writes                └───────────────────────┴──▶ calendar.js ──▶ .ics
   data/fixtures.json (bundled default)
```

Each pure module uses a small UMD wrapper: it attaches to `window` in the browser (`FuryParser`, `FuryFixtures`, `FuryCalendar`, `FuryShare`) and exports via `module.exports` under Node.

---

## Running locally

It's just static files. Either open `index.html` directly, or serve the folder:

```bash
npm start          # serves on http://localhost:4178
```

(`npm start` uses `npx http-server`; any static server works. Serving — rather than `file://` — is needed for the bundled `data/fixtures.json` fetch and the service worker.)

---

## Updating the fixtures

When a new season spreadsheet arrives, regenerate the bundled data:

```bash
npm install                          # dev-only: xlsx
node tools/build-data.js path/to/new.xlsx   # defaults to ./sample.xlsx
```

This rewrites `data/fixtures.json`; commit it and the live app updates on deploy. Users can also load a new sheet themselves via **Change file** without touching the repo.

---

## Testing

Unit tests use Node's **built-in test runner** — no dependencies, no install:

```bash
npm test           # runs node --test over the test/ folder
```

Covers:

- **`test/parser.test.js`** — header-row detection, header-by-name matching, fixture extraction, Fury-side/opposition resolution, home/away, `TBC` handling, date parsing (real dates, `dd/mm/yy`, named months), season inference.
- **`test/fixtures.test.js`** — team-code → friendly label, home/away info, per-team filtering/sorting, home/away & hide-past filters, all-teams mode, same-day-team detection, next game.
- **`test/calendar.test.js`** — title formatting (home `vs` / away `@`), venue-driven location + Maps link, ICS escaping, floating-local-time, RFC 5545 folding, event fields (duration, alarm, round, teams-that-day), calendar wrapping/filtering, CRLF endings, filenames.
- **`test/share.test.js`** — serialize/deserialize round-trip (incl. `TBC` and home/away), malformed-data handling, and fixture-list text formatting.

There's also an **optional integration test** that runs the parser against the real spreadsheet:

```bash
npm install
npm run test:integration
```

It expects a `sample.xlsx` in the project root. That file is **git-ignored** — drop the season workbook in to run it. The unit tests above are fully hermetic and need no spreadsheet.

---

## CI/CD & deployment

A single GitHub Actions workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) does both:

1. **`test`** job — runs `node --test` on every push and pull request.
2. **`deploy`** job — runs only on `main`, only after tests pass. It stages the static files (including `data/`), uploads them as a Pages artifact, and deploys.

The workflow enables GitHub Pages automatically on first run (`configure-pages` with `enablement: true`), so there's no manual repo setting to click. Every push to `main` redeploys in under a minute.

> **Note:** GitHub Pages on a free plan requires a **public** repository. Only source code and the public fixture list are published.

**If the first deploy fails** with a Pages-not-enabled error (some accounts restrict automatic enablement), enable it once by hand: **Settings → Pages → Build and deployment → Source → GitHub Actions**, then re-run the workflow.

**Other static hosts** (Netlify, Cloudflare Pages, Vercel) work too — just serve the repo root; there's nothing to build.

---

## Adding to your iPhone

Tapping **Add to calendar** downloads a `.ics` file; iOS opens it in Apple Calendar and asks which calendar to add to. Times are stored as *floating local time*, so there are no timezone surprises.

For an app-like experience: open the live URL in **Safari → Share → Add to Home Screen**. You'll get an icon on your home screen that opens the app full-screen.

If the season's fixtures are updated, re-open the app (or re-load the sheet) and re-export — events use stable IDs per fixture, so most calendars update the existing entry rather than creating a duplicate.

---

## Notes & assumptions

- **Venue** on each calendar event comes straight from the fixture's _LOCATION_, with a tappable Google Maps search link in the notes. Games marked _TBC_ fall back to the configurable home venue (**Grangemouth Sports Complex**) — adjustable in the settings panel.
- **Game length** is 2 hours for the calendar block — adjust the event afterwards if needed. (Also in settings.)
- **Reminder** defaults to 3 hours before tip-off.
- **Offline:** the app (including the SheetJS library and the bundled fixtures) is cached by a service worker after the first visit, so it opens without a connection. It uses a *stale-while-revalidate* strategy — you get the cached copy instantly, and a fresh copy is fetched in the background so the next open is up to date. Share links and calendar export are generated on-device and also work offline.
- **Season quirks:** a few fixtures in the source sheet are still `TBC`, and the app shows them as such until firmed up.
