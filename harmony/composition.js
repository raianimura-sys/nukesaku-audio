import {chordPool, connectionScore} from './recommendations.js?v=2.2.0';
import {makeChord, chordNotes, voiceLead, QUALITIES} from './music.js?v=2.2.0';

export const progressionSignature = chords => chords.map(c=>`${c.root}:${c.quality}`).join('|');
const signature=progressionSignature;
const styles=[{id:'natural',name:'自然につなぐ',description:'キーの響きを中心に、前後の流れを整える。'},
  {id:'color',name:'彩りを足す',description:'借用コードや着地を導く響きを、少し取り入れる。'},
  {id:'adventure',name:'展開を変える',description:'前後のつながりを保ちながら、違う道筋を探す。'}];

/** Bounded beam search, deterministic, local; locked chords are copied exactly. */
export function progressionAlternatives(chords,{key=0,mode='major',extension='7th',loop=true,variation=0,exclude=[]}={}) {
  if(!chords.length||chords.every(c=>c.locked))return [];
  const original=signature(chords),used=new Set([original,...exclude]),results=[];
  for(const style of styles){
    const pool=chordPool(key,mode,extension,style.id);
    const unlocked=chords.filter(c=>!c.locked).length;
    const maxChanges=style.id==='natural'?Math.max(1,Math.floor(unlocked*.5)):style.id==='color'?Math.max(1,Math.ceil(unlocked*.67)):unlocked;
    let beam=[{chords:[],score:0,changed:0}];
    for(let i=0;i<chords.length;i++){
      const source=chords[i],choices=source.locked?[{chord:source,outside:false}]:[{chord:source,outside:false},...pool];
      const paths=[];
      for(const path of beam)for(const choice of choices){
        const c=choice.chord,changed=c.root!==source.root||c.quality!==source.quality;
        if(changed&&path.changed>=maxChanges)continue;
        const candidate=changed?{...source,root:c.root,quality:c.quality,inversion:Math.min(source.inversion,QUALITIES[c.quality].intervals.length-1)}:{...source};
        const previous=path.chords.at(-1),future=chords[i+1]?.locked?chords[i+1]:null;
        let score=path.score+connectionScore(previous,candidate)+(future?connectionScore(candidate,future)*.6:0);
        // Stay recognisable; repeated identical chords and unresolved chromatic moves cost more.
        score+=changed?-.65:.55;
        if(choice.outside){score-=style.id==='adventure'?.4:1; if(choice.target!=null&&future&&future.root!==choice.target)score-=2;}
        if(previous&&previous.root===candidate.root)score-=1;
        score-=path.chords.filter(p=>p.root===candidate.root).length*1.25;
        const drift=((variation+i*3+((c.root-key+12)%12)*5+(c.quality.length*7))%11)/11;
        score+=drift*(style.id==='natural'?.18:style.id==='color'?.65:1.2);
        paths.push({chords:[...path.chords,candidate],score,changed:path.changed+Number(changed)});
      }
      const seen=new Set();beam=paths.sort((a,b)=>b.score-a.score).filter(p=>{const s=signature(p.chords);if(seen.has(s))return false;seen.add(s);return true;}).slice(0,18);
    }
    const ranked=beam.map(p=>({...p,score:p.score+(loop?connectionScore(p.chords.at(-1),p.chords[0]):0)})).sort((a,b)=>b.score-a.score);
    const best=ranked.find(p=>p.changed>0&&!used.has(signature(p.chords)));
    if(best){used.add(signature(best.chords));results.push({...style,chords:best.chords,changed:best.changed});}
  }
  return results;
}

export function shapeVoicings(chords,style='smooth') {
  const shaped=chords.map(c=>c.locked?{...c}:{...c,voicing:style==='open'?'open':style==='drop2'?'drop2':'close'});
  if(style==='bass-line'){
    let previous=null;
    return voiceLead(shaped).map(c=>{
      if(c.locked){previous=c.bass??chordNotes(c)[0]%12;return c;}
      const notes=QUALITIES[c.quality].intervals.map(n=>(n+c.root)%12);
      const distance=n=>previous==null?0:Math.min((n-previous+12)%12,(previous-n+12)%12);
      const bass=previous==null?c.root:[...notes].sort((a,b)=>distance(a)-distance(b))[0];
      previous=bass;return {...c,bass};
    });
  }
  if(style==='top-line'){
    const result=[];let top=null;
    for(const c of shaped){
      if(c.locked){result.push(c);top=chordNotes(c).at(-1);continue;}
      let best=c,score=Infinity;
      for(let octave=Math.max(2,c.octave-1);octave<=Math.min(6,c.octave+1);octave++)for(let inversion=0;inversion<QUALITIES[c.quality].intervals.length;inversion++){
        const candidate={...c,octave,inversion},notes=chordNotes(candidate);
        const cost=(top==null?Math.abs(notes.at(-1)-76):Math.abs(notes.at(-1)-top))*3+Math.max(0,48-notes[0])+Math.max(0,notes.at(-1)-88);
        if(cost<score){score=cost;best=candidate;}
      }
      result.push(best);top=chordNotes(best).at(-1);
    }
    return result;
  }
  return voiceLead(shaped);
}
