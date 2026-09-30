/*!
 * StepCast v1 — tutorial player. This is the only StepCast file a live site should load.
 *
 *   <script src="stepcast/stepcast-player.js"></script>
 *
 * StepCast.play('tutorial-id') plays stepcast/tutorials/<id>.json.
 * `?stepcast-play=<id>` auto-plays a tutorial on page load, only if this tag has `data-url-play`.
 * The recorder (stepcast-recorder.js) builds on top of this file via StepCast._internal.
 */
(() => {
  'use strict';
  if (window.StepCast) return;

  const FORMAT_VERSION = 1;
  const FIND_TIMEOUT_MS = 4000;

  const script = document.currentScript;
  const BASE = new URL('.', script ? script.src : location.href);
  const params = new URLSearchParams(location.search);

  // ---------------------------------------------------------------- helpers

  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) {
      if (child != null && child !== false) node.append(child);
    }
    return node;
  }

  const isVisible = (n) =>
    n.isConnected && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';

  const textOf = (n) =>
    (n.getAttribute('aria-label') || n.innerText || n.value || n.placeholder || n.title || n.alt || '')
      .replace(/\s+/g, ' ').trim().slice(0, 80);

  const clip = (s, max = 32) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

  // Steps are "click" (the default, so older tutorials still work), or "type" / "select" with a string
  // `value`. A type/select step without a value falls back to a click.
  const fieldAction = (step) =>
    (step.action === 'type' || step.action === 'select') && typeof step.value === 'string' ? step.action : null;

  // What a select step shows: the chosen option's visible text (hint.text), else its value.
  const shownValue = (step) => (step.action === 'select' && step.hint && step.hint.text) || step.value;

  // Step name, e.g. 'Click “Save”', 'Type “120” into “Length”', 'Choose “Oak” in “Wood type”'.
  function describe(step) {
    const hint = step.hint || {};
    const action = fieldAction(step);
    if (action) {
      const verb = action === 'type' ? 'Type' : 'Choose';
      const where = hint.label ? ` ${action === 'type' ? 'into' : 'in'} “${clip(hint.label, 24)}”` : '';
      return `${verb} “${clip(shownValue(step))}”${where}`;
    }
    return hint.text ? `Click “${hint.text}”` : `Click the <${hint.tag || 'element'}>`;
  }

  // Tutorial box text when a step has no subtitle.
  function defaultTip(step) {
    const action = fieldAction(step);
    if (action === 'type') return `Type “${clip(step.value)}” here`;
    if (action === 'select') return `Choose “${clip(shownValue(step))}”`;
    return describe(step);
  }

  function loadCss() {
    if (document.querySelector('link[href*="stepcast.css"]')) return;
    document.head.append(h('link', { rel: 'stylesheet', href: new URL('stepcast.css', BASE).href }));
  }

  function findElement(step) {
    let matches = [];
    try { matches = [...document.querySelectorAll(step.selector)]; } catch { /* invalid selector */ }
    const hit = matches.find((n) => !root.contains(n) && isVisible(n));
    if (hit) return hit;
    // Fallback: the one element with the same tag and visible text as when it was recorded.
    // Ambiguous matches (e.g. several "Open" buttons) return null rather than guess.
    const hint = step.hint;
    if (!hint || !hint.text) return null;
    const cands = [...document.getElementsByTagName(hint.tag || '*')]
      .filter((n) => !root.contains(n) && isVisible(n) && textOf(n) === hint.text);
    return cands.length === 1 ? cands[0] : null;
  }

  // ------------------------------------------------------------------- root

  const root = h('div', { id: 'stepcast-root' });
  // Keep our UI from triggering the host page's outside-click and keyboard handlers.
  for (const type of ['pointerdown', 'mousedown', 'touchstart', 'click', 'keydown', 'keyup', 'keypress']) {
    root.addEventListener(type, (e) => e.stopPropagation());
  }
  const peekBox = h('div', { class: 'sc-peek', hidden: true });
  const ring = h('div', { class: 'sc-ring', hidden: true });
  const tip = h('div', { class: 'sc-tip', role: 'dialog', 'aria-live': 'polite' });
  const layer = h('div', { class: 'sc-layer', hidden: true }, ring, tip);
  root.append(peekBox, layer);

  const ensureMounted = () => { if (!root.isConnected) document.body.append(root); };

  let peekTimer = 0;
  function outline(el, ms) {
    const r = el.getBoundingClientRect();
    Object.assign(peekBox.style, {
      left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px`,
    });
    peekBox.hidden = false;
    peekBox.classList.toggle('sc-flash', !!ms);
    clearTimeout(peekTimer);
    if (ms) peekTimer = setTimeout(unpeek, ms);
  }
  function unpeek() { peekBox.hidden = true; }

  // ------------------------------------------------------------------- look
  // A "look" is { mode: 'auto'|'light'|'dark', brand: '#rrggbb'|null, text: '#rrggbb'|null }, applied to
  // #stepcast-root. null brand = stylesheet default; null text = automatic (readable on the brand color).
  // A tutorial's `theme` is applied while it plays; afterwards the base look comes back. The base look is the
  // default unless the recorder sets it to the author's settings.

  const MODES = ['auto', 'light', 'dark'];
  const DEFAULT_LOOK = { mode: 'auto', brand: null, text: null };
  let baseLook = DEFAULT_LOOK;

  // WCAG relative luminance of a '#rrggbb' color.
  function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // WCAG contrast ratio between two '#rrggbb' colors (1 to 21).
  function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  // Automatic button text on the brand color: white or near-black, whichever contrasts more.
  const NEAR_BLACK = '#0b1020';
  const readableOn = (hex) => (contrast(hex, '#ffffff') >= contrast(hex, NEAR_BLACK) ? '#ffffff' : NEAR_BLACK);

  const setVar = (name, value) => (value ? root.style.setProperty(name, value) : root.style.removeProperty(name));

  function applyLook({ mode, brand, text }) {
    if (mode === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    setVar('--sc-accent', brand);
    setVar('--sc-accent-fg', text || (brand && readableOn(brand)));
  }

  // The look shown when no tutorial is playing (the recorder sets it to the author's settings).
  function setBaseLook(look) {
    baseLook = look;
    if (!player.tutorial) applyLook(look);
  }

  // A tutorial file's optional `theme`, validated: anything unexpected falls back to the default.
  function lookFromTheme(theme) {
    const t = theme && typeof theme === 'object' ? theme : {};
    const hex = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);
    return { mode: MODES.includes(t.mode) ? t.mode : 'auto', brand: hex(t.brandColor), text: hex(t.buttonTextColor) };
  }

  // -------------------------------------------------------------- narration
  // Reads each step aloud with the browser's own speech (Web Speech API): no files, no service. The author decides
  // per tutorial (`narration.enabled`): off means no narration and no speaker button; on means steps are read
  // aloud and visitors get a speaker button to mute them. A visitor who mutes stays muted (remembered per site).

  const synth = window.speechSynthesis || null;
  const NARRATION_KEY = 'stepcast:narration';
  let narrationAvailable = false; // this tutorial is narrated (and the browser can speak)
  let narrationOn = false;
  let spokenText = ''; // what the tutorial box says now, so switching narration on can read it straight away
  let voice = null;

  const narrationFrom = (tutorial) =>
    !!(tutorial.narration && typeof tutorial.narration === 'object' && tutorial.narration.enabled === true);

  function visitorChoice() {
    try { return localStorage.getItem(NARRATION_KEY); } catch { return null; }
  }
  function saveVisitorChoice(on) {
    try { localStorage.setItem(NARRATION_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
  }

  // The most natural-sounding voice the device offers for the page's language (<html lang>). Quality varies a
  // lot: Edge's "… Online (Natural)" and Chrome's "Google …" voices are cloud neural voices, Apple devices offer
  // downloadable "Premium"/"Enhanced" voices, and macOS also ships novelty voices (Zarvox, Bubbles…) to avoid.
  const NOVELTY_VOICES = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|fred|good news|jester|junior|kathy|organ|ralph|superstar|trinoids|whisper|wobble|zarvox|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;
  const failedVoices = new Set(); // voices that errored (e.g. a cloud voice while offline)

  function voiceScore(v, lang) {
    const vLang = v.lang.toLowerCase().replace('_', '-');
    let score = vLang === lang ? 100 : vLang.split('-')[0] === lang.split('-')[0] ? 60 : -1000;
    if (/natural|neural/i.test(v.name)) score += 40;
    if (/premium/i.test(v.name)) score += 35;
    if (/enhanced/i.test(v.name)) score += 30;
    if (/^google\b/i.test(v.name) || /\bonline\b/i.test(v.name)) score += 25;
    if (NOVELTY_VOICES.test(v.name)) score -= 200;
    if (v.default) score += 3; // tie-break: the device's own choice
    return score;
  }

  // The author's chosen voice (`narration.voice`, a voice name). Voices differ per device, so it's a preference:
  // used when this device has it, otherwise the best available voice is picked as usual.
  let preferredVoice = '';

  const pageLang = () => (document.documentElement.lang || navigator.language || 'en').toLowerCase();

  // This device's usable voices for the page's language, best first (novelty voices left out). For the
  // recorder's voice dropdown.
  function rankedVoices() {
    if (!synth) return [];
    const lang = pageLang();
    return synth.getVoices()
      .map((v) => ({ v, s: voiceScore(v, lang) }))
      .filter(({ v, s }) => s > 0 && !NOVELTY_VOICES.test(v.name))
      .sort((a, b) => b.s - a.s || a.v.name.localeCompare(b.v.name))
      .map(({ v }) => ({ name: v.name, lang: v.lang }));
  }

  function pickVoice() {
    const lang = pageLang();
    const candidates = synth.getVoices().filter((v) => !failedVoices.has(v.name));
    const preferred = preferredVoice && candidates.find((v) => v.name === preferredVoice);
    if (preferred) { voice = preferred; return; }
    let best = null;
    let bestScore = -Infinity;
    for (const v of candidates) {
      const s = voiceScore(v, lang);
      if (s > bestScore) { best = v; bestScore = s; }
    }
    voice = bestScore > 0 ? best : null; // nothing for this language: let the browser choose
  }
  if (synth) {
    pickVoice();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', pickVoice);
  }

  const hush = () => { if (synth) synth.cancel(); };

  function speak(text) {
    spokenText = text;
    if (!synth || !narrationOn) return;
    synth.cancel();
    // Emoji would be read out by name ("seedling"); the subtitle on screen keeps them.
    const clean = text.replace(/[\p{Extended_Pictographic}‍️]/gu, '').replace(/\s+/g, ' ').trim();
    // One utterance per sentence: Chrome stops long utterances partway.
    for (const sentence of clean.split(/(?<=[.!?])\s+/)) {
      if (!sentence) continue;
      const u = new SpeechSynthesisUtterance(sentence);
      if (document.documentElement.lang) u.lang = document.documentElement.lang;
      if (voice) u.voice = voice;
      // Stay quiet on errors. "not-allowed" (no click yet) and "interrupted"/"canceled" (we moved on) are normal;
      // anything else means this voice failed (e.g. a cloud voice offline), so use the next best one from now on.
      u.onerror = (e) => {
        if (['not-allowed', 'interrupted', 'canceled'].includes(e.error) || !u.voice) return;
        failedVoices.add(u.voice.name);
        pickVoice();
      };
      synth.speak(u);
    }
  }

  // The recorder's ▶ button: say `text` in voice `name` ('' = automatic), whatever the narration setting.
  function previewVoice(name, text) {
    if (!synth) return;
    const [savedPreferred, savedOn, savedText] = [preferredVoice, narrationOn, spokenText];
    preferredVoice = name;
    pickVoice();
    narrationOn = true;
    speak(text); // each utterance keeps the voice it was created with
    [preferredVoice, narrationOn, spokenText] = [savedPreferred, savedOn, savedText];
    pickVoice();
  }

  // Static, trusted markup: parsed via <template> so the SVG gets the right namespace.
  function svgIcon(markup) {
    const t = document.createElement('template');
    t.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${markup}</svg>`;
    return t.content.firstChild;
  }
  const SPEAKER_ON = '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
  const SPEAKER_OFF = '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m23 9-6 6"/><path d="m17 9 6 6"/>';

  // The speaker button in the tutorial box: an on/off toggle (aria-pressed). Updated in place so focus stays put.
  function voiceButton() {
    const button = h('button', { class: 'sc-icon sc-voice', type: 'button', 'aria-label': 'Read steps aloud' });
    const sync = () => {
      button.setAttribute('aria-pressed', String(narrationOn));
      button.title = narrationOn ? 'Stop reading aloud' : 'Read steps aloud';
      button.replaceChildren(svgIcon(narrationOn ? SPEAKER_ON : SPEAKER_OFF));
    };
    button.addEventListener('click', () => {
      narrationOn = !narrationOn;
      saveVisitorChoice(narrationOn);
      sync();
      if (narrationOn) speak(spokenText); else hush();
    });
    sync();
    return button;
  }

  // ----------------------------------------------------------------- player

  // fieldStart: the highlighted field's value when its type/select step began, to tell whether the viewer
  // changed it. tipPointerAt: when the pointer last went down inside StepCast's own UI.
  const player = { tutorial: null, index: 0, el: null, token: 0, raf: 0, fieldStart: null, tipPointerAt: -Infinity };
  root.addEventListener('pointerdown', () => { player.tipPointerAt = performance.now(); }, true);

  async function loadTutorial(ref) {
    // A bare id resolves to stepcast/tutorials/<id>.json; anything path-like is used as a URL.
    const url = /[/.]/.test(ref) ? new URL(ref, location.href) : new URL(`tutorials/${encodeURIComponent(ref)}.json`, BASE);
    // Never fetch tutorials from another site: they drive clicks on this page.
    if (url.origin !== location.origin) throw new Error('StepCast: tutorials must be on the same site.');
    let res;
    try {
      res = await fetch(url, { cache: 'no-cache' });
    } catch {
      throw new Error(`StepCast: couldn't fetch ${url}. Serve the page over http(s), not file://.`);
    }
    if (!res.ok) throw new Error(`StepCast: couldn't load ${url} (HTTP ${res.status}).`);
    return res.json();
  }

  async function play(source) {
    const tutorial = typeof source === 'string' ? await loadTutorial(source) : source;
    if (!tutorial || !Array.isArray(tutorial.steps) || !tutorial.steps.length) {
      throw new Error('StepCast: this tutorial has no steps.');
    }
    stopPlayback();
    ensureMounted();
    unpeek();
    player.tutorial = tutorial;
    applyLook(lookFromTheme(tutorial.theme)); // no theme → default look
    narrationAvailable = !!synth && narrationFrom(tutorial);
    const chosen = tutorial.narration && tutorial.narration.voice;
    preferredVoice = typeof chosen === 'string' ? chosen.slice(0, 200) : '';
    if (synth) pickVoice();
    narrationOn = narrationAvailable && visitorChoice() !== 'off';
    spokenText = '';
    layer.hidden = false;
    window.dispatchEvent(new CustomEvent('stepcast:playstart', { detail: { tutorial } }));
    document.addEventListener('click', onPlayClick, true);
    document.addEventListener('keydown', onPlayKey, true);
    document.addEventListener('change', onPlayChange, true);
    document.addEventListener('focusout', onPlayFocusOut, true);
    tick();
    goTo(0);
  }

  function stopPlayback() {
    const wasPlaying = !!player.tutorial;
    if (wasPlaying) hush();
    player.token++;
    player.tutorial = null;
    player.el = null;
    cancelAnimationFrame(player.raf);
    document.removeEventListener('click', onPlayClick, true);
    document.removeEventListener('keydown', onPlayKey, true);
    document.removeEventListener('change', onPlayChange, true);
    document.removeEventListener('focusout', onPlayFocusOut, true);
    layer.hidden = true;
    ring.hidden = true;
    if (wasPlaying) {
      applyLook(baseLook);
      window.dispatchEvent(new CustomEvent('stepcast:playend'));
    }
  }

  async function goTo(i) {
    const t = player.tutorial;
    if (!t) return;
    const token = ++player.token;
    player.index = i;
    player.el = null;
    if (i >= t.steps.length) return renderTip('done');
    renderTip('searching');
    const el = await waitFor(t.steps[i], token);
    if (token !== player.token) return;
    player.el = el;
    player.fieldStart = el && isField(el) ? el.value : null;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    renderTip(el ? 'found' : 'missing');
  }

  // Elements may appear late (menus opening, async renders), so poll briefly.
  function waitFor(step, token) {
    return new Promise((resolve) => {
      const start = performance.now();
      const check = () => {
        if (token !== player.token) return resolve(null);
        const el = findElement(step);
        if (el || performance.now() - start > FIND_TIMEOUT_MS) resolve(el);
        else setTimeout(check, 100);
      };
      check();
    });
  }

  const advanceFrom = (i) => setTimeout(() => {
    if (player.tutorial && player.index === i) goTo(i + 1);
  }, 0);

  const isField = (el) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
  const currentStep = () => player.tutorial && player.tutorial.steps[player.index];
  // A type/select step whose element really is a field; anything else plays as a click.
  const onFieldStep = () => !!(player.el && isField(player.el) && currentStep() && fieldAction(currentStep()));

  // The user clicked the highlighted element themselves: let the page react, then move on.
  // On a type/select step, clicking into the field is just the start; the commit advances instead.
  function onPlayClick(e) {
    if (onFieldStep()) return;
    if (player.el && e.target instanceof Node && player.el.contains(e.target)) advanceFrom(player.index);
  }

  // The viewer typed or chose something themselves and committed it: advance, whatever they entered.
  // A change while the field still has focus is a select choice or Enter in a text field. A change caused by
  // leaving the field is handled on focusout, which knows where focus went.
  function onPlayChange(e) {
    if (onFieldStep() && e.target === player.el && document.activeElement === player.el) advanceFrom(player.index);
  }

  function onPlayFocusOut(e) {
    if (!onFieldStep() || e.target !== player.el || player.el.value === player.fieldStart) return;
    // Leaving the field by clicking or tabbing into the tutorial box (e.g. Next): let that control act,
    // or its click could land on the following step's Next and skip it.
    if ((e.relatedTarget && root.contains(e.relatedTarget)) || performance.now() - player.tipPointerAt < 500) return;
    advanceFrom(player.index);
  }

  // Set a field's value the way typing would, so the host app (React included) notices: the native value
  // setter bypasses framework wrappers, then bubbling input and change events.
  function fillField(el, value) {
    el.focus();
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // "Next" performs the recorded step, so menus open and fields fill as they did when recording.
  function next() {
    const el = player.el;
    const i = player.index;
    if (el && el.isConnected) {
      if (onFieldStep()) {
        // If the viewer already typed their own value, keep it and just move on.
        if (el.value === player.fieldStart) fillField(el, currentStep().value);
      } else {
        if (el.matches('input, textarea, select')) el.focus();
        el.click();
      }
    }
    advanceFrom(i);
  }

  function onPlayKey(e) {
    if (e.key === 'Escape') stopPlayback();
  }

  function renderTip(state) {
    const t = player.tutorial;
    const close = h('button', { class: 'sc-icon', 'aria-label': 'Close tutorial', text: '✕', onclick: stopPlayback });
    // Speaker toggle (only where the browser can speak) and the close button.
    const tools = h('span', { class: 'sc-tip-tools' }, narrationAvailable ? voiceButton() : null, close);
    if (state === 'done') {
      const doneText = 'That’s it — tutorial complete.';
      tip.replaceChildren(
        h('div', { class: 'sc-tip-head' }, h('span', { class: 'sc-tip-count', text: t.title || 'Tutorial' }), tools),
        h('p', { class: 'sc-tip-text', text: doneText }),
        h('div', { class: 'sc-tip-actions' }, h('button', { class: 'sc-btn sc-btn-primary', text: 'Done', onclick: stopPlayback })));
      speak(doneText);
      return;
    }
    const i = player.index;
    const step = t.steps[i];
    const total = t.steps.length;
    const status = {
      searching: 'Waiting for this element to appear…',
      missing: 'Couldn’t find this element on the page.',
    }[state];
    const text = step.subtitle || defaultTip(step);
    tip.replaceChildren(
      h('div', { class: 'sc-tip-head' }, h('span', { class: 'sc-tip-count', text: `Step ${i + 1} of ${total}` }), tools),
      h('p', { class: 'sc-tip-text', text }),
      status ? h('p', { class: 'sc-tip-status', text: status }) : '',
      h('div', { class: 'sc-tip-actions' },
        h('div', { class: 'sc-progress' }, h('span', { style: `width:${((i + 1) / total) * 100}%` })),
        h('button', {
          class: 'sc-btn sc-btn-primary',
          text: state === 'missing' ? 'Skip' : 'Next',
          disabled: state === 'searching',
          onclick: state === 'missing' ? () => goTo(i + 1) : next,
        })));
    // Read the step once its element is found (or known missing); stay quiet while still looking for it.
    if (state === 'searching') { hush(); spokenText = text; }
    else speak(state === 'missing' ? `${text} ${status}` : text);
  }

  // Follow the element every frame so the ring tracks scrolling, resizing and animations.
  function tick() {
    player.raf = requestAnimationFrame(tick);
    const t = player.tutorial;
    if (!t) return;
    if (player.el && !player.el.isConnected && t.steps[player.index]) {
      player.el = findElement(t.steps[player.index]); // re-rendered by the page
    }
    const r = player.el && player.el.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const m = 12;
    if (!r || (!r.width && !r.height)) {
      ring.hidden = true;
      tip.style.transform = `translate(${(innerWidth - tw) / 2}px, ${innerHeight - th - 24}px)`;
      return;
    }
    const pad = 6;
    ring.hidden = false;
    Object.assign(ring.style, {
      left: `${r.left - pad}px`, top: `${r.top - pad}px`,
      width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
    });
    let top = r.bottom + pad + m;
    if (top + th > innerHeight - m) top = r.top - pad - m - th; // no room below: flip above
    top = Math.max(m, Math.min(top, innerHeight - th - m));
    const left = Math.max(m, Math.min(r.left + r.width / 2 - tw / 2, innerWidth - tw - m));
    tip.style.transform = `translate(${left}px, ${top}px)`;
  }

  // ------------------------------------------------------------------- boot

  loadCss();

  function init() {
    // URL auto-play is opt-in (data-url-play on this script tag): otherwise anyone could send a link that
    // starts one of your tutorials, which clicks things on the page. When the recorder loads the player
    // itself, its script tag has no such attribute, so this stays off.
    if (!(script && script.hasAttribute('data-url-play'))) return;
    const auto = params.get('stepcast-play');
    if (!auto) return;
    // Links are shareable, so the URL may only name a tutorial in this site's tutorials/ folder.
    if (!/^[\w-]+$/.test(auto)) {
      console.warn('StepCast: ignored ?stepcast-play value, only plain tutorial ids are allowed.');
      return;
    }
    play(auto).catch((err) => console.error(err));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.StepCast = {
    version: FORMAT_VERSION,
    play,
    stop: stopPlayback,
    // Shared with stepcast-recorder.js. Not a public API: may change between versions.
    _internal: {
      h, root, findElement, textOf, describe, fieldAction, outline, unpeek, contrast, setBaseLook,
      rankedVoices, previewVoice,
      isPlaying: () => !!player.tutorial,
    },
  };
})();
