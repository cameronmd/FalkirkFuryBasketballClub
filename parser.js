/* Falkirk Fury Basketball — fixtures parser (pure, no DOM).
 * Works in the browser (window.FuryParser) and Node (module.exports).
 * Expects a SheetJS workbook read with { cellDates: true }.
 *
 * The Fury fixtures workbook has one sheet per team / age-group (U14MD1, SW, …),
 * each a simple table:
 *   AGEGROUP | DATE | TIME | LOCATION (FACILITY) | HOME | AWAY | ROUND
 * The club's own team appears as the "…Fury" side of each fixture; the other
 * side is the opposition. Parsing is header-driven (matched by name) so it
 * survives column reordering between seasons.
 */
(function (root, factory) {
  // Prefer a global XLSX (browser CDN). Fall back to an optional require('xlsx')
  // in Node, but don't hard-fail if it's absent — only parseWorkbook needs it,
  // so buildTeam/helpers stay usable (and unit-testable) without the library.
  var XLSXlib = (typeof XLSX !== 'undefined') ? XLSX : null;
  if (!XLSXlib && typeof require !== 'undefined') {
    try { XLSXlib = require('xlsx'); } catch (e) { XLSXlib = null; }
  }
  var api = factory(XLSXlib);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FuryParser = api;
})(typeof self !== 'undefined' ? self : this, function (XLSX) {
  'use strict';

  var CLUB = 'Falkirk Fury';

  function isDate(v) { return v instanceof Date && !isNaN(v); }

  function extractTime(v) {
    if (isDate(v)) return { h: v.getHours(), m: v.getMinutes() };
    if (typeof v === 'string') {
      var m = v.match(/(\d{1,2})[:.](\d{2})/);
      if (m) return { h: +m[1], m: +m[2] };
    }
    return null;
  }

  function cellStr(v) {
    if (v === null || v === undefined) return '';
    if (isDate(v)) return v.toLocaleDateString();
    return String(v).trim();
  }

  function parseDate(v, yearHint) {
    if (isDate(v)) {
      if (v.getFullYear() > 1901) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
      return null;
    }
    if (typeof v === 'string') {
      var s = v.trim();
      var dm = s.match(/^(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?$/);
      if (dm) {
        var day = +dm[1], mon = +dm[2] - 1, yr = dm[3] ? +dm[3] : yearHint;
        if (dm[3] && dm[3].length === 2) yr = 2000 + +dm[3];
        if (yr) return new Date(yr, mon, day);
      }
      var months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      var tm = s.match(/(\d{1,2})\s+([A-Za-z]{3,})/);
      if (tm) {
        var mi = months.indexOf(tm[2].slice(0, 3).toLowerCase());
        if (mi >= 0 && yearHint) return new Date(yearHint, mi, +tm[1]);
      }
    }
    return null;
  }

  function sheetToAoA(ws) {
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  }

  // A header row has cells naming the columns. We match by keyword so the
  // exact wording ("DATE (DD/MM/YY)", "LOCATION (FACILITY)") doesn't matter.
  function headerIndex(row, re) {
    for (var c = 0; c < row.length; c++) {
      if (re.test(cellStr(row[c]))) return c;
    }
    return -1;
  }

  function findHeaderRow(aoa) {
    for (var r = 0; r < Math.min(aoa.length, 8); r++) {
      var row = aoa[r] || [];
      if (headerIndex(row, /date/i) >= 0 &&
          headerIndex(row, /home/i) >= 0 &&
          headerIndex(row, /away/i) >= 0) {
        return r;
      }
    }
    return -1;
  }

  // Decide which side is Fury and who the opposition is.
  function resolveSides(home, away) {
    var homeFury = /fury/i.test(home);
    var awayFury = /fury/i.test(away);
    if (homeFury && !awayFury) return { isHome: true, opponent: away };
    if (awayFury && !homeFury) return { isHome: false, opponent: home };
    // Neither (or both) clearly Fury — assume the sheet lists Fury at home.
    return { isHome: true, opponent: away };
  }

  function buildTeam(id, aoa, headerRow) {
    var head = aoa[headerRow] || [];
    var cols = {
      date: headerIndex(head, /date/i),
      time: headerIndex(head, /time/i),
      location: headerIndex(head, /location|facility|venue/i),
      home: headerIndex(head, /home/i),
      away: headerIndex(head, /away/i),
      round: headerIndex(head, /round/i)
    };

    // Infer the season year from the real dates so string dates can be resolved.
    var years = {};
    for (var r0 = headerRow + 1; r0 < aoa.length; r0++) {
      var dv = (aoa[r0] || [])[cols.date];
      if (isDate(dv) && dv.getFullYear() > 1901) years[dv.getFullYear()] = (years[dv.getFullYear()] || 0) + 1;
    }
    var yearHint = Object.keys(years).sort(function (a, b) { return years[b] - years[a]; })[0];
    yearHint = yearHint ? +yearHint : new Date().getFullYear();

    var fixtures = [];
    for (var r = headerRow + 1; r < aoa.length; r++) {
      var row = aoa[r] || [];
      var home = cellStr(row[cols.home]);
      var away = cellStr(row[cols.away]);
      var dateRaw = cellStr(row[cols.date]);
      // A real fixture has both sides named (or at least a date + one side).
      if (!home && !away) continue;

      var sides = resolveSides(home, away);
      var timeRaw = cellStr(row[cols.time]);
      var location = cellStr(row[cols.location]);
      var roundRaw = cols.round >= 0 ? row[cols.round] : null;

      fixtures.push({
        row: r,
        date: parseDate(row[cols.date], yearHint),
        rawDate: dateRaw,
        time: extractTime(row[cols.time]),
        rawTime: timeRaw,
        location: location,
        home: home,
        away: away,
        isHome: sides.isHome,
        opponent: sides.opponent,
        round: (roundRaw === null || roundRaw === undefined || roundRaw === '') ? null : +roundRaw || cellStr(roundRaw)
      });
    }

    return { id: id, fixtures: fixtures };
  }

  // Basketball seasons straddle two calendar years (autumn → spring). Months
  // Aug–Dec belong to the season's start year; Jan–Jul belong to start year + 1.
  // A date whose year contradicts that (a common spreadsheet typo, e.g. a
  // January game left on the previous year) is corrected to the expected year
  // and flagged so the app can warn the reader rather than silently hiding it.
  var AUTUMN_START_MONTH = 7; // August (0-based)

  function seasonStartYear(teams) {
    var counts = {};
    teams.forEach(function (t) {
      t.fixtures.forEach(function (f) {
        if (f.date && f.date.getMonth() >= AUTUMN_START_MONTH) {
          var y = f.date.getFullYear();
          counts[y] = (counts[y] || 0) + 1;
        }
      });
    });
    var ys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    return ys.length ? +ys[0] : null;
  }

  function reconcileYears(teams) {
    var startYear = seasonStartYear(teams);
    if (startYear == null) return;
    teams.forEach(function (t) {
      t.fixtures.forEach(function (f) {
        if (!f.date) return;
        var mon = f.date.getMonth(), yr = f.date.getFullYear();
        var expected = mon >= AUTUMN_START_MONTH ? startYear : startYear + 1;
        if (yr === expected) return; // year fits the season — nothing to do

        // The year contradicts the month for this season: flag it for a human.
        f.dateSuspect = true;
        f.suspectOriginal = f.date; // what the sheet said

        // Only auto-correct the confident case: a spring-half game (Jan–Jul)
        // mistakenly left on the start year — it clearly belongs a year later,
        // so roll it forward. Any other mismatch (e.g. an autumn month with a
        // future year, which usually means the *month* is the typo) is left
        // exactly as the sheet has it and simply flagged, rather than guessed.
        if (mon < AUTUMN_START_MONTH && yr === startYear) {
          f.date = new Date(startYear + 1, mon, f.date.getDate());
        }
      });
    });
  }

  function deriveSeason(teams) {
    var years = {};
    teams.forEach(function (t) {
      t.fixtures.forEach(function (f) { if (f.date) years[f.date.getFullYear()] = true; });
    });
    var ys = Object.keys(years).map(Number).sort(function (a, b) { return a - b; });
    if (!ys.length) return '';
    var y = ys[0];
    return y + '/' + String((y + 1) % 100).padStart(2, '0');
  }

  function parseWorkbook(wb) {
    if (!XLSX || !XLSX.utils) {
      throw new Error('Spreadsheet library (xlsx) is not available.');
    }
    var teams = [];
    wb.SheetNames.forEach(function (name) {
      var aoa = sheetToAoA(wb.Sheets[name]);
      var hr = findHeaderRow(aoa);
      if (hr < 0) return;
      var team = buildTeam(name.trim(), aoa, hr);
      if (team.fixtures.length) teams.push(team);
    });
    if (!teams.length) {
      throw new Error("Couldn't find any fixtures in this spreadsheet. Expected sheets with DATE, HOME and AWAY columns.");
    }
    reconcileYears(teams);
    return { club: CLUB, teams: teams, season: deriveSeason(teams) };
  }

  return {
    CLUB: CLUB,
    parseWorkbook: parseWorkbook,
    buildTeam: buildTeam,
    findHeaderRow: findHeaderRow,
    resolveSides: resolveSides,
    deriveSeason: deriveSeason,
    seasonStartYear: seasonStartYear,
    reconcileYears: reconcileYears,
    _helpers: { isDate: isDate, extractTime: extractTime, cellStr: cellStr, parseDate: parseDate, headerIndex: headerIndex }
  };
});
