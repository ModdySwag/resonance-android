/* Gnaural Web — synthesis engine.
 *
 * Faithful port of the Gnaural scheduling/synthesis core.
 *   Gnaural engine — Copyright (C) 2008 Bret Logan — LGPL-2.1-or-later
 *   Upstream: gnaural.sourceforge.net  (BinauralBeat.c, 1.0.20110606)
 *
 * This is a re-implementation in JavaScript of the upstream engine's algorithm
 * and file semantics, written from the published source. The upstream engine is
 * LGPL-2.1-or-later, so this port is distributed under the same terms
 * (licence text: COPYING.LESSER). All other gnaural-web files are
 * GPL-2.0-or-later. See NOTICE.txt.
 *
 * Ported voice types:
 *   0 BINAURALBEAT  — two sines, L = base + beat/2, R = base − beat/2 (beat heard in the brain)
 *   1 PINKNOISE     — 1/f noise. Upstream's 31/32 one-pole lopass is NOT pink (measured
 *                     −3 dB/oct in octave-band energy, i.e. brown-ish), so this uses a
 *                     true pink source: Paul Kellet's 3-pole recursive approximation
 *                     (1999, public domain), flat to ±0.3 dB/oct over 20 Hz–20 kHz.
 *   3 ISOPULSE      — isochronic tones (tone/silence alternating at the beat frequency)
 *   4 ISOPULSE_ALT  — isochronic tones alternating between L and R each half-cycle
 * Not ported in v1: 2 (PCM file loops), 5 (waterdrops), 6 (rain).
 *
 * Generated noise sources (all procedural, no samples, no dependencies):
 *   7 WHITE — uniform white, one PRNG draw per channel per sample
 *   8 BROWN — leaky-integrated white (red noise): 1/f², DC-bounded by the leak
 *   1 PINK  — 1/f (see above)
 * All three are produced in the same raw 16-bit scale as the tonal voices, so the
 * /32768 output stage and the preset volumes mean the same thing for every colour;
 * each is level-matched to the pink voice's measured raw RMS 4773 (float 0.1457).
 * They are ordinary voices: they live in the same voice list, mix through the same
 * sum and take the same per-entry volume ramps as carriers.
 *
 * Clicks: the engine has no intrinsic discontinuity at start/stop. A 10 ms master
 * ramp (RAMP_SAMPLES) fades the mix in when playback starts and out when it pauses;
 * pause keeps rendering for the length of that fade, then freezes the position.
 * A voice whose own entry volumes step (a schedule that begins at full volume)
 * is still click-free because of that master ramp.
 *
 * Fidelity notes (deliberate, documented):
 *  - Envelope/entry recalculation happens every UPDATE_PERIOD_SAMPLES = 16 samples and the
 *    sample counter advances in 16-sample steps, exactly as upstream.
 *  - Upstream casts the mixed float to signed 16-bit (wrap-around on overflow); we clamp
 *    to [-1, 1] instead, which is the only behavioural deviation.
 *  - Output is float (Web Audio); upstream 16-bit scale (SIN_SCALER = 0x3FFF) is kept
 *    internally so preset volumes mean the same thing.
 *
 * Runs unchanged in three places: browser main thread, AudioWorklet global scope,
 * and Node (tests) — no DOM, no imports, no globals besides GnauralEngine.
 */
