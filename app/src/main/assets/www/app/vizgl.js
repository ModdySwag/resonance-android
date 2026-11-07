/* Gnaural Web — Resonance Studio: WebGL2 cymatic field renderer (step 1 skeleton).
 * Licensed GPL-2.0-or-later (see NOTICE.txt).
 *
 * WHAT THIS IS
 * ------------
 * A self-contained WebGL2 backend for the visualiser, landed BEHIND the existing
 * Canvas2D renderers. It is deliberately not wired into any visualiser yet: loading
 * this file does nothing at all. No canvas is created or attached, no frame loop is
 * started, no global state outside window.__rsGL / window.__rsGLDiag is touched.
 *
 * The renderer draws ONE full-screen triangle with ONE fragment shader that evaluates
 * an analytic Chladni/cymatic field:
 *
 *     F(p) = sum over 8 modes of  w_i * sin(u_i*PI*p.x + a_i*t) * sin(v_i*PI*p.y + b_i*t)
 *
 * shaded with a cheap finite-difference gradient (fake normals — no raymarching), a
 * smooth cosine palette, bright nodal ridges and a vignette. Everything is analytic:
 * no textures, no libraries, no build step, no per-frame CPU work beyond uniforms.
 *
 * API (all calls are total: they return false instead of throwing)
 * ---------------------------------------------------------------
 *   window.__rsGL.init(canvas)        -> bool   binds a webgl2 context to `canvas`,
 *                                                 compiles the program, returns success.
 *   window.__rsGL.available()         -> bool   real capability probe: getContext('webgl2')
 *                                                 + compile + test draw + readPixels. Uses an
 *                                                 OffscreenCanvas (or a detached canvas when
 *                                                 OffscreenCanvas is missing); never attaches
 *                                                 anything to the document. A live renderer
 *                                                 short-circuits to true.
 *   window.__rsGL.drawField(params)   -> bool   draws one frame. params (all optional):
 *                                                 { time, amp, hue, gain, sharp, modes }
 *                                                 time   seconds, caller-owned clock (default 0)
 *                                                 amp    0..2 field amplitude (default 1)
 *                                                 hue    palette rotation (default 0.58)
 *                                                 gain   0..2 exposure (default 1)
 *                                                 sharp  0..1 nodal-ridge strength (default .55)
 *                                                 modes  [[u,v], ...] up to 8 pairs
 *   window.__rsGL.dispose()           -> void   frees program/VAO and releases the context.
 *                                                 Re-init needs a fresh canvas.
 *
 *   window.__rsGLDiag() -> {
 *     api, available, webgl2,        // webgl2 = did getContext('webgl2') succeed
 *     renderer, vendor,              // gl.RENDERER / gl.VENDOR
 *     unmaskedRenderer,              // WEBGL_debug_renderer_info when the driver exposes it
 *     reason,                        // why available is false ("" when true)
 *     status,                        // "idle" | "active" | "unavailable" | "lost"
 *     active, lost, draws, lastError,
 *     canvas: {width,height} | null,
 *     modes: 8
 *   }
 *
 * SAFETY
 * ------
 * Every GL call that can fail is guarded; init/drawField/available/diag/dispose never
 * throw. On context loss the state is dropped and a later drawField returns false, so a
 * caller can fall back to Canvas2D unconditionally.
 */
