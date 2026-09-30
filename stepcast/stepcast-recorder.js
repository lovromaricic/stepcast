/*!
 * StepCast v1 — tutorial recorder. Authoring only: never ship this to a live site.
 *
 *   <script src="stepcast/stepcast-recorder.js" data-stable-attrs="data-action"></script>
 *
 * Loading this file shows the recording panel. It loads stepcast-player.js from the same
 * folder unless the player is already on the page.
 * `data-stable-attrs` (optional) lists extra attributes to prefer when building selectors.
 */
(() => {
  'use strict';
  if (window.StepCast && window.StepCast.showRecorder) return;

  const DRAFT_KEY = 'stepcast:draft';
  const UI_KEY = 'stepcast:ui';
  const SETTINGS_KEY = 'stepcast:settings';
  const MODES = ['auto', 'light', 'dark'];

  const script = document.currentScript;
  const BASE = new URL('.', script ? script.src : location.href);

  // ---------------------------------------------------------------- helpers

  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
  };

  const slug = (s) =>
    s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim()
      .replace(/[\s_]+/g, '-').replace(/-+/g, '-') || 'tutorial';

  // '#abc', 'abc', '#AABBCC' → '#aabbcc'; anything else → null.
  function normalizeHex(value) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value).trim());
    if (!m) return null;
    const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
    return '#' + hex.toLowerCase();
  }

  const MIN_BUTTON_CONTRAST = 3; // below this (WCAG ratio), warn about the button text color

  // Static, trusted markup: parsed via <template> so the SVG gets the right namespace.
  function icon(markup, size = 16) {
    const t = document.createElement('template');
    t.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
      `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${markup}</svg>`;
    return t.content.firstChild;
  }
  const GEAR = '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>';
  const ARROW_LEFT = '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>';
  const GRIP = '<path d="M8 8h8M8 12h8M8 16h8"/>';
  const CHEVRON_RIGHT = '<path d="m9 18 6-6-6-6"/>';
  const PLUS = '<path d="M12 5v14M5 12h14"/>';
  const CHEVRON_UP = '<path d="m18 15-6-6-6 6"/>';
  const CHEVRON_DOWN = '<path d="m6 9 6 6 6-6"/>';
  const PLAY = '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke-linejoin="round"/>';
  const RECORD = '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>';
  const STOP = '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none"/>';
  const RESTART = '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>';
  const TARGET = '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>';
  const EYE = '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
  const DOWNLOAD = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>';
  const COPY = '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>';
  const FOLDER = '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>';

  // -------------------------------------------------------------- selectors

  const extra = ((script && script.dataset.stableAttrs) || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const STABLE_ATTRS = ['data-stepcast', ...extra, 'data-testid', 'data-test', 'data-cy', 'data-qa'];
  const NAMING_ATTRS = ['name', 'aria-label', 'placeholder', 'title', 'alt'];
  const CLICKABLE = 'a, button, input, select, textarea, label, summary, [role="button"], [role="menuitem"], ' +
    '[role="tab"], [role="link"], [role="checkbox"], [role="option"], [onclick], [tabindex]';

  const attrSel = (name, value) => `[${name}="${CSS.escape(value)}"]`;
  const isUnique = (sel) => { try { return document.querySelectorAll(sel).length === 1; } catch { return false; } };
  // Framework-generated ids (react ":r1:", "ember123", hashes) change between renders.
  const looksGenerated = (id) => /\d{4,}|[a-f0-9]{8,}|^:|^(ember|react|vue|ng|mui|radix)[-_:]/i.test(id);

  // Clicks often land on an icon or <span> inside the real control.
  const pickTarget = (node) => node.closest(CLICKABLE) || node;

  // Fields whose committed value is recorded as a "type" or "select" step. Checkboxes and radios stay clicks;
  // contenteditable is out of scope.
  const TEXT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'number']);
  // Never record secrets: password fields, and fields whose autocomplete says they hold one.
  const SECRET_AUTOCOMPLETE = ['current-password', 'new-password', 'cc-number', 'cc-csc', 'one-time-code'];

  function recordableField(el) {
    if (!(el instanceof Element) || el.closest('[data-stepcast-ignore]')) return null;
    const auto = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/);
    if (auto.some((token) => SECRET_AUTOCOMPLETE.includes(token))) return null;
    if (el instanceof HTMLSelectElement) return 'select';
    if (el instanceof HTMLTextAreaElement) return 'type';
    if (el instanceof HTMLInputElement && TEXT_TYPES.has(el.type)) return 'type'; // el.type is never "password" here
    return null;
  }

  // A field's human name for step names: its <label>, aria-label, placeholder or name.
  function fieldLabel(el) {
    let text = '';
    if (el.labels && el.labels[0]) {
      const label = el.labels[0].cloneNode(true);
      label.querySelectorAll('input, select, textarea').forEach((n) => n.remove()); // just the words
      text = label.textContent;
    }
    return (text.trim() || el.getAttribute('aria-label') || el.placeholder || el.name || '')
      .replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  function anchorFor(node) {
    for (const a of STABLE_ATTRS) {
      const v = node.getAttribute(a);
      if (v && isUnique(attrSel(a, v))) return attrSel(a, v);
    }
    if (node.id && !looksGenerated(node.id) && isUnique('#' + CSS.escape(node.id))) return '#' + CSS.escape(node.id);
    return null;
  }

  function segment(node) {
    const tag = node.localName;
    const parent = node.parentElement;
    if (!parent) return tag;
    const same = [...parent.children].filter((c) => c.localName === tag);
    return same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag;
  }

  // The element's own attributes, in preference order, for combining with an ancestor anchor.
  function ownAttrSelectors(el) {
    const sels = [];
    for (const a of STABLE_ATTRS) {
      const v = el.getAttribute(a);
      if (v) sels.push(attrSel(a, v));
    }
    for (const a of NAMING_ATTRS) {
      const v = el.getAttribute(a);
      if (v) sels.push(el.localName + attrSel(a, v));
    }
    return sels;
  }

  // "<nearest anchor> <own attribute>", if that matches exactly this element. Only the nearest anchor is tried:
  // a farther one contains it, so it can only match more elements.
  function scopedSelector(el) {
    const own = ownAttrSelectors(el);
    if (!own.length) return null;
    for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const anchor = anchorFor(node);
      if (!anchor) continue;
      for (const sel of own) {
        const combined = `${anchor} ${sel}`;
        if (isUnique(combined) && document.querySelector(combined) === el) return combined;
      }
      return null;
    }
    return null;
  }

  function selectorFor(el) {
    const own = anchorFor(el);
    if (own) return own;
    for (const a of NAMING_ATTRS) {
      const v = el.getAttribute(a);
      const sel = v && el.localName + attrSel(a, v);
      if (sel && isUnique(sel)) return sel;
    }
    // A stable or naming attribute that repeats on the page (e.g. data-action="water" on every card):
    // scope it to the nearest anchored ancestor, e.g. `#plant-monstera [data-action="water"]`.
    const scoped = scopedSelector(el);
    if (scoped) return scoped;
    // Structural path, anchored at the nearest ancestor with a stable id/attribute (or <body>).
    const parts = [];
    for (let node = el; node; node = node.parentElement) {
      const anchor = node !== el && anchorFor(node);
      if (anchor) { parts.unshift(anchor); break; }
      if (node === document.body) { parts.unshift('body'); break; }
      parts.unshift(segment(node));
    }
    return parts.join(' > ');
  }

  // ------------------------------------------------------------------- boot

  // Reuse the player if it's already on the page (or its <script> tag is still loading);
  // otherwise load it from this file's folder.
  function withPlayer(cb) {
    if (window.StepCast) return cb();
    const tag = [...document.scripts].find((s) => /stepcast-player\.js(\?|#|$)/.test(s.src)) ||
      document.head.appendChild(Object.assign(document.createElement('script'), {
        src: new URL('stepcast-player.js', BASE).href,
      }));
    tag.addEventListener('load', cb);
    tag.addEventListener('error', () => console.error(`StepCast: couldn't load ${tag.src}.`));
  }

  const whenReady = (fn) =>
    (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn());

  withPlayer(() => whenReady(start));

  // --------------------------------------------------------------- recorder

  function start() {
    const StepCast = window.StepCast;
    const {
      h, root, findElement, textOf, describe, fieldAction, outline, unpeek, contrast, setBaseLook, isPlaying,
      rankedVoices, previewVoice,
    } = StepCast._internal;

    const ui = Object.assign({ collapsed: false }, store.get(UI_KEY));
    let draft = store.get(DRAFT_KEY) || blankDraft();
    let recording = false;
    let openStep = -1;
    let lastRecorded = null;
    let lastRecordAt = -Infinity;
    let panel = null;
    const els = {};

    // ------------------------------------------------------------- settings

    // brand → --sc-accent, buttonText → --sc-accent-fg. Empty means "default" / "automatic".
    // narration: whether exported tutorials read steps aloud (visitors can then mute it; off means no narration at all).
    // voice: the preferred narration voice's name, '' = automatic (best available on each visitor's device).
    const DEFAULT_SETTINGS = { mode: 'auto', brand: '', buttonText: '', narration: false, voice: '' };
    const saved = store.get(SETTINGS_KEY) || {};
    let settings = {
      mode: MODES.includes(saved.mode) ? saved.mode : 'auto',
      brand: normalizeHex(saved.brand || saved.accent || '') || '', // `accent` was the pre-rename key
      buttonText: normalizeHex(saved.buttonText || '') || '',
      narration: saved.narration === true,
      voice: typeof saved.voice === 'string' ? saved.voice : '',
    };

    const cssColor = (name) => normalizeHex(getComputedStyle(root).getPropertyValue(name));

    // The author's settings become the player's base look: shown now (panel, ring, tutorial box, progress bar)
    // and restored after any tutorial plays with its own theme.
    function applySettings() {
      setBaseLook({ mode: settings.mode, brand: settings.brand || null, text: settings.buttonText || null });
      if (els.brand) syncSettingsFields();
    }

    // What a downloaded tutorial carries, so it plays with this look anywhere (null = default / automatic).
    const currentTheme = () => ({
      mode: settings.mode,
      brandColor: settings.brand || null,
      buttonTextColor: settings.buttonText || null,
    });

    function saveSettings() {
      store.set(SETTINGS_KEY, settings);
      applySettings();
    }

    function resetSettings() {
      settings = { ...DEFAULT_SETTINGS };
      saveSettings();
    }

    // What each hex field shows when it isn't being edited.
    const hexDisplay = {
      brand: () => settings.brand, // empty shows the "Default" placeholder
      buttonText: () => settings.buttonText || cssColor('--sc-accent-fg') || '',
    };

    function syncSettingsFields() {
      els.mode.value = settings.mode;
      els.narration.value = settings.narration ? 'on' : 'off';
      els.voiceField.hidden = !settings.narration; // choosing a voice only matters when narration is on
      fillVoiceOptions();
      // Pickers always show the colors in effect, including theme defaults and the automatic text color.
      const brand = cssColor('--sc-accent') || '#4f46e5';
      const text = cssColor('--sc-accent-fg') || '#ffffff';
      els.brand.picker.value = brand;
      els.buttonText.picker.value = text;
      for (const key of ['brand', 'buttonText']) {
        if (document.activeElement !== els[key].hex) els[key].hex.value = hexDisplay[key]();
      }
      const auto = !settings.buttonText;
      els.buttonText.autoTag.hidden = !auto;
      els.buttonText.autoBtn.disabled = auto;
      els.buttonText.hex.classList.toggle('sc-auto', auto);
      const ratio = contrast(brand, text);
      els.buttonText.warn.hidden = ratio >= MIN_BUTTON_CONTRAST;
      els.buttonText.warn.textContent = `Low contrast (${ratio.toFixed(1)}:1) with the brand color. Button text may be hard to read.`;
    }

    function onHexInput(key, raw) {
      const value = raw.trim();
      const hex = normalizeHex(value);
      if (!value) settings[key] = '';
      else if (hex) settings[key] = hex;
      else return; // invalid: keep the last valid color until blur restores the field
      saveSettings();
    }

    // A native color picker and a hex text field for one setting, kept in sync through `settings`.
    function colorField(key, label, id) {
      return {
        picker: h('input', {
          class: 'sc-color', type: 'color', 'aria-label': `${label} picker`,
          oninput: (e) => { settings[key] = normalizeHex(e.target.value) || ''; saveSettings(); },
        }),
        hex: h('input', {
          class: 'sc-input sc-mono', type: 'text', id, placeholder: 'Default',
          maxlength: 7, spellcheck: 'false', autocomplete: 'off',
          oninput: (e) => onHexInput(key, e.target.value),
          onblur: (e) => { e.target.value = hexDisplay[key](); }, // normalized, or the last valid value
        }),
      };
    }

    function showSettings(open) {
      els.main.hidden = open;
      els.settingsView.hidden = !open;
      (open ? els.mode : els.gear).focus();
    }

    function blankDraft() {
      return { version: StepCast.version, id: '', title: '', startUrl: location.pathname, createdAt: null, steps: [] };
    }
    const saveDraft = () => store.set(DRAFT_KEY, draft);

    // Throwing away steps (re-record, new tutorial) asks for a second click inside the panel rather than using
    // confirm(), which embedded browsers and "block dialogs" settings silently turn into "cancel".
    // `confirming` is null, 'rerecord' or 'new'. While set, Record becomes the red "yes" button and Preview the
    // "keep" button; it cancels itself after 5 seconds.
    let confirming = null;
    let confirmTimer = 0;

    function askToConfirm(kind) {
      confirming = kind;
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(cancelConfirm, 5000);
      renderPanel();
    }

    function cancelConfirm() {
      confirming = null;
      clearTimeout(confirmTimer);
      renderPanel();
    }

    function onRecordButton() {
      if (recording) return stopRecording();
      if (confirming === 'new') return startNewTutorial();
      if (draft.steps.length && confirming !== 'rerecord') return askToConfirm('rerecord');
      startRecording();
    }

    function onNewButton() {
      if (recording) return;
      if (draft.steps.length) return askToConfirm('new');
      startNewTutorial();
    }

    // Back to a blank draft: no title, no steps, and nothing saved, so a reload stays blank.
    // Settings and the handle position live under other keys and are left alone.
    function startNewTutorial() {
      if (isPlaying()) StepCast.stop();
      confirming = null;
      clearTimeout(confirmTimer);
      draft = blankDraft();
      openStep = -1;
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* private mode */ }
      els.title.value = '';
      renderPanel();
      els.title.focus();
    }

    function startRecording() {
      if (isPlaying()) StepCast.stop();
      confirming = null;
      clearTimeout(confirmTimer);
      draft = { ...blankDraft(), title: draft.title, id: draft.id, createdAt: new Date().toISOString() };
      lastRecorded = null;
      recording = true;
      openStep = -1;
      ui.collapsed = true;
      store.set(UI_KEY, ui);
      saveDraft();
      renderPanel();
    }

    function stopRecording() {
      recording = false;
      ui.collapsed = false;
      store.set(UI_KEY, ui);
      renderPanel();
    }

    function onRecordClick(e) {
      if (!recording || !(e.target instanceof Element) || root.contains(e.target)) return;
      if (e.detail > 1) return; // second click of a double-click
      if (e.target.closest('[data-stepcast-ignore]')) return;
      const el = pickTarget(e.target);
      if (isSecretField(el)) return; // never record password or other secret fields, not even a click
      // Clicking a <label> also fires a click on its control: record only the label.
      if (lastRecorded instanceof HTMLLabelElement && lastRecorded.control === el && e.timeStamp - lastRecordAt < 50) return;
      // Clicking back into the field you just typed in: the next commit updates that step instead.
      const last = draft.steps[draft.steps.length - 1];
      if (el === lastRecorded && last && fieldAction(last)) return;
      lastRecorded = el;
      lastRecordAt = e.timeStamp;
      draft.steps.push({
        selector: selectorFor(el),
        subtitle: '',
        url: location.pathname,
        hint: { tag: el.localName, text: textOf(el) },
      });
      saveDraft();
      renderSteps();
      renderStatus();
      outline(el, 600);
    }

    const isSecretField = (el) =>
      (el instanceof HTMLInputElement && el.type === 'password') ||
      (el.getAttribute && SECRET_AUTOCOMPLETE.some((t) => (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/).includes(t)));

    // Typing and dropdowns: record a field's final value when it's committed (change, or blur if the value
    // changed), never individual keystrokes.
    const committedValue = new WeakMap(); // field → value when focused, or when last recorded

    function onFieldFocusIn(e) {
      if (recording && recordableField(e.target) && !root.contains(e.target)) committedValue.set(e.target, e.target.value);
    }

    function onFieldCommit(e) {
      const el = e.target;
      const action = recording && !root.contains(el) ? recordableField(el) : null;
      if (!action) return;
      if (e.type === 'focusout' && committedValue.get(el) === el.value) return; // left without changing it
      committedValue.set(el, el.value);
      commitField(el, action);
    }

    function commitField(el, action) {
      const option = action === 'select' ? el.selectedOptions[0] : null;
      const step = {
        action,
        value: el.value,
        selector: selectorFor(el),
        subtitle: '',
        url: location.pathname,
        hint: {
          tag: el.localName,
          label: fieldLabel(el),
          // For selects: the chosen option's visible text; for text fields: the field's name.
          text: option ? option.textContent.replace(/\s+/g, ' ').trim() : fieldLabel(el),
        },
      };
      const last = draft.steps[draft.steps.length - 1];
      const sameEl = el === lastRecorded ||
        (lastRecorded instanceof HTMLLabelElement && lastRecorded.control === el);
      if (last && sameEl && (!fieldAction(last) || last.selector === step.selector)) {
        // The click into this field (or its label), or an earlier edit of it: replace that step, keeping any subtitle.
        draft.steps[draft.steps.length - 1] = { ...step, subtitle: last.subtitle };
      } else {
        draft.steps.push(step);
      }
      lastRecorded = el;
      saveDraft();
      renderSteps();
      renderStatus();
    }

    function exportTutorial() {
      const title = draft.title.trim();
      return {
        version: StepCast.version,
        id: slug(title || 'tutorial'),
        title: title || 'Untitled tutorial',
        startUrl: draft.startUrl,
        createdAt: draft.createdAt || new Date().toISOString(),
        theme: currentTheme(), // Download, Copy and Preview all go through here
        narration: settings.narration && settings.voice
          ? { enabled: true, voice: settings.voice }
          : { enabled: settings.narration },
        steps: draft.steps.map((s) => ({ ...s, hint: { ...s.hint } })),
      };
    }

    function download() {
      if (!draft.steps.length) return;
      const t = exportTutorial();
      const blob = new Blob([JSON.stringify(t, null, 2) + '\n'], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `${t.id}.json` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setStatus(`Downloaded ${t.id}.json — move it into stepcast/tutorials/.`);
    }

    function copyJson() {
      if (!draft.steps.length) return;
      const json = JSON.stringify(exportTutorial(), null, 2);
      navigator.clipboard.writeText(json)
        .then(() => setStatus('Tutorial JSON copied to the clipboard.'))
        .catch(() => setStatus('Couldn’t access the clipboard. Use Download JSON instead.', true));
    }

    function playSaved() {
      const id = els.loadId.value.trim();
      if (id) StepCast.play(id).catch((err) => setStatus(err.message, true));
    }

    function toggleCollapsed() {
      ui.collapsed = !ui.collapsed;
      store.set(UI_KEY, ui);
      renderPanel();
    }

    // ---------------------------------------------------------------- handle
    // While the panel is collapsed the handle can be dragged (or moved with arrow keys) up and down.
    // A press that moves less than DRAG_THRESHOLD px is a click and toggles the panel.

    const HANDLE_DEFAULT_TOP = 96; // px; same as .sc-handle in stepcast.css
    const DRAG_THRESHOLD = 5;
    let drag = null;
    let suppressClick = false;

    // Positions the handle at `top` px (or its saved position), clamped inside the viewport.
    // The saved position is a fraction of the viewport height, so it survives window resizes.
    function placeHandle(top) {
      const el = els.handle;
      if (!el) return 0;
      const want = top ?? (typeof ui.handleY === 'number' ? ui.handleY * innerHeight : HANDLE_DEFAULT_TOP);
      // getBoundingClientRect (not offsetHeight, which rounds) so the bottom edge never pokes out by a fraction.
      const clamped = Math.min(Math.max(0, want), Math.max(0, innerHeight - el.getBoundingClientRect().height));
      el.style.top = `${clamped}px`;
      return clamped;
    }

    function saveHandle(top) {
      ui.handleY = top / innerHeight;
      store.set(UI_KEY, ui);
    }

    function buildHandle() {
      return h('button', {
        class: 'sc-handle',
        onclick: () => { if (!suppressClick) toggleCollapsed(); },
        onpointerdown: onHandleDown,
        onpointermove: onHandleMove,
        onpointerup: onHandleUp,
        onpointercancel: onHandleUp,
        onkeydown: onHandleKey,
      },
        h('span', { class: 'sc-grip' }, icon(GRIP)),
        h('span', { class: 'sc-handle-dot' }),
        'StepCast');
    }

    function onHandleDown(e) {
      suppressClick = false;
      if (e.button !== 0) return;
      drag = {
        id: e.pointerId, x: e.clientX, y: e.clientY, startTop: els.handle.offsetTop, moved: false,
        canMove: ui.collapsed, // open panel: plain button, no dragging
      };
      // Capture even when the panel is open. Otherwise, releasing outside the handle makes the browser fire
      // `click` on the nearest common ancestor (<body>/<html>), which the recorder and host page would both see.
      els.handle.setPointerCapture(e.pointerId);
    }

    function onHandleMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_THRESHOLD) return;
      drag.moved = true;
      if (!drag.canMove) return;
      panel.classList.add('sc-dragging');
      placeHandle(drag.startTop + e.clientY - drag.y); // vertical only
    }

    function onHandleUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) {
        if (drag.canMove) saveHandle(els.handle.offsetTop);
        // The click fired right after this pointerup ends a drag (or a press dragged off the open handle,
        // like dragging off any button); it must not toggle the panel.
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 0);
      }
      panel.classList.remove('sc-dragging');
      drag = null;
    }

    function onHandleKey(e) {
      if (!ui.collapsed || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault(); // don't scroll the page
      const step = (e.shiftKey ? 96 : 24) * (e.key === 'ArrowUp' ? -1 : 1);
      saveHandle(placeHandle(els.handle.offsetTop + step));
    }

    function setStatus(text, isError = false) {
      els.status.textContent = text;
      els.status.classList.toggle('sc-error', isError);
    }

    // The status line under the title: a summary of the draft. One-off messages (download done, errors)
    // replace it via setStatus() until the next change re-renders it.
    function summary() {
      const n = draft.steps.length;
      const steps = `${n} step${n === 1 ? '' : 's'}`;
      if (recording) return `Recording… ${steps}`;
      const subs = n === 1 ? 'its subtitle' : 'their subtitles';
      if (confirming === 'rerecord') return `Starting over deletes ${n === 1 ? 'the' : 'all'} ${steps} and ${subs}.`;
      if (confirming === 'new') return `Start a new tutorial? This clears the current ${steps} and ${subs}.`;
      if (!n) return 'Press Record, then click through your page';
      const missing = draft.steps.filter((s) => !s.subtitle.trim()).length;
      return `${steps} · ${missing ? `${missing} subtitle${missing === 1 ? '' : 's'} missing` : 'all subtitles added'}`;
    }
    const renderStatus = () => setStatus(summary(), !!confirming);

    // "Show" in an open step: flash the step's element on the page.
    function showStep(step) {
      const el = findElement(step);
      if (!el) return setStatus('Couldn’t find this step’s element on the page right now.', true);
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) el.scrollIntoView({ block: 'center' }); // instant, so outline measures the new spot
      outline(el, 900);
    }

    function toggleExport(open = els.exportMenu.hidden) {
      els.exportMenu.hidden = !open;
      els.exportBtn.setAttribute('aria-expanded', String(open));
      if (open) els.exportMenu.querySelector('button').focus();
    }

    function toggleLoad(open = els.loadRow.hidden) {
      els.loadRow.hidden = !open;
      els.loadBtn.setAttribute('aria-expanded', String(open));
      if (open) els.loadId.focus();
    }

    function buildPanel() {
      els.title = h('input', {
        class: 'sc-title-input', type: 'text', placeholder: 'Untitled tutorial', 'aria-label': 'Tutorial title',
        oninput: (e) => { draft.title = e.target.value; draft.id = slug(draft.title); saveDraft(); },
      });
      els.record = h('button', { class: 'sc-btn-rec', type: 'button', onclick: onRecordButton });
      els.preview = h('button', {
        class: 'sc-btn-quiet', type: 'button',
        onclick: () => (confirming
          ? cancelConfirm()
          : StepCast.play(exportTutorial()).catch((err) => setStatus(err.message, true))),
      });
      els.status = h('p', { class: 'sc-status', 'aria-live': 'polite' });
      els.steps = h('ol', { class: 'sc-steps' });
      els.empty = h('div', { class: 'sc-empty-state' },
        h('span', { class: 'sc-empty-icon' }, icon(RECORD, 14)),
        'Press Record and click through your app. Each click becomes a step.');

      els.exportBtn = h('button', {
        class: 'sc-btn-quiet', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: () => toggleExport(),
      }, icon(DOWNLOAD, 15), 'Export', h('span', { class: 'sc-chevron' }, icon(CHEVRON_DOWN, 12)));
      els.exportMenu = h('div', { class: 'sc-menu', role: 'menu', hidden: true },
        h('button', { class: 'sc-menu-item', type: 'button', role: 'menuitem', onclick: () => { toggleExport(false); download(); } },
          icon(DOWNLOAD, 15), 'Download JSON'),
        h('button', { class: 'sc-menu-item', type: 'button', role: 'menuitem', onclick: () => { toggleExport(false); copyJson(); } },
          icon(COPY, 15), 'Copy JSON'));
      els.exportWrap = h('div', { class: 'sc-menu-wrap' }, els.exportBtn, els.exportMenu);

      els.loadBtn = h('button', {
        class: 'sc-icon', type: 'button', title: 'Play a saved tutorial', 'aria-label': 'Play a saved tutorial',
        'aria-expanded': 'false', onclick: () => toggleLoad(),
      }, icon(FOLDER));
      els.loadId = h('input', {
        class: 'sc-input', type: 'text', placeholder: 'Saved tutorial id', 'aria-label': 'Saved tutorial id',
        onkeydown: (e) => {
          if (e.key === 'Enter') playSaved();
          if (e.key === 'Escape') { toggleLoad(false); els.loadBtn.focus(); }
        },
      });
      els.loadRow = h('div', { class: 'sc-load', hidden: true },
        els.loadId, h('button', { class: 'sc-btn sc-btn-grow-0', type: 'button', text: 'Play', onclick: playSaved }));

      els.gear = h('button', { class: 'sc-icon', type: 'button', title: 'Settings', 'aria-label': 'Settings', onclick: () => showSettings(true) }, icon(GEAR));
      els.mode = h('select', {
        class: 'sc-input sc-select',
        onchange: (e) => { settings.mode = e.target.value; saveSettings(); },
      },
        h('option', { value: 'auto', text: 'Auto' }),
        h('option', { value: 'light', text: 'Light' }),
        h('option', { value: 'dark', text: 'Dark' }));
      els.narration = h('select', {
        class: 'sc-input sc-select', id: 'stepcast-narration',
        onchange: (e) => { settings.narration = e.target.value === 'on'; saveSettings(); },
      },
        h('option', { value: 'off', text: 'Off' }),
        h('option', { value: 'on', text: 'On' }));
      els.voice = h('select', {
        class: 'sc-input sc-select', id: 'stepcast-voice',
        onchange: (e) => { settings.voice = e.target.value; saveSettings(); },
      });
      els.voiceField = h('div', { class: 'sc-field', hidden: true },
        h('label', { class: 'sc-label', for: 'stepcast-voice', text: 'Voice' }),
        h('div', { class: 'sc-row' },
          els.voice,
          h('button', {
            class: 'sc-btn sc-btn-grow-0 sc-btn-icon', type: 'button', title: 'Hear this voice',
            onclick: () => previewVoice(settings.voice, 'Hi! This is how your tutorial will sound.'),
          }, icon(PLAY, 12), 'Play')),
        h('p', { class: 'sc-note', text: 'Voices differ per device. Visitors who don’t have this voice hear the best one their device offers.' }));
      els.brand = colorField('brand', 'Brand color', 'stepcast-brand-hex');
      els.buttonText = Object.assign(colorField('buttonText', 'Button text color', 'stepcast-button-text-hex'), {
        autoTag: h('span', { class: 'sc-tag', text: 'Auto' }),
        autoBtn: h('button', {
          class: 'sc-btn sc-btn-grow-0', text: 'Auto', title: 'Pick white or near-black automatically',
          onclick: () => { settings.buttonText = ''; saveSettings(); },
        }),
        warn: h('p', { class: 'sc-note sc-warn', hidden: true }),
      });

      els.settingsView = h('div', { class: 'sc-body sc-settings', hidden: true },
        h('header', { class: 'sc-head' },
          h('div', { class: 'sc-head-group' },
            h('button', { class: 'sc-icon', title: 'Back', 'aria-label': 'Back', onclick: () => showSettings(false) }, icon(ARROW_LEFT)),
            h('strong', { class: 'sc-brand', text: 'Settings' }))),
        h('label', { class: 'sc-field' }, h('span', { class: 'sc-label', text: 'Mode' }), els.mode),
        h('div', { class: 'sc-field' },
          h('label', { class: 'sc-label', for: 'stepcast-narration', text: 'Read steps aloud' }),
          els.narration,
          h('p', { class: 'sc-note', text: 'When on, steps are read aloud with the visitor’s browser voice, and visitors can mute it with a speaker button. When off, there’s no narration and no speaker button.' })),
        els.voiceField,
        h('div', { class: 'sc-field' },
          h('label', { class: 'sc-label', for: 'stepcast-brand-hex', text: 'Brand color' }),
          h('div', { class: 'sc-row' }, els.brand.picker, els.brand.hex),
          h('p', { class: 'sc-note', text: 'Leave empty to use the default brand color.' })),
        h('div', { class: 'sc-field' },
          h('div', { class: 'sc-label-row' },
            h('label', { class: 'sc-label', for: 'stepcast-button-text-hex', text: 'Button text color' }),
            els.buttonText.autoTag),
          h('div', { class: 'sc-row' }, els.buttonText.picker, els.buttonText.hex, els.buttonText.autoBtn),
          els.buttonText.warn),
        h('footer', { class: 'sc-foot' },
          h('button', { class: 'sc-btn sc-btn-small', text: 'Reset to defaults', onclick: resetSettings }),
          h('p', { class: 'sc-note', text: 'Saved in this browser, and included in tutorials you download or copy.' })));

      els.main = h('div', { class: 'sc-body' },
        h('header', { class: 'sc-head' },
          h('div', { class: 'sc-head-group sc-logo-group' },
            h('span', { class: 'sc-logo', 'aria-hidden': 'true' }, icon(PLAY, 12)),
            h('strong', { class: 'sc-brand', text: 'StepCast' })),
          h('div', { class: 'sc-head-group' },
            els.newBtn = h('button', {
              class: 'sc-icon', type: 'button', title: 'New tutorial', 'aria-label': 'New tutorial', onclick: onNewButton,
            }, icon(PLUS)),
            els.gear,
            h('button', { class: 'sc-icon', type: 'button', title: 'Hide panel', 'aria-label': 'Hide panel', onclick: toggleCollapsed },
              icon(CHEVRON_RIGHT)))),
        h('div', { class: 'sc-titleblock' }, els.title, els.status),
        h('div', { class: 'sc-row' }, els.record, els.preview),
        h('div', { class: 'sc-steps-wrap' }, els.steps, els.empty),
        h('footer', { class: 'sc-foot' },
          h('div', { class: 'sc-foot-row' }, els.exportWrap, els.loadBtn),
          els.loadRow));

      // Export menu: close on any click outside it, or Esc. Capture phase, because StepCast stops its own
      // clicks and keys from bubbling to the document.
      document.addEventListener('click', (e) => {
        if (!els.exportMenu.hidden && !els.exportWrap.contains(e.target)) toggleExport(false);
      }, true);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !els.exportMenu.hidden) { toggleExport(false); els.exportBtn.focus(); }
      }, true);

      panel = h('aside', { class: 'sc-panel', 'aria-label': 'StepCast recorder' },
        els.handle = buildHandle(),
        els.main,
        els.settingsView);
      // Pointer events from the handle drag stay inside StepCast (the player's root only stops down/click).
      for (const type of ['pointermove', 'pointerup', 'pointercancel', 'mouseup', 'touchmove', 'touchend']) {
        panel.addEventListener(type, (e) => e.stopPropagation());
      }
      root.append(panel);
      syncSettingsFields();
      placeHandle();
    }

    function renderPanel() {
      if (!panel) return;
      const n = draft.steps.length;
      panel.classList.toggle('sc-collapsed', ui.collapsed);
      els.handle.title = ui.collapsed ? 'Open StepCast (drag to move)' : 'Close StepCast';
      els.handle.setAttribute('aria-expanded', String(!ui.collapsed));
      panel.classList.toggle('sc-is-recording', recording);
      panel.classList.toggle('sc-confirming', !!confirming);
      const [recIcon, recLabel] = recording ? [STOP, 'Stop']
        : confirming === 'rerecord' ? [RESTART, 'Yes, start over']
        : confirming === 'new' ? [PLUS, 'Yes, start new']
        : [RECORD, n ? 'Re-record' : 'Record'];
      els.record.replaceChildren(icon(recIcon, 14), recLabel);
      els.preview.replaceChildren(...(confirming === 'rerecord' ? ['Keep steps']
        : confirming === 'new' ? ['Keep editing']
        : [icon(PLAY, 12), 'Preview']));
      els.preview.disabled = recording || !n;
      els.newBtn.hidden = recording;
      els.exportBtn.disabled = !n;
      renderStatus();
      if (document.activeElement !== els.title) els.title.value = draft.title;
      renderSteps();
    }

    function renderSteps() {
      if (!panel) return;
      els.empty.hidden = draft.steps.length > 0;
      // A vertical timeline: number dot, step name, and the subtitle (or "Add a subtitle") while closed.
      els.steps.replaceChildren(...draft.steps.map((step, i) => {
        const open = i === openStep;
        const title = h('span', { class: 'sc-step-title', text: describe(step) });
        const head = h('button', {
          class: 'sc-step-head', type: 'button', 'aria-expanded': String(open),
          onclick: () => { openStep = open ? -1 : i; renderSteps(); },
          onmouseenter: () => { const el = !isPlaying() && findElement(step); if (el) outline(el); },
          onmouseleave: unpeek,
        },
          h('span', { class: 'sc-num', text: String(i + 1) }),
          h('span', { class: 'sc-step-main' },
            title,
            !open && h('span', {
              class: step.subtitle ? 'sc-step-sub' : 'sc-step-sub sc-empty', text: step.subtitle || 'Add a subtitle',
            })),
          open && h('span', { class: 'sc-chevron' }, icon(CHEVRON_UP, 14)));
        if (!open) return h('li', { class: 'sc-step' }, head);

        const textarea = h('textarea', {
          class: 'sc-textarea', rows: 3, placeholder: 'What should the viewer do here?', 'aria-label': `Subtitle for step ${i + 1}`,
          oninput: (e) => { step.subtitle = e.target.value; saveDraft(); renderStatus(); },
        });
        textarea.value = step.subtitle;

        // Type/select steps: fix the recorded value without re-recording. (For a select, the option's value.)
        let valueField = null;
        if (fieldAction(step)) {
          const input = h('input', {
            class: 'sc-input', type: 'text', 'aria-label': `Value for step ${i + 1}`,
            oninput: (e) => {
              step.value = e.target.value;
              if (step.action === 'select') step.hint.text = optionText(step);
              saveDraft();
              title.textContent = describe(step);
            },
          });
          input.value = step.value;
          valueField = h('label', { class: 'sc-field' }, h('span', { class: 'sc-label', text: 'Value' }), input);
        }

        return h('li', { class: 'sc-step sc-open' }, head,
          h('div', { class: 'sc-step-body' },
            valueField,
            textarea,
            h('div', { class: 'sc-meta' },
              h('span', { class: 'sc-meta-icon', title: 'Target element' }, icon(TARGET, 14)),
              h('code', { class: 'sc-selector', title: step.selector, text: step.selector }),
              h('button', { class: 'sc-link', type: 'button', title: 'Flash this element on the page', onclick: () => showStep(step) },
                icon(EYE, 14), 'Show'))));
      }));
      const opened = els.steps.querySelector('.sc-open textarea');
      if (opened) opened.focus();
      else if (recording && els.steps.lastElementChild) els.steps.lastElementChild.scrollIntoView({ block: 'nearest' });
    }

    // The Voice dropdown: "Automatic" first, then this device's voices for the page's language, best first. A saved
    // voice this device doesn't have (e.g. chosen on another computer) stays selectable, marked as such.
    function fillVoiceOptions() {
      const voices = rankedVoices();
      const options = [h('option', { value: '', text: 'Automatic (best available)' })];
      for (const v of voices) options.push(h('option', { value: v.name, text: `${v.name} · ${v.lang}` }));
      if (settings.voice && !voices.some((v) => v.name === settings.voice)) {
        options.push(h('option', { value: settings.voice, text: `${settings.voice} (not on this device)` }));
      }
      els.voice.replaceChildren(...options);
      els.voice.value = settings.voice;
    }
    // Browsers load their voice list asynchronously.
    if (window.speechSynthesis && speechSynthesis.addEventListener) {
      speechSynthesis.addEventListener('voiceschanged', () => { if (els.voice) fillVoiceOptions(); });
    }

    // After editing a select step's value: the matching option's visible text if the dropdown is on the page.
    function optionText(step) {
      const select = findElement(step);
      const option = select instanceof HTMLSelectElement && [...select.options].find((o) => o.value === step.value);
      return option ? option.textContent.replace(/\s+/g, ' ').trim() : step.value;
    }

    function showRecorder() {
      if (!root.isConnected) document.body.append(root);
      if (!panel) {
        buildPanel();
        document.addEventListener('click', onRecordClick, true);
        document.addEventListener('focusin', onFieldFocusIn, true);
        document.addEventListener('change', onFieldCommit, true);
        document.addEventListener('focusout', onFieldCommit, true);
      }
      renderPanel();
    }

    // The player announces playback; hide the panel (and stop recording) while it runs.
    window.addEventListener('stepcast:playstart', () => {
      if (recording) stopRecording();
      if (panel) panel.classList.add('sc-playing');
    });
    window.addEventListener('stepcast:playend', () => {
      if (panel) panel.classList.remove('sc-playing');
      placeHandle(); // it was hidden during playback, so it may have missed a resize
      if (els.brand) syncSettingsFields(); // the player has restored the author's look
    });
    window.addEventListener('resize', () => placeHandle());

    // In Auto mode the default brand and button text colors change with the device theme; keep the fields showing them.
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (els.brand) syncSettingsFields(); });

    Object.assign(StepCast, {
      showRecorder,
      record() { showRecorder(); startRecording(); },
      stopRecording,
    });

    applySettings();
    showRecorder();
  }
})();
