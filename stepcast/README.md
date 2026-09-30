# StepCast

Drop-in tutorial recorder and player: it records clicks, typing and dropdown choices, and plays them back. Copy this
`stepcast/` folder anywhere in your project and point the script tags at it. Keep everything in the folder together,
load the scripts with normal `<script>` tags (not bundled or as `type="module"`), and serve them from the same site
as your pages.

| File | Load it on | What it does |
| --- | --- | --- |
| `stepcast-player.js` | your live site | Plays tutorials. Nothing else. |
| `stepcast-recorder.js` | your local/dev copy only | Recording panel, selectors, drafts, export. Loads the player itself. |
| `stepcast.css` | (loaded automatically) | Styles for both. |
| `tutorials/` | | One `<id>.json` file per tutorial. |

**The live site should only ever include `stepcast-player.js`.** The recorder is an authoring tool. Pages that load
only the player have no way to open it, not even with `?stepcast` in the URL.

## Record

Add the recorder to a local or dev copy of your app. Loading it is what shows the panel:

```html
<script src="stepcast/stepcast-recorder.js"></script>
```

It loads `stepcast-player.js` from the same folder, or reuses it if the page already includes it.

1. Enter a title, press **● Record**, click and type through your app, press **■ Stop**. The panel collapses while
   recording (the handle's pulsing red dot shows it's active) and reopens on Stop.
2. Click a step to add its subtitle. Open a step to see which element it targets: hover the selector to see its
   full path, or press **Show** to flash the element on the page.
3. **Export → Download JSON** (**Copy JSON** is in the same menu) and move the file into `stepcast/tutorials/`. The
   file name is the tutorial id.

To play a saved tutorial from `stepcast/tutorials/`, press the folder button in the panel footer and type its id
without `.json`, for example `add-a-plant`.

To change a tutorial, re-record it. Your draft is saved in `localStorage` and restored after a reload, until you
record over it or start a new one. The **+ New tutorial** button in the panel header clears the draft (title, steps
and subtitles) and starts blank. If the draft has steps, it asks first; settings and the handle position are kept.

If the collapsed panel's "StepCast" handle covers something on your page, drag it up or down. When it's focused,
you can also use ↑/↓ (Shift for bigger steps). Its position is remembered. Dragging only works while the panel is
collapsed; a click (or Enter/Space) still opens and closes the panel.

The recorder also adds `StepCast.showRecorder()`, `StepCast.record()` and `StepCast.stopRecording()`.

### Stable selectors

The recorder picks selectors in this order: `data-stepcast`, then any attributes listed in `data-stable-attrs`,
then `data-testid` / `data-test` / `data-cy` / `data-qa`, then a non-generated `id`, then `name` / `aria-label` /
`placeholder` / `title` / `alt`, and finally an `nth-of-type` path anchored at the nearest ancestor with a stable id.
Add `data-stepcast="..."` to any element whose selector you want to survive layout changes.

If your app already has its own stable attributes, list them (comma-separated) on the recorder's script tag:

```html
<script src="stepcast/stepcast-recorder.js" data-stable-attrs="data-action"></script>
```

A button with `data-action="new-note"` is then recorded as `[data-action="new-note"]`.

### Ignoring elements

Clicks on (or inside) elements with `data-stepcast-ignore` are never recorded, and neither is typing into them:

```html
<button data-stepcast-ignore>Help</button>
```

### Typing and dropdowns

Besides clicks, the recorder captures what you type into text fields and choose in dropdowns:

- **Text fields** (`<textarea>`, and `<input>` of type text, search, email, url, tel or number) become a **type**
  step with the final value, recorded when you leave the field or press Enter, never keystroke by keystroke.
- **`<select>` dropdowns** become a **choose** step with the option you picked.
- **One step per edit:** clicking into a field and typing is a single step, not a click plus a type. Changing the
  same field again before clicking anything else updates that step instead of adding another.
