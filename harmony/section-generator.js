import {diatonicChords, makeChord, QUALITIES, voiceLead} from './music.js?v=2.1.1';
import {connectionScore} from './recommendations.js?v=2.1.1';
import {progressionSignature} from './composition.js?v=2.1.1';
import {activeSection, createSection, activateSection, sectionType, songChordCount, MAX_SECTIONS, MAX_SONG_CHORDS} from './sections.js?v=2.1.1';

const mod=n=>((n%12)+12)%12;
const isDiminished=c=>['dim','dim7','m7b5','m7b5b9'].includes(c.quality);
const same=(a,b)=>a.root===b.root&&a.quality===b.quality;
const NEXT={intro:'verse',verse:'prechorus',prechorus:'chorus',chorus:'bridge',bridge:'chorus',interlude:'verse',outro:'verse'};
// Four-bar phrases, expressed in the selected scale. Longer sections combine
// two phrases so the second half develops rather than merely repeats.
const PHRASES={
 major:{
  intro:[[1,6,4,5],[1,4,2,5],[6,4,1,5],[4,1,2,5],[1,3,4,5],[1,5,4,5]],
  verse:[[1,6,2,5],[1,5,6,4],[6,3,4,5],[1,3,4,5],[6,4,1,5],[1,4,2,5],[3,6,2,5],[4,1,6,5]],
  prechorus:[[2,3,4,5],[4,2,4,5],[6,4,2,5],[4,3,6,5],[6,2,4,5],[4,5,6,5],[2,4,1,5],[3,6,2,5],[4,6,2,5],[2,3,6,5],[6,3,4,5],[2,5,3,6]],
  chorus:[[1,5,6,4],[4,5,3,6],[6,4,5,1],[1,3,4,5],[4,1,2,5],[1,6,4,5],[4,5,6,1],[1,4,6,5],[6,5,4,1],[4,3,2,5],[1,2,4,5],[1,5,4,1]],
  interlude:[[6,4,1,5],[1,5,6,4],[4,3,2,5],[1,3,4,5],[6,2,4,5],[4,1,6,5]],
  bridge:[[6,3,4,5],[2,5,3,6],[4,1,2,5],[3,6,4,5],[6,2,5,1],[2,3,4,5],[4,6,2,5],[6,5,4,1]],
  outro:[[4,5,1,1],[6,4,5,1],[2,5,4,1],[1,6,4,1],[4,3,2,1],[6,2,5,1],[1,5,4,1],[3,6,5,1]],
 },
 minor:{
  intro:[[1,6,4,5],[1,7,6,5],[6,7,4,5],[1,4,7,3],[3,6,4,5],[6,3,4,5]],
  verse:[[1,6,3,7],[1,7,6,5],[1,4,7,3],[6,3,4,5],[1,6,4,5],[3,7,6,5],[4,1,6,5],[1,3,6,7]],
  prechorus:[[6,7,4,5],[4,6,2,5],[1,6,4,5],[4,7,3,5],[6,4,7,5],[2,5,1,5],[3,6,4,5],[6,7,1,5],[4,1,6,5],[7,3,4,5],[1,7,6,5],[6,2,4,5]],
  chorus:[[1,6,3,7],[6,7,3,1],[1,4,7,3],[1,7,6,5],[6,4,5,1],[3,7,6,5],[1,6,4,5],[6,7,5,1],[1,3,6,7],[3,6,7,1],[6,3,4,5],[1,7,4,5]],
  interlude:[[1,6,3,7],[6,7,1,5],[4,7,3,6],[1,4,6,5],[6,3,4,5],[3,7,6,5]],
  bridge:[[3,7,4,5],[6,3,4,5],[4,7,3,6],[6,7,1,5],[3,6,2,5],[4,1,6,5],[7,3,6,5],[6,4,7,5]],
  outro:[[6,7,5,1],[4,6,5,1],[3,7,4,1],[1,7,6,1],[6,4,5,1],[7,3,5,1],[1,6,4,1],[3,6,5,1]],
 },
};

/** Empty sections are filled; populated sections create a new following part.
 * Context reads the active editing buffer without mutating the project. */
