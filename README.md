# Clatterwerk

Split-flap ("Solari") display boards for the web — the departure-board effect, engineered like the
physical machine and rendered without the glitches that plague CSS flip animations.

**Zero dependencies. No build step. One JS file + one CSS file.**

```html
<link rel="stylesheet" href="clatterwerk.css">
<script src="clatterwerk.js"></script>
<div id="counter"></div>
<script>
  const board = Clatterwerk.create("#counter", { value: "1589" });
  board.set("2026");           // clatters through the drum to the new value
</script>
```

## Why another split-flap library?

Every CSS split-flap implementation we surveyed builds each card as **one element with two faces**
and relies on `backface-visibility: hidden` to cull the hidden side. Chromium's compositor applies
that culling unreliably during accelerated animation in nested 3D contexts: for a few frames around
the 90° crossing it paints the *backside* of the front face — the old glyph, mirrored about the
hinge — which flashes as bright distorted fragments at the bottom of the card. It is intermittent,
worse on slower machines, and impossible to mask.

Clatterwerk's flip is **two single-faced quarter-turns**: the old character's top half falls
0° → −90° and parks edge-on (projected height zero), handing off — on the compositor's own
timeline, with no JavaScript in the seam — to the new character's bottom half falling 90° → 0°.
No element in the system has a reverse side, so the renderer *cannot* paint one. The bug isn't
worked around; the code path doesn't exist.

Beyond that, the engine is built like the machine it imitates:

- **Every visible change is flip-driven.** There is no code path that teleports a digit. Refreshes
  do a full drum revolution; the static halves only update beneath a landed card.
- **Physical motion.** Gravity-accelerated falls, a slap-and-rebound landing with a 1.5 px cell
  shudder, per-cell motor speed variance, forward-only drum travel.
- **Glitch-proof completion.** Animations hold their end state (`fill`) until cleanup swaps the
  text in the same JS turn — a stalled main thread reads as "the flap rests a moment longer",
  never a flicker. A per-flip watchdog force-finishes if the browser pauses animations
  (offscreen, throttled tabs), so a board can never freeze mid-sweep.
- **Cheap.** Compositor-only properties (`transform`/`opacity`), cached node references, shared
  keyframe objects, zero per-flip allocations or DOM queries. Lighting auto-disables on low-end
  hardware.
- **Accessible.** `prefers-reduced-motion` users get instant text (configurable). `clatterwerk:*`
  DOM events let you mirror values into live regions.

## Install

Copy `clatterwerk.js` and `clatterwerk.css` into your project (they are the entire library), or:

```
npm install clatterwerk
```

Works as a plain `<script>` global (`Clatterwerk`), CommonJS, or AMD.

## API

### Creating boards

```js
const board = Clatterwerk.create(elementOrSelector, {
  value: "208.5",          // initial value
  chars: " 0123456789.",   // drum, in rotation order; first char = blank/pad card
  width: 5,                // fixed cell count (0 = grow to fit; set this for stable layouts)
  align: "right",          // "right" pads on the left like a counter; "left" for text
  threeD: true,            // see "The 3d flip option" below
  mode: "cascade",         // default transition mode
  flipTime: 0.3,           // seconds per flip — the master tempo (see below)
  speed: 1,                // rate multiplier on top of flipTime
  stagger: 55,             // per-cell delay (ms) in single mode
  shading: "auto",         // true | false | "auto"
  respectReducedMotion: true,
  onStart: (value, board) => {},
  onSettle: (value, board) => {},
});
```

### Methods

| Call | What the machine does |
|---|---|
| `board.set(value, opts?)` | Spin each cell forward through the drum to the new value, in the board's default mode. |
| `board.cascade(value)` | **Relay cascade** — every cell starts at once (with millisecond relay scatter), clatters at constant speed, and stops independently the moment its character arrives. The live-update mode. |
| `board.flywheel(value)` | **Flywheel** — the drum spins up from rest, blurs through characters with overlapping flaps, and slams to a stop. The page-load showpiece. |
| `board.single(value)` | One quiet flip per cell, staggered left to right. No drum travel. |
| `board.sweep()` | Full-revolution refresh back to the current value — the station "exercise sweep". |
| `board.intro(value?)` | Arrival animation: at least one full revolution into the target (flywheel by default). |
| `board.snap(value)` | Instant, unanimated set. The escape hatch (used internally for reduced motion). |
| `board.listen(target, event, map?)` | Subscribe the board to an event source; `map(event)` returns the new value. Returns an unsubscribe function. |
| `board.destroy()` | Cancel everything and remove the generated DOM. |

