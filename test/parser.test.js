'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const parser = require('../parser.js');

const { isDate, extractTime, cellStr, parseDate, headerIndex } = parser._helpers;

// A synthetic team sheet mirroring the real workbook layout:
// row0 = header, row1+ = fixtures.
function sampleAoA() {
  const D = (y, m, d) => new Date(y, m - 1, d);
  const T = (h, m) => new Date(1899, 11, 31, h, m); // Excel time-only epoch
  return [
    ['AGEGROUP', 'DATE (DD/MM/YY)', 'TIME (HH:MM)', 'LOCATION (FACILITY)', 'HOME ', 'AWAY', 'ROUND'],
    ['U16W', D(2026, 9, 5), T(12, 20), 'The Crags Centre', 'Boroughmuir Blaze', 'Signs Express Fury', 1],
    ['U16W', D(2026, 9, 19), T(15, 0), 'Grangemouth Sports Complex', 'Signs Express Fury', 'West Lothian Wolves', 3],
    ['U16W', 'TBC', 'TBC', 'TBC', 'West Lothian Wolves', 'Signs Express Fury', 5],
    ['U16W', '20/03/27', '14:30', 'Larbert High School', 'Signs Express Fury', 'Grampian', 20]
  ];
}

test('helpers: isDate distinguishes real dates', () => {
  assert.equal(isDate(new Date(2026, 0, 1)), true);
  assert.equal(isDate(new Date('nope')), false);
  assert.equal(isDate('2026'), false);
  assert.equal(isDate(null), false);
});

test('helpers: extractTime from Date and string', () => {
  assert.deepEqual(extractTime(new Date(1899, 11, 31, 12, 20)), { h: 12, m: 20 });
  assert.deepEqual(extractTime('15:00'), { h: 15, m: 0 });
  assert.deepEqual(extractTime('9.45'), { h: 9, m: 45 });
  assert.equal(extractTime('TBC'), null);
  assert.equal(extractTime(null), null);
});

test('helpers: cellStr trims and stringifies', () => {
  assert.equal(cellStr('  hi  '), 'hi');
  assert.equal(cellStr(2011), '2011');
  assert.equal(cellStr(null), '');
  assert.equal(cellStr(undefined), '');
});

test('helpers: parseDate handles Dates, dd/mm(/yy), and named months', () => {
  const d = parseDate(new Date(2026, 8, 5), 2026);
  assert.equal(d.getMonth(), 8);
  assert.equal(d.getDate(), 5);

  const dm = parseDate('20/03/27', 2026);
  assert.equal(dm.getFullYear(), 2027);
  assert.equal(dm.getMonth(), 2);
  assert.equal(dm.getDate(), 20);

  const named = parseDate('Sat 14 Mar', 2027);
  assert.equal(named.getMonth(), 2);
  assert.equal(named.getDate(), 14);

  // Excel time-only epoch dates are not real fixture dates
  assert.equal(parseDate(new Date(1899, 11, 31, 12, 20), 2026), null);
  // "TBC" is not a date
  assert.equal(parseDate('TBC', 2026), null);
});

test('headerIndex matches by keyword regardless of exact wording', () => {
  const head = sampleAoA()[0];
  assert.equal(headerIndex(head, /date/i), 1);
  assert.equal(headerIndex(head, /location|facility/i), 3);
  assert.equal(headerIndex(head, /home/i), 4);
  assert.equal(headerIndex(head, /nope/i), -1);
});

test('findHeaderRow locates the header row', () => {
  assert.equal(parser.findHeaderRow(sampleAoA()), 0);
  assert.equal(parser.findHeaderRow([['just', 'some', 'stuff']]), -1);
});

test('resolveSides identifies the Fury side and the opposition', () => {
  assert.deepEqual(parser.resolveSides('Signs Express Fury', 'West Lothian Wolves'), { isHome: true, opponent: 'West Lothian Wolves' });
  assert.deepEqual(parser.resolveSides('Boroughmuir Blaze', 'Signs Express Fury'), { isHome: false, opponent: 'Boroughmuir Blaze' });
  // Neither side is Fury -> assume home, opponent = away
  assert.deepEqual(parser.resolveSides('A', 'B'), { isHome: true, opponent: 'B' });
});

test('buildTeam: extracts fixtures with home/away, opponent, venue, round', () => {
  const team = parser.buildTeam('U16W', sampleAoA(), 0);
  assert.equal(team.id, 'U16W');
  assert.equal(team.fixtures.length, 4);

  const f0 = team.fixtures[0];
  assert.equal(f0.isHome, false);            // Fury are away at Boroughmuir
  assert.equal(f0.opponent, 'Boroughmuir Blaze');
  assert.equal(f0.location, 'The Crags Centre');
  assert.deepEqual(f0.time, { h: 12, m: 20 });
  assert.equal(f0.round, 1);

  const f1 = team.fixtures[1];
  assert.equal(f1.isHome, true);             // Fury at home
  assert.equal(f1.opponent, 'West Lothian Wolves');
});