- **Checkboxes and radio buttons** stay click steps. Contenteditable areas aren't recorded yet.
- **Secrets are never recorded:** password fields (`type="password"`), fields with `autocomplete` set to
  `current-password`, `new-password`, `cc-number`, `cc-csc` or `one-time-code`, and anything inside
  `data-stepcast-ignore`. Not the value, and not even a click on them.

Steps read like 'Type “120” into “Length”' or 'Choose “Oak” in “Wood type”'. The field's name comes from its
`<label>`, `aria-label`, placeholder or `name`. Open a type or choose step in the panel to fix a typo in its
**Value** without re-recording. For a dropdown, the value is the option's `value`.

In the tutorial file these steps have `"action": "type"` or `"select"` and a `"value"`. Steps without an `action`
are clicks, so older tutorials keep working unchanged.

### Settings

The gear button in the panel header opens Settings. The back arrow returns to the steps. Changes apply instantly,
including to a running Preview:

- **Mode**: Auto (follows the device's light/dark setting), Light, or Dark. Applies to the panel and the
  tutorial box.
- **Read steps aloud**: Off or On. When On, visitors hear each step and get a speaker button to mute it, and a
  **Voice** dropdown appears with a **Play** button to hear a voice. See [Narration](#narration-reading-steps-aloud).
- **Brand color**: used for primary buttons (Next, Done), the highlight ring and the progress bar. Pick a
  color, or type a hex value (`#4f46e5`, `4f46e5` and `#abc` all work). Leave it empty for the default.
- **Button text color**: the text on brand-colored buttons. By default it's **automatic**: white or near-black,
  whichever is more readable on the brand color. The field then shows the chosen color with an "Auto" tag. Pick
  or type a color to override it. Press **Auto** (or empty the hex field) to go back to automatic. If the two colors
  have less than 3:1 contrast, a warning appears under the field, but the colors are still applied.
- **Reset to defaults** sets Mode back to Auto, clears the brand color, makes button text automatic again, turns
  Read steps aloud off and sets the voice back to Automatic.

Settings are saved in your browser (`localStorage` key `stepcast:settings`), and **copied into each tutorial you
download or copy**: the look as its `theme`, and the narration as its `narration`. Visitors see a tutorial with the look it was exported with. Changing your settings
later doesn't change tutorials you've already exported; re-download them to update. **▶ Preview** plays with the
current settings, exactly as the downloaded file would.

## Play

On the live site, include only the player:

```html
<script src="stepcast/stepcast-player.js"></script>
```

```js
StepCast.play('add-a-plant');            // loads stepcast/tutorials/add-a-plant.json
StepCast.play('/some/other/path.json');  // any URL on the same site
StepCast.play(tutorialObject);           // already-loaded JSON
StepCast.stop();
```

**Tutorials must be on the same site** as the page, because a tutorial can click things on your page.
`StepCast.play()` refuses any tutorial URL on another origin and rejects with
`StepCast: tutorials must be on the same site.` This also means `stepcast-player.js` must be served from your own
site, since bare ids resolve next to it.

During playback the user can click the highlighted element, or press **Next** to have StepCast click it for them. Esc exits.

On a type or choose step, the tutorial box says what to enter (for example 'Type “Sunny” here'). The visitor can:

- **type or pick it themselves:** the tutorial moves on when they leave the field, press Enter, or choose an option,
  whatever they entered; or
- **press Next:** StepCast fills in the recorded value, sending the same `input` and `change` events a person would,
  so frameworks like React notice, then moves on. If they already typed their own text, Next keeps it.

If a step's selector no longer matches during playback, StepCast falls back to an element with the same tag and
text, but only when exactly one such element is visible. Otherwise it shows "Couldn’t find this element" and
offers Skip rather than highlight the wrong one.

Tutorials are loaded with `fetch`, so the page must be served over http(s), not opened as `file://`.

`player-demo.html` in the project root, next to `index.html`, is the demo app with only the player loaded.

### Starting a tutorial from a URL (off by default)

The player can start a tutorial straight from a link like `https://your-site.example/page?stepcast-play=add-a-plant`.
This is **off by default**: anyone could send your visitors such a link, and it would start one of your tutorials,
which clicks things on the page, without them asking for it. Turn it on only if you want those links, by adding
`data-url-play` to the player's script tag:

```html
<script src="stepcast/stepcast-player.js" data-url-play></script>
```

Without the attribute, `?stepcast-play` is ignored silently. With it:

- **`?stepcast-play` only takes a plain tutorial id**: letters, numbers, `_` and `-` (for example `add-a-plant`). It
  always plays `stepcast/tutorials/<id>.json`. Anything else, such as a path or a full URL, is ignored and plays
  nothing, with a warning in the browser console. This stops a shared link from loading someone else's tutorial.
- **The same-site rule above applies** as well.

When the recorder loads the player for you, URL auto-play stays off.

### Tutorial theme

Exported tutorials include an optional `theme`:

```json
"theme": {
  "mode": "auto",
  "brandColor": "#0ea5e9",
  "buttonTextColor": null
}
```

- `mode`: `"auto"` (follows the visitor's light/dark setting), `"light"` or `"dark"`.
- `brandColor` / `buttonTextColor`: `"#rrggbb"`, or `null` for the default brand color / automatic button text.

The player applies it only while that tutorial plays, then restores the previous look. That's the default on a
live site, or your own settings on a page with the recorder. Invalid values are ignored and fall back to the
default, and tutorials without a `theme` (older files) play with the default look.

### Narration (reading steps aloud)

The player can read each step aloud with the visitor's own browser voice (the Web Speech API). There are no audio
files, no service and no API key. It reads the step's subtitle, or the default text such as 'Click “Save”' when
there isn't one, and emoji are skipped.

- **The author decides per tutorial** in the recorder's **Settings → Read steps aloud**:
  - **Off:** no narration, and visitors see no speaker button.
  - **On:** steps are read aloud, and visitors get a speaker button in the tutorial box to mute or unmute it.

  It's saved into exported tutorials as:

  ```json
  "narration": { "enabled": true }
  ```

  A missing or invalid value means off, so older tutorials have no narration.
- **Choosing a voice:** when narration is On, a **Voice** dropdown appears under it. It lists **Automatic (best
  available)** and this device's voices for the page's language (novelty voices hidden), with a **Play** button to
  hear one. The choice is saved as `"narration": { "enabled": true, "voice": "Daniel" }`. Voices differ per device,
  so it's a preference: visitors who have that voice hear it, and everyone else hears the best voice their device
  offers.
- **Visitors can mute narrated tutorials:** if they mute, that's remembered in their browser (`localStorage`,
  `stepcast:narration`) and applies to every narrated tutorial on your site. Visitors can't turn narration on for
  a tutorial that has it off.
- **The voice depends on the visitor's device and browser.** StepCast picks the most natural-sounding voice
  offered for the page's language (`<html lang>`). In order, it prefers "Natural" and neural voices (Microsoft
  Edge's online voices), "Premium" and "Enhanced" voices (Apple devices, once downloaded), then Google's cloud voices
  (Chrome). It avoids novelty voices like Zarvox. If a cloud voice fails, for example offline, it moves to the next
  best one. With no voice for the page's language, the browser's default is used. In browsers without speech
  support, tutorials simply play without narration and without the button.
- **To hear a better voice on a Mac,** download a Premium or Enhanced voice: System Settings → Accessibility →
  Spoken Content → System voice → Manage Voices. Then reload the page. Edge's "Natural" voices sound the most
  human and need no download.
- **Browsers only allow sound after a click.** A tutorial started by a button speaks right away; one started from a
  `?stepcast-play` link starts speaking after the visitor's first click.

## v1 limits

- Single page: steps store `url`, but playback doesn't navigate between pages.
- Steps can't be reordered, deleted or added by hand. You can edit subtitles and typed values; otherwise re-record.
- Contenteditable areas (rich text editors) aren't recorded.
- Native `<dialog>.showModal()` renders above everything, including the StepCast overlay.