**Tempo.** `flipTime` is the duration of one single-mode flip in **seconds** (default `0.3`);
drum steps, slam landings, and the flywheel spin-up curve all scale proportionally from it.
`speed` is a rate multiplier applied on top (handy for nudging one board in a group). Both are
read live — change them at runtime and the very next flap obeys:

```js
board.opts.flipTime = 0.6;   // statelier
board.opts.speed = 2;        // twice as fast
```

Properties: `board.value` (current string, padding stripped), `board.animating`.
All transition methods return a promise that resolves when the board is idle. Calls made while a
transition runs are coalesced — only the **latest** value wins, so dense triggers settle on the
newest data instead of replaying every intermediate state.

### Groups — numbers in separate places, acting as one machine

```js
const stats = Clatterwerk.group([flightsBoard, crewBoard, yearsBoard]);

stats.set(["1589", "788", "208.5"]);   // array = per-board values
stats.sweep();                          // every board does a full revolution
stats.intro();                          // coordinated arrival

// Trigger binding: one event updates every board in the group.
stats.listen(document, "stats:change", e => e.detail);
document.dispatchEvent(new CustomEvent("stats:change", { detail: ["412", "256", "96.3"] }));
```

`group.add(board)`, `group.cascade/flywheel/single/snap(values)`, and `group.destroy()` complete
the surface.

### Declarative mounting

```html
<span data-clatterwerk="1589" data-flap-width="4" data-flap-group="stats"></span>
<span data-clatterwerk="HELLO" data-flap-chars=" ABCDEFGHIJKLMNOPQRSTUVWXYZ" data-flap-align="left"></span>
<script>
  const { boards, groups } = Clatterwerk.mount();   // scans [data-clatterwerk]
  groups.stats.set(["2026"]);
</script>
```

Supported attributes: `data-clatterwerk` (value), `data-flap-mode`, `data-flap-chars`,
`data-flap-width`, `data-flap-align`, `data-flap-time` (seconds per flip), `data-flap-speed`,
`data-flap-3d`, `data-flap-group`.

### Events

Boards dispatch bubbling `clatterwerk:start` and `clatterwerk:settle` CustomEvents
(`event.detail = { board, value }`) — handy for syncing ARIA live regions or analytics.

## The `threeD` ("3d flip") option

**On (default):** the full physical rendering — one shared vanishing point for the whole board
(edge cells flip obliquely, like watching a real wall-mounted board), a 5° mount tilt, cards
wider than their slots that visibly break the frame mid-flight, a `translateZ` pop toward the
viewer, angle-based lighting, slap rebound and cell shudder.

**Off:** the classic flat look — contained, per-cell perspective only, no tilt/pop/overhang/
shading/slam theatrics. Same engine underneath (the no-backface architecture is not optional —
it is the reliability story), so flat mode is equally glitch-free.

## Theming

Everything visual is a CSS custom property on `.clatterwerk` — override per instance:

```css
#myboard {
  --flap-height: 64px;       /* font size scales automatically */
  --flap-width: 44px;
  --flap-color: #fff;
  --flap-bg-top: #222;
  --flap-bg-bottom: #1a1a1a;
  --flap-split: #000;        /* match your page background */
  --flap-perspective: 420px; /* lower = more dramatic 3D */
  --flap-tilt: 5deg;
}
```

See `clatterwerk.css` for the full list.

## Browser support

Any browser with the Web Animations API (`Element.animate`): Chrome/Edge 84+, Firefox 75+,
Safari 13.1+. Without WAAPI the board degrades gracefully to instant text updates.

## Examples

Open [`examples/index.html`](examples/index.html) straight from disk — groups & triggers, all
three modes, flat mode, and a letter drum.

## License & credit

[MIT](LICENSE). Free for anything, including commercial use — the one requirement is that you
keep the copyright and license notice with the code. That notice is the credit; please don't
strip it.