(function () {
  "use strict";

  var SAMPLE_RATE = 44100;
  var TWO_PI = Math.PI * 2;
  var SAMPLE_FACTOR = TWO_PI / 44100;      // == 2*PI/sample_rate  (upstream BB_SAMPLE_FACTOR)
  var SAMPLERATE_HALF = 22050;             // 0.5 * sample rate
  var SIN_SCALER = 0x3FFF;                 // 16383: upstream scales sin() output to a short
  var UPDATE_PERIOD_SAMPLES = 16;          // upstream BB_UPDATEPERIOD_SAMPLES

  var VOICE_BINAURAL = 0;
  var VOICE_PINK = 1;
  var VOICE_PCM = 2;
  var VOICE_ISOPULSE = 3;
  var VOICE_ISOPULSE_ALT = 4;
  /* Extensions beyond upstream's playable set. Upstream reserves 5 (waterdrops)
   * and 6 (rain) for sample-based ambience we do not port; 7 and 8 are ours.
   * Both are calibrated to the pink voice's measured level (raw RMS 4773 at
   * vol 1, i.e. float RMS 0.1457 after the /32767 scale), so a bed written at
   * a given volume sounds equally loud whichever colour is chosen. Files using
   * 7/8 play here; other Gnaural builds will report them as unsupported. */
  var VOICE_WHITE = 7;
  var VOICE_BROWN = 8;
  var WHITE_SCALE = 8267;     // uniform [-1,1) * this = raw RMS 4773
  var BROWN_GAIN = 10.08;     // leaky-integrated white * this = raw RMS 4773
  var BROWN_LEAK = 0.02;      // integrator input gain (pole 1/(1+LEAK))

  /* Paul Kellet's 3-pole pink filter (1999, public domain): three one-pole
   * integrators with ascending weights, summed with a direct term. Analytic
   * response is flat to ±0.3 dB/oct in octave-band energy from 20 Hz to 20 kHz,
   * i.e. genuinely 1/f — unlike the upstream one-pole lopass it replaces.
   * Cost is 3 states and 9 flops per channel per sample. */
  var PINK_A = [0.99765, 0.96300, 0.57000];
  var PINK_S = [0.0990460, 0.2965164, 1.0526913];
  var PINK_DIRECT = 0.1848;
  var PINK_SCALE = 2849;      // Kellet output * this = raw RMS 4773, same as white/brown

  /* One-pole DC blocker (~3.5 Hz at 44.1 kHz) after the integrating sources.
   * The brown integrator's leak already bounds it; this removes the residual
   * sub-audio offset so nothing can drift into the headroom. 0.985 gain at 20 Hz:
   * the audio band is untouched. */
  var DC_BLOCK_R = 0.9995;

  /* Master start/stop ramp: 10 ms is long enough to kill the step at a buffer
   * boundary and short enough that play/pause still feels instant. */
  var RAMP_SAMPLES = 441;

  var FLAG_COMPLETED = 1;
  var FLAG_NEWLOOP = 2;
  var FLAG_NEWENTRY = 4;

  function num(v, dflt) {
    var n = parseFloat(v);
    return isFinite(n) ? n : dflt;
  }
  function clamp1(x) {
    return x > 1 ? 1 : (x < -1 ? -1 : x);
  }

  /* ------------------------------------------------------------------ *
   * Deterministic pseudo-random generator (upstream BB_Rand, 32-bit
   * Windows semantics: xorshift + multiply-with-carry).
   * ------------------------------------------------------------------ */
  function XorRandom() {
    this.mcgn = 3677;
    this.srgn = 127;
  }
  XorRandom.prototype.rand = function () {
    var r0, r1, r0b;
    r0 = this.srgn >>> 15;
    r1 = (this.srgn ^ r0) | 0;
    r0b = r1 << 17;
    this.srgn = (r0b ^ r1) | 0;
    this.mcgn = (Math.imul(69069, this.mcgn) | 0);
    return ((this.mcgn ^ this.srgn) | 0);
  };
  /* One 16-bit uniform draw in [-1, 1): the shared source of all three colours. */
  function uniform(rng) {
    return ((rng.rand() >>> 16) / 32768) - 1;
  }
  /* Paul Kellet 3-pole pink, one sample. state = {b0, b1, b2}. */
  function pinkStep(st, x) {
    st.b0 = PINK_A[0] * st.b0 + x * PINK_S[0];
    st.b1 = PINK_A[1] * st.b1 + x * PINK_S[1];
    st.b2 = PINK_A[2] * st.b2 + x * PINK_S[2];
    return st.b0 + st.b1 + st.b2 + x * PINK_DIRECT;
  }
  /* One-pole DC blocker, one sample. state = {x1, y1}. */
  function dcBlock(st, x) {
    var y = x - st.x1 + DC_BLOCK_R * st.y1;
    st.x1 = x; st.y1 = y;
    return y;
  }

  /* ------------------------------------------------------------------ *
   * Entry (upstream BB_EventData): one schedule segment of a voice.
   * Authoring fields (what presets provide):
   *    duration          seconds
   *    volL, volR        0..1 channel volumes at segment start
   *    basefreq          Hz at segment start
   *    beatfreqHalf      Hz/2 at segment start (upstream stores half; beat = 2*half)
   * The segment *ends* at the next entry's start values (last entry wraps to entry 0),
   * exactly like upstream BB_CalibrateVoice.
   * ------------------------------------------------------------------ */
  function Entry(spec) {
    spec = spec || {};
    this.duration = num(spec.duration, 1);
    this.volL_start = num(spec.volL, 1);
    this.volR_start = num(spec.volR, this.volL_start);
    this.basefreq_start = num(spec.basefreq, 200);
    this.beatfreq_start_HALF = num(spec.beatHalf, num(spec.beat, 4) / 2);
    /* computed by calibrate(): */
    this.volL_end = 0; this.volR_end = 0;
    this.volL_spread = 0; this.volR_spread = 0;
    this.basefreq_end = 0; this.basefreq_spread = 0;
    this.beatfreq_end_HALF = 0; this.beatfreq_spread_HALF = 0;
    this.absStart = 0; this.absEnd = 0;
  }

  /* ------------------------------------------------------------------ *
   * Voice (upstream BB_VoiceData).
   * ------------------------------------------------------------------ */
  function Voice(type, entries, opts) {
    opts = opts || {};
    this.type = type | 0;
    this.mute = !!opts.mute;
    this.mono = !!opts.mono;
    this.entries = (entries || []).map(function (e) {
      return (e instanceof Entry) ? e : new Entry(e);
    });
    this.entryCount = this.entries.length;
    this.totalDuration = 0;
    this.reset();
  }
  Voice.prototype.reset = function () {
    /* upstream BB_InitVoices defaults */
    this.curEntry = 0;
    this.curVolL = 0; this.curVolR = 0;
    this.curBasefreq = 0; this.curBeatfreq = 0;
    this.curBeatfreqLFactor = 0; this.curBeatfreqRFactor = 0;
    this.phaseSampleCount = 1; this.phaseSampleCountStart = 1;
    this.phaseFlag = 0; this.phaseEnvelope = 0;
    this.sinPosL = 0; this.sinPosR = 0;
    this.sinL = 0; this.sinR = 0;
    /* noise-source state: Kellet pink poles, brown integrator, DC blocker.
     * All start at zero, so a noise voice begins at silence rather than with a
     * step — the filter settles under the entry ramp. */
    this.pinkL = { b0: 0, b1: 0, b2: 0 }; this.pinkR = { b0: 0, b1: 0, b2: 0 };
    this.brownL = 0; this.brownR = 0;
    this.dcL = { x1: 0, y1: 0 }; this.dcR = { x1: 0, y1: 0 };
  };

  /* ------------------------------------------------------------------ *
   * Engine (upstream BB_MainLoop + calibration + reset).
   * ------------------------------------------------------------------ */
  function Engine() {
    this.voices = [];
    this.totalDuration = 0;
    this.currentSample = 0;
    this.currentSampleLooped = 0;
    this.loopCount = 1;
    this.loops = 1;                 // 1 = play once; Infinity = loop forever
    this.updatePeriod = 1;          // upstream: static int, initialised to 1
    this.completed = false;
    this.infoFlag = 0;
    this.volumeOverallL = 1;
    this.volumeOverallR = 1;
    this.mono = false;
    this.stereoSwap = false;
    /* `paused` is an accessor (see the bottom of this file): the backing field is
     * _paused, and outGain ramps 0..1 so play/pause never steps the waveform. */
    this._paused = true;
    this._pausing = false;      /* a fade-out is in flight; render() finishes it */
    this.outGain = 0;
    this._pauseSample = 0;
    this._pauseUpdatePeriod = 1;
    this.peakL = 0; this.peakR = 0;
    this.rng = new XorRandom();
  }

  /* Replace the schedule. voicesSpec: [{type, mute, mono, entries:[...]}, ...] */
  Engine.prototype.setSchedule = function (voicesSpec) {
    this.voices = (voicesSpec || []).map(function (v) {
      return new Voice(v.type, v.entries, v);
    });
    this.currentSample = 0;
    this.updatePeriod = 1;
    this.calibrate();
    this.reset();
    return this;
  };

  /* upstream BB_CalibrateVoice, applied to every voice, then BB_FixVoiceDurations */
  Engine.prototype.calibrate = function () {
    var i, j, v, e, next, prev;
    this.totalDuration = 0;
    for (i = 0; i < this.voices.length; i++) {
      v = this.voices[i];
      v.totalDuration = 0;
      for (j = 0; j < v.entryCount; j++) {
        v.totalDuration += v.entries[j].duration;
        v.entries[j].absEnd = Math.floor(v.totalDuration * SAMPLE_RATE);
      }
      for (j = 0; j < v.entryCount; j++) {
        e = v.entries[j];
        next = (j + 1 >= v.entryCount) ? v.entries[0] : v.entries[j + 1];
        e.beatfreq_end_HALF = next.beatfreq_start_HALF;
        e.beatfreq_spread_HALF = e.beatfreq_end_HALF - e.beatfreq_start_HALF;
        e.basefreq_end = next.basefreq_start;
        e.basefreq_spread = e.basefreq_end - e.basefreq_start;
        e.volL_end = next.volL_start;
        e.volL_spread = e.volL_end - e.volL_start;
        e.volR_end = next.volR_start;
        e.volR_spread = e.volR_end - e.volR_start;
        prev = j - 1;
        e.absStart = (prev < 0) ? 0 : v.entries[prev].absEnd;
      }
      if (v.totalDuration > this.totalDuration) this.totalDuration = v.totalDuration;
    }
    /* upstream BB_FixVoiceDurations: extend shorter voices' last entry to match */
    for (i = 0; i < this.voices.length; i++) {
      v = this.voices[i];
      if (v.totalDuration < this.totalDuration && v.entryCount > 0) {
        v.entries[v.entryCount - 1].duration += (this.totalDuration - v.totalDuration);
        /* recompute this voice's absolute times after the extension */
        var acc = 0;
        for (j = 0; j < v.entryCount; j++) {
          acc += v.entries[j].duration;
          v.entries[j].absEnd = Math.floor(acc * SAMPLE_RATE);
          v.entries[j].absStart = (j === 0) ? 0 : v.entries[j - 1].absEnd;
        }
        v.totalDuration = acc;
      }
    }
    return this;
  };

  /* upstream BB_ResetAllVoices */
  Engine.prototype.resetAllVoices = function () {
    for (var i = 0; i < this.voices.length; i++) this.voices[i].curEntry = 0;
  };

  /* upstream BB_Reset */
  Engine.prototype.reset = function () {
    this.currentSample = 0;
    this.currentSampleLooped = 0;
    this.infoFlag &= ~FLAG_COMPLETED;
    this.loopCount = (this.loops === Infinity) ? Infinity : this.loops;
    this.completed = false;
    this.updatePeriod = 1;
    this.peakL = 0; this.peakR = 0;
    /* A reset is a fresh start. Paused: the next play fades in from silence, and
     * a fade-out already in flight is allowed to finish over the new schedule,
     * freezing at the new position rather than snapping the gain down. Playing:
     * the gain is left at 1 — a jump to 0 here would itself be the click. */
    if (this._paused) {
      if (this._pausing) { this._pauseSample = 0; this._pauseUpdatePeriod = 1; }
      else this.outGain = 0;
    }
    for (var i = 0; i < this.voices.length; i++) this.voices[i].reset();
    this.resetAllVoices();
    var r = this.rng; r.mcgn = 3677; r.srgn = 127;
  };

  /* ------------------------------------------------------------------ *
   * render(outL, outR, n) — the upstream BB_MainLoop, one sample at a time.
   * Fills two Float32Arrays with n samples. Returns {completed, flags}.
   * ------------------------------------------------------------------ */
  Engine.prototype.render = function (outL, outR, n) {
    /* Paused (or empty schedule): emit silence and HOLD position. This is a
       deliberate deviation from upstream, whose sample counter keeps advancing
       while its internal flag is set — for a user-facing pause we freeze.
       A paused engine still renders while a fade-out is in flight (_pausing), so
       the last few milliseconds decay instead of stopping dead. */
    if (!this.voices.length || (this._paused && !this._pausing)) {
      for (var z = 0; z < n; z++) { outL[z] = 0; outR[z] = 0; }
      return { completed: false, flags: 0 };
    }
    var updateperiod = this.updatePeriod;
    var sumL, sumR, Sample_left, Sample_right;
    var voice, v, nv = this.voices.length;
    var k, i;
    var completedNow = false;
    var rampStep = 1 / RAMP_SAMPLES;
    var frozen = false;           /* fade-out completed inside this block */
    var mixVoices = !this._paused || this._pausing;

    for (k = 0; k < n; k++) {
      updateperiod--;
      sumL = 0; sumR = 0;

      if (mixVoices) {
        for (voice = 0; voice < nv; voice++) {
          v = this.voices[voice];
          Sample_left = 0; Sample_right = 0;

          /* ##### periodic (every 16 samples) ##### */
          if (updateperiod === 0) {
            while (v.curEntry >= v.entryCount) { this.resetAllVoices(); v.curEntry = 0; }

            /* if the sample count was moved before curEntry (rare) */
            while (this.currentSample < v.entries[v.curEntry].absStart) {
              this.infoFlag |= FLAG_NEWENTRY;
              if (--v.curEntry < 0) v.curEntry = 0;
            }
            /* advance curEntry past finished entries */
            while (this.currentSample > v.entries[v.curEntry].absEnd) {
              this.infoFlag |= FLAG_NEWENTRY;
              v.curEntry++;
              if (v.curEntry >= v.entryCount) {
                this.currentSampleLooped += this.currentSample;
                this.currentSample = 0;
                this.resetAllVoices();
                this.infoFlag |= FLAG_NEWLOOP;
                if (this.loops !== Infinity) {   /* Infinity set late still never completes */
                  this.loopCount--;
                  if (this.loopCount <= 0) {
                    this.infoFlag |= FLAG_COMPLETED;
                    this.completed = true;
                    completedNow = true;
                  }
                }
                break;
              }
            }

            if (!v.mute) {
              var entry = v.entries[v.curEntry];
              var factor = 0;
              if (entry.duration !== 0) {
                factor = (this.currentSample - entry.absStart) / (entry.duration * SAMPLE_RATE);
              }
              v.curVolL = (entry.volL_spread * factor) + entry.volL_start;
              v.curVolR = (entry.volR_spread * factor) + entry.volR_start;

              if (v.type === VOICE_BINAURAL) {
                v.curBasefreq = (entry.basefreq_spread * factor) + entry.basefreq_start;
                v.curBeatfreqLFactor = v.curBeatfreqRFactor = (entry.beatfreq_spread_HALF * factor);
                var oldBeat = v.curBeatfreq;
                var newBeat = v.curBeatfreq = (v.curBeatfreqLFactor + entry.beatfreq_start_HALF) * 2;
                v.curBeatfreqLFactor = (v.curBasefreq + entry.beatfreq_start_HALF + v.curBeatfreqLFactor) * SAMPLE_FACTOR;
                v.curBeatfreqRFactor = (v.curBasefreq - entry.beatfreq_start_HALF - v.curBeatfreqRFactor) * SAMPLE_FACTOR;
                if (newBeat < 0.0001) newBeat = 0.0001;
                if (oldBeat !== newBeat) {
                  var pf = v.phaseSampleCount / v.phaseSampleCountStart;
                  v.phaseSampleCountStart = Math.floor(SAMPLERATE_HALF / newBeat);
                  v.phaseSampleCount = v.phaseSampleCountStart * pf;
                }
              } else if (v.type === VOICE_PINK || v.type === VOICE_WHITE || v.type === VOICE_BROWN) {
                /* noise voices: nothing periodic to recompute */
              } else if (v.type === VOICE_ISOPULSE || v.type === VOICE_ISOPULSE_ALT) {
                v.curBasefreq = (entry.basefreq_spread * factor) + entry.basefreq_start;
                var oldB = v.curBeatfreq;
                v.curBeatfreq = ((entry.beatfreq_spread_HALF * factor) + entry.beatfreq_start_HALF) * 2;
                if (v.curBeatfreq < 0.0001) v.curBeatfreq = 0.0001;
                v.curBeatfreqRFactor = v.curBeatfreqLFactor = v.curBasefreq * SAMPLE_FACTOR;
                if (oldB !== v.curBeatfreq) {
                  var pf2 = v.phaseSampleCount / v.phaseSampleCountStart;
                  v.phaseSampleCountStart = Math.floor(SAMPLERATE_HALF / v.curBeatfreq);
                  v.phaseSampleCount = v.phaseSampleCountStart * pf2;
                }
              }
            }
          }
          /* ##### per-sample ##### */
          if (!v.mute) {
            if (v.type === VOICE_BINAURAL) {
              v.sinPosL += v.curBeatfreqLFactor;
              if (v.sinPosL >= TWO_PI) v.sinPosL -= TWO_PI;
              v.sinPosR += v.curBeatfreqRFactor;
              if (v.sinPosR >= TWO_PI) v.sinPosR -= TWO_PI;
              v.sinL = Math.sin(v.sinPosL);
              Sample_left = v.sinL * SIN_SCALER;
              v.sinR = Math.sin(v.sinPosR);
              Sample_right = v.sinR * SIN_SCALER;
              if (1 > --v.phaseSampleCount) {
                v.phaseSampleCount = v.phaseSampleCountStart;
                v.phaseFlag = v.phaseFlag ? 0 : 1;
                v.phaseEnvelope = 0;
              }
            } else if (v.type === VOICE_PINK) {
              /* 1/f: Kellet 3-pole on independent draws per channel, DC-blocked
                 so the sub-audio part of 1/f cannot drift the mix. */
              Sample_left = dcBlock(v.dcL, pinkStep(v.pinkL, uniform(this.rng))) * PINK_SCALE;
              Sample_right = dcBlock(v.dcR, pinkStep(v.pinkR, uniform(this.rng))) * PINK_SCALE;
            } else if (v.type === VOICE_WHITE) {
              Sample_left = uniform(this.rng) * WHITE_SCALE;
              Sample_right = uniform(this.rng) * WHITE_SCALE;
            } else if (v.type === VOICE_BROWN) {
              /* leaky integrator: the 1/(1+LEAK) pole bounds the walk, so brown
                 cannot run away however long the session is. The DC blocker then
                 removes the residual offset the leak still allows. */
              v.brownL = (v.brownL + uniform(this.rng) * WHITE_SCALE * BROWN_LEAK) / (1 + BROWN_LEAK);
              v.brownR = (v.brownR + uniform(this.rng) * WHITE_SCALE * BROWN_LEAK) / (1 + BROWN_LEAK);
              Sample_left = dcBlock(v.dcL, v.brownL) * BROWN_GAIN;
              Sample_right = dcBlock(v.dcR, v.brownR) * BROWN_GAIN;
            } else if (v.type === VOICE_ISOPULSE || v.type === VOICE_ISOPULSE_ALT) {
              var alt = (v.type === VOICE_ISOPULSE_ALT) ? 1 : 0;
              v.sinPosL += v.curBeatfreqLFactor;
              if (v.sinPosL >= TWO_PI) v.sinPosL -= TWO_PI;
              v.sinPosR = v.sinPosL;
              if (1 > --v.phaseSampleCount) {
                v.phaseSampleCount = v.phaseSampleCountStart;
                v.phaseFlag = v.phaseFlag ? 0 : 1;
                v.phaseEnvelope = 0;
              }
              v.sinR = v.sinL = Math.sin(v.sinPosL);
              if (v.phaseFlag !== 0) {
                Sample_left = v.sinL * SIN_SCALER * (1.0 - v.phaseEnvelope);
                Sample_right = alt ? (v.sinL * SIN_SCALER * v.phaseEnvelope) : Sample_left;
              } else {
                Sample_left = v.sinL * SIN_SCALER * v.phaseEnvelope;
                Sample_right = alt ? (v.sinL * SIN_SCALER * (1.0 - v.phaseEnvelope)) : Sample_left;
              }
              if ((v.phaseEnvelope += 0.01) > 1) v.phaseEnvelope = 1;
            }
            /* stereo/mono mixing */
            if (!v.mono) {
              sumL += Sample_left * v.curVolL;
              sumR += Sample_right * v.curVolR;
            } else {
              Sample_left = (Sample_left + Sample_right) * 0.5;
              sumL += Sample_left * v.curVolL;
              sumR += Sample_left * v.curVolR;
            }
          }
        }
      }

      if (this.mono) { sumL = 0.5 * (sumL + sumR); sumR = sumL; }

      var outl, outr;
      if (!this.stereoSwap) {
        outl = sumL * this.volumeOverallL;
        outr = sumR * this.volumeOverallR;
      } else {
        outl = sumR * this.volumeOverallR;
        outr = sumL * this.volumeOverallL;
      }

      /* master start/stop ramp (see RAMP_SAMPLES): drive outGain toward the
         target one step per sample, so play and pause never step the waveform */
      var gainTarget = this._paused ? 0 : 1;
      if (this.outGain < gainTarget) {
        this.outGain += rampStep;
        if (this.outGain > gainTarget) this.outGain = gainTarget;
      } else if (this.outGain > gainTarget) {
        this.outGain -= rampStep;
        if (this.outGain < 0) this.outGain = 0;
      }
      outl *= this.outGain;
      outr *= this.outGain;

      var sl = outl / 32768, sr = outr / 32768;
      if (sl > 1) sl = 1; else if (sl < -1) sl = -1;      /* clamp (upstream wraps a short) */
      if (sr > 1) sr = 1; else if (sr < -1) sr = -1;
      outL[k] = sl; outR[k] = sr;

      var peak = Math.abs(outl | 0);
      if (peak > this.peakL) this.peakL = peak;
      peak = Math.abs(outr | 0);
      if (peak > this.peakR) this.peakR = peak;

      if (updateperiod === 0) {
        updateperiod = UPDATE_PERIOD_SAMPLES;
        this.currentSample += UPDATE_PERIOD_SAMPLES;
      }

      /* the fade-out has reached silence: hold the position the pause started at
         and stop mixing for the rest of this block */
      if (this._pausing && this.outGain === 0) {
        this._pausing = false;
        this.currentSample = this._pauseSample;
        this.updatePeriod = this._pauseUpdatePeriod;
        for (var zf = k + 1; zf < n; zf++) { outL[zf] = 0; outR[zf] = 0; }
        frozen = true;
        break;
      }
    }

    if (!frozen) this.updatePeriod = updateperiod;
    return { completed: completedNow, flags: this.infoFlag };
  };

  /* Total rendered seconds for the current schedule. */
  Engine.prototype.duration = function () {
    return this.totalDuration;
  };

  /* ------------------------------------------------------------------ *
   * paused — a real accessor, because a pause has to fade, not cut.
   * Assigning true starts the 10 ms fade-out: render() keeps mixing until
   * outGain reaches 0, then restores the position the pause began at and holds
   * there. Assigning false cancels any fade-out in flight and ramps back up.
   * Callers keep writing engine.paused = true/false exactly as before
   * (app.js and worklet-processor.js both do), so no caller changes.
   * ------------------------------------------------------------------ */
  Object.defineProperty(Engine.prototype, "paused", {
    get: function () { return this._paused; },
    set: function (on) {
      on = !!on;
      if (on) {
        if (this._paused) return;
        this._paused = true;
        if (this.outGain > 0) {
          this._pausing = true;
          this._pauseSample = this.currentSample;
          this._pauseUpdatePeriod = this.updatePeriod;
        }
      } else {
        this._paused = false;
        this._pausing = false;   /* a fade-out in flight becomes a fade back up */
      }
    },
    enumerable: true,
    configurable: true
  });

  /* ------------------------------------------------------------------ *
   * Noise sources as API.
   * A noise voice is an ordinary schedule voice — {type, mute, mono, entries}
   * — the same object shape new Voice() consumes and the same shape the page's
   * "build a tone" panel writes, so it mixes with carriers through the one
   * existing path. noiseVoice() is only a convenience that wraps that shape in
   * a fade-in / hold / fade-out envelope, so a bare source never starts or
   * stops on a step of its own.
   * ------------------------------------------------------------------ */
  var NOISE_TYPES = { white: VOICE_WHITE, pink: VOICE_PINK, brown: VOICE_BROWN };

  function noiseVoice(colour, opts) {
    opts = opts || {};
    var type = NOISE_TYPES[String(colour).toLowerCase()];
    if (type === undefined) throw new Error("unknown noise colour: " + colour);
    var vol = num(opts.vol, 0.3);
    var volR = num(opts.volR, vol);
    var duration = num(opts.duration, 600);
    var fadeIn = Math.min(num(opts.fadeIn, 3), duration / 2);
    var fadeOut = Math.min(num(opts.fadeOut, 3), duration / 2);
    var hold = Math.max(0.01, duration - fadeIn - fadeOut);
    return {
      type: type,
      mute: !!opts.mute,
      mono: !!opts.mono,
      /* Same three-entry idiom as presets.js's shape(): entry k ramps into entry
         k+1's start values, so the hold repeats its volume (flat) and only the
         last entry — wrapping to entry 0's zero — fades out. */
      entries: [
        { duration: fadeIn, volL: 0, volR: 0, basefreq: 0, beat: 0 },
        { duration: hold, volL: vol, volR: volR, basefreq: 0, beat: 0 },
        { duration: fadeOut, volL: vol, volR: volR, basefreq: 0, beat: 0 }
      ]
    };
  }

  var api = {
    SAMPLE_RATE: SAMPLE_RATE,
    VOICE_BINAURAL: VOICE_BINAURAL,
    VOICE_PINK: VOICE_PINK,
    VOICE_PCM: VOICE_PCM,
    VOICE_ISOPULSE: VOICE_ISOPULSE,
    VOICE_ISOPULSE_ALT: VOICE_ISOPULSE_ALT,
    VOICE_WHITE: VOICE_WHITE,
    VOICE_BROWN: VOICE_BROWN,
    NOISE_TYPES: NOISE_TYPES,
    noiseVoice: noiseVoice,
    FLAG_COMPLETED: FLAG_COMPLETED,
    FLAG_NEWLOOP: FLAG_NEWLOOP,
    FLAG_NEWENTRY: FLAG_NEWENTRY,
    Engine: Engine,
    Voice: Voice,
    Entry: Entry
  };

  if (typeof globalThis !== "undefined") globalThis.GnauralEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
