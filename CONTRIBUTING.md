# Contributing to Flapboard

Thanks for your interest! This project values smallness and reliability over
features. Before adding anything, ask whether the physical machine being
imitated would do it.

## Ground rules

- **Zero dependencies, no build step.** `flapboard.js` and `flapboard.css`
  ship exactly as they live in this repo. PRs that introduce a toolchain,
  framework, or runtime dependency will be declined.
- **No backfaces, ever.** The flip must remain two single-faced quarter-turns.
  Any change that reintroduces `backface-visibility` or double-faced cards
  reopens the Chromium compositor flicker this library exists to avoid
  (see "Why another split-flap library?" in the README).
- **Every visible digit change must be flip-driven.** The only sanctioned
  instant path is `snap()` / reduced-motion.
- **Compositor-only animation.** Stick to `transform` and `opacity`. No layout
  or paint properties in keyframes.

## Developing & testing

There is no test harness — the examples page is the test bed:

1. Edit `flapboard.js` / `flapboard.css`.
2. Open `examples/index.html` from disk in Chrome, Firefox, and Safari.
3. Exercise every demo: all three modes, sweep, intro, flat mode, the letter
   drum, and rapid-fire clicking (update coalescing).
4. Watch specifically for: bright pixels at card edges mid-flight, digits
   changing without a flip, and boards freezing after being scrolled
   offscreen mid-sweep (the watchdog should recover within ~0.5 s).
5. Test with OS-level "reduce motion" enabled — boards must update instantly.

## Pull requests

- Keep diffs focused; one concern per PR.
- Update README/CHANGELOG when behavior or API changes.
- Match the existing code style (ES5-flavored, prototypes, no classes — it
  keeps the UMD single-file story simple).

## Reporting rendering glitches

Include: browser + version, OS, GPU if known, `Flapboard.lowEnd` value,
whether `threeD` was on, and ideally a screenshot or recording. Rendering
bugs are taken seriously here — they are the whole point of the library.
