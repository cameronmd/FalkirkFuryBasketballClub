/* Falkirk Fury Basketball — calendar (.ics) generation (pure, no DOM).
 * Works in the browser (window.FuryCalendar) and Node (module.exports).
 *
 * A "game" is { team, teamLabel, fixture, mates } where:
 *   fixture   = { date:Date|null, time:{h,m}|null, location, opponent, isHome, round, ... }
 *   teamLabel = friendly team name (e.g. "U16 Girls")   (optional)
 *   mates     = [{team,label,opponent,isHome}]          (other Fury teams that day; optional)
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FuryCalendar = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULTS = {
    location: 'Grangemouth Sports Complex',
    locationUrl: 'https://www.google.com/maps/search/?api=1&query=Grangemouth+Sports+Complex',
    durationMin: 120,
    alarmHours: 3,
    calName: 'Fixtures',
    prodId: '-//Falkirk Fury Basketball Club//Fixtures//EN'
  };

  function pad(n) { return String(n).padStart(2, '0'); }

  function hasVenue(f) { return !!(f.location && f.location.toUpperCase() !== 'TBC'); }

  function mapsSearch(query) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
  }

  // Floating local time (no Z / no TZID) so calendars show the phone's local time.
  function fmtLocal(y, mo, d, h, mi) {
    return y + pad(mo + 1) + pad(d) + 'T' + pad(h) + pad(mi) + '00';
  }
  function icsLocal(date, time) {
    return fmtLocal(date.getFullYear(), date.getMonth(), date.getDate(), time.h, time.m);
  }
  function icsLocalPlus(date, time, mins) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.h, time.m, 0);
    d.setMinutes(d.getMinutes() + mins);
    return fmtLocal(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
  }

  function icsEscape(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  function utcStamp(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
           pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }

  // Fold logical lines to <=75 chars (RFC 5545) so strict importers accept the file.
  function foldICS(str) {
    return str.split('\r\n').map(function (line) {
      if (line.length <= 75) return line;
      var out = line.slice(0, 75);
      var rest = line.slice(75);
      while (rest.length > 74) { out += '\r\n ' + rest.slice(0, 74); rest = rest.slice(74); }
      return out + '\r\n ' + rest;
    }).join('\r\n');
  }

  function labelOf(game) { return game.teamLabel || game.team || 'Fury'; }

  function eventTitle(game) {
    var f = game.fixture;
    var opp = f.opponent || 'TBC';
    return 'Fury ' + labelOf(game) + (f.isHome ? ' vs ' : ' @ ') + opp;
  }

  function buildEvent(game, opts) {
    opts = opts || {};
    var f = game.fixture;
    var durationMin = opts.durationMin || DEFAULTS.durationMin;
    var alarmHours = opts.alarmHours == null ? DEFAULTS.alarmHours : opts.alarmHours;
    var now = opts.now || new Date();

    var loc = hasVenue(f) ? f.location : (opts.location || DEFAULTS.location);
    var locUrl = hasVenue(f) ? mapsSearch(f.location)
      : (opts.locationUrl == null ? DEFAULTS.locationUrl : opts.locationUrl);

    var title = eventTitle(game);
    var mates = (game.mates || []).filter(function (mm) { return mm.team !== game.team; });
    var desc = [];
    desc.push(f.isHome ? 'Home game' : 'Away game');
    if (f.round) desc.push('Round ' + f.round);
    if (mates.length) {
      desc.push('Also playing today: ' + mates.map(function (mm) {
        return (mm.label || mm.team) + ' ' + (mm.isHome ? 'vs ' : '@ ') + mm.opponent;
      }).join('; '));
    }
    desc.push('Falkirk Fury Basketball Club');
    if (locUrl) desc.push('Map: ' + locUrl);

    var uid = 'fury-' + (f.date ? f.date.getTime() : 'nd') + '-' +
              String(game.team || '').replace(/\W/g, '') + '-' + (f.round || f.row || 0) + '@falkirkfury';

    var lines = [
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTAMP:' + utcStamp(now),
      'DTSTART:' + icsLocal(f.date, f.time),
      'DTEND:' + icsLocalPlus(f.date, f.time, durationMin),
      'SUMMARY:' + icsEscape(title),
      'LOCATION:' + icsEscape(loc),
      'DESCRIPTION:' + icsEscape(desc.join('\n'))
    ];
    if (locUrl) lines.push('URL:' + locUrl);
    if (alarmHours > 0) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(title),
                 'TRIGGER:-PT' + alarmHours + 'H', 'END:VALARM');
    }
    lines.push('END:VEVENT');
    return lines.join('\r\n');
  }

  // Only fixtures with a real date + time become events.
  function exportable(game) {
    return !!(game.fixture && game.fixture.date && game.fixture.time);
  }

  function buildCalendar(games, opts) {
    opts = opts || {};
    var calName = opts.calName || DEFAULTS.calName;
    var events = (games || []).filter(exportable).map(function (g) { return buildEvent(g, opts); });
    var cal = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:' + (opts.prodId || DEFAULTS.prodId),
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Falkirk Fury - ' + calName
    ].concat(events).concat(['END:VCALENDAR']).join('\r\n');
    return foldICS(cal);
  }

  function eventFileName(game) {
    var f = game.fixture;
    var opp = (f.opponent || 'game').replace(/[^\w]+/g, '-').toLowerCase();
    var d = f.date ? f.date.getFullYear() + pad(f.date.getMonth() + 1) + pad(f.date.getDate()) : 'game';
    return 'fury-' + d + '-' + opp + '.ics';
  }

  return {
    DEFAULTS: DEFAULTS,
    buildCalendar: buildCalendar,
    buildEvent: buildEvent,
    eventTitle: eventTitle,
    eventFileName: eventFileName,
    mapsSearch: mapsSearch,
    hasVenue: hasVenue,
    foldICS: foldICS,
    icsEscape: icsEscape,
    icsLocal: icsLocal,
    exportable: exportable
  };
});
