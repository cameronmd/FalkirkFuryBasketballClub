/* Falkirk Fury Basketball — sharing helpers (pure, no DOM).
 * Works in the browser (window.FuryShare) and Node (module.exports).
 *
 * serialize/deserialize produce a compact JSON representation of the fixtures
 * that can be compressed + base64url-encoded into a share link by the app layer
 * (and is also the on-disk format of the bundled data/fixtures.json).
 * fixturesToText renders a human-readable fixture list for text sharing.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FuryShare = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 1;

  function packFixture(f) {
    return [
      f.date ? f.date.getTime() : 0,
      f.rawDate || '',
      f.time ? [f.time.h, f.time.m] : 0,
      f.location || '',
      f.opponent || '',
      f.isHome ? 1 : 0,
      f.round || 0,
      f.home || '',
      f.away || '',
      f.rawTime || '',
      f.dateSuspect ? 1 : 0,
      (f.dateSuspect && f.suspectOriginal) ? f.suspectOriginal.getTime() : 0
    ];
  }

  function unpackFixture(a, i) {
    return {
      row: i,
      date: a[0] ? new Date(a[0]) : null,
      rawDate: a[1] || '',
      time: a[2] ? { h: a[2][0], m: a[2][1] } : null,
      rawTime: a[9] || '',
      location: a[3] || '',
      opponent: a[4] || '',
      isHome: !!a[5],
      round: a[6] || null,
      home: a[7] || '',
      away: a[8] || '',
      dateSuspect: !!a[10],
      suspectOriginal: a[11] ? new Date(a[11]) : null
    };
  }

  // model { club, season, teams[] } -> compact JSON string.
  function serialize(model) {
    var payload = {
      v: VERSION,
      c: model.club || 'Falkirk Fury',
      s: model.season || '',
      t: model.teams.map(function (t) {
        return [t.id, t.fixtures.map(packFixture)];
      })
    };
    return JSON.stringify(payload);
  }

  // compact JSON string -> model (dates rehydrated to Date objects).
  function deserialize(str) {
    var d = JSON.parse(str);
    if (!d || !d.t || !Array.isArray(d.t)) throw new Error('Invalid shared fixtures data.');
    return {
      club: d.c || 'Falkirk Fury',
      season: d.s || '',
      teams: d.t.map(function (t) {
        return {
          id: t[0],
          fixtures: (t[1] || []).map(function (a, i) { return unpackFixture(a, i); })
        };
      })
    };
  }

  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmtDate(d, rawDate) {
    if (!d) return rawDate || 'Date TBC';
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function fmtTime(t, rawTime) {
    if (!t) return rawTime && rawTime.toUpperCase() === 'TBC' ? 'TBC' : '';
    var ampm = t.h >= 12 ? 'pm' : 'am';
    var h12 = t.h % 12; if (h12 === 0) h12 = 12;
    return h12 + (t.m ? ':' + String(t.m).padStart(2, '0') : '') + ampm;
  }

  // games: [{ fixture, info, teamLabel }]; heading: e.g. a team name or "All teams".
  function fixturesToText(games, heading) {
    var lines = [];
    lines.push('🏀 Falkirk Fury — ' + (heading || 'Fixtures'));
    lines.push('');
    if (!games.length) {
      lines.push('No games.');
      return lines.join('\n');
    }
    games.forEach(function (g) {
      var f = g.fixture;
      var when = fmtDate(f.date, f.rawDate);
      var time = fmtTime(f.time, f.rawTime);
      var vs = (f.isHome ? 'vs ' : '@ ') + (f.opponent || 'TBC');
      var bits = [when + (time ? ' ' + time : ''), vs];
      if (g.teamLabel) bits.push('[' + g.teamLabel + ']');
      if (f.location && f.location.toUpperCase() !== 'TBC') bits.push('· ' + f.location);
      if (f.dateSuspect) bits.push('⚠️(check date)');
      lines.push('• ' + bits.join(' '));
    });
    return lines.join('\n');
  }

  return {
    VERSION: VERSION,
    serialize: serialize,
    deserialize: deserialize,
    fixturesToText: fixturesToText,
    _helpers: { packFixture: packFixture, unpackFixture: unpackFixture, fmtDate: fmtDate, fmtTime: fmtTime }
  };
});