export function sectionGenerationContext(project,targetType=null){
 const current=activeSection(project),index=project.sections.indexOf(current);
 const sequence=s=>s.id===project.activeSectionId?project.chords:s.chords;
 const empty=!sequence(current).length;
 const source=empty?[...project.sections.slice(0,index)].reverse().find(s=>sequence(s).length)||null:current;
 const following=project.sections[index+1];
 const planned=empty?current:following&&!sequence(following).length?following:null;
 const type=targetType||planned?.type||NEXT[current.type]||'prechorus';
 const destination=planned?.type===type?planned:null;
 const insertAt=planned?project.sections.indexOf(planned):index+1;
 const next=project.sections.slice(insertAt+(destination?1:0)).find(s=>sequence(s).length)||null;
 return {sourceId:source?.id||null,source:source?sequence(source):[],destinationId:destination?.id||null,insertAt,
  nextId:next?.id||null,next:next?sequence(next):[],targetType:type};
}

const directions=[
 {id:'continuity',name:'流れを引き継ぐ',description:'元の響きに近いコードを使い、自然に次の場面へ。'},
 {id:'lift',name:'展開を広げる',description:'入り方と終わり方を変え、次の場面を際立たせる。'},
 {id:'color',name:'彩りをつける',description:'着地を導くコードや借用の響きで、展開に陰影を。'},
];

/** Role-specific phrase search, ranked by both boundaries and source motifs.
 * No model, network or randomness; the search and refresh pool are bounded. */