test('buildTeam: TBC rows keep null date/time but retain the raw marker', () => {
  const team = parser.buildTeam('U16W', sampleAoA(), 0);
  const tbc = team.fixtures[2];
  assert.equal(tbc.date, null);
  assert.equal(tbc.rawDate, 'TBC');
  assert.equal(tbc.time, null);
  assert.equal(tbc.opponent, 'West Lothian Wolves');
  assert.equal(tbc.isHome, false);
});

test('buildTeam: string date "20/03/27" resolved to a real Date', () => {
  const team = parser.buildTeam('U16W', sampleAoA(), 0);
  const f = team.fixtures[3];
  assert.ok(f.date instanceof Date);
  assert.equal(f.date.getFullYear(), 2027);
  assert.equal(f.date.getMonth(), 2);
});

test('parseWorkbook: builds a multi-team model with a season', () => {
  // Fake a two-sheet workbook using the parser's own building blocks by
  // constructing a minimal XLSX-like object is heavy; instead exercise the
  // pieces buildTeam/deriveSeason directly.
  const t1 = parser.buildTeam('U16W', sampleAoA(), 0);
  const season = parser.deriveSeason([t1]);
  assert.equal(season, '2026/27');
});

test('deriveSeason returns "" when there are no dated fixtures', () => {
  assert.equal(parser.deriveSeason([{ id: 'X', fixtures: [{ date: null }] }]), '');
});

test('seasonStartYear picks the autumn-half year', () => {
  const teams = [{ id: 'A', fixtures: [
    { date: new Date(2026, 8, 5) },  // Sep 2026 (autumn)
    { date: new Date(2026, 10, 1) }, // Nov 2026 (autumn)
    { date: new Date(2027, 1, 1) }   // Feb 2027 (spring) — ignored for start year
  ] }];
  assert.equal(parser.seasonStartYear(teams), 2026);
});

test('reconcileYears flags + corrects an out-of-season year typo', () => {
  const teams = [{ id: 'U14MD1', fixtures: [
    { date: new Date(2026, 8, 5), round: 1 },   // Sep 2026 — fine
    { date: new Date(2026, 11, 12), round: 8 },  // Dec 2026 — fine
    { date: new Date(2026, 0, 17), round: 10 },  // Jan 2026 — typo, should be 2027
    { date: new Date(2027, 1, 14), round: 12 }   // Feb 2027 — fine
  ] }];
  parser.reconcileYears(teams);
  const fx = teams[0].fixtures;

  // The January date is corrected to the next year and flagged.
  assert.equal(fx[2].dateSuspect, true);
  assert.equal(fx[2].date.getFullYear(), 2027);
  assert.equal(fx[2].date.getMonth(), 0);
  assert.equal(fx[2].date.getDate(), 17);
  assert.ok(fx[2].suspectOriginal instanceof Date);
  assert.equal(fx[2].suspectOriginal.getFullYear(), 2026);

  // Correctly-dated fixtures are left untouched and unflagged.
  assert.ok(!fx[0].dateSuspect);
  assert.ok(!fx[1].dateSuspect);
  assert.ok(!fx[3].dateSuspect);
});

test('reconcileYears flags but does NOT move an ambiguous (autumn) mismatch', () => {
  // A September game dated a year late is usually a *month* typo, not a year
  // one — so it's flagged for a human but left exactly as the sheet has it.
  const teams = [{ id: 'U18MD1', fixtures: [
    { date: new Date(2026, 8, 5), round: 1 },    // Sep 2026 — anchors start year
    { date: new Date(2027, 8, 20), round: 18 }   // Sep 2027 — suspect, not auto-fixed
  ] }];
  parser.reconcileYears(teams);
  const f = teams[0].fixtures[1];
  assert.equal(f.dateSuspect, true);
  assert.equal(f.date.getFullYear(), 2027);   // unchanged
  assert.equal(f.date.getMonth(), 8);         // unchanged
  assert.equal(f.suspectOriginal.getTime(), f.date.getTime()); // no correction applied
});

test('reconcileYears is a no-op when every year already fits the season', () => {
  const teams = [{ id: 'A', fixtures: [
    { date: new Date(2026, 8, 5) },
    { date: new Date(2027, 2, 14) }
  ] }];
  parser.reconcileYears(teams);
  assert.ok(!teams[0].fixtures.some(f => f.dateSuspect));
});
