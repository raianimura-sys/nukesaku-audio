/**
 * Shared, dependency-free harmony and MIDI engine.
 * Times are quarter-note beats. C4 is MIDI 60. `settings.octave` is an
 * octave offset; each chord's own `octave` selects its register.
 */
export const NOTE_NAMES = Object.freeze(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']);
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const FLAT_KEYS = new Set([1, 3, 5, 6, 8, 10]);

export const MODES = Object.freeze([
  { id: 'major', label: 'メジャー', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'minor', label: 'マイナー', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'dorian', label: 'ドリアン', intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'mixolydian', label: 'ミクソリディアン', intervals: [0, 2, 4, 5, 7, 9, 10] },
].map(mode => Object.freeze({ ...mode, intervals: Object.freeze(mode.intervals) })));

export const QUALITIES = Object.freeze(Object.fromEntries([
  ['maj', 'メジャー', '', [0, 4, 7]],
  ['min', 'マイナー', 'm', [0, 3, 7]],
  ['dim', 'ディミニッシュ', 'dim', [0, 3, 6]],
  ['aug', 'オーギュメント', 'aug', [0, 4, 8]],
  ['maj7', 'メジャー7', 'maj7', [0, 4, 7, 11]],
  ['min7', 'マイナー7', 'm7', [0, 3, 7, 10]],
  ['dom7', 'ドミナント7', '7', [0, 4, 7, 10]],
  ['m7b5', 'ハーフディミニッシュ', 'm7♭5', [0, 3, 6, 10]],
  ['dim7', 'ディミニッシュ7', 'dim7', [0, 3, 6, 9]],
  ['sus2', 'サス2', 'sus2', [0, 2, 7]],
  ['sus4', 'サス4', 'sus4', [0, 5, 7]],
  ['add9', 'アド9', 'add9', [0, 4, 7, 14]],
  ['maj9', 'メジャー9', 'maj9', [0, 4, 7, 11, 14]],
  ['min9', 'マイナー9', 'm9', [0, 3, 7, 10, 14]],
  ['min7b9', 'マイナー7・フラット9', 'm7♭9', [0, 3, 7, 10, 13]],
  ['m7b5b9', 'ハーフディミニッシュ・フラット9', 'm7♭5♭9', [0, 3, 6, 10, 13]],
  ['dom9', 'ドミナント9', '9', [0, 4, 7, 10, 14]],
  ['6', 'シックス', '6', [0, 4, 7, 9]],
  ['m6', 'マイナー6', 'm6', [0, 3, 7, 9]],
].map(([id, label, suffix, intervals]) => [id, Object.freeze({ label, suffix, intervals: Object.freeze(intervals) })])));

let chordSerial = 0;
const finite = (value, fallback) => value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
const safeQuality = quality => Object.hasOwn(QUALITIES, quality) ? quality : 'maj';
const safeMode = mode => MODES.find(item => item.id === mode) || MODES[0];
const beatsOf = chord => clamp(finite(chord?.beats, 4), .25, 64);
const pc = value => {
  if (typeof value === 'string' && /^[A-Ga-g](?:#|♯|b|♭)?$/.test(value)) {
    const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[value[0].toUpperCase()];
    return mod(natural + (/[#♯]/.test(value) ? 1 : /[b♭]/.test(value) ? -1 : 0), 12);
  }
  return mod(Math.round(finite(value, 0)), 12);
};
const inversionOf = chord => mod(Math.round(finite(chord?.inversion, 0)), QUALITIES[safeQuality(chord?.quality)].intervals.length);
const noteName = (pitch, key) => (FLAT_KEYS.has(pc(key)) ? FLAT_NAMES : NOTE_NAMES)[pc(pitch)];

export function makeChord(root, quality = 'maj', degree = null) {
  return {
    id: `chord-${Date.now().toString(36)}-${(++chordSerial).toString(36)}`,
    root: pc(root), quality: safeQuality(quality), degree,
    inversion: 0, octave: 4, beats: 4, velocity: 90, locked:false, voicing:'close', bass:null,
  };
}

export function chordName(chord, key = 0) {
  const quality = safeQuality(chord?.quality);
  const root = pc(chord?.root);
  const inversion = inversionOf(chord);
  const bass = chord?.bass!=null ? pc(chord.bass) : pc(chordNotes(chord)[0]);
  return noteName(root, key) + QUALITIES[quality].suffix + (bass!==root ? `/${noteName(bass, key)}` : '');
}

export function chordNotes(chord, options = {}) {
  const quality = QUALITIES[safeQuality(chord?.quality)];
  const inversion = inversionOf(chord);
  const octave = clamp(Math.round(finite(chord?.octave, 4)), -1, 8)
    + clamp(Math.round(finite(options?.octave, 0)), -4, 4);
  const root = 12 * (octave + 1) + pc(chord?.root);
  const bassInterval = quality.intervals[inversion];
  let notes = quality.intervals.map(interval => {
    while (interval < bassInterval) interval += 12;
    return root + interval;
  }).sort((a, b) => a - b);
  if(chord?.voicing==='open') notes=notes.map((n,i)=>i%2?n+12:n).sort((a,b)=>a-b);
  if(chord?.voicing==='drop2'&&notes.length>=3){notes[notes.length-2]-=12;notes.sort((a,b)=>a-b);}
  // Move the entire voicing by octaves at MIDI's bounds, preserving intervals.
  while (notes[0] < 0) notes = notes.map(note => note + 12);
  while (notes.at(-1) > 127) notes = notes.map(note => note - 12);
  return notes;
}

const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const LOWER_QUALITIES = new Set(['min', 'min7', 'min9', 'min7b9', 'm7b5b9', 'm6', 'dim', 'dim7', 'm7b5']);
const ROMAN_SUFFIX = { dim: '°', aug: '+', maj7: 'maj7', min7: '7', dom7: '7', m7b5: 'ø7', dim7: '°7', sus2: 'sus2', sus4: 'sus4', add9: 'add9', maj9: 'maj9', min9: '9', min7b9: '7♭9', m7b5b9: 'ø7♭9', dom9: '9', 6: '6', m6: '6' };

export function romanNumeral(chord, key = 0, mode = 'major') {
  const scale = safeMode(mode).intervals;
  const relative = mod(pc(chord?.root) - pc(key), 12);
  let degree = scale.indexOf(relative);
  let accidental = '';
  if (degree < 0) {
    // Borrowed roots are shown relative to the selected mode's scale.
    degree = scale.findIndex(interval => mod(interval - relative, 12) === 1);
    if (degree >= 0) accidental = '♭';
    else {
      degree = scale.findIndex(interval => mod(relative - interval, 12) === 1);
      accidental = '♯';
    }
  }
  const quality = safeQuality(chord?.quality);
  const numeral = ROMANS[Math.max(0, degree)];
  return accidental + (LOWER_QUALITIES.has(quality) ? numeral.toLowerCase() : numeral) + (ROMAN_SUFFIX[quality] || '');
}

function scaleInterval(scale, index) {
  return scale[mod(index, 7)] + 12 * Math.floor(index / 7);
}

function stackedQuality(intervals) {
  return Object.keys(QUALITIES).find(id => {
    const candidate = QUALITIES[id].intervals;
    return candidate.length === intervals.length && candidate.every((value, index) => value === intervals[index]);
  }) || 'maj';
}

function extensionSize(extension) {
  return ['9', '9th', 'ninth', 'ninths'].includes(String(extension)) ? 5
    : ['7', '7th', 'seventh', 'sevenths'].includes(String(extension)) ? 4 : 3;
}

function presetQuality(quality, extension) {
  const family = ['maj', 'maj7', 'maj9', 'add9', '6'].includes(quality) ? ['maj', 'maj7', 'maj9']
    : ['min', 'min7', 'min9', 'm6'].includes(quality) ? ['min', 'min7', 'min9']
      : ['dom7', 'dom9'].includes(quality) ? ['maj', 'dom7', 'dom9'] : null;
  return family ? family[extensionSize(extension) - 3] : safeQuality(quality);
}

export function diatonicChords(key = 0, mode = 'major', extension = 'triad') {
  const scale = safeMode(mode).intervals;
  const noteCount = extensionSize(extension);
  return scale.map((interval, index) => {
    const intervals = Array.from({ length: noteCount }, (_, voice) => scaleInterval(scale, index + voice * 2) - interval);
    const chord = makeChord(pc(key) + interval, stackedQuality(intervals));
    chord.degree = romanNumeral(chord, key, mode);
    return chord;
  });
}

export function transposeChords(chords, semitones) {
  const amount = Math.round(finite(semitones, 0));
  return (Array.isArray(chords) ? chords : []).map(chord => {
    const movedRoot = pc(chord?.root) + amount;
    const octave = clamp(Math.round(finite(chord?.octave, 4)), -1, 8) + Math.floor(movedRoot / 12);
    return { ...chord, root: pc(movedRoot), octave: clamp(octave, -1, 8), ...(chord.bass!=null?{bass:pc(chord.bass+amount)}:{}) };
  });
}

export const PRESETS = Object.freeze([
  { id: 'pop', name: '1564進行', tag: '1564', description: 'Iから始まる、ポップスの定番4コード。', degrees: [1, 5, 6, 4], mode: 'major' },
  { id: 'jpop', name: '王道進行', tag: '4536', description: 'IVから始まり、viへ着地する4コード。', degrees: [4, 5, 3, 6], mode: 'major' },
  { id: 'jazz', name: '逆循環進行', tag: '2516', description: 'ii–V–Iで着地し、VI7からiiへ戻る。', degrees: [{ degree: 2, quality: 'min7' }, { degree: 5, quality: 'dom7' }, { degree: 1, quality: 'maj7' }, { degree: 6, quality: 'dom7' }], mode: 'major' },
  { id: 'lofi', name: '夜のLo-fi', tag: 'LO-FI', description: '9thの余韻が心地よい、ゆったりしたループ。', degrees: [{ degree: 6, quality: 'min9' }, { degree: 4, quality: 'maj9' }, { degree: 1, quality: 'maj9' }, { degree: 5, quality: 'dom9' }], mode: 'major' },
  { id: 'cinematic', name: 'シネマティック', tag: 'CINEMA', description: '陰影と大きな展開を感じるマイナー進行。', degrees: [1, 6, 3, 7], mode: 'minor' },
  { id: 'emotional', name: '6415進行', tag: '6415', description: 'viから始まる、1564進行の並べ替え。', degrees: [6, 4, 1, 5], mode: 'major' },
  { id: 'neo-soul', name: 'ネオ・ソウル', tag: 'SOUL', description: '豊かなテンションと落ち着いた響き。', degrees: [{ degree: 2, quality: 'min9' }, { degree: 4, quality: 'maj9' }, { degree: 3, quality: 'min7' }, { degree: 6, quality: 'min9' }], mode: 'major' },
  { id: 'dorian', name: 'ドリアン・グルーヴ', tag: 'DORIAN', description: 'マイナーの色に、明るいIVコードを添えて。', degrees: [1, 4, 7, 4], mode: 'dorian' },
  { id: 'canon', name: 'カノン進行', tag: '8コード', description: 'I–V–vi–iii–IV–I–IV–Vの8コード。', degrees: [1, 5, 6, 3, 4, 1, 4, 5], mode: 'major' },
  { id: 'marusa', name: '丸サ進行', tag: '4361', description: 'III7でviへ、I7でIVへ戻る4コードの基本形。', degrees: [{ degree: 4, quality: 'maj7' }, { degree: 3, quality: 'dom7' }, { degree: 6, quality: 'min7' }, { degree: 1, quality: 'dom7' }], mode: 'major' },
  { id: 'komuro', name: '小室進行', tag: '6451', description: 'vi–IV–V–Iで、最後はIに着地。', degrees: [6, 4, 5, 1], mode: 'major' },
  { id: 'turnaround', name: '循環進行', tag: '1625', description: 'I–vi–ii–Vで一周し、Iへ戻る。', degrees: [{ degree: 1, quality: 'maj7' }, { degree: 6, quality: 'min7' }, { degree: 2, quality: 'min7' }, { degree: 5, quality: 'dom7' }], mode: 'major' },
].map(preset => Object.freeze({ ...preset, degrees: Object.freeze(preset.degrees) })));

// Existing recipe IDs remain available for older integrations; the picker uses named progressions.
export const NAMED_PRESETS = Object.freeze(['jpop', 'canon', 'marusa', 'komuro', 'pop', 'emotional', 'turnaround', 'jazz'].map(id => PRESETS.find(preset => preset.id === id)));

export function makePreset(presetId, key = 0, mode = 'major', extension = 'triad') {
  const preset = PRESETS.find(item => item.id === presetId) || PRESETS[0];
  const activeMode = safeMode(mode).id;
  const palette = diatonicChords(key, activeMode, extension);
  return preset.degrees.map(spec => {
    const degree = typeof spec === 'number' ? spec : spec.degree;
    const chord = { ...palette[clamp(degree, 1, 7) - 1], id: makeChord(0).id };
    if (typeof spec === 'object' && spec.quality) chord.quality = extension === 'auto' ? safeQuality(spec.quality) : presetQuality(spec.quality, extension);
    chord.degree = romanNumeral(chord, key, activeMode);
    return chord;
  });
}

function voiceMovement(previous, next) {
  if (previous.length === next.length) return previous.reduce((sum, note, i) => sum + Math.abs(note - next[i]), 0);
  const distance = (a, b) => a.reduce((sum, note) => sum + Math.min(...b.map(other => Math.abs(note - other))), 0) / a.length;
  return (distance(previous, next) + distance(next, previous)) * Math.max(previous.length, next.length) / 2;
}

export function voiceLead(chords) {
  if (!Array.isArray(chords) || !chords.length) return [];
  const result = [chords[0].locked?{...chords[0]}:{ ...chords[0], octave: clamp(Math.round(finite(chords[0]?.octave, 4)), 2, 6), inversion: inversionOf(chords[0]) }];
  let previous = chordNotes(result[0]);
  for (const original of chords.slice(1)) {
    if(original.locked){result.push({...original});previous=chordNotes(original);continue;}
    let best = { ...original };
    let bestScore = Infinity;
    const ownOctave = clamp(Math.round(finite(original?.octave, 4)), 2, 6);
    const voiceCount = QUALITIES[safeQuality(original?.quality)].intervals.length;
    for (let octave = Math.max(2, ownOctave - 2); octave <= Math.min(6, ownOctave + 2); octave++) {
      for (let inversion = 0; inversion < voiceCount; inversion++) {
        const candidate = { ...original, octave, inversion };
        const notes = chordNotes(candidate);
        const rangePenalty = Math.max(0, 43 - notes[0]) + Math.max(0, notes.at(-1) - 88);
        const score = voiceMovement(previous, notes) + rangePenalty * 2 + Math.abs(octave - ownOctave) * .01;
        if (score < bestScore) { best = candidate; bestScore = score; }
      }
    }
    result.push(best);
    previous = chordNotes(best);
  }
  return result;
}

export function totalBeats(chords) {
  return (Array.isArray(chords) ? chords : []).reduce((sum, chord) => sum + beatsOf(chord), 0);
}

const fraction = (value, fallback, min, max) => {
  let number = finite(value, fallback);
  if (number > 1) number /= 100;
  return clamp(number, min, max);
};
const pseudoRandom = seed => {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
};

const SIMPLE_PATTERN_IDS = new Set(['steady8', 'steady16', 'offbeat8', 'disco', 'house', 'rolling16', 'broken-octaves', 'cinematic-pulse', 'waltz', 'dotted', 'ballad']);
const INTRICATE_PATTERN_IDS = new Set(['glitch32', 'burst-chops', 'polymeter5', 'three-over-four', 'euclid7-16', 'idm-fracture', 'odd-group16', 'evolving-comp', 'braided-arp', 'triplet-slices']);
const PRACTICAL_PATTERN_IDS = new Set(['uk-garage', 'deep-house-turn', 'broken-beat', 'afro-weave', 'latin-piano', 'jazz-shells', 'soul-pocket', 'rnb-pickups', 'dub-echo', 'pop-push', 'triplet-turnaround', 'hocket-comp']);
const ARPEGGIO_PATTERN_IDS = new Set(['arp', 'updown', 'broken', 'rolling16', 'broken-octaves', 'ballad', 'dotted', 'braided-arp']);
const PREVIEW_GRIDS = { glitch32: 32, 'burst-chops': 32, 'idm-fracture': 32, 'evolving-comp': 32, 'three-over-four': 48, 'braided-arp': 48, 'triplet-slices': 24, 'soul-pocket': 32, 'rnb-pickups': 32, 'dub-echo': 32, 'triplet-turnaround': 48, 'hocket-comp': 32 };
const patternDescriptor = (id, name, category, description) => Object.freeze({
  id, name, category, description,
  complexity: category === 'basic' ? 'basic' : SIMPLE_PATTERN_IDS.has(id) ? 'simple' : 'complex',
  complexityLevel: category === 'basic' ? 0 : SIMPLE_PATTERN_IDS.has(id) ? 1 : INTRICATE_PATTERN_IDS.has(id) ? 3 : 2,
  feel: ARPEGGIO_PATTERN_IDS.has(id) ? 'arp' : category === 'basic' || SIMPLE_PATTERN_IDS.has(id) ? 'pulse' : 'groove',
  grid: PREVIEW_GRIDS[id] || 16,
});
export const BASIC_PATTERNS = Object.freeze([
  patternDescriptor('block', 'ブロック', 'basic', 'コードを次のコードまでつなぐ。ゲート100%なら音の切れ目なし。'),
  patternDescriptor('arp', 'アルペジオ ↑', 'basic', '8分音符で下から上へ。コードが変わっても拍の流れを保つ。'),
  patternDescriptor('updown', 'アルペジオ ↕', 'basic', '8分音符で上昇と下降を繰り返す。'),
  patternDescriptor('broken', '分散和音', 'basic', '低音・高音・中音を8分音符で行き来する。'),
  patternDescriptor('strum', 'ストラム', 'basic', '構成音をわずかにずらし、弦を払うように鳴らす。'),
]);
export const ADVANCED_PATTERNS = Object.freeze([
  patternDescriptor('steady8', '8分コード・パルス', 'advanced', '8分音符でコードを刻む。拍頭を少し強く、安定した推進力。'),
  patternDescriptor('steady16', '16分コード・パルス', 'advanced', '短い16分音符を連打。ポップやエレクトロに合う細かな刻み。'),
  patternDescriptor('offbeat8', '裏拍スカンク', 'advanced', '表拍を空けて裏拍だけを短く鳴らす、軽快なシンコペーション。'),
  patternDescriptor('disco', 'ディスコ・オクターブ', 'advanced', '裏拍の上声と、拍ごとにオクターブを行き来するベース。'),
  patternDescriptor('house', 'ハウス・スタブ', 'advanced', '裏拍のコードを歯切れよく。四つ打ちのベースで支える。'),
  patternDescriptor('funk16', '16分ファンク', 'advanced', '強いコードと小さなゴーストを交互に置く、休符のある細かな刻み。'),
  patternDescriptor('neo-soul', 'ネオ・ソウル・コンプ', 'advanced', '長めの響きと遅い裏拍を組み合わせる、余白のあるコンピング。'),
  patternDescriptor('bossa', 'ボサ・コンピング', 'advanced', '低音の交替と、ずれたコードの刻み。柔らかいラテンの揺れ。'),
  patternDescriptor('clave32', 'クラーベ 3–2', 'advanced', '3打と2打を2小節で交替。休符を生かすクラーベ風の配置。'),
  patternDescriptor('clave23', 'クラーベ 2–3', 'advanced', '2打から3打へ続く2小節のフレーズ。3–2とは異なる重心。'),
  patternDescriptor('tresillo', 'トレシージョ 3–3–2', 'advanced', '8分音符を3・3・2に分ける、3つのアクセント。'),
  patternDescriptor('dancehall', 'ダンスホール・チョップ', 'advanced', '短いスタブと空白を交互に置く、前に進むシンコペーション。'),
  patternDescriptor('dotted', '付点8分ディレイ', 'advanced', '付点8分音符の連続。小節線をまたいでアクセントが移動する。'),
  patternDescriptor('trap', 'トラップ・スパース', 'advanced', '長い余白に小さな連打を添える。低音はゆっくり、上声は細かく。'),
  patternDescriptor('gospel', 'ゴスペル・プッシュ', 'advanced', '拍頭で広く鳴らし、次の拍へ食い気味につなぐコードの押し出し。'),
  patternDescriptor('ballad', 'バラード・分散', 'advanced', '低音から上声へゆっくり展開。音を重ねて柔らかくつなぐ。'),
  patternDescriptor('rolling16', 'ローリング16分', 'advanced', '16分音符で構成音を流す。個々の音を少し重ねた連続アルペジオ。'),
  patternDescriptor('half-time', 'ハーフタイム・ポケット', 'advanced', '大きな響きと後半の裏拍。休符を残した落ち着いたノリ。'),
  patternDescriptor('broken-octaves', 'オクターブ・分散', 'advanced', '低音と1オクターブ上の音を、上声のコードと交互に鳴らす。'),
  patternDescriptor('cinematic-pulse', 'シネマ・パルス', 'advanced', '低音と上声が交替する8分の脈動。静かな強弱で展開を作る。'),
  patternDescriptor('waltz', 'ワルツ・スウェイ', 'advanced', '小節の最初に低音、続く拍に上声。3/4は3拍、6/8は6つの8分音符。'),
  patternDescriptor('glitch32', '32分グリッチ・チョップ', 'advanced', '32分の短い連打を切り刻み、休符と長めのコードを挟む細密なフレーズ。'),
  patternDescriptor('burst-chops', 'バースト・チョップ', 'advanced', '2〜4打の高速バーストと大きな空白。上声の細片と広いコードが交替する。'),
  patternDescriptor('polymeter5', '5セル・ポリメーター', 'advanced', '5つの8分セルが小節線をずらす。3・2セルの刻みが通常の拍と交差する。'),
  patternDescriptor('three-over-four', '3対4・ポリリズム', 'advanced', '3等分の低声と4等分の上声を重ねる。異なる周期が小節内で交差する。'),
  patternDescriptor('euclid7-16', 'ユークリッド・7/16', 'advanced', '4/4では7打を16分グリッドに分散。2・3セル間隔が交替し、拍子に合わせて打数を調整。'),
  patternDescriptor('idm-fracture', 'IDM・フラクチャー', 'advanced', '32分の断片、長い余白、突然のコードを組み合わせる不規則なスタッター。'),
  patternDescriptor('odd-group16', '変則グループ16分', 'advanced', '3・5・4セルなどの異なるまとまりを交替。強い頭と小さな末尾が絡む16分の刻み。'),
  patternDescriptor('evolving-comp', '4小節エボルブ・コンプ', 'advanced', '4小節で呼びかけ・応答・細かな連打へ展開。小節ごとに刻みの重心が動く。'),
  patternDescriptor('braided-arp', '交差アルペジオ', 'advanced', '16分側の上昇と3連側の下降が交差する。2つの構成音の流れを編み合わせる。'),
  patternDescriptor('triplet-slices', '3連スライス', 'advanced', '16分3連の断片に、長い構成音を混ぜる。連打と抜けを交替する細かなチョップ。'),
  patternDescriptor('uk-garage', '2ステップ・ガラージ', 'advanced', '1・3拍の低声を支えに、遅い裏拍の上声と短い返し。UKガラージや軽いダンス伴奏に。'),
  patternDescriptor('deep-house-turn', 'ディープ・ハウス・ターン', 'advanced', '小節頭の長めの響きへ、2〜4拍の裏から短く応答する2小節コンプ。落ち着いたハウスに。'),
  patternDescriptor('broken-beat', 'ブロークン・ビート', 'advanced', '1拍目と3拍付近の低声の間に、上声の16分裏をずらして置く。ジャズ寄りのビートやソウルに。'),
  patternDescriptor('afro-weave', 'アフロ・ウィーブ', 'advanced', '低声の3–3–2を芯に、上声の裏拍が応答する。歌を邪魔しにくいアフロ系ポップの伴奏に。'),
  patternDescriptor('latin-piano', 'ラテン・ピアノ・レスポンス', 'advanced', '1・3拍の低声に、2・4拍の先取りと短い上声を重ねる2小節。ラテン寄りのピアノ伴奏に。'),
  patternDescriptor('jazz-shells', 'ジャズ・スペース・コンプ', 'advanced', '小節頭の低声と、2拍後半・4拍裏の上声で余白を保つ2小節。メロディーを支えるジャズやLo-fiに。'),
  patternDescriptor('soul-pocket', 'ソウル・ポケット', 'advanced', '1・3拍を支え、2・4拍の裏へ長短の上声を返す。短い単音の拾いを添えたソウル伴奏。'),
  patternDescriptor('rnb-pickups', 'R&B・ピックアップ', 'advanced', '長い強拍の間は休み、小節終わりに32分の短い返し。ボーカルの余白を残すR&B伴奏に。'),
  patternDescriptor('dub-echo', 'ダブ・エコー・チョップ', 'advanced', '裏拍の短い上声へ、弱い単音が遅れて返る。低声で拍を支えるダブやゆったりした電子ポップに。'),
  patternDescriptor('pop-push', 'ポップ・プッシュ', 'advanced', '1拍から8分の先取りを交互に置き、3拍で低声を補強。ギターやシンセで歌を押すポップ伴奏に。'),
  patternDescriptor('triplet-turnaround', '3連・ターンアラウンド', 'advanced', '1・3拍の芯を残し、各小節の最後1拍だけ3連で答える。短いピアノの返しやサビ前の伴奏に。'),
  patternDescriptor('hocket-comp', 'ホケット・コンプ', 'advanced', '短い低声と上声を細かな裏位置で受け渡し、同時に詰め込まない。軽い鍵盤やマレットの掛け合いに。'),
]);
export const PATTERNS = Object.freeze([...BASIC_PATTERNS, ...ADVANCED_PATTERNS]);
export const SIMPLE_PATTERNS = Object.freeze(ADVANCED_PATTERNS.filter(pattern => pattern.complexity === 'simple'));
export const COMPLEX_PATTERNS = Object.freeze(ADVANCED_PATTERNS.filter(pattern => pattern.complexity === 'complex')
  .sort((a, b) => b.complexityLevel - a.complexityLevel));
const PATTERN_IDS = new Set(PATTERNS.map(pattern => pattern.id));
const BASIC_PATTERN_IDS = new Set(BASIC_PATTERNS.map(pattern => pattern.id));

// Hand-composed rhythmic cells, not generated harmony. Coordinates are quarter
// notes in 4/4. A cell can span two bars; its phase never restarts at a chord.
// [onset, length, voice, accent, essential]. Length deliberately includes rests.
const hit = (at, length, voice = 'chord', accent = .65, essential = false) => ({ at, length, voice, accent, essential });
const eighths = (length = .5, voice = 'chord') => Array.from({ length: 8 }, (_, i) => hit(i / 2, length, voice, i % 2 ? .35 : .85, i % 2 === 0));
const sixteenths = (length = .22, voice = 'chord') => Array.from({ length: 16 }, (_, i) => hit(i / 4, length, voice, i % 4 ? i % 2 ? .2 : .45 : .95, i % 4 === 0));
const RHYTHMS = {
  steady8: { variants: [eighths(), eighths(.42, 'upper')], bass: 'hold' },
  steady16: { variants: [sixteenths(), sixteenths(.18, 'upper')], bass: 'hold' },
  offbeat8: { variants: [[.5, 1.5, 2.5, 3.5].map(at => hit(at, .35, 'chord', .8, true)), [.5, 1.5, 2.5, 3.25, 3.75].map((at, i) => hit(at, i > 2 ? .18 : .3, 'upper', i > 2 ? .4 : .85, i < 3))] },
  disco: { variants: [[.5, 1.5, 2.5, 3.5].map(at => hit(at, .4, 'upper', .8, true)), [.5, 1.25, 1.5, 2.5, 3.25, 3.5].map((at, i) => hit(at, .2, 'upper', [1, 4].includes(i) ? .25 : .9, ![1, 4].includes(i)))], bass: 'octaves' },
  house: { variants: [[.5, 1.5, 2.5, 3.5].map(at => hit(at, .46, 'chord', .95, true)), [.5, 1.5, 2.5, 2.75, 3.5].map((at, i) => hit(at, i === 3 ? .15 : .38, 'chord', i === 3 ? .2 : .85, i !== 3))], bass: 'pulse' },
  funk16: { variants: [[hit(0, .18, 'chord', 1, true), hit(.75, .12, 'upper', .2), hit(1.5, .2, 'chord', .85, true), hit(1.75, .12, 'upper', .15), hit(2.5, .2, 'chord', .95, true), hit(3.25, .12, 'upper', .25), hit(3.75, .16, 'chord', .65)], [hit(0, .2, 'chord', 1, true), hit(.5, .12, 'upper', .25), hit(1.25, .2, 'chord', .85, true), hit(2, .15, 'upper', .4), hit(2.75, .2, 'chord', .95, true), hit(3.5, .2, 'chord', .7)]] },
  'neo-soul': { variants: [[hit(0, 1.15, 'chord', .7, true), hit(1.5, .5, 'upper', .4), hit(2.25, .85, 'chord', .8, true), hit(3.5, .4, 'upper', .45)], [hit(0, .85, 'chord', .8, true), hit(1.25, .55, 'upper', .35), hit(2.5, .95, 'chord', .75, true), hit(3.75, .2, 'upper', .4)]] },
  bossa: { variants: [[hit(0, .55, 'upper', .75, true), hit(1, .3, 'upper', .45), hit(1.5, .6, 'upper', .85, true), hit(2.5, .35, 'upper', .5), hit(3.5, .4, 'upper', .8)], [hit(0, .65, 'upper', .8, true), hit(1.5, .35, 'upper', .65, true), hit(2, .5, 'upper', .45), hit(3, .3, 'upper', .5), hit(3.5, .4, 'upper', .8)]], bass: 'bossa' },
  clave32: { bars: 2, variants: [[0, 1.5, 3, 5, 6].map(at => hit(at, .35, 'chord', at % 4 === 0 ? 1 : .65, true)), [0, 1.5, 3, 5, 6].map((at, i) => hit(at, i % 2 ? .55 : .22, 'upper', i % 2 ? .45 : .95, true))] },
  clave23: { bars: 2, variants: [[1, 2, 4, 5.5, 7].map(at => hit(at, .35, 'chord', at === 4 ? 1 : .65, true)), [1, 2, 4, 5.5, 7].map((at, i) => hit(at, i % 2 ? .55 : .22, 'upper', i % 2 ? .45 : .95, true))] },
  tresillo: { variants: [[hit(0, 1.2, 'chord', 1, true), hit(1.5, 1.2, 'chord', .7, true), hit(3, .8, 'chord', .85, true)], [hit(0, .6, 'chord', 1, true), hit(1.5, .6, 'upper', .65, true), hit(3, .6, 'chord', .85, true), hit(3.75, .18, 'upper', .25)]] },
  dancehall: { variants: [[hit(0, .35, 'chord', 1, true), hit(.75, .2, 'upper', .45), hit(1.5, .4, 'chord', .75, true), hit(2.5, .2, 'upper', .45), hit(3, .5, 'chord', .95, true)], [hit(0, .3, 'chord', 1, true), hit(1, .25, 'upper', .4), hit(1.75, .3, 'chord', .85, true), hit(2.5, .25, 'upper', .55), hit(3.25, .4, 'chord', .9, true)]], bass: 'sync' },
  trap: { variants: [[hit(0, 1.25, 'chord', .85, true), hit(1.75, .18, 'upper', .25), hit(2.5, .55, 'chord', .65, true), hit(3.5, .18, 'top', .35), hit(3.75, .18, 'upper', .5)], [hit(0, 1.5, 'chord', .9, true), hit(2.75, .3, 'upper', .65, true), hit(3.25, .16, 'top', .25), hit(3.5, .16, 'top', .3), hit(3.75, .18, 'upper', .5)]], bass: 'half' },
  gospel: { variants: [[hit(0, 1.25, 'chord', .85, true), hit(1.5, .9, 'chord', .65), hit(2.75, .45, 'upper', .7), hit(3.5, .5, 'chord', 1, true)], [hit(0, 1.6, 'chord', .8, true), hit(1.75, .65, 'upper', .55), hit(2.75, .5, 'chord', .8), hit(3.5, .5, 'chord', 1, true)]] },
  ballad: { variants: [[hit(0, 1.8, 'low', .85, true), hit(.5, 1.5, 'middle', .35), hit(1, 1.5, 'top', .55), hit(1.5, 1.25, 'upper', .4), hit(2, 1.8, 'low', .8, true), hit(2.5, 1.5, 'middle', .35), hit(3, 1, 'top', .6), hit(3.5, .5, 'upper', .4)], [hit(0, 2.5, 'low', .8, true), hit(.5, 1.5, 'upper', .4), hit(1.5, 1.5, 'top', .55), hit(2, 1.8, 'middle', .6, true), hit(2.5, 1.5, 'upper', .4), hit(3.5, .5, 'top', .65)]] },
  'half-time': { variants: [[hit(0, 1.8, 'chord', .95, true), hit(2.5, 1.3, 'chord', .65, true)], [hit(0, 2.2, 'chord', .9, true), hit(2.75, 1, 'upper', .65, true), hit(3.75, .2, 'top', .3)]], bass: 'half' },
  'broken-octaves': { variants: [eighths(.48, 'octave-broken'), eighths(.42, 'octave-broken')], bass: 'hold' },
  'cinematic-pulse': { variants: [eighths(.48, 'alternating'), eighths(.42, 'alternating')], bass: 'pulse' },
};

// Accompaniment cells keep a recognizable downbeat and leave space for a lead.
// Two written phrases × two register responses × four articulations provide
// sixteen repeatable variations, without turning the groove into random fills.
const practicalHit = (at, length, voice, accent, essential = false, gain = 1) => ({ ...hit(at, length, voice, accent, essential), gain });
const PRACTICAL_RHYTHMS = {
  'uk-garage': { variants: [
    [practicalHit(0, .55, 'low', .95, true), practicalHit(.75, .34, 'upper', .85, true), practicalHit(1.25, .15, 'top', .3, false, .7), practicalHit(1.75, .23, 'upper', .55), practicalHit(2, .48, 'low', .9, true), practicalHit(2.5, .29, 'upper', .75), practicalHit(3.25, .18, 'upper', .65), practicalHit(3.75, .16, 'arpeggio', .35, false, .8)],
    [practicalHit(0, .55, 'low', .95, true), practicalHit(.5, .28, 'upper', .8, true), practicalHit(1.25, .22, 'upper', .55), practicalHit(1.75, .14, 'top', .3, false, .7), practicalHit(2, .48, 'low', .9, true), practicalHit(2.75, .26, 'upper', .75), practicalHit(3.25, .17, 'arpeggio', .3, false, .75), practicalHit(3.5, .27, 'upper', .7)],
  ] },
  'deep-house-turn': { bars: 2, variants: [
    [practicalHit(0, 1.15, 'chord', .8, true), practicalHit(1.5, .38, 'upper', .55), practicalHit(2.75, .66, 'upper', .75), practicalHit(3.75, .17, 'top', .35, false, .75), practicalHit(4, .42, 'low', .85, true), practicalHit(4.5, .94, 'upper', .75, true), practicalHit(6.25, .46, 'upper', .55), practicalHit(7, .56, 'chord', .8), practicalHit(7.75, .16, 'middle', .3, false, .75)],
    [practicalHit(0, .97, 'chord', .8, true), practicalHit(1.75, .45, 'upper', .65), practicalHit(2.5, .78, 'upper', .7), practicalHit(3.5, .26, 'top', .35, false, .75), practicalHit(4, .4, 'low', .85, true), practicalHit(4.75, .76, 'upper', .8, true), practicalHit(6, .64, 'upper', .65), practicalHit(7.25, .43, 'chord', .8), practicalHit(7.75, .16, 'middle', .3, false, .75)],
  ] },
  'broken-beat': { variants: [
    [practicalHit(0, .42, 'low', .95, true), practicalHit(.75, .23, 'upper', .65, true), practicalHit(1.5, .29, 'upper', .75), practicalHit(1.75, .12, 'arpeggio', .3, false, .75), practicalHit(2.25, .42, 'low', .85, true), practicalHit(2.75, .21, 'upper', .5), practicalHit(3.25, .28, 'upper', .75), practicalHit(3.75, .15, 'middle', .3, false, .75)],
    [practicalHit(0, .42, 'low', .95, true), practicalHit(.5, .25, 'upper', .7, true), practicalHit(1.25, .24, 'upper', .55), practicalHit(1.75, .17, 'middle', .3, false, .75), practicalHit(2.25, .42, 'low', .85, true), practicalHit(3, .3, 'upper', .8), practicalHit(3.5, .15, 'arpeggio', .35, false, .75)],
  ] },
  'afro-weave': { variants: [
    [practicalHit(0, .45, 'low', .95, true), practicalHit(.5, .22, 'upper', .5, true), practicalHit(1, .18, 'upper', .45), practicalHit(1.5, .39, 'low', .8, true), practicalHit(2.25, .26, 'upper', .7), practicalHit(2.75, .14, 'top', .3, false, .7), practicalHit(3, .42, 'low', .9), practicalHit(3.5, .29, 'upper', .7)],
    [practicalHit(0, .45, 'low', .95, true), practicalHit(.75, .22, 'upper', .65, true), practicalHit(1.25, .14, 'top', .3, false, .7), practicalHit(1.5, .39, 'low', .8, true), practicalHit(2, .24, 'upper', .6), practicalHit(2.5, .23, 'upper', .65), practicalHit(3, .42, 'low', .9), practicalHit(3.75, .17, 'upper', .5)],
  ] },
  'latin-piano': { bars: 2, variants: [
    [practicalHit(0, .4, 'low', .95, true), practicalHit(.75, .26, 'upper', .7, true), practicalHit(1.5, .35, 'upper', .65), practicalHit(2, .4, 'low', .85), practicalHit(2.75, .27, 'upper', .8), practicalHit(3.5, .3, 'upper', .65), practicalHit(4, .4, 'low', .95, true), practicalHit(4.5, .28, 'upper', .55, true), practicalHit(5.25, .25, 'upper', .75), practicalHit(5.75, .13, 'top', .3, false, .75), practicalHit(6, .4, 'low', .85), practicalHit(6.5, .27, 'upper', .7), practicalHit(7.5, .32, 'upper', .8)],
    [practicalHit(0, .4, 'low', .95, true), practicalHit(.5, .24, 'upper', .65, true), practicalHit(1.25, .3, 'upper', .7), practicalHit(2, .4, 'low', .85), practicalHit(2.5, .25, 'upper', .6), practicalHit(3.25, .35, 'upper', .8), practicalHit(4, .4, 'low', .95, true), practicalHit(4.75, .28, 'upper', .7, true), practicalHit(5.5, .3, 'upper', .6), practicalHit(6, .4, 'low', .85), practicalHit(6.75, .28, 'upper', .75), practicalHit(7.25, .14, 'top', .3, false, .75), practicalHit(7.75, .17, 'upper', .6)],
  ] },
  'jazz-shells': { bars: 2, variants: [
    [practicalHit(0, .45, 'low', .8, true), practicalHit(1.75, .33, 'upper', .6, true), practicalHit(2.75, .18, 'middle', .25, false, .65), practicalHit(3.5, .34, 'upper', .7), practicalHit(4, .44, 'low', .8, true), practicalHit(4.75, .3, 'upper', .55, true), practicalHit(6.25, .4, 'upper', .65), practicalHit(7.5, .29, 'upper', .6)],
    [practicalHit(0, .45, 'low', .8, true), practicalHit(1.25, .37, 'upper', .6, true), practicalHit(2.5, .18, 'middle', .25, false, .65), practicalHit(3.75, .17, 'upper', .6), practicalHit(4, .44, 'low', .8, true), practicalHit(5.5, .41, 'upper', .65, true), practicalHit(6.75, .3, 'upper', .55), practicalHit(7.75, .16, 'top', .3, false, .7)],
  ] },
  'soul-pocket': { variants: [
    [practicalHit(0, .72, 'chord', .9, true), practicalHit(.875, .13, 'top', .3, false, .7), practicalHit(1.5, .47, 'upper', .55), practicalHit(2, .48, 'low', .85, true), practicalHit(2.75, .24, 'middle', .3, false, .75), practicalHit(3.5, .39, 'upper', .7)],
    [practicalHit(0, .72, 'chord', .9, true), practicalHit(1.25, .19, 'middle', .3, false, .75), practicalHit(1.75, .28, 'upper', .6), practicalHit(2, .48, 'low', .85, true), practicalHit(2.625, .13, 'top', .3, false, .7), practicalHit(3.25, .5, 'upper', .65)],
  ] },
  'rnb-pickups': { variants: [
    [practicalHit(0, 1.05, 'chord', .85, true), practicalHit(1.5, .31, 'upper', .5), practicalHit(2, .6, 'low', .8, true), practicalHit(2.875, .16, 'middle', .3, false, .75), practicalHit(3.5, .24, 'upper', .65), practicalHit(3.625, .09, 'arpeggio', .3, false, .65), practicalHit(3.875, .1, 'top', .35, false, .7)],
    [practicalHit(0, 1.12, 'chord', .85, true), practicalHit(1.75, .23, 'upper', .55), practicalHit(2, .55, 'low', .8, true), practicalHit(3.125, .17, 'middle', .3, false, .75), practicalHit(3.5, .13, 'arpeggio', .3, false, .65), practicalHit(3.75, .16, 'upper', .65), practicalHit(3.875, .09, 'top', .3, false, .7)],
  ] },
  'dub-echo': { variants: [
    [practicalHit(0, .7, 'low', .85, true), practicalHit(.5, .23, 'upper', .9, true), practicalHit(.875, .16, 'top', .2, false, .48), practicalHit(1.5, .2, 'upper', .75), practicalHit(1.875, .15, 'top', .2, false, .44), practicalHit(2, .58, 'low', .8, true), practicalHit(2.5, .22, 'upper', .85), practicalHit(3.5, .22, 'upper', .85), practicalHit(3.875, .1, 'top', .2, false, .48)],
    [practicalHit(0, .7, 'low', .85, true), practicalHit(.75, .22, 'upper', .9, true), practicalHit(1.125, .15, 'top', .2, false, .48), practicalHit(1.75, .18, 'upper', .75), practicalHit(2, .58, 'low', .8, true), practicalHit(2.75, .23, 'upper', .85), practicalHit(3.125, .14, 'top', .2, false, .44), practicalHit(3.5, .22, 'upper', .85), practicalHit(3.875, .1, 'top', .2, false, .48)],
  ] },
  'pop-push': { variants: [
    [practicalHit(0, .42, 'chord', .95, true), practicalHit(.75, .34, 'upper', .65), practicalHit(1.5, .36, 'chord', .75), practicalHit(2, .42, 'low', .9, true), practicalHit(2.75, .38, 'upper', .7), practicalHit(3.5, .38, 'chord', .8)],
    [practicalHit(0, .42, 'chord', .95, true), practicalHit(.5, .28, 'upper', .6), practicalHit(1.25, .38, 'chord', .75), practicalHit(2, .42, 'low', .9, true), practicalHit(2.5, .29, 'upper', .6), practicalHit(3.25, .41, 'chord', .8), practicalHit(3.75, .14, 'middle', .3, false, .75)],
  ] },
  'triplet-turnaround': { variants: [
    [practicalHit(0, .77, 'chord', .9, true), practicalHit(1.5, .36, 'upper', .55), practicalHit(2, .56, 'chord', .8, true)],
    [practicalHit(0, .68, 'chord', .9, true), practicalHit(.75, .21, 'middle', .3, false, .75), practicalHit(1.75, .2, 'upper', .55), practicalHit(2, .51, 'chord', .8, true)],
  ] },
  'hocket-comp': { variants: [
    [practicalHit(0, .18, 'low', .9, true), practicalHit(.375, .24, 'upper', .65, true), practicalHit(1, .24, 'low', .75), practicalHit(1.625, .23, 'upper', .55), practicalHit(2.25, .19, 'low', .8, true), practicalHit(2.75, .23, 'upper', .6, true), practicalHit(3.5, .15, 'low', .75), practicalHit(3.75, .16, 'upper', .65)],
    [practicalHit(0, .19, 'low', .9, true), practicalHit(.625, .22, 'upper', .6, true), practicalHit(1.25, .2, 'low', .75), practicalHit(1.75, .22, 'upper', .55), practicalHit(2.5, .16, 'low', .8, true), practicalHit(2.875, .22, 'upper', .65, true), practicalHit(3.5, .13, 'low', .75), practicalHit(3.75, .17, 'upper', .65)],
  ] },
};

function practicalHits(pattern, variation, bar, length, swing, add) {
  const rhythm = PRACTICAL_RHYTHMS[pattern];
  const cycleLength = bar * (rhythm.bars || 1);
  const articulation = [1, .85, 1.08, .92][Math.floor(variation / 4)];
  // The mixed triplet preview has twelve cells per quarter note: its binary
  // foundation stays on sixteenths, with only the written response on thirds.
  const grid = pattern === 'triplet-turnaround' ? .25 : (PREVIEW_GRIDS[pattern] || 16) >= 32 ? .125 : .25;
  const response = Boolean(variation & 2);
  for (let cycle = 0; cycle * cycleLength < length; cycle++) {
    const source = rhythm.variants[variation % rhythm.variants.length];
    const arranged = source.map((item, index) => {
      const cellBar = Math.floor(item.at / 4);
      const local = item.at - cellBar * 4;
      const at = cellBar * bar + Math.round(local * bar / 4 / grid) * grid;
      const shifted = at + (Math.round(at / grid) % 2 ? grid * swing : 0);
      let voice = item.voice;
      if (response) voice = pattern === 'hocket-comp' || pattern === 'dub-echo'
        ? voice === 'upper' ? 'upper' : voice
        : ({ upper: 'chord', chord: 'upper', top: 'middle', middle: 'top', arpeggio: 'reverse-arpeggio' }[voice] || voice);
      // Hocket keeps the same register roles; the response changes only its
      // upper articulation. Echoes always remain single, quiet top notes.
      let duration = item.length * bar / 4 * articulation * (response && pattern === 'hocket-comp' && voice === 'upper' ? .72 : 1);
      if (pattern === 'dub-echo' && response && voice === 'top') duration *= .72;
      return { ...item, at: shifted, duration, voice, ordinal: cycle * 64 + index };
    });
    if (pattern === 'triplet-turnaround') {
      const voices = response ? ['upper', 'middle', 'low'] : ['low', 'upper', 'top'];
      for (let i = 0; i < 3; i++) arranged.push({ at: bar - 1 + i / 3, duration: (.16 + i * .035) * articulation, voice: voices[i], accent: .55 + i * .1, essential: false, gain: i === 2 ? .8 : 1, ordinal: cycle * 64 + 24 + i });
    }
    arranged.sort((a, b) => a.at - b.at);
    arranged.forEach((item, index) => {
      const at = cycle * cycleLength + item.at;
      if (at >= length || item.at >= cycleLength) return;
      if (pattern === 'hocket-comp') {
        const next = arranged[index + 1]?.at ?? cycleLength;
        item.duration = Math.min(item.duration, Math.max(1 / 480, next - item.at) * .55);
      }
      add(at, item.duration, item.voice, item.accent, item.essential, item.ordinal, item.gain);
    });
  }
}

function barLength(settings) {
  const [numerator, denominator] = meterParts(settings.meter);
  return numerator * 4 / denominator;
}

/** Dense phrases use genuine 32nd/triplet clocks, with selected rests and
 * overlapping different voices. Same-pitch retriggers are resolved afterward. */
function intricateHits(pattern, variation, bar, length, add) {
  if (pattern === 'polymeter5') {
    const cells = [[0, 1, 3, 4], [0, 2, 3], [0, 1, 2, 4], [0, 2, 4]][variation % 4];
    for (let cycle = 0; cycle * 2.5 < length; cycle++) cells.forEach((cell, index) => {
      add(cycle * 2.5 + cell * .5, index === 0 ? .42 : .16 + (index % 2) * .07, index === 0 ? 'chord' : 'upper', index === 0 ? .95 : .25 + index * .1, index === 0, cycle * 8 + index);
    });
    return;
  }
  if (pattern === 'triplet-slices') {
    const cells = [[0, 1, 2, 5, 6, 8, 10, 11], [0, 2, 3, 6, 7, 9, 10], [0, 1, 4, 5, 7, 8, 11]][variation % 3];
    for (let i = 0; i / 6 < length; i++) {
      if (!cells.includes(i % 12)) continue;
      add(i / 6, i % 12 === 0 ? .4 : i % 3 ? 1 / 12 : .23, i % 12 === 0 ? 'chord' : 'arpeggio', i % 12 === 0 ? .95 : .3 + (i % 3) * .15, i % 12 === 0, i);
    }
    return;
  }
  for (let cycle = 0; cycle * bar < length; cycle++) {
    const base = cycle * bar;
    const phrase = (at, duration, voice, accent, essential, ordinal) => {
      if (at < 0 || at >= bar || base + at >= length) return;
      add(base + at, duration, voice, accent, essential, cycle * 128 + ordinal);
    };
    if (pattern === 'three-over-four') {
      for (let i = 0; i < 4; i++) phrase(i * bar / 4, bar / 4 * .38, 'upper', i === 0 ? .9 : .4, i === 0, i);
      for (let i = 0; i < 3; i++) {
        const phase = variation % 2 ? 1 / 6 : 0;
        phrase(mod(i / 3 + phase, 1) * bar, bar / 3 * .56, variation % 3 ? 'arpeggio' : 'low', .75 - i * .1, i === 0, i + 8);
      }
    } else if (pattern === 'euclid7-16') {
      const steps = Math.max(4, Math.round(bar * 4));
      const pulses = clamp(Math.round(steps * 7 / 16) + (variation >= 8 ? 1 : 0), 2, steps - 2);
      const positions = Array.from({ length: steps }, (_, i) => i).filter(i => mod(i * pulses, steps) < pulses)
        .map(i => mod(i + variation, steps)).sort((a, b) => a - b);
      positions.forEach((cell, i) => phrase(cell / 4, i % 3 === 0 ? .34 : .14, i % 3 ? 'upper' : 'chord', i % 3 ? .4 : .95, i === 0, i));
    } else if (pattern === 'odd-group16') {
      const groups = [[3, 5, 4, 4], [5, 3, 5, 3], [3, 3, 5, 5], [5, 4, 3, 4]][(variation + (variation >= 4 ? cycle : 0)) % 4];
      let cell = 0, group = 0;
      while (cell / 4 < bar) {
        const size = Math.min(groups[group % groups.length], Math.round(bar * 4) - cell);
        phrase(cell / 4, size >= 5 ? .36 : .23, 'chord', group % 2 ? .7 : .95, group === 0, group * 4);
        if (size > 1) phrase((cell + size - 1) / 4, .11, group % 2 ? 'arpeggio' : 'upper', .25, false, group * 4 + 1);
        if (size >= 5 && variation % 2) phrase((cell + 2) / 4, .13, 'top', .4, false, group * 4 + 2);
        cell += size;
        group++;
      }
    } else if (pattern === 'glitch32') {
      const masks = [[0, 1, 2, 5, 6, 8, 11, 12, 13, 16, 17, 19, 22, 24, 25, 28, 30, 31], [0, 2, 3, 4, 7, 9, 10, 12, 15, 16, 18, 20, 21, 25, 27, 28, 29, 31], [0, 1, 4, 6, 7, 11, 12, 14, 17, 18, 19, 23, 24, 26, 29, 30]];
      const mask = masks[(variation + (variation >= 4 ? cycle % 2 : 0)) % masks.length];
      mask.forEach((cell, i) => phrase(cell / 8, i % 5 ? .07 + (i % 2) * .04 : .27, i % 5 ? 'arpeggio' : 'chord', i % 5 ? .25 + (i % 3) * .1 : .95, i === 0, i));
    } else if (pattern === 'burst-chops') {
      const starts = [[0, .75, 2, 3.25], [0, .5, 1.75, 2.75], [0, 1.25, 2.25, 3.5], [0, .875, 1.5, 3]][variation % 4];
      starts.forEach((at, i) => {
        const count = 2 + mod(i + variation, 3);
        for (let j = 0; j < count; j++) phrase(at + j / 8, j === count - 1 ? .3 : .085, j === 0 ? 'chord' : j === count - 1 ? 'upper' : 'arpeggio', j === 0 ? .9 : .3 + j * .1, i === 0 && j === 0, i * 8 + j);
      });
    } else if (pattern === 'idm-fracture') {
      const masks = [[0, .125, .375, 1.125, 1.25, 1.875, 2.5, 2.625, 2.75, 3.375, 3.5, 3.875], [0, .25, .375, .5, 1.5, 1.625, 2.125, 2.75, 2.875, 3.125, 3.75], [0, .125, .25, .875, 1.75, 1.875, 2.25, 2.375, 3, 3.125, 3.25, 3.625]];
      masks[(variation + (variation >= 4 ? cycle : 0)) % masks.length].forEach((at, i) => phrase(at, i % 4 === 0 ? .4 : i % 3 === 0 ? .21 : .075, i % 4 === 0 ? 'chord' : i % 2 ? 'reverse-arpeggio' : 'upper', i % 4 === 0 ? .95 : .3, i === 0, i));
    } else if (pattern === 'evolving-comp') {
      const cells = [[0, 1.75, 3.5, 3.625, 3.75], [.5, 1.25, 2.5, 2.625, 2.75, 3.5], [0, .75, 1.625, 2.25, 3.125, 3.25, 3.75], [0, .875, 1.5, 2.5, 3.25, 3.5, 3.625, 3.875]];
      cells[mod(cycle + variation, 4)].forEach((at, i) => phrase(at, i === 0 ? .7 : i % 3 === 0 ? .34 : .1 + (i % 2) * .08, i === 0 || i % 3 === 0 ? 'chord' : 'upper', i === 0 ? .9 : .3 + (i % 3) * .15, i === 0, i));
    } else if (pattern === 'braided-arp') {
      const stream = variation % 2 ? [0, .75, 1, 1.75, 2.5, 3, 3.75] : [0, .5, 1.25, 2, 2.5, 3.25];
      stream.forEach((at, i) => phrase(at, i % 2 ? .43 : .23, 'arpeggio', i === 0 ? .9 : .45, i === 0, i));
      for (let i = 0; i / 3 < bar; i++) {
        if (i % 2 !== (variation % 2 ? 0 : 1)) continue;
        phrase(i / 3, .29 + (i % 3) * .08, 'reverse-arpeggio', .35 + (i % 3) * .1, false, i + 32);
      }
    }
  }
}

function rhythmicHits(pattern, settings, length, bass = false) {
  const variation = clamp(Math.round(finite(settings.variation, 0)), 0, 15);
  const bar = barLength(settings);
  const density = SIMPLE_PATTERN_IDS.has(pattern) ? 1 : fraction(settings.density, 1, 0, 1);
  const rhythm = RHYTHMS[pattern];
  const output = [];
  const add = (at, duration, voice, accent, essential, ordinal, gain = 1) => {
    if (!essential && pseudoRandom(ordinal * 17 + variation * 997 + (bass ? 431 : 0)) > density) return;
    output.push({ start: at, end: at + duration, voice, accent, ordinal, ...(gain !== 1 ? { gain } : {}) });
  };
  const regular = (step, duration, voice, articulation = 1) => {
    const count = Math.ceil(length / step);
    for (let i = 0; i < count; i++) {
      const swung = i * step + (i % 2 ? step * fraction(settings.swing, 0, 0, .5) : 0);
      const next = (i + 1) * step + ((i + 1) % 2 ? step * fraction(settings.swing, 0, 0, .5) : 0);
      add(swung, (duration === null ? next - swung : duration) * articulation, voice, i % Math.max(1, Math.round(bar / step)) ? .4 : .9, i % 2 === 0, i);
    }
  };
  if (bass) {
    const style = rhythm?.bass || 'hold';
    if (style === 'hold') return null;
    if (style === 'pulse' || style === 'octaves') {
      const [numerator, denominator] = meterParts(settings.meter);
      const step = !SIMPLE_PATTERN_IDS.has(pattern) && denominator === 8 && numerator % 3 === 0 ? 1.5 : 1;
      for (let i = 0; i * step < length; i++) add(i * step, step * .9, style === 'octaves' && i % 2 ? 'bass-octave' : 'bass', .8, true, i);
      return output;
    }
    const source = style === 'bossa' ? [hit(0, .85, 'bass', .85, true), hit(1.5, .45, 'bass-fifth', .6), hit(2, .9, 'bass', .8, true), hit(3.5, .45, 'bass-fifth', .6)]
      : style === 'half' ? [hit(0, 1.7, 'bass', .8, true), hit(2, 1.6, 'bass', .7, true)] : rhythm.variants[variation % rhythm.variants.length].map(item => ({ ...item, voice: 'bass' }));
    for (let cycle = 0; cycle * bar < length; cycle++) source.forEach((item, index) => add(cycle * bar + Math.round(item.at * bar) / 4, item.length * bar / 4, item.voice, item.accent, item.essential, cycle * source.length + index));
    return output.sort((a, b) => a.start - b.start);
  }
  if (['arp', 'updown', 'broken'].includes(pattern)) { regular(.5, null, pattern); return output; }
  if (PRACTICAL_PATTERN_IDS.has(pattern)) {
    practicalHits(pattern, variation, bar, length, fraction(settings.swing, 0, 0, .5), add);
    return output.sort((a, b) => a.start - b.start);
  }
  if (INTRICATE_PATTERN_IDS.has(pattern)) {
    intricateHits(pattern, variation, bar, length, add);
    return output.sort((a, b) => a.start - b.start);
  }
  if (pattern === 'steady8') { regular(.5, null, variation % 2 ? 'upper' : 'chord', variation % 2 ? .84 : 1); return output; }
  if (pattern === 'steady16') { regular(.25, null, variation % 2 ? 'upper' : 'chord', variation % 2 ? .72 : .88); return output; }
  if (['offbeat8', 'disco', 'house'].includes(pattern)) {
    const duration = { offbeat8: .35, disco: .4, house: .46 }[pattern] * (variation % 2 ? .75 : 1);
    for (let i = 0; i + .5 < length; i++) add(i + .5, duration, pattern === 'disco' || variation % 2 ? 'upper' : 'chord', i % 2 ? .7 : .9, i % 2 === 0, i);
    return output;
  }
  if (pattern === 'broken-octaves' || pattern === 'cinematic-pulse') { regular(.5, null, pattern === 'broken-octaves' ? 'octave-broken' : 'alternating', variation % 2 ? .84 : .96); return output; }
  if (pattern === 'ballad') {
    const voices = variation % 2 ? ['low', 'upper', 'top', 'middle', 'low', 'upper', 'middle', 'top'] : ['low', 'middle', 'top', 'upper', 'low', 'middle', 'top', 'upper'];
    for (let i = 0; i / 2 < length; i++) add(i / 2, i % 4 === 0 ? 1.8 : 1.25 + (i % 2) * .25, voices[i % voices.length], i % 4 === 0 ? .85 : .45, true, i);
    return output;
  }
  if (pattern === 'rolling16') { regular(.25, .36, 'arpeggio'); return output; }
  if (pattern === 'dotted') {
    const step = .75;
    for (let i = 0; i * step < length; i++) add(i * step, step * .92, variation % 3 ? 'arpeggio' : 'upper', i % 4 ? .45 : .9, i % 2 === 0, i);
    return output;
  }
  if (pattern === 'waltz') {
    for (let cycle = 0; cycle * bar < length; cycle++) {
      const [, denominator] = meterParts(settings.meter);
      const step = denominator === 8 ? .5 : 1;
      for (let i = 0; i * step < bar; i++) add(cycle * bar + i * step, step * (variation % 2 ? .7 : .88), i === 0 ? 'low' : variation % 2 && i % 2 === 0 ? 'top' : 'upper', i === 0 ? .95 : .4, i === 0, cycle * 8 + i);
    }
    return output;
  }
  if (!rhythm) return output;
  const cycleLength = bar * (rhythm.bars || 1);
  for (let cycle = 0; cycle * cycleLength < length; cycle++) {
    // Sixteen seeds choose a composed cell and a voiced/accented response on
    // alternating cycles. The resulting arrangement remains fully repeatable.
    const variant = (variation + (variation >= 4 && cycle % 2 ? Math.floor(variation / 4) : 0)) % rhythm.variants.length;
    const source = rhythm.variants[variant];
    const allAnchors = source.every(item => item.essential);
    source.forEach((item, index) => {
      const at = cycle * cycleLength + Math.round(item.at * bar) / 4;
      const grid = .25;
      const swung = at + (Math.round(at / grid) % 2 ? grid * fraction(settings.swing, 0, 0, .5) : 0);
      // At low density, even an all-stab cell can breathe. Keep the first
      // attack of each bar; other hits can be thinned without moving the grid.
      const essential = allAnchors ? index === 0 || Math.floor(item.at / 4) > Math.floor(source[index - 1].at / 4) : item.essential;
      add(swung, item.length * bar / 4, item.voice, item.accent, essential, cycle * 32 + index);
    });
  }
  return output.sort((a, b) => a.start - b.start);
}

function voicesFor(notes, voice, ordinal, variation) {
  const offset = variation ? Math.ceil(variation / 2) : 0;
  if (voice === 'upper') return notes.slice(1);
  if (voice === 'low') return [notes[0]];
  if (voice === 'middle') return [notes[Math.floor(notes.length / 2)]];
  if (voice === 'top') return [notes.at(-1)];
  if (voice === 'alternating') return ordinal % 2 ? notes.slice(1) : [notes[0], notes[Math.min(2, notes.length - 1)]];
  if (voice === 'octave-broken') return ordinal % 4 === 0 ? [notes[0]] : ordinal % 4 === 2 ? [clamp(notes[0] + 12, 0, 127)] : notes.slice(1);
  const path = voice === 'reverse-arpeggio' ? [...notes].reverse() : voice === 'updown' ? [...notes, ...notes.slice(1, -1).reverse()]
    : voice === 'broken' ? [notes[0], notes[Math.min(2, notes.length - 1)], notes[1], notes[Math.min(2, notes.length - 1)]] : notes;
  if (['arp', 'updown', 'broken', 'arpeggio', 'reverse-arpeggio'].includes(voice)) return [path[mod(ordinal + offset, path.length)]];
  return notes;
}

function resolveOverlaps(events) {
  const lastByPitch = new Map();
  const output = [];
  events.sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);
  for (const event of events) {
    const key = `${event.track}:${event.pitch}`;
    const previous = lastByPitch.get(key);
    if (previous && Math.round(previous.startBeat * 480) === Math.round(event.startBeat * 480)) {
      previous.durationBeats = Math.max(previous.startBeat + previous.durationBeats, event.startBeat + event.durationBeats) - previous.startBeat;
      previous.velocity = Math.max(previous.velocity, event.velocity);
      continue;
    }
    if (previous && previous.startBeat + previous.durationBeats > event.startBeat) previous.durationBeats = event.startBeat - previous.startBeat;
    output.push(event);
    lastByPitch.set(key, event);
  }
  return output.filter(event => event.durationBeats > 0).sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);
}

/** The same events drive Web Audio playback and MIDI export. */
export function arrangementEvents(chords, settings = {}) {
  if (!Array.isArray(chords)) return [];
  settings ||= {};
  const pattern = PATTERN_IDS.has(settings.pattern) ? settings.pattern : 'block';
  // Advanced controls remain saved for later; basics retain their familiar
  // phrase and dynamics when switching back from an advanced rhythm.
  if (BASIC_PATTERN_IDS.has(pattern)) settings = { ...settings, density: 1, variation: 0, accent: .5 };
  const gate = fraction(settings.gate, 1, .1, 1);
  const humanize = fraction(settings.humanize, 0, 0, 1);
  const accent = fraction(settings.accent, .5, 0, 1);
  const variation = clamp(Math.round(finite(settings.variation, 0)), 0, 15);
  const length = totalBeats(chords);
  const hits = rhythmicHits(pattern, settings, length);
  const bassHits = settings.bass ? rhythmicHits(pattern, settings, length, true) : null;
  const events = [];
  let cursor = 0;
  const add = (pitch, wantedStart, wantedEnd, velocity, track, chordIndex, chordEnd, seed, strength = .5) => {
    const boundaryStart = wantedStart <= cursor + 1e-9;
    const jitter = boundaryStart ? 0 : humanize * (pseudoRandom(seed + 1) - .5) * .04;
    const end = Math.min(chordEnd, wantedEnd);
    const start = clamp(wantedStart + jitter, cursor, Math.max(cursor, end - 1 / 480));
    if (end <= start || start >= chordEnd) return;
    events.push({ pitch, startBeat: start, durationBeats: end - start,
      velocity: clamp(Math.round(velocity * (1 + accent * (strength - .5) * .5) + humanize * (pseudoRandom(seed + 2) - .5) * 18), 1, 127), track, chordIndex });
  };
  chords.forEach((chord, chordIndex) => {
    chord ||= {};
    const notes = chordNotes(chord, settings);
    const simpleDensity = fraction(settings.density, 1, 0, 1);
    const voicedNotes = SIMPLE_PATTERN_IDS.has(pattern) ? notes.slice(0, Math.max(2, Math.ceil(notes.length * simpleDensity))) : notes;
    const beats = beatsOf(chord);
    const velocity = clamp(Math.round(finite(chord.velocity, 90)), 1, 127);
    const end = cursor + beats;
    const seed = (chordIndex + 1) * 1000;
    if (pattern === 'block' || pattern === 'strum') {
      const spread = pattern === 'strum' ? Math.min(.045, beats / (notes.length * 4)) : 0;
      notes.forEach((pitch, index) => add(pitch, cursor + index * spread, cursor + index * spread + (beats - index * spread) * gate, velocity, 'chords', chordIndex, end, seed + index * 17));
    } else {
      for (const stroke of hits) {
        const strokeEnd = stroke.start + (stroke.end - stroke.start) * gate;
        if (stroke.start >= end || strokeEnd <= cursor) continue;
        const start = Math.max(cursor, stroke.start);
        const pitches = new Set(voicesFor(voicedNotes, stroke.voice, stroke.ordinal, variation));
        for (const pitch of pitches) add(pitch, start, strokeEnd, velocity * (stroke.gain ?? 1), 'chords', chordIndex, end, seed + stroke.ordinal * 17 + pitch, stroke.accent);
      }
    }
    if (settings.bass) {
      const offset = clamp(Math.round(finite(settings.octave, 0)), -4, 4);
      const bassOctave = clamp(Math.round(finite(settings.bassOctave, 2)) + offset, -1, 8);
      const bassPitch = clamp((bassOctave + 1) * 12 + pc(chord.bass!=null?chord.bass:notes[0]), 0, 127);
      let alternatePitchClass = pc(pc(chord.root) + QUALITIES[safeQuality(chord.quality)].intervals[2]);
      if (alternatePitchClass === pc(bassPitch)) alternatePitchClass = pc(chord.root);
      const bassFifth = clamp((bassOctave + 1) * 12 + alternatePitchClass, 0, 127);
      if (bassHits) {
        for (const stroke of bassHits) {
          const strokeEnd = stroke.start + (stroke.end - stroke.start) * gate;
          if (stroke.start >= end || strokeEnd <= cursor) continue;
          const pitch = stroke.voice === 'bass-fifth' ? bassFifth : clamp(bassPitch + (stroke.voice === 'bass-octave' ? 12 : 0), 0, 127);
          add(pitch, Math.max(cursor, stroke.start), strokeEnd, Math.round(velocity * .84), 'bass', chordIndex, end, seed + stroke.ordinal * 13 + 997, stroke.accent);
        }
      } else add(bassPitch, cursor, cursor + beats * gate, Math.round(velocity * .84), 'bass', chordIndex, end, seed + 997);
    }
    cursor += beats;
  });
  return resolveOverlaps(events);
}

function variableLength(value) {
  let number = clamp(Math.round(value), 0, 0x0fffffff);
  const bytes = [number & 0x7f];
  while ((number = Math.floor(number / 128))) bytes.unshift((number & 0x7f) | 0x80);
  return bytes;
}
const uint32 = value => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
const ascii = text => Array.from(text, character => character.charCodeAt(0)>=32&&character.charCodeAt(0)<=126?character.charCodeAt(0):63);
const metaText = (type, value) => {const bytes=ascii(String(value));return [0xff,type,...variableLength(bytes.length),...bytes];};

function midiTrack(messages, endTick) {
  messages.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const data = [];
  let previous = 0;
  for (const message of messages) {
    data.push(...variableLength(message.tick - previous), ...message.data);
    previous = message.tick;
  }
  data.push(...variableLength(Math.max(0, endTick - previous)), 0xff, 0x2f, 0);
  return [0x4d, 0x54, 0x72, 0x6b, ...uint32(data.length), ...data];
}

function meterParts(meter) {
  if (typeof meter === 'number') return meter === 6 ? [6, 8] : [clamp(Math.round(meter), 1, 32), 4];
  const pair = typeof meter === 'string' ? meter.split('/').map(Number)
    : Array.isArray(meter) ? meter : meter && typeof meter === 'object' ? [meter.numerator, meter.denominator] : [4, 4];
  const numerator = clamp(Math.round(finite(pair[0], 4)), 1, 32);
  const supplied = Math.round(finite(pair[1], 4));
  const denominator = [1, 2, 4, 8, 16, 32].includes(supplied) ? supplied : 4;
  return [numerator, denominator];
}

export function createMidi(chords, settings = {}) {
  settings ||= {};
  const ppq = 480;
  const endTick = Math.round(totalBeats(chords) * ppq);
  const bpm = clamp(finite(settings.bpm, 120), 20, 300);
  const microseconds = Math.round(60000000 / bpm);
  const [numerator, denominator] = meterParts(settings.meter);
  const tempoTrack = midiTrack([
    { tick: 0, order: 0, data: metaText(3, 'Harmony Studio') },
    { tick: 0, order: 1, data: [0xff, 0x51, 3, (microseconds >>> 16) & 255, (microseconds >>> 8) & 255, microseconds & 255] },
    { tick: 0, order: 2, data: [0xff, 0x58, 4, numerator, Math.log2(denominator), denominator === 8 && numerator % 3 === 0 ? 36 : 24, 8] },
    { tick: 0, order: 3, data: metaText(6, 'LOOP_START') },
    { tick: endTick, order: 3, data: metaText(6, 'LOOP_END') },
    ...(Array.isArray(settings.sectionMarkers)?settings.sectionMarkers:[]).filter(m=>Number.isFinite(m.beat)&&m.beat>=0&&m.beat<endTick/ppq).map(m=>({tick:Math.round(m.beat*ppq),order:4,data:metaText(6,String(m.midiLabel||m.label).slice(0,100))})),
  ], endTick);
  const events = arrangementEvents(chords, settings);
  const tracks = [tempoTrack];
  for (const track of settings.bass ? ['chords', 'bass'] : ['chords']) {
    const channel = track === 'bass' ? 1 : 0;
    const messages = [
      { tick: 0, order: -3, data: metaText(3, track === 'bass' ? 'Bass' : 'Chords') },
    ];
    for (const event of events.filter(item => item.track === track)) {
      const start = clamp(Math.round(event.startBeat * ppq), 0, Math.max(0, endTick - 1));
      const end = clamp(Math.round((event.startBeat + event.durationBeats) * ppq), start + 1, Math.max(start + 1, endTick));
      messages.push({ tick: start, order: 1, data: [0x90 | channel, event.pitch, event.velocity] });
      messages.push({ tick: end, order: 0, data: [0x80 | channel, event.pitch, 0] });
    }
    tracks.push(midiTrack(messages, endTick));
  }
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, (ppq >>> 8) & 255, ppq & 255];
  return Uint8Array.from([...header, ...tracks.flat()]);
}