export function generateSectionProgressions({source=[],next=[],key=0,mode='major',extension='7th',targetType='prechorus',bars=4,meter=4,variation=0,exclude=[]}={}){
 if(![4,8].includes(bars)||![3,4,6].includes(meter))throw new Error('4小節または8小節、対応する拍子を選んでください。');
 targetType=sectionType(targetType).id;
 const palette=diatonicChords(key,mode,extension),minor=mode==='minor'||mode==='dorian',beats=meter===6?3:meter;
 // Harmonic-minor V is used only in natural minor, preserving modal colour.
 if(mode==='minor')palette[4]=makeChord(key+7,extension==='triad'?'maj':extension==='9th'?'dom9':'dom7');
 const recipes=PHRASES[minor?'minor':'major'][targetType],pool=[],last=source.at(-1),following=next[0];
 const push=(chords,tag='phrase')=>pool.push({chords,tag});
 for(let i=0;i<recipes.length;i++){
  const first=recipes[i].map(d=>palette[d-1]);
  if(bars===4)push(first);
  else for(let j=0;j<recipes.length;j++)if(i!==j)push([...first,...recipes[j].map(d=>palette[d-1])]);
 }
 if(source.length){
  const motif=source.slice(0,2);
  for(const recipe of recipes){
   const tail=recipe.slice(2).map(d=>palette[d-1]);
   const phrase=targetType==='prechorus'?[palette[recipe[0]-1],motif.at(-1),...tail]:[...motif,...tail].slice(-4);
   if(phrase.length===4)push(bars===4?phrase:[...recipes[0].map(d=>palette[d-1]),...phrase],'motif');
  }
 }
 if(following&&targetType!=='outro'){
  const endings=palette.filter(c=>!isDiminished(c)&&c.root!==following.root).sort((a,b)=>connectionScore(b,following)-connectionScore(a,following)).slice(0,2);
  for(const entry of [...pool])for(const ending of endings)push([...entry.chords.slice(0,-1),ending],entry.tag);
 }
 // One purposeful chromatic chord, immediately resolving to its target.
 const dominantQuality=extension==='triad'?'maj':extension==='9th'?'dom9':'dom7';
 for(const entry of [...pool]){
  for(const i of [entry.chords.length-2,1]){
   const target=entry.chords[i+1];if(!target||isDiminished(target))continue;
   const dominant=makeChord(target.root+7,dominantQuality);
   if(palette.some(c=>same(c,dominant)))continue;
   const chords=[...entry.chords];chords[i]=dominant;push(chords,'color');
  }
  if(mode==='major')for(let i=0;i<entry.chords.length-1;i++)if(entry.chords[i].root===mod(key+5)&&entry.chords[i+1].root===key){
   const chords=[...entry.chords];chords[i]=makeChord(key+5,extension==='triad'?'min':extension==='9th'?'min9':'min7');push(chords,'color');break;
  }
  if(following&&!isDiminished(following)&&targetType!=='outro'){
   const dominant=makeChord(following.root+7,dominantQuality);
   if(!palette.some(c=>same(c,dominant)))push([...entry.chords.slice(0,-1),dominant],'color');
  }
 }
 const unique=new Map();for(const entry of pool)if(!unique.has(progressionSignature(entry.chords)))unique.set(progressionSignature(entry.chords),entry);
 const used=new Set([progressionSignature(source),...exclude]),results=[];
 const average=source.length?source.reduce((n,c)=>n+c.velocity,0)/source.length:90;
 const octave=source.length?Math.min(5,Math.max(3,Math.round(source.reduce((n,c)=>n+c.octave,0)/source.length))):4;
 const velocity=Math.round(Math.min(115,Math.max(35,average+(targetType==='chorus'?5:targetType==='outro'?-7:0))));
 for(const direction of directions){
  const ranked=[...unique.values()].filter(p=>!used.has(progressionSignature(p.chords))&&(direction.id==='color'?p.tag==='color':p.tag!=='color')).map(entry=>{
   const chords=entry.chords,first=chords[0],end=chords.at(-1);
   let score=connectionScore(last,first)*2.8+(following&&targetType!=='outro'?connectionScore(end,following)*2.8:0);
   for(let i=1;i<chords.length;i++)score+=connectionScore(chords[i-1],chords[i])*.45;
   const affinity=chords.filter(c=>source.some(s=>same(s,c))).length/chords.length;
   score+=affinity*(direction.id==='continuity'?3:direction.id==='lift'?-1:0);
   score+=entry.tag==='motif'&&direction.id==='continuity'?1:0;
   score-=isDiminished(first)?5:0;score-=isDiminished(end)?5:0;
   score-=chords.reduce((n,c,i)=>n+Number(i>0&&c.root===chords[i-1].root),0)*2;
   score-=chords.length-new Set(chords.map(c=>c.root)).size;
   if(targetType==='prechorus')score+=(end.root===palette[4].root?4:0)+([1,3,5].some(d=>first.root===palette[d].root)?1.5:0);
   if(targetType==='chorus')score+=(first.root===key?3:first.root===palette[3].root?2:0)+(end.root===key?1:0);
   if(targetType==='outro')score+=(end.root===key?14:-14);
   if(targetType==='verse'&&source[0])score+=same(first,source[0])?1:0;
   if(targetType==='bridge')score+=affinity<.5?2:0;
   // Key-relative tie-breaking keeps transposition consistent.
   const hash=chords.reduce((n,c,i)=>(n*31+mod(c.root-key)*7+c.quality.length+i)%997,0);
   score+=((hash+variation*137)%997)/997*.7;
   return {...entry,score};
  }).sort((a,b)=>b.score-a.score);
  const best=ranked.find(p=>results.every(result=>p.chords.filter((c,i)=>!same(c,result.chords[i])).length>=Math.ceil(bars*.375)))||ranked[0];if(!best)continue;
  used.add(progressionSignature(best.chords));
  const chords=best.chords.map(c=>({...makeChord(c.root,c.quality),beats,velocity,octave,bass:c.root}));
  const voiced=voiceLead([...(last?[{...last,locked:true}]:[]),...chords]).slice(last?1:0);
  results.push({...direction,chords:voiced,bars,usesMotif:best.tag==='motif'});
 }
 return results;
}

/** Explicit adoption only; never replace a populated section. */
export function adoptGeneratedSection(project,context,targetType,chords){
 const destination=context.destinationId?project.sections.find(s=>s.id===context.destinationId):null;
 const count=destination?.id===project.activeSectionId?project.chords.length:destination?.chords.length;
 if(context.destinationId&&(!destination||count||destination.type!==targetType))throw new Error('追加先が変わりました。候補を作り直してください。');
 if(!destination&&project.sections.length>=MAX_SECTIONS)throw new Error('セクションは12個までです。');
 if(songChordCount(project)+chords.length>MAX_SONG_CHORDS)throw new Error('曲全体は512コードまでです。');
 const sequence=chords.map(c=>({...c,id:makeChord(c.root,c.quality).id}));
 const section=destination||createSection(targetType,sequence);
 if(destination){section.type=sectionType(targetType).id;section.chords=sequence;section.selected=0;
  if(project.activeSectionId===section.id){project.chords=sequence;project.selected=0;}}
 else project.sections.splice(context.insertAt,0,section);
 activateSection(project,section.id);
 return section;
}
