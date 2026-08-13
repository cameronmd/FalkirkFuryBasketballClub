/* Falkirk Fury Basketball — fixture/team logic (pure, no DOM).
 * Works in the browser (window.FuryFixtures) and Node (module.exports).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FuryFixtures = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Turn a raw sheet code (U14MD1, SW, U18MD1) into a friendly label.
  //   age  : U14/U16/U18 or "Senior" (S)
  //   sex  : M -> Boys/Men, W -> Girls/Women
  //   div  : D1 -> "Div 1"
  function teamLabel(id) {
    if (!id) return '';
    id = String(id).trim();
    var m = id.match(/^(U\d+|S)/i);
    var agePart = m ? m[1].toUpperCase() : '';
    var rest = id.slice(m ? m[0].length : 0);
    var isSenior = agePart === 'S';
    var age = isSenior ? 'Senior' : agePart;
    var women = /W/i.test(rest);
    var sex = women ? (isSenior ? 'Women' : 'Girls') : (isSenior ? 'Men' : 'Boys');
    var dm = rest.match(/D(\d+)/i);
    var div = dm ? ' Div ' + dm[1] : '';
    return (age ? age + ' ' : '') + sex + div;
  }

  // Home / away meaning for a fixture — packaged as an "info" object so the
  // card styling can key off `info.status` ("home" / "away").
  function homeAwayInfo(fixture) {
    return fixture.isHome
      ? { status: 'home', label: 'Home', home: true }
      : { status: 'away', label: 'Away', home: false };
  }

  function findTeam(model, id) {
    for (var i = 0; i < model.teams.length; i++) {
      if (model.teams[i].id === id) return model.teams[i];
    }
    return null;
  }

  function passesFilters(f, filters, today) {
    filters = filters || {};
    if (f.isHome && filters.home === false) return false;
    if (!f.isHome && filters.away === false) return false;
    if (filters.hidepast && today && f.date && f.date < today) return false;
    return true;
  }

  function byDate(a, b) {
    var da = a.fixture.date ? a.fixture.date.getTime() : Infinity;
    var db = b.fixture.date ? b.fixture.date.getTime() : Infinity;
    if (da !== db) return da - db;
    // Same day: keep a stable order by round then row.
    return (a.fixture.round || 0) - (b.fixture.round || 0);
  }

  // Games for one team, filtered and sorted by date.
  function teamGames(model, teamId, filters, today) {
    var t = findTeam(model, teamId);
    if (!t) return [];
    var games = [];
    t.fixtures.forEach(function (f) {
      if (!passesFilters(f, filters, today)) return;
      games.push({ team: t.id, fixture: f, info: homeAwayInfo(f) });
    });
    games.sort(byDate);
    return games;
  }

  // Every fixture across every team, for the "all teams" view.
  function allFixtureGames(model, filters, today) {
    var games = [];
    model.teams.forEach(function (t) {
      t.fixtures.forEach(function (f) {
        if (!passesFilters(f, filters, today)) return;
        games.push({ team: t.id, fixture: f, info: homeAwayInfo(f) });
      });
    });
    games.sort(byDate);
    return games;
  }

  // Distinct team ids in sheet order, with labels — for the picker.
  function teams(model) {
    return model.teams.map(function (t) { return { id: t.id, label: teamLabel(t.id) }; });
  }

  // Other Fury teams with a fixture on the same day as `fixture`
  // (includes the given team so the modal can highlight "this" one).
  function sameDayTeams(model, fixture) {
    if (!fixture || !fixture.date) return [];
    var t = fixture.date.getTime();
    var out = [];
    model.teams.forEach(function (tm) {
      tm.fixtures.forEach(function (f) {
        if (f.date && f.date.getTime() === t) {
          out.push({ team: tm.id, label: teamLabel(tm.id), opponent: f.opponent, isHome: f.isHome, time: f.time, location: f.location });
        }
      });
    });
    out.sort(function (a, b) {
      var ta = a.time ? a.time.h * 60 + a.time.m : 9999;
      var tb = b.time ? b.time.h * 60 + b.time.m : 9999;
      return ta - tb;
    });
    return out;
  }

  // First upcoming fixture (>= today) for a team, or null.
  function nextGame(model, teamId, today) {
    var games = teamGames(model, teamId, {}, null)
      .filter(function (g) { return g.fixture.date && (!today || g.fixture.date >= today); });
    return games.length ? games[0] : null;
  }

  return {
    teamLabel: teamLabel,
    homeAwayInfo: homeAwayInfo,
    findTeam: findTeam,
    teamGames: teamGames,
    allFixtureGames: allFixtureGames,
    teams: teams,
    sameDayTeams: sameDayTeams,
    nextGame: nextGame
  };
});
