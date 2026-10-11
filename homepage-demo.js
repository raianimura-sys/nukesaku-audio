import { AudioEngine } from './harmony/audio.js';
import { makeChord, totalBeats } from './harmony/music.js';

const instances = new WeakMap();
const patterns = {
  simple: { id: 'steady8', label: '8分刻み' },
  complex: { id: 'funk16', label: '16分ファンク' },
};

/** A small, gesture-only preview using HARMONY's shared music and stop engine. */
export function initHomepageDemo(root = document, audio = new AudioEngine()) {
  if (instances.has(root)) return instances.get(root);
  const play = root.querySelector('#demo-play');
  const status = root.querySelector('#demo-status');
  if (!play || !status) return null;
  const playLabel = play.querySelector('[data-play-label]');
  const idleLabel = playLabel?.textContent.trim() || '試聴する';
  const progress = root.querySelector('#demo-progress');
  const meter = root.querySelector('#demo-meter');
  const chordElements = [...root.querySelectorAll('#demo-sequence [data-demo-chord]')];
  const patternButtons = [...root.querySelectorAll('button[data-demo-pattern]')];
  const view = root.defaultView || globalThis.window;
  const chords = [[0, 'maj7'], [9, 'min7'], [5, 'maj7'], [7, 'dom7']]
    .map(([pitch, quality]) => ({ ...makeChord(pitch, quality), beats: 4, octave: 4, velocity: 68 }));
  const length = totalBeats(chords);
  let selection = 'simple';
  let phase = 'idle';
  let generation = 0;
  let destroyed = false;

  function showChord(index = -1) {
    for (const element of chordElements) {
      const active = Number(element.dataset.demoChord) === index;
      element.classList.toggle('is-playing', active);
      if (active) element.setAttribute('aria-current', 'true');
      else element.removeAttribute('aria-current');
    }
  }

  function showTransport(active, sounding = false) {
    play.classList.toggle('is-playing', active);
    play.setAttribute('aria-pressed', String(active));
    play.setAttribute('aria-label', active ? 'プレビューを停止' : 'コード進行を試聴');
    if (playLabel) playLabel.textContent = active ? '停止する' : idleLabel;
    meter?.classList.toggle('is-playing', sounding);
  }

  function setProgress(beat = 0) {
    if (progress) progress.style.transform = `scaleX(${Math.max(0, Math.min(1, beat / length))})`;
  }

  function stop(message = `${patterns[selection].label} · 100 BPM · 4小節`) {
    // Invalidate callbacks before panic-stop invokes the engine's onStop callback.
    generation++;
    phase = 'idle';
    audio.stop();
    showTransport(false);
    showChord();
    setProgress();
    status.textContent = message;
  }

  async function start() {
    if (destroyed || root.hidden) return;
    const token = ++generation;
    const pattern = patterns[selection];
    phase = 'starting';
    showTransport(true);
    showChord();
    setProgress();
    status.textContent = '音を準備しています…';
    const isCurrent = () => !destroyed && token === generation;
    try {
      const accepted = await audio.start(chords, {
        bpm: 100, meter: 4, pattern: pattern.id, gate: 1,
        variation: 0, density: 1, accent: .5, humanize: 0, swing: 0,
        // The shared engine's piano, played softly, provides this demo's soft piano sound.
        instrument: 'piano', volume: .52, octave: 0, bass: true,
        loop: false, metronome: false,
      }, {
        onChord: index => { if (isCurrent()) showChord(index); },
        onBeat: beat => {
          if (!isCurrent()) return;
          setProgress(beat);
          if (phase === 'starting' && audio.isPlaying) {
            phase = 'playing';
            showTransport(true, true);
            status.textContent = `${pattern.label}を再生中 · 100 BPM`;
          }
        },
        onStop: () => { if (isCurrent()) stop('試聴が終わりました。'); },
      });
      if (!isCurrent()) return;
      if (!accepted || !audio.isPlaying) {
        stop('再生を開始できませんでした。もう一度お試しください。');
        return;
      }
      phase = 'playing';
      showTransport(true, true);
      status.textContent = `${pattern.label}を再生中 · 100 BPM`;
    } catch {
      if (isCurrent()) stop('音声を再生できませんでした。もう一度お試しください。');
    }
  }

  function togglePlay() {
    if (phase !== 'idle' || audio.isPlaying) stop('試聴を停止しました。');
    else void start();
  }

  const patternListeners = patternButtons.map(button => {
    const listener = () => {
      const next = button.dataset.demoPattern;
      if (!patterns[next] || next === selection) return;
      stop();
      selection = next;
      for (const option of patternButtons) option.setAttribute('aria-pressed', String(option.dataset.demoPattern === selection));
      status.textContent = `${patterns[selection].label} · 100 BPM · 4小節`;
    };
    button.addEventListener('click', listener);
    return { button, listener };
  });
  function onHidden() {
    if (root.hidden && (phase !== 'idle' || audio.isPlaying)) stop('試聴を停止しました。');
  }
  function onPageHide() { stop(); }
  play.addEventListener('click', togglePlay);
  root.addEventListener('visibilitychange', onHidden);
  view?.addEventListener('pagehide', onPageHide);

  const controller = {
    stop,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      play.removeEventListener('click', togglePlay);
      root.removeEventListener('visibilitychange', onHidden);
      view?.removeEventListener('pagehide', onPageHide);
      for (const { button, listener } of patternListeners) button.removeEventListener('click', listener);
      instances.delete(root);
    },
  };
  instances.set(root, controller);
  showTransport(false);
  showChord();
  setProgress();
  for (const button of patternButtons) button.setAttribute('aria-pressed', String(button.dataset.demoPattern === selection));
  status.textContent = `${patterns[selection].label} · 100 BPM · 4小節`;
  return controller;
}

if (typeof document !== 'undefined') initHomepageDemo(document);
