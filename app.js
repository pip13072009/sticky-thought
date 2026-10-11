(function () {
  'use strict';

  // ---------- Config ----------

  // How soon a repeat visit counts for the silent nudge on "Pick a move".
  var NUDGE_WINDOW_MS = 10 * 60 * 1000;
  // How long the closing line stays before returning Home.
  var DONE_MS = 2200;
  // If the app sits in the background this long mid-flow, it quietly starts fresh.
  var STALE_MS = 2 * 60 * 1000;

  var SETTINGS_KEY = 'pebble.settings.v1';
  var LAST_KEY = 'pebble.last.v1';

  var FEELINGS = [
    { id: 'urgent', label: 'Urgent' },
    { id: 'sure', label: 'Need to be sure' },
    { id: 'whatif', label: 'What if…' },
    { id: 'do', label: 'Have to do something' },
    { id: 'off', label: 'Feels wrong / not right' }
  ];

  var THEMES = [
    { id: 'sage', label: 'Sage', dot: '#8fa88a' },
    { id: 'mist', label: 'Mist', dot: '#8eaabd' },
    { id: 'sand', label: 'Sand', dot: '#c4ae8a' },
    { id: 'lavender', label: 'Lavender', dot: '#a99cc6' },
    { id: 'rose', label: 'Rose', dot: '#c9a0a0' },
    { id: 'night', label: 'Night', dot: '#6d7f99' }
  ];

  // All three are always available; the play screen has a switcher and remembers the last one.
  var FIDGETS = [
    { id: 'bubbles', label: 'Pop', name: 'Bubble pop' },
    { id: 'lava', label: 'Lava', name: 'Lava lamp' },
    { id: 'slime', label: 'Slime', name: 'Slime swirl' }
  ];

  // {name} is swapped for whatever she calls it (default "OCD").
  var DEFAULT_PHRASES = {
    reflect: {
      urgent: ["This feels like {name}'s pattern. Urgent doesn't mean important."],
      sure: ["This feels like {name}'s pattern. You don't have to be sure."],
      whatif: ["This feels like {name}'s pattern. What-ifs aren't facts."],
      do: ["This feels like {name}'s pattern. The urge will fade on its own."],
      off: ["This feels like {name}'s pattern. It can feel off and still be OK."],
      several: ["This feels like {name}'s pattern. Loud doesn't mean true."]
    },
    moves: {
      carry: 'Carry on anyway',
      fidget: 'Something to play with',
      other: 'Do something else'
    },
    closing: [
      'Nice. You noticed it.',
      'You noticed it. That’s enough.',
      'Done. Nice one!'
    ],
    nudge: '{name} might want you checking. Carry on anyway could help.'
  };

  function defaults() {
    return {
      setupDone: false,
      name: '',
      theme: 'sage',
      fidget: 'bubbles',
      writtenNudge: false,
      phrases: clone(DEFAULT_PHRASES)
    };
  }

  // ---------- Storage (fails quietly; the app works without it) ----------

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function load() {
    var s = defaults();
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        Object.keys(s).forEach(function (k) { if (k in saved && k !== 'phrases') s[k] = saved[k]; });
        if (saved.phrases) {
          var p = saved.phrases;
          if (p.reflect) Object.keys(s.phrases.reflect).forEach(function (k) {
            if (Array.isArray(p.reflect[k])) s.phrases.reflect[k] = p.reflect[k];
          });
          if (p.moves) Object.keys(s.phrases.moves).forEach(function (k) {
            if (typeof p.moves[k] === 'string') s.phrases.moves[k] = p.moves[k];
          });
          if (Array.isArray(p.closing)) s.phrases.closing = p.closing;
          if (typeof p.nudge === 'string') s.phrases.nudge = p.nudge;
        }
      }
    } catch (e) { /* keep defaults */ }
    return s;
  }

  function save() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  function getLast() {
    try { return Number(localStorage.getItem(LAST_KEY)) || 0; } catch (e) { return 0; }
  }

  function setLast() {
    try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch (e) { /* ignore */ }
  }

  function wipe() {
    try { localStorage.removeItem(SETTINGS_KEY); localStorage.removeItem(LAST_KEY); } catch (e) { /* ignore */ }
    settings = defaults();
  }

  var settings = load();

  // ---------- Text helpers ----------

  function displayName() { return (settings.name || '').trim() || 'OCD'; }

  function fill(line) {
    var out = String(line).split('{name}').join(displayName());
    return out.charAt(0).toUpperCase() + out.slice(1);
  }

  // For editing: show the real name, then turn it back into {name} on save.
  function toEditable(line) { return String(line).split('{name}').join(displayName()); }
  function fromEditable(line) { return String(line).split(displayName()).join('{name}'); }

  function cleanLines(text) {
    return text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  }

  var lastShown = {};
  function pick(list, key) {
    if (!list || !list.length) return '';
    if (list.length === 1) return list[0];
    var i;
    do { i = Math.floor(Math.random() * list.length); } while (i === lastShown[key]);
    lastShown[key] = i;
    return list[i];
  }

  function reflectLines(key) {
    var lines = settings.phrases.reflect[key];
    return lines && lines.length ? lines : DEFAULT_PHRASES.reflect[key];
  }
  function moveLabel(key) { return (settings.phrases.moves[key] || '').trim() || DEFAULT_PHRASES.moves[key]; }
  function closingLines() { return settings.phrases.closing.length ? settings.phrases.closing : DEFAULT_PHRASES.closing; }
  function nudgeText() { return (settings.phrases.nudge || '').trim() || DEFAULT_PHRASES.nudge; }

  // ---------- Theme ----------

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', settings.theme);
    var bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && bg) meta.setAttribute('content', bg);
  }
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', applyTheme);
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function buzz(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* unsupported */ }
  }

  // ---------- DOM helper ----------

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (cc) { if (cc) el.appendChild(cc); });
      else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }

  var ICONS = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
  };

  function iconBtn(name, label, onclick, extra) {
    return h('button', { class: 'icon-btn ' + (extra || ''), 'aria-label': label, html: ICONS[name], onclick: onclick });
  }

  // ---------- Navigation ----------

  var app = document.getElementById('app');
  var screen = 'home';
  var session = null; // { picked: {}, repeat: bool, line: string }
  var doneTimer = null;
  var stopFidget = null;
  var pushed = false;
  var ignorePop = false;

  function show(name) {
    screen = name;
    if (doneTimer) { clearTimeout(doneTimer); doneTimer = null; }
    if (stopFidget) { stopFidget(); stopFidget = null; }
    if (name !== 'home' && !pushed) {
      // One history entry, so the phone's back button simply ends things and returns Home.
      try { history.pushState({ sub: true }, ''); pushed = true; } catch (e) { /* ignore */ }
    }
    app.innerHTML = '';
    app.appendChild(SCREENS[name]());
    window.scrollTo(0, 0);
  }

  function goHome() {
    session = null;
    if (pushed) {
      pushed = false;
      ignorePop = true;
      try { history.back(); } catch (e) { ignorePop = false; }
    }
    show('home');
  }

  window.addEventListener('popstate', function () {
    if (ignorePop) { ignorePop = false; return; }
    pushed = false;
    if (screen !== 'home') { session = null; show('home'); }
  });

  var hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > STALE_MS && session) goHome();
  });

  function startSession() {
    session = { picked: {}, repeat: getLast() > 0 && Date.now() - getLast() < NUDGE_WINDOW_MS, line: '' };
    show('feel');
  }

  function finishSession() {
    setLast();
    show('done');
  }

  // ---------- Screens ----------

  var SCREENS = {};

  SCREENS.home = function () {
    if (!settings.setupDone) { setupStep = 0; return SCREENS.setup(); }
    return h('section', { class: 'screen' },
      h('div', { class: 'topbar' },
        h('span'),
        iconBtn('gear', 'Settings', function () { show('settings'); }, 'faint')
      ),
      h('div', { class: 'grow stack center', style: 'justify-content:center' },
        h('button', { class: 'btn primary huge', onclick: startSession, text: 'Sticky thought' })
      ),
      h('div', { class: 'bottom center stack' },
        h('button', { class: 'link', onclick: function () { show('help'); }, text: 'Need more help?' })
      )
    );
  };

  SCREENS.feel = function () {
    var next = h('button', { class: 'btn primary big', text: 'Next', disabled: !anyPicked(), onclick: function () {
      session.line = '';
      show('reflect');
    } });

    var chips = FEELINGS.map(function (f) {
      var on = !!session.picked[f.id];
      var chip = h('button', { class: 'chip', 'aria-pressed': on ? 'true' : 'false', onclick: function () {
        session.picked[f.id] = !session.picked[f.id];
        chip.setAttribute('aria-pressed', session.picked[f.id] ? 'true' : 'false');
        next.disabled = !anyPicked();
      } }, h('span', { class: 'tick', 'aria-hidden': 'true' }), h('span', { text: f.label }));
      return chip;
    });

    return h('section', { class: 'screen' },
      h('div', { class: 'topbar' }, iconBtn('back', 'Back', goHome), h('span')),
      h('h1', { text: 'What does it feel like?' }),
      h('p', { class: 'muted small', text: 'Tap any that fit.' }),
      h('div', { class: 'chips' }, chips),
      h('div', { class: 'bottom' }, next)
    );
  };

  function anyPicked() {
    return Object.keys(session.picked).some(function (k) { return session.picked[k]; });
  }

  SCREENS.reflect = function () {
    var ids = Object.keys(session.picked).filter(function (k) { return session.picked[k]; });
    var key = ids.length === 1 ? ids[0] : 'several';
    if (!session.line) session.line = pick(reflectLines(key), 'reflect-' + key);

    return h('section', { class: 'screen' },
      h('div', { class: 'topbar' }, iconBtn('back', 'Back', function () { show('feel'); }), h('span')),
      h('div', { class: 'grow stack center', style: 'justify-content:center;gap:24px' },
        h('p', { class: 'reflect', text: fill(session.line) }),
        session.repeat && settings.writtenNudge ? h('p', { class: 'nudge-line', text: fill(nudgeText()) }) : null
      ),
      h('div', { class: 'bottom' },
        h('button', { class: 'btn primary big', text: 'Next', onclick: function () { show('move'); } })
      )
    );
  };

  SCREENS.move = function () {
    var order = ['carry', 'fidget', 'other'];

    var buttons = order.map(function (k) {
      var cls = 'btn big' + (session.repeat && k === 'carry' ? ' boost primary' : '');
      return h('button', { class: cls, text: moveLabel(k), onclick: function () {
        if (k === 'fidget') show('fidget'); else finishSession();
      } });
    });

    return h('section', { class: 'screen' },
      h('div', { class: 'topbar' }, iconBtn('back', 'Back', function () { show('reflect'); }), h('span')),
      h('h1', { text: 'Pick a move' }),
      h('div', { class: 'stack grow', style: 'justify-content:center' }, buttons)
    );
  };

  SCREENS.done = function () {
    doneTimer = setTimeout(goHome, DONE_MS);
    return h('section', { class: 'screen center', onclick: goHome },
      h('p', { class: 'closing', text: fill(pick(closingLines(), 'closing')) })
    );
  };

  SCREENS.fidget = function () {
    if (!FIDGETS.some(function (f) { return f.id === settings.fidget; })) settings.fidget = FIDGETS[0].id;
    var canvas = h('canvas', { role: 'img' });
    var tabs = h('div', { class: 'fidget-tabs', role: 'group', 'aria-label': 'Choose one' });

    function run(id) {
      if (stopFidget) { stopFidget(); stopFidget = null; }
      settings.fidget = id; save();
      Array.prototype.forEach.call(tabs.children, function (t) {
        t.setAttribute('aria-pressed', t.getAttribute('data-id') === id ? 'true' : 'false');
      });
      canvas.setAttribute('aria-label', FIDGETS.filter(function (f) { return f.id === id; })[0].name);
      stopFidget = startFidget(id, canvas);
    }

    FIDGETS.forEach(function (f) {
      tabs.appendChild(h('button', { class: 'fidget-tab', 'data-id': f.id, text: f.label,
        onclick: function () { if (settings.fidget !== f.id) run(f.id); } }));
    });

    var wrap = h('div', { class: 'fidget-wrap' },
      canvas,
      tabs,
      h('button', { class: 'fidget-done', text: 'Done', onclick: finishSession })
    );
    // Start after the canvas is in the page so it can size itself.
    setTimeout(function () {
      if (screen === 'fidget') run(settings.fidget);
    }, 0);
    return h('section', { class: 'screen' }, wrap);
  };

  SCREENS.help = function () {
    return h('section', { class: 'screen' },
      h('div', { class: 'topbar' }, iconBtn('back', 'Back', goHome), h('span')),
      h('h1', { text: 'Need more help?' }),
      h('p', { class: 'muted', text: 'Free, any time, day or night.' }),
      h('div', { class: 'stack' },
        h('a', { class: 'btn big', href: 'sms:85258?&body=SHOUT' },
          h('span', {}, h('strong', { text: 'Shout' }), h('br'), h('span', { class: 'small muted', text: 'Text SHOUT to 85258' }))),
        h('a', { class: 'btn big', href: 'tel:116123' },
          h('span', {}, h('strong', { text: 'Samaritans' }), h('br'), h('span', { class: 'small muted', text: 'Call 116 123' })))
      ),
      h('p', { class: 'note', text: 'Talk to someone you trust.' })
    );
  };

  // ----- First-run setup -----

  var setupStep = 0;

  function setupShell(title, sub, body, onNext) {
    var dots = h('div', { class: 'dots', 'aria-hidden': 'true' },
      [0, 1].map(function (i) { return h('span', { class: i === setupStep ? 'on' : '' }); }));
    function advance() {
      if (setupStep < 1) { setupStep++; show('setup'); }
      else { settings.setupDone = true; save(); goHome(); }
    }
    return h('section', { class: 'screen' },
      h('div', { class: 'topbar' },
        setupStep > 0 ? iconBtn('back', 'Back', function () { setupStep--; show('setup'); }) : h('span'),
        h('button', { class: 'link', text: 'Skip', onclick: advance })
      ),
      h('h1', { text: title }),
      sub ? h('p', { class: 'muted', text: sub }) : null,
      body,
      h('div', { class: 'bottom stack' },
        dots,
        h('button', { class: 'btn primary big', text: setupStep < 1 ? 'Next' : 'All set', onclick: function () {
          if (onNext) onNext();
          save();
          advance();
        } })
      )
    );
  }

  SCREENS.setup = function () {
    if (setupStep === 0) {
      var input = h('input', { type: 'text', maxlength: '40', placeholder: 'e.g. the Gremlin', value: settings.name,
        autocomplete: 'off', autocapitalize: 'none', 'aria-label': 'Name' });
      return setupShell('Want to give it a name?',
        'Some people give OCD a name. You can leave it as “OCD” too. You can change this whenever.',
        h('div', { class: 'field' }, input),
        function () { settings.name = input.value.trim(); });
    }
    return setupShell('Pick a look', 'It follows your phone’s dark mode too.', themePicker(), null);
  };

  function themePicker() {
    var wrap = h('div', { class: 'swatches' });
    THEMES.forEach(function (t) {
      var b = h('button', { class: 'swatch', 'aria-pressed': settings.theme === t.id ? 'true' : 'false', onclick: function () {
        settings.theme = t.id; save(); applyTheme();
        Array.prototype.forEach.call(wrap.children, function (c) { c.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
      } }, h('span', { class: 'dot', style: 'background:' + t.dot }), h('span', { text: t.label }));
      wrap.appendChild(b);
    });
    return wrap;
  }

  // ----- Settings -----

  var deleteArmed = false;

  SCREENS.settings = function () {
    deleteArmed = false;

    var nameInput = h('input', { type: 'text', maxlength: '40', value: settings.name, placeholder: 'OCD',
      autocomplete: 'off', autocapitalize: 'none', id: 'set-name', onchange: function () {
        settings.name = nameInput.value.trim(); save();
      } });

    var nudgeSwitch = h('button', { class: 'switch', role: 'switch', 'aria-checked': settings.writtenNudge ? 'true' : 'false',
      'aria-label': 'Written nudge', onclick: function () {
        settings.writtenNudge = !settings.writtenNudge; save();
        nudgeSwitch.setAttribute('aria-checked', settings.writtenNudge ? 'true' : 'false');
      } });

    var delBtn = h('button', { class: 'btn', text: 'Delete everything', onclick: function () {
      if (!deleteArmed) {
        deleteArmed = true;
        delBtn.textContent = 'Tap again to delete everything';
        return;
      }
      wipe(); applyTheme(); setupStep = 0; goHome();
    } });

    return h('section', { class: 'screen' },
      h('div', { class: 'topbar' }, iconBtn('back', 'Back', goHome), h('span')),
      h('h1', { text: 'Settings' }),
      h('p', { class: 'note', text: 'Everything stays on this phone. Nobody else can see it.' }),

      h('h2', { text: 'Name' }),
      h('div', { class: 'field' }, h('label', { for: 'set-name', text: 'What you call it' }), nameInput),

      h('h2', { text: 'Look' }),
      themePicker(),

      h('h2', { text: 'Words' }),
      h('p', { class: 'muted small', text: 'Make the words your own.' }),
      h('button', { class: 'btn', text: 'Edit the words', onclick: function () { show('phrases'); } }),

      h('h2', { text: 'Written nudge' }),
      h('div', { class: 'toggle-row' },
        h('span', { class: 'small', text: 'If you come back soon after, show a gentle extra line.' }),
        h('span', { class: 'switch-hit' }, nudgeSwitch)
      ),

      h('h2', { text: 'Start over' }),
      delBtn,
      h('p', { class: 'muted small center', style: 'margin-top:12px', text: 'Pebble · v1' })
    );
  };

  SCREENS.phrases = function () {
    var p = settings.phrases;

    function linesField(id, label, getList, setList) {
      var ta = h('textarea', { id: id, rows: '3' });
      ta.value = getList().map(toEditable).join('\n');
      ta.addEventListener('change', function () { setList(cleanLines(ta.value).map(fromEditable)); save(); });
      return h('div', { class: 'field' }, h('label', { for: id, text: label }), ta);
    }

    function textField(id, label, get, set) {
      var inp = h('input', { type: 'text', id: id, maxlength: '120' });
      inp.value = toEditable(get());
      inp.addEventListener('change', function () { set(fromEditable(inp.value.trim())); save(); });
      return h('div', { class: 'field' }, h('label', { for: id, text: label }), inp);
    }

    var reflectFields = FEELINGS.concat([{ id: 'several', label: 'More than one' }]).map(function (f) {
      return linesField('r-' + f.id, f.label, function () { return p.reflect[f.id]; },
        function (v) { p.reflect[f.id] = v; });
    });

    var moveFields = ['carry', 'fidget', 'other'].map(function (k) {
      return textField('m-' + k, DEFAULT_PHRASES.moves[k], function () { return p.moves[k]; },
        function (v) { p.moves[k] = v; });
    });

    return h('section', { class: 'screen' },
      h('div', { class: 'topbar' }, iconBtn('back', 'Back', function () { show('settings'); }), h('span')),
      h('h1', { text: 'Your words' }),
      h('p', { class: 'muted small', text: 'Put each line on its own row. If there are a few, they take turns. Changes save by themselves.' }),

      h('h2', { text: 'What it says back' }),
      reflectFields,

      h('h2', { text: 'Move buttons' }),
      moveFields,

      h('h2', { text: 'Closing lines' }),
      linesField('closing', 'Shown at the end', function () { return p.closing; }, function (v) { p.closing = v; }),

      h('h2', { text: 'Written nudge' }),
      textField('nudge', 'Extra line (only if the nudge is on)', function () { return p.nudge; }, function (v) { p.nudge = v; }),

      h('div', { class: 'stack', style: 'margin-top:16px' },
        h('button', { class: 'btn', text: 'Restore the original words', onclick: function () {
          settings.phrases = clone(DEFAULT_PHRASES); save(); show('phrases');
        } })
      )
    );
  };

  // ---------- Fidgets ----------

  function themeColours() {
    var cs = getComputedStyle(document.documentElement);
    function v(n) { return cs.getPropertyValue(n).trim(); }
    return { bg: v('--bg'), surface: v('--surface'), line: v('--line'), accent: v('--accent'), chip: v('--chip-on'), text: v('--text') };
  }

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return [140, 160, 140];
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function startFidget(kind, canvas) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;
    var running = true;
    var calm = reducedMotion();
    var col = themeColours();
    var impl;

    function resize() {
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (impl && impl.resize) impl.resize();
    }

    function point(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    if (kind === 'lava') impl = lava();
    else if (kind === 'slime') impl = slime();
    else impl = bubbles();

    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    function onDown(e) { e.preventDefault(); impl.down && impl.down(point(e), e.pointerId); }
    function onMove(e) { impl.move && impl.move(point(e), e.pointerId, e.buttons || e.pointerType === 'touch'); }
    function onUp(e) { impl.up && impl.up(e.pointerId); }

    var last = performance.now();
    function frame(now) {
      if (!running) return;
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      impl.draw(dt);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return function stop() {
      running = false;
      window.removeEventListener('resize', resize);
    };

    // --- Bubble pop: a sheet of bubble wrap that refills when it's all popped.
    function bubbles() {
      var cells = [], r = 0;
      function layout() {
        cells = [];
        r = Math.max(26, Math.min(W, H) / 9);
        var gap = r * 2.25, rowH = gap * 0.87;
        // Keep clear of the switcher at the top and the Done button at the bottom.
        var top = 76, bottom = 76, avail = H - top - bottom;
        var cols = Math.floor((W - r) / gap), rows = Math.max(1, Math.floor((avail - 2 * r) / rowH) + 1);
        var ox = (W - (cols - 1) * gap - gap / 2) / 2, oy = top + (avail - (rows - 1) * rowH) / 2;
        for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
          cells.push({ x: ox + x * gap + (y % 2 ? gap / 2 : 0), y: oy + y * rowH, popped: false, t: 0, grow: 1 });
        }
      }
      return {
        resize: layout,
        down: function (p) {
          for (var i = 0; i < cells.length; i++) {
            var c = cells[i], dx = p.x - c.x, dy = p.y - c.y;
            if (!c.popped && dx * dx + dy * dy < r * r * 1.1) {
              c.popped = true; c.t = 0; buzz(12);
              break;
            }
          }
          if (cells.every(function (c) { return c.popped; })) {
            setTimeout(function () { cells.forEach(function (c) { c.popped = false; c.grow = 0; }); }, 600);
          }
        },
        draw: function (dt) {
          ctx.fillStyle = col.bg; ctx.fillRect(0, 0, W, H);
          cells.forEach(function (c) {
            if (c.grow < 1) c.grow = calm ? 1 : Math.min(1, c.grow + dt * 3);
            if (c.popped) c.t = Math.min(1, c.t + dt * 6);
            var rr = r * (c.popped ? 1 - 0.35 * c.t : c.grow);
            ctx.beginPath(); ctx.arc(c.x, c.y, rr, 0, Math.PI * 2);
            ctx.fillStyle = c.popped ? col.surface : col.chip; ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = col.line; ctx.stroke();
            if (!c.popped) {
              ctx.beginPath(); ctx.arc(c.x - rr * 0.35, c.y - rr * 0.35, rr * 0.22, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
            } else {
              ctx.beginPath();
              ctx.moveTo(c.x - rr * 0.4, c.y); ctx.quadraticCurveTo(c.x, c.y + rr * 0.3, c.x + rr * 0.4, c.y);
              ctx.strokeStyle = col.line; ctx.stroke();
            }
          });
        }
      };
    }

    // --- Lava lamp: slow blobs; touch warms them so they drift towards your finger.
    function lava() {
      var scale = 6, lw, lh, low = document.createElement('canvas'), lctx = low.getContext('2d'), img;
      var blobs = [], touch = null;
      var a = hexToRgb(col.accent), b = hexToRgb(col.bg);
      function setup() {
        lw = Math.max(20, Math.round(W / scale)); lh = Math.max(20, Math.round(H / scale));
        low.width = lw; low.height = lh; img = lctx.createImageData(lw, lh);
        if (!blobs.length) for (var i = 0; i < 7; i++) {
          blobs.push({ x: Math.random() * lw, y: Math.random() * lh, vx: 0, vy: (Math.random() - 0.5) * 4,
            r: lw * (0.12 + Math.random() * 0.1), phase: Math.random() * 6.28 });
        }
      }
      var time = 0;
      return {
        resize: setup,
        down: function (p) { touch = { x: p.x / scale, y: p.y / scale }; buzz(8); },
        move: function (p, id, pressed) { if (pressed && touch) touch = { x: p.x / scale, y: p.y / scale }; },
        up: function () { touch = null; },
        draw: function (dt) {
          var speed = calm ? 0.35 : 1;
          time += dt * speed;
          blobs.forEach(function (bl) {
            bl.vy += Math.sin(time * 0.6 + bl.phase) * 2.2 * dt;
            if (touch) {
              var dx = touch.x - bl.x, dy = touch.y - bl.y, d = Math.sqrt(dx * dx + dy * dy) + 1;
              bl.vx += dx / d * 14 * dt; bl.vy += dy / d * 14 * dt;
            }
            bl.vx *= 0.985; bl.vy *= 0.985;
            bl.x += bl.vx * dt * speed * 3; bl.y += bl.vy * dt * speed * 3;
            if (bl.x < 0 || bl.x > lw) { bl.vx *= -1; bl.x = Math.max(0, Math.min(lw, bl.x)); }
            if (bl.y < 0 || bl.y > lh) { bl.vy *= -1; bl.y = Math.max(0, Math.min(lh, bl.y)); }
          });
          var d = img.data, i = 0;
          for (var y = 0; y < lh; y++) for (var x = 0; x < lw; x++) {
            var f = 0;
            for (var k = 0; k < blobs.length; k++) {
              var bl = blobs[k], dx = x - bl.x, dy = y - bl.y;
              f += bl.r * bl.r / (dx * dx + dy * dy + 1);
            }
            var t = Math.max(0, Math.min(1, (f - 0.85) * 3));
            d[i++] = b[0] + (a[0] - b[0]) * t;
            d[i++] = b[1] + (a[1] - b[1]) * t;
            d[i++] = b[2] + (a[2] - b[2]) * t;
            d[i++] = 255;
          }
          lctx.putImageData(img, 0, 0);
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(low, 0, 0, W, H);
        }
      };
    }

    // --- Slime swirl: drag to smear soft colour that slowly swirls and fades.
    function slime() {
      var blobs = [], pointers = {};
      var a = col.accent, c2 = col.chip;
      return {
        resize: function () { ctx.fillStyle = col.bg; ctx.fillRect(0, 0, W, H); },
        down: function (p, id) { pointers[id] = p; buzz(6); add(p, 0, 0); },
        move: function (p, id) {
          var prev = pointers[id];
          if (!prev) return;
          var dx = p.x - prev.x, dy = p.y - prev.y, steps = Math.max(1, Math.round(Math.hypot(dx, dy) / 8));
          for (var s = 1; s <= steps; s++) add({ x: prev.x + dx * s / steps, y: prev.y + dy * s / steps }, dx, dy);
          pointers[id] = p;
        },
        up: function (id) { delete pointers[id]; },
        draw: function (dt) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = col.bg; ctx.fillRect(0, 0, W, H);
          var cx = W / 2, cy = H / 2, swirl = calm ? 0.05 : 0.25;
          for (var i = blobs.length - 1; i >= 0; i--) {
            var bl = blobs[i];
            var rx = bl.x - cx, ry = bl.y - cy;
            bl.vx += -ry * swirl * dt * 0.6; bl.vy += rx * swirl * dt * 0.6;
            bl.vx *= 0.96; bl.vy *= 0.96;
            bl.x += bl.vx * dt; bl.y += bl.vy * dt;
            bl.life -= dt * (calm ? 0.12 : 0.2);
            if (bl.life <= 0) { blobs.splice(i, 1); continue; }
            ctx.globalAlpha = Math.min(0.5, bl.life * 0.5);
            ctx.beginPath(); ctx.arc(bl.x, bl.y, bl.r * (1.2 - bl.life * 0.2), 0, Math.PI * 2);
            ctx.fillStyle = bl.c; ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      };
      function add(p, dx, dy) {
        if (blobs.length > 900) blobs.shift();
        blobs.push({ x: p.x, y: p.y, vx: dx * 4, vy: dy * 4, r: 18 + Math.random() * 16, life: 1,
          c: Math.random() < 0.5 ? a : c2 });
      }
    }
  }

  // ---------- Boot ----------

  applyTheme();
  show('home');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* works online without it */ });
    });
  }
})();
