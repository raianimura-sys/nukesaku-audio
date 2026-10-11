import {MODES, QUALITIES, makeChord, diatonicChords} from './music.js?v=1.4.0';

// Written transition choices, rather than random chord suggestions. The order
// offers several musical directions while retaining the current key and mode.
const TRANSITIONS = {
  major: [[5,3,4,1,2],[4,3,0,5,2],[5,3,1,4,0],[4,0,1,5,2],[0,5,3,1,2],[3,1,4,0,2],[0,2,5,4,1]],
  minor: [[5,3,4,6,2],[4,0,3,5,2],[5,3,6,0,4],[4,0,5,6,1],[0,5,3,6,2],[3,1,4,2,6],[2,0,5,3,4]],
  dorian: [[3,6,1,2,4],[4,0,3,6,2],[5,3,6,0,1],[0,6,1,4,2],[0,3,6,2,1],[1,3,0,4,6],[0,3,2,4,1]],
  mixolydian: [[6,3,4,5,1],[4,6,3,0,5],[5,3,1,6,0],[0,6,1,5,4],[0,6,3,1,5],[1,3,6,0,4],[0,3,5,1,4]],
};
const mod = n => ((n % 12) + 12) % 12;
const direction = (degree, quality, mode) => {
  if (['dim','dim7','m7b5','m7b5b9'].includes(quality)) return ['緊張を足す', '少し不安定な響きで、次の着地を待つ。'];
  if (degree === 0) return ['落ち着く', 'キーの中心へ戻り、ひと息つく響き。'];
  if (degree === 3) return ['広げる', mode === 'dorian' ? '明るい響きを添え、ドリアンらしい広がりに。' : '響きを広げ、次の展開をつくる。'];
  if (degree === 4) return ['次へ進む', '少し緊張をつくり、次のコードへ向かう。'];
  if (degree === 5) return ['色を変える', mode === 'major' || mode === 'mixolydian' ? 'マイナーの色を添え、やわらかな陰影に。' : '明るい響きで、マイナーの流れに広がりを。'];
  if (degree === 1) return ['つなぐ', '展開のきっかけをつくる、つなぎの響き。'];
  if (degree === 6 && mode !== 'major') return ['開放感', '少し力を抜いた、開放的なつながり。'];
  return QUALITIES[quality].intervals[1] === 3 ? ['やわらかく', '落ち着いたマイナーの色を添える。'] : ['明るく', '響きの色を変え、明るい流れへ。'];
};

export function suggestNextChords({anchor = null, key = 0, mode = 'major', extension = 'triad'} = {}) {
  const activeMode = MODES.find(item => item.id === mode) || MODES[0];
  const palette = diatonicChords(key, activeMode.id, extension);
  const relative = anchor ? mod(anchor.root - palette[0].root) : -1;
  const from = activeMode.intervals.indexOf(relative);
  const order = anchor ? TRANSITIONS[activeMode.id][from] || [0,3,4,5,1,2,6] : [0,5,3,1,4];
  const choices = [];
  const add = (degree, override = {}) => {
    const chord = {...palette[degree], ...override.chord};
    if (anchor && chord.root === mod(anchor.root)) return;
    if (choices.some(item => item.chord.root === chord.root)) return;
    const [label, reason] = direction(degree, chord.quality, activeMode.id);
    choices.push({chord, label: override.label || label, reason: override.reason || reason});
  };
  if (anchor && ['dom7','dom9','maj'].includes(anchor.quality)) {
    const destination = palette.findIndex(chord => chord.root === mod(anchor.root + 5));
    if (destination >= 0 && (['dom7','dom9'].includes(anchor.quality) || from === 4 || from >= 0 && QUALITIES[palette[from].quality].intervals[1] === 3)) {
      add(destination, {label:'解決する', reason:'今の緊張をほどく、はっきりした着地。'});
    }
  }
  if (anchor && ['dim','dim7','m7b5','m7b5b9'].includes(anchor.quality) && mod(anchor.root + 1) === palette[0].root) {
    add(0, {label:'解決する', reason:'半音上の中心へ進み、緊張をほどく。'});
  }
  if (anchor && activeMode.id === 'major' && relative === 5 && ['min','min7','min9'].includes(anchor.quality)) {
    add(0, {label:'余韻を残す', reason:'マイナーの響きから中心へ戻る、やさしい着地。'});
  }
  for (const degree of order) {
    if (activeMode.id === 'minor' && degree === 4) {
      const quality = extension === 'triad' ? 'maj' : extension === '9th' ? 'dom9' : 'dom7';
      add(degree, {chord:{quality}, label:'解決へ向かう', reason:'短調の定番。明るいVで緊張をつくり、中心へ向かう。'});
    } else add(degree);
  }
  // Fill only if a chromatic source or the source-root exclusion left a gap.
  for (const degree of [0,3,4,5,1,2,6]) add(degree);
  return choices.slice(0,5).map(item => ({...item, chord:makeChord(item.chord.root,item.chord.quality)}));
}
