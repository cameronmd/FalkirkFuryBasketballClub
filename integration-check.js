/* Headless verification of the parser against the real season spreadsheet.
 * Expects ./sample.xlsx (git-ignored). Unit tests are hermetic and need no file.
 */
'use strict';
const fs = require('fs');
const XLSX = require('xlsx');
const parser = require('./parser.js');
const F = require('./fixtures.js');

const buf = fs.readFileSync('./sample.xlsx');
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
const model = parser.parseWorkbook(wb);

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? '  ok  ' : ' FAIL ') + name + (extra != null ? '  -> ' + extra : ''));
  if (!cond) failures++;
}

const totalFixtures = model.teams.reduce((n, t) => n + t.fixtures.length, 0);
console.log('Club:', model.club, '| season:', model.season);
console.log('Teams:', model.teams.map(t => t.id).join(', '));
console.log('Fixtures:', totalFixtures, '\n');

const ids = model.teams.map(t => t.id);
check('found 8 teams', model.teams.length === 8, model.teams.length);
check('includes U14MD1 … SW', ['U14MD1', 'U16MD1', 'U18MD1', 'SMD1', 'U14WD1', 'U16W', 'U18W', 'SW'].every(x => ids.includes(x)));
check('found >= 150 fixtures', totalFixtures >= 150, totalFixtures);
check('season is 2026/27', model.season === '2026/27', model.season);

// Team labels
check('U16W labels as "U16 Girls"', F.teamLabel('U16W') === 'U16 Girls');
check('SMD1 labels as "Senior Men Div 1"', F.teamLabel('SMD1') === 'Senior Men Div 1');

// Every fixture names an opponent that is NOT Fury, and has a home/away flag.
const badOpp = [];
model.teams.forEach(t => t.fixtures.forEach(f => {
  if (!f.opponent || /fury/i.test(f.opponent)) badOpp.push(t.id + ' r' + f.round);
}));
check('every fixture has a non-Fury opponent', badOpp.length === 0, badOpp.slice(0, 3).join(', '));

// Home/away split looks sane (Fury play both).
const homeCount = model.teams.reduce((n, t) => n + t.fixtures.filter(f => f.isHome).length, 0);
check('has a healthy mix of home and away', homeCount > 40 && homeCount < totalFixtures - 40, homeCount + '/' + totalFixtures + ' home');

// Most fixtures carry a real date + time (some are TBC).
const dated = model.teams.reduce((n, t) => n + t.fixtures.filter(f => f.date).length, 0);
check('>= 85% fixtures have a parsed date', dated / totalFixtures >= 0.85, dated + '/' + totalFixtures);
const timed = model.teams.reduce((n, t) => n + t.fixtures.filter(f => f.time).length, 0);
check('>= 85% fixtures have a parsed time', timed / totalFixtures >= 0.85, timed + '/' + totalFixtures);

// TBC rows survive as fixtures with null date.
const tbc = [];
model.teams.forEach(t => t.fixtures.forEach(f => { if (!f.date && /tbc/i.test(f.rawDate)) tbc.push(t.id); }));
check('TBC fixtures are kept (null date)', tbc.length >= 1, tbc.length + ' TBC rows');

// Venues are read for the vast majority.
const venued = model.teams.reduce((n, t) => n + t.fixtures.filter(f => f.location && f.location.toUpperCase() !== 'TBC').length, 0);
check('>= 85% fixtures have a venue', venued / totalFixtures >= 0.85, venued + '/' + totalFixtures);

// Suspicious dates are flagged. The clean pre-season typo (U14MD1 r10, Jan
// "2026") is rolled forward to 2027; the ambiguous one (U18MD1 r18, Sep "2027")
// is flagged but left as-is for a human to resolve.
const suspects = [];
model.teams.forEach(t => t.fixtures.forEach(f => {
  if (f.dateSuspect) suspects.push(t.id + ' r' + f.round + ': ' + f.suspectOriginal.toDateString() + ' -> ' + f.date.toDateString());
}));
console.log('Flagged dates:\n  ' + suspects.join('\n  ') + '\n');
const u14 = model.teams.find(t => t.id === 'U14MD1').fixtures.find(f => f.round === 10);
check('U14MD1 r10 pre-season typo is flagged AND rolled to Jan 2027',
  u14.dateSuspect && u14.date.getFullYear() === 2027 && u14.date.getMonth() === 0, u14.date.toDateString());
const u18 = model.teams.find(t => t.id === 'U18MD1').fixtures.find(f => f.round === 18);
check('U18MD1 r18 ambiguous typo is flagged but left unchanged',
  u18.dateSuspect && u18.date.getTime() === u18.suspectOriginal.getTime(), u18.date.toDateString());
// No fixture is left dated before the season start year.
const strays = model.teams.reduce((n, t) => n + t.fixtures.filter(f => f.date && f.date.getFullYear() < 2026).length, 0);
check('no fixture is left dated before the season start year', strays === 0, strays + ' strays');

// Same-day detection works across teams (season openers cluster on weekends).
const u16w = model.teams.find(t => t.id === 'U16W');
const firstDated = u16w.fixtures.find(f => f.date);
const same = F.sameDayTeams(model, firstDated);
check('same-day detection finds multiple teams on an opening weekend', same.length >= 2, same.map(s => s.team).join(', '));

// Sample output
console.log('\nU16W first 3 fixtures:');
F.teamGames(model, 'U16W', {}, null).slice(0, 3).forEach(g => {
  const f = g.fixture;
  console.log('   -', f.date ? f.date.toDateString() : f.rawDate,
    f.time ? `${f.time.h}:${String(f.time.m).padStart(2, '0')}` : '(TBC)',
    '|', f.isHome ? 'vs' : '@', f.opponent, '|', f.location, '| round', f.round);
});

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED ✅' : failures + ' CHECK(S) FAILED ❌'));
process.exit(failures === 0 ? 0 : 1);
