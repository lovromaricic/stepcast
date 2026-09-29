/*
 * Leafy: a tiny, friendly plant care app used to demo StepCast. Shared by index.html and player-demo.html.
 * State lives in memory only; a reload brings back the four starter plants.
 *
 * Built to be easy to record with StepCast (which records clicks, not typing):
 * - every control has a data-action (index.html lists data-action in data-stable-attrs);
 * - controls repeated on every card share a data-action, and each card has a readable id from the plant's
 *   name (id="plant-monstera") for StepCast to anchor on. Those buttons deliberately have no per-plant
 *   aria-label (StepCast would prefer it); screen readers get the plant name from visually hidden text;
 * - "Add a plant" can be completed with clicks alone.
 */
(() => {
  'use strict';

  // ------------------------------------------------------------------ data

  const EMOJIS = [
    { key: 'herb', emoji: '🌿', label: 'Herb', defaultName: 'New herb' },
    { key: 'cactus', emoji: '🌵', label: 'Cactus', defaultName: 'New cactus' },
    { key: 'blossom', emoji: '🌸', label: 'Blossom', defaultName: 'New blossom' },
    { key: 'potted', emoji: '🪴', label: 'Potted plant', defaultName: 'New potted plant' },
    { key: 'sunflower', emoji: '🌻', label: 'Sunflower', defaultName: 'New sunflower' },
    { key: 'seedling', emoji: '🌱', label: 'Seedling', defaultName: 'New seedling' },
  ];
  const ROOMS = [
    { key: 'living-room', label: 'Living room' },
    { key: 'bedroom', label: 'Bedroom' },
    { key: 'kitchen', label: 'Kitchen' },
    { key: 'balcony', label: 'Balcony' },
  ];
  const SCHEDULES = [
    { key: 'every-day', label: 'Every day', days: 1 },
    { key: 'every-3-days', label: 'Every 3 days', days: 3 },
    { key: 'weekly', label: 'Weekly', days: 7 },
  ];
  const DEFAULT_CHOICE = { emoji: 'seedling', room: 'living-room', water: 'weekly' };

  // lastWatered = days ago; a plant needs water once lastWatered reaches its schedule.
  const plants = [
    { name: 'Monstera', emoji: '🌿', room: 'Living room', every: 3, lastWatered: 4 },
    { name: 'Cactus', emoji: '🌵', room: 'Kitchen', every: 7, lastWatered: 2 },
    { name: 'Orchid', emoji: '🌸', room: 'Bedroom', every: 7, lastWatered: 8 },
    { name: 'Snake plant', emoji: '🪴', room: 'Living room', every: 7, lastWatered: 3 },
  ];

  // ----------------------------------------------------------------- helpers

  const $ = (sel, scope = document) => scope.querySelector(sel);

  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value === true ? '' : value);
    }
    node.append(...children.filter((c) => c != null && c !== false));
    return node;
  }

  const slug = (s) =>
    s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');

  // Readable, stable card ids from the name: plant-monstera, then plant-new-sunflower-2 for a repeat.
  function plantId(name) {
    const base = `plant-${slug(name) || 'friend'}`;
    let id = base;
    for (let n = 2; document.getElementById(id) || plants.some((p) => p.id === id); n++) id = `${base}-${n}`;
    return id;
  }

  const needsWater = (p) => p.lastWatered >= p.every;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const wateredText = (days) => (days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`);

  function statusText(p) {
    if (needsWater(p)) return 'Thirsty! Needs water today 💧';
    if (p.lastWatered === 0) return 'Happy and hydrated ✨';
    const inDays = p.every - p.lastWatered;
    return `Next drink in ${plural(inDays, 'day', 'days')}`;
  }

  function greetingWord() {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  }

  let toastTimer = 0;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2400);
  }

  // ------------------------------------------------------------------ cards

  const garden = $('#garden');
  const gardenEmpty = $('#garden-empty');
  const cards = new Map(); // plant id → { card, parts }

  function createCard(p) {
    const status = h('p', { class: 'plant-status' });
    const watered = h('p', { class: 'plant-watered' });
    const menuButton = h('button', {
      class: 'btn-icon', type: 'button', 'data-action': 'open-menu', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    }, h('span', { 'aria-hidden': 'true', text: '⋯' }), h('span', { class: 'sr-only', text: `More options for ${p.name}` }));
    const menu = h('div', { class: 'menu', role: 'menu', hidden: true },
      h('button', { class: 'menu-item', type: 'button', role: 'menuitem', 'data-action': 'rename', text: '✏️ Rename' }),
      h('button', { class: 'menu-item', type: 'button', role: 'menuitem', 'data-action': 'move', text: '🏡 Move to room' }),
      h('button', { class: 'menu-item menu-item-danger', type: 'button', role: 'menuitem', 'data-action': 'remove', text: '🗑️ Remove' }));

    // Keep this structure stable: recorded selectors look like "#plant-monstera > div:nth-of-type(3) > button".
    const card = h('article', { class: 'plant-card', id: p.id },
      h('div', { class: 'plant-emoji', 'aria-hidden': 'true', text: p.emoji }),
      h('div', { class: 'plant-info' },
        h('h3', { class: 'plant-name', text: p.name }),
        h('p', { class: 'plant-room', text: p.room }),
        watered,
        status),
      h('div', { class: 'plant-actions' },
        h('button', { class: 'btn btn-water', type: 'button', 'data-action': 'water' },
          '💧 Water', h('span', { class: 'sr-only', text: ` ${p.name}` })),
        h('div', { class: 'plant-menu' }, menuButton, menu)));

    cards.set(p.id, { card, watered, status });
    updateCard(p);
    return card;
  }

  function updateCard(p) {
    const { card, watered, status } = cards.get(p.id);
    watered.textContent = `Last watered: ${wateredText(p.lastWatered)}`;
    status.textContent = statusText(p);
    card.classList.toggle('is-thirsty', needsWater(p));
  }

  function updateGreeting() {
    const thirsty = plants.filter(needsWater).length;
    $('#greeting').textContent = !plants.length
      ? `${greetingWord()}! Let's add your first plant 🌱`
      : thirsty
        ? `${greetingWord()}! ${plural(thirsty, 'plant needs', 'plants need')} water today 💧`
        : `${greetingWord()}! Everyone's had a drink. Your plants are happy 🌞`;
  }

  // ------------------------------------------------------------------ views

  let view = 'plants';
  const keepOnToday = new Set(); // plants watered while "Today" is open stay visible until you leave it

  function showView(next) {
    view = next;
    if (next === 'today') keepOnToday.clear();
    for (const tab of document.querySelectorAll('.tab')) {
      tab.setAttribute('aria-selected', String(tab.dataset.action === `tab-${next}`));
      tab.tabIndex = tab.dataset.action === `tab-${next}` ? 0 : -1;
    }
    $('#view-garden').hidden = next === 'reminders';
    $('#view-garden').setAttribute('aria-labelledby', next === 'today' ? 'tab-today' : 'tab-plants');
    $('#view-reminders').hidden = next !== 'reminders';
    closeMenus();
    render();
  }

  function render() {
    updateGreeting();
    let visible = 0;
    for (const p of plants) {
      const show = view !== 'today' || needsWater(p) || keepOnToday.has(p.id);
      cards.get(p.id).card.hidden = !show;
      if (show) visible++;
    }
    gardenEmpty.hidden = visible > 0;
    if (!visible) {
      gardenEmpty.replaceChildren(...(view === 'today'
        ? [h('strong', { text: 'Nothing to water today 🌞' }), 'Your plants are happy. Check back tomorrow!']
        : [h('strong', { text: "Let's add your first plant 🌱" }), 'Every jungle starts with a single leaf.',
          h('br'), h('button', { class: 'btn btn-primary', type: 'button', 'data-action': 'add-first-plant', text: '+ Add a plant' })]));
    }
    if (view === 'reminders') renderReminders();
  }

  function renderReminders() {
    const list = $('#reminder-list');
    const upcoming = [...plants].sort((a, b) => (a.every - a.lastWatered) - (b.every - b.lastWatered));
    list.replaceChildren(...upcoming.map((p) => {
      const inDays = Math.max(0, p.every - p.lastWatered);
      return h('li', { class: 'reminder' },
        h('span', { class: 'reminder-emoji', 'aria-hidden': 'true', text: p.emoji }),
        h('span', { class: 'reminder-text' },
          h('strong', { text: p.name }), ' ', h('span', { class: 'reminder-room', text: `· ${p.room}` })),
        h('span', { class: inDays ? 'reminder-when' : 'reminder-when is-today', text: inDays ? `in ${plural(inDays, 'day', 'days')}` : 'Today 💧' }));
    }));
    if (!plants.length) list.replaceChildren(h('li', { class: 'empty', text: 'No reminders yet. Add a plant to get started 🌱' }));
  }

  // ------------------------------------------------------------------ menus

  function closeMenus() {
    for (const button of document.querySelectorAll('[data-action="open-menu"][aria-expanded="true"]')) {
      button.setAttribute('aria-expanded', 'false');
      button.nextElementSibling.hidden = true;
    }
  }

  function toggleMenu(button) {
    const open = button.getAttribute('aria-expanded') === 'true';
    closeMenus(); // only one open at a time
    if (open) return;
    button.setAttribute('aria-expanded', 'true');
    button.nextElementSibling.hidden = false;
  }

  // ------------------------------------------------------------------ popup

  const popup = $('#add-popup');
  const nameInput = $('#new-plant-name');
  let choice = { ...DEFAULT_CHOICE };
  let nameEdited = false;
  let popupOpener = null;

  function buildChips() {
    const chip = (group, item, content, extra = {}) =>
      h('button', { class: 'chip', type: 'button', 'data-action': `chip-${group}-${item.key}`, 'aria-pressed': 'false', ...extra }, content);
    $('#emoji-chips').replaceChildren(...EMOJIS.map((e) => chip('emoji', e, e.emoji, { class: 'chip chip-emoji', 'aria-label': e.label })));
    $('#room-chips').replaceChildren(...ROOMS.map((r) => chip('room', r, r.label)));
    $('#water-chips').replaceChildren(...SCHEDULES.map((s) => chip('water', s, s.label)));
  }

  function syncChips() {
    for (const button of popup.querySelectorAll('.chip')) {
      const [, group, ...rest] = button.dataset.action.split('-');
      button.setAttribute('aria-pressed', String(choice[group] === rest.join('-')));
    }
    if (!nameEdited) nameInput.value = EMOJIS.find((e) => e.key === choice.emoji).defaultName;
  }

  function openPopup(opener) {
    closeMenus();
    choice = { ...DEFAULT_CHOICE };
    nameEdited = false;
    syncChips();
    popupOpener = opener;
    popup.hidden = false;
    popup.querySelector('.chip[aria-pressed="true"]').focus();
  }

  function closePopup() {
    popup.hidden = true;
    if (popupOpener && popupOpener.isConnected) popupOpener.focus();
  }

  function savePlant() {
    const emoji = EMOJIS.find((e) => e.key === choice.emoji);
    const name = nameInput.value.trim() || emoji.defaultName;
    const p = {
      name,
      emoji: emoji.emoji,
      room: ROOMS.find((r) => r.key === choice.room).label,
      every: SCHEDULES.find((s) => s.key === choice.water).days,
      lastWatered: 0,
    };
    p.id = plantId(name);
    plants.push(p);
    const card = createCard(p);
    card.classList.add('is-new');
    garden.append(card);
    closePopup();
    showView('plants');
    toast(`Welcome home, ${name}! ${emoji.emoji}`);
  }

  // Keep keyboard focus inside the popup while it's open.
  function trapFocus(e) {
    const focusables = [...popup.querySelectorAll('button, input')].filter((el) => !el.disabled);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }

  // ----------------------------------------------------------------- actions

  function onAction(button) {
    const action = button.dataset.action;
    const card = button.closest('.plant-card');
    const plant = card && plants.find((p) => p.id === card.id);

    if (action.startsWith('chip-')) {
      const [, group, ...rest] = action.split('-');
      choice[group] = rest.join('-');
      return syncChips();
    }

    switch (action) {
      case 'tab-plants': return showView('plants');
      case 'tab-today': return showView('today');
      case 'tab-reminders': return showView('reminders');
      case 'profile': return toast(`Hi there! 👋 You're looking after ${plural(plants.length, 'plant', 'plants')}.`);
      case 'add-plant':
      case 'add-first-plant': return openPopup(button);
      case 'cancel-add': return closePopup();
      case 'save-plant': return savePlant();
      case 'open-menu': return toggleMenu(button);
      case 'water':
        plant.lastWatered = 0;
        if (view === 'today') keepOnToday.add(plant.id);
        updateCard(plant);
        render();
        return toast(`Watered! 💧 ${plant.name} says thank you.`);
      case 'rename':
        closeMenus();
        return toast('Renaming is coming soon 🌱');
      case 'move':
        closeMenus();
        return toast('Moving rooms is coming soon 🏡');
      case 'remove': {
        closeMenus();
        plants.splice(plants.indexOf(plant), 1);
        cards.get(plant.id).card.remove();
        cards.delete(plant.id);
        render();
        return toast(`Said goodbye to ${plant.name} 👋`);
      }
      case 'play-sample':
        return window.StepCast && StepCast.play('add-a-plant').catch((err) => toast(err.message));
      default:
        if (action.startsWith('play-tutorial') && window.StepCast) {
          return StepCast.play(button.dataset.tutorial).catch((err) => toast(err.message));
        }
    }
  }

  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    // Outside click closes any open ⋯ menu.
    if (!target.closest('.plant-menu')) closeMenus();
    // A click on the dimmed backdrop (not the popup itself) closes the popup.
    if (target === popup) return closePopup();
    const button = target.closest('[data-action]');
    if (!button || button.dataset.action === 'new-plant-name') return;
    if (button.tagName === 'A') e.preventDefault();
    onAction(button);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openMenu = $('[data-action="open-menu"][aria-expanded="true"]');
      if (openMenu) { closeMenus(); openMenu.focus(); return; }
      if (!popup.hidden) closePopup();
      return;
    }
    if (e.key === 'Tab' && !popup.hidden) trapFocus(e);
    // Arrow keys move between tabs, as in any tab list.
    const tab = e.target instanceof Element && e.target.closest('.tab');
    if (tab && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const tabs = [...document.querySelectorAll('.tab')];
      const next = tabs[(tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      next.click();
    }
  });

  nameInput.addEventListener('input', () => { nameEdited = true; });

  // ------------------------------------------------------------------- boot

  for (const p of plants) {
    p.id = plantId(p.name);
    garden.append(createCard(p));
  }
  buildChips();
  showView('plants');
})();
