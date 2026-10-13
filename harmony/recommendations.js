import {MODES, QUALITIES, makeChord, diatonicChords, chordName} from './music.js?v=2.3.0';

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

export function suggestNextChords({anchor = null, key = 0, mode = 'major', extension = 'triad', chords=null, index=-1, intent='natural', loop=true} = {}) {
  if(chords?.length)return contextualSuggestions({chords,index,key,mode,extension,intent,loop});
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

const tones = c => QUALITIES[c.quality].intervals.map(n=>mod(c.root+n));
const dominant = c => ['dom7','dom9','maj'].includes(c.quality);
export function connectionScore(a,b) {
  if(!a||!b)return 0;
  const left=tones(a),right=tones(b),distance=(x,y)=>Math.min(mod(x-y),mod(y-x));
  let score=left.filter(n=>right.includes(n)).length*1.1;
  score-=left.reduce((sum,n)=>sum+Math.min(...right.map(p=>distance(n,p))),0)/left.length*.55;
  const movement=mod(b.root-a.root);
  if(movement===5&&dominant(a))score+=5;
  if(movement===7)score+=1.3;
  if([2,10].includes(movement))score+=.8;
  if(['dim','dim7','m7b5'].includes(a.quality)&&movement===1)score+=3;
  if(['min','min7','min9'].includes(a.quality)&&movement===7)score+=1.2;
  if(a.root===b.root)score-=2.8;
  return score;
}

export function chordPool(key,mode,extension,intent='natural') {
  const palette=diatonicChords(key,mode,extension);
  const pool=palette.map(chord=>({chord,label:'キーの響き',reason:'キーの中で流れをつくる。',outside:false}));
  if(mode==='minor') {
    pool.push({chord:makeChord(mod(key+7),extension==='triad'?'maj':extension==='9th'?'dom9':'dom7'),label:'短調のV',reason:'明るいVで短調の中心へ向かう。',outside:false});
  }
  if(intent!=='natural') {
    if(mode==='major')for(const [interval,quality] of [[5,'min'],[8,'maj'],[10,'maj']]){
      const q=extension==='triad'?quality:quality==='min'?(extension==='9th'?'min9':'min7'):(extension==='9th'?'maj9':'maj7');
      pool.push({chord:makeChord(mod(key+interval),q),label:'借用で彩る',reason:'同じ主音の短調から借りた響き。',outside:true});
    }
    for(const target of palette.filter(c=>!['dim','m7b5','m7b5b9'].includes(c.quality))) {
      pool.push({chord:makeChord(mod(target.root+7),extension==='triad'?'maj':extension==='9th'?'dom9':'dom7'),label:'着地を導く',reason:`${chordName(target,key)}へ向かう、もう一つのドミナント。`,outside:true,target:target.root});
    }
    if(intent==='adventure')pool.push({chord:makeChord(mod(key+1),'maj7'),label:'半音の彩り',reason:'半音上の響きで、いつもと違う景色へ。',outside:true});
  }
  return pool.filter((item,i)=>pool.findIndex(other=>other.chord.root===item.chord.root&&other.chord.quality===item.chord.quality)===i);
}

export function contextualSuggestions({chords,index,key,mode,extension,intent='natural',loop=true}) {
  index=Math.min(chords.length-1,Math.max(0,index));
  const anchor=chords[index],next=chords[index+1]||(loop&&chords.length>1?chords[0]:null);
  const palette=diatonicChords(key,mode,extension);
  const from=MODES.find(m=>m.id===mode)?.intervals.indexOf(mod(anchor.root-key))??-1;
  const preferred=TRANSITIONS[mode]?.[from]||[0,3,4,5,1,2,6];
  const ranked=chordPool(key,mode,extension,intent).filter(item=>item.chord.root!==anchor.root&&item.chord.root!==next?.root).map(item=>{
    const c=item.chord,degree=palette.findIndex(p=>p.root===c.root&&p.quality===c.quality);
    let score=connectionScore(anchor,c)+(next?connectionScore(c,next)*1.25:0);
    score+=degree>=0?(7-Math.max(0,preferred.indexOf(degree)))*.18:0;
    if(item.outside)score-=intent==='adventure'?.15:1.1;
    if(item.target!=null)score+=next?.root===item.target?2.5:-2.5;
    if(next?.root===c.root)score-=2;
    const repetitions=chords.filter(p=>p.root===c.root&&p.quality===c.quality).length;
    score-=repetitions*.22;
    const [label,reason]=degree>=0?direction(degree,c.quality,mode):[item.label,item.reason];
    const resolves=next&&dominant(c)&&mod(c.root+5)===next.root;
    return {...item,score,label:resolves?'次の着地へ':label,reason:(resolves?`${chordName(next,key)}への解決をつくる。`:reason)+(next?`${index===chords.length-1?' 先頭':' 次の'}${chordName(next,key)}とのつながりも考慮。`:'')};
  }).sort((a,b)=>b.score-a.score);
  const result=[];
  for(const item of ranked){if(result.some(p=>p.chord.root===item.chord.root))continue;result.push(item);if(result.length===5)break;}
  return result;
}
