import {MODES, QUALITIES, PATTERNS, makeChord} from './music.js?v=1.4.0';

const uid = () => globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const number = (value, fallback, min, max) => value !== null && value !== '' && Number.isFinite(Number(value))
  ? Math.min(max, Math.max(min, Number(value))) : fallback;

export function createProject() {
  return {
    version: 2, id: uid(), title: 'Untitled progression', key: 0, mode: 'major', extension: '7th', selected: 0,
    chords: [makeChord(0, 'maj7'), makeChord(9, 'min7'), makeChord(5, 'maj7'), makeChord(7, 'dom7')],
    settings: {bpm: 120, meter: 4, pattern: 'block', gate: 1, swing: 0, humanize: 0, bass: true,
      octave: 0, instrument: 'piano', volume: .65, loop: true, metronome: false,
      variation: 0, density: 1, accent: .5},
  };
}

/** Load old projects without changing their chord qualities or deliberate articulation. */
export function validateProject(raw) {
  if (!raw || !Array.isArray(raw.chords) || raw.chords.length > 128) throw new Error('有効なHARMONYプロジェクトではありません。');
  const d = createProject();
  const chords = raw.chords.map(c => {
    if (!c || !Object.hasOwn(QUALITIES, c.quality) || c.root === null || !Number.isFinite(Number(c.root))) {
      throw new Error('コードデータを読み込めませんでした。');
    }
    const chord = makeChord(Math.round(Number(c.root)), c.quality);
    return {...chord, id: typeof c.id === 'string' && c.id.length <= 100 ? c.id : chord.id,
      beats: number(c.beats, 4, .5, 8), octave: Math.round(number(c.octave, 4, -1, 8)),
      velocity: Math.round(number(c.velocity, 90, 1, 127)),
      inversion: Math.min(QUALITIES[c.quality].intervals.length - 1, Math.round(number(c.inversion, 0, 0, 4)))};
  });
  const s = raw.settings ?? {};
  const legacyGate = Number(raw.version ?? 1) < 2 && (s.gate == null || Number(s.gate) === .88);
  return {...d, id: typeof raw.id === 'string' ? raw.id.slice(0, 100) : d.id,
    title: typeof raw.title === 'string' ? raw.title.slice(0, 60) : d.title,
    key: Math.round(number(raw.key, 0, 0, 11)), mode: MODES.some(m => m.id === raw.mode) ? raw.mode : 'major',
    extension: ['triad', '7th', '9th'].includes(raw.extension) ? raw.extension : '7th',
    selected: chords.length ? Math.min(chords.length - 1, Math.round(number(raw.selected, 0, 0, 127))) : -1,
    chords, settings: {...d.settings,
      bpm: Math.round(number(s.bpm, 120, 40, 240)), meter: [3, 4, 6].includes(Number(s.meter)) ? Number(s.meter) : 4,
      pattern: PATTERNS.some(p => p.id === s.pattern) ? s.pattern : 'block',
      gate: legacyGate ? 1 : number(s.gate, 1, .1, 1), swing: number(s.swing, 0, 0, .5),
      humanize: number(s.humanize, 0, 0, 1), octave: Math.round(number(s.octave, 0, -2, 2)),
      volume: number(s.volume, .65, 0, 1), bass: s.bass !== false, loop: s.loop !== false,
      metronome: s.metronome === true, instrument: ['piano', 'rhodes', 'pad', 'pluck'].includes(s.instrument) ? s.instrument : 'piano',
      variation: Math.round(number(s.variation, 0, 0, 15)), density: number(s.density, 1, .3, 1),
      accent: number(s.accent, .5, 0, 1)},
  };
}
