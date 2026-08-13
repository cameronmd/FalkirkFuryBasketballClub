'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calendar.js');

function game(over) {
  return Object.assign({
    team: 'U16W',
    teamLabel: 'U16 Girls',
    fixture: {
      row: 3, date: new Date(2026, 8, 19), time: { h: 15, m: 0 },
      location: 'Grangemouth Sports Complex', opponent: 'West Lothian Wolves',
      isHome: true, round: 3
    },
    info: { status: 'home', home: true },
    mates: [
      { team: 'U16W', label: 'U16 Girls', opponent: 'West Lothian Wolves', isHome: true },
      { team: 'SMD1', label: 'Senior Men Div 1', opponent: 'Boroughmuir Blaze', isHome: false }
    ]
  }, over);
}

const FIXED_NOW = new Date(Date.UTC(2026, 0, 2, 3, 4, 5));

test('eventTitle uses vs for home and @ for away', () => {
  assert.equal(C.eventTitle(game()), 'Fury U16 Girls vs West Lothian Wolves');
  const away = game({ fixture: Object.assign({}, game().fixture, { isHome: false, opponent: 'Boroughmuir Blaze' }) });
  assert.equal(C.eventTitle(away), 'Fury U16 Girls @ Boroughmuir Blaze');
});

test('mapsSearch builds a Google Maps query link', () => {
  assert.equal(C.mapsSearch('The Crags Centre'),
    'https://www.google.com/maps/search/?api=1&query=The%20Crags%20Centre');
});

test('hasVenue treats blank and TBC as no venue', () => {
  assert.equal(C.hasVenue({ location: 'Larbert High School' }), true);
  assert.equal(C.hasVenue({ location: 'TBC' }), false);
  assert.equal(C.hasVenue({ location: '' }), false);
});

test('icsEscape escapes commas, semicolons, backslashes, newlines', () => {
  assert.equal(C.icsEscape('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
});

test('icsLocal produces floating local time (no Z, no offset)', () => {
  assert.equal(C.icsLocal(new Date(2026, 8, 19), { h: 15, m: 0 }), '20260919T150000');
});

test('foldICS folds lines longer than 75 chars with CRLF + space', () => {
  const long = 'DESCRIPTION:' + 'a'.repeat(120);
  const folded = C.foldICS(long);
  const lines = folded.split('\r\n');
  assert.ok(lines.length > 1);
  assert.ok(lines[0].length <= 75);
  assert.ok(lines.slice(1).every(l => l.startsWith(' ')));
  assert.equal(folded.replace(/\r\n /g, ''), long);
  assert.equal(C.foldICS('SHORT:line'), 'SHORT:line');
});

test('buildEvent: core fields, venue as location, 2h default, alarm, UID', () => {
  const ics = C.buildEvent(game(), { now: FIXED_NOW });
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /SUMMARY:Fury U16 Girls vs West Lothian Wolves/);
  assert.match(ics, /DTSTART:20260919T150000/);
  assert.match(ics, /DTEND:20260919T170000/);      // +120 min
  assert.match(ics, /LOCATION:Grangemouth Sports Complex/);
  assert.match(ics, /DTSTAMP:20260102T030405Z/);
  assert.match(ics, /BEGIN:VALARM[\s\S]*TRIGGER:-PT3H[\s\S]*END:VALARM/);
  assert.match(ics, /UID:fury-\d+-U16W-3@falkirkfury/);
});

test('buildEvent: venue drives a Google Maps link in URL + description', () => {
  const ics = C.buildEvent(game(), { now: FIXED_NOW });
  assert.match(ics, /URL:https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Grangemouth/);
  assert.match(ics, /Map: https:\/\/www\.google\.com\/maps/);
});

test('buildEvent: TBC venue falls back to the settings location + default map', () => {
  const g = game({ fixture: Object.assign({}, game().fixture, { location: 'TBC' }) });
  const ics = C.buildEvent(g, { location: 'Grangemouth Sports Complex', now: FIXED_NOW });
  assert.match(ics, /LOCATION:Grangemouth Sports Complex/);
});

test('buildEvent: description carries home/away, round and other teams that day', () => {
  const ics = C.buildEvent(game(), { now: FIXED_NOW });
  assert.match(ics, /Home game/);
  assert.match(ics, /Round 3/);
  // the current team is excluded from "also playing"; SMD1 remains
  assert.match(ics, /Also playing today: Senior Men Div 1 @ Boroughmuir Blaze/);
  assert.doesNotMatch(ics, /Also playing today:[^\n]*U16 Girls/);
});

test('buildEvent: custom duration and alarm', () => {
  const ics = C.buildEvent(game(), { durationMin: 90, alarmHours: 1, now: FIXED_NOW });
  assert.match(ics, /DTEND:20260919T163000/); // +90 min
  assert.match(ics, /TRIGGER:-PT1H/);
});

test('buildEvent: alarmHours=0 omits the VALARM', () => {
  assert.doesNotMatch(C.buildEvent(game(), { alarmHours: 0, now: FIXED_NOW }), /VALARM/);
});

test('exportable: only fixtures with a date and time', () => {
  assert.equal(C.exportable(game()), true);
  assert.equal(C.exportable(game({ fixture: Object.assign({}, game().fixture, { time: null }) })), false);
  assert.equal(C.exportable(game({ fixture: Object.assign({}, game().fixture, { date: null }) })), false);
});

test('buildCalendar wraps events and filters non-exportable games', () => {
  const games = [
    game(),
    game({ fixture: Object.assign({}, game().fixture, { row: 9, time: null }) }) // excluded (no time)
  ];
  const cal = C.buildCalendar(games, { calName: 'U16 Girls', now: FIXED_NOW });
  assert.match(cal, /^BEGIN:VCALENDAR/);
  assert.match(cal, /END:VCALENDAR$/);
  assert.match(cal, /X-WR-CALNAME:Falkirk Fury - U16 Girls/);
  assert.match(cal, /VERSION:2\.0/);
  assert.equal((cal.match(/BEGIN:VEVENT/g) || []).length, 1);
});

test('buildCalendar uses CRLF line endings', () => {
  const cal = C.buildCalendar([game()], { now: FIXED_NOW });
  assert.ok(cal.includes('\r\n'));
  assert.ok(!/[^\r]\n/.test(cal)); // no bare LF
});

test('eventFileName is filesystem-safe and dated', () => {
  assert.equal(C.eventFileName(game()), 'fury-20260919-west-lothian-wolves.ics');
});
