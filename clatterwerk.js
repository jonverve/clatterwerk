/*!
 * Clatterwerk 1.0.0
 * Split-flap (Solari) display boards for the web — zero dependencies.
 * https://github.com/[YOUR-GITHUB]/clatterwerk
 * Copyright (c) 2026 [YOUR NAME]
 * Released under the MIT License (keep this notice — that's the deal).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else if (typeof define === "function" && define.amd) { define(factory); }
  else { root.Clatterwerk = factory(); }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var RM = (typeof matchMedia === "function")
    ? matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };
  var LOWEND = (typeof navigator !== "undefined") &&
    (((navigator.hardwareConcurrency || 8) <= 4) || ((navigator.deviceMemory || 8) <= 4));

  var DEFAULTS = {
    value: "",
    chars: " 0123456789.",   // drum order; first char is the blank/pad card
    width: 0,                // fixed cell count; 0 = grow to fit the value
    align: "right",          // which side gets the blank padding ("right" pads left)
    threeD: true,            // true = full physical look; false = flat classic look
    mode: "cascade",         // default transition: "cascade" | "flywheel" | "single"
    flipTime: 0.3,           // seconds for one single-mode flip — the master tempo;
                             // drum steps, slams and the flywheel curve all scale with it
    speed: 1,                // rate multiplier on top of flipTime (2 = twice as fast)
    stagger: 55,             // per-cell start offset in single mode (ms)
    shading: "auto",         // true | false | "auto" (on for 3D, off on low-end hardware)
    respectReducedMotion: true,
    onStart: null,           // function(value, board)
    onSettle: null           // function(value, board)
  };

  // Timing constants (ms at the 0.3 s reference flipTime, before scaling).
  var T_RUN = 84;            // one drum step at cruise
  var T_SLAM = 175;          // final landing flip (cascade)
  var T_SLAM_FLY = 195;      // final landing flip (flywheel)
  var T_SINGLE = 300;        // single soft flip
  var FLY_MAX = 185, FLY_DECAY = 0.74, FLY_MIN = 60; // flywheel spin-up curve

  var CELL_HTML =
    '<div class="cw-half cw-top"><span class="cw-glyph"></span></div>' +
    '<div class="cw-half cw-bottom"><span class="cw-glyph"></span><div class="cw-shade cw-sh-slot"></div></div>' +
    '<div class="cw-flap cw-ftop"><span class="cw-glyph"></span><div class="cw-shade cw-sh-top"></div></div>' +
    '<div class="cw-flap cw-fbot"><span class="cw-glyph"></span><div class="cw-shade cw-sh-bot"></div></div>' +
    '<div class="cw-split"></div>';

  function nb(ch) { return ch === " " ? " " : ch; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function snapCell(cell, ch) {
    cell.cur = ch;
    cell.top.textContent = nb(ch);
    cell.bot.textContent = nb(ch);
  }

  /* ------------------------------------------------------------------ Board */

  function Board(el, opts) {
    if (typeof el === "string") { el = document.querySelector(el); }
    if (!el) { throw new Error("Clatterwerk: mount element not found"); }
    this.el = el;
    this.opts = Object.assign({}, DEFAULTS, opts || {});
    if (!(this.opts.speed > 0)) { this.opts.speed = 1; }
    if (!(this.opts.flipTime > 0)) { this.opts.flipTime = DEFAULTS.flipTime; }
    this._drum = String(this.opts.chars);
    this._blank = this._drum.charAt(0);
    this._cells = [];
    this._next = null;
    this._drainP = null;
    this._busy = false;
    this._offs = [];

    el.classList.add("clatterwerk", this.opts.threeD ? "clatterwerk--3d" : "clatterwerk--flat");
    this._row = document.createElement("div");
    this._row.className = "cw-row";
    el.appendChild(this._row);

    var h = parseFloat(getComputedStyle(el).getPropertyValue("--flap-height")) || 44;
    this._pop = this.opts.threeD ? h * 0.45 : 0;
    this._buildKeyframes();

    var v = this.opts.value == null ? "" : String(this.opts.value);
    this._ensureWidth(Math.max(this.opts.width || 0, v.length, 1));
    if (v) { this._snapAll(v); }
  }

  // The flip is two single-faced quarter-turns handed off on the compositor
  // timeline. No element ever shows its reverse side, so backface-visibility
  // is not used at all — the Chromium backface flicker bug cannot occur.
  Board.prototype._buildKeyframes = function () {
    var p = this._pop;
    if (this.opts.threeD) {
      this._kfTop = [
        { transform: "rotateX(0deg) translateZ(0px)", easing: "cubic-bezier(.5,0,.85,.6)" },
        { transform: "rotateX(-90deg) translateZ(" + p + "px)" }];
      this._kfBotRun = [
        { transform: "rotateX(89deg) translateZ(" + p + "px)", easing: "cubic-bezier(.2,.3,.5,1)" },
        { transform: "rotateX(0deg) translateZ(0px)" }];
      this._kfBotSlam = [
        { transform: "rotateX(89deg) translateZ(" + (p * 1.1) + "px)", easing: "cubic-bezier(.3,0,.55,.6)" },
        { transform: "rotateX(0deg) translateZ(0px)", offset: 0.6, easing: "cubic-bezier(.2,.7,.4,1)" },
        { transform: "rotateX(16deg) translateZ(" + (p * 0.25) + "px)", offset: 0.8, easing: "cubic-bezier(.5,0,.8,.5)" },
        { transform: "rotateX(0deg) translateZ(0px)" }];
    } else {
      this._kfTop = [
        { transform: "rotateX(0deg)", easing: "cubic-bezier(.4,.05,.7,.5)" },
        { transform: "rotateX(-90deg)" }];
      this._kfBotRun = [
        { transform: "rotateX(89deg)", easing: "cubic-bezier(.25,.45,.45,1)" },
        { transform: "rotateX(0deg)" }];
      this._kfBotSlam = this._kfBotRun;
    }
    this._shTopKF = [{ opacity: 0 }, { opacity: 0.75 }];
    this._shBotKF = [{ opacity: 0.75 }, { opacity: 0 }];
    this._shSlotKF = [{ opacity: 0 }, { opacity: 0.3, offset: 0.5 }, { opacity: 0 }];
    this._kfShudder = [{ transform: "translateY(0)" }, { transform: "translateY(1.5px)" }, { transform: "translateY(0)" }];
  };

  // Internal timings are expressed relative to a 0.3 s reference flip, so
  // flipTime rescales the whole machine proportionally and speed divides on
  // top. Both are read live: changing board.opts.flipTime (seconds) takes
  // effect on the very next flap.
  Board.prototype._t = function (ms) {
    return ms * (this.opts.flipTime / 0.3) / this.opts.speed;
  };

  Board.prototype._instant = function () {
    return this.opts.respectReducedMotion && RM.matches;
  };

  Board.prototype._shaded = function () {
    var s = this.opts.shading;
    if (s === true) { return true; }
    if (s === false) { return false; }
    return this.opts.threeD && !LOWEND;
  };

  Board.prototype._ensureWidth = function (n) {
    while (this._cells.length < n) {
      var c = document.createElement("div");
      c.className = "cw-cell";
      c.innerHTML = CELL_HTML;
      var cell = {
        el: c,
        top: c.querySelector(".cw-top .cw-glyph"),
        bot: c.querySelector(".cw-bottom .cw-glyph"),
        ftop: c.querySelector(".cw-ftop"),
        ftopG: c.querySelector(".cw-ftop .cw-glyph"),
        fbot: c.querySelector(".cw-fbot"),
        fbotG: c.querySelector(".cw-fbot .cw-glyph"),
        shT: c.querySelector(".cw-sh-top"),
        shB: c.querySelector(".cw-sh-bot"),
        shSlot: c.querySelector(".cw-sh-slot"),
        cur: this._blank,
        j: 0.9 + Math.random() * 0.2  // per-cell motor speed variance
      };
      snapCell(cell, this._blank);
      if (this.opts.align === "right") {
        this._row.insertBefore(c, this._row.firstChild);
        this._cells.unshift(cell);
      } else {
        this._row.appendChild(c);
        this._cells.push(cell);
      }
    }
  };

  Board.prototype._pad = function (v) {
    if (v.length > this._cells.length) {
      this._ensureWidth(Math.max(this.opts.width || 0, v.length));
    }
    while (v.length < this._cells.length) {
      v = this.opts.align === "right" ? this._blank + v : v + this._blank;
    }
    return v;
  };

  Board.prototype._snapAll = function (v) {
    var str = this._pad(String(v));
    for (var i = 0; i < this._cells.length; i++) {
      snapCell(this._cells[i], str.charAt(i));
    }
  };

  // One physical flip: old char's top half falls 0°→-90° and parks edge-on
  // (projected height zero); the new char's bottom half, hinged at the
  // centerline, falls 89°→0°. Both animations are created together so the
  // 90° handoff happens on the compositor clock with no JS in the seam.
  // fill:"forwards"/"backwards" hold the end states until cleanup runs in the
  // same JS turn that swaps the static text — no frame can paint a digit
  // change outside the mechanic. A watchdog force-finishes the flip if the
  // finish event is lost (offscreen/throttled documents pause animations).
  Board.prototype._flip = function (cell, next, dur, kind) {
    var self = this;
    return new Promise(function (res) {
      if (self._instant()) { snapCell(cell, next); res(); return; }
      var from = cell.cur;
      cell.cur = next;
      cell.ftopG.textContent = nb(from);
      cell.fbotG.textContent = nb(next);
      cell.top.textContent = nb(next);
      var at = null, ab = null;
      try {
        at = cell.ftop.animate(self._kfTop, { duration: dur * 0.5, fill: "forwards" });
        ab = cell.fbot.animate(kind === "slam" ? self._kfBotSlam : self._kfBotRun,
          { duration: dur * 0.58, delay: dur * 0.42, fill: "backwards" });
        if (self._shaded()) {
          cell.shT.animate(self._shTopKF, { duration: dur * 0.5 });
          cell.shB.animate(self._shBotKF, { duration: dur * 0.58, delay: dur * 0.42, fill: "backwards" });
          if (kind !== "run") { cell.shSlot.animate(self._shSlotKF, { duration: dur }); }
        }
        if (kind === "slam" && self.opts.threeD) {
          cell.el.animate(self._kfShudder, { duration: 70, delay: dur * 0.92 });
        }
      } catch (e) { /* no WAAPI: degrade to instant below */ }
      if (!ab) { cell.bot.textContent = nb(next); res(); return; }
      var settled = false;
      function done() {
        if (settled) { return; }
        settled = true;
        cell.bot.textContent = nb(next);
        cell.ftop.style.visibility = "hidden";
        cell.fbot.style.visibility = "hidden";
        try { at.cancel(); } catch (e) {}
        try { ab.cancel(); } catch (e) {}
        res();
      }
      ab.onfinish = done;
      setTimeout(function () {
        if (settled) { return; }
        try { ab.finish(); } catch (e) {}
        done();
      }, dur + 400);
      cell.ftop.style.visibility = "visible";
      cell.fbot.style.visibility = "visible";
    });
  };

  // Drum spin for one cell: forward-only through the character drum, like the
  // real machine. accel=true gives the flywheel spin-up with overlapping
  // flaps at cruise speed. A target not on the drum gets one direct flip.
  Board.prototype._spinDrum = async function (cell, target, extraRev, accel) {
    if (this._instant()) { snapCell(cell, target); return; }
    var drum = this._drum;
    var i = drum.indexOf(cell.cur); if (i < 0) { i = 0; }
    var t = drum.indexOf(target);
    if (t < 0) {
      if (cell.cur !== target) { await this._flip(cell, target, this._t(T_SINGLE), "slam"); }
      return;
    }
    var steps = (t - i + drum.length) % drum.length;
    if (extraRev) { steps += drum.length; }
    if (steps === 0) { return; }
    var k = 0;
    while (steps > 1) {
      i = (i + 1) % drum.length;
      var d = accel ? Math.max(FLY_MIN, FLY_MAX * Math.pow(FLY_DECAY, k)) : T_RUN;
      k++;
      d = this._t(d * cell.j);
      var fp = this._flip(cell, drum.charAt(i), d, "run");
      steps--;
      if (accel && steps > 1 && d <= this._t(82)) { await wait(d * 0.68); } else { await fp; }
    }
    i = (i + 1) % drum.length;
    await this._flip(cell, drum.charAt(i), this._t(accel ? T_SLAM_FLY : T_SLAM), "slam");
  };

  Board.prototype._spinSingle = async function (cell, target, force) {
    if (this._instant()) { snapCell(cell, target); return; }
    if (cell.cur === target && !force) { return; }
    await this._flip(cell, target, this._t(T_SINGLE), "soft");
  };

  Board.prototype._fire = function (name, value) {
    var cb = name === "start" ? this.opts.onStart : this.opts.onSettle;
    if (typeof cb === "function") { try { cb(value, this); } catch (e) {} }
    try {
      this.el.dispatchEvent(new CustomEvent("clatterwerk:" + name, {
        bubbles: true, detail: { board: this, value: value }
      }));
    } catch (e) {}
  };

  Board.prototype._transition = function (value, o) {
    var self = this;
    var str = this._pad(String(value));
    this._fire("start", value);
    if (o.instant || this._instant()) {
      this._snapAll(value);
      this._fire("settle", this.value);
      return Promise.resolve();
    }
    var mode = o.mode || this.opts.mode;
    var jobs = this._cells.map(function (cell, ci) {
      var target = str.charAt(ci);
      var delay, run;
      if (mode === "single") {
        delay = ci * self._t(self.opts.stagger);
        run = function () { return self._spinSingle(cell, target, o.force); };
      } else if (mode === "flywheel") {
        delay = Math.random() * 30;
        run = function () { return self._spinDrum(cell, target, o.rev, true); };
      } else {
        delay = Math.random() * 40;
        run = function () { return self._spinDrum(cell, target, o.rev, false); };
      }
      return new Promise(function (res) { setTimeout(function () { run().then(res, res); }, delay); });
    });
    return Promise.all(jobs).then(function () { self._fire("settle", self.value); });
  };

  // set() queues: while a transition runs, only the LATEST requested value is
  // kept, so dense triggers settle on the newest data instead of replaying
  // every intermediate state. Returns a promise for when the board is idle.
  Board.prototype.set = function (value, opts) {
    var self = this;
    this._next = { value: value, opts: opts || {} };
    if (!this._drainP) {
      this._drainP = (async function () {
        while (self._next) {
          var job = self._next;
          self._next = null;
          self._busy = true;
          try { await self._transition(job.value, job.opts); } catch (e) {}
        }
        self._busy = false;
        self._drainP = null;
      })();
    }
    return this._drainP;
  };

  /* Mode sugar */
  Board.prototype.cascade  = function (v, o) { return this.set(v, Object.assign({}, o, { mode: "cascade" })); };
  Board.prototype.flywheel = function (v, o) { return this.set(v, Object.assign({}, o, { mode: "flywheel" })); };
  Board.prototype.single   = function (v, o) { return this.set(v, Object.assign({}, o, { mode: "single" })); };
  /* Full-revolution refresh back to the current value (the station "exercise sweep") */
  Board.prototype.sweep = function (o) { return this.set(this.value, Object.assign({ rev: true, force: true }, o)); };
  /* Attention-grabbing arrival: full revolution into the target, flywheel by default */
  Board.prototype.intro = function (v, o) {
    return this.set(v == null ? this.value : v, Object.assign({ rev: true, force: true, mode: "flywheel" }, o));
  };
  /* Instant, unanimated set — the accessibility/teleport escape hatch */
  Board.prototype.snap = function (v) { return this.set(v, { instant: true }); };

  Board.prototype.listen = function (target, event, map) {
    var self = this;
    function h(e) {
      var v = map ? map(e) : (e && e.detail);
      if (v != null) { self.set(v); }
    }
    target.addEventListener(event, h);
    var off = function () { target.removeEventListener(event, h); };
    this._offs.push(off);
    return off;
  };

  Board.prototype.destroy = function () {
    this._offs.forEach(function (off) { off(); });
    this._offs.length = 0;
    this._next = null;
    try {
      this.el.getAnimations({ subtree: true }).forEach(function (a) { try { a.cancel(); } catch (e) {} });
    } catch (e) {}
    if (this._row.parentNode) { this._row.parentNode.removeChild(this._row); }
    this.el.classList.remove("clatterwerk", "clatterwerk--3d", "clatterwerk--flat");
    this._cells.length = 0;
  };

  Object.defineProperty(Board.prototype, "value", {
    get: function () {
      var s = this._cells.map(function (c) { return c.cur; }).join("");
      var b = this._blank;
      if (this.opts.align === "right") { while (s.charAt(0) === b) { s = s.slice(1); } }
      else { while (s.charAt(s.length - 1) === b) { s = s.slice(0, -1); } }
      return s;
    }
  });

  Object.defineProperty(Board.prototype, "animating", {
    get: function () { return this._busy; }
  });

  /* ------------------------------------------------------------------ Group */
  // A group is several boards in separate places that act as one machine:
  // one call (or one trigger event) updates them all together.

  function Group(boards) {
    this.boards = (boards || []).slice();
    this._offs = [];
  }

  Group.prototype.add = function (board) { this.boards.push(board); return this; };

  ["set", "cascade", "flywheel", "single", "snap", "intro"].forEach(function (m) {
    Group.prototype[m] = function (values, opts) {
      var arr = Array.isArray(values);
      return Promise.all(this.boards.map(function (b, i) {
        var v = arr ? values[i] : values;
        if (v == null) { return m === "intro" ? b.intro(null, opts) : Promise.resolve(); }
        return b[m](v, opts);
      }));
    };
  });

  Group.prototype.sweep = function (opts) {
    return Promise.all(this.boards.map(function (b) { return b.sweep(opts); }));
  };

  Group.prototype.listen = function (target, event, map, opts) {
    var self = this;
    function h(e) {
      var v = map ? map(e) : (e && e.detail);
      if (v != null) { self.set(v, opts); }
    }
    target.addEventListener(event, h);
    var off = function () { target.removeEventListener(event, h); };
    this._offs.push(off);
    return off;
  };

  Group.prototype.destroy = function (destroyBoards) {
    this._offs.forEach(function (off) { off(); });
    this._offs.length = 0;
    if (destroyBoards) { this.boards.forEach(function (b) { b.destroy(); }); }
    this.boards.length = 0;
  };

  /* ------------------------------------------------------------ Declarative */
  // <span data-clatterwerk="1589" data-flap-mode="cascade" data-flap-group="stats"></span>

  function mount(root) {
    root = root == null ? document
      : (typeof root === "string" ? document.querySelector(root) : root);
    var boards = [], groups = {};
    if (!root) { return { boards: boards, groups: groups }; }
    var nodes = root.querySelectorAll("[data-clatterwerk]");
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], d = n.dataset, o = { value: d.clatterwerk || "" };
      if (d.flapMode)  { o.mode = d.flapMode; }
      if (d.flapChars) { o.chars = d.flapChars; }
      if (d.flapWidth) { o.width = parseInt(d.flapWidth, 10) || 0; }
      if (d.flapAlign) { o.align = d.flapAlign; }
      if (d.flapSpeed) { o.speed = parseFloat(d.flapSpeed) || 1; }
      if (d.flapTime)  { o.flipTime = parseFloat(d.flapTime) || 0; }
      if (d.flap3d != null) { o.threeD = d.flap3d !== "false"; }
      var b = new Board(n, o);
      boards.push(b);
      if (d.flapGroup) {
        if (!groups[d.flapGroup]) { groups[d.flapGroup] = new Group([]); }
        groups[d.flapGroup].add(b);
      }
    }
    return { boards: boards, groups: groups };
  }

  /* ------------------------------------------------------------------ API */

  return {
    version: "1.0.0",
    create: function (el, opts) { return new Board(el, opts); },
    group: function (boards) { return new Group(boards); },
    mount: mount,
    Board: Board,
    Group: Group,
    DRUM_NUMERIC: " 0123456789.",
    DRUM_ALPHANUMERIC: " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,-:!?",
    reducedMotion: RM,
    lowEnd: LOWEND
  };
}));
