# StepCast

**Record a tutorial by clicking through your web app, then play it back inside that same app.**

StepCast is a drop-in folder with no build step, no dependencies and no account. You record clicks, typing and
dropdown choices; each becomes a step you can give a friendly subtitle. Visitors then see a guided walkthrough that
highlights one element at a time. Tutorials are plain JSON files that live in your repo, next to your code.

## Try the demo

The repo includes **Leafy**, a small pretend plant-care app to try StepCast on. Serve the folder over http (opening
the files directly won't work), for example:

```sh
python3 -m http.server 8000
```

Then open:

- **http://localhost:8000/index.html**: Leafy with the **recorder**. Press ● Record in the panel on the right,
  add a plant, water one, then Stop, add subtitles and Preview.
- **http://localhost:8000/player-demo.html**: Leafy with **only the player**, as visitors on a live site would see
  it. Play the sample tutorials from the intro card.

## Add it to your site

1. **Copy the `stepcast/` folder** into your project. Keep everything inside it together.
2. **While making tutorials**, load the recorder on a local or dev copy of your app:

   ```html
   <script src="stepcast/stepcast-recorder.js"></script>
   ```

   Record, add subtitles, then **Export → Download JSON** and save the file into `stepcast/tutorials/`.
3. **On your live site**, load only the player. Never the recorder:

   ```html
   <script src="stepcast/stepcast-player.js"></script>
   ```

4. **Start a tutorial** by its file name (without `.json`):

   ```html
   <button onclick="StepCast.play('add-a-plant')">Show me how</button>
   ```

Use normal `<script>` tags (not bundled or `type="module"`) and serve StepCast from the same site as your pages.
The full guide, covering stable selectors, typing steps, settings, themes and the JavaScript API, is in
**[stepcast/README.md](stepcast/README.md)**.

## Features

- **Record, don't code:** clicks, typed text and dropdown choices become steps. Fix a subtitle or a typed value in
  the panel without re-recording.
- **Stable selectors:** prefers `data-stepcast`, your own attributes (`data-stable-attrs`), test ids and ids,
  scoped to the nearest stable parent, e.g. `#plant-monstera [data-action="water"]`.
- **Guided playback:** the page dims around the current element, and a box shows its subtitle. Visitors click the
  element or type into it themselves, or press Next to have StepCast do it. Esc exits.
- **Your look:** light, dark or auto mode, a brand color and a button text color, saved into each tutorial.
- **Narration:** turn it on per tutorial and steps are read aloud with the visitor's browser voice. You can pick
  a preferred voice, and visitors can mute it with a speaker button.
- **Small:** the player is about 6.5 KB gzipped (plus 4 KB of CSS) and keeps its styles and events to itself.

## Safety

- **Secrets are never recorded:** password fields, fields with credit-card or one-time-code `autocomplete` values,
  and anything marked `data-stepcast-ignore`.
- **Same-site only:** the player refuses tutorials from other sites.
- **No surprise tutorials:** starting a tutorial from a link (`?stepcast-play=…`) is off unless you enable it with
  `data-url-play`.
- **Authoring stays private:** pages that load only the player can't open the recorder.

## Project layout

```text
stepcast/                  ← the part you copy into your project
  stepcast-player.js       playback (the only file your live site needs)
  stepcast-recorder.js     recording panel (local/dev only; loads the player itself)
  stepcast.css             styles for both (loaded automatically)
  tutorials/               one <id>.json per tutorial
  README.md                full documentation
index.html                 Leafy demo with the recorder
player-demo.html           Leafy demo with only the player
leafy.css, leafy.js        the demo app
```

## Limits (v1)

Tutorials stay on one page (no navigating between pages), steps can't be reordered or deleted by hand (re-record
instead), and rich-text editors (contenteditable) aren't recorded yet.
