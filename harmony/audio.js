import { arrangementEvents, totalBeats, chordNotes } from './music.js?v=2.1.1';

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const frequency = pitch => 440 * Math.pow(2, (pitch - 69) / 12);
const defaults = {
  bpm: 110, meter: 4, pattern: 'block', gate: 1, swing: 0, humanize: 0,
  bass: true, octave: 0, instrument: 'piano', volume: .72, loop: true, metronome: false,
};

/** A dependency-free, gesture-unlocked musical playback engine. */
export class AudioEngine {
  constructor() {
    this._context = null;
    this._playing = false;
    this._lastBeat = 0;
    this._generation = 0;
    this._voices = new Set();
    this._volume = defaults.volume;
    this._settings = { ...defaults };
    this._callbacks = {};
    this._scheduler = null;
    this._animation = null;
    this._cleanup = null;
    this._graph = null;
    this._retiredGraphs = new Set();
    this._resumePromise = null;
  }

  get isPlaying() { return this._playing; }

  get currentBeat() {
    if (!this._playing || !this._context) return this._lastBeat;
    const elapsed = Math.max(0, (this._context.currentTime - this._origin) / this._secondsPerBeat);
    return this._settings.loop ? elapsed % this._length : Math.min(this._length, elapsed);
  }

  setVolume(value) {
    this._volume = clamp(value, 0, 1);
    if (this._master) this._master.gain.setTargetAtTime(this._volume * .85, this._context.currentTime, .018);
  }

