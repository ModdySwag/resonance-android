/* Resonance Studio — FOCUS SCENES.
 * Licensed GPL-2.0-or-later (see NOTICE.txt).
 *
 * Eight scenes for the focus view, each owning a DIFFERENT geometry. The
 * ambient presets in vizpresets.js are a cartesian product of one composition
 * retinted; these are eight compositions. The contract is deliberately close
 * to vizmodes.js so viz.js can drive either:
 *
 *   create(id, seed) -> { id, reset(F), step(F), draw(F) }
 *
 * A scene draws THREE layers into the panel canvas, in this order:
 *   far   the generated plate, cover-fit, under a slow drift + parallax
 *   mid   a locally blurred copy of the same plate (a real depth plane, at a
 *         different zoom and a faster, opposite drift) + the scene's wash
 *   near  the anchor and accents, fully procedural, driven by the session
 *
 * Rules the eight obey (DESIGN-FOCUS-VIEW.md): one anchor per scene; motion
 * paced to a 4 s in / 6 s out breath (0.1 Hz), so a paused session still
 * breathes — beat events only tint or push, they never add objects; detail at
 * the edges, the middle stays calm; no cuts and no strobes (a scene dissolves
 * in over 1.2 s, luminance moves one small step per breath, never per beat).
 *
 * The near layer carries the picture. The plates are deliberately low-contrast,
 * so a first pass whose geometry lived at 5 % alpha read as "the same dark fog,
 * eight times"; every scene now draws its own structure at full contrast and
 * uses the plate as air, not as the subject.
 *
 * Reduced motion: the scene draws its shipped still instead of the live
 * layers, and a scene change is one 1.2 s cross-dissolve between stills.
 *
 * Performance follows vizmodes.js: no shadowBlur, no ctx.filter, no
 * per-frame gradient creation (every gradient is a cached sprite), no
 * full-panel putImageData, sparse per-frame allocation.
 */
