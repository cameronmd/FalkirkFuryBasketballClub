'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../fixtures.js');

function fx(row, y, m, d, h, mi, opp, isHome, round, location) {
  return {
    row, date: (y ? new Date(y, m - 1, d) : null),
    time: (h != null ? { h, m: mi } : null), rawTime: '',
    location: location || 'Grangemouth Sports Complex',
    opponent: opp, isHome: isHome, round: round,
    home: isHome ? 'Fury' : opp, away: isHome ? opp : 'Fury'
  };
}

function makeModel() {
  return {
    club: 'Falkirk Fury',
    season: '2026/27',
    teams: [
      { id: 'U16W', fixtures: [
        fx(1, 2026, 9, 5, 12, 20, 'Boroughmuir Blaze', false, 1),   // away
        fx(2, 2026, 9, 19, 15, 0, 'West Lothian Wolves', true, 3),  // home
        fx(3, 2026, 9, 12, 12, 50, 'Grampian Ignite', false, 2)     // away, earlier than round 3
      ] },
      { id: 'SMD1', fixtures: [
        fx(1, 2026, 9, 5, 19, 50, 'Boroughmuir Blaze', true, 1),    // same day as U16W r1
        fx(2, 2026, 10, 10, 16, 0, 'Dunfermline Reign', false, 5)
      ] }
    ]
  };
}

test('teamLabel builds friendly names from sheet codes', () => {
  assert.equal(F.teamLabel('U14MD1'), 'U14 Boys Div 1');
  assert.equal(F.teamLabel('U16MD1'), 'U16 Boys Div 1');
  assert.equal(F.teamLabel('SMD1'), 'Senior Men Div 1');
  assert.equal(F.teamLabel('U14WD1'), 'U14 Girls Div 1');
  assert.equal(F.teamLabel('U16W'), 'U16 Girls');
  assert.equal(F.teamLabel('SW'), 'Senior Women');
  assert.equal(F.teamLabel('U18MD1 '), 'U18 Boys Div 1'); // trailing space tolerated
  assert.equal(F.teamLabel(''), '');
});

test('homeAwayInfo maps isHome to status/label', () => {
  assert.deepEqual(F.homeAwayInfo({ isHome: true }), { status: 'home', label: 'Home', home: true });
  assert.deepEqual(F.homeAwayInfo({ isHome: false }), { status: 'away', label: 'Away', home: false });
});

test('findTeam returns the team or null', () => {
  const m = makeModel();
  assert.equal(F.findTeam(m, 'U16W').id, 'U16W');
  assert.equal(F.findTeam(m, 'Nope'), null);
});

test('teams lists ids with labels in sheet order', () => {
  assert.deepEqual(F.teams(makeModel()), [
    { id: 'U16W', label: 'U16 Girls' },
    { id: 'SMD1', label: 'Senior Men Div 1' }
  ]);
});

test('teamGames returns a team\'s fixtures sorted by date', () => {
  const games = F.teamGames(makeModel(), 'U16W', {}, null);
  assert.deepEqual(games.map(g => g.fixture.round), [1, 2, 3]); // Sep 5, Sep 12, Sep 19
  assert.ok(games.every(g => g.team === 'U16W'));
});

test('teamGames filters home / away', () => {
  const m = makeModel();
  const homeOnly = F.teamGames(m, 'U16W', { home: true, away: false }, null);
  assert.deepEqual(homeOnly.map(g => g.fixture.round), [3]);
  const awayOnly = F.teamGames(m, 'U16W', { home: false, away: true }, null);
  assert.deepEqual(awayOnly.map(g => g.fixture.round).sort(), [1, 2]);
  const none = F.teamGames(m, 'U16W', { home: false, away: false }, null);
  assert.equal(none.length, 0);
});