  async _unlock(generation = this._generation) {
    if (!this._context || this._context.state === 'closed') {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) throw new Error('このブラウザは音声再生に対応していません。');
      this._context = new AudioContextClass({ latencyHint: 'interactive' });
      const ctx = this._context;
      this._resumePromise = null;
      this._initializeTimbres();
      ctx.addEventListener('statechange', () => {
        if (ctx !== this._context) return;
        if (ctx.state === 'running' && this._playing) this._tick(this._generation);
        if (ctx.state === 'closed') this.stop();
      });
    }
    const ctx = this._context;
    if (ctx.state !== 'running') {
      if (!this._resumePromise) this._resumePromise = Promise.resolve(ctx.resume());
      const pending = this._resumePromise;
      try { await pending; }
      catch (error) {
        if (generation !== this._generation) return null;
        throw error;
      } finally {
        if (this._resumePromise === pending) this._resumePromise = null;
      }
    }
    if (generation !== this._generation || ctx !== this._context) return null;
    if (ctx.state !== 'running') throw new Error('音声を開始できませんでした。もう一度再生してください。');
    if (!this._graph) this._createGraph();
    return ctx;
  }

  _initializeTimbres() {
    this._impulseBuffer = this._impulse(1.65);
    this._pianoWave = this._wave([0, 1, .26, .14, .075, .045, .023, .018, .012, .008, .006, .004]);
    this._pianoSoftWave = this._wave([0, 1, .16, .055, .025, .012, .006]);
    this._rhodesWave = this._wave([0, 1, .03, .12, .008, .026, 0, .006]);
  }

  _createGraph() {
    const ctx = this._context;
    this._dry = ctx.createGain();
    this._reverbInput = ctx.createGain();
    this._convolver = ctx.createConvolver();
    this._convolver.buffer = this._impulseBuffer;
    this._reverb = ctx.createGain();
    this._reverb.gain.value = .22;
    this._compressor = ctx.createDynamicsCompressor();
    this._compressor.threshold.value = -16;
    this._compressor.knee.value = 18;
    this._compressor.ratio.value = 3;
    this._compressor.attack.value = .008;
    this._compressor.release.value = .18;
    this._master = ctx.createGain();
    this._master.gain.value = this._volume * .85;
    this._dry.connect(this._compressor);
    this._reverbInput.connect(this._convolver);
    this._convolver.connect(this._reverb);
    this._reverb.connect(this._compressor);
    this._compressor.connect(this._master);
    this._master.connect(ctx.destination);
    this._graph = { nodes: [this._dry, this._reverbInput, this._convolver, this._reverb, this._compressor, this._master], master: this._master };
  }

  _disconnect(nodes) {
    for (const node of nodes) { try { node.disconnect(); } catch { /* Already disconnected. */ } }
  }

  _retireGraph(voices) {
    const graph = this._graph;
    if (graph) {
      const now = this._context.currentTime;
      if (graph.master.gain.cancelAndHoldAtTime) graph.master.gain.cancelAndHoldAtTime(now);
      else graph.master.gain.cancelScheduledValues(now);
      graph.master.gain.linearRampToValueAtTime(0, now + .008);
      // A new playback gets a fresh effect graph; the old convolution can never return.
      graph.nodes.push(...voices.flatMap(voice => voice.nodes));
      this._retiredGraphs.add(graph);
      graph.timer = setTimeout(() => {
        this._disconnect(graph.nodes);
        this._retiredGraphs.delete(graph);
      }, 24);
    } else this._disconnect(voices.flatMap(voice => voice.nodes));
    this._graph = null;
    this._dry = this._reverbInput = this._convolver = this._reverb = this._compressor = this._master = null;
  }

  _wave(partials) {
    return this._context.createPeriodicWave(new Float32Array(partials.length), Float32Array.from(partials));
  }

  _impulse(seconds) {
    const ctx = this._context;
    const buffer = ctx.createBuffer(2, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
    // A deterministic, gently damped stereo room, with no sample downloads.
    let seed = 1979;
    for (let channel = 0; channel < 2; channel++) {
      const samples = buffer.getChannelData(channel);
      let previous = 0;
      for (let i = 0; i < samples.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const noise = seed / 2147483648 - 1;
        previous = previous * .58 + noise * .42;
        const time = i / ctx.sampleRate;
        samples[i] = time < .018 ? 0 : previous * Math.pow(1 - i / samples.length, 3.2);
      }
    }
    return buffer;
  }

  async start(chords, settings = {}, callbacks = {}) {
    this.stop();
    const generation = this._generation;
    const options = { ...defaults, ...settings };
    options.bpm = clamp(options.bpm, 30, 300);
    if (!Array.isArray(chords) || !chords.length) return false;
    const length = Number(totalBeats(chords, options));
    if (!Number.isFinite(length) || length <= 0) return false;
    const events = arrangementEvents(chords, options)
      .filter(event => Number.isFinite(event.pitch) && Number.isFinite(event.startBeat) && event.startBeat < length)
      .sort((a, b) => a.startBeat - b.startBeat);
    const context = await this._unlock(generation);
    if (!context || generation !== this._generation) return false;
    this._settings = options;
    this.setVolume(options.volume);
    this._callbacks = callbacks;
    this._events = events;
    this._length = length;
    this._secondsPerBeat = 60 / options.bpm;
    this._origin = this._context.currentTime + .07;
    this._cycle = 0;
    this._eventIndex = 0;
    this._nextClick = 0;
    this._lastChord = -1;
    this._lastBeat = 0;
    this._spans = [];
    let cursor = 0;
    chords.forEach((chord, index) => {
      const duration = Number(totalBeats([chord], options));
      this._spans.push({ index, start: cursor, end: cursor + duration });
      cursor += duration;
    });
    this._playing = true;
    this._tick(generation);
    if (!this._playing || generation !== this._generation) return false;
    this._scheduler = setInterval(() => this._tick(generation), 25);
    this._animate(generation);
    return this._playing && generation === this._generation;
  }

  _tick(generation = this._generation) {
    if (generation !== this._generation || !this._playing || !this._context || this._context.state !== 'running') return;
    const now = this._context.currentTime;
    const horizon = now + .15;
    const cycleSeconds = this._length * this._secondsPerBeat;
    // A background-tab delay skips elapsed notes instead of replaying them in a burst.
    if (this._settings.loop && now > this._origin + (this._cycle + 1) * cycleSeconds) {
      this._cycle = Math.floor((now - this._origin) / cycleSeconds);
      this._eventIndex = 0;
    }
    if (this._events.length) {
      let scheduled = 0;
      while (scheduled++ < 1024) {
        if (this._eventIndex >= this._events.length) {
          if (!this._settings.loop) break;
          this._eventIndex = 0;
          this._cycle++;
        }
        const event = this._events[this._eventIndex];
        const at = this._origin + (this._cycle * this._length + event.startBeat) * this._secondsPerBeat;
        if (at > horizon) break;
        this._eventIndex++;
        if (at < now - .05) continue;
        this._note(event.pitch, Math.max(now, at), Math.max(.025, event.durationBeats * this._secondsPerBeat),
          event.velocity, event.track === 'bass' ? 'bass' : this._settings.instrument);
      }
    }
    if (this._settings.metronome) this._scheduleClicks(now, horizon);
    if (!this._settings.loop && now >= this._origin + cycleSeconds) this._finish(generation);
    this._prune();
  }

  _scheduleClicks(now, horizon) {
    const compound = Number(this._settings.meter) === 6;
    const subdivision = compound ? .5 : 1;
    const measure = compound ? 3 : Number(this._settings.meter) === 3 ? 3 : 4;
    const elapsed = Math.max(0, (now - this._origin) / this._secondsPerBeat);
    this._nextClick = Math.max(this._nextClick, Math.ceil((elapsed - .03) / subdivision) * subdivision);
    while (this._origin + this._nextClick * this._secondsPerBeat <= horizon) {
      if (!this._settings.loop && this._nextClick >= this._length) break;
      const at = this._origin + this._nextClick * this._secondsPerBeat;
      const position = this._nextClick % measure;
      if (at >= now - .03) this._click(Math.max(now, at), position < .001, compound && Math.abs(position - 1.5) < .001);
      this._nextClick += subdivision;
    }
  }

  _animate(generation = this._generation) {
    if (generation !== this._generation || !this._playing) return;
    const beat = this.currentBeat;
    this._lastBeat = beat;
    const active = this._spans.find(span => beat >= span.start && beat < span.end);
    if (active && active.index !== this._lastChord) {
      this._lastChord = active.index;
      this._safeCallback('onChord', active.index, generation);
    }
    if (generation !== this._generation || !this._playing) return;
    this._safeCallback('onBeat', beat, generation);
    if (generation === this._generation && this._playing) this._animation = requestAnimationFrame(() => this._animate(generation));
  }

  _safeCallback(name, value, generation = this._generation) {
    if (generation !== this._generation) return;
    try { this._callbacks[name]?.(value); }
    catch (error) { console.error(`AudioEngine ${name}:`, error); }
  }

  _finish(generation = this._generation) {
    if (generation !== this._generation || !this._playing) return;
    this._playing = false;
    clearInterval(this._scheduler);
    cancelAnimationFrame(this._animation);
    this._scheduler = null;
    this._animation = null;
    this._lastBeat = this._length;
    this._safeCallback('onBeat', this._length, generation);
    this._safeCallback('onStop', undefined, generation);
    if (generation === this._generation) this._callbacks = {};
  }

  stop() {
    const wasPlaying = this._playing;
    this._generation++;
    this._playing = false;
    clearInterval(this._scheduler);
    if (this._animation !== null) cancelAnimationFrame(this._animation);
    this._scheduler = null;
    this._animation = null;
    this._lastBeat = 0;
    clearInterval(this._cleanup);
    this._cleanup = null;
    const voices = [...this._voices];
    this._voices.clear();
    if (this._context) {
      const now = this._context.currentTime;
      for (const voice of voices) {
        if (voice.amplitude.gain.cancelAndHoldAtTime) voice.amplitude.gain.cancelAndHoldAtTime(now);
        else voice.amplitude.gain.cancelScheduledValues(now);
        voice.amplitude.gain.linearRampToValueAtTime(0, now + .008);
        for (const source of voice.sources) {
          try { source.stop(now + .008); } catch { /* Already ended. */ }
        }
      }
      this._retireGraph(voices);
    }
    if (wasPlaying) this._safeCallback('onStop');
    this._callbacks = {};
  }

  async preview(chord, settings = {}) {
    const generation = this._generation;
    const options = { ...this._settings, ...settings };
    const context = await this._unlock(generation);
    if (!context || generation !== this._generation) return false;
    if (!this._playing && settings.volume !== undefined) this.setVolume(settings.volume);
    const notes = chordNotes(chord, options);
    const at = this._context.currentTime + .015;
    notes.forEach((pitch, index) => this._note(pitch, at + index * .012, .63, .72, options.instrument));
    if (options.bass) {
      const bass = arrangementEvents([{ ...chord, beats: 1 }], { ...options, pattern: 'block', humanize: 0, swing: 0 })
        .find(event => event.track === 'bass');
      if (bass) this._note(bass.pitch, at, .63, .62, 'bass');
    }
    return true;
  }

  async previewNote(pitch, settings = {}) {
    const note = Number(pitch);
    if (!Number.isFinite(note) || note < 0 || note > 127) return false;
    const generation = this._generation;
    const options = { ...this._settings, ...settings };
    const context = await this._unlock(generation);
    if (!context || generation !== this._generation) return false;
    if (!this._playing && settings.volume !== undefined) this.setVolume(settings.volume);
    this._note(Math.round(note), this._context.currentTime + .015, .63, .72, options.instrument);
    return true;
  }

  _note(pitch, at, duration, velocity = .75, instrument = 'piano') {
    if (!Number.isFinite(pitch) || pitch < 0 || pitch > 127) return;
    const ctx = this._context;
    const freq = frequency(pitch);
    const vel = Number(velocity) > 1 ? Number(velocity) / 127 : Number(velocity);
    if (vel <= 0) return;
    const strength = Math.sqrt(clamp(Number.isFinite(vel) ? vel : .7, .015, 1));
    const kind = ['piano', 'rhodes', 'pad', 'pluck', 'bass'].includes(instrument) ? instrument : 'piano';
    const amplitude = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const send = ctx.createGain();
    const nodes = [amplitude, filter, send];
    const sources = [];
    filter.type = 'lowpass';
    filter.Q.value = .65;
    filter.connect(amplitude);
    if(ctx.createStereoPanner){
      const pan=ctx.createStereoPanner();pan.pan.value=kind==='bass'?0:clamp((pitch-60)/48,-.38,.38);
      amplitude.connect(pan);pan.connect(this._dry);nodes.push(pan);
    }else amplitude.connect(this._dry);
    amplitude.connect(send);
    send.connect(this._reverbInput);
    send.gain.value = kind === 'bass' ? .025 : kind === 'pad' ? .32 : .16;
    const source = (type, relative = 1, gain = 1, detune = 0, wave = null) => {
      const osc = ctx.createOscillator();
      const level = ctx.createGain();
      if (wave) osc.setPeriodicWave(wave); else osc.type = type;
      osc.frequency.value = freq * relative;
      osc.detune.value = detune;
      level.gain.value = gain;
      osc.connect(level);
      level.connect(filter);
      sources.push(osc);
      nodes.push(osc, level);
      return level;
    };
    let attack = .005, release = .2, peak = .14 * strength, sustain = .3;
    if (kind === 'piano') {
      // Slightly separated strings and a short, velocity-dependent hammer spectrum.
      const wave=vel<.58?this._pianoSoftWave:this._pianoWave;
      source('sine', 1, .46, -1.8, wave);
      source('sine', 1, .46, 1.6, wave);
      const overtone = source('sine', 2.002, .075 * strength);
      overtone.gain.setValueAtTime(.075 * strength, at);
      overtone.gain.exponentialRampToValueAtTime(.0001, at + .17);
      const hammer=source('sine', 3.008, .035*strength);
      hammer.gain.setValueAtTime(.035*strength,at);hammer.gain.exponentialRampToValueAtTime(.0001,at+.055);
      filter.frequency.setValueAtTime(Math.min(15000, 1700 + freq * 4 + vel * 4300), at);
      filter.frequency.exponentialRampToValueAtTime(Math.max(800, freq * 2.2), at + Math.min(duration, 1.35));
      release = .28;
      sustain = .42;
    } else if (kind === 'rhodes') {
      source('sine', 1, .48, -2.2, this._rhodesWave);
      source('sine', 1, .48, 2.2, this._rhodesWave);
      const tine = source('sine', 7.01, .035 * vel);
      tine.gain.setValueAtTime(.035 * vel, at);
      tine.gain.exponentialRampToValueAtTime(.0001, at + .24);
      filter.frequency.setValueAtTime(Math.min(11000, freq * 7 + 1000+vel*2200),at);
      filter.frequency.exponentialRampToValueAtTime(Math.max(700,freq*3),at+Math.min(duration,1.5));
      peak = .15 * strength;
      release = .36;
      sustain = .48;
    } else if (kind === 'pad') {
      source('triangle', 1, .5, -5);
      source('triangle', 1, .5, 5);
      source('sine', .5, .14);
      attack = Math.min(.18, duration * .28);
      release = .48;
      peak = .11 * strength;
      sustain = .88;
      filter.frequency.setValueAtTime(Math.min(7000, freq * 5 + 500), at);
      filter.frequency.linearRampToValueAtTime(Math.min(9000, freq * 7 + 1000), at + attack);
    } else if (kind === 'pluck') {
      source('triangle', 1, .7);
      source('sawtooth', 1, .17, 2);
      filter.frequency.setValueAtTime(Math.min(14000, freq * 14), at);
      filter.frequency.exponentialRampToValueAtTime(Math.max(450, freq * 1.8), at + Math.min(.3, duration));
      peak = .16 * strength;
      sustain = .08;
      release = .14;
    } else {
      source('sine', 1, .85);
      source('triangle', 1, .25);
      filter.frequency.value = Math.max(300, freq * 4);
      peak = .19 * strength;
      sustain = .7;
      release = .12;
    }
    // Avoid high notes dominating the mix while keeping the bass present.
    peak *= Math.min(1, Math.pow(440 / Math.max(freq, 440), .18));
    const hold = at + Math.max(attack + .012, duration);
    const decay = Math.min(kind === 'pad' ? .25 : .32, Math.max(.015, duration * .65));
    amplitude.gain.setValueAtTime(.0001, at);
    amplitude.gain.exponentialRampToValueAtTime(Math.max(.001, peak), at + attack);
    amplitude.gain.exponentialRampToValueAtTime(Math.max(.0002, peak * sustain), Math.min(hold, at + attack + decay));
    const naturalDecay = kind === 'piano' ? Math.exp(-duration / 2.1)
      : kind === 'rhodes' ? Math.exp(-duration / 3.2)
      : kind === 'pluck' ? Math.exp(-duration / .75) : 1;
    const heldLevel = Math.max(.0002, peak * sustain * naturalDecay);
    amplitude.gain.exponentialRampToValueAtTime(heldLevel, hold);
    amplitude.gain.exponentialRampToValueAtTime(.0001, hold + release);
    const end = hold + release + .035;
    for (const osc of sources) { osc.start(at); osc.stop(end); }
    this._registerVoice({ amplitude, sources, nodes, end });
  }

  _click(at, accent, secondary) {
    const ctx = this._context;
    const oscillator = ctx.createOscillator();
    const amplitude = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(accent ? 1500 : secondary ? 1150 : 950, at);
    oscillator.frequency.exponentialRampToValueAtTime(650, at + .025);
    amplitude.gain.setValueAtTime(.0001, at);
    amplitude.gain.exponentialRampToValueAtTime(accent ? .105 : .065, at + .002);
    amplitude.gain.exponentialRampToValueAtTime(.0001, at + .055);
    oscillator.connect(amplitude);
    amplitude.connect(this._dry);
    oscillator.start(at);
    oscillator.stop(at + .065);
    this._registerVoice({ amplitude, sources: [oscillator], nodes: [oscillator, amplitude], end: at + .08 });
  }

  _registerVoice(voice) {
    this._voices.add(voice);
    if (this._voices.size > 96) {
      const oldest = this._voices.values().next().value;
      for (const source of oldest.sources) { try { source.stop(); } catch { /* Already ended. */ } }
      for (const node of oldest.nodes) { try { node.disconnect(); } catch { /* Already disconnected. */ } }
      this._voices.delete(oldest);
    }
    if (!this._cleanup) this._cleanup = setInterval(() => this._prune(), 300);
  }

  _prune() {
    if (!this._context) return;
    for (const voice of this._voices) {
      if (voice.end > this._context.currentTime) continue;
      for (const node of voice.nodes) { try { node.disconnect(); } catch { /* Already disconnected. */ } }
      this._voices.delete(voice);
    }
    if (!this._voices.size && this._cleanup) {
      clearInterval(this._cleanup);
      this._cleanup = null;
    }
  }
}