(function () {
  "use strict";

  if (typeof window === "undefined" || window.__rsGL) return;

  var API_VERSION = "vizgl/1";
  var MODE_COUNT = 8;

  // Conservative attributes: no depth/stencil/alpha, no MSAA (the shader is the image),
  // no preserveDrawingBuffer (the caller presents every frame).
  var GL_ATTRS = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance"
  };

  // Eight Chladni mode pairs: (u, v) plate frequencies. Deliberately coprime-ish so the
  // nodal figures stay asymmetric and interesting.
  var DEFAULT_MODES = [
    [2, 3], [3, 2], [5, 4], [4, 5],
    [1, 6], [6, 1], [7, 3], [3, 7]
  ];

  var VERTEX_SRC = [
    "#version 300 es",
    "void main() {",
    "  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));",
    "  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);",
    "}"
  ].join("\n");

  var FRAGMENT_SRC = [
    "#version 300 es",
    "precision highp float;",
    "",
    "uniform vec2  uRes;",
    "uniform float uTime;",
    "uniform float uAmp;",
    "uniform float uHue;",
    "uniform float uGain;",
    "uniform float uSharp;",
    "uniform vec2  uModes[8];",
    "",
    "out vec4 fragColor;",
    "",
    "const float PI  = 3.14159265358979;",
    "const float TAU = 6.28318530717959;",
    "",
    "float fieldAt(vec2 p, float t) {",
    "  float s = 0.0;",
    "  for (int i = 0; i < 8; i++) {",
    "    vec2 m = uModes[i];",
    "    float w  = 0.55 + 0.45 * fract(float(i) * 0.6180339887);",
    "    float ph = float(i) * 0.7;",
    "    s += w * sin(m.x * PI * p.x + t * (0.23 + 0.05 * m.x) + ph)",
    "           * sin(m.y * PI * p.y - t * (0.19 + 0.04 * m.y) - ph);",
    "  }",
    "  return s * 0.32 * uAmp;",
    "}",
    "",
    "vec3 palette(float t) {",
    "  return 0.5 + 0.5 * cos(TAU * (t + vec3(0.0, 0.33, 0.67)));",
    "}",
    "",
    "void main() {",
    "  vec2 res = max(uRes, vec2(1.0));",
    "  vec2 p = (2.0 * gl_FragCoord.xy - res) / min(res.x, res.y);",
    "",
    "  float t = uTime;",
    "  float f = fieldAt(p, t);",
    "",
    "  // Cheap fake normal: central differences in field space, tilted up.",
    "  float e  = 0.015;",
    "  float gx = (fieldAt(p + vec2(e, 0.0), t) - fieldAt(p - vec2(e, 0.0), t)) * (0.5 / e);",
    "  float gy = (fieldAt(p + vec2(0.0, e), t) - fieldAt(p - vec2(0.0, e), t)) * (0.5 / e);",
    "  vec3  n  = normalize(vec3(-gx * 0.045, -gy * 0.045, 1.0));",
    "  float ndl = clamp(dot(n, normalize(vec3(-0.42, -0.55, 0.72))), 0.0, 1.0);",
    "  float shade = 0.34 + 0.66 * ndl;",
    "",
    "  // Nodal lines (where the plate is still) burn brighter, like sand on a plate.",
    "  float ridge = 1.0 - smoothstep(0.0, 0.085 + 0.075 * (1.0 - uSharp), abs(f));",
    "  ridge = ridge * ridge * ridge;",
    "",
    "  vec3 base = palette(uHue + 0.32 * f);",
    "  vec3 col  = base * shade;",
    "  col += vec3(1.0, 0.93, 0.78) * ridge * (0.20 + 0.55 * uSharp);",
    "  col *= uGain;",
    "",
    "  vec2 q = gl_FragCoord.xy / res;",
    "  float vig = smoothstep(1.15, 0.20, length(q - 0.5) * 1.55);",
    "  col *= mix(0.55, 1.0, vig);",
    "",
    "  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);",
    "}"
  ].join("\n");

  /* ------------------------------------------------------------------ helpers -- */

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function num(v, d) {
    return (typeof v === "number" && isFinite(v)) ? v : d;
  }

  function reasonOf(e) {
    try {
      if (e && e.message) return String(e.message).slice(0, 400);
      return String(e).slice(0, 400);
    } catch (e2) {
      return "unknown error";
    }
  }

  function rendererInfo(gl, out) {
    try { out.renderer = String(gl.getParameter(gl.RENDERER) || ""); } catch (e) { out.renderer = ""; }
    try { out.vendor = String(gl.getParameter(gl.VENDOR) || ""); } catch (e2) { out.vendor = ""; }
    try {
      var ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) out.unmaskedRenderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "");
    } catch (e3) {
      out.unmaskedRenderer = "";
    }
    return out;
  }

  function compileShader(gl, type, src, label) {
    var sh = gl.createShader(type);
    if (!sh) throw new Error("createShader(" + label + ") returned null");
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = "";
      try { log = String(gl.getShaderInfoLog(sh) || ""); } catch (e) { log = ""; }
      gl.deleteShader(sh);
      throw new Error(label + " shader failed to compile: " + log.slice(0, 400));
    }
    return sh;
  }

  // builds program + empty VAO + uniform table; throws on any failure
  function buildProgram(gl) {
    var vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC, "vertex");
    var fs;
    try {
      fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC, "fragment");
    } catch (e) {
      gl.deleteShader(vs);
      throw e;
    }

    var program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      throw new Error("createProgram returned null");
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      var log = "";
      try { log = String(gl.getProgramInfoLog(program) || ""); } catch (e) { log = ""; }
      gl.deleteProgram(program);
      throw new Error("program failed to link: " + log.slice(0, 400));
    }

    var u = {
      res: gl.getUniformLocation(program, "uRes"),
      time: gl.getUniformLocation(program, "uTime"),
      amp: gl.getUniformLocation(program, "uAmp"),
      hue: gl.getUniformLocation(program, "uHue"),
      gain: gl.getUniformLocation(program, "uGain"),
      sharp: gl.getUniformLocation(program, "uSharp"),
      modes: gl.getUniformLocation(program, "uModes[0]")
    };
    if (!u.res || !u.time || !u.amp || !u.hue || !u.gain || !u.sharp || !u.modes) {
      gl.deleteProgram(program);
      throw new Error("compiled program is missing an expected uniform");
    }

    var vao = gl.createVertexArray();
    if (!vao) {
      gl.deleteProgram(program);
      throw new Error("createVertexArray returned null");
    }

    return {
      program: program,
      vao: vao,
      u: u,
      modeBuf: new Float32Array(MODE_COUNT * 2)
    };
  }

  function freeProgram(gl, st) {
    if (!gl || !st) return;
    try { if (st.vao) gl.deleteVertexArray(st.vao); } catch (e) { /* context may be gone */ }
    try { if (st.program) gl.deleteProgram(st.program); } catch (e2) { /* ditto */ }
  }

  function releaseContext(gl) {
    try {
      var ext = gl.getExtension("WEBGL_lose_context");
      if (ext && ext.loseContext) ext.loseContext();
    } catch (e) { /* nothing to release */ }
  }

  function applyUniforms(gl, state, params) {
    var p = params || {};
    var buf = state.modeBuf;

    // Uniform calls only reach the program that is CURRENT. Binding here (rather than in
    // drawInto) keeps probe() and drawField() correct in any call order.
    gl.useProgram(state.program);
    gl.uniform2f(state.u.res, state.width, state.height);
    gl.uniform1f(state.u.time, num(p.time, 0));
    gl.uniform1f(state.u.amp, clamp(num(p.amp, 1), 0, 2));
    gl.uniform1f(state.u.hue, num(p.hue, 0.58));
    gl.uniform1f(state.u.gain, clamp(num(p.gain, 1), 0, 2));
    gl.uniform1f(state.u.sharp, clamp(num(p.sharp, 0.55), 0, 1));

    var modes = Array.isArray(p.modes) ? p.modes : null;
    for (var i = 0; i < MODE_COUNT; i++) {
      var fallback = DEFAULT_MODES[i];
      var m = modes ? modes[i] : null;
      var mu = (m && typeof m[0] === "number" && isFinite(m[0])) ? m[0] : fallback[0];
      var mv = (m && typeof m[1] === "number" && isFinite(m[1])) ? m[1] : fallback[1];
      buf[i * 2] = clamp(mu, 0, 12);
      buf[i * 2 + 1] = clamp(mv, 0, 12);
    }
    gl.uniform2fv(state.u.modes, buf);
  }

  function drawInto(gl, state) {
    gl.bindVertexArray(state.vao);
    gl.useProgram(state.program);
    gl.viewport(0, 0, state.width, state.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* --------------------------------------------------------------- capability -- */

  // Real probe: context + full program + 8x8 draw + readPixels of one pixel. Runs on an
  // OffscreenCanvas so no canvas is ever created in (or attached to) the document; the
  // context is released afterwards so repeated checks cannot exhaust the context limit.
  function probe() {
    var out = {
      ok: false,
      webgl2: false,
      renderer: "",
      vendor: "",
      unmaskedRenderer: "",
      reason: "",
      error: ""
    };
    var canvas = null;
    var gl = null;
    var st = null;

    try {
      var OC = window.OffscreenCanvas;
      if (typeof OC === "function") {
        // Prefer a truly off-DOM surface; only if it actually yields a webgl2 context.
        try {
          var off = new OC(8, 8);
          if (off.getContext("webgl2", GL_ATTRS)) canvas = off;
        } catch (eOff) {
          canvas = null;
        }
      }
      if (!canvas && typeof document !== "undefined" && document.createElement) {
        // Detached only: never appended to the document. This is the same kind of canvas
        // init() will be given, so the probe matches the real target.
        canvas = document.createElement("canvas");
        canvas.width = 8;
        canvas.height = 8;
      }
      if (!canvas || typeof canvas.getContext !== "function") {
        out.reason = "no canvas implementation for the WebGL2 probe";
        return out;
      }

      gl = canvas.getContext("webgl2", GL_ATTRS);
      if (!gl) {
        out.reason = "getContext('webgl2') returned null";
        return out;
      }
      out.webgl2 = true;
      rendererInfo(gl, out);

      st = buildProgram(gl);
      st.width = 8;
      st.height = 8;
      applyUniforms(gl, st, { time: 0.7, amp: 1, hue: 0.58, gain: 1, sharp: 0.55, modes: DEFAULT_MODES });

      gl.viewport(0, 0, 8, 8);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      drawInto(gl, st);

      var px = new Uint8Array(4);
      gl.readPixels(4, 3, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      var glErr = gl.getError();
      if (glErr !== gl.NO_ERROR) {
        out.reason = "GL error during test draw: 0x" + glErr.toString(16);
        return out;
      }
      if ((px[0] + px[1] + px[2]) < 12) {
        out.reason = "test draw read back black (rgb " + px[0] + "," + px[1] + "," + px[2] + ")";
        return out;
      }

      out.ok = true;
      out.sample = [px[0], px[1], px[2], px[3]];
      return out;
    } catch (e) {
      out.reason = "probe failed: " + reasonOf(e);
      out.error = reasonOf(e);
      return out;
    } finally {
      freeProgram(gl, st);
      if (gl) releaseContext(gl);
    }
  }

  /* -------------------------------------------------------------------- state -- */

  var live = null;          // { gl, program, vao, u, modeBuf, canvas, width, height, info, handlers }
  var lastProbe = null;     // last probe() result
  var lastError = "";
  var drawCount = 0;
  var wasLost = false;

  function available() {
    if (live) return true;
    lastProbe = probe();
    if (!lastProbe.ok && lastProbe.reason) lastError = lastProbe.reason;
    return lastProbe.ok;
  }

  /* --------------------------------------------------------------------- api -- */

  function init(canvas) {
    if (!canvas || typeof canvas.getContext !== "function") {
      lastError = "init(canvas) requires a canvas-like object";
      return false;
    }
    if (live) dispose();

    var gl = null;
    try {
      gl = canvas.getContext("webgl2", GL_ATTRS);
      if (!gl) {
        lastError = "getContext('webgl2') returned null (WebGL2 unavailable, or this canvas already owns a 2D context)";
        return false;
      }

      var st = buildProgram(gl);
      var info = rendererInfo(gl, {
        webgl2: true, renderer: "", vendor: "", unmaskedRenderer: "", reason: ""
      });

      var state = {
        gl: gl,
        program: st.program,
        vao: st.vao,
        u: st.u,
        modeBuf: st.modeBuf,
        canvas: canvas,
        width: 0,
        height: 0,
        info: info,
        handlers: null
      };

      // A lost context invalidates every GL object. Drop the state (never leave a
      // half-valid program behind) so drawField() returns false and the caller falls back.
      var onLost = function (ev) {
        try { if (ev && ev.preventDefault) ev.preventDefault(); } catch (e) { /* older webview */ }
        wasLost = true;
        if (live === state) live = null;
        lastError = "WebGL context lost";
      };
      var onRestored = function () {
        // Objects are NOT valid again; a restore only means getContext can be retried.
        lastError = "WebGL context restored; call init(canvas) again";
      };
      try {
        canvas.addEventListener("webglcontextlost", onLost, false);
        canvas.addEventListener("webglcontextrestored", onRestored, false);
      } catch (e2) { /* no event target: the renderer still works until loss */ }
      state.handlers = { lost: onLost, restored: onRestored };

      live = state;
      lastProbe = info;
      lastProbe.ok = true;
      lastError = "";
      wasLost = false;
      drawCount = 0;
      return true;
    } catch (e) {
      lastError = reasonOf(e);
      if (gl) releaseContext(gl);
      return false;
    }
  }

  function drawField(params) {
    if (!live) {
      if (!wasLost) lastError = "drawField() before a successful init(canvas)";
      return false;
    }
    try {
      var gl = live.gl;
      var w = gl.drawingBufferWidth || live.canvas.width || 0;
      var h = gl.drawingBufferHeight || live.canvas.height || 0;
      if (!w || !h) {
        lastError = "canvas has a zero-sized drawing buffer";
        return false;
      }
      live.width = w;
      live.height = h;
      applyUniforms(gl, live, params);
      drawInto(gl, live);
      var err = gl.getError();
      if (err !== gl.NO_ERROR) {
        lastError = "GL error during drawField: 0x" + err.toString(16);
        return false;
      }
      drawCount += 1;
      return true;
    } catch (e) {
      lastError = reasonOf(e);
      return false;
    }
  }

  function dispose() {
    if (!live) return;
    var state = live;
    live = null;
    try {
      if (state.handlers && state.canvas && state.canvas.removeEventListener) {
        state.canvas.removeEventListener("webglcontextlost", state.handlers.lost, false);
        state.canvas.removeEventListener("webglcontextrestored", state.handlers.restored, false);
      }
    } catch (e) { /* detached or exotic canvas */ }
    var gl = state.gl;
    freeProgram(gl, state);
    releaseContext(gl);
    drawCount = 0;
  }

  function diag() {
    var ok = false;
    try { ok = available(); } catch (e) { ok = false; }

    var info = live ? live.info : lastProbe;
    if (!info) {
      info = { webgl2: false, renderer: "", vendor: "", unmaskedRenderer: "", reason: lastError || "not probed" };
    }

    var status;
    if (live) status = "active";
    else if (wasLost) status = "lost";
    else if (ok) status = "idle";
    else status = "unavailable";

    return {
      api: API_VERSION,
      available: ok,
      webgl2: !!info.webgl2,
      renderer: info.renderer || "",
      vendor: info.vendor || "",
      unmaskedRenderer: info.unmaskedRenderer || "",
      reason: ok ? "" : (info.reason || lastError || "unavailable"),
      status: status,
      active: !!live,
      lost: !!wasLost,
      draws: drawCount,
      lastError: lastError,
      canvas: live ? { width: live.width, height: live.height } : null,
      modes: MODE_COUNT
    };
  }

  window.__rsGL = {
    init: init,
    available: available,
    drawField: drawField,
    dispose: dispose,
    diag: diag
  };
  window.__rsGLDiag = diag;
})();
