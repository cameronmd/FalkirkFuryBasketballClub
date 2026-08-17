/* Falkirk Fury Basketball — Fixtures (UI glue)
 * Fully client-side. Parsing lives in parser.js, fixture/home-away logic in
 * fixtures.js, and calendar (.ics) generation in calendar.js. This file wires
 * those pure modules to the DOM.
 */
(function () {
  'use strict';

  // ---------- Config ----------
  var STORAGE_KEY = 'fury_fixtures_v1';
  var TEAM_KEY = 'fury_team_v1';
  var SETTINGS_KEY = 'fury_settings_v1';
  var DATA_URL = 'data/fixtures.json';   // bundled default season
  var ALL_TEAMS = ' ALL';                 // sentinel selection: view every team

  // Calendar defaults; overridable via the settings panel (persisted).
  var CAL_DEFAULTS = {
    location: 'Grangemouth Sports Complex',
    durationMin: 120,
    alarmHours: 3
  };

  function cloneSettings(s) {
    return { location: s.location, durationMin: s.durationMin, alarmHours: s.alarmHours };
  }

  // ---------- State ----------
  // selection.mode is 'all' (every team) or 'teams' (selection.ids — one or more).
  var state = {
    club: 'Falkirk Fury',
    season: '',
    teams: [],      // [{ id, fixtures: [...] }]
    selection: { mode: 'all', ids: [] },
    filters: { home: true, away: true, hidepast: true },
    meta: { fileName: '' },
    settings: cloneSettings(CAL_DEFAULTS)
  };

  function model() { return { club: state.club, season: state.season, teams: state.teams }; }
  function hasData() { return state.teams.length > 0; }
  function isAll() { return state.selection.mode === 'all'; }
  function selectedIds() { return state.selection.ids || []; }
  function isMulti() { return !isAll() && selectedIds().length > 1; }
  function headingLabel() {
    if (isAll()) return 'All teams';
    var ids = selectedIds();
    if (ids.length === 1) return FuryFixtures.teamLabel(ids[0]) || 'Fixtures';
    if (ids.length > 1) return ids.length + ' teams';
    return 'Fixtures';
  }
  // Keep selected ids in the workbook's team order for a stable display.
  function orderIds(ids) {
    var order = state.teams.map(function (t) { return t.id; });
    return ids.slice().sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
  }
  function slug(s) {
    return (String(s || 'fixtures').replace(/\W+/g, '-').toLowerCase().replace(/^-+|-+$/g, '')) || 'fixtures';
  }

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    uploadSection: $('uploadSection'),
    dropzone: $('dropzone'),
    fileInput: $('fileInput'),
    parseError: $('parseError'),
    changeFileBtn: $('changeFileBtn'),
    settingsBtn: $('settingsBtn'),
    controlsSection: $('controlsSection'),
    teamSearch: $('teamSearch'),
    teamList: $('teamList'),
    filterChips: $('filterChips'),
    summarySection: $('summarySection'),
    spotlightSection: $('spotlightSection'),
    statGames: $('statGames'),
    nextStat: $('nextStat'),
    statNext: $('statNext'),
    addAllBtn: $('addAllBtn'),
    shareBtn: $('shareBtn'),
    gamesSection: $('gamesSection'),
    emptyState: $('emptyState'),
    modal: $('modal'),
    modalTitle: $('modalTitle'),
    modalBody: $('modalBody'),
    settingsModal: $('settingsModal'),
    settingsForm: $('settingsForm'),
    setLocation: $('setLocation'),
    setDuration: $('setDuration'),
    setReminder: $('setReminder'),
    settingsReset: $('settingsReset'),
    shareModal: $('shareModal'),
    shareLinkBtn: $('shareLinkBtn'),
    shareTextBtn: $('shareTextBtn'),
    shareStatus: $('shareStatus')
  };

  // ============================================================
  //  DISPLAY HELPERS
  // ============================================================

  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmtTime(t, rawTime) {
    if (!t) return (rawTime && rawTime.toUpperCase() === 'TBC') ? 'TBC' : '';
    var h = t.h, m = t.m;
    var ampm = h >= 12 ? 'pm' : 'am';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + (m ? ':' + String(m).padStart(2, '0') : '') + ampm;
  }

  function fmtDate(d) {
    if (!d) return '';
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function fmtDateFull(d) {
    if (!d) return '';
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  // Human-readable note explaining a suspected spreadsheet date typo.
  // If we auto-corrected it (date moved), say what it became; if we left it
  // as-is (couldn't confidently fix), just warn that it looks wrong.
  function suspectNote(f) {
    var orig = fmtDateFull(f.suspectOriginal);
    var corrected = f.date && f.suspectOriginal && f.date.getTime() !== f.suspectOriginal.getTime();
    if (corrected) {
      return 'The spreadsheet shows ' + orig + ', which looks like a typo — shown here as ' +
        fmtDateFull(f.date) + '. Please double-check.';
    }
    return 'The spreadsheet date (' + orig + ') looks like it may be wrong. Please double-check with the club.';
  }

  function startOfToday() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ============================================================
  //  DERIVED DATA (via pure modules)
  // ============================================================

  function currentGames() {
    var today = startOfToday();
    if (isAll()) return FuryFixtures.allFixtureGames(model(), state.filters, today);
    return FuryFixtures.teamsGames(model(), selectedIds(), state.filters, today);
  }

  function matesFor(fixture) {
    return FuryFixtures.sameDayTeams(model(), fixture);
  }

  // Attach team label + same-day teams to each game and hand to the calendar module.
  function exportCalendar(games, filename) {
    var withExtras = games.map(function (g) {
      return {
        team: g.team,
        teamLabel: FuryFixtures.teamLabel(g.team),
        fixture: g.fixture,
        info: g.info,
        mates: matesFor(g.fixture)
      };
    });
    var ics = FuryCalendar.buildCalendar(withExtras, {
      calName: headingLabel(),
      location: state.settings.location,
      durationMin: state.settings.durationMin,
      alarmHours: state.settings.alarmHours
    });
    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  // ============================================================
  //  PERSISTENCE
  // ============================================================

  function save() {
    try { localStorage.setItem(STORAGE_KEY, FuryShare.serialize(model())); } catch (e) { /* ignore */ }
  }

  function adopt(mdl, meta) {
    state.club = mdl.club || 'Falkirk Fury';
    state.season = mdl.season || '';
    state.teams = mdl.teams || [];
    state.meta = meta || {};
    reconcileSelection();
  }

  // Drop any selected ids that no longer exist; fall back to "all" if empty.
  function reconcileSelection() {
    if (state.selection.mode !== 'teams') return;
    var ids = selectedIds().filter(function (id) { return FuryFixtures.findTeam(model(), id); });
    state.selection = ids.length ? { mode: 'teams', ids: orderIds(ids) } : { mode: 'all', ids: [] };
  }

  function saveSelection() {
    try { localStorage.setItem(TEAM_KEY, JSON.stringify(state.selection)); } catch (e) {}
  }

  // Read the remembered selection, tolerating the older single-id / sentinel format.
  function loadSelection() {
    try {
      var raw = localStorage.getItem(TEAM_KEY);
      if (!raw) return { mode: 'all', ids: [] };
      if (raw === ALL_TEAMS || raw === 'all') return { mode: 'all', ids: [] };
      if (raw.charAt(0) === '{') {
        var o = JSON.parse(raw);
        if (o && o.mode === 'teams' && o.ids && o.ids.length) return { mode: 'teams', ids: o.ids.slice() };
        return { mode: 'all', ids: [] };
      }
      return { mode: 'teams', ids: [raw] }; // legacy single-team id
    } catch (e) { return { mode: 'all', ids: [] }; }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      adopt(FuryShare.deserialize(raw), { fileName: 'saved' });
      return hasData();
    } catch (e) { return false; }
  }

  // ============================================================
  //  RENDERING
  // ============================================================

  function render() {
    el.uploadSection.hidden = hasData();
    el.changeFileBtn.hidden = !hasData();
    el.settingsBtn.hidden = !hasData();
    el.controlsSection.hidden = !hasData();
    if (!hasData()) {
      el.summarySection.hidden = true;
      el.spotlightSection.hidden = true;
      el.gamesSection.innerHTML = '';
      return;
    }
    renderTeamPicker();
    renderMainView();
  }

  // Everything below the picker — refreshed on filter/selection changes without
  // touching (or closing) the team dropdown.
  function renderMainView() {
    var games = currentGames();
    el.summarySection.hidden = false;
    renderSummary(games);
    renderSpotlight(games);
    renderGames(games);
  }

  function renderTeamPicker() {
    if (isAll()) {
      el.teamSearch.value = 'All teams — every fixture';
      return;
    }
    var ids = selectedIds();
    if (ids.length === 1) {
      el.teamSearch.value = FuryFixtures.teamLabel(ids[0]) + '  ·  ' + ids[0];
    } else {
      var labels = ids.map(function (id) { return FuryFixtures.teamLabel(id); });
      el.teamSearch.value = labels.length <= 2 ? labels.join(', ') : (labels[0] + ' + ' + (labels.length - 1) + ' more');
    }
  }

  function addAllRow() {
    var on = isAll();
    var li = document.createElement('li');
    li.className = 'all-opt' + (on ? ' sel' : '');
    li.tabIndex = 0;
    li.setAttribute('data-all', '1');
    li.innerHTML = '<span class="ti-check">' + (on ? '●' : '') + '</span>' +
      '<span class="ti-label">👥 All teams — every fixture</span>';
    li.addEventListener('click', selectAllTeams);
    li.addEventListener('keydown', function (e) { if (e.key === 'Enter') selectAllTeams(); });
    el.teamList.appendChild(li);
  }

  function addTeamRow(t) {
    var on = !isAll() && selectedIds().indexOf(t.id) !== -1;
    var li = document.createElement('li');
    li.className = 'team-opt' + (on ? ' sel' : '');
    li.tabIndex = 0;
    li.setAttribute('data-team', t.id);
    li.innerHTML = '<span class="ti-check">' + (on ? '✓' : '') + '</span>' +
      '<span class="ti-label">' + escapeHtml(t.label) + '</span>' +
      '<span class="ti-sub">' + escapeHtml(t.id) + '</span>';
    li.addEventListener('click', function () { toggleTeam(t.id); });
    li.addEventListener('keydown', function (e) { if (e.key === 'Enter') toggleTeam(t.id); });
    el.teamList.appendChild(li);
  }

  function showTeamList() {
    el.teamList.innerHTML = '';
    var head = document.createElement('li');
    head.className = 'picker-hint';
    head.innerHTML = '<span>Tap teams to add or remove — pick as many as you like.</span>';
    var done = document.createElement('button');
    done.type = 'button';
    done.className = 'picker-done';
    done.textContent = 'Done';
    done.addEventListener('click', function () { hideTeamList(); });
    head.appendChild(done);
    el.teamList.appendChild(head);
    addAllRow();
    FuryFixtures.teams(model()).forEach(function (t) { addTeamRow(t); });
    el.teamList.hidden = false;
  }

  function hideTeamList() { el.teamList.hidden = true; }
  function toggleTeamList() { if (el.teamList.hidden) showTeamList(); else hideTeamList(); }

  // Update the tick marks / highlight in place (without rebuilding the list, so
  // an outside-click check against the clicked node stays reliable).
  function updateListTicks() {
    Array.prototype.forEach.call(el.teamList.children, function (li) {
      var check = li.querySelector ? li.querySelector('.ti-check') : null;
      if (li.getAttribute && li.getAttribute('data-all') != null) {
        var onAll = isAll();
        li.classList.toggle('sel', onAll);
        if (check) check.textContent = onAll ? '●' : '';
      } else if (li.getAttribute && li.getAttribute('data-team') != null) {
        var onTeam = !isAll() && selectedIds().indexOf(li.getAttribute('data-team')) !== -1;
        li.classList.toggle('sel', onTeam);
        if (check) check.textContent = onTeam ? '✓' : '';
      }
    });
  }

  function selectAllTeams() {
    state.selection = { mode: 'all', ids: [] };
    saveSelection();
    hideTeamList();
    render();
  }

  // Toggle a team in/out of the selection, keeping the dropdown open for
  // multi-picking. Clearing the last team falls back to "all teams".
  function toggleTeam(id) {
    var ids = isAll() ? [] : selectedIds().slice();
    var i = ids.indexOf(id);
    if (i === -1) ids.push(id); else ids.splice(i, 1);
    state.selection = ids.length ? { mode: 'teams', ids: orderIds(ids) } : { mode: 'all', ids: [] };
    saveSelection();
    updateListTicks();   // refresh ticks in place (list stays open)
    renderTeamPicker();  // refresh the input label
    renderMainView();    // refresh games/summary/spotlight
  }

  function renderSummary(games) {
    el.statGames.textContent = games.length;
    var today = startOfToday();
    var upcoming = games.filter(function (g) { return g.fixture.date && g.fixture.date >= today; })[0];
    if (upcoming) {
      el.nextStat.hidden = false;
      el.statNext.textContent = fmtDate(upcoming.fixture.date) + (upcoming.fixture.time ? ' · ' + fmtTime(upcoming.fixture.time) : '');
    } else {
      el.nextStat.hidden = true;
    }
    var exportable = games.filter(function (g) { return g.fixture.date && g.fixture.time; }).length;
    el.addAllBtn.disabled = exportable === 0;
    el.addAllBtn.childNodes[el.addAllBtn.childNodes.length - 1].nodeValue = ' Add ' + exportable + ' to calendar';
  }

  // The upcoming weekend (Sat + Sun) relative to today.
  function weekendWindow(today) {
    var dow = today.getDay(); // 0 Sun … 6 Sat
    var sat = new Date(today), sun = new Date(today);
    if (dow === 0) {          // Sunday — this weekend is yesterday (Sat) + today
      sat.setDate(today.getDate() - 1);
    } else {                  // Mon–Sat — the coming Saturday + Sunday
      sat.setDate(today.getDate() + (6 - dow));
      sun = new Date(sat); sun.setDate(sat.getDate() + 1);
    }
    return { start: sat, end: sun };
  }

  // #5 — a compact "this weekend" spotlight above the list (all-teams / multi
  // views, where it aggregates across teams). Respects the active filters.
  function renderSpotlight(games) {
    if (!(isAll() || isMulti())) { el.spotlightSection.hidden = true; return; }
    var today = startOfToday();
    var w = weekendWindow(today);
    var wk = games.filter(function (g) {
      var d = g.fixture.date;
      return d && d >= today && d >= w.start && d <= w.end;
    });
    if (!wk.length) { el.spotlightSection.hidden = true; return; }

    el.spotlightSection.hidden = false;
    el.spotlightSection.innerHTML =
      '<div class="spot-head">🔥 This weekend <span>' + escapeHtml(fmtDate(w.start)) + ' – ' + escapeHtml(fmtDate(w.end)) + '</span></div>' +
      '<ul class="spot-list">' + wk.map(function (g) {
        var f = g.fixture;
        var venue = (f.location && f.location.toUpperCase() !== 'TBC') ? f.location : 'Venue TBC';
        return '<li class="spot-item status-' + g.info.status + '">' +
          '<span class="spot-when">' + (f.date ? DAYS[f.date.getDay()] : '') + ' ' + (f.time ? fmtTime(f.time) : 'TBC') + '</span>' +
          '<span class="spot-body">' +
            '<span class="spot-team">' + escapeHtml(FuryFixtures.teamLabel(g.team)) + '</span> ' +
            '<span class="spot-match">' + (f.isHome ? 'vs ' : '@ ') + escapeHtml(f.opponent || 'TBC') + '</span>' +
            '<span class="spot-venue">📍 ' + escapeHtml(venue) + '</span>' +
          '</span>' +
        '</li>';
      }).join('') + '</ul>';
  }

  function monthKey(d) { return d ? d.getFullYear() + '-' + d.getMonth() : 'tbc'; }
  function monthLabel(d) { return d ? MONTHS[d.getMonth()] + ' ' + d.getFullYear() : 'Date TBC'; }

  function statusBadge(info) {
    return '<span class="badge badge-' + info.status + '">' + escapeHtml(info.label) + '</span>';
  }

  function renderGames(games) {
    if (!games.length) {
      el.gamesSection.innerHTML = '';
      el.emptyState.hidden = false;
      el.emptyState.textContent = 'No games match the current filters.';
      return;
    }
    el.emptyState.hidden = true;
    var showTeamTag = isAll() || isMulti();
    var lastMonth = null;
    var html = games.map(function (g, i) {
      var f = g.fixture;
      var canCal = f.date && f.time;
      var timeLabel = f.time ? fmtTime(f.time) : 'Time TBC';
      var venue = (f.location && f.location.toUpperCase() !== 'TBC') ? f.location : 'Venue TBC';
      var mates = matesFor(f);
      var otherMates = mates.filter(function (mm) { return mm.team !== g.team; });
      // #4 — a month divider whenever the month changes down the sorted list.
      var head = '';
      var key = monthKey(f.date);
      if (key !== lastMonth) { head = '<div class="month-head">' + escapeHtml(monthLabel(f.date)) + '</div>'; lastMonth = key; }
      return head +
        '<article class="game-card status-' + g.info.status + '">' +
          '<div class="game-date">' +
            '<span class="gd-dow">' + (f.date ? DAYS[f.date.getDay()] : '') + '</span>' +
            '<span class="gd-day">' + (f.date ? f.date.getDate() : '?') + '</span>' +
            '<span class="gd-mon">' + (f.date ? MONTHS[f.date.getMonth()] : 'TBC') + '</span>' +
          '</div>' +
          '<div class="game-main">' +
            '<div class="game-top">' +
              '<h3 class="game-opp">' +
                '<span class="ha-prefix">' + (f.isHome ? 'vs' : '@') + '</span> ' + escapeHtml(f.opponent || 'TBC') +
              '</h3>' +
              statusBadge(g.info) +
            '</div>' +
            '<p class="game-meta">' +
              '<span class="gm-time">🕒 ' + timeLabel + '</span>' +
              '<span class="gm-venue">📍 ' + escapeHtml(venue) + '</span>' +
              (f.round ? '<span class="gm-round">Round ' + escapeHtml(f.round) + '</span>' : '') +
              (showTeamTag ? '<span class="gm-team">' + escapeHtml(FuryFixtures.teamLabel(g.team)) + '</span>' : '') +
              (f.dateSuspect ? '<span class="gm-warn" title="' + escapeHtml(suspectNote(f)) + '">⚠️ Check date</span>' : '') +
            '</p>' +
            (f.dateSuspect ? '<p class="game-warn">⚠️ ' + escapeHtml(suspectNote(f)) + '</p>' : '') +
            '<div class="game-actions">' +
              (canCal
                ? '<button class="cal-btn" data-cal="' + i + '"><svg viewBox="0 0 24 24" class="btn-icon" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg> Add to calendar</button>'
                : '<span class="cal-na">No date/time yet</span>') +
              (otherMates.length ? '<button class="mates-btn" data-mates="' + i + '">🏀 Also today (' + otherMates.length + ')</button>' : '') +
            '</div>' +
          '</div>' +
        '</article>';
    }).join('');
    el.gamesSection.innerHTML = html;

    Array.prototype.forEach.call(el.gamesSection.querySelectorAll('[data-cal]'), function (btn) {
      btn.addEventListener('click', function () {
        var g = games[+btn.getAttribute('data-cal')];
        exportCalendar([g], FuryCalendar.eventFileName(g));
      });
    });
    Array.prototype.forEach.call(el.gamesSection.querySelectorAll('[data-mates]'), function (btn) {
      btn.addEventListener('click', function () {
        var g = games[+btn.getAttribute('data-mates')];
        openSameDayModal(g);
      });
    });
  }

  function openSameDayModal(game) {
    var fixture = game.fixture;
    var mates = matesFor(fixture);
    el.modalTitle.textContent = (fixture.date ? fmtDate(fixture.date) : 'Same day') + ' — Fury games';
    el.modalBody.innerHTML =
      '<p class="modal-sub">Every Fury team playing on this day' + (fixture.date ? '' : '') + '.</p>' +
      '<ul class="mates-list">' + mates.map(function (mm) {
        var isMe = mm.team === game.team;
        var t = fmtTime(mm.time);
        var vs = (mm.isHome ? 'vs ' : '@ ') + escapeHtml(mm.opponent || 'TBC');
        var venue = (mm.location && mm.location.toUpperCase() !== 'TBC') ? ' · ' + escapeHtml(mm.location) : '';
        return '<li' + (isMe ? ' class="me"' : '') + '>' +
          '<strong>' + escapeHtml(mm.label) + '</strong> ' + vs +
          '<span class="ml-meta">' + (t ? t : '') + venue + '</span></li>';
      }).join('') + '</ul>';
    el.modal.hidden = false;
  }

  function closeModals() {
    el.modal.hidden = true;
    el.settingsModal.hidden = true;
    el.shareModal.hidden = true;
  }

  // ============================================================
  //  FILE HANDLING
  // ============================================================

  function handleFile(file) {
    el.parseError.hidden = true;
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = new Uint8Array(e.target.result);
        var wb = XLSX.read(data, { type: 'array', cellDates: true });
        var parsed = FuryParser.parseWorkbook(wb);
        adopt(parsed, { fileName: file.name });
        save();
        render();
      } catch (err) {
        el.parseError.hidden = false;
        el.parseError.textContent = '⚠️ ' + (err.message || 'Could not read that spreadsheet.');
        console.error(err);
      }
    };
    reader.onerror = function () {
      el.parseError.hidden = false;
      el.parseError.textContent = '⚠️ Could not read that file.';
    };
    reader.readAsArrayBuffer(file);
  }

  // Default selection: the remembered team(s) if still present, else "All teams".
  function applyDefaultSelection() {
    var stored = loadSelection();
    if (stored.mode === 'teams') {
      var valid = stored.ids.filter(function (id) { return FuryFixtures.findTeam(model(), id); });
      state.selection = valid.length ? { mode: 'teams', ids: orderIds(valid) } : { mode: 'all', ids: [] };
    } else {
      state.selection = { mode: 'all', ids: [] };
    }
  }

  // Deep link: #team=U16W or #team=U16W,SMD1 (or #team=all) preselects teams.
  // Runs after data is loaded and overrides the remembered selection.
  function applyTeamHash(rawHash) {
    var m = (rawHash || '').match(/[#&]team=([A-Za-z0-9,]+)/i);
    if (!m) return;
    var val = m[1];
    if (/^all$/i.test(val)) {
      state.selection = { mode: 'all', ids: [] };
    } else {
      var ids = [];
      val.split(',').forEach(function (w) {
        state.teams.forEach(function (t) {
          if (t.id.toLowerCase() === w.toLowerCase() && ids.indexOf(t.id) === -1) ids.push(t.id);
        });
      });
      if (ids.length) state.selection = { mode: 'teams', ids: orderIds(ids) };
    }
    saveSelection();
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }

  // ============================================================
  //  SETTINGS
  // ============================================================

  function loadSettings() {
    var s = cloneSettings(CAL_DEFAULTS);
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (typeof d.location === 'string') s.location = d.location;
        if (d.durationMin) s.durationMin = +d.durationMin;
        if (d.alarmHours != null) s.alarmHours = +d.alarmHours;
      }
    } catch (e) { /* ignore */ }
    state.settings = s;
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch (e) {}
  }

  function openSettings() {
    el.setLocation.value = state.settings.location || '';
    el.setDuration.value = String(state.settings.durationMin);
    el.setReminder.value = String(state.settings.alarmHours);
    el.settingsModal.hidden = false;
  }

  function applySettingsForm() {
    state.settings.location = el.setLocation.value.trim() || CAL_DEFAULTS.location;
    state.settings.durationMin = +el.setDuration.value || CAL_DEFAULTS.durationMin;
    state.settings.alarmHours = +el.setReminder.value || 0;
    saveSettings();
    closeModals();
  }

  // ============================================================
  //  SHARING
  // ============================================================

  function openShare() {
    el.shareStatus.hidden = true;
    el.shareModal.hidden = false;
  }

  function setShareStatus(msg) {
    el.shareStatus.hidden = false;
    el.shareStatus.textContent = msg;
  }

  // gzip/base64url so the whole season fits in a shareable URL fragment.
  function gzip(str) {
    var cs = new CompressionStream('gzip');
    var w = cs.writable.getWriter();
    w.write(new TextEncoder().encode(str)); w.close();
    return new Response(cs.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function gunzip(bytes) {
    var ds = new DecompressionStream('gzip');
    var w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return new Response(ds.readable).arrayBuffer().then(function (b) { return new TextDecoder().decode(b); });
  }
  function bytesToB64url(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlToBytes(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  function strToB64url(str) { return bytesToB64url(new TextEncoder().encode(str)); }
  function b64urlToStr(s) { return new TextDecoder().decode(b64urlToBytes(s)); }

  // Append the current team selection so a shared link opens on the same view.
  function selectionSuffix() {
    return '&team=' + (isAll() ? 'all' : selectedIds().join(','));
  }

  function buildShareLink() {
    var json = FuryShare.serialize(model());
    var base = location.origin + location.pathname;
    var tail = selectionSuffix();
    if (window.CompressionStream) {
      return gzip(json).then(function (gz) { return base + '#d=g' + bytesToB64url(gz) + tail; })
        .catch(function () { return base + '#d=r' + strToB64url(json) + tail; });
    }
    return Promise.resolve(base + '#d=r' + strToB64url(json) + tail);
  }

  function doShareLink() {
    buildShareLink().then(function (url) {
      if (navigator.share) {
        return navigator.share({ title: 'Falkirk Fury fixtures', url: url })
          .then(function () { setShareStatus('Shared.'); })
          .catch(function (e) {
            if (e && e.name === 'AbortError') return;
            return copyText(url).then(function () { setShareStatus('Link copied to clipboard.'); });
          });
      }
      return copyText(url).then(function () { setShareStatus('Link copied to clipboard.'); });
    }).catch(function () { setShareStatus('Sorry — could not create the link.'); });
  }

  function doShareText() {
    var tagTeams = isAll() || isMulti();
    var games = currentGames().map(function (g) {
      return { fixture: g.fixture, info: g.info, teamLabel: tagTeams ? FuryFixtures.teamLabel(g.team) : '' };
    });
    var text = FuryShare.fixturesToText(games, headingLabel());
    if (navigator.share) {
      navigator.share({ title: 'Falkirk Fury fixtures', text: text })
        .then(function () { setShareStatus('Shared.'); })
        .catch(function (e) {
          if (e && e.name === 'AbortError') return;
          copyText(text).then(function () { setShareStatus('Fixtures copied to clipboard.'); });
        });
    } else {
      copyText(text).then(function () { setShareStatus('Fixtures copied to clipboard.'); })
        .catch(function () { setShareStatus('Sorry — could not copy.'); });
    }
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta); resolve();
      } catch (e) { reject(e); }
    });
  }

  // Load fixtures shared via URL fragment (#d=...). Returns a Promise<boolean>.
  function loadFromHash() {
    var m = (location.hash || '').match(/[#&]d=([gr])([A-Za-z0-9\-_]+)/);
    if (!m) return Promise.resolve(false);
    var enc = m[1], data = m[2];
    var jsonP = (enc === 'g') ? gunzip(b64urlToBytes(data)) : Promise.resolve(b64urlToStr(data));
    return jsonP.then(function (json) {
      var mdl = FuryShare.deserialize(json);
      if (!mdl.teams.length) return false;
      adopt(mdl, { fileName: 'shared link' });
      save();
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      return true;
    }).catch(function () { return false; });
  }

  // Load the bundled default season (data/fixtures.json). Returns Promise<boolean>.
  function loadBundled() {
    if (typeof fetch === 'undefined') return Promise.resolve(false);
    return fetch(DATA_URL).then(function (r) { return r.ok ? r.text() : null; })
      .then(function (txt) {
        if (!txt) return false;
        var mdl = FuryShare.deserialize(txt);
        if (!mdl.teams.length) return false;
        adopt(mdl, { fileName: 'season fixtures' });
        return true;
      }).catch(function () { return false; });
  }

  // ============================================================
  //  EVENTS
  // ============================================================

  function wireEvents() {
    el.dropzone.addEventListener('click', function () { el.fileInput.click(); });
    el.dropzone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.fileInput.click(); } });
    el.fileInput.addEventListener('change', function (e) { handleFile(e.target.files[0]); });

    ['dragover', 'dragenter'].forEach(function (ev) {
      el.dropzone.addEventListener(ev, function (e) { e.preventDefault(); el.dropzone.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      el.dropzone.addEventListener(ev, function (e) { e.preventDefault(); el.dropzone.classList.remove('drag'); });
    });
    el.dropzone.addEventListener('drop', function (e) {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });

    el.changeFileBtn.addEventListener('click', function () {
      el.uploadSection.hidden = false;
      el.fileInput.value = '';
      el.fileInput.click();
    });

    // Tap the field to open/close; keyboard users can open with Enter/Space/Down.
    el.teamSearch.addEventListener('click', toggleTeamList);
    el.teamSearch.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); showTeamList(); }
      else if (e.key === 'Escape') hideTeamList();
    });
    // Tap anywhere outside the picker closes the dropdown.
    document.addEventListener('click', function (e) {
      if (el.teamList.hidden) return;
      if (e.target === el.teamSearch || el.teamList.contains(e.target)) return;
      hideTeamList();
    });

    el.filterChips.addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      var f = btn.getAttribute('data-filter');
      state.filters[f] = !state.filters[f];
      btn.classList.toggle('active', state.filters[f]);
      render();
    });

    el.addAllBtn.addEventListener('click', function () {
      exportCalendar(currentGames(), 'fury-' + slug(headingLabel()) + '.ics');
    });

    // Settings
    el.settingsBtn.addEventListener('click', openSettings);
    el.settingsForm.addEventListener('submit', function (e) { e.preventDefault(); applySettingsForm(); });
    el.settingsReset.addEventListener('click', function () {
      state.settings = cloneSettings(CAL_DEFAULTS); saveSettings(); openSettings();
    });

    // Share
    el.shareBtn.addEventListener('click', openShare);
    el.shareLinkBtn.addEventListener('click', doShareLink);
    el.shareTextBtn.addEventListener('click', doShareText);

    // Modals: backdrop / close button / Escape close whichever is open.
    [el.modal, el.settingsModal, el.shareModal].forEach(function (mod) {
      mod.addEventListener('click', function (e) { if (e.target.hasAttribute('data-close')) closeModals(); });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeModals(); hideTeamList(); } });
  }

  // ============================================================
  //  INIT
  // ============================================================

  function init() {
    if (typeof XLSX === 'undefined') {
      el.parseError.hidden = false;
      el.parseError.textContent = '⚠️ Could not load the spreadsheet library. Try refreshing.';
    }
    wireEvents();
    loadSettings();
    Array.prototype.forEach.call(el.filterChips.querySelectorAll('.chip'), function (btn) {
      btn.classList.toggle('active', !!state.filters[btn.getAttribute('data-filter')]);
    });
    // Capture the hash before loadFromHash clears any #d= share payload.
    var rawHash = location.hash;
    // Priority: a shared link, then saved data, then the bundled season.
    loadFromHash().then(function (fromLink) {
      if (fromLink) return;
      if (load()) return;
      return loadBundled();
    }).then(function () {
      applyDefaultSelection();   // remembered team(s), or "all"
      applyTeamHash(rawHash);    // #team=… deep link overrides
      render();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