(function () {
  "use strict";

  var TAU = Math.PI * 2;
  var TILE = 0.03;                         /* far-layer drift, radians/s      */

  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mod1(x) { x = x % 1; return x < 0 ? x + 1 : x; }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function mixc(a, b, t) {
    return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))];
  }

  /* ==================================================================== *
   * cached sprites — the only gradients this module ever builds
   * ==================================================================== */

  var SPRITES = {};

  function canvasOf(w, h) {
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function glowSprite(col, hard) {
    var key = "g" + col.join(",") + "|" + (hard ? 1 : 0);
    if (SPRITES[key]) return SPRITES[key];
    var S = 64, c = canvasOf(S, S), x = c.getContext("2d");
    var g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, rgba(col, 1));
    g.addColorStop(hard ? 0.42 : 0.14, rgba(col, hard ? 0.72 : 0.42));
    g.addColorStop(hard ? 0.68 : 0.5, rgba(col, hard ? 0.22 : 0.12));
    g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    SPRITES[key] = c;
    return c;
  }

  /* one light shaft: a bright core down the middle, feathered at the sides,
     fading out along its length */
  function shaftSprite(col) {
    var key = "s" + col.join(",");
    if (SPRITES[key]) return SPRITES[key];
    var W = 128, H = 512, c = canvasOf(W, H), x = c.getContext("2d");
    var g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(col, 0.95));
    g.addColorStop(0.35, rgba(col, 0.42));
    g.addColorStop(0.75, rgba(col, 0.12));
    g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    var m = x.createLinearGradient(0, 0, W, 0);
    m.addColorStop(0, "rgba(0,0,0,0)");
    m.addColorStop(0.30, "rgba(0,0,0,0.55)");
    m.addColorStop(0.5, "rgba(0,0,0,1)");
    m.addColorStop(0.70, "rgba(0,0,0,0.55)");
    m.addColorStop(1, "rgba(0,0,0,0)");
    x.globalCompositeOperation = "destination-in";
    x.fillStyle = m;
    x.fillRect(0, 0, W, H);
    SPRITES[key] = c;
    return c;
  }

  /* a water lens: bright rim, dark body, a highlight up and to the left */
  function lensSprite(col) {
    var key = "l" + col.join(",");
    if (SPRITES[key]) return SPRITES[key];
    var S = 96, c = canvasOf(S, S), x = c.getContext("2d"), r = S / 2;
    var g = x.createRadialGradient(r, r, r * 0.1, r, r, r);
    g.addColorStop(0, rgba(col, 0.06));
    g.addColorStop(0.60, rgba(col, 0.14));
    g.addColorStop(0.84, rgba(col, 0.85));
    g.addColorStop(0.93, rgba(col, 0.30));
    g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g;
    x.beginPath(); x.arc(r, r, r, 0, TAU); x.fill();
    x.globalAlpha = 0.9;
    x.drawImage(glowSprite([255, 255, 255], true), r * 0.22, r * 0.18, r * 0.40, r * 0.40);
    x.globalAlpha = 1;
    SPRITES[key] = c;
    return c;
  }

  /* a curtain column: vertical fade, feathered at both long edges */
  function columnSprite(col) {
    var key = "c" + col.join(",");
    if (SPRITES[key]) return SPRITES[key];
    var W = 32, H = 128, c = canvasOf(W, H), x = c.getContext("2d");
    var g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(col, 0));
    g.addColorStop(0.12, rgba(col, 0.85));
    g.addColorStop(0.55, rgba(col, 0.42));
    g.addColorStop(0.88, rgba(col, 0.10));
    g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    var m = x.createLinearGradient(0, 0, W, 0);
    m.addColorStop(0, "rgba(0,0,0,0)");
    m.addColorStop(0.45, "rgba(0,0,0,1)");
    m.addColorStop(0.55, "rgba(0,0,0,1)");
    m.addColorStop(1, "rgba(0,0,0,0)");
    x.globalCompositeOperation = "destination-in";
    x.fillStyle = m;
    x.fillRect(0, 0, W, H);
    SPRITES[key] = c;
    return c;
  }

  /* a falling drop's trail: bright at the drop, gone at the tail */
  function trailSprite(col) {
    var key = "t" + col.join(",");
    if (SPRITES[key]) return SPRITES[key];
    var W = 8, H = 128, c = canvasOf(W, H), x = c.getContext("2d");
    var g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(col, 0));
    g.addColorStop(0.82, rgba(col, 0.55));
    g.addColorStop(1, rgba(col, 1));
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    SPRITES[key] = c;
    return c;
  }

  /* a horizontal soft band, for aurora glow and plankton wave fronts */
  function bandSprite(col) {
    var key = "h" + col.join(",");
    if (SPRITES[key]) return SPRITES[key];
    var W = 8, H = 128, c = canvasOf(W, H), x = c.getContext("2d");
    var g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(col, 0));
    g.addColorStop(0.45, rgba(col, 0.55));
    g.addColorStop(0.55, rgba(col, 0.55));
    g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    SPRITES[key] = c;
    return c;
  }

  /* corner darkening, cached per box — grounds the frame without a new gradient
     every draw */
  var VIGN = {};
  function vignette(ctx, W, H, a) {
    var key = Math.round(W) + "x" + Math.round(H);
    var c = VIGN[key];
    if (!c) {
      c = canvasOf(W, H);
      var x = c.getContext("2d");
      var g = x.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.18, W / 2, H * 0.46, Math.max(W, H) * 0.72);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.62, "rgba(0,0,0,0.18)");
      g.addColorStop(1, "rgba(0,0,0,0.72)");
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
      VIGN[key] = c;
    }
    ctx.globalAlpha = a;
    ctx.drawImage(c, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  /* ==================================================================== *
   * plates: one image per scene, decoded once, shared by every panel
   * ==================================================================== */

  var PLATES = {};

  function plate(src) {
    var p = PLATES[src];
    if (p) return p;
    p = { img: null, blur: null, ready: false, src: src };
    if (typeof Image !== "undefined") {
      var im = new Image();
      im.decoding = "async";
      im.onload = function () {
        p.ready = true;
        try {
          var bw = 72, bh = Math.max(1, Math.round(bw * im.naturalHeight / Math.max(1, im.naturalWidth)));
          var b = canvasOf(bw, bh), bx = b.getContext("2d");
          bx.drawImage(im, 0, 0, bw, bh);
          p.blur = b;
        } catch (e) { p.blur = null; }
      };
      im.src = src;
      p.img = im;
    }
    PLATES[src] = p;
    return p;
  }

  /* cover-fit draw with zoom and a pixel offset */
  function drawPlate(ctx, p, W, H, zoom, ox, oy, alpha) {
    var im = p && p.img;
    if (!im || !p.ready || !im.naturalWidth) return false;
    var iw = im.naturalWidth, ih = im.naturalHeight;
    var s = Math.max(W / iw, H / ih) * zoom;
    var dw = iw * s, dh = ih * s;
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, (W - dw) / 2 + ox, (H - dh) / 2 + oy, dw, dh);
    ctx.globalAlpha = 1;
    return true;
  }

  function drawBlur(ctx, p, W, H, zoom, ox, oy, alpha) {
    if (!p || !p.blur) return false;
    var s = Math.max(W / p.blur.width, H / p.blur.height) * zoom;
    var dw = p.blur.width * s, dh = p.blur.height * s;
    ctx.globalAlpha = alpha;
    ctx.drawImage(p.blur, (W - dw) / 2 + ox, (H - dh) / 2 + oy, dw, dh);
    ctx.globalAlpha = 1;
    return true;
  }

  /* a panel-sized wash, cached per scene colour and box */
  var WASHES = {};
  function wash(ctx, W, H, top, bottom) {
    var key = "w" + top.join(",") + "|" + bottom.join(",") + "|" + Math.round(W) + "x" + Math.round(H);
    var c = WASHES[key];
    if (!c) {
      c = canvasOf(W, H);
      var x = c.getContext("2d");
      var g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, rgba(top, 1));
      g.addColorStop(1, rgba(bottom, 1));
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
      WASHES[key] = c;
    }
    ctx.drawImage(c, 0, 0, W, H);
  }

  /* ==================================================================== *
   * the shared scene frame
   * ==================================================================== */

  /* breath: 4 s in, 6 s out. 0 at the bottom of the exhale, 1 at the top. */
  function breathAt(t) {
    var p = mod1(t / 10);
    if (p < 0.4) { var a = p / 0.4; return 0.5 - 0.5 * Math.cos(Math.PI * a); }
    var b = (p - 0.4) / 0.6;
    return 0.5 + 0.5 * Math.cos(Math.PI * b);
  }

  function gateOf(F) {
    var vs = (F && F.voices) || [];
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      if (v.kind === "iso" || v.kind === "isoalt") return v.gate ? v.gate.pulse : 0;
    }
    return null;
  }

  function Drive(F, t) {
    var f = (F && F.feat) || {};
    var b = f.bandsAtt || {};
    var pr = (F && F.prefs) || {};
    var inten = pr.intensity === undefined ? 0.7 : pr.intensity;
    var calm = pr.calm === undefined ? 1 : pr.calm;
    return {
      t: t,
      breath: breathAt(t),
      level: f.rmsAtt || 0,
      sub: b.sub || 0, low: b.low || 0, carrier: b.carrier || 0, mid: b.mid || 0, air: b.air || 0,
      centroid: f.centroidSlow || 0,
      gate: gateOf(F),
      playing: !!(F && F.playing),
      gain: 0.62 + 0.55 * inten * (1 - 0.18 * (1 - calm))
    };
  }

  var PAR = { x: 0, y: 0, tx: 0, ty: 0 };

  function Scene(entry, seed) {
    this.entry = entry;
    this.id = entry.id;
    this.seed = seed >>> 0;
    this.t = 0;
    this.fade = 0;
    this.plate = plate(entry.plate);
    this.st = entry.build(mulberry32(this.seed || 1));
    this.prev = null;
  }

  Scene.prototype.reset = function () {
    this.t = 0;
    this.fade = 0;
    this.st = this.entry.build(mulberry32(this.seed || 1));
  };

  Scene.prototype.step = function (F) {
    var dt = (F && F.dt) || 1 / 60;
    this.t += dt;
    this.fade = Math.min(1, this.fade + dt / 1.2);      /* dissolve in, 1.2 s */
    PAR.x += (PAR.tx - PAR.x) * Math.min(1, dt * 1.6);
    PAR.y += (PAR.ty - PAR.y) * Math.min(1, dt * 1.6);
    this.st.step(dt, this.t, F);
  };

  Scene.prototype.draw = function (F) {
    var ctx = F.ctx, W = F.W, H = F.H, e = this.entry;
    if (reduced()) { this.drawStill(ctx, W, H); return; }
    var D = Drive(F, this.t);
    D.px = PAR.x; D.py = PAR.y;
    ctx.save();
    ctx.globalAlpha = this.fade;
    wash(ctx, W, H, e.pal.top, e.pal.bottom);
    this.st.draw(this.st, ctx, W, H, D, this);
    vignette(ctx, W, H, 0.85);
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  /* reduced motion: the shipped still, and one 1.2 s cross-dissolve between
     stills when the scene changes (no drift, no particles, no timers) */
  Scene.prototype.drawStill = function (ctx, W, H) {
    var e = this.entry, fade = this.fade;
    ctx.save();
    ctx.globalAlpha = 1;
    if (this.prev && fade < 1) {
      ctx.globalAlpha = 1 - fade;
      drawStillImage(ctx, this.prev, W, H);
      ctx.globalAlpha = fade;
    }
    drawStillImage(ctx, e.still, W, H);
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  function drawStillImage(ctx, src, W, H) {
    var p = plate(src);
    if (p && p.ready) { drawPlate(ctx, p, W, H, 1.02, 0, 0, 1); return; }
    ctx.fillStyle = "#050607";
    ctx.fillRect(0, 0, W, H);
  }

  function reduced() {
    return !!(typeof window !== "undefined" && window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /* ------------------------------------------------------------------ *
   * 1. Cathedral of Light — a tall aperture, a fan of shafts, dust
   * ------------------------------------------------------------------ */
  function buildCathedral(r) {
    var rays = [], motes = [], i;
    for (i = 0; i < 6; i++) {
      rays.push({
        a: (i - 2.5) * 0.155 + (r() - 0.5) * 0.03,
        w: 0.30 + r() * 0.55, ph: r() * TAU, sp: 0.035 + r() * 0.03,
        br: 0.55 + r() * 0.45
      });
    }
    for (i = 0; i < 96; i++) {
      motes.push({ x: r(), y: r(), z: 0.25 + r() * 0.95, ph: r() * TAU, sp: 0.01 + r() * 0.03, dr: 0.4 + r() * 0.6 });
    }
    return {
      step: function (dt, t, F) {
        var d = Drive(F, t);
        for (var k = 0; k < rays.length; k++) {
          var ry = rays[k];
          ry.a = (k - 2.5) * 0.15 + Math.sin(t * 0.04 + ry.ph) * 0.045 + (d.sub - 0.5) * 0.03;
          ry.w = 0.26 + 0.30 * (0.5 + 0.5 * Math.sin(t * 0.045 + ry.ph)) + d.sub * 0.5;
        }
        for (var m = 0; m < motes.length; m++) {
          var mo = motes[m];
          mo.y -= dt * mo.sp * (0.55 + 0.45 * d.breath);
          mo.x += Math.sin(t * 0.1 + mo.ph) * dt * 0.006 * mo.dr;
          if (mo.y < -0.06) { mo.y = 1.05; mo.x = 0.5 + (r() - 0.5) * 1.4; }
        }
      },
      draw: function (st, ctx, W, H, D, self) {
        var e = self.entry.pal;
        var g = 0.75 + 0.5 * D.gain;
        drawPlate(ctx, self.plate, W, H, 1.10, Math.sin(self.t * TILE) * W * 0.012 + D.px * 10,
          Math.cos(self.t * TILE * 0.8) * H * 0.010 + D.py * 8, 0.62);
        drawBlur(ctx, self.plate, W, H, 1.30, Math.sin(self.t * TILE * 1.7) * -W * 0.02, 0, 0.30);

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        /* the rose window: the scene's anchor and its architectural cue */
        var ax = W * 0.5 + Math.sin(self.t * 0.03) * W * 0.008, ay = H * 0.16;
        var wr = W * (0.15 + 0.012 * D.breath);
        ctx.globalAlpha = clamp(0.30 * g, 0, 1);
        ctx.drawImage(glowSprite(e.acc, false), ax - wr * 2.1, ay - wr * 2.1, wr * 4.2, wr * 4.2);
        ctx.globalAlpha = clamp(0.55 * g, 0, 1);
        ctx.drawImage(glowSprite(e.ink, true), ax - wr, ay - wr, wr * 2, wr * 2);
        /* the window's tracery: twelve spokes and two rims, drawn faintly */
        ctx.globalAlpha = clamp((0.30 + 0.12 * D.breath) * g, 0, 1);
        ctx.strokeStyle = rgba(e.ink, 1);
        ctx.lineWidth = Math.max(1, W * 0.004);
        ctx.beginPath();
        for (var sp = 0; sp < 12; sp++) {
          var sa = sp / 12 * TAU + self.t * 0.003;
          ctx.moveTo(ax + Math.cos(sa) * wr * 0.22, ay + Math.sin(sa) * wr * 0.22);
          ctx.lineTo(ax + Math.cos(sa) * wr * 0.98, ay + Math.sin(sa) * wr * 0.98);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ax, ay, wr * 0.98, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ax, ay, wr * 0.40, 0, TAU);
        ctx.stroke();

        var sh = shaftSprite(e.acc), shi = shaftSprite(e.ink);
        for (var k = 0; k < rays.length; k++) {
          var ry = rays[k];
          var rw = W * 0.72 * ry.w;
          ctx.save();
          ctx.translate(ax + Math.sin(ry.a) * W * 0.3, ay + H * 0.02);
          ctx.rotate(ry.a);
          ctx.globalAlpha = clamp((0.24 + 0.12 * ry.br) * (0.55 + 0.45 * D.breath) * g, 0, 1);
          ctx.drawImage(k % 2 ? shi : sh, -rw / 2, 0, rw, H * 1.25);
          ctx.restore();
        }
        /* the nave floor: a dark band that gives the light something to land on */
        ctx.globalAlpha = 0.55;
        ctx.drawImage(bandSprite([0, 0, 0]), 0, H * 0.82, W, H * 0.30);
        var mote = glowSprite(mixc(e.ink, e.acc, 0.25), true);
        for (var m = 0; m < motes.length; m++) {
          var mo = motes[m];
          var sz = 1.8 + mo.z * 3.6;
          ctx.globalAlpha = clamp((0.22 + 0.5 * mo.z) * (0.5 + 0.5 * D.breath) * g, 0, 1);
          ctx.drawImage(mote, mo.x * W - sz / 2, mo.y * H - sz / 2, sz, sz);
        }
        ctx.restore();
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * 2. Deep Field — parallax stars, one guiding star
   * ------------------------------------------------------------------ */
  function buildDeepField(r) {
    var layers = [], i, L;
    var counts = [150, 90, 46];
    for (L = 0; L < 3; L++) {
      var arr = [];
      for (i = 0; i < counts[L]; i++) {
        arr.push({ x: r(), y: r(), z: 0.2 + r() * 0.8, ph: r() * TAU, tw: 0.3 + r() * 0.7, sz: 0.4 + r() * 1.6 });
      }
      layers.push(arr);
    }
    var dust = [];
    for (i = 0; i < 140; i++) dust.push({ x: r(), y: r(), sz: 4 + r() * 22, a: 0.02 + r() * 0.05, ph: r() * TAU });
    var guide = { x: 0.66, y: 0.32 };
    return {
      step: function (dt, t) {
        guide.x = 0.66 + Math.sin(t * 0.021) * 0.02;
        guide.y = 0.32 + Math.cos(t * 0.017) * 0.015;
      },
      draw: function (st, ctx, W, H, D, self) {
        var e = self.entry.pal;
        var g = 0.75 + 0.5 * D.gain;
        drawPlate(ctx, self.plate, W, H, 1.06, Math.sin(self.t * TILE) * W * 0.010 + D.px * 6,
          Math.cos(self.t * TILE * 0.9) * H * 0.008 + D.py * 5, 0.72);
        drawBlur(ctx, self.plate, W, H, 1.25, Math.sin(self.t * 0.02) * -W * 0.015, 0, 0.32);

        /* the galaxy band: a diagonal strip of dust, so the field is not empty */
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = clamp(0.20 * g, 0, 1);
        ctx.translate(W * 0.5, H * 0.52);
        ctx.rotate(-0.62);
        ctx.drawImage(bandSprite(mixc(e.alt, e.ink, 0.25)), -W * 0.85, -H * 0.10, W * 1.7, H * 0.20);
        ctx.drawImage(bandSprite(mixc(e.acc, e.alt, 0.6)), -W * 0.85, -H * 0.045, W * 1.7, H * 0.09);
        ctx.restore();
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        var neb = glowSprite(mixc(e.acc, e.alt, 0.5), false);
        for (var d = 0; d < dust.length; d++) {
          var d0 = dust[d];
          var ds = W * d0.sz / 60;
          ctx.globalAlpha = clamp((d0.a + 0.02) * (0.6 + 0.4 * Math.sin(self.t * 0.05 + d0.ph)) * g, 0, 1);
          ctx.drawImage(neb, d0.x * W - ds, d0.y * H - ds, ds * 2, ds * 2);
        }
        ctx.restore();

        var depth = 0.35 + (D.centroid || 0) * 0.4;
        ctx.save();
        for (var L2 = 0; L2 < layers.length; L2++) {
          var arr = layers[L2], sp = 0.0022 * (L2 + 1);
          var par = (L2 === 0 ? 0.35 : (L2 === 1 ? 0.7 : 1.2)) * depth;
          for (var i2 = 0; i2 < arr.length; i2++) {
            var s = arr[i2];
            var x = mod1(s.x + self.t * sp * 0.06) * W + D.px * par * 12;
            var y = s.y * H + D.py * par * 9 + Math.sin(self.t * 0.05 + s.ph) * 1.5;
            var tw = 0.55 + 0.45 * Math.sin(self.t * (0.3 + s.tw) + s.ph);
            ctx.globalAlpha = clamp((0.18 + 0.72 * s.z) * tw * (0.75 + 0.25 * g), 0, 1);
            ctx.fillStyle = rgba(mixc(e.ink, e.acc, s.z), 1);
            var sz = s.sz * (L2 + 1) * 0.7;
            ctx.fillRect(x, y, sz, sz);
          }
        }
        ctx.restore();

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        var gx = guide.x * W + D.px * 14, gy = guide.y * H + D.py * 10;
        var pulse = 0.6 + 0.4 * D.breath;
        var halo = W * (0.46 + 0.06 * D.breath);
        ctx.globalAlpha = clamp(0.22 * pulse * g, 0, 1);
        ctx.drawImage(glowSprite(e.acc, false), gx - halo / 2, gy - halo / 2, halo, halo);
        ctx.globalAlpha = clamp(0.35 * pulse * g, 0, 1);
        var halo2 = W * 0.16;
        ctx.drawImage(glowSprite(e.ink, false), gx - halo2 / 2, gy - halo2 / 2, halo2, halo2);
        ctx.globalAlpha = 0.95;
        var core = W * 0.020;
        ctx.drawImage(glowSprite([255, 255, 255], true), gx - core / 2, gy - core / 2, core, core);
        /* the guiding star's cross: geometry, not a sparkle */
        var arm = W * (0.105 + 0.02 * pulse);
        ctx.globalAlpha = clamp(0.55 * pulse * g, 0, 1);
        ctx.fillStyle = rgba(e.ink, 1);
        ctx.fillRect(gx - arm, gy - 0.7, arm * 2, 1.4);
        ctx.fillRect(gx - 0.7, gy - arm * 0.62, 1.4, arm * 1.24);
        ctx.globalAlpha = clamp(0.18 * pulse * g, 0, 1);
        ctx.fillRect(gx - arm * 1.5, gy - 2.2, arm * 3, 4.4);
        ctx.fillRect(gx - 2.2, gy - arm, 4.4, arm * 2);
        ctx.restore();
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * 3. Ink Bloom — plumes opening at the breath turns, dissolving over 20 s
   * ------------------------------------------------------------------ */
  function buildInk(r) {
    var plumes = [], i, j;
    function make(now) {
      var arms = [];
      var x = 0.16 + r() * 0.68;
      for (j = 0; j < 18; j++) {
        arms.push({ da: (r() - 0.5) * 1.9, dr: 0.04 + r() * 0.24, ph: r() * TAU, sz: 0.07 + r() * 0.16, sp: 0.25 + r() * 0.7 });
      }
      return { x: x, y: 1.04, born: now, life: 17 + r() * 9, arms: arms, br: 0.6 + r() * 0.4 };
    }
    for (i = 0; i < 4; i++) plumes.push(make(r() * 12 - 15));
    return {
      step: function (dt, t, F) {
        var d = Drive(F, t);
        var top = d.breath > 0.985;
        if (top && !this._top && plumes.length < 6) plumes.push(make(t));
        this._top = top;
        for (var k = 0; k < plumes.length; k++) {
          var p = plumes[k];
          if (t - p.born > p.life) { plumes[k] = make(t); continue; }
          p.y = 1.04 - (t - p.born) * 0.014;
        }
      },
      draw: function (st, ctx, W, H, D, self) {
        var e = self.entry.pal;
        var g = 0.75 + 0.5 * D.gain;
        drawPlate(ctx, self.plate, W, H, 1.08, Math.sin(self.t * TILE) * W * 0.01, Math.cos(self.t * TILE) * H * 0.008, 0.7);
        drawBlur(ctx, self.plate, W, H, 1.35, Math.sin(self.t * 0.03) * -W * 0.02, 0, 0.34);

        ctx.save();
        var soot = glowSprite(mixc(e.alt, [0, 0, 0], 0.55), false);
        var tint1 = mixc(e.ink, e.acc, 0.3);
        for (var k = 0; k < plumes.length; k++) {
          var p = plumes[k], age = (self.t - p.born) / p.life;
          var life = clamp(1 - age, 0, 1);
          var open = Math.pow(clamp((self.t - p.born) / 5, 0, 1), 0.65);
          /* the body: dark ink, source-over, so it occludes the lit water */
          ctx.globalCompositeOperation = "source-over";
          for (var a = 0; a < p.arms.length; a++) {
            var arm = p.arms[a];
            var wob = Math.sin(self.t * arm.sp + arm.ph) * 0.05;
            var rw = W * (arm.sz * (0.7 + open * 2.0) * (0.55 + 0.45 * D.breath));
            var x = p.x * W + Math.sin(arm.da + wob) * W * arm.dr * (0.6 + open);
            var y = p.y * H - W * arm.dr * open * 1.1;
            ctx.globalAlpha = clamp(0.30 * life * p.br * (0.6 + 0.4 * D.breath), 0, 1);
            ctx.drawImage(soot, x - rw / 2, y - rw / 2, rw, rw);
          }
          ctx.globalCompositeOperation = "lighter";
          /* the plume's front: an arc, so the ink has a boundary, not a smudge */
          ctx.globalAlpha = clamp(0.30 * life * p.br * g, 0, 1);
          ctx.strokeStyle = rgba(mixc(e.ink, e.acc, 0.35), 1);
          ctx.lineWidth = Math.max(1.2, W * 0.006);
          ctx.beginPath();
          ctx.arc(p.x * W, p.y * H - W * 0.10 * open, W * (0.14 + 0.10 * open), Math.PI * 1.08, Math.PI * 1.92);
          ctx.stroke();
          /* threads at the plume's edge: the ink's own striation */
          ctx.globalAlpha = clamp(0.10 * life * p.br * g, 0, 1);
          ctx.strokeStyle = rgba(mixc(e.ink, e.acc, 0.45), 1);
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (var q = 0; q < 5; q++) {
            var qa = q / 5 * TAU + p.x * 9;
            var x1 = p.x * W + Math.cos(qa) * W * 0.10 * open;
            var y1 = p.y * H - W * 0.05 * open;
            ctx.moveTo(x1, y1);
            ctx.quadraticCurveTo(x1 + Math.cos(qa) * W * 0.06, y1 - H * 0.05 * open, x1 + Math.cos(qa) * W * 0.10, y1 - H * 0.11 * open);
          }
          ctx.stroke();
        }
        ctx.globalCompositeOperation = "lighter";
        /* the surface: light entering the water, the frame's top anchor */
        var surf = W * 1.5;
        ctx.globalAlpha = clamp((0.24 + 0.08 * D.breath) * g, 0, 1);
        ctx.drawImage(glowSprite(e.ink, false), W * 0.5 - surf / 2, -surf * 0.56, surf, surf);
        ctx.globalAlpha = clamp(0.10 * g, 0, 1);
        ctx.drawImage(bandSprite(e.acc), 0, H * 0.02, W, H * 0.06);
        ctx.restore();
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * 4. Aurora Veil — three curtains, built from their own vertical rays
   * ------------------------------------------------------------------ */
  function buildAurora(r) {
    var curtains = [], i, j;
    for (i = 0; i < 3; i++) {
      var cols = [];
      for (j = 0; j < 54; j++) {
        cols.push({ u: j / 53, w: 0.5 + r() * 0.5, a: 0.45 + r() * 0.55, ph: r() * TAU, lift: r() * 0.06 });
      }
      curtains.push({
        y: 0.22 + i * 0.15, amp: 0.055 + r() * 0.05, freq: 0.55 + r() * 0.55,
        sp: 0.025 + r() * 0.03, ph: r() * TAU, depth: 0.5 + i * 0.35,
        tall: 0.30 + r() * 0.16, cols: cols,
        hue: i === 0 ? "green" : (i === 1 ? "teal" : "violet")
      });
    }
    return {
      step: function (dt, t, F) {
        for (var k = 0; k < curtains.length; k++) curtains[k].ph += dt * curtains[k].sp;
        var d = Drive(F, t);
        this._thick = 0.55 + 0.45 * d.breath + d.mid * 0.6;
      },
      draw: function (st, ctx, W, H, D, self) {
        var e = self.entry.pal;
        var g = 0.75 + 0.5 * D.gain;
        drawPlate(ctx, self.plate, W, H, 1.06, Math.sin(self.t * TILE) * W * 0.008, 0, 0.62);
        drawBlur(ctx, self.plate, W, H, 1.28, 0, Math.sin(self.t * 0.025) * -H * 0.012, 0.26);

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (var k = 0; k < curtains.length; k++) {
          var cu = curtains[k];
          var col = cu.hue === "green" ? e.green : (cu.hue === "teal" ? e.cool : e.violet);
          var tall = H * cu.tall * (0.7 + 0.3 * (st._thick || 1)) * (0.7 + 0.3 * D.breath);
          /* the glow body behind the rays */
          ctx.globalAlpha = clamp(0.16 * cu.depth * g, 0, 1);
          ctx.drawImage(bandSprite(col), -W * 0.02, cu.y * H - tall * 0.05, W * 1.04, tall * 1.05);
          var spr = columnSprite(col);
          for (var j = 0; j < cu.cols.length; j++) {
            var c0 = cu.cols[j];
            var x = c0.u * W;
            var wob = Math.sin(c0.u * cu.freq * TAU + cu.ph) * cu.amp;
            var top = (cu.y + wob + c0.lift * Math.sin(c0.ph)) * H;
            var len = tall * (0.55 + 0.55 * c0.w) * (0.8 + 0.2 * Math.sin(self.t * 0.7 + c0.ph));
            var cw = W * (0.006 + 0.010 * c0.w);
            ctx.globalAlpha = clamp((0.16 + 0.22 * c0.a) * cu.depth * (0.7 + 0.3 * D.breath) * g, 0, 1);
            ctx.drawImage(spr, x - cw / 2, top, cw, len);
          }
        }
        /* the horizon: the sky needs a floor or it reads as a texture */
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.62;
        ctx.drawImage(bandSprite([0, 0, 0]), 0, H * 0.80, W, H * 0.32);
        ctx.globalAlpha = clamp(0.20 * g, 0, 1);
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(bandSprite(e.violet), 0, H * 0.78, W, H * 0.10);
        ctx.restore();
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * 5. Ember Lattice — embers joining and breaking, count from the level
   * ------------------------------------------------------------------ */
  function buildEmber(r) {
    var nodes = [], sparks = [], i;
    for (i = 0; i < 24; i++) {
      nodes.push({ x: 0.08 + r() * 0.84, y: 0.10 + r() * 0.80, vx: (r() - 0.5) * 0.010, vy: (r() - 0.5) * 0.010, ph: r() * TAU, br: 0.4 + r() * 0.6 });
    }
    for (i = 0; i < 34; i++) sparks.push({ x: r(), y: r(), sp: 0.01 + r() * 0.03, ph: r() * TAU, br: 0.3 + r() * 0.7 });
    return {
      step: function (dt, t, F) {
        var d = Drive(F, t);
        this._count = clamp(10 + Math.round(d.level * 14 + d.low * 8), 8, 24);
        for (var k = 0; k < nodes.length; k++) {
          var n = nodes[k];
          n.x += n.vx * dt * (0.45 + 0.55 * d.breath);
          n.y += n.vy * dt * (0.45 + 0.55 * d.breath);
          if (n.x < 0.05 || n.x > 0.95) n.vx *= -1;
          if (n.y < 0.07 || n.y > 0.93) n.vy *= -1;
        }
        for (var s = 0; s < sparks.length; s++) {
          var sp = sparks[s];
          sp.y -= dt * sp.sp * (0.6 + 0.4 * d.breath);
          if (sp.y < -0.04) { sp.y = 1.04; sp.x = r(); }
        }
      },
      draw: function (st, ctx, W, H, D, self) {
        var e = self.entry.pal;
        var g = 0.75 + 0.5 * D.gain;
        drawPlate(ctx, self.plate, W, H, 1.12, Math.sin(self.t * TILE) * W * 0.012, Math.cos(self.t * TILE) * H * 0.01, 0.5);
        drawBlur(ctx, self.plate, W, H, 1.3, Math.sin(self.t * 0.04) * -W * 0.015, 0, 0.3);

        var n = st._count || 10, i, j;
        var px = [], py = [];
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        /* drifting sparks first, so the lattice reads on top */
        var spark = glowSprite(mixc(e.acc, e.ink, 0.35), false);
        for (i = 0; i < sparks.length; i++) {
          var sp = sparks[i];
          var ss = 1.2 + 2.2 * sp.br;
          ctx.globalAlpha = clamp((0.12 + 0.30 * sp.br) * g, 0, 1);
          ctx.drawImage(spark, sp.x * W - ss / 2, sp.y * H - ss / 2, ss, ss);
        }
        for (i = 0; i < n; i++) { px.push(nodes[i].x * W + D.px * 8); py.push(nodes[i].y * H + D.py * 6); }
        ctx.lineWidth = 1.1;
        for (i = 0; i < n; i++) {
          for (j = i + 1; j < n; j++) {
            var dx = px[j] - px[i], dy = py[j] - py[i];
            var d2 = dx * dx + dy * dy;
            var lim = W * 0.34;
            if (d2 > lim * lim) continue;
            var d3 = Math.sqrt(d2);
            var a = (1 - d3 / lim) * 0.52 * (0.5 + 0.5 * D.breath) * nodes[i].br * nodes[j].br * g;
            ctx.strokeStyle = rgba(e.acc, clamp(a, 0, 1));
            ctx.beginPath(); ctx.moveTo(px[i], py[i]); ctx.lineTo(px[j], py[j]); ctx.stroke();
          }
        }
        var sp1 = glowSprite(e.acc, true), spInk = glowSprite(e.ink, true);
        for (i = 0; i < n; i++) {
          var tw = 0.45 + 0.55 * Math.sin(self.t * (0.4 + nodes[i].br) + nodes[i].ph);
          var sz = (5 + 8 * nodes[i].br) * (0.85 + 0.3 * tw);
          ctx.globalAlpha = clamp((0.5 + 0.45 * tw) * g, 0, 1);
          ctx.drawImage(sp1, px[i] - sz / 2, py[i] - sz / 2, sz, sz);
          ctx.globalAlpha = clamp((0.5 + 0.4 * tw) * g, 0, 1);
          ctx.drawImage(spInk, px[i] - sz / 6, py[i] - sz / 6, sz / 3, sz / 3);
        }
        /* the anchor: one ember that holds the centre */
        var ax = W * 0.5, ay = H * 0.5;
        var asz = W * 0.30 * (0.92 + 0.08 * D.breath);
        ctx.globalAlpha = clamp((0.16 + 0.08 * D.breath) * g, 0, 1);
        ctx.drawImage(sp1, ax - asz / 2, ay - asz / 2, asz, asz);
        /* coals low in the frame, so the lattice sits over a fire, not a void */
        ctx.globalAlpha = clamp(0.22 * g, 0, 1);
        ctx.drawImage(sp1, W * 0.12, H * 0.86, W * 0.30, W * 0.30);
        ctx.drawImage(sp1, W * 0.62, H * 0.90, W * 0.26, W * 0.26);
        ctx.globalAlpha = 0.9;
        ctx.drawImage(spInk, ax - 4, ay - 4, 8, 8);
        ctx.restore();
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * 6. Rain on Glass — drops that gather, merge and slide
   * ------------------------------------------------------------------ */
  function buildRain(r) {
    var drops = [], i;
    function spawn(fromTop) {
      return {
        x: r(), y: fromTop ? -0.05 - r() * 0.4 : r() * 0.9,
        rr: 0.006 + r() * 0.016, slide: 0, ph: r() * TAU, tr: 0, big: r() < 0.18
      };
    }
    for (i = 0; i < 26; i++) drops.push(spawn(false));
    return {
      step: function (dt, t, F) {
        var d = Drive(F, t);
        var rate = 0.2 + d.air;
        for (var k = 0; k < drops.length; k++) {
          var dr = drops[k];
          dr.rr += dt * 0.0022 * (0.6 + rate);
          dr.tr += dt;
          if (dr.slide > 0) {
            dr.y += dt * dr.slide;
            dr.slide += dt * 0.10;
            if (dr.y > 1.06) { drops[k] = spawn(true); continue; }
          } else if (dr.rr > 0.012 + 0.012 * (0.5 + 0.5 * d.breath) || dr.tr > 5 + rate * 5) {
            dr.slide = 0.02;
          }
          for (var j = k + 1; j < drops.length; j++) {
            var o = drops[j];
            var dx = (o.x - dr.x), dy = (o.y - dr.y) * 1.7;
            var rr = dr.rr + o.rr;
            if (dx * dx + dy * dy < rr * rr * 0.5) {
              dr.rr = Math.min(0.036, Math.sqrt(dr.rr * dr.rr + o.rr * o.rr) * 1.3);
              drops[j] = spawn(true);
            }
          }
        }
      },
      draw: function (st, ctx, W, H, D, self) {
        var e = self.entry.pal;
        var g = 0.75 + 0.5 * D.gain;
        drawPlate(ctx, self.plate, W, H, 1.05, Math.sin(self.t * TILE) * W * 0.006, Math.cos(self.t * TILE * 0.7) * H * 0.006, 0.8);
        drawBlur(ctx, self.plate, W, H, 1.2, Math.sin(self.t * 0.02) * -W * 0.012, 0, 0.34);

        /* the far bokeh the window carries: three soft discs, out of focus */
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        var bok = glowSprite(e.acc, false);
        var xs = [0.16, 0.78, 0.60], ys = [0.22, 0.30, 0.70], bs = [0.30, 0.24, 0.18];
        for (var b = 0; b < 3; b++) {
          var bd = W * bs[b] * (0.96 + 0.04 * Math.sin(self.t * 0.2 + b));
          ctx.globalAlpha = clamp(0.13 * g, 0, 1);
          ctx.drawImage(bok, xs[b] * W - bd / 2, ys[b] * H - bd / 2, bd, bd);
        }
        ctx.restore();

        /* wet glass: fine vertical streaks and a low fog, so the pane is a pane */
        ctx.save();
        ctx.globalAlpha = clamp(0.10 * g, 0, 1);
        ctx.drawImage(bandSprite(e.alt), 0, H * 0.55, W, H * 0.5);
        ctx.globalAlpha = clamp(0.12 * g, 0, 1);
        ctx.strokeStyle = rgba(e.ink, 1);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var gs = 0; gs < 26; gs++) {
          var gx = ((gs * 37) % 100) / 100 * W;
          var gy = ((gs * 61) % 100) / 100 * H;
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx + 1.5, gy + H * (0.05 + (gs % 5) * 0.02));
        }
        ctx.stroke();
        ctx.restore();

        var dot = glowSprite(e.ink, true);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (var k = 0; k < drops.length; k++) {
          var d = drops[k];
          var cx = d.x * W + D.px * 5, cy = d.y * H + D.py * 4;
          var rr = d.rr * W * 1.5;
          /* the trail a slide leaves: a bright thread, longer the faster it goes */
          if (d.slide > 0 && d.y > 0.02) {
            var tl = Math.min(H * 0.30, d.y * H);
            ctx.globalAlpha = clamp(0.42 * g, 0, 1);
            ctx.drawImage(trailSprite(e.ink), cx - Math.max(1, rr * 0.16), cy - tl, Math.max(2, rr * 0.32), tl);
          }
          /* the drop: a bright body, a darker belly, a hot spark at its foot */
          ctx.globalAlpha = clamp(0.85 * g, 0, 1);
          ctx.drawImage(dot, cx - rr * 1.35, cy - rr * 1.35, rr * 2.7, rr * 2.7);
          ctx.globalAlpha = clamp(0.55 * g, 0, 1);
          ctx.fillStyle = rgba(e.alt, 1);
          ctx.beginPath(); ctx.arc(cx, cy + rr * 0.15, rr * 0.72, 0, TAU); ctx.fill();
          ctx.globalAlpha = clamp(0.95 * g, 0, 1);
          ctx.drawImage(glowSprite([255, 255, 255], true), cx - rr * 0.30, cy - rr * 0.95, rr * 0.75, rr * 0.75);
          ctx.globalAlpha = clamp(0.22 * g, 0, 1);
          ctx.drawImage(glowSprite(e.acc, false), cx - rr * 2.0, cy - rr * 2.0, rr * 4, rr * 4);
        }
        ctx.restore();
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * 7. Slow Spiral — one logarithmic spiral, dust in the arms
   * ------------------------------------------------------------------ */
  function buildSpiral(r) {
    var dust = [], i, arms = 2;
    for (i = 0; i < 620; i++) {
      dust.push({
        arm: i % arms, th: 0.05 + r() * 9.2, jr: (r() - 0.5) * 0.10, ph: r() * TAU, br: 0.2 + r() * 0.8
      });
    }
    return {
      step: function (dt, t, F) {
        this._spin = t * 0.02;
        var d = Drive(F, t);
        this._beat = d.level;
        this._breath = d.breath;
      },
      draw: function (st, ctx, W, H, D, self) {
        var e = self.entry.pal;
        var g = 0.75 + 0.5 * D.gain;
        drawPlate(ctx, self.plate, W, H, 1.08, 0, 0, 0.42);
        drawBlur(ctx, self.plate, W, H, 1.2, 0, 0, 0.4);

        var cx = W * 0.5, cy = H * 0.5;
        var maxR = Math.min(W * 0.52, H * 0.30);
        var b = 0.20;
        var span = Math.exp(b * 9.25) - 1;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        var col = mixc(e.ink, e.acc, 0.25);
        var sp = glowSprite(col, false);
        var spInk = glowSprite(e.ink, true);
        /* the arms as continuous strokes, so the eye reads a curve, not a cloud */
        for (var pass = 0; pass < 2; pass++) {
          ctx.lineWidth = pass ? 1.7 : 5.5;
          ctx.strokeStyle = rgba(col, clamp((pass ? 0.42 : 0.10) * g, 0, 1));
          for (var arm = 0; arm < arms; arm++) {
            ctx.beginPath();
            for (var k = 0; k <= 110; k++) {
              var th = k / 110 * 9.25;
              var rr = (Math.exp(b * th) - 1) / span * maxR;
              var a = th + st._spin + arm * Math.PI;
              var x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.86;
              if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
        }
        for (var d = 0; d < dust.length; d++) {
          var du = dust[d];
          var th2 = du.th + st._spin + du.arm * Math.PI;
          var r2 = (Math.exp(b * th2) - 1) / span * maxR * (1 + du.jr);
          var x2 = cx + Math.cos(th2) * r2;
          var y2 = cy + Math.sin(th2) * r2 * 0.86;
          if (x2 < -24 || x2 > W + 24 || y2 < -24 || y2 > H + 24) continue;
          var wave = 0.5 + 0.5 * Math.sin(th2 * 2 - self.t * 0.8);
          ctx.globalAlpha = clamp((0.10 + 0.34 * du.br) * (0.55 + 0.45 * wave) * (0.8 + 0.4 * (st._breath || 0)) * g, 0, 1);
          var sz = (1.4 + 3.0 * du.br) * (1 + 0.6 * (st._beat || 0));
          ctx.drawImage(sp, x2 - sz / 2, y2 - sz / 2, sz, sz);
        }
        /* the anchor: a small steady lamp at the turn */
        var cr = Math.min(W, H) * 0.10;
        ctx.globalAlpha = clamp(0.16 * g, 0, 1);
        ctx.drawImage(glowSprite(e.acc, false), cx - cr, cy - cr, cr * 2, cr * 2);
        ctx.globalAlpha = 0.95;
        ctx.drawImage(spInk, cx - cr * 0.10, cy - cr * 0.10, cr * 0.20, cr * 0.20);
        ctx.restore();
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * 8. Bioluminescent Drift — plankton waves in a dark current
   * ------------------------------------------------------------------ */
  function buildPlankton(r) {
    var pts = [], col = [], i;
    var CLUST = [[0.50, 0.50], [0.30, 0.68], [0.70, 0.62], [0.36, 0.28], [0.66, 0.22]];
    for (i = 0; i < 240; i++) {
      pts.push({ x: r(), y: r(), ph: r() * TAU, br: 0.25 + r() * 0.75, sz: 0.8 + r() * 2.4, ci: i % CLUST.length });
    }
    for (i = 0; i < 54; i++) {
      col.push({ y: r(), ph: r() * TAU, br: 0.3 + r() * 0.7, sp: 0.014 + r() * 0.026, dx: (r() - 0.5) * 0.04 });
    }
    return {
      clust: CLUST,
      step: function (dt) {
        for (var k = 0; k < col.length; k++) {
          col[k].y -= dt * col[k].sp;
          if (col[k].y < -0.06) col[k].y = 1.06;
        }
      },
      draw: function (st, ctx, W, H, D, self) {
        var e = self.entry.pal;
        var g = 0.75 + 0.5 * D.gain;
        drawPlate(ctx, self.plate, W, H, 1.1, Math.sin(self.t * TILE) * W * 0.01, Math.cos(self.t * TILE * 0.8) * H * 0.012, 0.55);
        drawBlur(ctx, self.plate, W, H, 1.3, 0, Math.sin(self.t * 0.03) * -H * 0.02, 0.35);

        var sp = glowSprite(e.acc, false), ink = glowSprite(e.ink, true);
        var CLUST = st.clust;
        var t = self.t;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        /* travelling wave fronts: horizontal bands of light, the field's rhythm */
        for (var b = 0; b < 4; b++) {
          var y = mod1(t * 0.016 + b / 4);
          ctx.globalAlpha = clamp((0.16 + 0.08 * D.breath) * g, 0, 1);
          ctx.drawImage(bandSprite(e.acc), 0, (1 - y) * H - H * 0.045, W, H * 0.09);
        }
        /* the bed: a low glow the column of life rises from */
        var bed = W * 1.5;
        ctx.globalAlpha = clamp((0.20 + 0.06 * D.breath) * g, 0, 1);
        ctx.drawImage(glowSprite(e.acc, false), W * 0.5 - bed / 2, H * 0.86, bed, bed * 0.6);
        for (var i = 0; i < pts.length; i++) {
          var p = pts[i];
          /* cluster the field around five centres: a living drift, not a sky */
          var cx0 = CLUST[p.ci][0], cy0 = CLUST[p.ci][1];
          var px2 = cx0 + (p.x - 0.5) * 0.26;
          var py2 = cy0 + (p.y - 0.5) * 0.30 + Math.sin(t * 0.05 + p.ph) * 0.02;
          var wave = Math.sin(py2 * 9.1 - t * 0.45 + p.ph) + 0.5 * Math.sin(px2 * 7.3 + t * 0.2);
          var v = clamp(0.5 + 0.5 * wave, 0, 1);
          var al = (0.10 + 0.55 * p.br) * Math.pow(v, 1.2) * (0.6 + 0.5 * D.breath) * g;
          var sz = (1.6 + 3.4 * p.sz) * (0.8 + 0.4 * v);
          ctx.globalAlpha = clamp(al, 0, 1);
          ctx.drawImage(px2 < 1 && py2 < 1 ? sp : sp, px2 * W - sz / 2, py2 * H - sz / 2, sz, sz);
        }
        /* the anchor: one dense cluster of brighter plankton, mid-frame */
        var cxs = W * 0.5;
        for (var k = 0; k < col.length; k++) {
          var c0 = col[k];
          ctx.globalAlpha = clamp((0.14 + 0.30 * c0.br) * (0.6 + 0.4 * D.breath) * g, 0, 1);
          var sz2 = 2 + 4 * c0.br;
          ctx.drawImage(sp, cxs + c0.dx * W + Math.sin(c0.ph + t * 0.2) * W * 0.02 - sz2 / 2,
            c0.y * H - sz2 / 2, sz2, sz2);
        }
        ctx.globalAlpha = 0.9;
        ctx.drawImage(ink, cxs - 3, H * 0.5 - 3, 6, 6);
        ctx.globalAlpha = clamp(0.30 * g, 0, 1);
        ctx.drawImage(glowSprite(e.acc, false), cxs - W * 0.16, H * 0.5 - W * 0.16, W * 0.32, W * 0.32);
        if (D.gate) {
          ctx.globalAlpha = clamp((0.08 + 0.16 * D.gate) * g, 0, 1);
          ctx.drawImage(bandSprite(e.ink), 0, H * (0.55 - 0.35 * D.gate), W, H * 0.30);
        }
        ctx.restore();
      }
    };
  }

  /* ==================================================================== *
   * the table
   * ==================================================================== */

  var SCENES = [
    {
      id: "focus-cathedral", name: "Cathedral of Light",
      blurb: "Slow shafts of light in a vast dark nave; dust turning in the air.",
      plate: "ui/scene/cathedral.webp", still: "ui/scene/cathedral-still.webp", warm: true,
      pal: { top: [18, 12, 6], bottom: [4, 3, 2], ink: [255, 236, 200], acc: [255, 176, 82], alt: [150, 110, 70] },
      build: buildCathedral
    },
    {
      id: "focus-deepfield", name: "Deep Field",
      blurb: "A cold star field drifting past one guiding star.",
      plate: "ui/scene/deepfield.webp", still: "ui/scene/deepfield-still.webp", warm: false,
      pal: { top: [7, 9, 17], bottom: [2, 2, 5], ink: [232, 238, 250], acc: [150, 184, 255], alt: [120, 96, 170] },
      build: buildDeepField
    },
    {
      id: "focus-ink", name: "Ink Bloom",
      blurb: "Ink plumes opening in dark water at every breath.",
      plate: "ui/scene/ink.webp", still: "ui/scene/ink-still.webp", warm: false,
      pal: { top: [46, 96, 102], bottom: [4, 14, 20], ink: [236, 250, 246], acc: [110, 226, 214], alt: [12, 34, 42] },
      build: buildInk
    },
    {
      id: "focus-aurora", name: "Aurora Veil",
      blurb: "Three feathered curtains of cold light over a midnight sky.",
      plate: "ui/scene/aurora.webp", still: "ui/scene/aurora-still.webp", warm: false,
      pal: { top: [6, 12, 16], bottom: [2, 3, 6], ink: [226, 246, 240], acc: [120, 236, 180], cool: [110, 206, 240], green: [122, 240, 170], violet: [178, 150, 244] },
      build: buildAurora
    },
    {
      id: "focus-ember", name: "Ember Lattice",
      blurb: "Embers joining and breaking in the dark, a slow web of warm light.",
      plate: "ui/scene/ember.webp", still: "ui/scene/ember-still.webp", warm: true,
      pal: { top: [14, 6, 3], bottom: [2, 1, 1], ink: [255, 232, 196], acc: [255, 122, 52], alt: [170, 60, 24] },
      build: buildEmber
    },
    {
      id: "focus-rain", name: "Rain on Glass",
      blurb: "Drops gathering, merging and sliding down a night window.",
      plate: "ui/scene/rain.webp", still: "ui/scene/rain-still.webp", warm: true,
      pal: { top: [6, 11, 18], bottom: [2, 3, 6], ink: [244, 236, 220], acc: [255, 176, 104], alt: [120, 168, 210] },
      build: buildRain
    },
    {
      id: "focus-spiral", name: "Slow Spiral",
      blurb: "One logarithmic spiral, dust in its arms, turning at a breath's pace.",
      plate: "ui/scene/spiral.webp", still: "ui/scene/spiral-still.webp", warm: false,
      pal: { top: [10, 9, 14], bottom: [2, 2, 3], ink: [248, 240, 216], acc: [190, 214, 214], alt: [90, 130, 140] },
      build: buildSpiral
    },
    {
      id: "focus-plankton", name: "Bioluminescent Drift",
      blurb: "Plankton pulses travelling as slow waves in a dark water column.",
      plate: "ui/scene/plankton.webp", still: "ui/scene/plankton-still.webp", warm: false,
      pal: { top: [4, 16, 16], bottom: [1, 3, 5], ink: [214, 250, 240], acc: [88, 244, 214], alt: [50, 110, 110] },
      build: buildPlankton
    }
  ];

  var BY = {};
  for (var si = 0; si < SCENES.length; si++) BY[SCENES[si].id] = SCENES[si];

  /* ==================================================================== *
   * similarity: a 32x32 luminance grid, a dHash, and a structural distance
   * ==================================================================== */

  function gridOf(canvas, n) {
    n = n || 32;
    var c = canvasOf(n, n), x = c.getContext("2d");
    x.drawImage(canvas, 0, 0, n, n);
    var d = x.getImageData(0, 0, n, n).data;
    var out = new Float32Array(n * n);
    for (var i = 0, p = 0; i < d.length; i += 4, p++) {
      out[p] = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    }
    return out;
  }

  function dhash(grid, n) {
    n = n || 32;
    var bits = "";
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n - 1; x++) {
        bits += grid[y * n + x] > grid[y * n + x + 1] ? "1" : "0";
      }
    }
    return bits;
  }

  function hamming(a, b) {
    var d = 0;
    for (var i = 0; i < a.length; i++) if (a.charAt(i) !== b.charAt(i)) d++;
    return d;
  }

  function gridDistance(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
    return s / a.length;
  }

  /* 1 - Pearson correlation: "same composition, retinted" scores near 0,
     different geometry scores near 1 */
  function structureDistance(a, b) {
    var n = a.length, ma = 0, mb = 0, i;
    for (i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    var sa = 0, sb = 0, sab = 0, da, db;
    for (i = 0; i < n; i++) {
      da = a[i] - ma; db = b[i] - mb;
      sa += da * da; sb += db * db; sab += da * db;
    }
    var den = Math.sqrt(sa * sb);
    return den > 1e-9 ? 1 - sab / den : 1;
  }

  var api = {
    version: 1,
    LIST: SCENES,
    byId: function (id) { return BY[id] || null; },
    isScene: function (id) { return !!(id && BY[id]); },
    step: function (id, dir) {
      var k = -1;
      for (var i = 0; i < SCENES.length; i++) if (SCENES[i].id === id) { k = i; break; }
      return SCENES[(k + (dir || 1) + SCENES.length) % SCENES.length];
    },
    create: function (id, seed) {
      var e = BY[id];
      if (!e) return null;
      return new Scene(e, seed);
    },
    reset: function (inst) { if (inst && inst.reset) inst.reset(); },
    stepInst: function (inst, F) { if (inst && inst.step) inst.step(F); },
    drawInst: function (inst, F) { if (inst && inst.draw) inst.draw(F); },
    setParallax: function (x, y) { PAR.tx = clamp(x, -1, 1); PAR.ty = clamp(y, -1, 1); },
    gridOf: gridOf,
    dhash: dhash,
    hamming: hamming,
    gridDistance: gridDistance,
    structureDistance: structureDistance,
    reduced: reduced
  };

  if (typeof globalThis !== "undefined") globalThis.GnauralVizScenes = api;
})();