test('teamGames hidepast drops games before "today"', () => {
  const m = makeModel();
  const today = new Date(2026, 8, 13); // Sep 13 2026
  const games = F.teamGames(m, 'U16W', { hidepast: true }, today);
  // Sep 5 & Sep 12 are past; only Sep 19 remains
  assert.deepEqual(games.map(g => g.fixture.round), [3]);
});

test('teamGames: unknown team yields no games', () => {
  assert.deepEqual(F.teamGames(makeModel(), 'Ghost', {}, null), []);
});

test('teamsGames merges a chosen set of teams, tagged and date-sorted', () => {
  const m = makeModel();
  const games = F.teamsGames(m, ['U16W', 'SMD1'], {}, null);
  // U16W has 3, SMD1 has 2 => 5 total, merged and sorted by date.
  assert.equal(games.length, 5);
  assert.equal(games[0].fixture.date.getDate(), 5); // earliest is Sep 5
  assert.ok(games.every(g => ['U16W', 'SMD1'].indexOf(g.team) !== -1));
  const times = games.map(g => g.fixture.date.getTime());
  assert.deepEqual(times, times.slice().sort((a, b) => a - b)); // non-decreasing
  assert.ok(games.some(g => g.team === 'SMD1') && games.some(g => g.team === 'U16W'));
});

test('teamsGames with one id matches teamGames; unknown ids are ignored', () => {
  const m = makeModel();
  assert.deepEqual(
    F.teamsGames(m, ['U16W'], {}, null).map(g => g.fixture.round),
    F.teamGames(m, 'U16W', {}, null).map(g => g.fixture.round)
  );
  assert.deepEqual(F.teamsGames(m, ['ghost'], {}, null), []);
  assert.deepEqual(F.teamsGames(m, [], {}, null), []);
});

test('teamsGames respects home/away + hidepast filters', () => {
  const m = makeModel();
  const homeOnly = F.teamsGames(m, ['U16W', 'SMD1'], { home: true, away: false }, null);
  assert.ok(homeOnly.every(g => g.fixture.isHome));
});

test('allFixtureGames merges every team, tags team id, sorts by date', () => {
  const games = F.allFixtureGames(makeModel(), {}, null);
  assert.equal(games.length, 5);
  // Sep 5 has two games (U16W r1, SMD1 r1); order among same-day is by round.
  assert.equal(games[0].fixture.date.getDate(), 5);
  assert.ok(games.every(g => g.team));
  const teamsSeen = new Set(games.map(g => g.team));
  assert.deepEqual([...teamsSeen].sort(), ['SMD1', 'U16W']);
});

test('allFixtureGames respects home/away + hidepast filters', () => {
  const m = makeModel();
  const homeAll = F.allFixtureGames(m, { home: true, away: false }, null);
  assert.ok(homeAll.every(g => g.fixture.isHome));
  assert.equal(homeAll.length, 2); // U16W r3 + SMD1 r1
});

test('sameDayTeams lists every Fury team playing that date', () => {
  const m = makeModel();
  const u16wR1 = m.teams[0].fixtures[0]; // Sep 5
  const same = F.sameDayTeams(m, u16wR1);
  assert.deepEqual(same.map(s => s.team).sort(), ['SMD1', 'U16W']);
  // includes home/away + opponent info
  const smd1 = same.find(s => s.team === 'SMD1');
  assert.equal(smd1.isHome, true);
  assert.equal(smd1.opponent, 'Boroughmuir Blaze');
  assert.equal(smd1.label, 'Senior Men Div 1');
});

test('sameDayTeams returns [] when the fixture has no date', () => {
  assert.deepEqual(F.sameDayTeams(makeModel(), { date: null }), []);
});

test('nextGame returns the first upcoming fixture', () => {
  const m = makeModel();
  const today = new Date(2026, 8, 13);
  const ng = F.nextGame(m, 'U16W', today);
  assert.equal(ng.fixture.round, 3); // Sep 19
  assert.equal(F.nextGame(m, 'U16W', new Date(2027, 0, 1)), null);
});
