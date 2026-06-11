# Changelog

All notable changes to Clatterwerk are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-06-11

### Added
- Initial release.
- No-backface flip engine: two single-faced quarter-turn flaps per cell with a
  compositor-timed handoff — eliminates the Chromium `backface-visibility`
  flicker that affects double-faced CSS flip implementations.
- Three transition modes: `cascade` (relay-driven constant clatter,
  independent stops), `flywheel` (spin-up, overlapping flaps at cruise, hard
  stop), `single` (one soft flip per cell).
- `sweep()` full-revolution refresh and `intro()` arrival animation; every
  visible change is flip-driven (no text teleports), with `snap()` as the
  explicit unanimated escape hatch.
- `threeD` option (default on): shared board-level perspective, 5° mount tilt,
  frame-breaking card overhang, translateZ pop, angle-based lighting, slap
  rebound and cell shudder. Off = classic flat look on the same engine.
- Groups: boards in separate DOM locations driven as one machine, with
  array-or-scalar `set()` and `listen()` trigger binding.
- Declarative mounting via `[data-clatterwerk]` attributes and
  `Clatterwerk.mount()`.
- `flipTime` option — seconds per flip, the master tempo all modes scale
  from; adjustable at runtime, with a `data-flap-time` attribute and a
  `speed` rate multiplier on top.
- Per-flip watchdog (freeze-proof under animation throttling), latest-wins
  update coalescing, `prefers-reduced-motion` support, low-end hardware
  auto-detection for lighting, full CSS-custom-property theming.
