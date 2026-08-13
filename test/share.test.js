'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../share.js');

function makeModel() {
  return {
    club: 'Falkirk Fury',
    season: '2026/27',
    teams: [
      { id: 'U16W', fixtures: [
        { row: 1, date: new Date(2026, 8, 5), rawDate: '', time: { h: 12, m: 20 }, rawTime: '',
          location: 'The Crags Centre', opponent: 'Boroughmuir Blaze', isHome: false, round: 1,
          home: 'Boroughmuir Blaze', away: 'Signs Express Fury' },
        { row: 2, date: null, rawDate: 'TBC', time: null, rawTime: 'TBC',
          location: 'TBC', opponent: 'West Lothian Wolves', isHome: false, round: 5,
          home: 'West Lothian Wolves', away: 'Signs Express Fury' }
      ] },
      { id: 'SMD1', fixtures: [
        { row: 1, date: new Date(2026, 8, 4), rawDate: '', time: { h: 19, m: 50 }, rawTime: '',
          location: 'Grangemouth Sports Complex', opponent: 'Boroughmuir Blaze', isHome: true, round: 1,
          home: 'Signs Express Fury', away: 'Boroughmuir Blaze' }
      ] }
    ]
  };
}

test('serialize -> deserialize round-trips the model', () => {
  const round = S.deserialize(S.serialize(makeModel()));
  assert.equal(round.club, 'Falkirk Fury');
  assert.equal(round.season, '2026/27');
  assert.equal(round.teams.length, 2);
  assert.equal(round.teams[0].id, 'U16W');
  assert.equal(round.teams[0].fixtures.length, 2);

  const f0 = round.teams[0].fixtures[0];
  assert.ok(f0.date instanceof Date);
  assert.equal(f0.date.getTime(), new Date(2026, 8, 5).getTime());
  assert.deepEqual(f0.time, { h: 12, m: 20 });
  assert.equal(f0.opponent, 'Boroughmuir Blaze');
  assert.equal(f0.isHome, false);
  assert.equal(f0.round, 1);
  assert.equal(f0.location, 'The Crags Centre');

  // Null date + TBC preserved
  const f1 = round.teams[0].fixtures[1];
  assert.equal(f1.date, null);
  assert.equal(f1.rawDate, 'TBC');
  assert.equal(f1.rawTime, 'TBC');
  assert.equal(f1.time, null);

  // Home side preserved
  assert.equal(round.teams[1].fixtures[0].isHome, true);
});

test('serialize output is valid compact JSON with a version', () => {
  const parsed = JSON.parse(S.serialize(makeModel()));
  assert.equal(parsed.v, S.VERSION);
  assert.equal(parsed.c, 'Falkirk Fury');
  assert.ok(Array.isArray(parsed.t));
});

test('deserialize rejects malformed data', () => {
  assert.throws(() => S.deserialize('{"nope":1}'), /Invalid shared fixtures/);
  assert.throws(() => S.deserialize('not json'));
});

test('fixturesToText renders a readable list with heading', () => {
  const m = makeModel();
  const games = [
    { fixture: m.teams[0].fixtures[0], info: { status: 'away' }, teamLabel: '' },
    { fixture: m.teams[1].fixtures[0], info: { status: 'home' }, teamLabel: '' }
  ];
  const text = S.fixturesToText(games, 'U16 Girls');
  assert.match(text, /Falkirk Fury — U16 Girls/);
  assert.match(text, /Sat 5 Sep 12:20pm @ Boroughmuir Blaze/);
  assert.match(text, /· The Crags Centre/);
  assert.match(text, /Fri 4 Sep 7:50pm vs Boroughmuir Blaze/);
});

test('fixturesToText shows the team tag when provided (all-teams view)', () => {
  const m = makeModel();
  const games = [{ fixture: m.teams[0].fixtures[0], info: { status: 'away' }, teamLabel: 'U16 Girls' }];
  const text = S.fixturesToText(games, 'All teams');
  assert.match(text, /\[U16 Girls\]/);
});

test('fixturesToText handles TBC time/date and empty lists', () => {
  const m = makeModel();
  const tbc = [{ fixture: m.teams[0].fixtures[1], info: { status: 'away' }, teamLabel: '' }];
  const text = S.fixturesToText(tbc, 'U16 Girls');
  assert.match(text, /TBC TBC @ West Lothian Wolves/);

  // A fixture with no rawDate falls back to the generic "Date TBC" label.
  const noRaw = [{ fixture: Object.assign({}, m.teams[0].fixtures[1], { rawDate: '' }), info: { status: 'away' }, teamLabel: '' }];
  assert.match(S.fixturesToText(noRaw, 'U16 Girls'), /Date TBC/);

  const empty = S.fixturesToText([], 'All teams');
  assert.match(empty, /All teams/);
  assert.match(empty, /No games\./);
});
